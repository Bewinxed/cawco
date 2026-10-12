#!/usr/bin/env bun
/**
 * Web transcript read-again probe: a re-read never takes away the rows a
 * reader holds or moves their place, and while the transcript cannot be
 * caught up (its machine offline, or the hub failing the read) the pane says
 * so in one line until it can. The web half of probe-ios-catchup.ts.
 *
 *   bun scripts/probe-web-catchup.ts [--rows <n>] [--dashboard <dir>] [--label <name>] [--keep]
 *
 * Run from the repo root after `bunx vite build` in the dashboard it serves
 * (`--dashboard`, default this checkout's apps/dashboard). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) and seeds one session with
 *     `--rows` rows (default 820: the newest page and four older ones), each
 *     a Bash call; and a second session whose turn calls
 *     `mcp__cawco__start_session`: the session it starts answers, and its
 *     card in the second session's transcript opens on a well (the delegate
 *     card, InlineTranscript);
 *  2. serves the built dashboard with `vite preview` against the scratch hub,
 *     and opens the long session in Chromium (playwright-core), counting
 *     every read of its transcript, newest or older, and the second session
 *     beside it with that card open on its well;
 *  3. scrolls up until three older pages have been read;
 *  4. restarts the hub three times with the reader there, the browser's
 *     socket held off until the hub is up: its resume meets a stream that
 *     starts again empty (`stream.reset`), and the newest page is read
 *     again. The second time the hub's read answers 500 (once, and once more
 *     for Try again); the third time the agent is away, so the read finds
 *     the machine offline.
 *
 * Checks: the started session answers; the rows in view
 * and the first row's place hold within 2px across each read again, and no
 * older page is read again. With the read failed, the pane says "Not caught
 * up: <reason>." beside a Try again that reads again, and the line goes once
 * the session's next frame reads it. With the agent away, the rows hold
 * while the pane says "Not caught up: <machine> is offline. The rest comes
 * in once it's back." on one line at 1440 and at most two at 390 (the name
 * whole), the card's well says the same over its rows, and both lines go
 * once the agent is back and the reads land.
 *
 * Captures go to $TMPDIR/web-catchup/<label>/ (or .probe/ outside a
 * workspace). It stops only what it started.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright-core";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const keep = args.includes("--keep");
const ROWS = Number(option("--rows") ?? 820);
const LABEL = option("--label") ?? "run";
const root = resolve(import.meta.dir, "..");
const dashboardDir = resolve(
  option("--dashboard") ?? join(root, "apps", "dashboard")
);
const BEHIND = "Not caught up: ";
const OFFLINE_NEXT = "is offline. The rest comes in once it's back.";
/** What the hub says when a stored transcript could not be read (server.ts, a failed history read). */
const FAILED = "the transcript could not be read";
/**
 * What the second session calls for the card with a well: a session of its
 * own, drawn as a delegate's card is (rows.ts `isDelegateMsg`, `start`). No
 * workspace: a boundary cannot start under a CawCo workspace's own on macOS
 * (`sandbox_apply: Operation not permitted`).
 */
const START_TOOL = "mcp__cawco__start_session";
/** The page's own socket path. */
const HUB_SOCKET = /\/ws\//;
const out = join(
  process.env.CAWCO_WORKSPACE && process.env.TMPDIR
    ? join(process.env.TMPDIR, "web-catchup")
    : join(root, ".probe", "web-catchup"),
  LABEL
);
await mkdir(out, { recursive: true });
console.log(
  `  at ${(await Bun.$`git -C ${dashboardDir} log -1 --format=%h\ %s`.text()).trim()}`
);

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};
const pause = (ms: number) => Bun.sleep(ms);

