#!/usr/bin/env bun
/**
 * Caw's open in WebKit: how smoothly his panel opens under a finger, frame
 * by frame, from the press until both of his head's clips have landed
 * (owner: "the pressing on caw is very laggy when it opens and not smooth").
 *
 *   bun scripts/probe-webkit-caw.ts [--runs 20] [--hog N] [--keep]
 *
 * Build the dashboard first (`bun run build` in apps/dashboard). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) whose machine landed a
 *     nightly with release notes, so Caw says "All caught up · 1 notice" and
 *     his panel holds the update alone, its notes open: the owner's panel;
 *  2. serves the production dashboard as its unit does (serve.js);
 *  3. opens it in Playwright's WebKit at 390×844, touch, 3x, a tapped button
 *     taking no focus (an iPhone's
 *     shape), and waits for Caw to read the notice;
 *  4. for each run: taps Caw (touch, so pointer events and a click, as a
 *     finger), records every requestAnimationFrame from the tap for 2.6 s
 *     (the open, his smile in and his smile out, both landed), and taps him
 *     again to close the panel, and waits for that press's smile to land;
 *  5. prints each run's frame count, longest interval, the intervals over
 *     25 ms (a 60 Hz frame and a half: a dropped frame) with when each
 *     started after the tap, and any `probe:` performance measure that
 *     overlaps one (a build instrumented by hand names its own work).
 *
 * `--hog N` throttles the CPU: WebKit has no CPU throttling of its own
 * (Chromium's DevTools `Emulation.setCPUThrottlingRate` has no WebKit
 * counterpart in Playwright), so the browser is launched pinned to one core
 * (`taskset -c 0`, inherited by its web process) with N busy loops pinned
 * beside it, which leaves it 1/(N+1) of that core.
 *
 * Exits 0 only when no interval in any run was over 25 ms.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { type Browser, type Page, webkit } from "playwright-core";
import { scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const option = (flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
const RUNS = Number(option("--runs") ?? 20);
const HOGS = Number(option("--hog") ?? 0);
const keep = args.includes("--keep");
/** A 60 Hz frame and a half: an interval past this lost a frame. */
const DROPPED_MS = 25;
/** How long each open is watched: the panel, his smile in and back out. */
const WATCH_MS = 2600;
/** How long after a close before the next open: his smile out has landed. */
const REST_MS = 2600;

const root = resolve(import.meta.dir, "..");
const out =
  process.env.TMPDIR ?? join(root, ".probe", `webkit-caw-${Date.now()}`);
await mkdir(out, { recursive: true });
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

const LANDED_VERSION = "0.2.0-nightly.2522+e3cbba1d";
const NOTES = [
  "### New",
  "",
  "- Caw's panel says what each notice is and what to do about it",
  "- Clear all in the Notices head",
  "- Moved logins name their provider and how many machines lack them",
  "- The update's notes fold in its row, open when it stands alone",
  "",
  "### Improved",
  "",
  "- Deny and Approve stand together, tinted by what they do",
  "- An ask leads with its project, and its machine by its mark",
  "",
  "### Fixed",
  "",
  '- "Sign in there" pointed at the wrong machine',
  "- Notices hid under the panel's foot",
].join("\n");
const SOURCE_VERSION = "0.0.0-dev";

const fleet = await scratchFleet({
  name: "probe-webkit-caw",
  respond: () => ({ everyMs: 10, words: ["Done."] }),
});
const procs: ReturnType<typeof Bun.spawn>[] = [];
const hogs: ReturnType<typeof Bun.spawn>[] = [];
let browser: Browser | undefined;
let worst = 0;

/** What one open drew: its frames' intervals and when each began, ms after the tap. */
interface Open {
  intervals: { at: number; ms: number }[];
  measures: { name: string; start: number; ms: number }[];
}

