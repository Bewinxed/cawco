/**
 * Frames over 25ms while the recall wheel opens (↑) and folds (Esc), six
 * rounds each, in Chromium and WebKit at 1440×900 and 390×844, for this
 * branch's build and origin/main's, both against the same scratch hub
 * (seed-fleet.ts); and the same count over a second with nothing moving,
 * the engine's own pace here:
 *
 *   node artifacts/recall-wheel/frames-ab.mjs <after url> <before url> <session id>
 */
import { chromium, webkit } from "playwright-core";

const [after, before, session] = process.argv.slice(2);
const ROUNDS = 6;
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
  worstMs: +Math.max(...gaps).toFixed(1),
});

async function measure(engine, v, base) {
  const browser = await ENGINES[engine].launch();
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
  const idle = count(await gapsFor(page, 1000));
  const open = [];
  const close = [];
  // A page the engine brings down says how many rounds it got through.
  let rounds = 0;
  try {
    for (; rounds < ROUNDS; rounds += 1) {
      const opening = gapsFor(page, 600);
      // A page brought down mid-round rejects it before it is awaited.
      opening.catch(() => undefined);
      // biome-ignore lint/performance/noAwaitInLoops: each round waits for the one before to land
      await page.keyboard.press("ArrowUp");
      open.push(...(await opening));
      await page.waitForTimeout(400);
      const closing = gapsFor(page, 600);
      closing.catch(() => undefined);
      await page.keyboard.press("Escape");
      close.push(...(await closing));
      await page.waitForTimeout(400);
    }
  } catch (error) {
    await browser.close().catch(() => undefined);
    return {
      idle,
      crashedInRound: rounds + 1,
      error: String(error).slice(0, 80),
      open: count(open),
      close: count(close),
    };
  }
  await browser.close();
  return { idle, rounds, open: count(open), close: count(close) };
}

const report = {};
for (const engine of Object.keys(ENGINES)) {
  for (const v of VIEWPORTS) {
    for (const [build, base] of Object.entries({ before, after })) {
      console.error(`measuring ${engine} ${v.name} ${build}`);
      // A page the engine hangs on is reported as hung after three minutes.
      // biome-ignore lint/performance/noAwaitInLoops: one browser at a time keeps the timings honest
      report[`${engine} ${v.name} ${build}`] = await Promise.race([
        measure(engine, v, base),
        new Promise((done) => setTimeout(() => done({ hung: true }), 180_000)),
      ]);
    }
  }
}
console.log(JSON.stringify(report, null, 1));
