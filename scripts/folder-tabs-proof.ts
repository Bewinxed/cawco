#!/usr/bin/env bun
/**
 * The session folder tabs, measured by their pixels: the bench
 * (apps/dashboard /motion/folder-proof, the real PaneTabs, five tabs in
 * mixed statuses, no hub) at 1440×900 and at 390×844 (touch), light and
 * dark, device scale 2.
 *
 *   CAWCO_DEV_HUB_URL=http://127.0.0.1:9 bunx vite dev --port 5199   (apps/dashboard)
 *   bun scripts/folder-tabs-proof.ts [--url http://localhost:5199] [--out $TMPDIR] [--tag final]
 *
 * For each width and theme it measures the strip at rest, then chooses the
 * chosen tab's next neighbour, pauses every CSS transition in the strip and
 * seeks them to 0, 25, 50, 75 and 100% of the switch, measuring each frame:
 *
 *  - every shared edge (and the strip's two outer edges): along a row at the
 *    tab's mid-height, the runs of pixels unlike both fills beside the edge
 *    (each a stroke), each with its peak contrast against those fills, and
 *    which tab stands in front there;
 *  - each tab's top rim: its contrast against the shelf above and its own
 *    fill below;
 *  - each tab's fill against the shelf, and its rim's drawn strength;
 *  - the strip's overflow, each tab's visible share of the track, and each
 *    title's scrollWidth against its clientWidth.
 *
 * Contrast is WCAG's, from the screenshot's own pixels. Every frame is also
 * written as <tag>-switch-<width>-<theme>-<pct>pct.png (the strip plus 24px
 * each side), and the 1440 rest as <tag>-rest-session-<theme>.png; the
 * numbers go to <tag>-folder-proof.json.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one browser page measures one frame at a time; each step waits on the one before.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright-core";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : (args[at + 1] ?? fallback);
};
const BASE = flag("--url", "http://localhost:5199");
const OUT = flag("--out", process.env.TMPDIR ?? ".");
const TAG = flag("--tag", "final");
const EXE =
  process.env.CHROMIUM_BIN ??
  "/home/bewinxed/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const PCTS = [0, 25, 50, 75, 100];
const VIEWS = [
  { w: 1440, h: 900, touch: false },
  { w: 390, h: 844, touch: true },
];
const THEMES = ["light", "dark"] as const;
/** Room round the strip in every capture, css px. */
const ROOM = 24;

declare global {
  interface Window {
    __ft: {
      choose: (id: string) => void;
      chosen: () => string | null;
      ids: string[];
    };
  }
}

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** Where the strip stands, in css px, with its room, inside the viewport. */
function clipOf(page: Page): Promise<Box> {
  return page.evaluate((room) => {
    const track = document.querySelector(
      "[data-folder-proof] .ff-tabs-list"
    ) as HTMLElement;
    const r = track.getBoundingClientRect();
    const x = Math.max(0, Math.floor(r.left - room));
    const y = Math.max(0, Math.floor(r.top - room));
    const right = Math.min(innerWidth, Math.ceil(r.right + room));
    const bottom = Math.min(innerHeight, Math.ceil(r.bottom + room));
    return { x, y, width: right - x, height: bottom - y };
  }, ROOM);
}

/** Waits two frames: Svelte's flush, the style pass, the track's ranking. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

/**
 * Every CSS transition in the strip, paused at the same moment of the
 * switch: `p` of the longest one's end (the choice's clock, delays
 * included), each one held at its own end once past it.
 */
function seek(page: Page, p: number) {
  return page.evaluate((at) => {
    const strip = document.querySelector("[data-folder-proof]") as HTMLElement;
    const runs = strip
      .getAnimations({ subtree: true })
      .filter((run) => run instanceof CSSTransition);
    const endOf = (run: Animation) =>
      Number(run.effect?.getComputedTiming().endTime ?? 0);
    const clock = Math.max(0, ...runs.map(endOf));
    for (const run of runs) {
      run.pause();
      run.currentTime = Math.min(endOf(run), clock * at);
    }
    return { paused: runs.length, clock };
  }, p);
}

