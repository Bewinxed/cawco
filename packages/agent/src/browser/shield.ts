/**
 * The shield (Projects spec §5.11, "Private"): from Take over to Hand back
 * nothing the person types or sees reaches any agent. Take over closes the
 * browser's gate (every agent connection cut with 4423, new ones refused
 * with one sentence), brings the asking workspace's page to the front, and
 * gives the person control: neko's `control/give` to their view's session on
 * the container host, a {@link CdpTakeover} of that page on the local host.
 * Hand back takes control away (neko's `control/take` by the daemon's admin,
 * then `control/reset` once the clipboard is emptied as host), loads the
 * front page again by GET (nothing typed survives in a field), empties
 * neko's clipboard on the container host
 * (the local host's headless Chromium has no clipboard the person could
 * fill), opens the gate, and answers the page's origin and nothing else.
 *
 * The machine is the one truth of a take-over: its record's `takeover`
 * (with `shield.json` beside it for the page and the viewer), written here
 * alone, and told to the hub on every change. It ends in one place,
 * {@link release}, whichever way it ends:
 *
 * - the person's Hand back (`browser.handback`), answered to the hub's call;
 * - no view open for {@link TAKEOVER_UNWATCHED_MS}: the daemon hands back
 *   itself, and tells the hub ({@link BrowserHandedBackFrame}) before the
 *   record's frame, so the ask's call answers with the page's origin;
 * - the browser stopped (`cawco browser stop`, a stop route, its process or
 *   container gone): the registry clears the record's `takeover`, the watch
 *   below releases it and tells the hub, with no page.
 *
 * A daemon that restarts mid-take-over holds it again from the record
 * ({@link restoreShields}), its gate closed from the registry's first gate
 * (browsers.ts `gateFor`); the hub reads the machine's rows as it registers
 * and sends nothing again. A container runtime that is away ends nothing: the
 * browser is not known to have stopped, so its take-over stands.
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import {
  type BrowserHandback,
  type BrowserHandedBackFrame,
  type BrowserKey,
  type BrowserRow,
  type BrowserShieldArgs,
  isBrowserKey,
  TAKEOVER_UNWATCHED_MS,
} from "@cawco/core/browser";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { z } from "zod";
import { browserRows, browsersChanged, startBrowser } from "./browsers";
import {
  CdpLink,
  CdpTakeover,
  type CdpViewer,
  cdpInputOf,
} from "./cdp-takeover";
import { endWatch, watchView } from "./cdp-watch";
import { nekoLogin } from "./container-host";
import { setFront } from "./front-origin";
import { gateOf } from "./gate";
import {
  allBrowsers,
  type BrowserRecord,
  browserDir,
  portsOf,
  readBrowser,
  withBrowser,
  writeBrowser,
} from "./state";

/** How often a take-over's views are counted against {@link TAKEOVER_UNWATCHED_MS}. */
const WATCH_MS = 5000;

/** How long neko has to answer a control or clipboard call. */
const NEKO_MS = 5000;

/** A take-over as the browser's dir keeps it. */
const KeptSchema = z.object({
  origin: z.string().optional(),
  requestId: z.string().optional(),
  since: z.number(),
  /** The page brought to the front: the one handed back reloads. */
  targetId: z.string().optional(),
  /** The person's neko session given control (container host). */
  viewer: z.string().optional(),
  workspaceId: z.string().optional(),
});
type Kept = z.infer<typeof KeptSchema>;

/** A take-over this process holds. */
interface Held extends Kept {
  /** The local host's view of its page, started once (restore or shield, whichever comes first). */
  cdp?: Promise<CdpTakeover | undefined>;
  /** Views the hub counts (its sockets for neko or the CDP bridge). */
  hubViewers: number;
  /** Since when no view was open; undefined while one is. */
  unwatchedSince?: number;
}

const held = new Map<BrowserKey, Held>();

let sink: (frame: BrowserHandedBackFrame) => void = () => undefined;
let machineId = "";

/** Where the daemon tells the hub of a take-over it ended itself, and the machine it is. */
export const setShieldSink = (
  id: string,
  send: (frame: BrowserHandedBackFrame) => void
): void => {
  machineId = id;
  sink = send;
};

const shieldFile = (key: BrowserKey): string =>
  join(browserDir(key), "shield.json");

const keep = (key: BrowserKey, take: Held): Promise<void> => {
  const { cdp: _cdp, hubViewers: _h, unwatchedSince: _u, ...kept } = take;
  return writeStateFile(shieldFile(key), `${JSON.stringify(kept, null, 2)}\n`, {
    mode: 0o600,
  });
};

