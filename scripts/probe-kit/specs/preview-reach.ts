/**
 * A preview pane's "This preview can't be reached" is the state now, not
 * one failed probe, and it says what failed (owner, 2026-10-18, on a page
 * artifact that said so while its origin answered: "tf?").
 *
 *   bun scripts/probe-kit/run.ts preview-reach
 *
 * A scratch fleet, the built dashboard at the desk, read from the pane's
 * DOM. Nothing is pressed: every recovery is the pane's own.
 *
 * 1. A page artifact whose first probe this browser refuses (its `cors`,
 *    `no-cors` and second `cors` asks aborted as connection refused): the pane says it
 *    can't be reached, and why ("… The hub reaches …"); then it shows the
 *    page by itself, within `FIRST_BACK_MS`.
 * 2. A shown port preview whose server is gone, its machine's agent
 *    stopped, on Chromium and on WebKit: the hub's ping answers 200 with
 *    its own words that it is down (core `PreviewPingDown`), and the pane
 *    says them ("… answered: …"), with no "Previews need" advice (the
 *    origin answered) and one next step, its own "Trying again on its own."
 *    (the hub's words carry the cause alone, core `machineFaultWords`
 *    `next: false`). The page's console holds no error the while (owner's
 *    Caw thread, 2026-10-24: a 502 of every probe logged there), and its
 *    probes back off (PreviewPane `PROBE_FIRST_MS` doubling). The agent
 *    back, the pane shows the page by itself, within `AGENT_BACK_MS`.
 * 3. The agent frozen (SIGSTOP), so the hub still knows its listener and
 *    the listener doesn't answer (the owner's hub logged ECONNRESET from
 *    one): the hub's relayed ping fails, and the pane says "answered: its
 *    machine's listener didn't answer the hub (…)". The agent running
 *    again, the pane shows the page by itself.
 * 4. Every cause the shared classifier names (core preview-reach.ts), each
 *    by Playwright's own mechanism on the ping alone, said in its exact
 *    sentence on the pane's card and on a decision page's Preview alike:
 *    offline (`context.setOffline(true)`), refused at once (the browser's
 *    own block list, CDP `Network.setBlockedURLs`, which fails the request
 *    in the browser as a shield does: a `route.abort("blockedbyclient")`
 *    goes through Playwright's driver first, and under a loaded run took
 *    longer than any instant refusal), no answer (a route that never
 *    answers), the hub's word that it is down (a route answering it), a
 *    proxy's 502 (a route answering it without the hub's words), a 200
 *    without its CORS header (the ping sent on to a server that answers so:
 *    Playwright's `route.fulfill` adds the header to a CORS request's
 *    answer itself). The Preview, sampled every 100 ms in its frame from its first
 *    paint, is never an empty box: a skeleton or Caw and his line, then the
 *    cause with Try again.
 * 5. The hub can't reach the origin either: the dashboard opened on a name
 *    only this browser resolves (`--host-resolver-rules`), so the hub's own
 *    reach of the same origin fails, and both say so.
 */
import type { Page, Route } from "playwright-core";
import {
  INSTANT_REFUSAL_MS,
  type PreviewUnreached,
  previewsNeedWords,
  previewUnreachedWords,
} from "../../../packages/core/src/preview-reach";
import { previewWords } from "../../../packages/core/src/words/preview";
import { MACHINE, until } from "../../scratch-fleet";
import { type Engine, type Kit, kitsOwnMessage, open, type Spec } from "../kit";

/** The pane probes again 2 s after a failure (PreviewPane `PROBE_FIRST_MS`); slack for the probe and the frame's load. */
const FIRST_BACK_MS = 6000;
/** The backoff's most (30 s, PreviewPane `PROBE_MOST_MS`), and the agent's listener started again. */
const AGENT_BACK_MS = 45_000;
/** The hub's relay of the ping waits 5 s on the listener (hub preview.ts `PING_RELAY_MS`); slack for the page's open. */
const LISTENER_SAID_MS = 20_000;
/** A next step in the line: the pane's "Trying again on its own.", or a "Try again …" the hub's words once carried. */
const NEXT_STEP = /\btry(?:ing)? again\b/gi;