/** Taps Caw, watches WATCH_MS of frames, and reads them back. */
async function open(page: Page, at: { x: number; y: number }): Promise<Open> {
  await page.evaluate(() => {
    const probe = (window as unknown as { __probe: ProbeState }).__probe;
    probe.frames = [];
    probe.tap = -1;
    probe.on = true;
    performance.clearMeasures();
  });
  // Frames drawn before the tap too, so the one it lands in is measured.
  await page.waitForTimeout(150);
  await page.touchscreen.tap(at.x, at.y);
  await page.waitForTimeout(WATCH_MS);
  return page.evaluate(() => {
    const probe = (window as unknown as { __probe: ProbeState }).__probe;
    probe.on = false;
    const { tap } = probe;
    // From the last frame drawn before the tap: the interval the tap falls
    // in is the press's own frame, the one the operator waits on.
    const before = probe.frames.findLastIndex((t) => t <= tap);
    const frames = probe.frames.slice(Math.max(0, before));
    const intervals = frames
      .slice(1)
      .map((t, k) => ({ at: frames[k] - tap, ms: t - frames[k] }));
    const measures = performance
      .getEntriesByType("measure")
      .filter((m) => m.name.startsWith("probe:") && m.startTime >= tap - 1)
      .map((m) => ({
        name: m.name,
        start: m.startTime - tap,
        ms: m.duration,
      }));
    return { intervals, measures };
  });
}

interface ProbeState {
  frames: number[];
  on: boolean;
  tap: number;
}

