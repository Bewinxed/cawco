/**
 * Why a browser can't load a preview, told by its own cause: one classifier
 * and one set of words for every place that loads one (the dashboard's
 * preview pane, a decision page's Preview).
 *
 * A browser keeps a failed request's cause from script on purpose. The Fetch
 * Standard: "A network error is a response whose type is "error", status is
 * 0, status message is the empty byte sequence, header list is « », body is
 * null" (https://fetch.spec.whatwg.org/#concept-network-error); MDN: "For
 * security reasons, specifics about what went wrong with a CORS request are
 * not available to JavaScript code. All the code knows is that an error
 * occurred" (https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS/Errors).
 * So the cause is built from what can be known: whether the browser says it
 * is offline, whether an answer came within the limit, how fast the request
 * failed, the status and the hub's own words when an answer came, whether a
 * `no-cors` request is answered where the `cors` one wasn't (MDN, same page:
 * the opaque answer's "status is `0`, its headers are empty"), and whether
 * the hub itself reaches the same origin now ({@link PREVIEW_REACH_PATH}).
 */
import { readWithin } from "./bounded";
import { PREVIEW_PING_PATH } from "./frames";

/**
 * Where the hub answers whether it reaches a preview origin itself:
 * `?origin=<origin>`, answered as a {@link HubReach}. On the hub's API for the
 * dashboard (`/api/preview-reach`), and on every preview origin for a page
 * served there (a decision page), behind host mode's pass like the rest.
 */
export const PREVIEW_REACH_PATH = "/__cawco/reach";
export const PREVIEW_REACH_API = "/api/preview-reach";

/**
 * Marks the hub's own answer to {@link PREVIEW_PING_PATH}: an answer without
 * it came from something else in front of the origin (a proxy, a CDN's own
 * error page).
 */
export const PREVIEW_PING_HEADER = "x-cawco-ping";

/** The hub's own try of the origin's ping, now: answered by CawCo's listener, or why not. */
export type HubReach = { reached: true } | { reached: false; why: string };

/**
 * How this hub's previews are reached, which a page on a preview origin
 * can't read from the hub's API: {@link PREVIEW_REACH_PATH} answers it beside
 * its {@link HubReach}, for {@link previewsNeedWords}.
 */
export interface PreviewWays {
  /** Host mode stands (its names are a pattern's). */
  hostMode: boolean;
  /** The hub's preview port range, as Settings › Previews says it. */
  ports: string;
}

/**
 * Faster than this, a failed request never left the device for an answer.
 * Our call, from a measurement in Playwright's Chromium (20 fetches each,
 * median / slowest): a request a blocker refused (`route.abort
 * ("blockedbyclient")`) failed in 0.6 / 3.1 ms, and so did a closed port on
 * loopback (0.8 / 1.6 ms) and a name that doesn't resolve (0.7 / 1.5 ms). So
 * a refusal this fast is the browser itself, or something on its own
 * device: what it means is read with the hub's own reach (a hub that reaches
 * the origin leaves this browser's side alone). The preview-reach spec reads
 * it again under a whole fleet's load: CDP's `Network.setBlockedURLs`, the
 * browser's own block list, failed 20 pings in 0.7 ms median, 1.6 ms the
 * slowest. A probe judges by its fastest ask, as the first one settles on a
 * main thread a booting page holds up.
 */
export const INSTANT_REFUSAL_MS = 10;

/** Our call: a probe unanswered in 10 s is a failed one. */
export const PROBE_ANSWER_MS = 10_000;

/** Every way a browser's probe of a preview origin fails, by what it shows. */
export type PreviewUnreached =
  /** `navigator.onLine` false. */
  | { cause: "offline" }
  /** Failed faster than any answer could come ({@link INSTANT_REFUSAL_MS}). */
  | { cause: "refused"; hub: HubReach | null }
  /** Failed after a while, with no answer. */
  | { cause: "failed"; hub: HubReach | null }
  /** No answer within the limit. */
  | { cause: "timeout"; seconds: number; hub: HubReach | null }
  /** Answered to a `no-cors` request, but not readable to a `cors` one: no CORS header. */
  | { cause: "unreadable" }
  /** Answered with a status; `why` the hub's own words when it sent them. */
  | { cause: "status"; status: number; why: string | null };

const TRAILING_STOP = /\.$/;

/**
 * Offline is two facts, never `navigator.onLine` alone: the browser says so,
 * and the hub, on the page's own origin, couldn't be asked either. A browser
 * with no network interface but loopback says `false` while it reaches a
 * hub on the same machine (Playwright's Chromium in a workspace said
 * `false` before and after `context.setOffline(false)`), and MDN: "this
 * property is inherently unreliable, and you should not disable features
 * based on the online status, only provide hints when the user may seem
 * offline" (https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine).
 */
const offline = (hub: HubReach | null): boolean =>
  hub === null && navigator.onLine === false;

/**
 * Probes `origin`'s ping as the frame would load it: null when it answers
 * ok, else what failed. `hubReach` asks the hub whether it reaches the same
 * origin (null when the hub can't be asked).
 */