const pageOf = (heading: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${heading}</title></head><body><h1>${heading}</h1></body></html>`;

/** The desk's workspace: one tab, the session's, in front. */
const tabAt = (page: Page, id: string) =>
  page.addInitScript((shown) => {
    localStorage.setItem(
      "cawco-workspace",
      JSON.stringify({
        v: 1,
        root: {
          t: "l",
          id: "pone",
          tabs: [shown],
          active: shown,
          opened: null,
        },
        focusedLeaf: "pone",
      })
    );
  }, id);

/** What the pane of session `id` shows now: its unreached state's words, and whether its frame said ready. */
const paneNow = (page: Page, id: string) =>
  page.evaluate((pane) => {
    const root = document.querySelector(
      `[data-slot="pane"][data-pane="${pane}"]`
    );
    const down = root?.querySelector('[data-slot="down"]');
    const words = (node: Element | null | undefined) =>
      node?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      down: words(down),
      // The empty state's line alone, without its buttons' labels.
      line: words(down?.querySelector('[data-slot="empty-line"]')),
      ready: !!root?.querySelector('iframe[title="Preview"][data-ready]'),
    };
  }, id);

/** The pane's own "what next" after a cause. */
const PANE_NEXT = ` ${previewWords.tryingAgain}`;
/** A cause's sentence on the pane's card: its words, then the pane's next step. */
const paneSays = (words: string) => `${words}${PANE_NEXT}`;
/** The hub's words its answer that a preview is down carries (hub preview.ts `pingDown`). */
const HUB_WHY = "its machine's listener didn't answer the hub (ECONNRESET)";
/** A probe's limit (core preview-reach.ts `PROBE_ANSWER_MS`), and slack for the hub's own reach. */
const TIMEOUT_SAID_MS = 25_000;
/** A Preview waits out a status for 30 s (Preview.svelte `START_MS`) before it says it. */
const STATUS_SAID_MS = 45_000;

/** One cause, by what the ping meets in the browser, and what the classifier finds. */
interface Cause {
  /** Refused by the browser's own block list (CDP `Network.setBlockedURLs`) instead of a route. */
  blocked?: true;
  found: PreviewUnreached;
  handle?: (route: Route) => Promise<void>;
  name: string;
  /** How long it may take to be said, on the pane and on the Preview. */
  paneMs: number;
  previewMs: number;
}

const never = () => new Promise<void>(() => undefined);

/** The port of a server whose ping answers 200 without a CORS header, as a proxy or CDN rule that rewrote the hub's answer would; `run` starts it. */
let barePort = 0;

const CAUSES: Cause[] = [
  {
    name: "offline",
    handle: async (route) => {
      await route.request().frame().page().context().setOffline(true);
      await route.abort("internetdisconnected");
    },
    found: { cause: "offline" },
    paneMs: 15_000,
    previewMs: 15_000,
  },
  {
    name: "refused at once",
    blocked: true,
    found: { cause: "refused", hub: { reached: true } },
    paneMs: 15_000,
    previewMs: 15_000,
  },
  {
    name: "no answer",
    handle: never,
    found: { cause: "timeout", seconds: 10, hub: { reached: true } },
    paneMs: TIMEOUT_SAID_MS,
    previewMs: TIMEOUT_SAID_MS,
  },
  {
    name: "the hub's word that it is down",
    handle: (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ why: HUB_WHY }),
      }),
    found: { cause: "down", why: HUB_WHY },
    paneMs: 15_000,
    previewMs: STATUS_SAID_MS,
  },
  {
    name: "a proxy's 502",
    handle: (route) =>
      route.fulfill({
        status: 502,
        contentType: "text/html",
        headers: { "access-control-allow-origin": "*" },
        body: "<h1>502 Bad Gateway</h1>",
      }),
    found: { cause: "status", status: 502 },
    paneMs: 15_000,
    previewMs: STATUS_SAID_MS,
  },
  {
    name: "200 without its CORS header",
    handle: (route) =>
      route.continue({ url: `http://127.0.0.1:${barePort}/__cawco/ping` }),
    found: { cause: "unreadable" },
    paneMs: 15_000,
    previewMs: 15_000,
  },
];

