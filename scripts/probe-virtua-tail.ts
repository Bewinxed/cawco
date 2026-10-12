#!/usr/bin/env bun
/**
 * Web transcript list probe: virtua's list keeps a whole, finite layout while
 * its tail grows and settles, and while the reader pages up to the start and
 * jumps back to the latest row.
 *
 *   bun scripts/probe-virtua-tail.ts [--rows <n>] [--turns <n>] [--burst <n>] [--no-scroll] [--serve <stop file>] [--dashboard <dir>] [--label <name>] [--keep]
 *
 * Run from the repo root after `bunx vite build` in the dashboard it serves
 * (`--dashboard`, default this checkout's apps/dashboard). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) and seeds one session with
 *     `--rows` Bash calls (default 820: the newest page and older ones);
 *  2. serves the built dashboard with `vite preview` against the scratch hub
 *     and opens the session in Chromium (playwright-core), watching every
 *     frame for an element whose style carries `NaN`, a blank stretch of the
 *     view between drawn rows, and every page error;
 *  3. unless `--no-scroll`: wheels up until the conversation's first row is
 *     drawn, checking each wheel moved the rows by the wheel's distance, then
 *     jumps to latest, checking the view only ever moves down and ends on the
 *     newest row;
 *  4. sends `--turns` messages (default 4) at the tail; each answer is three
 *     tool calls and a streamed reply, so the tail grows by the sent row and
 *     the live rows, and shrinks as they settle into the turn's rows.
 *
 * With `--burst <n>`, before that walk: `n` wheels up from the tail inside
 * 300ms while older pages land, the row first in view followed on every
 * painted frame: every frame moves it by whole wheels, never back, and the
 * burst by all of them.
 *
 * Checks: no `NaN` style and no page error at any point; no blank stretch
 * over 4px; wheels move rows by the wheel's distance within 2px; the jump to
 * latest never moves up and ends with the newest row in view; each turn's
 * reply drawn.
 *
 * Captures go to $TMPDIR/virtua-tail/<label>/ (or .probe/ outside a
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
const scroll = !args.includes("--no-scroll");
/** `--serve <stop file>`: seed, then hold the fleet up until the file exists. */
const serve = option("--serve");
const ROWS = Number(option("--rows") ?? 820);
const TURNS = Number(option("--turns") ?? 4);
/**
 * `--burst <n>`: from the tail, `n` wheels up inside 300ms before the walk to
 * the first row, with the anchor row followed on every painted frame.
 */
