// Render one mockup inside the page's CSS at 1000px (light) and 360px (dark),
// write PNGs to ./out/, and report overflow and script errors.
//   bun mocks/project-paths/preview.mjs board [--reduced]
// Uses the repo's playwright-core; set CHROMIUM to a Chromium binary if
// Playwright cannot find one (e.g. CHROMIUM=/opt/pw-browsers/chromium).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const name = process.argv[2];
const reduced = process.argv.includes("--reduced");
if (!name) {
  console.error("usage: preview.mjs <mockup> [--reduced]");
  process.exit(1);
}
const base = readFileSync(join(here, "base.css"), "utf8");
const body = readFileSync(join(here, "mockups", `${name}.html`), "utf8");
const harness = join(here, `_preview-${name}.html`);
writeFileSync(
  harness,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"><style>${base}</style></head><body><div style="max-width:560px;margin:24px auto;padding-inline:16px">${body}</div><script>document.querySelectorAll('.mk').forEach(function(el){el.classList.add('is-live');el.dispatchEvent(new CustomEvent('mk:live'));});</script></body></html>`
);
mkdirSync(join(here, "out"), { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const errors = [];
for (const [width, scheme, tag] of [
  [1000, "light", "desk-light"],
  [360, "dark", "phone-dark"],
]) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    colorScheme: scheme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  await page.goto(`file://${harness}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1600);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  const out = join(here, "out", `${name}-${tag}${reduced ? "-reduced" : ""}.png`);
  await (await page.$(".mk")).screenshot({ path: out });
  console.log(tag, "overflow:", overflow, "→", out);
}
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