const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Who owns which page, as the gate keeps it (gate.ts `gate.json`). */
const pageOwners = async (key: BrowserKey): Promise<Record<string, string>> => {
  const kept = await readRecord(
    join(browserDir(key), "gate.json"),
    z.object({ targets: z.record(z.string(), z.string()).optional() })
  ).catch(() => undefined);
  return kept?.targets ?? {};
};

const originOf = (url: string | undefined): string | undefined => {
  if (!(url && URL.canParse(url))) {
    return;
  }
  const { origin } = new URL(url);
  return origin === "null" ? undefined : origin;
};

interface Page {
  targetId: string;
  url: string;
}

/** The browser's pages, as Chromium lists them. */
const pagesOf = async (link: CdpLink): Promise<Page[]> => {
  const { targetInfos } = await link.call("Target.getTargets");
  return (Array.isArray(targetInfos) ? targetInfos : [])
    .filter(
      (info): info is { targetId: string; type: string; url?: string } =>
        !!info &&
        typeof info === "object" &&
        typeof (info as { targetId?: unknown }).targetId === "string" &&
        (info as { type?: unknown }).type === "page"
    )
    .map((info) => ({ targetId: info.targetId, url: info.url ?? "" }));
};

/**
 * The page a take-over brings to the front: the asking workspace's page on
 * the asked origin, else its newest page, else the browser's first page.
 */
const frontPage = async (
  key: BrowserKey,
  link: CdpLink,
  workspaceId: string | undefined,
  origin: string | undefined
): Promise<Page | undefined> => {
  const pages = await pagesOf(link);
  if (workspaceId) {
    const owners = await pageOwners(key);
    const own = pages.filter((page) => owners[page.targetId] === workspaceId);
    const asked = origin
      ? own.find((page) => originOf(page.url) === origin)
      : undefined;
    const chosen = asked ?? own.at(-1);
    if (chosen) {
      return chosen;
    }
  }
  return pages[0];
};

/**
 * The daemon's one admin session in each browser's neko, by its container:
 * every login in neko's multiuser provider is a session of its own
 * (`id := fmt.Sprintf("%s-%s", username, token)`), and neko judges a call by
 * the session it comes as (`HostsOnly`: `session.IsHost()`), so the control
 * the admin takes and the clipboard it empties must be one session's.
 */
const admins = new Map<string, string>();