// ── 1. The scratch fleet, its sessions seeded ────────────────────────────
const tag = crypto.randomUUID().slice(0, 6);
const MARK = `catchup probe ${tag}`;
const DELEG = `delegating probe ${tag}`;
const WELL = `well probe ${tag}`;
let calls = 0;
let delegated = false;
const respond = (request: Seen): Reply => {
  if (request.tools && request.all.includes(MARK) && calls < ROWS) {
    calls += 1;
    const n = String(calls).padStart(4, "0");
    return {
      everyMs: 1,
      words: [],
      tool: {
        name: "Bash",
        input: { command: `echo row-${n}`, description: `Print row-${n}` },
      },
    };
  }
  if (
    request.tools &&
    request.all.includes(DELEG) &&
    !request.all.includes(WELL) &&
    !delegated
  ) {
    if (request.toolNames.includes(START_TOOL)) {
      delegated = true;
      return {
        everyMs: 1,
        words: [],
        tool: {
          name: START_TOOL,
          input: {
            cwd: fleet.workdir,
            prompt: `${WELL}: say ok.`,
            title: "Well probe",
          },
        },
      };
    }
    console.log(
      `  the starting turn was offered no ${START_TOOL}: ${request.toolNames.join(", ")}`
    );
  }
  return { everyMs: 5, words: ["Done."] };
};
const fleet = await scratchFleet({ name: "probe-web-catchup", respond });

interface PageRead {
  blocks: {
    content?: string;
    id: string;
    metadata?: { delegateInstanceId?: string };
    type: string;
  }[];
  cursor: string | null;
  tail?: { busy?: boolean };
}
const walk = async (id: string) => {
  const newest = await fleet.api<PageRead>(`/api/instances/${id}/transcript`);
  let rows = newest.blocks.length;
  let pages = 1;
  let { cursor } = newest;
  while (cursor) {
    // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
    const page = await fleet.api<PageRead>(
      `/api/instances/${id}/transcript?limit=250&before=${encodeURIComponent(cursor)}`
    );
    rows += page.blocks.length;
    pages += 1;
    ({ cursor } = page);
  }
  return { rows, pages, busy: newest.tail?.busy === true };
};

interface Read {
  at: number;
  older: boolean;
  status?: number;
}
/** `holding`: the pages' sockets are refused; `failing`: the long session's next newest reads answer 500. */
const wire: { failing: number; holding: boolean; reads: Read[] } = {
  failing: 0,
  holding: false,
  reads: [],
};
const logs: string[] = [];
const wellLogs: string[] = [];
let sessionId = "";
let dashboard: ReturnType<typeof Bun.spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

interface Strip {
  /** Its lines as laid out, and whether the machine's name stands on one. */
  lines: number;
  nameWhole: boolean;
  retry: boolean;
  text: string;
}
interface Place {
  first?: { row: string; y: number };
  height: number;
  rows: string[];
  strip: Strip | null;
}
/** The rows in view, top to bottom, the first one's distance from the view's top, and the pane's line. */
const place = (page: Page): Promise<Place> =>
  page.evaluate((behind) => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    if (!scroller) {
      return { rows: [], height: 0, strip: null };
    }
    const box = scroller.getBoundingClientRect();
    const tops = new Map<string, number>();
    const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      // biome-ignore lint/performance/useTopLevelRegex: this function runs in the page, serialized: nothing outside it reaches there
      const row = node.textContent?.match(/row-(\d{4})/)?.[1];
      if (!row || tops.has(row)) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.height > 0 && rect.top >= box.top && rect.bottom <= box.bottom) {
        tops.set(row, rect.top - box.top);
      }
    }
    const rows = [...tops.entries()].sort((a, b) => a[1] - b[1]);
    const line = [
      ...scroller.querySelectorAll<HTMLElement>(".behind[role=status]"),
    ].find((node) => node.textContent?.trim().startsWith(behind));
    const words = line?.querySelector("p");
    let strip: Strip | null = null;
    if (line && words) {
      const range = document.createRange();
      range.selectNodeContents(words);
      const lines = new Set(
        [...range.getClientRects()].map((rect) => Math.round(rect.top))
      ).size;
      const name = words.querySelector(".name");
      strip = {
        text: words.textContent?.replace(/\s+/g, " ").trim() ?? "",
        lines,
        nameWhole: !name || name.getClientRects().length === 1,
        retry: [...line.querySelectorAll("button")].some(
          (button) => button.textContent?.trim() === "Try again"
        ),
      };
    }
    return {
      first: rows[0] ? { row: rows[0][0], y: rows[0][1] } : undefined,
      rows: rows.map(([row]) => row),
      height: scroller.scrollHeight,
      strip,
    };
  }, BEHIND);