export async function probePreview(
  origin: string,
  hubReach: (origin: string) => Promise<HubReach | null>,
  within = PROBE_ANSWER_MS
): Promise<PreviewUnreached | null> {
  const ping = `${origin}${PREVIEW_PING_PATH}`;
  /** One ask, and how long it took to settle. */
  const ask = async (mode: RequestMode) => {
    const started = performance.now();
    const read = await readWithin(within, (signal) =>
      fetch(ping, { mode, credentials: "omit", cache: "no-store", signal })
    ).catch(() => null);
    return { read, ms: performance.now() - started };
  };
  const first = await ask("cors");
  if (first.read?.kind === "answered") {
    return answeredWith(first.read.value);
  }
  if (first.read) {
    const hub = await hubReach(origin);
    return offline(hub)
      ? { cause: "offline" }
      : { cause: "timeout", seconds: within / 1000, hub };
  }
  // Answered where it can't be read: the answer carries no CORS header. A
  // `cors` ask after it says whether that holds, or the first failure was
  // a moment's.
  const blind = await ask("no-cors");
  if (blind.read?.kind === "answered") {
    const again = await ask("cors");
    return again.read?.kind === "answered"
      ? answeredWith(again.read.value)
      : { cause: "unreadable" };
  }
  const hub = await hubReach(origin);
  if (offline(hub)) {
    return { cause: "offline" };
  }
  // A failure is settled on the page's main thread, which a page still
  // booting holds up: its fastest ask says how fast the browser refused it.
  const last = await ask("cors");
  if (last.read?.kind === "answered") {
    return answeredWith(last.read.value);
  }
  return Math.min(first.ms, blind.ms, last.ms) < INSTANT_REFUSAL_MS
    ? { cause: "refused", hub }
    : { cause: "failed", hub };
}

/** An answer the browser could read: null when ok, else its status and the hub's own words when it sent them. */
const answeredWith = async (
  answer: Response
): Promise<PreviewUnreached | null> => {
  if (answer.ok) {
    return null;
  }
  const why = await answer
    .json()
    .then((body: { why?: unknown } | null) =>
      typeof body?.why === "string" ? body.why.replace(TRAILING_STOP, "") : null
    )
    .catch(() => null);
  return { cause: "status", status: answer.status, why };
};

/** The hub's answer at `url` (a {@link PREVIEW_REACH_PATH} or {@link PREVIEW_REACH_API} with `?origin=`), or null when the hub can't be asked. */
export const askHubReach = async (
  url: string,
  heard?: (ways: PreviewWays) => void
): Promise<HubReach | null> => {
  const read = await readWithin(PROBE_ANSWER_MS, (signal) =>
    fetch(url, { cache: "no-store", signal })
  ).catch(() => null);
  if (!(read?.kind === "answered" && read.value.ok)) {
    return null;
  }
  const body = (await read.value.json().catch(() => null)) as {
    hostMode?: unknown;
    ports?: unknown;
    reached?: unknown;
    why?: unknown;
  } | null;
  if (typeof body?.ports === "string" && typeof body.hostMode === "boolean") {
    heard?.({ ports: body.ports, hostMode: body.hostMode });
  }
  if (body?.reached === true) {
    return { reached: true };
  }
  return body?.reached === false && typeof body.why === "string"
    ? { reached: false, why: body.why }
    : null;
};

/**
 * What previews need to be reached from this browser, by the way it reaches
 * them, as one clause with no stop: a host-mode name, else the hub's ports
 * on this browser's host (and, `ports` mode, the switch to a pattern).
 */
export const previewsNeedWords = (
  route:
    | { byHost: true; host: string }
    | {
        byHost: false;
        hostname: string;
        ports: string | null;
        hostMode: boolean;
      }
): string => {
  if (route.byHost) {
    return `Previews need ${route.host} to reach the hub, or switch previews to ports`;
  }
  const ports = `Previews need ports ${route.ports ?? "of the hub's range"} reachable on ${route.hostname}`;
  return route.hostMode
    ? ports
    : `${ports}, or switch previews to a hostname pattern`;
};

/**
 * What failed, in sentences (WORDS.md's error formula: what happened, why,
 * the fix), each cause its own; the caller says what happens next. `need`:
 * {@link previewsNeedWords}, said where the way previews are reached is the
 * fix.
 */
export const previewUnreachedWords = (
  host: string,
  failed: PreviewUnreached,
  need: string
): string => {
  switch (failed.cause) {
    case "offline":
      return `This browser is offline, so it can't reach ${host}. Connect this device to a network.`;
    case "unreadable":
      return `${host} answered without the Access-Control-Allow-Origin header the hub's own answer carries, so something in front of it, a proxy or a CDN rule, changed the answer. Let ${host}${PREVIEW_PING_PATH} through to the hub unchanged.`;
    case "status":
      return failed.why
        ? `${host} answered ${failed.status}: ${failed.why}.`
        : `${host} answered ${failed.status}, which isn't the hub's own answer, so something in front of it answered instead. ${need}.`;
    case "refused":
    case "failed":
    case "timeout":
      break;
  }
  let happened = `${host} didn't answer this browser.`;
  if (failed.cause === "refused") {
    happened = `This browser refused the request to ${host} at once, before any answer could come back.`;
  } else if (failed.cause === "timeout") {
    happened = `${host} didn't answer this browser within ${failed.seconds} s.`;
  }
  const { hub } = failed;
  if (hub?.reached) {
    return failed.cause === "refused"
      ? `${happened} The hub reaches ${host}, so a shield, a content blocker or an extension in this browser is blocking it. Allow ${host} in it.`
      : `${happened} The hub reaches ${host}, so something between this browser and it is blocking it: a shield, an extension, a VPN or a firewall. Allow ${host} there.`;
  }
  if (hub) {
    return `${happened} The hub can't reach it either (${hub.why}). ${need}.`;
  }
  return failed.cause === "refused"
    ? `${happened} A shield, a content blocker or an extension in this browser is most likely blocking it: the hub couldn't be asked whether it reaches ${host}. Allow ${host} in it.`
    : `${happened} The hub couldn't be asked whether it reaches ${host}. ${need}.`;
};
