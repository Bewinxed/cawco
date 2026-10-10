/**
 * The transcript's head fade on the web, captured for the owner: the tab
 * strip and the top 240px of its pane, at 1440×900 and 390×844 (2×), scrolled
 * to the very top (no fade) and ~300px down with a line of text across the
 * top edge (rows under the fade), on this
 * branch and, for the scrolled frame, on origin/main as the "before"; and a
 * short scroll from the top, recorded and cut to the same region.
 *
 *   node artifacts/head-fade/web-capture.mjs <branch url> <main url> <session id> <out dir>
 *
 * Both dashboards talk to one scratch hub (seed-fleet.ts). Prints, per
 * frame, the fade's computed opacity and the transcript's scrollTop.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

const [branch, main, session, out] = process.argv.slice(2);
const CHROME =
  "/home/bewinxed/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, mobile: false },
  { name: "phone", width: 390, height: 844, mobile: true },
];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });

/** Opens the session and waits for its last reply to be drawn. */
async function open(page, base) {
  await page.goto(`${base}/session/${session}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () =>
      document.querySelector(".tr")?.textContent?.includes("Step 12 is done"),
    null,
    { timeout: 90_000 }
  );
  await page.waitForTimeout(1500);
}

/** The tab strip over the transcript and the top 240px of the pane. */
function region(page) {
  return page.evaluate(() => {
    const tr = document.querySelector(".tr").getBoundingClientRect();
    const [strip] = [...document.querySelectorAll("[role=tablist]")]
      .map((e) => e.getBoundingClientRect())
      // A phone's tab sheet hangs a little into the pane under it.
      .filter((b) => b.top < tr.top && b.right > tr.left)
      .sort((a, b) => b.top - a.top);
    const top = Math.max(0, Math.floor((strip?.top ?? tr.top) - 8));
    return {
      x: Math.floor(tr.left),
      y: top,
      width: Math.floor(tr.width),
      height: Math.ceil(tr.top + 240 - top),
    };
  });
}

/** Scrolls the transcript to `y` until it stays there: one still landing on
    its latest row pulls itself back down. */
async function scrollTo(page, y) {
  for (let tries = 0; tries < 10; tries += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each try reads where the last one rested
    await page.evaluate((to) => {
      document.querySelector(".tr").scrollTop = to;
    }, y);
    await page.waitForTimeout(600);
    const at = await page.evaluate(
      () => document.querySelector(".tr").scrollTop
    );
    if (Math.abs(at - y) < 2) {
      break;
    }
  }
  // The virtual list draws the rows it scrolled to a beat later.
  await page.waitForFunction(
    () => {
      const tr = document.querySelector(".tr");
      const box = tr.getBoundingClientRect();
      return [...tr.querySelectorAll("p, li, h1, h2, h3, pre")].some((e) => {
        const r = e.getBoundingClientRect();
        return r.height > 0 && r.bottom > box.top && r.top < box.top + 200;
      });
    },
    null,
    { timeout: 30_000 }
  );
  await page.waitForTimeout(400);
  return page.evaluate(() => ({
    scrollTop: Math.round(document.querySelector(".tr").scrollTop),
    fade: document.querySelector(".head-fade")
      ? getComputedStyle(document.querySelector(".head-fade")).opacity
      : "none",
  }));
}

/** The scroll near `near` that sets a line of text across the transcript's
    top edge, its middle on the edge: the frame where a row meets the tab. */
async function lineOnEdge(page, near) {
  await scrollTo(page, near);
  return page.evaluate((target) => {
    const tr = document.querySelector(".tr");
    const edge = tr.getBoundingClientRect().top;
    const walker = document.createTreeWalker(tr, NodeFilter.SHOW_TEXT);
    let best = target;
    let gap = Number.POSITIVE_INFINITY;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of range.getClientRects()) {
        const middle = r.top + r.height / 2 - edge + tr.scrollTop;
        if (Math.abs(middle - target) < gap) {
          gap = Math.abs(middle - target);
          best = Math.round(middle);
        }
      }
    }
    return best;
  }, near);
}

const edgeAt = {};

async function frames(base, label, which) {
  for (const v of VIEWPORTS) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each width in turn
    const page = await browser.newPage({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
      isMobile: v.mobile,
      hasTouch: v.mobile,
    });
    await open(page, base);
    const clip = await region(page);
    // The same scroll on both builds: the rows above the edge lay out alike.
    edgeAt[v.name] ??= await lineOnEdge(page, 300);
    for (const [state, y] of which) {
      // biome-ignore lint/performance/noAwaitInLoops: each frame scrolls the one page
      const seen = await scrollTo(page, y === "edge" ? edgeAt[v.name] : y);
      const file = join(out, `${label}-${v.name}-${state}.png`);
      await page.screenshot({ path: file, clip });
      console.log(
        `${file}: scrollTop ${seen.scrollTop}, fade opacity ${seen.fade}`
      );
    }
    await page.close();
  }
}

await frames(branch, "after", [
  ["top", 0],
  ["scrolled", "edge"],
]);
await frames(main, "before", [["scrolled", "edge"]]);

// The scroll, from the very top down, slowly, at desktop width.
const videoDir = join(out, ".video");
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
});
const recording = await context.newPage();
await open(recording, branch);
const videoClip = await region(recording);
await scrollTo(recording, 0);
await recording.waitForTimeout(800);
const middle = await recording.evaluate(() => {
  const b = document.querySelector(".tr").getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
});
await recording.mouse.move(middle.x, middle.y);
for (let i = 0; i < 60; i += 1) {
  // biome-ignore lint/performance/noAwaitInLoops: one wheel step a frame apart
  await recording.mouse.wheel(0, 6);
  await recording.waitForTimeout(40);
}
await recording.waitForTimeout(800);
await context.close();
const webm = join(videoDir, readdirSync(videoDir)[0]);
const crop = `crop=${videoClip.width}:${videoClip.height}:${videoClip.x}:${videoClip.y}`;
const ffmpeg = (filter, file, more = []) =>
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    webm,
    "-vf",
    filter,
    ...more,
    join(out, file),
  ]);
ffmpeg(crop, "after-desktop-scroll.mp4", [
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
]);
ffmpeg(
  `${crop},fps=20,split[a][b];[a]palettegen[p];[b][p]paletteuse`,
  "after-desktop-scroll.gif"
);
rmSync(videoDir, { recursive: true, force: true });
console.log(`${join(out, "after-desktop-scroll.mp4")} and .gif`);
await browser.close();