try {
  // ── 1. The fleet, with a nightly that landed ─────────────────────────
  const binary = join(fleet.home, ".local", "share", "cawco", "binary");
  await mkdir(binary, { recursive: true });
  await writeFile(
    join(binary, "installation.json"),
    JSON.stringify({
      hubUrl: "http://127.0.0.1:9",
      installedVersion: SOURCE_VERSION,
      role: "agent",
      root: binary,
    })
  );
  const landedAt = Date.now() - 60_000;
  await writeFile(
    join(binary, "update-state.json"),
    JSON.stringify({
      channel: "nightly",
      installedVersion: SOURCE_VERSION,
      hostsHub: false,
      phase: "installed",
      updatedAt: landedAt,
      keeperFailedVersion: SOURCE_VERSION,
      sessiondVersion: SOURCE_VERSION,
      landed: {
        at: landedAt,
        outcome: "installed",
        version: LANDED_VERSION,
        notes: NOTES,
      },
    })
  );
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.launch("agent");
  await fleet.agentUp();

  // ── 2. The production dashboard, served as its unit serves it ────────
  const port = Number(new URL(fleet.base).port) + 7;
  const base = `http://127.0.0.1:${port}`;
  const dashboard = Bun.spawn(
    [
      "systemd-socket-activate",
      "-l",
      `127.0.0.1:${port}`,
      "--fdname=dashboard",
      "-E",
      `CAWCO_HUB_URL=${fleet.base}`,
      "-E",
      `CAWCO_PREVIEW_PORT=${fleet.env.CAWCO_PREVIEW_PORT}`,
      "node",
      "serve.js",
    ],
    {
      cwd: join(root, "apps", "dashboard"),
      env: { ...process.env, CAWCO_HUB_URL: fleet.base },
      stdout: Bun.file(join(fleet.sandbox, "dashboard.log")),
      stderr: Bun.file(join(fleet.sandbox, "dashboard.err")),
    }
  );
  procs.push(dashboard);
  await until(
    "the dashboard answering",
    () => fetch(base).then((r) => r.ok),
    Boolean,
    60_000
  );
  console.log(`… dashboard (production build) on ${base}`);

  // ── 3. WebKit, an iPhone's shape, pinned and throttled if asked ──────
  let executablePath: string | undefined;
  if (HOGS > 0) {
    for (let n = 0; n < HOGS; n += 1) {
      hogs.push(
        Bun.spawn(["taskset", "-c", "0", "sh", "-c", "while :; do :; done"])
      );
    }
    // Playwright's WebKit, started pinned: its processes inherit the core.
    executablePath = join(out, "webkit-pinned.sh");
    await writeFile(
      executablePath,
      `#!/bin/sh\nexec taskset -c 0 "${webkit.executablePath()}" "$@"\n`,
      { mode: 0o755 }
    );
    console.log(`… CPU: WebKit on core 0 with ${HOGS} busy loop(s) beside it`);
  }
  browser = await webkit.launch({ executablePath });
  console.log(`… ${browser.browserType().name()} ${browser.version()}`);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
  });
  await context.addInitScript(() => {
    const probe: ProbeState = { frames: [], on: false, tap: -1 };
    (window as unknown as { __probe: ProbeState }).__probe = probe;
    const loop = (t: number) => {
      if (probe.on) {
        probe.frames.push(t);
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    window.addEventListener(
      "pointerdown",
      (event) => {
        if (probe.on && probe.tap < 0) {
          probe.tap = event.timeStamp;
        }
      },
      { capture: true }
    );
    // A tapped button takes no focus, as on the iPhone: "Most browsers do
    // give focus to a button being clicked, but Safari does not, by design"
    // (MDN, <button>, Clicking and focus). Playwright's Linux WebKit does,
    // and the page's first focus was work in the first open's press.
    window.addEventListener(
      "mousedown",
      (event) => {
        if ((event.target as Element | null)?.closest("button")) {
          event.preventDefault();
        }
      },
      { capture: true }
    );
  });
  if (args.includes("--trace")) {
    // Every callback the page's main thread runs from a frame, a timer, an
    // event or an observer, timed; one over 12 ms is a `probe:` measure
    // named for its kind and its function's first words.
    await context.addInitScript(() => {
      const SLOW = 12;
      const name = (kind: string, fn: unknown) =>
        `probe:${kind} ${String(fn).replace(/\s+/g, " ").slice(0, 160)}`;
      const timed = <A extends unknown[], R>(
        kind: string,
        fn: (...a: A) => R
      ) =>
        function (this: unknown, ...a: A): R {
          const start = performance.now();
          try {
            return fn.apply(this, a);
          } finally {
            const end = performance.now();
            if (end - start > SLOW) {
              performance.measure(name(kind, fn), { start, end });
            }
          }
        };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) => raf(timed("raf", cb));
      const timeout = window.setTimeout.bind(window);
      window.setTimeout = ((
        cb: TimerHandler,
        ms?: number,
        ...rest: unknown[]
      ) =>
        timeout(
          typeof cb === "function"
            ? timed("timeout", cb as (...a: unknown[]) => unknown)
            : cb,
          ms,
          ...rest
        )) as typeof window.setTimeout;
      const wrapped = new WeakMap<object, EventListener>();
      const add = EventTarget.prototype.addEventListener;
      const remove = EventTarget.prototype.removeEventListener;
      EventTarget.prototype.addEventListener = function (type, listener, o) {
        if (typeof listener !== "function") {
          return add.call(this, type, listener, o);
        }
        let w = wrapped.get(listener);
        if (!w) {
          w = timed(`event ${type}`, listener) as EventListener;
          wrapped.set(listener, w);
        }
        return add.call(this, type, w, o);
      };
      EventTarget.prototype.removeEventListener = function (type, listener, o) {
        const w =
          typeof listener === "function" ? wrapped.get(listener) : undefined;
        return remove.call(this, type, w ?? listener, o);
      };
      for (const Observer of [
        "MutationObserver",
        "ResizeObserver",
        "IntersectionObserver",
      ] as const) {
        const Real = window[Observer] as unknown as new (
          cb: (...a: unknown[]) => void,
          o?: unknown
        ) => object;
        (window as unknown as Record<string, unknown>)[Observer] =
          class extends Real {
            constructor(cb: (...a: unknown[]) => void, o?: unknown) {
              super(timed(Observer, cb), o);
            }
          };
      }
      const micro = window.queueMicrotask.bind(window);
      window.queueMicrotask = (cb) => micro(timed("microtask", cb));
    });
  }
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      document
        .querySelector("[data-needs-caw]")
        ?.getAttribute("aria-label")
        ?.includes("notice") === true,
    undefined,
    { timeout: 90_000 }
  );
  const label = await page.getAttribute("[data-needs-caw]", "aria-label");
  const box = await page.locator("[data-needs-caw]").boundingBox();
  if (!box) {
    throw new Error("Caw has no box");
  }
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  console.log(`… Caw: "${label}" at ${JSON.stringify(at)}`);
  const css = option("--css");
  if (css) {
    // An experiment: a rule laid over the build's own, named in the output.
    await page.addStyleTag({ content: css });
    console.log(`… with ${css}`);
  }
  const script = option("--script");
  if (script) {
    // An experiment: a script run in the page once it has loaded.
    console.log(
      `… ran ${script}: ${await page.evaluate(await Bun.file(script).text())}`
    );
  }
  // Let the page settle: fonts, the first snapshot, his ^^ face drawn ahead.
  await page.waitForTimeout(3000);

  const capture = option("--capture");
  if (capture) {
    // The panel standing open, its shadow and the glass it hangs from.
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: capture });
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(900);
    console.log(`… captured ${capture}`);
  }

  // ── 4. The opens ─────────────────────────────────────────────────────
  const summary: { max: number; dropped: number }[] = [];
  for (let n = 0; n < RUNS; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one open at a time
    const run = await open(page, at);
    const opened = await page.evaluate(
      () =>
        document.querySelector(".caw-pop[data-state=open][data-shown]") !== null
    );
    await page.touchscreen.tap(at.x, at.y);
    // The close's own smile in and out land before the next open, so every
    // open's press finds him at rest and smiles, as a finger's does.
    await page.waitForTimeout(REST_MS);
    const long = run.intervals.filter((one) => one.ms > DROPPED_MS);
    const max = Math.max(0, ...run.intervals.map((one) => one.ms));
    worst = Math.max(worst, max);
    summary.push({ max, dropped: long.length });
    console.log(
      `run ${n}: ${opened ? "opened" : "DID NOT OPEN"}, ${run.intervals.length + 1} frames, longest ${max.toFixed(1)} ms, ${long.length} over ${DROPPED_MS} ms${long.map((one) => ` [${one.ms.toFixed(0)} ms at +${one.at.toFixed(0)}]`).join("")}`
    );
    for (const slow of long) {
      const during = run.measures.filter(
        (m) => m.start < slow.at + slow.ms && m.start + m.ms > slow.at
      );
      for (const m of during) {
        console.log(
          `    ${m.name} +${m.start.toFixed(0)} ${m.ms.toFixed(1)} ms`
        );
      }
    }
    if (args.includes("--measures")) {
      for (const m of run.measures) {
        console.log(
          `    · ${m.name} +${m.start.toFixed(0)} ${m.ms.toFixed(1)} ms`
        );
      }
    }
  }
  // What an experiment's script left for us (`--script`), if anything.
  const left = await page.evaluate(() =>
    (window as unknown as { __probeOut?: string[] }).__probeOut?.join("\n")
  );
  if (left) {
    console.log(left);
  }
  const sorted = summary.map((s) => s.max).sort((a, b) => a - b);
  console.log(
    `SUMMARY ${RUNS} opens: median longest ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)} ms, worst ${worst.toFixed(1)} ms, ${summary.reduce((sum, s) => sum + s.dropped, 0)} intervals over ${DROPPED_MS} ms in all`
  );
} finally {
  await browser?.close().catch(() => undefined);
  for (const hog of hogs) {
    hog.kill();
  }
  for (const child of procs.reverse()) {
    // biome-ignore lint/performance/noAwaitInLoops: stopped one at a time, by PID
    await fleet.killTree(child.pid, "SIGTERM");
  }
  await fleet.close();
  await fleet.clean(keep);
}
process.exit(worst > DROPPED_MS ? 1 : 0);