/**
 * In every frame, from its first paint: what a decision page's Preview
 * shows every 100 ms, each change once. "empty" is a box with none of a
 * skeleton, Caw and his line, the frame drawn, or the cause.
 */
const SAMPLE_PREVIEW = () => {
  const seen: string[] = [];
  (window as unknown as { previewSeen: string[] }).previewSeen = seen;
  setInterval(() => {
    const stage = document.querySelector(
      '[data-slot="media"] [data-slot="media-stage"]'
    );
    if (!stage) {
      return;
    }
    const caw = stage.querySelector<HTMLElement>('[data-slot="wait-row"] img');
    const line =
      stage.querySelector('p[role="status"]')?.textContent?.trim() ?? "";
    let now = "empty";
    if (stage.querySelector('[data-slot="embed-fault"]')) {
      now = "cause";
    } else if (stage.querySelector('iframe[data-slot="embed"][data-drawn]')) {
      now = "drawn";
    } else if (stage.querySelector('[data-slot="skeleton"]')) {
      now = "skeleton";
    } else if (caw?.checkVisibility() && line) {
      now = "caw and line";
    }
    if (seen.at(-1) !== now) {
      seen.push(now);
    }
  }, 100);
};

/** A decision page's Preview, as its frame says it: its cause's words, and every state it showed. */
interface PreviewSaid {
  cause: string;
  seen: string[];
}

/** What the decision page's Preview says in the pane of session `id`. */
const previewNow = async (page: Page, id: string): Promise<PreviewSaid> => {
  const handle = await page
    .locator(`[data-slot="pane"][data-pane="${id}"] iframe[title="Preview"]`)
    .first()
    .elementHandle()
    .catch(() => null);
  const frame = await handle?.contentFrame();
  const nothing: PreviewSaid = { cause: "", seen: [] };
  if (!frame) {
    return nothing;
  }
  return frame
    .evaluate(() => ({
      cause:
        document
          .querySelector('[data-slot="embed-cause"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim() ?? "",
      seen: (window as unknown as { previewSeen?: string[] }).previewSeen ?? [],
    }))
    .catch(() => nothing);
};

/** What the cause legs stand on: the dashboard, the page artifact's session, the decision page's, and the hub's port range. */
interface Legs {
  base: string;
  decided: string;
  /** The port of the decision page's Preview's embed origin. */
  embedPort: number;
  kit: Kit;
  paged: string;
  /** The port of the page artifact's preview origin, the pane's. */
  panePort: number;
  ports: string;
}

/** A session whose panel shows a decision page with one Preview, of a dev server's preview on `port`. */
const decisionSession = async (
  fleet: Awaited<ReturnType<Kit["fleet"]>>,
  port: number
): Promise<{ decided: string; embedPort: number }> => {
  const decided = await fleet.spawn("claude", "Pictures", fleet.repo);
  const site = await fleet.api<{ id: string }>(
    `/api/instances/${decided}/artifacts`,
    {
      kind: "preview",
      does: "try",
      ask: "Try this page and say whether it works",
      name: "the-site",
      port,
      machine: MACHINE,
    }
  );
  const page = await fleet.api<{ id: string }>(
    `/api/instances/${decided}/artifacts`,
    {
      kind: "page",
      does: "pick",
      ask: "Pick one option on each card",
      name: "pick-host",
      program: `root = Decisions("Pick the host", [where])
where = Decision("where", "Where does the site run?", [here, there], "It runs on the machine today.")
here = Option("here", "Here", "As it runs now.", true, [live], "Nothing new to try.")
there = Option("there", "Elsewhere", "Somewhere new.", false, [], "A move to make first.")
live = Preview("${site.id}", "The site as it runs")`,
    }
  );
  // The embed's origin, as the hub names it in the page it serves.
  const { port: own } = await fleet.api<{ port: number }>(
    `/api/instances/${decided}/preview-address`,
    {}
  );
  const served = await fetch(
    `http://127.0.0.1:${own}/__cawco/page/${page.id}/`
  ).then((answer) => answer.text());
  const embedPort = Number(EMBED_PORT.exec(served)?.[1] ?? 0);
  return { decided, embedPort };
};

/** The embed's address in a decision page's `cawco-media`. */
const EMBED_PORT = /"embed":"http:\/\/127\.0\.0\.1:(\d+)\//;

/**
 * Every ping of `page` to `port` meets `cause`: its route, or the browser's
 * own block list. The page's frames run in one process, so the list covers
 * the decision page's frame too.
 */
const meetPing = async (
  page: Page,
  port: number,
  cause: Pick<Cause, "blocked" | "handle">
): Promise<void> => {
  if (cause.blocked) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setBlockedURLs", {
      urls: [`*:${port}/__cawco/ping*`],
    });
    return;
  }
  const { handle } = cause;
  if (!handle) {
    return;
  }
  await page.route(
    (url) => url.pathname === "/__cawco/ping" && url.port === String(port),
    handle
  );
};

