// Render one mockup inside the kit's CSS at 1000px (light) and 360px (dark),
// write PNGs to <work-dir>/out/, and report overflow and script errors.
//   node <skill>/scripts/preview.mjs <work-dir> <mockup-id> [--reduced]
// Needs playwright-core where you run it (npm i -D playwright-core in a
// scratch folder) and a Chromium; set CHROMIUM to its binary if Playwright
// cannot find one.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const kit = join(dirname(fileURLToPath(import.meta.url)), "..", "kit");
const [workArg, name] = process.argv.slice(2);
const reduced = process.argv.includes("--reduced");
if (!(workArg && name)) {
  console.error("usage: preview.mjs <work-dir> <mockup-id> [--reduced]");
  process.exit(1);
}
const { chromium } = createRequire(join(process.cwd(), "/"))("playwright-core");
const work = resolve(workArg);
const css =
  readFileSync(join(kit, "tokens.css"), "utf8") +
  readFileSync(join(kit, "page.css"), "utf8");
const body = readFileSync(
  join(work, "mockups", `${name}.html`),
  "utf8"
).replaceAll('src="caw/', `src="${pathToFileURL(join(kit, "caw"))}/`);
const harness = join(work, `_preview-${name}.html`);
writeFileSync(
  harness,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div style="max-width:560px;margin:24px auto;padding-inline:16px">${body}</div><script>document.querySelectorAll('.mk').forEach(function(el){el.classList.add('is-live');el.dispatchEvent(new CustomEvent('mk:live'));});</script></body></html>`
);
mkdirSync(join(work, "out"), { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const errors = [];
for (const [width, scheme, tag] of [
  [1000, "light", "desk-light"],
  [360, "dark", "phone-dark"],
]) {
  // biome-ignore lint/performance/noAwaitInLoops: one page at a time keeps the two renders apart and the browser small.
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    colorScheme: scheme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  await page.goto(pathToFileURL(harness).href);
  await page.waitForTimeout(1600);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  const out = join(
    work,
    "out",
    `${name}-${tag}${reduced ? "-reduced" : ""}.png`
  );
  await (await page.$(".mk")).screenshot({ path: out });
  console.log(tag, "overflow:", overflow, "→", out);
}
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
