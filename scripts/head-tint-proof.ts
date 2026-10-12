#!/usr/bin/env bun
/**
 * The transcript's head under the chosen tab, measured by its pixels: the
 * bench (apps/dashboard /motion/head-tint, no hub) with the real PaneTabs
 * over the real SessionPanes, at 1440×900 and at 390×844 (touch), light and
 * dark, device scale 2.
 *
 *   CAWCO_DEV_HUB_URL=http://127.0.0.1:9 vite dev --port 5317   (apps/dashboard)
 *   bun scripts/head-tint-proof.ts [--url http://localhost:5317] [--out $TMPDIR] [--tag final]
 *
 * Chromium is `CHROMIUM_BIN`, or Playwright's chromium-1243; its rendering is
 * pinned as folder-tabs-proof pins it (`FONTS_CONF`, `--disable-gpu`).
 *
 * The sheet is `--tab-sheet` as the browser draws it (the tint layer's own
 * computed background, filled on a canvas), and the chosen tab's foot as the
 * screenshot shows it, 1px above the shelf's line at the tab's middle.
 * ΔE is CIE76 in Lab (D65), from the screenshot's own sRGB pixels.
 *
 * For each width and theme:
 *
 *  - top: scrolled to the top, every band layer's computed opacity, and the
 *    band's pixels against the same frame with the band hidden (its largest
 *    ΔE): absent means 0 and 0;
 *  - edge: scrolled to rows under the band at eight offsets, the band's top
 *    device row against the sheet at every pixel across the transcript
 *    (its largest ΔE) and the chosen tab's foot against the sheet; and the
 *    same top row with the tint layer hidden (the blur alone, as before);
 *  - ramp: a flat probe ground (`--ink-strong`, painted on the scroller for
 *    this measure only, so the backdrop under the band is one colour) at the
 *    band's middle column: each device row's ΔE to the sheet, foot to edge,
 *    which must fall monotonically, and the tint's share there,
 *    (pixel − ground) / (sheet − ground), against inOutCubic;
 *  - rows: over the real rows, each device row's largest ΔE to the sheet
 *    across the transcript, foot to edge, at one offset;
 *  - switch: from the chosen tab to its next, every CSS transition on the
 *    bench paused and seeked to 0, 25, 50, 75 and 100% of the switch, the
 *    band's top row (largest ΔE to the sheet) and both tabs' feet each frame.
 *
 * Writes <tag>-head-tint.json, and <tag>-head-tint-<w>-<theme>.png (the
 * strip and the band, scrolled to rows) for the review.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one browser page measures one frame at a time; each step waits on the one before.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

declare global {
  interface Window {
    __ht: { ids: string[]; choose: (id: string) => void; chosen: () => string };
  }
}

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};
const BASE = flag("--url", "http://localhost:5317");
const OUT = flag("--out", process.env.TMPDIR ?? ".");
const TAG = flag("--tag", "final");
const EXE =
  process.env.CHROMIUM_BIN ??
  "/home/bewinxed/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const FONTS_CONF = join(import.meta.dir, "folder-tabs-proof.fonts.conf");
const VIEWS = [
  { w: 1440, h: 900, touch: false },
  { w: 390, h: 844, touch: true },
];
const THEMES = ["light", "dark"] as const;
const SCALE = 2;
const PCTS = [0, 25, 50, 75, 100];

type RGB = [number, number, number];

/** sRGB 0–255 to CIE Lab (D65). */
function lab([r, g, b]: RGB): RGB {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.040_45 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.412_456_4 * R + 0.357_576_1 * G + 0.180_437_5 * B) / 0.950_47;
  const y = 0.212_672_9 * R + 0.715_152_2 * G + 0.072_175 * B;
  const z = (0.019_333_9 * R + 0.119_192 * G + 0.950_304_1 * B) / 1.088_83;
  const f = (t: number) =>
    t > 216 / 24_389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dE = (a: RGB, b: RGB) => {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const round = (n: number, d = 2) => Number(n.toFixed(d));
const inOutCubic = (x: number) =>
  x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;

/** A screenshot of the clip (css px), as rows of device pixels. */
async function pixels(
  page: Page,
  clip: { x: number; y: number; width: number; height: number }
): Promise<{ w: number; h: number; at: (x: number, y: number) => RGB }> {
  const shot = await page.screenshot({ clip, animations: "allow" });
  const { w, h, data } = await page.evaluate(
    async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      return {
        w: c.width,
        h: c.height,
        data: Array.from(ctx.getImageData(0, 0, c.width, c.height).data),
      };
    },
    `data:image/png;base64,${shot.toString("base64")}`
  );
  return {
    w,
    h,
    at: (x, y) => {
      const i = (y * w + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    },
  };
}

/** The chosen pane's parts: its scroller, its band, the strip's foot, the tabs' middles. */
function layout(page: Page) {
  return page.evaluate(() => {
    const chosen = window.__ht.chosen();
    const slot = document.querySelector(
      `[data-pane="${chosen}"]`
    ) as HTMLElement;
    const band = (
      slot.querySelector(".head-fade") as HTMLElement
    ).getBoundingClientRect();
    const tr = (
      slot.querySelector(".tr") as HTMLElement
    ).getBoundingClientRect();
    const tabs = [
      ...document.querySelectorAll<HTMLElement>(".session-tabs .tab"),
    ].map((tab) => {
      const r = tab.getBoundingClientRect();
      return {
        id: tab
          .querySelector("[data-session-tab]")
          ?.getAttribute("data-session-tab"),
        mid: r.left + r.width / 2,
        bottom: r.bottom,
      };
    });
    return {
      chosen,
      band: { x: band.left, y: band.top, w: band.width, h: band.height },
      tr: { x: tr.left, w: tr.width },
      tabs,
    };
  });
}

/** `--tab-sheet` as the browser draws it: the tint's computed fill, on a canvas. */
function sheet(page: Page): Promise<RGB> {
  return page.evaluate(() => {
    const chosen = window.__ht.chosen();
    const tint = document.querySelector(
      `[data-pane="${chosen}"] .head-fade .tint`
    ) as HTMLElement;
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    ctx.fillStyle = getComputedStyle(tint).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  });
}

const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

async function scrollTo(page: Page, top: number) {
  await page.evaluate((y) => {
    const chosen = window.__ht.chosen();
    const tr = document.querySelector(
      `[data-pane="${chosen}"] .tr`
    ) as HTMLElement;
    tr.scrollTop = y;
  }, top);
  await frames(page);
  await page.waitForTimeout(80);
}

/** Hides (or shows again) the band, or only its tint, in the chosen pane. */
function hide(page: Page, what: ".head-fade" | ".tint" | null) {
  return page.evaluate((sel) => {
    document.getElementById("ht-probe")?.remove();
    if (sel) {
      const style = document.createElement("style");
      style.id = "ht-probe";
      style.textContent = `${sel === ".tint" ? ".head-fade .tint" : sel} { visibility: hidden !important; }`;
      document.head.append(style);
    }
  }, what);
}

/** The top device row's largest ΔE to `ref` across the transcript, and where. */
async function edgeRow(
  page: Page,
  L: Awaited<ReturnType<typeof layout>>,
  ref: RGB
) {
  const px = await pixels(page, {
    x: L.tr.x,
    y: L.band.y,
    width: L.tr.w,
    height: 1,
  });
  let worst = 0;
  let at = 0;
  for (let x = 0; x < px.w; x += 1) {
    const d = dE(px.at(x, 0), ref);
    if (d > worst) {
      worst = d;
      at = x;
    }
  }
  return { max: round(worst), atCssX: round(L.tr.x + at / SCALE, 1) };
}

/** The chosen tab's foot, 1px above the shelf's line at its middle. */
async function foot(
  page: Page,
  L: Awaited<ReturnType<typeof layout>>,
  id: string
) {
  const tab = L.tabs.find((t) => t.id === id);
  if (!tab) {
    throw new Error(`no tab ${id}`);
  }
  const px = await pixels(page, {
    x: tab.mid,
    y: tab.bottom - 1,
    width: 1,
    height: 1,
  });
  return px.at(0, 0);
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox", "--disable-gpu"],
  env:
    process.platform === "linux"
      ? { ...process.env, FONTCONFIG_FILE: FONTS_CONF }
      : process.env,
});