/** What previews need, as the pane and a decision page say it: the hub's range named, which the page hears with the hub's reach. */
const needOf = (hostname: string, ports: string | null) =>
  previewsNeedWords({ byHost: false, hostname, ports, hostMode: false });

/** `said` against `wanted`, for a check's detail. */
const against = (said: string, wanted: string) =>
  `said: ${said === "" ? "nothing" : said}${said === wanted ? "" : ` | wanted: ${wanted}`}`;

/** The pane's card's line once it says its cause, within `ms`. */
const paneLine = (page: Page, id: string, label: string, ms: number) =>
  until(
    label,
    () => paneNow(page, id),
    (now) => now.line.includes(PANE_NEXT.trim()),
    ms
  ).then(
    (now) => now.line,
    async () => (await paneNow(page, id)).line
  );

/** The decision page's Preview once it says its cause, within `ms`. */
const previewSaid = (
  page: Page,
  id: string,
  label: string,
  ms: number
): Promise<PreviewSaid> =>
  until(
    label,
    () => previewNow(page, id),
    (now) => now.cause !== "",
    ms
  ).then(
    // The sampler's next round, so its record ends on what was read.
    async () => {
      await Bun.sleep(SAMPLE_MS * 3);
      return previewNow(page, id);
    },
    () => previewNow(page, id)
  );

/** How often SAMPLE_PREVIEW reads the Preview. */
const SAMPLE_MS = 100;

/** The Preview's samples: something stood in the box at every one, and it ended on its cause. */
const neverEmpty = (seen: string[]) =>
  seen.length > 0 && !seen.includes("empty") && seen.at(-1) === "cause";