/** The delegate's well on its parent's page: whether its rows are drawn, and its line. */
const well = (page: Page) =>
  page.evaluate((behind) => {
    const inner = [...document.querySelectorAll<HTMLElement>(".inner")].find(
      (node) => node.textContent?.includes("Done.")
    );
    const line = inner
      ? [...inner.querySelectorAll<HTMLElement>("[role=status]")]
          .map((node) => node.textContent?.replace(/\s+/g, " ").trim() ?? "")
          .find((text) => text.startsWith(behind))
      : undefined;
    return { drawn: inner !== undefined, strip: line ?? null };
  }, BEHIND);

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  sessionId = await fleet.spawn("claude", "Catch-up probe");
  await fleet.send(sessionId, `${MARK}: print the rows.`);
  // The second session starts one of its own, whose card opens on a well.
  const parentId = await fleet.spawn("claude", "Starting probe");
  await fleet.send(parentId, `${DELEG}: start a session.`);
  const parentBlocks = () =>
    fleet
      .api<PageRead>(`/api/instances/${parentId}/transcript`)
      .then((read) => read.blocks);
  const delegateId = await until(
    "the session started",
    async () =>
      (await parentBlocks()).find((block) => block.metadata?.delegateInstanceId)
        ?.metadata?.delegateInstanceId,
    Boolean,
    5 * 60_000
  ).catch(() => undefined);
  const answered = delegateId
    ? await until(
        "the started session answered",
        async () =>
          (
            await fleet.api<PageRead>(`/api/instances/${delegateId}/transcript`)
          ).blocks.some(
            (block) =>
              block.type === "assistant" && block.content?.includes("Done.")
          ),
        Boolean,
        5 * 60_000
      ).catch(() => false)
    : false;
  check(
    "a started session answers, for a card with a well",
    answered,
    delegateId
      ? `session ${delegateId.slice(0, 8)} ${answered ? "answered" : "never answered"}`
      : `no card in the starting session's transcript: ${(
          await parentBlocks().catch(() => [])
        )
          .map((block) =>
            block.type === "tool.handoff"
              ? JSON.stringify(block.metadata).slice(0, 1200)
              : block.type
          )
          .join(" | ")}`
  );
  const seeded = await until(
    `${ROWS} rows in the session`,
    () => walk(sessionId),
    (now) => now.rows >= ROWS && !now.busy,
    40 * 60_000
  );
  console.log(`  seeded: ${seeded.rows} rows in ${seeded.pages} hub pages`);

  // ── 2. The built dashboard, against the scratch hub ────────────────────
  const port = Number(new URL(fleet.base).port) + 7;
  const base = `http://127.0.0.1:${port}`;
  dashboard = Bun.spawn(
    [
      "bunx",
      "vite",
      "preview",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: dashboardDir,
      env: {
        ...process.env,
        CAWCO_DEV_HUB_URL: fleet.base,
        CAWCO_HUB_URL: fleet.base,
        CAWCO_PREVIEW_PORT: fleet.env.CAWCO_PREVIEW_PORT,
      },
      stdout: Bun.file(join(fleet.sandbox, "dashboard.log")),
      stderr: Bun.file(join(fleet.sandbox, "dashboard.err")),
    }
  );
  await until(
    "the dashboard answering",
    () => fetch(base).then((r) => r.ok),
    Boolean,
    60_000
  );
  console.log(`… dashboard (vite preview) on ${base}`);

  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  /** A page whose socket to the hub is held off while `holding`: it reconnects only once let through. */
  const opened = async (id: string, heard: string[]) => {
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.text().startsWith("[cawco] read ")) {
        heard.push(message.text());
      }
    });
    await page.routeWebSocket(HUB_SOCKET, (ws) => {
      if (wire.holding) {
        ws.close({ code: 1013, reason: "held" });
        return;
      }
      ws.connectToServer();
    });
    await page.goto(`${base}/session/${id}`, {
      waitUntil: "domcontentloaded",
    });
    return page;
  };
  const transcriptPath = () => `/api/instances/${sessionId}/transcript`;
  const page = await opened(sessionId, logs);
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname === transcriptPath()) {
      wire.reads.push({
        at: Date.now(),
        older: url.searchParams.has("before"),
        status: response.status(),
      });
    }
  });
  // The hub's read failing, as its route answers a failed history read.
  await page.route(`**${transcriptPath()}`, (route) => {
    const url = new URL(route.request().url());
    if (wire.failing > 0 && !url.searchParams.has("before")) {
      wire.failing -= 1;
      return route.fulfill({
        status: 500,
        contentType: "text/plain",
        body: FAILED,
      });
    }
    return route.continue();
  });
  await until(
    "the session's rows on screen",
    () => place(page),
    (shown) => shown.first !== undefined,
    120_000
  );

  // The delegate's card, open on its well, on the delegating session's page.
  const parentPage = await opened(parentId, wellLogs);
  let wellOpen = false;
  if (delegateId) {
    // The card's own head in the transcript (Delegate.svelte `.bhead`), not
    // the session's row in the sidebar, which bears the same title.
    await parentPage
      .locator('[aria-label="Session transcript"] .bhead')
      .first()
      .click({ timeout: 60_000 })
      .catch(() => undefined);
    wellOpen = await until(
      "the delegate's well drawn",
      () => well(parentPage),
      (shown) => shown.drawn,
      60_000
    )
      .then(() => true)
      .catch(() => false);
  }
  check(
    "the delegate's card opens on its well",
    wellOpen,
    wellOpen ? "its rows drawn" : "no well with the delegate's rows"
  );
  await page.bringToFront();
  await pause(3000);

  // ── 3. Up three older pages ────────────────────────────────────────────
  const scroller = page.locator('[aria-label="Session transcript"]');
  const area = await scroller.boundingBox();
  if (!area) {
    throw new Error("no transcript scroller on the page");
  }
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  for (let wheel = 0; wheel < 400; wheel += 1) {
    if (wire.reads.filter((read) => read.older).length >= 3) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: each wheel starts where the last one left the list
    await page.mouse.wheel(0, -600);
    await pause(120);
  }
  await page.mouse.wheel(0, -600);
  await pause(3000);
  let at = await place(page);
  console.log(
    `  scrolled up: ${wire.reads.filter((read) => read.older).length} older page(s) read; first row in view row-${at.first?.row} at y ${at.first?.y}, scroll height ${at.height}`
  );
  await page.screenshot({ path: join(out, "scrolled.png") });

  const held = (label: string, before: Place, after: Place) =>
    check(
      label,
      after.first?.row === before.first?.row &&
        Math.abs((after.first?.y ?? 0) - (before.first?.y ?? 0)) < 2 &&
        after.rows.join() === before.rows.join(),
      `before row-${before.first?.row} at y ${before.first?.y?.toFixed(1)} (${before.rows.length} rows, height ${before.height}), after row-${after.first?.row} at y ${after.first?.y?.toFixed(1)} (${after.rows.length} rows, height ${after.height})`
    );
  const newestSince = (from: number) =>
    wire.reads.slice(from).filter((read) => !read.older);

  /** The session speaks, so the page's place in its stream is past what a restarted hub's empty ring starts at: its resume is a reset. */
  const speak = async (label: string, id = sessionId) => {
    const spoken = (await walk(id)).rows;
    await fleet.send(id, "One more line.");
    await until(
      `${label}: the session spoke`,
      () => walk(id),
      (now) => now.rows > spoken && !now.busy,
      120_000
    );
  };
  /** The hub restarted under the pages, their sockets held off until it is up (and the agent too, unless it is away). */
  const restart = async (agentAway: boolean) => {
    wire.holding = true;
    if (agentAway) {
      await fleet.stop("agent");
    }
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    if (!agentAway) {
      await fleet.agentUp();
    }
    wire.holding = false;
    // The dashboard's own wake: a network back is a reconnect now.
    for (const one of [page, parentPage]) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time
      await one.evaluate(() => window.dispatchEvent(new Event("online")));
    }
  };

  // ── 4a. A reset over the rows ──────────────────────────────────────────
  {
    await speak("reset");
    await pause(3000);
    const before = await place(page);
    const from = wire.reads.length;
    const logsFrom = logs.length;
    await restart(false);
    await until(
      "reset: the newest page read again",
      () => Promise.resolve(newestSince(from).length),
      (count) => count >= 1,
      60_000
    ).catch(() => 0);
    await pause(5000);
    const after = await place(page);
    const older = wire.reads.slice(from).filter((read) => read.older);
    console.log(
      `  reset: ${newestSince(from).length} newest and ${older.length} older read(s); ${logs.slice(logsFrom).join(" | ")}`
    );
    held("reset: the rows stay and the place holds", before, after);
    check(
      "reset: no older page is read again",
      older.length === 0,
      `${older.length} older page read(s)`
    );
    at = after;
  }

  // ── 4b. The hub fails the read ─────────────────────────────────────────
  {
    await speak("5xx");
    await pause(3000);
    const before = await place(page);
    const from = wire.reads.length;
    const logsFrom = logs.length;
    wire.failing = 1;
    await restart(false);
    await until(
      "5xx: the read failed",
      () => Promise.resolve(newestSince(from).some((r) => r.status === 500)),
      Boolean,
      60_000
    ).catch(() => false);
    await pause(3000);
    const failed = await place(page);
    await page.screenshot({ path: join(out, "5xx.png") });
    held("5xx: the rows stay and the place holds", before, failed);
    check(
      "5xx: the pane says why, with Try again",
      failed.strip?.text === `${BEHIND}${FAILED}.` && failed.strip.retry,
      failed.strip
        ? `"${failed.strip.text}"${failed.strip.retry ? " [Try again]" : " (no Try again)"}, ${failed.strip.lines} line(s)`
        : "no line in the pane"
    );
    // Try again reads again: the hub fails it once more, and the line stays.
    wire.failing = 1;
    const retriedFrom = wire.reads.length;
    await page
      .locator(".behind button", { hasText: "Try again" })
      .click({ timeout: 10_000 })
      .catch(() => undefined);
    const retried = await until(
      "5xx: Try again read again",
      () =>
        Promise.resolve(
          newestSince(retriedFrom).some((read) => read.status === 500)
        ),
      Boolean,
      15_000
    ).catch(() => false);
    await pause(1500);
    const still = await place(page);
    check(
      "5xx: Try again reads again",
      retried && still.strip !== null,
      `${newestSince(retriedFrom).length} newest read(s) after the press (${newestSince(
        retriedFrom
      )
        .map((read) => read.status)
        .join(",")}); line ${still.strip ? "still there" : "gone"}`
    );
    // The session's next frame reads it again, and this time the hub answers.
    await fleet.send(sessionId, "One more line.");
    const caught = await until(
      "5xx: read again on the session's next frame",
      () =>
        Promise.resolve(
          logs.slice(logsFrom).some((line) => line.includes("because frame"))
        ),
      Boolean,
      60_000
    ).catch(() => false);
    check(
      "5xx: read again on the session's next frame",
      caught,
      caught ? "read because frame" : "no read followed the session's frames"
    );
    const gone = await until(
      "5xx: the line goes",
      () => place(page),
      (now) => now.strip === null,
      30_000
    ).catch(() => undefined);
    check(
      "5xx: the line goes once the read lands",
      gone !== undefined,
      gone ? "no longer in the pane" : "still in the pane after 30s"
    );
    await pause(4000);
    const after = await place(page);
    console.log(
      `  5xx: newest reads ${newestSince(from)
        .map((read) => read.status)
        .join(
          ","
        )}, ${wire.reads.slice(from).filter((read) => read.older).length} older; ${logs.slice(logsFrom).join(" | ")}`
    );
    held("5xx: the rows stay and the place holds after", before, after);
    at = after;
  }

  // ── 4c. The machine offline ────────────────────────────────────────────
  {
    await speak("offline");
    // The card's session speaks too, so its resume after the restart is a
    // reset and its well is read again over the rows it holds.
    if (delegateId) {
      await speak("offline: the card's session", delegateId);
    }
    await pause(3000);
    let before = await place(page);
    const from = wire.reads.length;
    const logsFrom = logs.length;
    const wellFrom = wellLogs.length;
    await restart(true);
    await until(
      "offline: the read found the machine offline",
      () => Promise.resolve(newestSince(from).some((r) => r.status === 503)),
      Boolean,
      60_000
    ).catch(() => false);
    await pause(3000);
    const away = await place(page);
    await page.screenshot({ path: join(out, "offline-1440.png") });
    held(
      "offline: the rows stay and the place hold while the machine is offline",
      before,
      away
    );
    check(
      "offline: the pane says it is not caught up, and what comes next, on one line at 1440",
      away.strip?.text.startsWith(BEHIND) === true &&
        away.strip.text.endsWith(OFFLINE_NEXT) &&
        away.strip.lines === 1 &&
        !away.strip.retry,
      away.strip
        ? `"${away.strip.text}", ${away.strip.lines} line(s)`
        : "no line in the pane"
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await pause(2000);
    const narrow = await place(page);
    await page.screenshot({ path: join(out, "offline-390.png") });
    check(
      "offline: at 390 the line wraps to at most two, the machine's name whole",
      narrow.strip !== null &&
        narrow.strip.lines <= 2 &&
        narrow.strip.nameWhole,
      narrow.strip
        ? `${narrow.strip.lines} line(s), name ${narrow.strip.nameWhole ? "whole" : "split"}`
        : "no line in the pane at 390"
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await pause(3000);
    // The place as the reader has it again at 1440, what the read must keep.
    before = await place(page);
    await parentPage.bringToFront();
    await pause(1500);
    const wellAway = await well(parentPage);
    await parentPage.screenshot({ path: join(out, "offline-well.png") });
    check(
      "offline: the delegate's well says it is not caught up over its rows",
      wellAway.drawn && wellAway.strip?.endsWith(OFFLINE_NEXT) === true,
      wellAway.strip
        ? `"${wellAway.strip}"`
        : `no line in the well (${wellAway.drawn ? "rows drawn" : "no rows"})`
    );
    await page.bringToFront();
    fleet.launch("agent");
    await fleet.agentUp();
    const caught = await until(
      "offline: read again once the machine is online",
      () =>
        Promise.resolve(
          logs.slice(logsFrom).some((line) => line.includes("machineOnline"))
        ),
      Boolean,
      60_000
    ).catch(() => false);
    check(
      "offline: read again once the hub says the machine is online",
      caught,
      caught ? "read because machineOnline" : "no read followed the machine"
    );
    const gone = await until(
      "offline: the line goes",
      () => place(page),
      (now) => now.strip === null,
      30_000
    ).catch(() => undefined);
    check(
      "offline: the line goes once the read lands",
      gone !== undefined,
      gone ? "no longer in the pane" : "still in the pane after 30s"
    );
    const wellBack = await until(
      "offline: the well's line goes",
      () => well(parentPage),
      (now) => now.drawn && now.strip === null,
      30_000
    ).catch(() => undefined);
    check(
      "offline: the well's line goes, its rows drawn",
      wellBack !== undefined,
      wellBack
        ? `well read again: ${wellLogs.slice(wellFrom).join(" | ")}`
        : "still in the well after 30s"
    );
    await pause(5000);
    const after = await place(page);
    await page.screenshot({ path: join(out, "offline-after.png") });
    console.log(
      `  offline: newest reads ${newestSince(from)
        .map((read) => read.status)
        .join(
          ","
        )}, ${wire.reads.slice(from).filter((read) => read.older).length} older; ${logs.slice(logsFrom).join(" | ")}`
    );
    held("offline: the rows stay and the place holds", before, after);
    check(
      "offline: no older page is read again",
      wire.reads.slice(from).filter((read) => read.older).length === 0,
      `${wire.reads.slice(from).filter((read) => read.older).length} older page read(s)`
    );
    at = after;
  }
  console.log(`  last place: row-${at.first?.row} at y ${at.first?.y}`);
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  await writeFile(join(out, "reads.json"), JSON.stringify(wire.reads));
  await browser?.close();
  dashboard?.kill();
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(`Captures: ${out}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