/** The measurements of one frame, taken from its own screenshot. */
async function measure(page: Page, region: Box) {
  const shot = await page.screenshot({ clip: region, animations: "allow" });
  const url = `data:image/png;base64,${shot.toString("base64")}`;
  const numbers = await page.evaluate(
    async ({ src, box: clip }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("no 2d context");
      }
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const scale = canvas.width / clip.width;
      type Rgb = [number, number, number];
      /** The pixel at device px (dx, dy) of the capture. */
      const at = (dx: number, dy: number): Rgb => {
        const x = Math.min(canvas.width - 1, Math.max(0, Math.round(dx)));
        const y = Math.min(canvas.height - 1, Math.max(0, Math.round(dy)));
        const i = (y * canvas.width + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };
      /** The pixel at page css px (x, y). */
      const css = (x: number, y: number) =>
        at((x - clip.x) * scale, (y - clip.y) * scale);
      const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = ([r, g, b]: Rgb) =>
        0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const contrast = (a: Rgb, b: Rgb) => {
        const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (hi + 0.05) / (lo + 0.05);
      };
      const hex = (c: Rgb) =>
        `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const r2 = (n: number) => Math.round(n * 100) / 100;

      const track = document.querySelector(
        "[data-folder-proof] .ff-tabs-list"
      ) as HTMLElement;
      const tr = track.getBoundingClientRect();
      const tabs = [
        ...document.querySelectorAll<HTMLElement>("[data-folder-proof] .tab"),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const rim = el.querySelector(".rim") as HTMLElement;
        const sides = [...el.querySelectorAll<HTMLElement>(".rim-side")];
        const text = el.querySelector(".label .text") as HTMLElement;
        return {
          el,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          tone: el.dataset.tone ?? "",
          chosen: el.hasAttribute("data-chosen"),
          z: Number(style.getPropertyValue("--z") || 0),
          rimOpacity: r2(Number(getComputedStyle(rim).opacity)),
          startShown: r2(Number(getComputedStyle(sides[0]).opacity)),
          endShown: r2(Number(getComputedStyle(sides[1]).opacity)),
          label: text.textContent ?? "",
          labelScroll: text.scrollWidth,
          labelClient: text.clientWidth,
        };
      });
      /** The row a side is read along: the tab's mid-height, between shoulder and foot. */
      const rowY = (t: (typeof tabs)[number]) => (t.top + t.bottom) / 2;

      /**
       * The strokes across [from, to] css px along row y: runs of device
       * pixels unlike both `a` (the fill before) and `b` (the fill after) by
       * more than 1.15:1, each with its peak contrast against the nearer of
       * the two and its colour there.
       */
      interface Run {
        at: number;
        colour: string;
        peak: number;
        vsA: number;
        vsB: number;
      }
      /** Keeps the pixel at device x `dx` as the run's peak when it is the most unlike. */
      const peakAt = (
        run: Run,
        dx: number,
        c: Rgb,
        vsA: number,
        vsB: number
      ) => {
        const d = Math.min(vsA, vsB);
        if (d > run.peak) {
          run.peak = r2(d);
          run.vsA = r2(vsA);
          run.vsB = r2(vsB);
          run.colour = hex(c);
          run.at = r2(dx / scale + clip.x);
        }
      };
      const blank = (): Run => ({ at: 0, peak: 0, vsA: 0, vsB: 0, colour: "" });
      function strokes(from: number, to: number, y: number, a: Rgb, b: Rgb) {
        const runs: Run[] = [];
        let current: Run | null = null;
        let gap = 0;
        const x0 = (from - clip.x) * scale;
        const x1 = (to - clip.x) * scale;
        const dy = (y - clip.y) * scale;
        for (let dx = Math.floor(x0); dx <= Math.ceil(x1); dx += 1) {
          const c = at(dx, dy);
          const vsA = contrast(c, a);
          const vsB = contrast(c, b);
          const ink = Math.min(vsA, vsB) >= 1.15;
          // One pixel like the fills inside a stroke does not end it.
          gap = ink ? 0 : gap + 1;
          if (gap > 1) {
            current = null;
          }
          if (ink) {
            current ??= runs[runs.push(blank()) - 1];
            peakAt(current, dx, c, vsA, vsB);
          }
        }
        return runs;
      }

      // The shelf: above the tabs, inside the group's top pad.
      const shelfAt = (x: number) => css(x, tr.top - 8);
      /**
       * A tab's own fill, where nothing is drawn on it: under its title and
       * controls, over its foot, at its middle. The fills beside a stroke
       * are these (the glow round a stroke is part of the stroke as seen).
       */
      const fillOf = (t: (typeof tabs)[number]) => css(fillX(t), t.bottom - 3);
      /**
       * Where a tab's fill is read across: its middle, or the nearest point
       * of it in the track's unfaded view, 16px clear of its ends.
       */
      const fillX = (t: (typeof tabs)[number]) =>
        Math.min(
          Math.max(
            (t.left + t.right) / 2,
            t.left + 16,
            tr.left + fadeStart * 1.5
          ),
          t.right - 16,
          tr.right - fadeEnd
        );
      /** How far a fill is read clear of an edge's stroke: past its 6px glow. */
      const CLEAR = 7;
      const fadeStart = Number.parseFloat(
        getComputedStyle(track).getPropertyValue("--fade-start") || "0"
      );
      const fadeEnd = Number.parseFloat(
        getComputedStyle(track).getPropertyValue("--fade-end") || "0"
      );
      /** Whether x is inside the track's view at all. */
      const inTrack = (x: number) => x > tr.left + 1 && x < tr.right - 1;
      /** Whether x lies under one of the track's edge fades. */
      const fadedAt = (x: number) =>
        x < tr.left + fadeStart * 1.5 + 3 || x > tr.right - fadeEnd - 3;
      const edges: {
        between: string;
        front: string;
        faded: boolean;
        strokes: ReturnType<typeof strokes> | "off-view";
      }[] = [];
      /**
       * One edge: the strokes across [lo, hi] (2-3px past each side) along
       * row y, against the fills `a` and `b` read at xa and xb. Off view
       * where the edge or either fill is scrolled out of the track; faded
       * where the edge lies under an edge fade (measured all the same).
       */
      const edge = (
        between: string,
        front: string,
        lo: number,
        hi: number,
        pad: number,
        y: number,
        a: { at: number; c: Rgb },
        b: { at: number; c: Rgb }
      ) =>
        edges.push({
          between,
          front,
          faded: fadedAt(lo) || fadedAt(hi),
          strokes:
            inTrack(lo) &&
            inTrack(hi) &&
            (Math.abs(a.at) === Number.POSITIVE_INFINITY || inTrack(a.at)) &&
            (Math.abs(b.at) === Number.POSITIVE_INFINITY || inTrack(b.at)) &&
            a.at <= lo - CLEAR &&
            b.at >= hi + CLEAR
              ? strokes(lo - pad, hi + pad, y, a.c, b.c)
              : "off-view",
        });
      // The strip's leading outer edge, each shared edge, its trailing outer
      // edge. A shared edge is read across the overlap and 2px past it each
      // side: clear of the close glyph before it (14px in from the end) and
      // the status glyph after it (12px in from the start).
      const [first] = tabs;
      const last = tabs.at(-1) as (typeof tabs)[number];
      edge(
        "shelf|0",
        "0",
        first.left,
        first.left,
        3,
        rowY(first),
        // The shelf is read above the strip, clear of the glow and of the
        // track's ends: no place along the row to check.
        { at: Number.NEGATIVE_INFINITY, c: shelfAt(first.left) },
        { at: fillX(first), c: fillOf(first) }
      );
      for (let i = 0; i < tabs.length - 1; i += 1) {
        const a = tabs[i];
        const b = tabs[i + 1];
        edge(
          `${i}|${i + 1}`,
          a.z > b.z ? String(i) : String(i + 1),
          Math.min(b.left, a.right),
          Math.max(b.left, a.right),
          2,
          Math.min(rowY(a), rowY(b)),
          { at: fillX(a), c: fillOf(a) },
          { at: fillX(b), c: fillOf(b) }
        );
      }
      edge(
        `${tabs.length - 1}|shelf`,
        String(tabs.length - 1),
        last.right,
        last.right,
        3,
        rowY(last),
        { at: fillX(last), c: fillOf(last) },
        { at: Number.POSITIVE_INFINITY, c: shelfAt(last.right) }
      );

      const perTab = tabs.map((t, i) => {
        const mid = (t.left + t.right) / 2;
        const fill = css(mid, t.bottom - 3);
        const shelf = shelfAt(mid);
        // The top rim: down the tab's middle, through its top edge.
        let topPeak = 0;
        let topVsShelf = 0;
        let topVsFill = 0;
        const below = css(mid, t.top + 7);
        for (let y = t.top - 4; y <= t.top + 5; y += 1 / scale) {
          const c = css(mid, y);
          const d = Math.min(contrast(c, shelf), contrast(c, below));
          if (d > topPeak) {
            topPeak = d;
            topVsShelf = contrast(c, shelf);
            topVsFill = contrast(c, below);
          }
        }
        // A hard line where the track clips the glow over the tab's top:
        // the device row just inside the track's top edge against the one
        // just outside it.
        const rowIn = Math.ceil((tr.top - clip.y) * scale);
        const dxMid = (mid - clip.x) * scale;
        const glowCut = r2(contrast(at(dxMid, rowIn), at(dxMid, rowIn - 1)));
        const vis =
          Math.max(0, Math.min(t.right, tr.right) - Math.max(t.left, tr.left)) /
          (t.right - t.left);
        return {
          i,
          tone: t.tone,
          chosen: t.chosen,
          z: t.z,
          rimOpacity: t.rimOpacity,
          startShown: t.startShown,
          endShown: t.endShown,
          fill: hex(fill),
          fillVsShelf: r2(contrast(fill, shelf)),
          glowCut,
          topVsShelf: r2(topVsShelf),
          topVsFill: r2(topVsFill),
          visible: r2(vis),
          left: r2(t.left),
          right: r2(t.right),
          label: t.label,
          labelCut: t.labelScroll > t.labelClient,
          labelScroll: t.labelScroll,
          labelClient: t.labelClient,
          rimTopY: r2(t.top),
        };
      });
      return {
        track: {
          left: r2(tr.left),
          right: r2(tr.right),
          top: r2(tr.top),
          scrollWidth: track.scrollWidth,
          clientWidth: track.clientWidth,
          scrollLeft: r2(track.scrollLeft),
          fadeStart: getComputedStyle(track).getPropertyValue("--fade-start"),
          fadeEnd: getComputedStyle(track).getPropertyValue("--fade-end"),
          overflowY: getComputedStyle(track).overflowY,
          paddingTop: getComputedStyle(track).paddingTop,
        },
        tabs: perTab,
        edges,
      };
    },
    { src: url, box: region }
  );
  return { shot, numbers };
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox"],
});
/** The bench in `theme` with tab `at` chosen, once everything in it has landed. */
async function open(page: Page, theme: string, at: number) {
  await page.goto(`${BASE}/motion/folder-proof?theme=${theme}&at=${at}`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForFunction(
    () =>
      window.__ft &&
      document.querySelectorAll("[data-folder-proof] .tab").length === 5,
    undefined,
    { timeout: 60_000 }
  );
  await page.evaluate(() => document.fonts.ready);
  // Every finite transition and animation on the page has landed.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter(
          (run) =>
            Number.isFinite(
              Number(run.effect?.getComputedTiming().endTime ?? 0)
            ) && run.playState === "running"
        )
        .map((run) => run.finished.catch(() => undefined))
    )
  );
  await page.waitForTimeout(300);
}

mkdirSync(OUT, { recursive: true });
const report: Record<string, unknown> = {};
for (const view of VIEWS) {
  for (const theme of THEMES) {
    const context = await browser.newContext({
      viewport: { width: view.w, height: view.h },
      deviceScaleFactor: 2,
      hasTouch: view.touch,
      isMobile: view.touch,
      colorScheme: theme,
    });
    await context.addInitScript((t) => {
      localStorage.setItem("cawco-theme", t);
    }, theme);
    const page = await context.newPage();
    await open(page, theme, 1);
    const key = `${view.w}-${theme}`;
    const clipRest = await clipOf(page);
    const rest = await measure(page, clipRest);
    if (view.w === 1440) {
      writeFileSync(join(OUT, `${TAG}-rest-session-${theme}.png`), rest.shot);
    }
    const ids = await page.evaluate(() => window.__ft.ids);
    const chosen = await page.evaluate(() => window.__ft.chosen());
    const next = ids[ids.indexOf(chosen ?? ids[0]) + 1];
    await page.evaluate((id) => window.__ft.choose(id), next);
    await frames(page);
    const paused = await seek(page, 0);
    const switchFrames: Record<string, unknown> = {};
    for (const pct of PCTS) {
      await seek(page, pct / 100);
      await frames(page);
      const clip = await clipOf(page);
      const frame = await measure(page, clip);
      const name = `${TAG}-switch-${view.w}-${theme}-${String(pct).padStart(3, "0")}pct.png`;
      writeFileSync(join(OUT, name), frame.shot);
      switchFrames[pct] = frame.numbers;
    }
    // The strip at its start: the first tab chosen, nothing scrolled.
    await open(page, theme, 0);
    const restFirst = await measure(page, await clipOf(page));
    report[key] = {
      rest: rest.numbers,
      restFirst: restFirst.numbers,
      switch: { from: chosen, to: next, paused, frames: switchFrames },
    };
    await context.close();
  }
}
await browser.close();
writeFileSync(
  join(OUT, `${TAG}-folder-proof.json`),
  JSON.stringify(report, null, 2)
);

// The summary: per width and theme, the rest and each switch frame.
type Numbers = Awaited<ReturnType<typeof measure>>["numbers"];
const line = (label: string, n: Numbers) => {
  const seams = n.edges
    .map((e) =>
      e.strokes === "off-view"
        ? `${e.between}:off`
        : `${e.between}:${e.strokes.length}[${e.strokes.map((s) => `${s.vsA}/${s.vsB}@${s.colour}`).join(",")}]f${e.front}${e.faded ? "~faded" : ""}`
    )
    .join(" ");
  const tabs = n.tabs
    .map(
      (t) =>
        `${t.i}${t.chosen ? "*" : ""}${t.tone[0]} op${t.rimOpacity} s${t.startShown}/${t.endShown} fill${t.fillVsShelf} cut${t.glowCut} top${t.topVsShelf}/${t.topVsFill} vis${t.visible}${t.labelCut ? " CUT" : ""}`
    )
    .join(" | ");
  console.log(`  ${label}\n    seams ${seams}\n    tabs  ${tabs}`);
};
for (const [key, value] of Object.entries(report)) {
  const v = value as {
    rest: Numbers;
    restFirst: Numbers;
    switch: {
      frames: Record<string, Numbers>;
      paused: { clock: number; paused: number };
    };
  };
  console.log(`${key} (track ${JSON.stringify(v.rest.track)})`);
  line("rest", v.rest);
  line(
    `rest, first tab chosen (track scrollLeft ${v.restFirst.track.scrollLeft}, fades ${v.restFirst.track.fadeStart}/${v.restFirst.track.fadeEnd})`,
    v.restFirst
  );
  for (const [pct, n] of Object.entries(v.switch.frames)) {
    line(
      `switch ${pct}% of ${v.switch.paused.clock}ms (${v.switch.paused.paused} transitions paused)`,
      n
    );
  }
}
