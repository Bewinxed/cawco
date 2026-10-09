// Measures Caw's dark rim as the apps draw him: each file's still, at each size the apps give
// him and at 1x and 2x, on the dashboard's dark page (--surface-page, oklch(18.4% 0.004 70)), on
// Rive's official runtime in headless Chromium, framed as `cawStill` frames him (its box with
// 2 CSS px of canvas past it, the 592 artboard placed by the 512 box).
//
// Per picture it reports:
//   rim px  — the rim's mean width in device px: the coverage dark adds to light (light draws no
//             rim) summed over the canvas, divided by his silhouette's outline length (the summed
//             gradient of his light coverage). A mean: concave notches, where the rim overlaps
//             itself, pull it under the rim's full width (prove-viewmodel.mjs proves its reach);
//   ring    — the first ring of device pixels outside his body (pixels under half his light
//             coverage that touch one at half or more), composited on the page: the share of it
//             at 3:1 or more against the page (WCAG 1.4.11, non-text contrast) and its 10th
//             percentile contrast. Where there is no rim that ring is page, 1.0:1.
// A file whose `Caw` view model carries `pixel` gets it set as the apps set it: 512 / (CSS px x
// device pixel ratio).
//
// usage: node measure-rim.mjs [--dir ../caw] [--sizes 14,18,34,48,80] [--files a,b] [--light]
//   --light also renders the light pictures and prints a digest of each, to compare two builds.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { FILES, fileName } from "./scene.mjs";

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i].startsWith("--")) {
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next && !next.startsWith("--") ? next : true;
  }
}
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dir = args.dir ?? here("../caw");
const sizes = (args.sizes ?? "14,18,34,48,80").split(",").map(Number);
const files = args.files ? args.files.split(",") : FILES.map(fileName);
const RATIOS = [1, 2];
const BLEED = 2;
const PAGE_DARK = "oklch(18.4% 0.004 70)";
const CHROMIUM_DIR = /^chromium-\d+$/;
const runtimeDir = here("./node_modules/@rive-app/canvas-advanced/");

const PAGE = `
import RiveFactory from "/canvas_advanced.mjs";
const rive = await RiveFactory({ locateFile: (f) => "/" + f });
const ARTBOARD = 592;
const BOX = { x: 43, y: 40, side: 512 };
function surface(css) {
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const x = c.getContext("2d");
  x.fillStyle = css;
  x.fillRect(0, 0, 1, 1);
  return [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}
const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function digest(d) {
  let a = 0x811c9dc5;
  for (let i = 0; i < d.length; i++) a = Math.imul(a ^ d[i], 0x01000193);
  return (a >>> 0).toString(16).padStart(8, "0");
}
window.measure = async (b64, job) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const file = await rive.load(bytes);
  const page = surface(job.page);
  const out = [];
  const render = (css, ratio, dark) => {
    const span = css + 2 * job.bleed;
    const backing = Math.round(span * ratio);
    const scale = backing / span;
    const box = { x: job.bleed * scale, y: job.bleed * scale, side: css * scale };
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = backing;
    const renderer = rive.makeRenderer(canvas);
    const artboard = file.artboardByName("Caw");
    const machine = new rive.StateMachineInstance(artboard.stateMachineByName("CawStates"), artboard);
    const caw = file.defaultArtboardViewModel(artboard).defaultInstance();
    machine.bindViewModelInstance(caw);
    caw.boolean("dark").value = dark;
    const pixel = caw.number ? caw.number("pixel") : null;
    if (pixel) pixel.value = BOX.side / (css * ratio);
    caw.boolean("reducedMotion").value = true;
    for (let s = 0; s < 60; s++) machine.advanceAndApply(1 / 60);
    const unit = box.side / BOX.side;
    const frame = { minX: box.x - BOX.x * unit, minY: box.y - BOX.y * unit, maxX: box.x + (ARTBOARD - BOX.x) * unit, maxY: box.y + (ARTBOARD - BOX.y) * unit };
    renderer.clear();
    renderer.save();
    renderer.align(rive.Fit.contain, rive.Alignment.center, frame, artboard.bounds);
    artboard.draw(renderer);
    renderer.restore();
    renderer.flush();
    rive.resolveAnimationFrame();
    const data = canvas.getContext("2d").getImageData(0, 0, backing, backing).data;
    renderer.delete(); machine.delete(); artboard.delete();
    return { data, backing, hasPixel: Boolean(pixel) };
  };
  for (const css of job.sizes) {
    for (const ratio of job.ratios) {
      const dark = render(css, ratio, true);
      const light = render(css, ratio, false);
      const n = dark.backing;
      const aD = (i) => dark.data[i * 4 + 3] / 255;
      const aL = (i) => light.data[i * 4 + 3] / 255;
      // Rim coverage: what dark adds over light.
      let area = 0;
      for (let i = 0; i < n * n; i++) area += Math.max(0, aD(i) - aL(i));
      // Outline length: summed gradient of his light coverage.
      let perimeter = 0;
      for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
        const i = y * n + x;
        perimeter += Math.hypot(aL(i + 1) - aL(i), aL(i + n) - aL(i));
      }
      // First ring outside his body, composited over the page.
      const ring = [];
      for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
        const i = y * n + x;
        if (aL(i) >= 0.5) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) for (let dx = -1; dx <= 1; dx++) if (aL(i + dy * n + dx) >= 0.5) { touches = true; break; }
        if (!touches) continue;
        const a = aD(i);
        const c = [0, 1, 2].map((k) => (a > 0 ? dark.data[i * 4 + k] / a : 0) * a + page[k] * (1 - a));
        ring.push(contrast(c, page));
      }
      ring.sort((p, q) => p - q);
      const at = (q) => ring[Math.min(ring.length - 1, Math.floor(q * ring.length))];
      out.push({
        css, ratio,
        rim: perimeter ? area / perimeter : 0,
        p10: at(0.1),
        share: ring.filter((c) => c >= 3).length / ring.length,
        lightDigest: job.light ? digest(light.data) : null,
        hasPixel: dark.hasPixel,
      });
    }
  }
  file.unref?.();
  return out;
};
window.ready = true;
`;