const BURST = Number(option("--burst") ?? 0);
const LABEL = option("--label") ?? "run";
const WHEEL = 600;
const root = resolve(import.meta.dir, "..");
const dashboardDir = resolve(
  option("--dashboard") ?? join(root, "apps", "dashboard")
);
const out = join(
  process.env.CAWCO_WORKSPACE && process.env.TMPDIR
    ? join(process.env.TMPDIR, "virtua-tail")
    : join(root, ".probe", "virtua-tail"),
  LABEL
);
await mkdir(out, { recursive: true });
const virtua = (
  await Bun.file(
    join(dashboardDir, "node_modules", "virtua", "package.json")
  ).json()
).version;
console.log(
  `  at ${(await Bun.$`git -C ${dashboardDir} log -1 --format=%h\ %s`.text()).trim()}; virtua ${virtua}`
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
const MARK = `tail probe ${crypto.randomUUID().slice(0, 6)}`;
const TURN = /tail-turn-(\d+)/g;
let calls = 0;
const turnCalls = new Map<string, number>();
const respond = (request: Seen): Reply => {
  const turn = [...request.all.matchAll(TURN)].at(-1)?.[1];
  if (turn !== undefined && request.tools) {
    const done = turnCalls.get(turn) ?? 0;
    if (done < 3) {
      turnCalls.set(turn, done + 1);
      return {
        everyMs: 1,
        words: [],
        tool: {
          name: "Bash",
          input: {
            command: `echo turn-${turn}-call-${done}`,
            description: `Turn ${turn} call ${done}`,
          },
        },
      };
    }
    return {
      everyMs: 25,
      words:
        `Reply ${turn} streams in a few dozen words so the live row grows over several frames before it settles into the turn's own row at the tail of the list, where everything moves.`
          .split(" ")
          .map((word) => `${word} `),
    };
  }
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
const fleet = await scratchFleet({ name: "probe-virtua-tail", respond });

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

/**
 * Installed before the page's own scripts: every element style with `NaN`
 * in it, every error the page raises, and, each frame as it was painted, the
 * widest blank stretch of the view between the list's drawn items and where
 * the anchor row (`anchor`, its text) stands in the view. A frame is read
 * after its paint (a task behind the frame's `requestAnimationFrame`): read
 * inside that callback, it is the layout before the frame's ResizeObserver
 * delivery, where virtua writes its scroll corrections.
 */
interface Probe {
  anchor: string | null;
  anchorYs: [number, number | null][];
  errors: string[];
  frames: number;
  gap: { px: number; at: number; top: number };
  nan: string[];
  sampling: boolean;
  tops: number[];
}
const WATCH = () => {
  const w = window as unknown as { __probe: Probe };
  const probe: Probe = {
    anchor: null,
    anchorYs: [],
    errors: [],
    nan: [],
    gap: { px: 0, at: 0, top: 0 },
    frames: 0,
    tops: [],
    sampling: false,
  };
  w.__probe = probe;
  addEventListener(
    "error",
    (event) => probe.errors.push(`error: ${event.message}`),
    true
  );
  addEventListener("unhandledrejection", (event) =>
    probe.errors.push(`rejection: ${String(event.reason)}`)
  );
  new MutationObserver((records) => {
    for (const record of records) {
      const style = (record.target as Element).getAttribute?.("style") ?? "";
      if (style.includes("NaN")) {
        probe.nan.push(
          `${(record.target as Element).className || (record.target as Element).tagName}: ${style}`
        );
      }
    }
  }).observe(document, {
    attributes: true,
    attributeFilter: ["style"],
    subtree: true,
  });
  const frame = () => {
    probe.frames += 1;
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    const container = document.querySelector<HTMLElement>(
      ".listing.shown > :first-child"
    );
    if (scroller && container) {
      if (probe.sampling) {
        probe.tops.push(scroller.scrollTop);
      }
      const view = scroller.getBoundingClientRect();
      const list = container.getBoundingClientRect();
      const from = Math.max(view.top, list.top);
      const to = Math.min(view.bottom, list.bottom);
      const spans = [...container.children]
        .map((item) => item.getBoundingClientRect())
        .filter(
          (rect) => rect.height > 0 && rect.bottom > from && rect.top < to
        )
        .map((rect) => [rect.top, rect.bottom] as const)
        .sort((a, b) => a[0] - b[0]);
      let reach = from;
      let widest = 0;
      for (const [top, bottom] of spans) {
        widest = Math.max(widest, top - reach);
        reach = Math.max(reach, bottom);
      }
      if (to > from) {
        widest = Math.max(widest, to - reach);
      }
      if (widest > probe.gap.px) {
        probe.gap = {
          px: widest,
          at: performance.now(),
          top: scroller.scrollTop,
        };
      }
      if (probe.anchor) {
        probe.anchorYs.push([
          performance.now(),
          anchorY(scroller, probe.anchor, view.top),
        ]);
      }
    }
    requestAnimationFrame(painted);
  };
  /** Where the first leaf holding `text` stands below `top`, or null when none is drawn. */
  function anchorY(
    scroller: HTMLElement,
    text: string,
    top: number
  ): number | null {
    for (const node of scroller.querySelectorAll("*")) {
      if (node.children.length === 0 && node.textContent?.includes(text)) {
        return node.getBoundingClientRect().top - top;
      }
    }
    return null;
  }
  const channel = new MessageChannel();
  channel.port1.onmessage = frame;
  const painted = () => channel.port2.postMessage(0);
  requestAnimationFrame(painted);
};

const watched = (page: Page): Promise<Probe> =>
  page.evaluate(
    () => (window as unknown as { __probe: Probe }).__probe
  ) as Promise<Probe>;

/** The topmost `row-NNNN` (or other marker) fully in view, and its y. */
const firstRow = (page: Page) =>
  page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    if (!scroller) {
      return null;
    }
    const box = scroller.getBoundingClientRect();
    let best: { row: string; y: number } | null = null;
    const seen = new Set<string>();
    const all: string[] = [];
    const walker = document.createTreeWalker(scroller, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const row = node.textContent?.match(
        // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
        /(row-\d{4}|turn-\d+-call-\d|Reply \d+)/
      )?.[1];
      if (!row || seen.has(row)) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.height > 0 && rect.top >= box.top && rect.bottom <= box.bottom) {
        seen.add(row);
        all.push(row);
        if (!best || rect.top - box.top < best.y) {
          best = { row, y: rect.top - box.top };
        }
      }
    }
    return { first: best, rows: all, scrollTop: scroller.scrollTop };
  });

