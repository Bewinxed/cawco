#!/usr/bin/env bun
/**
 * Both folder strips, measured by their pixels: the bench
 * (apps/dashboard /motion/folder-proof, no hub) with the real PaneTabs
 * (five tabs in mixed statuses) and the real WorkTabs (Working and
 * Finished), at 1440×900 and at 390×844 (touch), light and dark, device
 * scale 2. Each strip is measured in turn; the session strip switches
 * from its second tab to its third, the home's from Working to Finished.
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
 * home's as <tag>-work-switch-… and <tag>-work-rest-<theme>.png. The
 * numbers go to <tag>-folder-proof.json, and the pass/fail table of every
 * rule (`RULES`) per strip, width and theme to <tag>-folder-proof-table.md.
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

/**
 * A folder strip on the bench: where it stands (`root`), what one of its
 * tabs is (`tab`, the item the track lays out), how many it holds, and its
 * captures' names.
 */
interface Strip {
  /** The bench's handle on it: `window.__ft`, or `window.__ft.work`. */
  api: "session" | "work";
  count: number;
  /** <tag>-<rest>-<theme>.png, and <tag>-<switch>-<width>-<theme>-<pct>pct.png. */
  rest: string;
  /**
   * Whether it draws a rim (PaneTabs): the stroke, corner and 3:1 rules
   * are a rim's. WorkTabs has none by design (5c57755c: the chosen sheet
   * is its only mark); its sheet's edge is checked instead (`sheetEdges`).
   */
  rim: boolean;
  root: string;
  switch: string;
  tab: string;
}
const STRIPS: Strip[] = [
  {
    api: "session",
    root: '[data-strip="session"]',
    tab: ".tab",
    count: 5,
    rim: true,
    rest: "rest-session",
    switch: "switch",
  },
  {
    api: "work",
    root: '[data-strip="work"]',
    tab: ".ff-tab",
    count: 2,
    rim: false,
    rest: "work-rest",
    switch: "work-switch",
  },
];

interface Bench {
  choose: (id: string) => void;
  chosen: () => string | null;
  ids: string[];
}
declare global {
  interface Window {
    __ft: Bench & { work: Bench };
  }
}

interface Box {
  height: number;
  width: number;
  x: number;
  y: number;
}

/** Where the strip stands, in css px, with its room, inside the viewport. */
function clipOf(page: Page, strip: Strip): Promise<Box> {
  return page.evaluate(
    ({ room, root }) => {
      const track = document.querySelector(
        `${root} .ff-tabs-list`
      ) as HTMLElement;
      const r = track.getBoundingClientRect();
      const x = Math.max(0, Math.floor(r.left - room));
      const y = Math.max(0, Math.floor(r.top - room));
      const right = Math.min(innerWidth, Math.ceil(r.right + room));
      const bottom = Math.min(innerHeight, Math.ceil(r.bottom + room));
      return { x, y, width: right - x, height: bottom - y };
    },
    { room: ROOM, root: strip.root }
  );
}

/**
 * Which side draws each shared edge, as the eye sees it: each side's rim
 * piece hidden in turn, the pixels down the edge's side (under the
 * shoulders, to the shelf) that change. The tab in front's side changes
 * them; a side under its neighbour's card changes none. One side drawing
 * is one edge; both is two strokes. A strip with no rim pieces (WorkTabs)
 * has its tab's own shapes (card and sheet) hidden instead: the edge the
 * eye sees is then the one that moves.
 */
