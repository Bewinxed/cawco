/**
 * A normal dashboard load and a normal session log no console error or
 * warning and make no failed request: opening it, switching its tabs and
 * reloading it while a turn streams (owner, from nightly 5610's console: a
 * 404 for every tab the cookie kept that names no session, four times a
 * load, and one `derived_inert` after a reload of a busy session).
 *
 *   bun scripts/probe-kit/run.ts console-quiet
 *
 * A scratch fleet with two sessions: B, answering a long turn a word at a
 * time, and Q, quiet. The workspace's tree is kept as an earlier visit left
 * it, in localStorage and in its server copy (the `cawco-workspace` cookie,
 * through `/prefs` as the page writes it): B, an id no session has, Q's
 * short id, and a `run:` tab (workflow runs, a kind of tab CawCo no longer
 * has). The page opens on B.
 *
 * a. Tabs kept: the hub names each tab before anything reads it
 *    (workspace.svelte.ts, Naming the tabs). No response is a 404, nothing
 *    is logged, the strip holds B and Q under their full ids, and the cookie
 *    holds neither the dead id nor the `run:` tab.
 * b. A tab switch to Q and back logs nothing and fails nothing.
 * c. Ten reloads while B's turn streams: each logs nothing, fails nothing,
 *    and reads B's newest page no more than twice, with no separate tooling
 *    read (the tooling rides the page). Twice is the design's: the pane reads
 *    the page before the socket is up, and the page's first connection reads
 *    it again rather than resume from a seq read off another connection
 *    (client.svelte.ts `rereadFollowed`).
 */
import type { Page } from "playwright-core";
import { until } from "../../scratch-fleet";
import { COMPOSER, type Kit, kitsOwnMessage, open, type Spec } from "../kit";

/** B's turn: long enough to stream through every reload. */
const WORDS = Array.from({ length: 4000 }, (_, at) => `word${at}`);
const RELOADS = 10;
/** An id no session has, as the owner's cookie held one. */
const DEAD = "6654eba8";
/** A tab of a kind CawCo no longer has (workflow runs). */
const RUN_TAB = "run:0d1076a2-7be7-422a-acc6-4b16d97e7415";
/** What the page does after it is up: its reads, its follows, its cookie's write. */
const SETTLE_MS = 3000;

/** What a page said and failed, from the moment it is watched. */
interface Heard {
  /** Every request's path and query, in order. */
  asked: string[];
  failed: string[];
  said: string[];
}