const paneCause = async (legs: Legs, cause: Cause) => {
  const { base, kit, paged, panePort, ports } = legs;
  const pane = await kit.page("desk", { oneProcess: true });
  await meetPing(pane, panePort, cause);
  await tabAt(pane, paged);
  await pane.goto(`${base}/session/${paged}`).catch(() => undefined);
  const said = await paneLine(
    pane,
    paged,
    `the pane's card for ${cause.name}`,
    cause.paneMs
  );
  const wanted = paneSays(
    previewUnreachedWords(
      `${new URL(base).hostname}:${panePort}`,
      cause.found,
      needOf(new URL(base).hostname, ports)
    )
  );
  kit.check(
    `4: ${cause.name}: the pane's card says its own cause`,
    said === wanted,
    against(said, wanted)
  );
  if (cause.blocked) {
    // The threshold the cause stands on, read in the same page under the
    // same load: how long the browser's own block list takes to fail a ping.
    const took = await pane.evaluate(
      async (url) => {
        const times: number[] = [];
        for (let i = 0; i < 20; i += 1) {
          const started = performance.now();
          // biome-ignore lint/performance/noAwaitInLoops: one ping at a time, each timed alone
          await fetch(url, { mode: "cors", cache: "no-store" }).catch(
            () => undefined
          );
          times.push(performance.now() - started);
        }
        times.sort((a, b) => a - b);
        return { median: times[10] ?? 0, slowest: times[19] ?? 0 };
      },
      `http://${new URL(base).hostname}:${panePort}/__cawco/ping`
    );
    // A probe judges by the fastest of its asks (core `probePreview`), so
    // the threshold holds the block list's usual ping, the median.
    kit.check(
      `4: ${cause.name}: the browser's block list fails a ping inside INSTANT_REFUSAL_MS (${INSTANT_REFUSAL_MS} ms)`,
      took.median < INSTANT_REFUSAL_MS,
      `20 pings: median ${took.median.toFixed(1)} ms, slowest ${took.slowest.toFixed(1)} ms`
    );
  }
  await pane.context().setOffline(false);
  await pane.context().close();
};

const previewCause = async (legs: Legs, cause: Cause) => {
  const { base, decided, embedPort, kit } = legs;
  const picture = await kit.page("desk", {
    init: [SAMPLE_PREVIEW],
    oneProcess: true,
  });
  await meetPing(picture, embedPort, cause);
  await tabAt(picture, decided);
  await picture.goto(`${base}/session/${decided}`).catch(() => undefined);
  const shown = await previewSaid(
    picture,
    decided,
    `the Preview's cause for ${cause.name}`,
    cause.previewMs
  );
  const wanted = previewUnreachedWords(
    `${new URL(base).hostname}:${embedPort}`,
    cause.found,
    needOf(new URL(base).hostname, legs.ports)
  );
  kit.check(
    `4: ${cause.name}: the decision page's Preview says the same cause`,
    shown.cause === wanted,
    against(shown.cause, wanted)
  );
  kit.check(
    `4: ${cause.name}: the Preview is never an empty box`,
    neverEmpty(shown.seen),
    shown.seen.join(" → ") || "never sampled"
  );
  await picture.context().setOffline(false);
  await picture.context().close();
};

/** What a page shows, its first words, for a check that found nothing where it looked. */
const pageWords = (page: Page) =>
  page
    .evaluate(() =>
      (document.body?.innerText ?? "").replace(/\s+/g, " ").slice(0, 240)
    )
    .catch((error: unknown) => String(error));

/**
 * A name only this browser resolves (its `--host-resolver-rules`): the hub's
 * own reach of it fails. Under `.ts.net`, which the dashboard's server
 * allows as a host (vite.config.ts `allowedHosts`); no tailnet holds it.
 */
const ONLY_HERE = "cawco-probe-unheld.ts.net";
const HUB_AWAY = /The hub can't reach it either \((.+?)\)\. Previews need/;
/** The hub's own words for why it can't reach the origin, as the line says them. */
const hubWhy = (line: string) => HUB_AWAY.exec(line)?.[1] ?? "";
const refusedBoth = (why: string): PreviewUnreached => ({
  cause: "refused",
  hub: { reached: false, why },
});

/**
 * The dashboard opened on {@link ONLY_HERE}, so every preview origin stands
 * on that name too; the ping refused at once in the browser. The hub's own
 * reach of the same origin fails, and both the pane and the Preview say so.
 */