async function sidesDrawn(page: Page, strip: Strip) {
  const seams = await page.evaluate(({ root, tab }) => {
    const track = document.querySelector(
      `${root} .ff-tabs-list`
    ) as HTMLElement;
    const tr = track.getBoundingClientRect();
    const radius =
      Number.parseFloat(getComputedStyle(track).getPropertyValue("--radius")) ||
      0;
    const tabs = [
      ...document.querySelectorAll<HTMLElement>(`${root} ${tab}`),
    ].map((el) => el.getBoundingClientRect());
    return tabs.slice(0, -1).flatMap((a, i) => {
      const b = tabs[i + 1];
      const lo = Math.min(b.left, a.right) - 4;
      const hi = Math.max(b.left, a.right) + 4;
      if (lo < tr.left + 1 || hi > tr.right - 1) {
        return [];
      }
      const top = Math.max(a.top, b.top) + radius;
      return [
        {
          i,
          box: {
            x: lo,
            y: top,
            width: hi - lo,
            height: Math.min(a.bottom, b.bottom) - top,
          },
        },
      ];
    });
  }, strip);
  const hide = (i: number, side: "start" | "end", hidden: boolean) =>
    page.evaluate(
      ({ k, s, h, root, tab: sel }) => {
        const tab = document.querySelectorAll<HTMLElement>(`${root} ${sel}`)[k];
        const piece = tab.querySelector<HTMLElement>(
          `.rim-side[data-side="${s}"]`
        );
        if (piece) {
          piece.style.visibility = h ? "hidden" : "";
          return;
        }
        if (!document.getElementById("proof-hide")) {
          const style = document.createElement("style");
          style.id = "proof-hide";
          style.textContent =
            "[data-proof-hide]::before,[data-proof-hide]::after{visibility:hidden!important}";
          document.head.append(style);
        }
        tab.toggleAttribute("data-proof-hide", h);
      },
      { k: i, s: side, h: hidden, root: strip.root, tab: strip.tab }
    );
  /**
   * The pixels inside `box` that differ between two whole-viewport
   * captures. Whole, as the screen draws it: a capture clipped to the
   * seam's small box is rendered on its own, and at 1440 mid-switch it
   * showed a 3px stub of the side behind on the shoulder's last row that
   * neither the whole viewport nor a smaller clip of the same frame shows.
   */
  const changed = async (box: Box, base: Buffer, shot: Buffer) =>
    page.evaluate(
      async ({ one, two, box: b }) => {
        const read = async (src: string) => {
          const img = new Image();
          img.src = src;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          const ctx = c.getContext("2d") as CanvasRenderingContext2D;
          ctx.drawImage(img, 0, 0);
          const s = img.naturalWidth / innerWidth;
          const x = Math.floor(b.x * s);
          const y = Math.floor(b.y * s);
          return ctx.getImageData(
            x,
            y,
            Math.ceil((b.x + b.width) * s) - x,
            Math.ceil((b.y + b.height) * s) - y
          ).data;
        };
        const p = await read(one);
        const q = await read(two);
        let n = 0;
        for (let k = 0; k < p.length; k += 4) {
          if (
            Math.abs(p[k] - q[k]) +
              Math.abs(p[k + 1] - q[k + 1]) +
              Math.abs(p[k + 2] - q[k + 2]) >
            24
          ) {
            n += 1;
          }
        }
        return n;
      },
      {
        one: `data:image/png;base64,${base.toString("base64")}`,
        two: `data:image/png;base64,${shot.toString("base64")}`,
        box,
      }
    );
  const out: { between: string; leftEnd: number; rightStart: number }[] = [];
  for (const { i, box } of seams) {
    const base = await page.screenshot({ animations: "allow" });
    await hide(i, "end", true);
    const left = await page.screenshot({ animations: "allow" });
    await hide(i, "end", false);
    await hide(i + 1, "start", true);
    const right = await page.screenshot({ animations: "allow" });
    await hide(i + 1, "start", false);
    out.push({
      between: `${i}|${i + 1}`,
      leftEnd: await changed(box, base, left),
      rightStart: await changed(box, base, right),
    });
  }
  return out;
}

/**
 * Where each seam's edge shows, against where the glide puts it: with what
 * is written on the tabs hidden, along a row at the tab's mid-height, the
 * device pixel where the fill steps most across the overlap and 4px past
 * it, and the step's contrast (the fills 3px each side of it). The glide
 * puts the edge on the front tab's side, stood in by its cut (TabsList
 * `--cut-start`/`--cut-end` × `--seam-tuck`). A step under 1.02:1 is no
 * edge: the two fills look the same there (mid-switch, at the handover).
 */
