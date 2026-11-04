#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
/**
 * Deterministic 2x mock renderer for the fidelity gate.
 *
 * The old fidelity gate downsampled any image wider than 2000px back to CSS px with
 * LANCZOS, and the reference comps are 2x exports. Rendering at DPR 1 changes
 * glyph antialiasing enough to move measured ink by ~13 luminance steps, so the
 * gate must be fed a 2x render.
 *
 *   node mocks/render.mjs <file.html> <out.png> [--viewport 1440x1023] [--dark]
 */
import { chromium } from "playwright-core";

const argv = process.argv.slice(2);
const get = (f, d) => {
  const i = argv.indexOf(f);
  return i === -1 ? d : argv[i + 1];
};
const [src, out] = argv.filter(
  (a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--viewport"
);
const [w, h] = get("--viewport", "1440x1023").split("x").map(Number);
const dark = argv.includes("--dark");

const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_BIN ||
    "/home/bewinxed/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-gpu",
    "--force-color-profile=srgb",
    "--font-render-hinting=none",
  ],
});
const page = await browser.newPage({
  viewport: { width: w, height: h },
  deviceScaleFactor: 2,
});
await page.goto(pathToFileURL(resolve(src)).href, { waitUntil: "load" });
if (dark) {
  await page.evaluate(() => document.documentElement.classList.add("dark"));
}
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: out, animations: "disabled", caret: "hide" });
await browser.close();
console.log(`WROTE ${out} (${w}x${h} @2x${dark ? " dark" : ""})`);