const hubAway = async (legs: Legs) => {
  const { base, decided, embedPort, kit, paged, panePort, ports } = legs;
  const at = new URL(base);
  at.hostname = ONLY_HERE;
  const elsewhere = at.origin;
  const refuse = { blocked: true } as const;
  const options = {
    hostRules: `MAP ${ONLY_HERE} 127.0.0.1`,
    oneProcess: true,
  };

  const pane = await kit.page("desk", options);
  await meetPing(pane, panePort, refuse);
  await tabAt(pane, paged);
  await pane.goto(`${elsewhere}/session/${paged}`).catch(() => undefined);
  const said = await paneLine(
    pane,
    paged,
    "the pane's card when the hub can't reach it either",
    20_000
  );
  const paneWanted = paneSays(
    previewUnreachedWords(
      `${ONLY_HERE}:${panePort}`,
      refusedBoth(hubWhy(said)),
      needOf(ONLY_HERE, ports)
    )
  );
  kit.check(
    "5: the hub can't reach it either: the pane's card says both sides fail",
    hubWhy(said) !== "" && said === paneWanted,
    `${against(said, paneWanted)}${said === "" ? ` | the page at ${pane.url()}: ${await pageWords(pane)}` : ""}`
  );
  await pane.context().close();

  const picture = await kit.page("desk", {
    ...options,
    init: [SAMPLE_PREVIEW],
  });
  await meetPing(picture, embedPort, refuse);
  await tabAt(picture, decided);
  await picture.goto(`${elsewhere}/session/${decided}`).catch(() => undefined);
  const shown = await previewSaid(
    picture,
    decided,
    "the Preview's cause when the hub can't reach it either",
    20_000
  );
  const pictureWanted = previewUnreachedWords(
    `${ONLY_HERE}:${embedPort}`,
    refusedBoth(hubWhy(shown.cause)),
    needOf(ONLY_HERE, ports)
  );
  kit.check(
    "5: the hub can't reach it either: the decision page's Preview says both sides fail",
    hubWhy(shown.cause) !== "" && shown.cause === pictureWanted,
    against(shown.cause, pictureWanted)
  );
  kit.check(
    "5: the hub can't reach it either: the Preview is never an empty box",
    neverEmpty(shown.seen),
    shown.seen.join(" → ") || "never sampled"
  );
  await picture.context().close();
};

/** Where leg 2 runs: the desk's two engines. */
const GONE_ENGINES: readonly Engine[] = ["chromium", "webkit"];
/** Probes read while the preview is down, for its backoff: three waits (2, 4 and 8 s, PreviewPane `PROBE_FIRST_MS` doubling). */
const PROBES_READ = 4;
/** Slack for those 14 s of waits and each probe's answer. */
const PROBES_READ_MS = 30_000;
/** The pane's first wait after a failed probe (PreviewPane `PROBE_FIRST_MS`), less a timer's slack. */
const FIRST_WAIT_MS = 1800;
/** Each wait at least this much longer than the one before: PreviewPane doubles it, and a probe's own answer rides on each. */
const BACKOFF_GROWTH = 1.5;

/**
 * Leg 2 on `engine`: the agent stopped, so the shown preview's server is
 * gone; the pane says the hub's words, its console holds no error while it
 * probes, the probes back off, and the agent back, the page is shown.
 */
