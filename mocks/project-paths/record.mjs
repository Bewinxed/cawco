// Record one mockup as a video clip for launch videos, the landing page or docs.
//   bun mocks/project-paths/record.mjs board [--dark] [--seconds 12] [--size 1080x1080] [--scale 2]
// Writes out/<mockup>-<light|dark>.webm. The mockup is centred on the page
// background at the given size and plays its loop from the start.
// Set CHROMIUM to a Chromium binary if Playwright cannot find one.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const name = args[0];
const flag = (key, fallback) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : fallback;
};
if (!name) {
  console.error("usage: record.mjs <mockup> [--dark] [--seconds N] [--size WxH] [--scale N]");
  process.exit(1);
}
const dark = args.includes("--dark");
const seconds = Number(flag("--seconds", "12"));
const [width, height] = flag("--size", "1080x1080").split("x").map(Number);
const scale = Number(flag("--scale", "2"));
const base = readFileSync(join(here, "base.css"), "utf8");
const body = readFileSync(join(here, "mockups", `${name}.html`), "utf8");
const harness = join(here, `_record-${name}.html`);
writeFileSync(
  harness,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"><style>${base} html,body{height:100%} body{display:grid;place-items:center;margin:0}</style></head><body><div style="width:min(560px,92vw);zoom:${scale}">${body}</div><script>setTimeout(function(){document.querySelectorAll('.mk').forEach(function(el){el.classList.add('is-live');el.dispatchEvent(new CustomEvent('mk:live'));});},300);</script></body></html>`
);
const outDir = join(here, "out");
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const context = await browser.newContext({
  viewport: { width, height },
  colorScheme: dark ? "dark" : "light",
  recordVideo: { dir: outDir, size: { width, height } },
});
const page = await context.newPage();
await page.goto(`file://${harness}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(seconds * 1000);
const video = page.video();
await context.close();
const target = join(outDir, `${name}-${dark ? "dark" : "light"}.webm`);
renameSync(await video.path(), target);
await browser.close();
console.log("recorded", target);
