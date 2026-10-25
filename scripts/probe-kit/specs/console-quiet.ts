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
 *    and reads B's newest page exactly once, with no separate tooling read
 *    (the tooling rides the page). The pane reads the page before the socket
 *    is up, and the socket's first connection resumes B's stream from that
 *    page's seq, the board naming the page's hub run (client.svelte.ts
 *    `followHeld`, `TranscriptPage.hubRun`).
 * d. A reload whose socket is held until the hub has restarted after the
 *    page was read: the page's run is not the socket's, so B's newest page is
 *    read once more after the socket opens (`because reconnect`), and only
 *    once.
 * e. A tab on a conversation stored on the machine, which the hub holds no
 *    row for, opened by its address once the machine is offline (past its
 *    reconnecting window): the hub's locate finds it in the machine's last
 *    catalog, and the transcript route answers 503 (the machine away), read
 *    once, and no response is a 404. The page logs nothing; Chromium's own
 *    "Failed to load resource" line for each 503 is the browser's, counted
 *    against the 503s. The pane shows the machine away.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Page, Response } from "playwright-core";
import type { AgentRow } from "../../../packages/core/src";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import { RECONNECTING_MS } from "../../../packages/core/src/handover";
import { MACHINE, until } from "../../scratch-fleet";
import { writeClaudeTranscript } from "../claude-transcripts";
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
/** A conversation stored on the machine that the hub never started (leg e). */
const STORED = "00000000-0000-4000-8000-00000000c0de";
/** The page's own line for each newest page it read, and why (client.svelte.ts `readNewestPage`). */
const READ_LINE = /^\[cawco\] read (\w+) because (\w+)/;
/** The pane's title for a transcript whose machine is away (SessionPane.svelte `faultTitle`). */
const AWAY_TITLE = /This machine is (offline|reconnecting)/;
/** Chromium's console line for a 503 response: the browser's, not the page's. */
const AWAY_LOAD_LINE =
  /^\[error\] Failed to load resource: the server responded with a status of 503/;

/** What a page said and failed, from the moment it is watched. */
interface Heard {
  /** Every request's path and query, in order. */
  asked: string[];
  failed: string[];
  /** Each newest page the page read, as `<id8> <cause>`. */
  read: string[];
  said: string[];
}

const watch = (page: Page): Heard => {
  const heard: Heard = { said: [], failed: [], asked: [], read: [] };
  page.on("console", (message) => {
    const type = message.type();
    const read = READ_LINE.exec(message.text());
    if (read) {
      heard.read.push(`${read[1]} ${read[2]}`);
    }
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
  read: heard.read.splice(0),
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
  // e's conversation, on the machine's disk before its agent registers, so
  // its register's catalog names it.
  const project = join(
    fleet.home,
    CLAUDE_DIR_NAME,
    "projects",
    "-probe-console-quiet"
  );
  await mkdir(project, { recursive: true });
  writeClaudeTranscript(join(project, `${STORED}.jsonl`), {
    bytes: 64 * 1024,
    seed: 7,
    sessionId: STORED,
    cwd: fleet.workdir,
  });
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
      `c. reload ${at} while the turn streams: nothing logged, nothing failed, the newest page read exactly once, no tooling read`,
      streaming &&
        load.said.length === 0 &&
        load.failed.length === 0 &&
        reads === 1 &&
        tooling.length === 0,
      JSON.stringify({
        streaming,
        said: load.said,
        failed: load.failed,
        reads,
        why: load.read,
        tooling,
      })
    );
  }

  // d. The hub restarts between the page's read and its socket.
  const { promise: held, resolve: release } = Promise.withResolvers<void>();
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    async (ws) => {
      await held;
      ws.connectToServer();
    }
  );
  const isNewest = (response: Response) =>
    new URL(response.url()).pathname === newest;
  const pageRead = page.waitForResponse(isNewest, { timeout: 60_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  const before = await pageRead;
  await before.finished();
  const readBefore = take(heard);
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const reread = page.waitForResponse(isNewest, { timeout: 60_000 });
  release();
  const after = await reread.catch(() => null);
  await page.waitForTimeout(SETTLE_MS);
  const restarted = take(heard);
  const readsBefore = readBefore.asked.filter((path) => path === newest);
  const readsAfter = restarted.asked.filter((path) => path === newest);
  kit.check(
    "d. the hub restarted between the page's read and its socket: the newest page is read once before the socket opens and once after, because the run moved",
    before.status() === 200 &&
      after?.status() === 200 &&
      readsBefore.length === 1 &&
      readsAfter.length === 1 &&
      restarted.read.includes(`${busy.slice(0, 8)} reconnect`),
    JSON.stringify({
      before: before.status(),
      after: after?.status() ?? null,
      readsBefore: readsBefore.length,
      readsAfter: readsAfter.length,
      why: [...readBefore.read, ...restarted.read],
    })
  );

  // e. A stored conversation whose machine is away.
  const rows = fleet.query<{ id: string }>(
    "SELECT id FROM instances WHERE id = ? OR session_id = ?",
    STORED,
    STORED
  );
  kit.check(
    "e. the stored conversation has no row on the hub: only the machine's catalog names it",
    rows.length === 0,
    JSON.stringify(rows)
  );
  await fleet.stop("agent");
  await until(
    "the machine away",
    async () =>
      (await fleet.api<AgentRow[]>("/api/agents")).find(
        (row) => row.machineId === MACHINE
      )?.status,
    (status) => status !== "online",
    30_000
  );
  // Past its reconnecting window, the machine is offline: no read again
  // waits on the window's deadline (client.svelte.ts `readAtDeadline`).
  const away = Date.now();
  await page.waitForTimeout(RECONNECTING_MS + 2000);
  take(heard);
  const stored = `/api/instances/${STORED}/transcript`;
  const answered = page.waitForResponse(
    (response) => new URL(response.url()).pathname === stored,
    { timeout: 60_000 }
  );
  await page.goto(
    `${base}/session/${STORED}?${new URLSearchParams({
      machine: MACHINE,
      harness: "claude",
      cwd: fleet.workdir,
    })}`,
    { waitUntil: "domcontentloaded" }
  );
  const storedRead = await answered.catch(() => null);
  const awayShown = await page
    .getByRole("alert")
    .filter({ hasText: AWAY_TITLE })
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(SETTLE_MS);
  const awayLoad = take(heard);
  // Chromium's own line for each response that is not a 2xx: one for each
  // 503 in the network log, and none of them the page's.
  const browserLines = awayLoad.said.filter((line) =>
    AWAY_LOAD_LINE.test(line)
  );
  const pageSaid = awayLoad.said.filter((line) => !AWAY_LOAD_LINE.test(line));
  const unavailable = awayLoad.failed.filter((line) => line.startsWith("503 "));
  const storedReads = awayLoad.asked.filter((path) => path === stored).length;
  kit.check(
    "e. the stored conversation's machine away: its transcript is read once and answers 503, every failed response is a 503 (none a 404), the page logs nothing (the browser's line for each 503 aside), and the pane shows the machine away",
    storedRead?.status() === 503 &&
      storedReads === 1 &&
      unavailable.length === awayLoad.failed.length &&
      browserLines.length === unavailable.length &&
      pageSaid.length === 0 &&
      awayShown,
    JSON.stringify({
      awayForMs: Date.now() - away,
      status: storedRead?.status() ?? null,
      storedReads,
      why: awayLoad.read,
      failed: awayLoad.failed,
      said: awayLoad.said,
      awayShown,
    })
  );
};

export default { name: "console-quiet", run } satisfies Spec;