const watch = (page: Page): Heard => {
  const heard: Heard = { said: [], failed: [], asked: [] };
  page.on("console", (message) => {
    const type = message.type();
    if (
      (type === "error" || type === "warning") &&
      !kitsOwnMessage(message.text())
    ) {
      heard.said.push(`[${type}] ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => heard.said.push(`[thrown] ${error.message}`));
  page.on("request", (request) => {
    const url = new URL(request.url());
    heard.asked.push(`${url.pathname}${url.search}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      heard.failed.push(`${response.status()} ${response.url()}`);
    }
  });
  page.on("requestfailed", (request) => {
    const why = request.failure()?.errorText ?? "";
    // A reload ends what the page had under way: that is the reload, not a failure.
    if (why !== "net::ERR_ABORTED") {
      heard.failed.push(`${why} ${request.url()}`);
    }
  });
  return heard;
};

/** Empties what was heard, answering what it held. */
const take = (heard: Heard) => ({
  said: heard.said.splice(0),
  failed: heard.failed.splice(0),
  asked: heard.asked.splice(0),
});

/** The tabs the workspace's tree holds, as localStorage keeps it. */
const stripOf = (page: Page) =>
  page.evaluate(() => {
    const tree = JSON.parse(
      localStorage.getItem("cawco-workspace") ?? "{}"
    ) as {
      root?: { tabs?: string[] };
    };
    return tree.root?.tabs ?? [];
  });

/** The tabs the server's copy (the cookie) holds. */
const cookieTabs = async (page: Page, base: string): Promise<string[]> => {
  const cookies = await page.context().cookies(base);
  const kept = cookies.find(
    (cookie) =>
      cookie.name === "cawco-workspace" ||
      cookie.name === "__Host-cawco-workspace"
  );
  if (!kept) {
    return [];
  }
  const tree = JSON.parse(decodeURIComponent(kept.value)) as {
    root?: { tabs?: string[] };
  };
  return tree.root?.tabs ?? [];
};

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(() => ({ everyMs: 40, words: WORDS }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const busy = await fleet.spawn("claude", "Busy session");
  const quiet = await fleet.spawn("claude", "Quiet session");
  await fleet.send(busy, "Say a great many words.");
  const base = await fleet.dashboard();

  const kept = JSON.stringify({
    v: 1,
    root: {
      t: "l",
      id: "pone",
      tabs: [busy, DEAD, quiet.slice(0, 8), RUN_TAB],
      active: busy,
      opened: null,
    },
    focusedLeaf: "pone",
  });
  const page = await kit.page("desk");
  // The server's copy, as the page writes it (prefs.ts `keepPrefs`).
  const copied = await page.request.post(`${base}/prefs`, {
    data: { "cawco-workspace": kept },
  });
  kit.check(
    "the server's copy of the kept tree is written",
    copied.ok(),
    `${copied.status()}`
  );
  await page.addInitScript((tree) => {
    if (!sessionStorage.getItem("console-quiet-seeded")) {
      sessionStorage.setItem("console-quiet-seeded", "1");
      localStorage.setItem("cawco-workspace", tree);
    }
  }, kept);
  const heard = watch(page);

  // a. Tabs kept.
  await open(page, `${base}/session/${busy}`, COMPOSER, 120_000);
  const strip = await until(
    "the kept tabs named",
    () => stripOf(page),
    (tabs) => tabs.length === 2,
    30_000
  ).catch(() => null);
  const cookie = await until(
    "the server's copy without the dead tabs",
    () => cookieTabs(page, base),
    (tabs) => !(tabs.includes(DEAD) || tabs.includes(RUN_TAB)),
    15_000
  ).catch(() => null);
  await page.waitForTimeout(SETTLE_MS);
  const first = take(heard);
  kit.check(
    "a. kept tabs: the strip holds the busy session and the quiet one by its full id",
    JSON.stringify(strip) === JSON.stringify([busy, quiet]),
    JSON.stringify({ strip, busy, quiet })
  );
  kit.check(
    "a. kept tabs: the cookie keeps neither the dead id nor the run tab",
    cookie?.includes(quiet) === true,
    JSON.stringify(cookie)
  );
  kit.check(
    "a. kept tabs: no request failed and nothing was logged",
    first.failed.length === 0 && first.said.length === 0,
    JSON.stringify({ failed: first.failed, said: first.said })
  );
  kit.check(
    "a. kept tabs: no instance route was asked for the dead id, the short id or the run tab",
    !first.asked.some(
      (path) =>
        path.startsWith("/api/instances/") &&
        [DEAD, quiet.slice(0, 8), RUN_TAB].some((id) =>
          path.startsWith(`/api/instances/${encodeURIComponent(id)}/`)
        )
    ),
    JSON.stringify(first.asked.filter((path) => path.startsWith("/api/")))
  );

  // b. A tab switch and back.
  await page.locator(`[data-session-tab="${quiet}"]`).first().click();
  await page.waitForTimeout(SETTLE_MS);
  await page.locator(`[data-session-tab="${busy}"]`).first().click();
  await page.waitForTimeout(SETTLE_MS);
  const switched = take(heard);
  kit.check(
    "b. a tab switch and back: no request failed and nothing was logged",
    switched.failed.length === 0 && switched.said.length === 0,
    JSON.stringify({ failed: switched.failed, said: switched.said })
  );

  // c. Reloads while the turn streams.
  const newest = `/api/instances/${busy}/transcript`;
  for (let at = 1; at <= RELOADS; at += 1) {
    const streaming = fleet.instance(busy)?.status === "running";
    // biome-ignore lint/performance/noAwaitInLoops: each reload follows the last
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(COMPOSER, { timeout: 60_000 });
    await page.waitForTimeout(SETTLE_MS);
    const load = take(heard);
    const reads = load.asked.filter((path) => path === newest).length;
    const tooling = load.asked.filter((path) => path.endsWith("/tooling"));
    kit.check(
      `c. reload ${at} while the turn streams: nothing logged, nothing failed, the newest page read at most twice, no tooling read`,
      streaming &&
        load.said.length === 0 &&
        load.failed.length === 0 &&
        reads >= 1 &&
        reads <= 2 &&
        tooling.length === 0,
      JSON.stringify({
        streaming,
        said: load.said,
        failed: load.failed,
        reads,
        tooling,
      })
    );
  }
};

export default { name: "console-quiet", run } satisfies Spec;