function chromiumPath() {
  // Where Playwright installs its browsers (playwright-core registry): PLAYWRIGHT_BROWSERS_PATH,
  // else the XDG cache home ($XDG_CACHE_HOME, or ~/.cache when it is unset) and ms-playwright.
  const root =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    join(
      process.env.XDG_CACHE_HOME || join(process.env.HOME, ".cache"),
      "ms-playwright"
    );
  const revs = existsSync(root)
    ? readdirSync(root)
        .filter((d) => CHROMIUM_DIR.test(d))
        .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    : [];
  for (const rev of revs) {
    for (const sub of ["chrome-linux64", "chrome-linux"]) {
      const exe = join(root, rev, sub, "chrome");
      if (existsSync(exe)) {
        return exe;
      }
    }
  }
  throw new Error(
    `No cached Chromium under ${root}; run: npx playwright-core install chromium`
  );
}

const ORIGIN = "http://caw.local";
const browser = await chromium.launch({
  headless: true,
  executablePath: chromiumPath(),
});
const context = await browser.newContext();
await context.route(`${ORIGIN}/**`, (route) => {
  const path = new URL(route.request().url()).pathname;
  if (path === "/") {
    return route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><body><script type="module">${PAGE}</script></body>`,
    });
  }
  if (path === "/canvas_advanced.mjs") {
    return route.fulfill({
      contentType: "text/javascript",
      body: readFileSync(join(runtimeDir, "canvas_advanced.mjs")),
    });
  }
  if (path.endsWith(".wasm")) {
    return route.fulfill({
      contentType: "application/wasm",
      body: readFileSync(join(runtimeDir, "rive.wasm")),
    });
  }
  return route.fulfill({ status: 404, body: "" });
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error(`[page] ${e.message}`));
await page.goto(`${ORIGIN}/`);
await page.waitForFunction("window.ready === true", null, { timeout: 60_000 });

const head = ["file", ...sizes.flatMap((s) => RATIOS.map((r) => `${s}@${r}x`))];
console.log(`| ${head.join(" | ")} |`);
console.log(`| ${head.map(() => "---").join(" | ")} |`);
const digests = [];
for (const name of files) {
  const bytes = readFileSync(join(dir, `${name}.riv`));
  // biome-ignore lint/performance/noAwaitInLoops: one file at a time on one page
  const rows = await page.evaluate(
    ([b64, job]) => window.measure(b64, job),
    [
      bytes.toString("base64"),
      {
        sizes,
        ratios: RATIOS,
        bleed: BLEED,
        page: PAGE_DARK,
        light: Boolean(args.light),
      },
    ]
  );
  console.log(
    `| ${name}${rows[0].hasPixel ? "" : " (no pixel)"} | ${rows
      .map(
        (r) =>
          `${r.rim.toFixed(2)} px, ${Math.round(r.share * 100)}% ≥3:1, p10 ${r.p10.toFixed(1)}:1`
      )
      .join(" | ")} |`
  );
  if (args.light) {
    digests.push(`${name} light ${rows.map((r) => r.lightDigest).join(" ")}`);
  }
}
for (const d of digests) {
  console.log(d);
}
await browser.close();