const serverGone = async (leg: {
  base: string;
  engine: Engine;
  fleet: Awaited<ReturnType<Kit["fleet"]>>;
  kit: Kit;
  ported: string;
}) => {
  const { base, engine, fleet, kit, ported } = leg;
  const { port } = await fleet.api<{ port: number }>(
    `/api/instances/${ported}/preview-address`,
    {}
  );
  const host = `${new URL(base).hostname}:${port}`;
  await fleet.stop("agent");
  const away = await kit.page("desk", { engine });
  const errors: string[] = [];
  away.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(`${message.text()} at ${message.location().url || "?"}`);
    }
  });
  away.on("pageerror", (error) => errors.push(`uncaught: ${error.message}`));
  const probes: number[] = [];
  away.on("request", (request) => {
    const at = new URL(request.url());
    if (at.pathname === "/__cawco/ping" && at.port === String(port)) {
      probes.push(Date.now());
    }
  });
  await tabAt(away, ported);
  await open(
    away,
    `${base}/session/${ported}`,
    `[data-slot="pane"][data-pane="${ported}"] [data-slot="down"]`
  );
  const hubSaid = await paneNow(away, ported);
  kit.check(
    `2 ${engine}: the server gone: the pane says the hub's own words that it is down, and no Previews need advice`,
    hubSaid.line.startsWith(`${host} answered: `) &&
      !hubSaid.down.includes("Previews need"),
    hubSaid.down
  );
  const nextSteps = hubSaid.line.match(NEXT_STEP)?.length ?? 0;
  kit.check(
    `2 ${engine}: its line says one next step, the pane's own: the hub's words carry the cause alone`,
    nextSteps === 1 && hubSaid.line.endsWith(previewWords.tryingAgain),
    `${nextSteps} next steps: ${hubSaid.line}`
  );
  await until(
    `${PROBES_READ} probes of the preview that is down`,
    () => Promise.resolve(probes.length),
    (count) => count >= PROBES_READ,
    PROBES_READ_MS
  ).catch(() => undefined);
  const waits = probes
    .slice(1, PROBES_READ)
    .map((at, n) => at - (probes[n] ?? at));
  kit.check(
    `2 ${engine}: the probes back off: the first wait about ${FIRST_WAIT_MS / 1000} s or more, each next one at least ${BACKOFF_GROWTH}× the last`,
    waits.length === PROBES_READ - 1 &&
      (waits[0] ?? 0) >= FIRST_WAIT_MS &&
      waits.every(
        (wait, n) => n === 0 || wait >= (waits[n - 1] ?? 0) * BACKOFF_GROWTH
      ),
    `${probes.length} probes; waits ${waits.map((wait) => `${wait} ms`).join(", ") || "none"}`
  );
  kit.check(
    `2 ${engine}: while it is down, the page's console holds no error`,
    errors.length === 0,
    errors.length === 0
      ? `none over ${probes.length} probes`
      : errors.slice(0, 4).join(" | ")
  );
  fleet.launch("agent");
  await fleet.agentUp();
  const agentAt = Date.now();
  const served = await until(
    "the page shown once the agent is back",
    () => paneNow(away, ported),
    (now) => now.ready && !now.down,
    AGENT_BACK_MS
  ).then(
    () => Date.now() - agentAt,
    () => null
  );
  const last = await paneNow(away, ported);
  kit.check(
    `2 ${engine}: the server back: the pane shows the page by itself, within ${AGENT_BACK_MS / 1000} s, no press`,
    served !== null,
    `shown ${served ?? "never"} ms after the agent was up; the pane now: ${last.down || "the page"}`
  );
  await away.context().close();
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const base = await fleet.dashboard();

  // 1. A page artifact, its first ping refused at this browser.
  const paged = await fleet.spawn("claude", "Refused once", fleet.repo);
  await fleet.api(`/api/instances/${paged}/artifacts`, {
    kind: "page",
    does: "judge",
    ask: "Judge this page: pin anything that reads wrong",
    name: "refused-once",
    html: pageOf("Refused once"),
  });
  const desk = await kit.page("desk");
  let pings = 0;
  await desk.route(
    (url) => url.pathname === "/__cawco/ping",
    (route) => {
      pings += 1;
      // The first probe's three asks: `cors`, `no-cors`, `cors` again.
      return pings <= 3 ? route.abort("connectionrefused") : route.continue();
    }
  );
  await tabAt(desk, paged);
  await open(
    desk,
    `${base}/session/${paged}`,
    `[data-slot="pane"][data-pane="${paged}"] [data-slot="down"]`
  );
  const refused = await paneNow(desk, paged);
  const downAt = Date.now();
  const back = await until(
    "the page shown after its refused ping",
    () => paneNow(desk, paged),
    (now) => now.ready && !now.down,
    FIRST_BACK_MS
  ).then(
    () => Date.now() - downAt,
    () => null
  );
  kit.check(
    "1: a refused first ping: the pane says it can't be reached and why",
    refused.down.includes(previewWords.cantBeReached) &&
      refused.down.includes("The hub reaches") &&
      refused.down.includes(previewWords.tryingAgain),
    refused.down
  );
  kit.check(
    `1: then it shows the page by itself, within ${FIRST_BACK_MS / 1000} s, no press`,
    back !== null,
    `shown after ${back ?? "never"} ms; pings ${pings}`
  );
  await desk.close();

  // 2. A port preview whose server is gone: its machine's agent stopped.
  const app = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(pageOf("Served"), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  });
  const ported = await fleet.spawn("claude", "Agent away", fleet.repo);
  await fleet.api(`/api/instances/${ported}/artifacts`, {
    kind: "preview",
    does: "try",
    ask: "Try this page and say whether it works",
    name: "agent-away",
    port: app.port,
  });
  for (const engine of GONE_ENGINES) {
    // biome-ignore lint/performance/noAwaitInLoops: one engine at a time, the agent stopped and back for each
    await serverGone({ base, engine, fleet, kit, ported });
  }

  // 3. The agent frozen: still the machine the hub knows, its listener
  // silent, as one that resets its connections is.
  fleet.freeze("agent", true);
  const frozen = await kit.page("desk");
  await tabAt(frozen, ported);
  await open(frozen, `${base}/session/${ported}`, '[data-slot="pane"]');
  const silent = await until(
    "the hub's words for a silent listener",
    () => paneNow(frozen, ported),
    (now) => now.down.includes("listener didn't answer the hub"),
    LISTENER_SAID_MS
  ).then(
    (now) => now.down,
    async () => (await paneNow(frozen, ported)).down || "the page"
  );
  kit.check(
    "3: the machine's listener silent: the pane says the hub's words that its listener didn't answer the hub",
    silent.includes("answered: its machine's listener didn't answer the hub"),
    silent
  );
  fleet.freeze("agent", false);
  const thawAt = Date.now();
  const thawed = await until(
    "the page shown once the listener answers",
    () => paneNow(frozen, ported),
    (now) => now.ready && !now.down,
    AGENT_BACK_MS
  ).then(
    () => Date.now() - thawAt,
    () => null
  );
  const thawedNow = await paneNow(frozen, ported);
  kit.check(
    `3: the agent running again: the pane shows the page by itself, within ${AGENT_BACK_MS / 1000} s, no press`,
    thawed !== null,
    `shown ${thawed ?? "never"} ms after the thaw; the pane now: ${thawedNow.down || "the page"}`
  );
  await frozen.close();

  // 4. Each cause, on the pane's card and on a decision page's Preview.
  const { ports } = await fleet.api<{ ports: string }>("/api/preview-settings");
  const bare = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response("ok", { headers: { "content-type": "text/plain" } }),
  });
  barePort = Number(bare.port);
  const { decided, embedPort } = await decisionSession(fleet, Number(app.port));
  const { port: panePort } = await fleet.api<{ port: number }>(
    `/api/instances/${paged}/preview-address`,
    {}
  );
  const legs: Legs = { base, decided, embedPort, kit, paged, panePort, ports };
  for (const cause of CAUSES) {
    // biome-ignore lint/performance/noAwaitInLoops: one cause at a time, each in a browser of its own
    await paneCause(legs, cause);
    await previewCause(legs, cause);
  }
  // 5. The hub can't reach it either.
  await hubAway(legs);
  app.stop(true);
  bare.stop(true);
};

const spec: Spec = { name: "preview-reach", run };
export default spec;