async function sheetEdges(page: Page, strip: Strip, region: Box) {
  await page.evaluate(
    ({ root, tab }) => {
      for (const el of document.querySelectorAll<HTMLElement>(
        `${root} ${tab} > *`
      )) {
        el.style.visibility = "hidden";
      }
    },
    { root: strip.root, tab: strip.tab }
  );
  const shot = await page.screenshot({ clip: region, animations: "allow" });
  await page.evaluate(
    ({ root, tab }) => {
      for (const el of document.querySelectorAll<HTMLElement>(
        `${root} ${tab} > *`
      )) {
        el.style.visibility = "";
      }
    },
    { root: strip.root, tab: strip.tab }
  );
  return page.evaluate(
    async ({ src, clip, root, tab }) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext("2d") as CanvasRenderingContext2D;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const scale = c.width / clip.width;
      const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.040_45 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const lum = (x: number, y: number) => {
        const k = (y * c.width + x) * 4;
        return (
          0.2126 * lin(data[k]) +
          0.7152 * lin(data[k + 1]) +
          0.0722 * lin(data[k + 2])
        );
      };
      const ratio = (a: number, b: number) =>
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const track = document.querySelector(
        `${root} .ff-tabs-list`
      ) as HTMLElement;
      const tuck =
        Number.parseFloat(
          getComputedStyle(track).getPropertyValue("--overlap")
        ) -
        (Number.parseFloat(
          getComputedStyle(track).getPropertyValue("--seam-stroke")
        ) || 0);
      const els = [...document.querySelectorAll<HTMLElement>(`${root} ${tab}`)];
      const laid = (el: HTMLElement) => {
        let at = el;
        while (at.parentElement && at.parentElement !== track) {
          at = at.parentElement;
        }
        return at;
      };
      return els.slice(0, -1).map((el, i) => {
        const a = el.getBoundingClientRect();
        const b = els[i + 1].getBoundingClientRect();
        const za = Number(getComputedStyle(laid(el)).getPropertyValue("--z"));
        const zb = Number(
          getComputedStyle(laid(els[i + 1])).getPropertyValue("--z")
        );
        const cut = (e: HTMLElement, side: string) =>
          Number(laid(e).style.getPropertyValue(`--cut-${side}`) || 0);
        const predicted =
          za > zb
            ? a.right - cut(el, "end") * tuck
            : b.left + cut(els[i + 1], "start") * tuck;
        const y = Math.round(((a.top + a.bottom) / 2 - clip.y) * scale);
        const x0 = Math.floor((Math.min(b.left, a.right) - 4 - clip.x) * scale);
        const x1 = Math.ceil((Math.max(b.left, a.right) + 4 - clip.x) * scale);
        let best = { x: 0, step: 0 };
        for (let x = x0; x < x1; x += 1) {
          const step = Math.abs(lum(x + 1, y) - lum(x, y));
          if (step > best.step) {
            best = { x, step };
          }
        }
        const contrast = ratio(lum(best.x - 6, y), lum(best.x + 7, y));
        const at = (best.x + 1) / scale + clip.x;
        return {
          between: `${i}|${i + 1}`,
          front: za > zb ? i : i + 1,
          predicted: r2(predicted),
          at: contrast >= 1.02 ? r2(at) : null,
          contrast: r2(contrast),
        };
      });
    },
    {
      src: `data:image/png;base64,${shot.toString("base64")}`,
      clip: region,
      root: strip.root,
      tab: strip.tab,
    }
  );
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
function seek(page: Page, strip: Strip, p: number) {
  return page.evaluate(
    ({ at, root }) => {
      const host = document.querySelector(root) as HTMLElement;
      const runs = host
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
    },
    // The work strip's own track: its list's rows have motion of their own.
    {
      at: p,
      root: strip.api === "work" ? `${strip.root} .ff-tabs-list` : strip.root,
    }
  );
}

