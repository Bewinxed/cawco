// Render one mockup inside the kit's CSS, write PNGs to <work-dir>/out/, and
// report overflow and script errors.
//   node <skill>/scripts/preview.mjs <work-dir> <mockup-id> [--reduced]
// A fluid mockup renders in a 560px box at 1000px (light) and 360px (dark).
// A mockup whose root declares `data-mk-width` renders at that width, never
// scaled, in the kit's real-size frame inside a card (RECIPES.md, "At its
// real size"), at 1440px (light) and 360px (dark); overflow there means the
// page itself scrolls sideways, and the frame scrolling is reported apart.
// Needs playwright-core where you run it (npm i -D playwright-core in a
// scratch folder) and a Chromium; set CHROMIUM to its binary if Playwright
// cannot find one.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { kit, mockup, playwright } from "./mockup.mjs";

const [workArg, name] = process.argv.slice(2);
const reduced = process.argv.includes("--reduced");
if (!(workArg && name)) {
  console.error("usage: preview.mjs <work-dir> <mockup-id> [--reduced]");
  process.exit(1);
}
const { chromium } = playwright();
const work = resolve(workArg);
const { css, body } = mockup(work, name);
const declared = Number(body.match(/\bdata-mk-width="(\d+)"/u)?.[1] ?? 0);
const live =
  "<script>document.querySelectorAll('.mk').forEach(function(el){el.classList.add('is-live');el.dispatchEvent(new CustomEvent('mk:live'));});</script>";
const shell = declared
  ? `<main class="dp"><article class="dp-card"><div class="dp-reals"><figure class="dp-pane dp-real"><figcaption><b>${name}</b><span>at its real size, ${declared}px</span><span class="dp-real-more">· scroll sideways for the rest</span></figcaption><div class="dp-real-scroll">${body}</div></figure></div></article></main><script>${readFileSync(join(kit, "page.js"), "utf8")}</script>`
  : `<div style="max-width:560px;margin:24px auto;padding-inline:16px">${body}</div>`;
const harness = join(work, `_preview-${name}.html`);
writeFileSync(
  harness,
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>${shell}${live}</body></html>`
);
mkdirSync(join(work, "out"), { recursive: true });
const browser = await chromium.launch(
  process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}
);
const errors = [];
for (const [width, scheme, tag] of [
  [declared ? 1440 : 1000, "light", "desk-light"],
  [360, "dark", "phone-dark"],
]) {
  const page = await browser.newPage({
    viewport: { width, height: 900 },
    colorScheme: scheme,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  page.on("pageerror", (e) => errors.push(`${tag}: ${e.message}`));
  await page.goto(pathToFileURL(harness).href);
  await page.waitForTimeout(1600);
  const report = await page.evaluate(() => {
    const root = document.querySelector(".mk");
    const frame = document.querySelector(".dp-real-scroll");
    return {
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      drawn: Math.round(root.getBoundingClientRect().width),
      transform: getComputedStyle(root).transform,
      frameTransform: frame && getComputedStyle(frame).transform,
      frameScrolls: frame ? frame.scrollWidth > frame.clientWidth + 1 : null,
      frameWidth: frame?.clientWidth,
      captionSays: frame?.closest(".dp-real")?.hasAttribute("data-dp-more"),
    };
  });
  const out = join(
    work,
    "out",
    `${name}-${tag}${reduced ? "-reduced" : ""}.png`
  );
  await (await page.$(declared ? ".dp-real" : ".mk")).screenshot({ path: out });
  const real = declared
    ? ` drawn: ${report.drawn}px of ${declared}px, transform: ${report.transform}, frame transform: ${report.frameTransform}, frame ${report.frameWidth}px ${report.frameScrolls ? "scrolls sideways" : "holds it whole"}, caption says scroll: ${report.captionSays}`
    : "";
  console.log(tag, "overflow:", report.overflow, real, "→", out);
  if (declared && report.drawn !== declared) {
    errors.push(
      `${tag}: the root declares data-mk-width="${declared}" but draws ${report.drawn}px: give .mk-${name} inline-size: ${declared}px`
    );
  }
}
console.log(errors.length ? errors.join("\n") : "no errors");
await browser.close();
