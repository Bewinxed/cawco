// Render a decision page, or one of its mockups, at 1000px light and 360px
// dark; write PNGs to <folder>/out/ and report overflow and script errors.
//
//   node <skill>/preview.mjs decisions/onboarding              # the built index.html
//   node <skill>/preview.mjs decisions/onboarding example      # one mockup, in base.css
//   node <skill>/preview.mjs decisions/onboarding example --reduced
//
// Needs playwright-core (or playwright) where node can find it, and a
// Chromium: set CHROMIUM to its binary when Playwright has none of its own.
// Look at both PNGs; fix what is broken; run once more with --reduced to see
// the still state. Bun runs it too (bun <skill>/preview.mjs …).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const skill = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const reduced = process.argv.includes("--reduced");
const [folderArg, mockup] = args;
if (!folderArg) {
  console.error("usage: preview.mjs <page folder> [mockup] [--reduced]");
  process.exit(1);
}
const folder = resolve(folderArg);

let chromium;
for (const name of ["playwright-core", "playwright"]) {
  try {
    ({ chromium } = await import(name));
    break;
  } catch {
    // try the next
  }
}
if (!chromium) {
  console.error(
    "playwright-core is not installed here. Install it in a scratch folder (npm i playwright-core) and run this script from there, or open the page in a browser and look."
  );
  process.exit(1);
}

let target;
if (mockup) {
  const local = join(folder, "mockups", `${mockup}.html`);
  let body;
  try {
    body = readFileSync(local, "utf8");
  } catch {
    body = readFileSync(join(skill, "mockups", `${mockup}.html`), "utf8");
  }
  const base = readFileSync(join(skill, "base.css"), "utf8");
  target = join(folder, `_preview-${mockup}.html`);
  writeFileSync(
    target,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${base}</style></head><body><div style="max-width:560px;margin:24px auto;padding-inline:16px">${body}</div><script>document.querySelectorAll('.mk').forEach(function(el){el.classList.add('is-live');el.dispatchEvent(new CustomEvent('mk:live'));});</script></body></html>`
  );
} else {
  target = join(folder, "index.html");
}

mkdirSync(join(folder, "out"), { recursive: true });
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
  await page.goto(pathToFileURL(target).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  const out = join(
    folder,
    "out",
    `${mockup ?? "page"}-${tag}${reduced ? "-reduced" : ""}.png`
  );
  const root = mockup ? await page.$(".mk") : null;
  if (root) {
    await root.screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: true });
  }
  console.log(tag, "overflow:", overflow, "→", out);
}
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
