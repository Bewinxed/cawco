/**
 * Frames over 25ms while the recall wheel opens (↑) and folds (Esc), in
 * Chromium and WebKit at 1440×900 and 390×844, for this branch's build and
 * a baseline build, both against the same scratch hub (seed-fleet.ts); and
 * the same count over a second with nothing moving, the engine's own pace
 * here:
 *
 *   ROUNDS=12 node artifacts/recall-wheel/frames-ab.mjs <after url> <before url> <session id>
 *
 * The two builds stand open side by side, each in a browser of its own,
 * and take their rounds in turn (before, after, before, …), so a machine
 * shared with other work loads both alike: a sequential run let the
 * baseline's own count swing from 11 to 23 between runs. A round the
 * engine hangs on is counted (`stuckRounds`) and that build reloaded.
 * `ONLY=webkit-phone,…` measures just
 * those engine-size pairs.
 */
import { chromium, webkit } from "playwright-core";
import { Gone, readWithin } from "../../packages/core/src/bounded.ts";

const [after, before, session] = process.argv.slice(2);
const ROUNDS = Number(process.env.ROUNDS ?? 6);
const ONLY = process.env.ONLY?.split(",");
const ENGINES = { chromium, webkit };
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

/** Gaps between frames from now for `ms`. */
const gapsFor = (page, ms) =>
  page.evaluate(
    (span) =>
      new Promise((done) => {
        const gaps = [];
        let last = 0;
        const start = performance.now();
        const tick = (now) => {
          if (last) {
            gaps.push(now - last);
          }
          last = now;
          if (now - start < span) {
            requestAnimationFrame(tick);
          } else {
            done(gaps);
          }
        };
        requestAnimationFrame(tick);
      }),
    ms
  );

const count = (gaps) => ({
  frames: gaps.length,
  over25: gaps.filter((g) => g > 25).length,
  worstMs: gaps.length ? +Math.max(...gaps).toFixed(1) : 0,
});

/** A build's page, loaded and with the field focused. */
async function load(browser, v, base) {
  const page = await (
    await browser.newContext({ viewport: { width: v.width, height: v.height } })
  ).newPage();
  await page.goto(`${base}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".tr")?.textContent?.includes("Step 40 is done"),
    null,
    { timeout: 90_000 }
  );
  await page.waitForTimeout(2000);
  await page.click(".cin textarea");
  await page.waitForTimeout(500);
  return page;
}

/** One open and one fold, each over 600ms. */
async function round(page) {
  const opening = gapsFor(page, 600);
  // A page brought down mid-round rejects it before it is awaited.
  opening.catch(() => undefined);
  await page.keyboard.press("ArrowUp");
  const open = await opening;
  await page.waitForTimeout(400);
  const closing = gapsFor(page, 600);
  closing.catch(() => undefined);
  await page.keyboard.press("Escape");
  const close = await closing;
  await page.waitForTimeout(400);
  return { open, close };
}

async function measure(engine, v) {
  // Each build in a browser of its own, so one the engine hangs on or brings
  // down cannot stall the other.
  const bases = { before, after };
  const browsers = {};
  const pages = {};
  const runs = {};
  for (const [build, base] of Object.entries(bases)) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time keeps the timings honest
    browsers[build] = await ENGINES[engine].launch();
    pages[build] = await load(browsers[build], v, base);
    runs[build] = {
      idle: count(await gapsFor(pages[build], 1000)),
      open: [],
      close: [],
      stuck: 0,
    };
  }
  for (let rounds = 0; rounds < ROUNDS; rounds += 1) {
    for (const build of Object.keys(bases)) {
      // A round the engine hangs on (no frame for 15s) or a page it brings
      // down is counted, and the build gets a fresh browser.
      // biome-ignore lint/performance/noAwaitInLoops: the builds take their rounds in turn
      const done = await readWithin(15_000, () =>
        round(pages[build]).catch((error) => {
          throw new Gone(`the ${build} page went down: ${error}`);
        })
      );
      switch (done.kind) {
        case "answered":
          runs[build].open.push(...done.value.open);
          runs[build].close.push(...done.value.close);
          break;
        case "unanswered":
          runs[build].stuck += 1;
          await browsers[build].close().catch(() => undefined);
          browsers[build] = await ENGINES[engine].launch();
          pages[build] = await load(browsers[build], v, bases[build]);
          break;
        default:
          throw new Error(`unhandled read: ${JSON.stringify(done)}`);
      }
    }
  }
  const out = { rounds: ROUNDS };
  for (const build of Object.keys(bases)) {
    // biome-ignore lint/performance/noAwaitInLoops: each browser in turn
    await browsers[build].close().catch(() => undefined);
    out[build] = {
      idle: runs[build].idle,
      stuckRounds: runs[build].stuck,
      open: count(runs[build].open),
      close: count(runs[build].close),
    };
  }
  return out;
}

const report = {};
for (const engine of Object.keys(ENGINES)) {
  for (const v of VIEWPORTS) {
    const key = `${engine}-${v.name}`;
    if (ONLY && !ONLY.includes(key)) {
      continue;
    }
    console.error(`measuring ${key}`);
    // A page the engine hangs on is reported as hung after ten minutes.
    // biome-ignore lint/performance/noAwaitInLoops: one browser at a time keeps the timings honest
    const measured = await readWithin(600_000, () => measure(engine, v));
    switch (measured.kind) {
      case "answered":
        report[key] = measured.value;
        break;
      case "unanswered":
        report[key] = { hung: true, afterMs: measured.after };
        break;
      default:
        throw new Error(`unhandled read: ${JSON.stringify(measured)}`);
    }
  }
}
console.log(JSON.stringify(report, null, 1));