async function open(page: Page, theme: string) {
  await page.goto(`${BASE}/motion/head-tint?theme=${theme}&at=1`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () =>
      window.__ht &&
      document.querySelector(
        `[data-pane="${window.__ht.chosen()}"] .tr .msg`
      ) &&
      document.querySelectorAll(".session-tabs .tab").length === 4,
    null,
    { timeout: 60_000 }
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (run) => run instanceof CSSTransition && run.playState === "running"
        )
        .map((run) => run.finished.catch(() => undefined))
    )
  );
  await page.waitForTimeout(400);
}

mkdirSync(OUT, { recursive: true });
const report: Record<string, unknown> = {};
const fails: string[] = [];
for (const view of VIEWS) {
  for (const theme of THEMES) {
    const key = `${view.w}-${theme}`;
    const context = await browser.newContext({
      viewport: { width: view.w, height: view.h },
      deviceScaleFactor: SCALE,
      hasTouch: view.touch,
      isMobile: view.touch,
      colorScheme: theme,
    });
    await context.addInitScript((t) => {
      localStorage.setItem("cawco-theme", t);
    }, theme);
    const page = await context.newPage();
    await open(page, theme);
    let L = await layout(page);
    const ref = await sheet(page);
    const max = await page.evaluate(() => {
      const tr = document.querySelector(
        `[data-pane="${window.__ht.chosen()}"] .tr`
      ) as HTMLElement;
      return tr.scrollHeight - tr.clientHeight;
    });

    // Absent at the top.
    await scrollTo(page, 0);
    const opacities = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `[data-pane="${window.__ht.chosen()}"] .head-fade .layer`
        ),
      ].map((layer) => Number(getComputedStyle(layer).opacity))
    );
    const bandClip = {
      x: L.tr.x,
      y: L.band.y,
      width: L.tr.w,
      height: L.band.h,
    };
    const shown = await pixels(page, bandClip);
    await hide(page, ".head-fade");
    await frames(page);
    const bare = await pixels(page, bandClip);
    await hide(page, null);
    let topDiff = 0;
    for (let y = 0; y < shown.h; y += 1) {
      for (let x = 0; x < shown.w; x += 1) {
        topDiff = Math.max(topDiff, dE(shown.at(x, y), bare.at(x, y)));
      }
    }
    const top = {
      layerOpacity: opacities,
      maxDeltaEAgainstNoBand: round(topDiff),
    };

    // The edge, over rows, at eight offsets; and the blur alone.
    const edge: unknown[] = [];
    let edgeWorst = 0;
    for (let k = 1; k <= 8; k += 1) {
      const y = Math.round((max * k) / 9);
      await scrollTo(page, y);
      L = await layout(page);
      const withTint = await edgeRow(page, L, ref);
      await hide(page, ".tint");
      await frames(page);
      const blurOnly = await edgeRow(page, L, ref);
      await hide(page, null);
      await frames(page);
      edgeWorst = Math.max(edgeWorst, withTint.max);
      edge.push({ scrollTop: y, withTint, blurOnly });
    }
    const tabFoot = await foot(page, L, L.chosen);
    const footDeltaE = round(dE(tabFoot, ref));

    // Over the real rows, at the middle offset: each row's largest ΔE.
    await scrollTo(page, Math.round(max / 2));
    L = await layout(page);
    await page.screenshot({
      path: join(OUT, `${TAG}-head-tint-${key}.png`),
      clip: { x: 0, y: 0, width: view.w, height: L.band.y + L.band.h + 96 },
    });
    const band = await pixels(page, {
      x: L.tr.x,
      y: L.band.y,
      width: L.tr.w,
      height: L.band.h,
    });
    const rows: number[] = [];
    for (let y = band.h - 1; y >= 0; y -= 1) {
      let m = 0;
      for (let x = 0; x < band.w; x += 1) {
        m = Math.max(m, dE(band.at(x, y), ref));
      }
      rows.push(round(m));
    }

    // The ramp over a flat probe ground.
    await page.evaluate(() => {
      const style = document.createElement("style");
      style.id = "ht-ground";
      style.textContent = `[data-pane="${window.__ht.chosen()}"] .tr { background: var(--ink-strong) !important; } [data-pane="${window.__ht.chosen()}"] .tr * { visibility: hidden !important; }`;
      document.head.append(style);
    });
    await frames(page);
    await page.waitForTimeout(80);
    const mid = L.tr.x + L.tr.w / 2;
    const col = await pixels(page, {
      x: mid,
      y: L.band.y,
      width: 1,
      height: L.band.h + 4,
    });
    const ground = col.at(0, col.h - 1);
    const ramp: {
      row: number;
      deltaE: number;
      share: number;
      inOutCubic: number;
    }[] = [];
    // Foot (last band row) up to the edge (row 0).
    const bandRows = L.band.h * SCALE;
    for (let y = bandRows - 1; y >= 0; y -= 1) {
      const p = col.at(0, y);
      const span = ref.map((s, i) => s - ground[i]);
      const share =
        span.reduce((sum, d, i) => sum + d * (p[i] - ground[i]), 0) /
        span.reduce((sum, d) => sum + d * d, 0);
      const x = (bandRows - y - 0.5) / bandRows;
      ramp.push({
        row: bandRows - 1 - y,
        deltaE: round(dE(p, ref)),
        share: round(share, 3),
        inOutCubic: round(inOutCubic(x), 3),
      });
    }
    await page.evaluate(() => document.getElementById("ht-ground")?.remove());
    let monotonic = true;
    for (let i = 1; i < ramp.length; i += 1) {
      if (ramp[i].deltaE > ramp[i - 1].deltaE + 0.05) {
        monotonic = false;
      }
    }
    const shareGap = Math.max(
      ...ramp.map((r) => Math.abs(r.share - r.inOutCubic))
    );

    // The switch, frame by frame.
    await frames(page);
    const from = L.chosen;
    const ids = await page.evaluate(() => window.__ht.ids);
    const to = ids[(ids.indexOf(from) + 1) % ids.length];
    await page.evaluate((id) => window.__ht.choose(id), to);
    await frames(page);
    const clock = await page.evaluate(() => {
      const runs = document
        .getAnimations()
        .filter((run) => run instanceof CSSTransition);
      const endOf = (run: Animation) =>
        Number(run.effect?.getComputedTiming().endTime ?? 0);
      for (const run of runs) {
        run.pause();
      }
      return { runs: runs.length, ms: Math.max(0, ...runs.map(endOf)) };
    });
    const switchFrames: unknown[] = [];
    let switchWorst = 0;
    for (const pct of PCTS) {
      await page.evaluate(
        (at) => {
          for (const run of document.getAnimations()) {
            if (run instanceof CSSTransition) {
              const end = Number(run.effect?.getComputedTiming().endTime ?? 0);
              run.currentTime = Math.min(end, at);
            }
          }
        },
        (clock.ms * pct) / 100
      );
      await page.waitForTimeout(60);
      const Ls = await layout(page);
      const e = await edgeRow(page, Ls, ref);
      const fromFoot = await foot(page, Ls, from);
      const toFoot = await foot(page, Ls, to);
      switchWorst = Math.max(switchWorst, e.max);
      switchFrames.push({
        pct,
        bandTopMaxDeltaE: e.max,
        leavingTabFootDeltaE: round(dE(fromFoot, ref)),
        takingTabFootDeltaE: round(dE(toFoot, ref)),
      });
    }

    const pass = {
      absentAtTop:
        top.layerOpacity.every((o) => o === 0) &&
        top.maxDeltaEAgainstNoBand < 0.5,
      edgeIsSheet: edgeWorst < 1 && footDeltaE < 1,
      rampMonotonic: monotonic,
      switchFollows: switchWorst < 1,
    };
    for (const [rule, ok] of Object.entries(pass)) {
      if (!ok) {
        fails.push(`${key} ${rule}`);
      }
    }
    report[key] = {
      sheet: ref,
      chosenTabFoot: { rgb: tabFoot, deltaE: footDeltaE },
      top,
      edge,
      edgeWorstDeltaE: round(edgeWorst),
      rowsFootToEdge: rows,
      ramp: {
        ground,
        monotonic,
        maxShareGapFromInOutCubic: round(shareGap, 3),
        rows: ramp,
      },
      switch: {
        from,
        to,
        clock,
        frames: switchFrames,
        worst: round(switchWorst),
      },
      pass,
    };
    console.log(key, JSON.stringify(pass), {
      edgeWorst: round(edgeWorst),
      footDeltaE,
      topDiff: round(topDiff),
      shareGap: round(shareGap, 3),
      switchWorst: round(switchWorst),
    });
    await context.close();
  }
}
await browser.close();
writeFileSync(
  join(OUT, `${TAG}-head-tint.json`),
  JSON.stringify(report, null, 2)
);
console.log(
  fails.length
    ? `FAIL: ${fails.join(", ")}`
    : "PASS: every rule, every width and theme"
);
process.exit(fails.length ? 1 : 0);
