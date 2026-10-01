#!/usr/bin/env node
/**
 * Append-jerk measurement harness.
 *
 * Opens a live session transcript (http://localhost:3000/session/<id>), waits
 * for the virtualized transcript to settle, then records the scroller's
 * `scrollTop` and `scrollHeight` every animation frame for a fixed window.
 * The point is to quantify how much the viewport lurches while new groups
 * stream in — the "jerk" of append.
 *
 * It is NOT wired into the app. Run it against a running dashboard:
 *
 *   cd apps/dashboard
 *   bun scripts/measure-append-jerk.mjs <session-id>
 *
 * Env overrides: CAWCO_URL (full URL), WAIT_MS (default 6000),
 * RECORD_MS (default 30000), CHROMIUM_PATH (default: playwright-core's own).
 *
 * Output is a single JSON object on stdout:
 *   {
 *     totalFrames,       // frames captured in the recording window
 *     reversals,         // jerk metric: direction reversals of scrollTop
 *     maxSingleFrameDelta// largest |scrollTop| jump between two frames
 *   }
 */

import { chromium } from "playwright-core";

const [, , id] = process.argv;
if (!id) {
  console.error("usage: node scripts/measure-append-jerk.mjs <session-id>");
  process.exit(1);
}

const url = process.env.CAWCO_URL || `http://localhost:3000/session/${id}`;
const WAIT_MS = Number(process.env.WAIT_MS || 6000);
const RECORD_MS = Number(process.env.RECORD_MS || 30_000);

// The transcript scroller in SessionPane.svelte is bound via
// `bind:this={scroller}` (class `... overflow-y-auto overscroll-contain ...`),
// the parent of the `[data-transcript-content]` log. There is no `data-vlist`
// attribute anywhere in SessionPane, so the suggested
// `[data-vlist], .overflow-y-auto` selector would miss it (and `.overflow-y-auto`
// alone matches several unrelated panes). We target the unique
// `.overflow-y-auto.overscroll-contain` scroller, falling back to the log's
// parent for safety.
const SCROLLER_SELECTOR = ".overflow-y-auto.overscroll-contain";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
});

const page = await browser.newPage();

try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(WAIT_MS);

  // Record every animation frame for RECORD_MS. The trace is written to
  // window.__jerkTrace (per spec) and also returned for immediate use.
  const trace = await page.evaluate(
    async ({ selector, durationMs }) => {
      const scroller =
        document.querySelector(selector) ??
        document.querySelector("[data-transcript-content]")?.parentElement;

      window.__jerkTrace = [];
      if (!scroller) {
        window.__jerkTrace.error = `no scroller matched "${selector}"`;
        return window.__jerkTrace;
      }

      const start = performance.now();
      await new Promise((resolve) => {
        const step = () => {
          window.__jerkTrace.push({
            scrollTop: scroller.scrollTop,
            scrollHeight: scroller.scrollHeight,
          });
          if (performance.now() - start >= durationMs) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      });
      return window.__jerkTrace;
    },
    { selector: SCROLLER_SELECTOR, durationMs: RECORD_MS }
  );

  if (trace?.error) {
    throw new Error(trace.error);
  }

  const totalFrames = trace.length;

  // Jerk metric: a direction reversal is an adjacent pair of non-zero deltas
  // whose signs differ. Each reversal spans three frames, so it always sits
  // inside a 5-frame window — no double counting.
  let reversals = 0;
  let maxSingleFrameDelta = 0;
  for (let i = 1; i < trace.length; i += 1) {
    const a = trace[i - 1].scrollTop;
    const b = trace[i].scrollTop;
    const delta = Math.abs(b - a);
    if (delta > maxSingleFrameDelta) {
      maxSingleFrameDelta = delta;
    }

    if (i >= 2) {
      const dPrev = trace[i - 1].scrollTop - trace[i - 2].scrollTop;
      const dCur = b - a;
      if (dPrev !== 0 && dCur !== 0 && Math.sign(dPrev) !== Math.sign(dCur)) {
        reversals += 1;
      }
    }
  }

  console.log(
    JSON.stringify({ totalFrames, reversals, maxSingleFrameDelta }, null, 2)
  );
} finally {
  await browser.close();
}