/** One POST to neko's REST as `token`'s session. */
const nekoPost = async (
  record: BrowserRecord,
  token: string,
  path: string,
  body: unknown
): Promise<Response> => {
  const read = await readWithin(NEKO_MS, (signal) =>
    fetch(`http://127.0.0.1:${portsOf(record).http}/api${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal,
    })
  );
  if (read.kind === "unanswered") {
    throw new Error(`neko did not answer ${path} within ${NEKO_MS / 1000} s.`);
  }
  return read.value;
};

/** Calls neko's REST as the daemon's admin session, logged in again only when neko no longer knows it (a new container). */
const neko = async (
  record: BrowserRecord,
  path: string,
  body?: unknown
): Promise<void> => {
  const container = record.container?.id ?? record.key;
  let token = admins.get(container);
  if (!token) {
    token = await nekoLogin(record, "admin");
    admins.set(container, token);
  }
  let response = await nekoPost(record, token, path, body);
  if (response.status === 401) {
    await response.body?.cancel();
    token = await nekoLogin(record, "admin");
    admins.set(container, token);
    response = await nekoPost(record, token, path, body);
  }
  if (!response.ok) {
    throw new Error(
      `neko refused ${path} (HTTP ${response.status}): ${(await response.text()).trim()}`
    );
  }
  await response.body?.cancel();
};

const rowOf = async (key: BrowserKey): Promise<BrowserRow> => {
  const row = (await browserRows()).find((one) => one.key === key);
  if (!row) {
    throw new Error(`${key} has no record on this machine.`);
  }
  return row;
};

/** Writes the record's `takeover` as the shield holds it now, and tells the hub. */
const recordTakeover = async (key: BrowserKey, take: Held | undefined) => {
  await withBrowser(key, async () => {
    const record = await readBrowser(key);
    if (record) {
      await writeBrowser({
        ...record,
        lastUsedAt: Date.now(),
        takeover: take
          ? {
              by: take.workspaceId ?? null,
              since: take.since,
              ...(take.requestId ? { requestId: take.requestId } : {}),
            }
          : null,
      });
    }
  });
  browsersChanged();
};

/** The local host's view of the take-over's page: started once, whoever asks first. */
const viewFor = (
  key: BrowserKey,
  record: BrowserRecord,
  take: Held
): Promise<CdpTakeover | undefined> | undefined => {
  if (record.host !== "local" || !take.targetId) {
    return;
  }
  take.cdp ??= CdpTakeover.start(
    `http://127.0.0.1:${portsOf(record).devtools}`,
    take.targetId
  ).catch((error: unknown): undefined => {
    console.warn(
      `[browser] ${key}'s take-over view did not start: ${why(error)}`
    );
  });
  return take.cdp;
};

/**
 * Take over: the gate closed, the asking workspace's page in front, control
 * the person's. Sent again for a browser already held (a viewer's neko
 * session now known), it keeps the take-over and gives control to the
 * viewer.
 */
export const shieldBrowser = async (
  args: BrowserShieldArgs
): Promise<BrowserRow> => {
  const { key } = args;
  if (!isBrowserKey(key)) {
    throw new Error(`${String(key)} is no browser key.`);
  }
  // Closed before anything else: no agent reads the page from here on.
  gateOf(key)?.closeAll();
  const before = held.get(key);
  // A take-over this daemon holds already (sent again with a viewer) keeps
  // its browser as it runs: it is never started again under the person.
  if (!before) {
    await startBrowser({ key });
  }
  const gate = gateOf(key);
  if (!gate) {
    throw new Error(
      `${key}'s gate is not served on this machine, so it could not be closed; nothing was given to the person.`
    );
  }
  gate.closeAll();
  const record = await readBrowser(key);
  if (!record) {
    throw new Error(`${key} has no record on this machine.`);
  }
  const take: Held = before ?? {
    since: Date.now(),
    hubViewers: 0,
    unwatchedSince: Date.now(),
    ...(args.workspaceId ? { workspaceId: args.workspaceId } : {}),
    ...(args.origin ? { origin: args.origin } : {}),
    ...(args.requestId ? { requestId: args.requestId } : {}),
  };
  held.set(key, take);
  // Kept before the slow steps: a daemon that restarts in them still holds
  // the gate closed, and the count of views never reads a half-made one.
  await keep(key, take);
  await recordTakeover(key, take);
  if (!take.targetId) {
    const devtools = `http://127.0.0.1:${portsOf(record).devtools}`;
    const link = await CdpLink.open(devtools);
    try {
      const page = await frontPage(key, link, take.workspaceId, take.origin);
      if (page) {
        await link.call("Target.activateTarget", { targetId: page.targetId });
        take.targetId = page.targetId;
      }
    } finally {
      link.close();
    }
  }
  // The band names the page in front, the one the person sees.
  if (take.targetId) {
    setFront(key, take.targetId);
  }
  // The views watching the page while nobody held it open again on the
  // take-over's own screencast.
  endWatch(key, "The person took the browser over.");
  await viewFor(key, record, take);
  if (record.host === "container" && args.viewer) {
    await neko(record, `/room/control/give/${encodeURIComponent(args.viewer)}`);
    take.viewer = args.viewer;
  }
  await keep(key, take);
  await recordTakeover(key, take);
  watch();
  console.info(
    `[browser] ${key} taken over${take.workspaceId ? ` for workspace ${take.workspaceId}` : ""}${args.viewer ? `, control given to neko session ${args.viewer}` : ""}`
  );
  return rowOf(key);
};

/**
 * The front page made new: what the person typed is gone, and the page is
 * asked for again by GET; answers its origin.
 *
 * The page is cleared first with `about:blank`, which commits inside the
 * browser, no site involved, so nothing typed survives in any field however
 * the site answers (or whether it does): `Page.navigate` answers only once a
 * navigation commits, which for a site's URL waits on its response. The
 * page's own URL is then asked for by GET (never a reload, so a page a form
 * posted to is not posted again), and its answer is the site's to give: the
 * hand-back does not wait on it, and the agent's tool sees it load. A clear
 * that does not commit means the page itself is stuck, and the hand-back
 * fails with what the page was.
 */
const reloadFront = async (
  record: BrowserRecord,
  targetId: string | undefined
): Promise<string | null> => {
  const link = await CdpLink.open(
    `http://127.0.0.1:${portsOf(record).devtools}`
  );
  try {
    const pages = await pagesOf(link);
    const page = pages.find((one) => one.targetId === targetId) ?? pages[0];
    if (!page) {
      return null;
    }
    const session = await link.attach(page.targetId);
    const history = await link.call("Page.getNavigationHistory", {}, session);
    const entries = Array.isArray(history.entries)
      ? (history.entries as { url?: string }[])
      : [];
    const index =
      typeof history.currentIndex === "number" ? history.currentIndex : -1;
    const url = entries[index]?.url ?? page.url;
    if (!url || url === "about:blank") {
      return null;
    }
    await link
      .call("Page.navigate", { url: "about:blank" }, session)
      .catch((error: unknown) => {
        throw new Error(
          `the page at ${originOf(url) ?? url} did not clear (${why(error)})`,
          { cause: error }
        );
      });
    link.post("Page.navigate", { url }, session);
    return originOf(url) ?? null;
  } finally {
    link.close();
  }
};

/**
 * Hand back: control taken from the person, the front page loaded again by
 * GET, the clipboard emptied, the gate open; answers the page's origin.
 *
 * On the container host the daemon's admin takes control first (neko
 * `control/take`): the person's input stops reaching the browser, and the
 * admin is the host neko serves the clipboard to (its room routes are
 * `HostsOnly`), so it can empty it; `control/reset` then leaves nobody
 * hosting. A step that fails is said in the log and answered to the hub,
 * and the gate stays closed: the private period ends only whole.
 */
export const handBackBrowser = async (
  key: BrowserKey,
  /** How it came to be handed back: the person's Hand back, or the daemon's own. */
  said: BrowserHandedBackFrame["why"] = "person"
): Promise<BrowserHandback> => {
  if (!isBrowserKey(key)) {
    throw new Error(`${String(key)} is no browser key.`);
  }
  const take = held.get(key) ?? (await keptOf(key));
  const record = await readBrowser(key);
  let origin: string | null = null;
  if (record && take) {
    const step = async <T>(
      what: string,
      work: () => Promise<T>
    ): Promise<T> => {
      try {
        return await work();
      } catch (error) {
        const failure = `${key} was not handed back: ${what} failed (${why(error)}); its gate stays closed.`;
        console.warn(`[browser] ${failure}`);
        throw new Error(failure, { cause: error });
      }
    };
    if (record.host === "container") {
      await step("taking control from the person", () =>
        neko(record, "/room/control/take")
      );
    } else {
      await step("ending the page's view", async () => {
        await (await take.cdp)?.stop();
      });
    }
    origin = await step("loading the page again", () =>
      reloadFront(record, take.targetId)
    );
    if (record.host === "container") {
      await step("emptying the clipboard", () =>
        neko(record, "/room/clipboard", { text: "" })
      );
      await step("leaving the browser with no host", () =>
        neko(record, "/room/control/reset")
      );
    }
  }
  const answer: BrowserHandback = {
    key,
    origin,
    ...(take?.requestId ? { requestId: take.requestId } : {}),
  };
  await release(key, answer, said);
  console.info(
    `[browser] ${key} handed back${origin ? ` on ${origin}` : ""}, its gate open`
  );
  return answer;
};

/**
 * The one place a take-over ends: forgotten here and in the browser's dir,
 * the gate open, and the hub told. The hand-back is told first, whoever
 * ended it (`said`), so the ask's call answers with the page's origin; then
 * the record, whose frame every screen follows.
 */
const release = async (
  key: BrowserKey,
  answer: BrowserHandback,
  said: BrowserHandedBackFrame["why"]
): Promise<void> => {
  tellHub(answer, said);
  held.delete(key);
  setFront(key, null);
  await rm(shieldFile(key), { force: true });
  await recordTakeover(key, undefined).catch((error: unknown) =>
    console.warn(`[browser] ${key}'s take-over was not cleared: ${why(error)}`)
  );
  gateOf(key)?.open();
};

const keptOf = async (key: BrowserKey): Promise<Held | undefined> => {
  const kept = await readRecord(shieldFile(key), KeptSchema).catch(
    () => undefined
  );
  return kept ? { ...kept, hubViewers: 0 } : undefined;
};

/** How many views of `key`'s take-over the hub counts now. */
export const browserViewers = (key: BrowserKey, count: number): void => {
  const take = held.get(key);
  if (take) {
    take.hubViewers = Math.max(0, count);
  }
};

/**
 * A view of the local host's browser (the machine's preview listener's
 * `/__cawco/browser/<key>/cdp`): while the person holds it, the take-over's
 * frames and their input onto the page; while nobody does, the page in
 * front's frames alone, its input dropped (cdp-watch.ts). Undefined when
 * `key` is no live local browser, or shows no page.
 */
export const cdpView = async (
  key: BrowserKey,
  viewer: CdpViewer
): Promise<
  { input: (text: string) => void; leave: () => void } | undefined
> => {
  const take = held.get(key);
  if (!take) {
    const record = await readBrowser(key);
    if (!(record?.host === "local" && record.state === "live")) {
      return;
    }
    const leave = await watchView(
      key,
      `http://127.0.0.1:${portsOf(record).devtools}`,
      viewer
    );
    return leave ? { input: () => undefined, leave } : undefined;
  }
  const cdp = await take.cdp;
  if (!cdp) {
    return;
  }
  const leave = await cdp.attach(viewer);
  return {
    input: (text) => {
      const input = cdpInputOf(text);
      if (input) {
        cdp
          .input(input)
          .catch((error: unknown) =>
            console.warn(
              `[browser] ${key}: an input did not land: ${why(error)}`
            )
          );
      }
    },
    leave,
  };
};

let watching: ReturnType<typeof setInterval> | undefined;

/** Counts every take-over's views; one unwatched for two minutes, or whose browser stopped, is handed back. */
const watch = (): void => {
  watching ??= setInterval(() => {
    watchOnce().catch((error: unknown) =>
      console.warn(`[browser] take-overs not counted: ${why(error)}`)
    );
  }, WATCH_MS);
  watching.unref?.();
};

const watchOnce = async (): Promise<void> => {
  if (held.size === 0 && watching) {
    clearInterval(watching);
    watching = undefined;
    return;
  }
  const now = Date.now();
  for (const [key, take] of held) {
    const record = await readBrowser(key);
    // The browser stopped (Stop, its machine, its container), and the
    // registry cleared its take-over: answered as a hand-back with no page.
    if (!record?.takeover) {
      await (await take.cdp)?.stop();
      await release(
        key,
        {
          key,
          origin: null,
          ...(take.requestId ? { requestId: take.requestId } : {}),
        },
        "stopped"
      );
      continue;
    }
    const views = Math.max(take.hubViewers, (await take.cdp)?.viewers ?? 0);
    if (views > 0) {
      take.unwatchedSince = undefined;
      continue;
    }
    take.unwatchedSince ??= now;
    if (now - take.unwatchedSince >= TAKEOVER_UNWATCHED_MS) {
      console.info(
        `[browser] ${key}: no view of its take-over for ${TAKEOVER_UNWATCHED_MS / 60_000} minutes: handed back`
      );
      // A step that fails leaves the gate closed (handBackBrowser says
      // which); the next count tries the hand-back again.
      await handBackBrowser(key, "unwatched").catch(() => undefined);
    }
  }
};

const tellHub = (
  answer: BrowserHandback,
  said: BrowserHandedBackFrame["why"]
): void => {
  sink({
    kind: "browser_handback",
    machineId,
    key: answer.key,
    origin: answer.origin,
    ...(answer.requestId ? { requestId: answer.requestId } : {}),
    why: said,
  });
};

/**
 * The daemon starting: every browser its records say is taken over is held
 * again (its `shield.json`, else what its record's `takeover` says), with a
 * local host's view of its page started again, until the person hands back.
 * Its gate starts closed: the registry closes a gate it makes for a record
 * that holds a take-over (browsers.ts `gateFor`). A browser that stopped
 * meanwhile has its take-over released by the watch.
 */
export const restoreShields = async (): Promise<void> => {
  const keys: BrowserKey[] = [];
  for (const record of await allBrowsers()) {
    const kept = await keptOf(record.key);
    if (!record.takeover) {
      if (kept) {
        await rm(shieldFile(record.key), { force: true });
      }
      continue;
    }
    const { by, since, requestId } = record.takeover;
    const take: Held = {
      since,
      ...(by ? { workspaceId: by } : {}),
      ...(requestId ? { requestId } : {}),
      ...kept,
      hubViewers: 0,
      unwatchedSince: Date.now(),
    };
    held.set(record.key, take);
    viewFor(record.key, record, take);
    keys.push(record.key);
  }
  if (keys.length === 0) {
    return;
  }
  console.info(
    `[browser] held privately across the restart: ${keys.join(", ")}`
  );
  watch();
};