/** Where a given marker's text stands in the view, or null when not drawn there. */
const yOf = (page: Page, row: string) =>
  page.evaluate((wanted) => {
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    if (!scroller) {
      return null;
    }
    const box = scroller.getBoundingClientRect();
    // The innermost element holding the whole text: streamed words can stand
    // in a text node each.
    let found: Element | null = null;
    for (const element of scroller.querySelectorAll("*")) {
      if (
        element.textContent?.includes(wanted) &&
        (!found || found.contains(element))
      ) {
        found = element;
      }
    }
    const rect = found?.getBoundingClientRect();
    return rect && rect.height > 0 ? rect.top - box.top : null;
  }, row);

let dashboard: ReturnType<typeof Bun.spawn> | undefined;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const pageErrors: string[] = [];
const consoleErrors: string[] = [];
const failedLoads: string[] = [];

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const sessionId = await fleet.spawn("claude", "Tail probe");
  await fleet.send(sessionId, `${MARK}: print the rows.`);
  const seeded = await until(
    `${ROWS} rows in the session`,
    () => walk(sessionId),
    (held) => held.rows >= ROWS && !held.busy,
    40 * 60_000
  );
  console.log(`  seeded: ${seeded.rows} rows in ${seeded.pages} hub pages`);
  if (serve) {
    // The fleet stays up for a dashboard served by hand, until the stop
    // file appears.
    console.log(
      `  serving: session ${sessionId}; CAWCO_DEV_HUB_URL=${fleet.base} CAWCO_PREVIEW_PORT=${fleet.env.CAWCO_PREVIEW_PORT}; touch ${serve} to stop`
    );
    await until(
      "the stop file",
      () => Bun.file(serve).exists(),
      Boolean,
      12 * 60 * 60_000
    );
    throw new Error("served, stopped by hand");
  }

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
  await context.addInitScript(WATCH);
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  // A failed load is reported by the response, with its URL: the console's
  // own line for it names none.
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().startsWith("Failed to load resource")
    ) {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failedLoads.push(
        `${response.status()} ${new URL(response.url()).pathname}`
      );
    }
  });
  await page.goto(`${base}/session/${sessionId}`, {
    waitUntil: "domcontentloaded",
  });
  await until(
    "the session's rows on screen",
    () => firstRow(page),
    (shown) => !!shown?.first,
    120_000
  );
  await pause(3000);

  // ── 3. Up to the first row, then back to the latest ────────────────────
  if (scroll) {
    const scroller = page.locator('[aria-label="Session transcript"]');
    const area = await scroller.boundingBox();
    if (!area) {
      throw new Error("no transcript scroller on the page");
    }
    await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
    if (BURST > 0) {
      const anchor = (await firstRow(page))?.first?.row ?? null;
      await page.evaluate((row) => {
        const probe = (window as unknown as { __probe: Probe }).__probe;
        probe.anchor = row;
        probe.anchorYs = [];
      }, anchor);
      // Sent straight to the browser on a timer, none waiting for the one
      // before it to be handled: Playwright's own wheel waits for each, which
      // spaces them by whatever a frame costs.
      const input = await context.newCDPSession(page);
      const started = performance.now();
      let sent = 0;
      await Promise.all(
        Array.from(
          { length: BURST },
          (_, wheel) =>
            new Promise<void>((done, fail) => {
              setTimeout(
                () => {
                  sent = performance.now();
                  input
                    .send("Input.dispatchMouseEvent", {
                      type: "mouseWheel",
                      x: area.x + area.width / 2,
                      y: area.y + area.height / 2,
                      deltaX: 0,
                      deltaY: -WHEEL,
                    })
                    .then(() => done(), fail);
                },
                (wheel * 300) / BURST
              );
            })
        )
      );
      const took = sent - started;
      await pause(4000);
      const ys = await page.evaluate(() => {
        const probe = (window as unknown as { __probe: Probe }).__probe;
        probe.anchor = null;
        return probe.anchorYs;
      });
      const seen = ys.filter(([, y]) => y !== null) as [number, number][];
      await writeFile(join(out, "burst.json"), JSON.stringify(ys));
      // Wheels that land while a page is being drawn are applied together in
      // the next frame, so a frame can move the row by several. What it can
      // never do is move it by anything but whole wheels, or back: a page put
      // in front without its height taken up moves the row by the page.
      const off: string[] = [];
      let widest = 0;
      let wheelsIn = 0;
      for (let i = 0; i < seen.length; i += 1) {
        const moved = seen[i][1] - seen[0][1];
        const whole = Math.round(moved / WHEEL);
        const step = i > 0 ? seen[i][1] - seen[i - 1][1] : 0;
        widest = Math.max(widest, Math.abs(step));
        if (
          Math.abs(moved - whole * WHEEL) > 2 ||
          whole < wheelsIn ||
          whole > BURST
        ) {
          off.push(`frame ${i}: moved ${moved.toFixed(1)}`);
        }
        wheelsIn = Math.max(wheelsIn, whole);
      }
      const ended = (seen.at(-1)?.[1] ?? 0) - (seen[0]?.[1] ?? 0);
      check(
        `${BURST} wheels in ${took.toFixed(0)}ms: ${anchor} moves by whole wheels on every painted frame, never back, ${BURST} in all`,
        off.length === 0 &&
          seen.length > 1 &&
          Math.abs(ended - BURST * WHEEL) <= 2,
        `${seen.length} painted frames with it drawn (${ys.length - seen.length} without), widest step ${widest.toFixed(1)}px (${(widest / WHEEL).toFixed(2)} wheels), moved ${ended.toFixed(1)}px${off.length ? `; off: ${off.slice(0, 5).join(", ")}` : ""}`
      );
    }
    const misses: string[] = [];
    let wheels = 0;
    let measured = 0;
    for (; wheels < 800; wheels += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: each wheel starts where the last one left the list
      const before = await firstRow(page);
      if (before?.rows.includes("row-0001") && before.scrollTop <= 1) {
        break;
      }
      await page.mouse.wheel(0, -WHEEL);
      await pause(250);
      const anchor = before?.first;
      const after = await firstRow(page);
      if (!(anchor && after)) {
        continue;
      }
      // A wheel that met the top of the scroller moves by less: only a
      // wheel the scroller had room for is held to its distance.
      if (before.scrollTop < WHEEL + 1) {
        continue;
      }
      const y = await yOf(page, anchor.row);
      if (y === null) {
        continue;
      }
      measured += 1;
      const moved = y - anchor.y;
      console.log(
        `  wheel ${wheels + 1}: scrollTop ${before.scrollTop.toFixed(0)} → ${after.scrollTop.toFixed(0)}, top row ${anchor.row} → ${after.first?.row}, ${anchor.row} moved ${moved.toFixed(1)}`
      );
      if (Math.abs(moved - WHEEL) > 2) {
        misses.push(`${anchor.row} moved ${moved.toFixed(1)}`);
      }
    }
    await pause(1500);
    const opening = await firstRow(page);
    await page.screenshot({ path: join(out, "top.png") });
    check(
      "scrolled to the conversation's first row",
      opening?.rows.includes("row-0001") === true,
      `${wheels} wheels; first row in view ${opening?.first?.row}, scrollTop ${opening?.scrollTop}`
    );
    check(
      "every wheel moved the rows by its distance",
      misses.length === 0,
      `${measured} wheels measured, ${misses.length} off: ${misses.slice(0, 8).join("; ")}`
    );
    const upGap = (await watched(page)).gap;
    check(
      "no blank stretch in view while paging up",
      upGap.px <= 4,
      `widest ${upGap.px.toFixed(1)}px at scrollTop ${upGap.top}`
    );

    await page.evaluate(() => {
      const probe = (window as unknown as { __probe: Probe }).__probe;
      probe.tops = [];
      probe.sampling = true;
      probe.gap = { px: 0, at: 0, top: 0 };
    });
    await page.getByRole("button", { name: "Jump to latest" }).click();
    await pause(4000);
    const glide = await page.evaluate(() => {
      const probe = (window as unknown as { __probe: Probe }).__probe;
      probe.sampling = false;
      return { tops: probe.tops, gap: probe.gap };
    });
    const back = glide.tops.filter(
      (top, i) => i > 0 && top < glide.tops[i - 1] - 0.5
    );
    const bottom = await firstRow(page);
    await page.screenshot({ path: join(out, "latest.png") });
    check(
      "the jump to latest only moves down",
      back.length === 0,
      `${glide.tops.length} frames, scrollTop ${glide.tops[0]?.toFixed(0)} → ${glide.tops.at(-1)?.toFixed(0)}, ${back.length} frame(s) moved up`
    );
    check(
      "no blank stretch in view during the jump",
      glide.gap.px <= 4,
      `widest ${glide.gap.px.toFixed(1)}px at scrollTop ${glide.gap.top}`
    );
    const newest = `row-${String(ROWS).padStart(4, "0")}`;
    check(
      "the jump ends on the newest rows",
      bottom?.rows.includes(newest) === true,
      `rows in view ${bottom?.rows.slice(0, 3).join(",")}…${bottom?.rows.slice(-3).join(",")}`
    );
  }

  // ── 4. Turns at the tail: grow, then settle ────────────────────────────
  for (let turn = 1; turn <= TURNS; turn += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one turn at a time, each at the tail the last left
    const spoken = (await walk(sessionId)).rows;
    const field = page.locator("textarea:visible").first();
    await field.fill(`tail-turn-${turn}: one more turn.`);
    await field.press("Enter");
    await until(
      `turn ${turn} settled`,
      () => walk(sessionId),
      (held) => held.rows > spoken && !held.busy,
      120_000
    );
    await pause(2500);
    const drawn = await yOf(page, `Reply ${turn} streams`);
    check(
      `turn ${turn}: its reply is drawn`,
      drawn !== null,
      drawn === null ? "not in the list" : `at y ${drawn.toFixed(1)}`
    );
  }
  await page.screenshot({ path: join(out, "turns.png") });

  const seen = await watched(page);
  check(
    "no NaN in any style",
    seen.nan.length === 0,
    seen.nan.length === 0
      ? `${seen.frames} frames watched`
      : `${seen.nan.length}: ${seen.nan.slice(0, 3).join(" | ")}`
  );
  const errors = [...seen.errors, ...pageErrors, ...consoleErrors];
  check(
    "no page error",
    errors.length === 0,
    errors.length === 0
      ? "none"
      : `${errors.length}: ${errors.slice(0, 4).join(" | ")}`
  );
  console.log(
    `  failed loads: ${failedLoads.length === 0 ? "none" : [...new Set(failedLoads)].join(", ")}`
  );
  await writeFile(
    join(out, "watch.json"),
    JSON.stringify({ ...seen, pageErrors, consoleErrors, failedLoads }, null, 2)
  );
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  await browser?.close();
  dashboard?.kill();
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(`Captures: ${out}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
