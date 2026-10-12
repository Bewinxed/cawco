#!/usr/bin/env bun
/**
 * Web transcript read-again probe: a re-read never takes away the rows a
 * reader holds or moves their place, and while the transcript cannot be
 * caught up (its machine offline) the pane says so in one line until it can.
 * The web half of probe-ios-catchup.ts.
 *
 *   bun scripts/probe-web-catchup.ts [--rows <n>] [--dashboard <dir>] [--label <name>] [--keep]
 *
 * Run from the repo root after `bunx vite build` in the dashboard it serves
 * (`--dashboard`, default this checkout's apps/dashboard). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) and seeds one session with
 *     `--rows` rows (default 820: the newest page and four older ones), each
 *     a Bash call;
 *  2. serves the built dashboard with `vite preview` against the scratch hub,
 *     and opens the session in Chromium (playwright-core), counting every
 *     read of its transcript, newest or older;
 *  3. scrolls up until three older pages have been read;
 *  4. restarts the hub twice with the reader there, the browser's socket held
 *     off until the hub is up (the second time with the agent away, so the
 *     read again finds the machine offline): its resume meets a stream that
 *     starts again empty (`stream.reset`), and the newest page is read again.
 *
 * Checks: the rows in view and the first row's place hold within 2px across
 * each read again, and no older page is read again; with the agent away, the
 * rows hold while the pane says "Not caught up: <machine> is offline", and
 * the line goes, the rows intact, once the agent is back and the read lands.
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

// ── 1. The scratch fleet, its session seeded ─────────────────────────────
const MARK = `catchup probe ${crypto.randomUUID().slice(0, 6)}`;
let calls = 0;
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
  return { everyMs: 5, words: ["Done."] };
};
const fleet = await scratchFleet({ name: "probe-web-catchup", respond });

interface PageRead {
  blocks: { id: string }[];
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
const wire: { holding: boolean; reads: Read[] } = { holding: false, reads: [] };
const logs: string[] = [];
let sessionId = "";
let dashboard: ReturnType<typeof Bun.spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;

interface Place {
  first?: { row: string; y: number };
  height: number;
  rows: string[];
  strip: string | null;
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
    const strip =
      [...scroller.querySelectorAll<HTMLElement>("[role=status]")]
        .map((node) => node.textContent?.trim() ?? "")
        .find((text) => text.startsWith(behind)) ?? null;
    return {
      first: rows[0] ? { row: rows[0][0], y: rows[0][1] } : undefined,
      rows: rows.map(([row]) => row),
      height: scroller.scrollHeight,
      strip,
    };
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
  const seeded = await until(
    `${ROWS} rows in the session`,
    () => walk(sessionId),
    (held) => held.rows >= ROWS && !held.busy,
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
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.text().startsWith("[cawco] read ")) {
      logs.push(message.text());
    }
  });
  const transcriptPath = () => `/api/instances/${sessionId}/transcript`;
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
  // The page's socket to the hub, held off while `holding`: it reconnects
  // only once let through, after the hub is up again.
  await page.routeWebSocket(/\/ws\//, (ws) => {
    if (wire.holding) {
      ws.close({ code: 1013, reason: "held" });
      return;
    }
    ws.connectToServer();
  });
  await page.goto(`${base}/session/${sessionId}`, {
    waitUntil: "domcontentloaded",
  });
  await until(
    "the session's rows on screen",
    () => place(page),
    (shown) => shown.first !== undefined,
    120_000
  );
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

  const resetOver = async (label: string, agentAway: boolean) => {
    // The session speaks first, so the page's place in its stream is past
    // what a restarted hub's empty ring starts at: its resume is a reset.
    const spoken = (await walk(sessionId)).rows;
    await fleet.send(sessionId, "One more line.");
    await until(
      `${label}: the session spoke`,
      () => walk(sessionId),
      (held) => held.rows > spoken && !held.busy,
      120_000
    );
    await pause(3000);
    const before = await place(page);
    const readsBefore = wire.reads.length;
    const logsBefore = logs.length;
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
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    const newest = () =>
      wire.reads.slice(readsBefore).filter((read) => !read.older);
    await until(
      `${label}: the newest page read again`,
      () => Promise.resolve(newest().length),
      (count) => count >= 1,
      60_000
    ).catch(() => 0);
    if (agentAway) {
      await until(
        `${label}: the read found the machine offline`,
        () => Promise.resolve(newest().some((read) => read.status === 503)),
        Boolean,
        30_000
      ).catch(() => false);
      await pause(3000);
      const away = await place(page);
      await page.screenshot({ path: join(out, `${label}-away.png`) });
      check(
        `${label}: the rows stay and the place holds while the machine is offline`,
        away.first?.row === before.first?.row &&
          Math.abs((away.first?.y ?? 0) - (before.first?.y ?? 0)) < 2 &&
          away.rows.join() === before.rows.join(),
        `row-${before.first?.row} at y ${before.first?.y?.toFixed(1)} (${before.rows.length} rows, height ${before.height}), then row-${away.first?.row} at y ${away.first?.y?.toFixed(1)} (${away.rows.length} rows, height ${away.height})`
      );
      check(
        `${label}: the pane says it is not caught up`,
        away.strip?.endsWith("is offline") === true,
        away.strip ? `"${away.strip}"` : "no line in the pane"
      );
      fleet.launch("agent");
      await fleet.agentUp();
      const caught = await until(
        `${label}: read again once the machine is online`,
        () =>
          Promise.resolve(
            logs
              .slice(logsBefore)
              .some((line) => line.includes("machineOnline"))
          ),
        Boolean,
        60_000
      ).catch(() => false);
      check(
        `${label}: read again once the hub says the machine is online`,
        caught,
        caught ? "read because machineOnline" : "no read followed the machine"
      );
      const gone = await until(
        `${label}: the line goes`,
        () => place(page),
        (now) => now.strip === null,
        30_000
      ).catch(() => undefined);
      check(
        `${label}: the line goes once the read lands`,
        gone !== undefined,
        gone ? "no longer in the pane" : "still in the pane after 30s"
      );
    }
    await pause(5000);
    const after = await place(page);
    await page.screenshot({ path: join(out, `${label}-after.png`) });
    const older = wire.reads.slice(readsBefore).filter((read) => read.older);
    console.log(
      `  ${label}: ${newest().length} newest (${newest()
        .map((read) => read.status)
        .join(
          ","
        )}) and ${older.length} older read(s); ${logs.slice(logsBefore).join(" | ")}`
    );
    check(
      `${label}: the rows stay and the place holds`,
      after.first?.row === before.first?.row &&
        Math.abs((after.first?.y ?? 0) - (before.first?.y ?? 0)) < 2 &&
        after.rows.join() === before.rows.join(),
      `before row-${before.first?.row} at y ${before.first?.y?.toFixed(1)} (${before.rows.length} rows, height ${before.height}), after row-${after.first?.row} at y ${after.first?.y?.toFixed(1)} (${after.rows.length} rows, height ${after.height})`
    );
    check(
      `${label}: no older page is read again`,
      older.length === 0,
      `${older.length} older page read(s)`
    );
    at = after;
  };
  await resetOver("reset", false);
  await resetOver("offline", true);
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
