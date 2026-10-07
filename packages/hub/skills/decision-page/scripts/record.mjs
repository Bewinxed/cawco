// Record one mockup as a video clip for launch videos, the landing page or docs.
//   node <skill>/scripts/record.mjs <work-dir> <mockup-id> [--dark] [--seconds 12] [--size 1080x1080] [--scale 2]
// Writes <work-dir>/out/<mockup>-<light|dark>.webm: the mockup centred on the
// page background at the given size, playing its loop from the start.
// Needs playwright-core where you run it and a Chromium (CHROMIUM=<binary>).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kit = join(dirname(fileURLToPath(import.meta.url)), "..", "kit");
const args = process.argv.slice(2);
const [workArg, name] = args;
const flag = (key, fallback) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : fallback;
};
if (!(workArg && name)) {
  console.error(
    "usage: record.mjs <work-dir> <mockup-id> [--dark] [--seconds N] [--size WxH] [--scale N]"
  );
  process.exit(1);
}
const { chromium } = createRequire(join(process.cwd(), "/"))("playwright-core");
const work = resolve(workArg);
const dark = args.includes("--dark");
const seconds = Number(flag("--seconds", "12"));
const [width, height] = flag("--size", "1080x1080").split("x").map(Number);
const scale = Number(flag("--scale", "2"));
const css =
  readFileSync(join(kit, "tokens.css"), "utf8") +
  readFileSync(join(kit, "page.css"), "utf8");
const body = readFileSync(
  join(work, "mockups", `${name}.html`),
  "utf8"
).replaceAll('src="caw/', `src="${pathToFileURL(join(kit, "caw"))}/`);
const harness = join(work, `_record-${name}.html`);
writeFileSync(
  harness,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css} html,body{height:100%} body{display:grid;place-items:center;margin:0}</style></head><body><div style="width:min(560px,92vw);zoom:${scale}">${body}</div><script>setTimeout(function(){document.querySelectorAll('.mk').forEach(function(el){el.classList.add('is-live');el.dispatchEvent(new CustomEvent('mk:live'));});},300);</script></body></html>`
);
const outDir = join(work, "out");
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
await page.goto(pathToFileURL(harness).href);
await page.waitForTimeout(seconds * 1000);
const video = page.video();
await context.close();
const target = join(outDir, `${name}-${dark ? "dark" : "light"}.webm`);
renameSync(await video.path(), target);
await browser.close();
console.log("recorded", target);