/** The measurements of one frame, taken from its own screenshot. */
async function measure(page: Page, strip: Strip, region: Box, keep: number[]) {
  const shot = await page.screenshot({ clip: region, animations: "allow" });
  const url = `data:image/png;base64,${shot.toString("base64")}`;
  const numbers = await page.evaluate(
    async ({ src, box: clip, kept, root, tabSel }) => {
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
        `${root} .ff-tabs-list`
      ) as HTMLElement;
      const tr = track.getBoundingClientRect();
      const tabs = [
        ...document.querySelectorAll<HTMLElement>(`${root} ${tabSel}`),
      ].map((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const rim = el.querySelector<HTMLElement>(".rim");
        const sides = [...el.querySelectorAll<HTMLElement>(".rim-side")];
        const text = el.querySelector(".label .text") as HTMLElement;
        return {
          el,
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          tone: el.dataset.tone ?? "",
          chosen:
            el.hasAttribute("data-chosen") || el.classList.contains("selected"),
          z: Number(style.getPropertyValue("--z") || 0),
          // A strip with no rim (WorkTabs) draws none: -1.
          rimOpacity: rim ? r2(Number(getComputedStyle(rim).opacity)) : -1,
          // How far each side stands in for a gliding seam (TabsList).
          startShown: r2(Number(el.style.getPropertyValue("--cut-start") || 0)),
          endShown: r2(Number(el.style.getPropertyValue("--cut-end") || 0)),
          sideOpacity: sides.map((s) =>
            r2(Number(getComputedStyle(s).opacity))
          ),
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
        /**
         * Device pixels at half the run's peak or more: one 1.5px stroke
         * is 3 to 4; two strokes side by side, touching, are 6 or more.
         */
        core: number;
        peak: number;
        /**
         * Its separate highs: two strokes touching, one fainter than the
         * other or in another ink, still dip between them.
         */
        peaks: number;
        profile: number[];
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
        run.profile.push(d);
        if (d > run.peak) {
          run.peak = r2(d);
          run.vsA = r2(vsA);
          run.vsB = r2(vsB);
          run.colour = hex(c);
          run.at = r2(dx / scale + clip.x);
        }
        const half = 1 + (run.peak - 1) / 2;
        run.core = run.profile.filter((v) => v >= half).length;
      };
      /** The highs of a run's profile parted by a dip of 0.15 or more. */
      const peaksOf = (profile: number[]) => {
        // Every local high, then each counted apart from the one before it
        // only where the profile dips 0.15 under the lower of the two.
        const last = profile.length - 1;
        const highs = profile.flatMap((v, k) => {
          const up = k === 0 || v >= profile[k - 1];
          const down = k === last || v > profile[k + 1];
          return up && down ? [k] : [];
        });
        let count = Math.min(1, highs.length);
        for (let j = 1; j < highs.length; j += 1) {
          const dip = Math.min(...profile.slice(highs[j - 1], highs[j] + 1));
          const lower = Math.min(profile[highs[j - 1]], profile[highs[j]]);
          count += lower - dip >= 0.15 ? 1 : 0;
        }
        return count;
      };
      /** The 8-connected pieces of an ink mask `w` by `h`, by size. */
      const piecesOf = (ink: Uint8Array, w: number, h: number) => {
        const seen = new Uint8Array(w * h);
        const steps = [-1, 0, 1].flatMap((dy) =>
          [-1, 0, 1].map((dx) => [dx, dy] as const)
        );
        const grow = (start: number) => {
          let size = 0;
          const queue = [start];
          seen[start] = 1;
          while (queue.length > 0) {
            const p = queue.pop() as number;
            size += 1;
            const px = p % w;
            const py = (p - px) / w;
            for (const [dx, dy] of steps) {
              const nx = px + dx;
              const ny = py + dy;
              const q = ny * w + nx;
              const inside = nx >= 0 && ny >= 0 && nx < w && ny < h;
              if (inside && ink[q] && !seen[q]) {
                seen[q] = 1;
                queue.push(q);
              }
            }
          }
          return size;
        };
        const sizes: number[] = [];
        for (let s = 0; s < w * h; s += 1) {
          if (ink[s] && !seen[s]) {
            sizes.push(grow(s));
          }
        }
        return sizes;
      };
      const blank = (): Run => ({
        at: 0,
        peak: 0,
        peaks: 0,
        vsA: 0,
        vsB: 0,
        colour: "",
        core: 0,
        profile: [],
      });
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
        for (const run of runs) {
          run.peaks = peaksOf(run.profile);
          run.profile = [];
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
      const trackStyle = getComputedStyle(track);
      const lengthOf = (name: string) =>
        Number.parseFloat(trackStyle.getPropertyValue(name)) || 0;
      const radius = lengthOf("--radius");
      const flare = lengthOf("--flare");

      /**
       * Every shared edge, row by row (each device row) down its side, from
       * under the shoulders to above the foot: how many strokes each row
       * crosses there. One in every row is one edge.
       */
      const seamRows = tabs.slice(0, -1).flatMap((a, i) => {
        const b = tabs[i + 1];
        const lo = Math.min(b.left, a.right);
        const hi = Math.max(b.left, a.right);
        if (!(inTrack(lo - 2) && inTrack(hi + 2))) {
          return [];
        }
        const fa = fillOf(a);
        const fb = fillOf(b);
        const counts: number[] = [];
        const cores: number[] = [];
        const y0 = Math.max(a.top, b.top) + radius + 3;
        const y1 = Math.min(a.bottom, b.bottom) - flare - 2;
        for (let y = y0; y <= y1; y += 1 / scale) {
          const runs = strokes(lo - 2, hi + 2, y, fa, fb);
          // Each high in a run is a stroke.
          counts.push(runs.reduce((n, r) => n + r.peaks, 0));
          cores.push(Math.max(0, ...runs.map((r) => r.core)));
        }
        // A row is one edge when it crosses one stroke, no wider than one
        // (a 1.5px stroke is 3 device px).
        const off = counts.filter((n, k) => n !== 1 || cores[k] > 3).length;
        return [
          {
            between: `${i}|${i + 1}`,
            rows: counts.length,
            min: Math.min(...counts),
            max: Math.max(...counts),
            widest: Math.max(...cores),
            rowsNotOne: off,
          },
        ];
      });

      /**
       * Where two tabs' tops meet: the stroke pixels in a box round the
       * seam's top (12px each side, from 4px over the higher top to 6px
       * under it, clear of the glyphs), as connected pieces. The front
       * tab's shoulder and the top of the one behind meeting it are one
       * piece; a stub or a notch is two.
       */
      const corners = tabs.slice(0, -1).flatMap((a, i) => {
        const b = tabs[i + 1];
        const lo = Math.min(b.left, a.right);
        const hi = Math.max(b.left, a.right);
        if (!(inTrack(lo - 12) && inTrack(hi + 12))) {
          return [];
        }
        const top = Math.min(a.top, b.top);
        const shelf = shelfAt(lo);
        const refs = [shelf, fillOf(a), fillOf(b)];
        // Clear of the left tab's close glyph (14px in from its end) and
        // the right tab's status glyph (12px in from its start).
        const x0 = Math.round((lo - 5 - clip.x) * scale);
        const x1 = Math.round((hi + 3 - clip.x) * scale);
        const y0 = Math.round((top - 4 - clip.y) * scale);
        const y1 = Math.round((top + radius + 2 - clip.y) * scale);
        const w = x1 - x0 + 1;
        const h = y1 - y0 + 1;
        const ink = new Uint8Array(w * h);
        for (let y = 0; y < h; y += 1) {
          for (let x = 0; x < w; x += 1) {
            const c = at(x0 + x, y0 + y);
            ink[y * w + x] =
              Math.min(...refs.map((r) => contrast(c, r))) >= 1.6 ? 1 : 0;
          }
        }
        const pieces = piecesOf(ink, w, h)
          .filter((n) => n >= 4)
          .sort((p, q) => q - p);
        return [
          { between: `${i}|${i + 1}`, pieces: pieces.length, sizes: pieces },
        ];
      });

      /**
       * Each tab drawn chosen (`kept`): whether it stands wholly inside
       * the track and clear of both edges' fades as drawn (each fade cut
       * short at its cap, TabsList; the phone's start fade runs 1.5 of
       * its length).
       */
      const phone = innerWidth <= 899;
      const capOf = (name: string) => {
        const v = Number.parseFloat(track.style.getPropertyValue(name));
        return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY;
      };
      const fadeIn = Math.min(
        fadeStart * (phone ? 1.5 : 1),
        capOf("--fade-cap-start")
      );
      const fadeOut = Math.min(fadeEnd, capOf("--fade-cap-end"));
      const clear = kept.map((k) => {
        const t = tabs[k];
        return {
          i: k,
          label: t.label,
          clear:
            t.left >= tr.left + fadeIn - 0.5 &&
            t.right <= tr.right - fadeOut + 0.5,
          inFade: {
            start: r2(Math.max(0, tr.left + fadeIn - t.left)),
            end: r2(Math.max(0, t.right - (tr.right - fadeOut))),
          },
          labelWhole: t.labelScroll <= t.labelClient,
        };
      });

      return {
        seamRows,
        corners,
        clear,
        fades: { start: r2(fadeIn), end: r2(fadeOut) },
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
    { src: url, box: region, kept: keep, root: strip.root, tabSel: strip.tab }
  );
  return { shot, numbers };
}

const browser = await chromium.launch({
  executablePath: EXE,
  headless: true,
  args: ["--no-sandbox"],
});
/**
 * The bench in `theme` with tab `at` of the session strip and `work` of the
 * home's chosen, once everything in it has landed.
 */
async function open(page: Page, theme: string, at: number, work: string) {
  await page.goto(
    `${BASE}/motion/folder-proof?theme=${theme}&at=${at}&work=${work}`,
    { waitUntil: "domcontentloaded" }
  );
  await page.waitForFunction(
    (strips) =>
      window.__ft &&
      strips.every(
        (s) =>
          document.querySelectorAll(`${s.root} ${s.tab}`).length === s.count
      ),
    STRIPS,
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
    for (const strip of STRIPS) {
      // The session strip from its second tab to its third; the home's
      // from Working to Finished.
      await open(page, theme, 1, "working");
      const key = `${strip.api}-${view.w}-${theme}`;
      const ids = await page.evaluate(
        (s) => (s.api === "work" ? window.__ft.work : window.__ft).ids,
        strip
      );
      const chosen = await page.evaluate(
        (s) => (s.api === "work" ? window.__ft.work : window.__ft).chosen(),
        strip
      );
      const from = ids.indexOf(chosen ?? ids[0]);
      const next = ids[from + 1];
      const clipRest = await clipOf(page, strip);
      const rest = await measure(page, strip, clipRest, [from]);
      const restSides = await sidesDrawn(page, strip);
      const restSheet = strip.rim
        ? []
        : await sheetEdges(page, strip, clipRest);
      if (view.w === 1440) {
        writeFileSync(
          join(OUT, `${TAG}-${strip.rest}-${theme}.png`),
          rest.shot
        );
      }
      await page.evaluate(
        ({ s, id }) =>
          (s.api === "work" ? window.__ft.work : window.__ft).choose(id),
        { s: strip, id: next }
      );
      await frames(page);
      const paused = await seek(page, strip, 0);
      const switchFrames: Record<string, unknown> = {};
      for (const pct of PCTS) {
        await seek(page, strip, pct / 100);
        await frames(page);
        const clip = await clipOf(page, strip);
        // Both tabs are drawn chosen while the switch runs; the one it
        // leaves no longer once it has landed.
        const frame = await measure(
          page,
          strip,
          clip,
          pct < 100 ? [from, from + 1] : [from + 1]
        );
        const name = `${TAG}-${strip.switch}-${view.w}-${theme}-${String(pct).padStart(3, "0")}pct.png`;
        writeFileSync(join(OUT, name), frame.shot);
        switchFrames[pct] = {
          ...frame.numbers,
          sides: await sidesDrawn(page, strip),
          sheet: strip.rim ? [] : await sheetEdges(page, strip, clip),
        };
      }
      // The session strip at its start (the first tab chosen, nothing
      // scrolled); the home's with Finished chosen.
      await open(page, theme, 0, "finished");
      const other = strip.api === "work" ? 1 : 0;
      const clipFirst = await clipOf(page, strip);
      const restFirst = await measure(page, strip, clipFirst, [other]);
      report[key] = {
        rim: strip.rim,
        rest: { ...rest.numbers, sides: restSides, sheet: restSheet },
        restFirst: {
          ...restFirst.numbers,
          sides: await sidesDrawn(page, strip),
          sheet: strip.rim ? [] : await sheetEdges(page, strip, clipFirst),
        },
        switch: { from: chosen, to: next, paused, frames: switchFrames },
      };
    }
    await context.close();
  }
}
await browser.close();
writeFileSync(
  join(OUT, `${TAG}-folder-proof.json`),
  JSON.stringify(report, null, 2)
);

// The summary: per width and theme, the rest and each switch frame.
type Numbers = Awaited<ReturnType<typeof measure>>["numbers"] & {
  sheet?: Awaited<ReturnType<typeof sheetEdges>>;
  sides?: Awaited<ReturnType<typeof sidesDrawn>>;
};
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
  const rows = n.seamRows
    .map(
      (s) =>
        `${s.between}:${s.min}-${s.max}w${s.widest}(${s.rowsNotOne}/${s.rows} off)`
    )
    .join(" ");
  const corners = n.corners
    .map((c) => `${c.between}:${c.pieces}[${c.sizes.join(",")}]`)
    .join(" ");
  const clear = n.clear
    .map(
      (c) =>
        `${c.i}:${c.clear ? "clear" : `FADED ${c.inFade.start}/${c.inFade.end}`}${c.labelWhole ? "" : " LABEL-CUT"}`
    )
    .join(" ");
  // Each seam: the pixels its left tab's end side and its right tab's
  // start side change; one edge is exactly one of the two.
  const sides = (n.sides ?? [])
    .map(
      (s) =>
        `${s.between}:${s.leftEnd}/${s.rightStart}${(s.leftEnd > 0) === (s.rightStart > 0) ? " BOTH-OR-NONE" : ""}`
    )
    .join(" ");
  // Each seam's sheet edge (a strip with no rim): where it shows against
  // where the glide puts it, and its step.
  const sheet = (n.sheet ?? [])
    .map(
      (s) =>
        `${s.between}:f${s.front} ${s.at ?? "none"}~${s.predicted} (${s.contrast}:1)`
    )
    .join(" ");
  console.log(
    `  ${label}\n    seams ${seams}\n    sides ${sides}\n    rows  ${rows}\n    corner ${corners}\n    sheet ${sheet}\n    chosen ${clear} (fades ${n.fades.start}/${n.fades.end})\n    tabs  ${tabs}`
  );
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

/**
 * The rules, per strip, width and theme, over every frame measured (both
 * rests and the switch's five), each failing frame named:
 *  - one stroke: every shared edge in view crosses exactly one stroke, no
 *    wider than one, in every row down its side, and exactly one of its two
 *    sides draws it, the front tab's;
 *  - corner: where two tops meet, the strokes are one connected piece;
 *  - 3:1: every shared edge's stroke, out of the fades, holds 3:1 against
 *    the fills either side;
 *  - sheet edge (a strip with no rim): every seam's edge, where the two
 *    fills differ, shows within 1px of where the glide puts it, and across
 *    the switch it moves one way only, never back (no jump, no flicker);
 *  - fades: every tab drawn chosen stands clear of both edge fades;
 *  - titles: no tab's title is cut.
 * The first three are a rim's rules: n/a on a strip with none; the sheet
 * edge is n/a on one with a rim, whose seam is its stroke.
 */
const RULES = [
  "one stroke",
  "corner",
  "3:1",
  "sheet edge",
  "fades",
  "titles",
] as const;
type Rule = (typeof RULES)[number];
const RIM_RULES: readonly Rule[] = ["one stroke", "corner", "3:1"];
/** The shared edges a frame measured, the strip's outer two left out. */
const sharedOf = (n: Numbers) =>
  n.edges.filter((e) => !e.between.includes("shelf"));
/** Rows down a seam crossing other than one stroke, and seams both or neither of whose sides draw, or the one behind. */
function strokeFaults(n: Numbers): string[] {
  const rows = n.seamRows.flatMap((s) =>
    s.rowsNotOne > 0 ? [`${s.between} ${s.rowsNotOne}/${s.rows} rows`] : []
  );
  const shared = sharedOf(n);
  const sides = (n.sides ?? []).flatMap((s) => {
    const [left] = s.between.split("|");
    const frontLeft =
      shared.find((e) => e.between === s.between)?.front === left;
    const one = frontLeft
      ? s.leftEnd > 0 && s.rightStart === 0
      : s.rightStart > 0 && s.leftEnd === 0;
    return one ? [] : [`${s.between} sides ${s.leftEnd}/${s.rightStart}`];
  });
  return [...rows, ...sides];
}
/** Seams in view and out of the fades whose stroke holds under 3:1. */
const contrastFaults = (n: Numbers): string[] =>
  sharedOf(n).flatMap((e) => {
    if (e.strokes === "off-view" || e.faded) {
      return [];
    }
    const best = Math.max(0, ...e.strokes.map((s) => Math.min(s.vsA, s.vsB)));
    if (best >= 3) {
      return [];
    }
    return [`${e.between} ${best === 0 ? "no stroke" : `${best}:1`}`];
  });
/** Every rule's faults in one frame. */
const faults = (n: Numbers): Record<Rule, string[]> => ({
  "one stroke": strokeFaults(n),
  corner: n.corners.flatMap((c) =>
    c.pieces === 1 ? [] : [`${c.between} ${c.pieces} pieces`]
  ),
  "3:1": contrastFaults(n),
  "sheet edge": (n.sheet ?? []).flatMap((s) =>
    s.at !== null && Math.abs(s.at - s.predicted) > 1
      ? [`${s.between} at ${s.at}, glide ${s.predicted}`]
      : []
  ),
  fades: n.clear.flatMap((c) =>
    c.clear ? [] : [`${c.i} ${c.inFade.start}/${c.inFade.end}`]
  ),
  titles: n.tabs.flatMap((t) =>
    t.labelCut ? [`${t.i} ${t.labelScroll}>${t.labelClient}`] : []
  ),
});
const table: string[] = [
  `| strip | width | theme | ${RULES.join(" | ")} |`,
  `|---|---|---|${RULES.map(() => "---").join("|")}|`,
];
for (const [key, value] of Object.entries(report)) {
  const v = value as {
    rim: boolean;
    rest: Numbers;
    restFirst: Numbers;
    switch: { frames: Record<string, Numbers> };
  };
  const measured = [
    ["rest", v.rest],
    ["rest2", v.restFirst],
    ...Object.entries(v.switch.frames).map(([p, n]) => [`${p}%`, n]),
  ] as [string, Numbers][];
  // Across the switch each seam's edge moves one way: from the rest before
  // it through its five frames, never back by more than half a pixel.
  const glide: string[] = [];
  const path = [v.rest, ...Object.values(v.switch.frames)];
  for (const [k, seam] of (v.rest.sheet ?? []).entries()) {
    const shown = path.flatMap((n) => {
      const at = n.sheet?.[k]?.at;
      return at === null || at === undefined ? [] : [at];
    });
    const way = Math.sign((shown.at(-1) ?? 0) - (shown[0] ?? 0));
    for (let j = 1; j < shown.length; j += 1) {
      if ((shown[j] - shown[j - 1]) * way < -0.5) {
        glide.push(`${seam.between} back ${shown[j - 1]}→${shown[j]}`);
      }
    }
  }
  const cells = RULES.map((rule) => {
    if (RIM_RULES.includes(rule) && !v.rim) {
      return "n/a (no rim by design)";
    }
    if (rule === "sheet edge" && v.rim) {
      return "n/a (the rim is the edge)";
    }
    const bad = [
      ...measured.flatMap(([at, n]) =>
        faults(n)[rule].map((f) => `${at}: ${f}`)
      ),
      ...(rule === "sheet edge" ? glide : []),
    ];
    return bad.length === 0 ? "pass" : `FAIL (${bad.join("; ")})`;
  });
  const [strip, width, theme] = key.split("-");
  table.push(`| ${strip} | ${width} | ${theme} | ${cells.join(" | ")} |`);
}
console.log(`\n${table.join("\n")}`);
writeFileSync(
  join(OUT, `${TAG}-folder-proof-table.md`),
  `${table.join("\n")}\n`
);
