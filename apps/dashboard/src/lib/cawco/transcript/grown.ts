/**
 * The composer grown upward out of its history button: the shape the recall
 * wheel rolls in, and the one row that says a queued message is being
 * edited. It is drawn behind the pill, absolutely, so the transcript above
 * never moves, and while it stands the pill's own surface steps aside: the
 * grown shape is the composer.
 *
 * It grows as one piece: the whole pill rises at full width, its top corners
 * rounding all the way, the side with the history button a little ahead, so
 * the top leans toward the button and levels out as it rises; then its
 * shoulders curve in. What stands in it (the wheel's rows, the editing row)
 * is clipped to it, so it comes up out of the button with the shape and
 * folds back into it. The wheel's rows run between its sides at their height
 * (`inset`), so they follow the shoulders' curve.
 *
 * Its edge is the pill's border (`--border-control`), and stays the border
 * while the field has keyboard focus: the grown composer draws no ring.
 *
 * Its far edge goes out of focus (`frosted`): the app's progressive blur
 * (progressive-blur.ts) over its top band, a row and the room over it, above
 * what stands in the shape, so the farthest rows blur into the edge with the
 * transcript behind it. Each layer is cut to the shape on its own. The blur
 * and the drop come in once the shape stands still; nothing that moves
 * carries a backdrop filter.
 *
 * Every size is measured once, before it is made (`measureShape`); a frame
 * only writes.
 *
 * A parked ask grows the same shape to hold its card (Composer): its sides
 * rise straight (`taper: false`), since nothing in it leans back, and its
 * top is solid to the edge (`fade: false`), since its first line is the
 * ask's title, not an oldest row going out of sight.
 */
import { dur, easeDrawer, motionOk } from "../motion/curves.svelte";
import { layerBlur, layerMask, PROGRESSIVE_BLUR } from "./progressive-blur";

/** How far the shoulders curve in for each row of height, as a share of the width. */
const TAPER = 0.022;
/** Points sampled along each curve of a side, for `inset`. */
const SAMPLES = 48;

/** The composer's sizes, read once before anything is written. */
export interface ShapeSize {
  /** The pill's height: the shape's foot. */
  base: number;
  /** Where the history button's middle is, from the shell's inline start. */
  bx: number;
  /** The room left over the top row, grown, for its fade. */
  headroom: number;
  /** The pill's corner radius. */
  r: number;
  /** One wheel row: the field's one-line height. */
  row: number;
  w: number;
}

/** A box the shape cuts, placed off the shell's inline start and foot. */
export interface ClipBox {
  bottom: number;
  height: number;
  left: number;
}

type Map2 = (x: number, y: number) => string;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

let made = 0;

export class GrownShape {
  /** How far it has grown: 0 is the pill, 1 is grown. */
  open = 0;
  /** How far above the pill it reaches, grown. */
  ext: number;
  readonly #size: ShapeSize;
  readonly #halo: HTMLDivElement;
  readonly #svg: SVGSVGElement;
  readonly #path: SVGPathElement;
  /** Its drop, a copy of the outline under it that only fades. */
  readonly #drop: HTMLDivElement;
  readonly #dropSvg: SVGSVGElement;
  readonly #dropPath: SVGPathElement;
  /** Until when the drop can be seen: for good while it is up, then as it fades out. */
  #dropUntil = 0;
  readonly #mid: SVGStopElement;
  readonly #edge: SVGStopElement;
  readonly #bands: HTMLDivElement[] = [];
  readonly #clips = new Map<HTMLElement, () => ClipBox>();
  readonly #taper: boolean;
  readonly #fade: boolean;
  /** The sides' inset by height, grown, and the reach it was worked out for. */
  #sides: { ext: number; at: number[]; inset: number[] } | null = null;
  #frame = 0;
  #done: (() => void) | null = null;
  /** What the drop and the blur wait on after the next morph lands, besides it. */
  #after: Promise<void> | null = null;

  constructor(
    host: HTMLElement,
    size: ShapeSize,
    ext: number,
    {
      frosted,
      taper = true,
      fade = true,
    }: { frosted: boolean; taper?: boolean; fade?: boolean }
  ) {
    this.#size = size;
    this.ext = ext;
    this.#taper = taper;
    this.#fade = fade;
    // The frosted bands are the faded top's; a solid top has none.
    const clear = fade ? "stop-opacity: 0" : "";
    made += 1;
    const fill = `grown-fill-${made}`;
    const edge = `grown-edge-${made}`;
    if (frosted && fade) {
      for (const layer of PROGRESSIVE_BLUR) {
        const band = document.createElement("div");
        band.className = "grown-band";
        band.setAttribute("aria-hidden", "true");
        band.style.backdropFilter = layerBlur(layer);
        band.style.setProperty("-webkit-backdrop-filter", layerBlur(layer));
        band.style.maskImage = layerMask(layer);
        band.style.setProperty("-webkit-mask-image", layerMask(layer));
        host.append(band);
        this.#bands.push(band);
      }
    }
    // The drop is its own copy of the outline, its shadow fixed, coming in
    // and out by its opacity alone: a shadow's filter changing under the
    // far edge's backdrop blur brought WebKit's compositor down (Playwright
    // WebKit, ten opens and folds: a filter transition on the shape crashed
    // the page; an opacity transition on this copy did not).
    this.#drop = document.createElement("div");
    this.#drop.className = "grown-drop";
    this.#drop.setAttribute("aria-hidden", "true");
    this.#drop.innerHTML = `<svg><path fill="url(#${fill})"/></svg>`;
    host.append(this.#drop);
    this.#dropSvg = this.#drop.querySelector("svg") as SVGSVGElement;
    this.#dropPath = this.#drop.querySelector("path") as SVGPathElement;
    this.#halo = document.createElement("div");
    this.#halo.className = "grown-halo";
    this.#halo.setAttribute("aria-hidden", "true");
    // Solid, not the composer's glass: the transcript must not read through
    // what stands in it. Only the top of the grown part fades.
    this.#halo.innerHTML = `<svg><defs>
      <linearGradient id="${fill}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style="stop-color: var(--surface-raised); ${clear}"/>
        <stop offset="0.2" style="stop-color: var(--surface-raised)"/>
        <stop offset="1" style="stop-color: var(--surface-raised)"/>
      </linearGradient>
      <linearGradient id="${edge}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="${fade ? 0.04 : 0}" style="stop-color: var(--border-control); ${clear}"/>
        <stop offset="0.32" style="stop-color: var(--border-control)"/>
        <stop offset="1" style="stop-color: var(--border-control)"/>
      </linearGradient>
    </defs><path fill="url(#${fill})" stroke="url(#${edge})" stroke-width="1"/></svg>`;
    host.append(this.#halo);
    this.#svg = this.#halo.querySelector("svg") as SVGSVGElement;
    this.#path = this.#halo.querySelector("path") as SVGPathElement;
    const stops = this.#halo.querySelectorAll("stop");
    this.#mid = stops[1];
    this.#edge = stops[4];
  }

  get base(): number {
    return this.#size.base;
  }

  /** The pill grew or shrank under it (a field growing as it is edited). */
  set base(base: number) {
    this.#size.base = base;
    this.paint();
  }

  /** How far the shoulders curve in, grown. */
  taper(ext = this.ext): number {
    if (!this.#taper) {
      return 0;
    }
    const { row, w, headroom } = this.#size;
    return (TAPER * (Math.max(0, (ext - headroom) / row) + 0.5) * w) / 2;
  }

  /**
   * The drop and the blur come in once the next morph has landed and `still`
   * has resolved too: what stands in the shape has stopped moving. Rows
   * still rolling under a fresh shadow and backdrop blur cost WebKit a
   * frame in three (Playwright WebKit: every slow frame of an open fell
   * after the shape landed, while the roll's spring settled).
   */
  settleAfter(still: Promise<void>): void {
    this.#after = still;
  }

  /** The band at the top that goes out of focus: a row and the room over it. */
  get edge(): number {
    return this.#size.row + this.#size.headroom;
  }

  /**
   * How far in from the shell's inline edges the grown shape's sides stand
   * at `h` px above its foot: the outline's own curves, worked out once per
   * reach and read off a table, so a frame only does arithmetic.
   */
  inset(h: number): number {
    if (this.#sides?.ext !== this.ext) {
      this.#sides = this.#side();
    }
    const { at, inset } = this.#sides;
    const y = this.#size.base + this.ext - h;
    if (y <= at[0]) {
      return inset[0];
    }
    for (let i = 1; i < at.length; i += 1) {
      if (y <= at[i]) {
        const t = (y - at[i - 1]) / (at[i] - at[i - 1] || 1);
        return lerp(inset[i - 1], inset[i], t);
      }
    }
    return 0;
  }

  /**
   * The grown outline's right side, top down, as (y from its top, inset)
   * pairs: the top corner's quarter, the shoulder's curve, then straight
   * down the pill. The sides are mirror images grown.
   */
  #side(): { ext: number; at: number[]; inset: number[] } {
    const { w, r } = this.#size;
    const { ext } = this;
    const k = this.taper();
    const R = w - k;
    const at: number[] = [];
    const inset: number[] = [];
    const push = (x: number, y: number) => {
      at.push(y);
      inset.push(w - x);
    };
    // The corner: Q from (R - r, 0) through (R, 0) to (R, r).
    for (let i = 0; i <= SAMPLES; i += 1) {
      const t = i / SAMPLES;
      const u = 1 - t;
      push(u * u * (R - r) + 2 * u * t * R + t * t * R, t * t * r);
    }
    // The shoulder: C from (R, r) through (R, r + (ext - r) * 0.35) and
    // (w, ext - (ext - r) * 0.55) to (w, ext), the pill's top.
    const y1 = r + (ext - r) * 0.35;
    const y2 = ext - (ext - r) * 0.55;
    for (let i = 1; i <= SAMPLES; i += 1) {
      const t = i / SAMPLES;
      const u = 1 - t;
      const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
      push(
        b[0] * R + b[1] * R + b[2] * w + b[3] * w,
        b[0] * r + b[1] * y1 + b[2] * y2 + b[3] * ext
      );
    }
    return { ext, at, inset };
  }

  /** Cut `el` to the shape, in the box `box` says it stands in. */
  clip(el: HTMLElement, box: () => ClipBox): void {
    this.#clips.set(el, box);
    this.paint();
  }

  /**
   * The grown composer at `p` (0: the pill, 1: grown). `map` places each
   * point in another box; the shape's own box has its foot on the shell's.
   */
  outline(p: number, map: Map2 = (x, y) => `${x} ${y}`) {
    const { w, base, bx, r } = this.#size;
    const { ext } = this;
    const near = easeDrawer(p * 1.25);
    const far = easeDrawer(p * 1.25 - 0.15);
    const [hR, hL] =
      bx >= w / 2 ? [ext * near, ext * far] : [ext * far, ext * near];
    const up = Math.max(hR, hL);
    const height = base + up;
    const tR = up - hR;
    const tL = up - hL;
    const pw = easeDrawer(clamp01((p - 0.25) / 0.75));
    const k = this.taper() * pw;
    const L = k;
    const R = w - k;
    // Each side runs straight up to the pill's top, then sweeps in to its
    // rounded top corner.
    const sR = Math.max(tR + r, up);
    const sL = Math.max(tL + r, up);
    const P = map;
    let d = `M ${P(r, height)} L ${P(w - r, height)} A ${r} ${r} 0 0 0 ${P(w, height - r)} L ${P(w, sR)}`;
    d += ` C ${P(w, sR - (sR - tR - r) * 0.55)} ${P(R, tR + r + (sR - tR - r) * 0.35)} ${P(R, tR + r)}`;
    d += ` Q ${P(R, tR)} ${P(R - r, tR)}`;
    // The top eases from one side's height to the other's.
    const span = R - L - 2 * r;
    d += ` C ${P(R - r - span * 0.4, tR)} ${P(L + r + span * 0.4, tL)} ${P(L + r, tL)}`;
    d += ` Q ${P(L, tL)} ${P(L, tL + r)}`;
    d += ` C ${P(L, tL + r + (sL - tL - r) * 0.35)} ${P(0, sL - (sL - tL - r) * 0.55)} ${P(0, sL)}`;
    d += ` L ${P(0, height - r)} A ${r} ${r} 0 0 0 ${P(r, height)} Z`;
    return { d, height, up };
  }

  /** The shape as `path()`, in a box `box` placed in the shell. */
  #cut(height: number, box: ClipBox, p = this.open): string {
    const top = height - box.bottom - box.height;
    return `path("${
      this.outline(
        p,
        (x, y) => `${(x - box.left).toFixed(1)} ${(y - top).toFixed(1)}`
      ).d
    }")`;
  }

  /** Writes the shape where it is now. Writes only. */
  paint(): number {
    const { d, height, up } = this.outline(this.open);
    const view = `0 0 ${this.#size.w} ${height}`;
    // The drop follows only while it can be seen: redrawing its shadow every
    // frame of a growth it is clear for cost WebKit a frame in six.
    const drawn = performance.now() < this.#dropUntil;
    for (const [box, svg, path] of [
      [this.#halo, this.#svg, this.#path],
      ...(drawn ? [[this.#drop, this.#dropSvg, this.#dropPath] as const] : []),
    ] as const) {
      box.style.height = `${height}px`;
      svg.setAttribute("viewBox", view);
      path.setAttribute("d", d);
    }
    // Behind every row it is solid; only the grown top fades, where the
    // oldest row is fading already.
    if (this.#fade) {
      this.#mid.setAttribute(
        "offset",
        String(Math.min(24, up * 0.25) / height)
      );
      this.#edge.setAttribute(
        "offset",
        String(Math.min(40, up * 0.4) / height)
      );
    }
    for (const [el, box] of this.#clips) {
      el.style.clipPath = this.#cut(height, box());
    }
    return height;
  }

  /** The drop and the far edge's blur, once it stands grown. */
  #settle(): void {
    if (this.open !== 1) {
      return;
    }
    this.#dropUntil = Number.POSITIVE_INFINITY;
    const height = this.paint();
    // Every layer covers the whole band and keeps its own slice of it.
    const tall = Math.min(this.edge, height);
    const box = { left: 0, bottom: height - tall, height: tall };
    for (const band of this.#bands) {
      band.style.bottom = `${box.bottom}px`;
      band.style.height = `${tall}px`;
      band.style.clipPath = this.#cut(height, box);
      band.classList.add("settled");
    }
    this.#drop.classList.add("settled");
  }

  /**
   * Grows or folds to `open`, reaching `ext` above the pill, over `ms` on
   * the drawer curve; with `base`, its foot glides to that height on the
   * same curve (a field growing or shrinking under it as it folds). Turns
   * back from wherever it is drawn. With reduced motion it lands at once.
   */
  morphTo(
    open: number,
    ext: number,
    ms: number,
    base = this.#size.base
  ): Promise<void> {
    cancelAnimationFrame(this.#frame);
    this.#done?.();
    // A drop that was up follows the shape while it fades out.
    if (this.#dropUntil === Number.POSITIVE_INFINITY) {
      this.#dropUntil = performance.now() + dur("--dur-fade");
    }
    this.#drop.classList.remove("settled");
    for (const band of this.#bands) {
      band.classList.remove("settled");
    }
    const fromOpen = this.open;
    const fromExt = this.ext;
    const fromBase = this.#size.base;
    return new Promise((done) => {
      this.#done = done;
      const land = () => {
        this.#done = null;
        const after = this.#after;
        this.#after = null;
        if (after) {
          // Once what moves in it stands still too, unless it has moved on.
          after.then(() => {
            if (!this.#done) {
              this.#settle();
            }
          });
        } else {
          this.#settle();
        }
        done();
      };
      if (!motionOk.current || ms <= 0) {
        this.open = open;
        this.ext = ext;
        this.#size.base = base;
        this.paint();
        land();
        return;
      }
      let start: number | null = null;
      const frame = (now: number) => {
        start ??= now;
        const t = Math.min(1, (now - start) / ms);
        this.open = lerp(fromOpen, open, t);
        this.ext = lerp(fromExt, ext, easeDrawer(t));
        this.#size.base = lerp(fromBase, base, easeDrawer(t));
        this.paint();
        if (t < 1) {
          this.#frame = requestAnimationFrame(frame);
        } else {
          land();
        }
      };
      this.#frame = requestAnimationFrame(frame);
    });
  }

  remove(): void {
    cancelAnimationFrame(this.#frame);
    this.#done?.();
    this.#halo.remove();
    this.#drop.remove();
    for (const band of this.#bands) {
      band.remove();
    }
    for (const el of this.#clips.keys()) {
      el.style.clipPath = "";
    }
    this.#clips.clear();
  }
}

/**
 * Where the field stands in the shell: its foot is the foot of its last
 * line, the line the wheel's pick sits on; `height` is the whole field's,
 * every line of the draft in it.
 */
export interface LineBox {
  bottom: number;
  height: number;
  left: number;
  width: number;
}

/**
 * The sizes a grown shape stands on, read in one pass: the shell, its pill,
 * the history button it grows out of, the field's one-line height (one
 * wheel row) and its last line. The room over the top row is a step of the
 * spacing ladder. Read before anything is written, so growing costs the page
 * one layout, in the frame it is drawn.
 */
export function measureShape(
  shell: HTMLElement,
  pill: HTMLElement,
  button: HTMLElement,
  field: HTMLElement
): { size: ShapeSize; line: LineBox } {
  const box = shell.getBoundingClientRect();
  const at = button.getBoundingClientRect();
  const text = field.getBoundingClientRect();
  const style = getComputedStyle(shell);
  return {
    size: {
      w: box.width,
      base: pill.offsetHeight,
      bx: at.left + at.width / 2 - box.left,
      r: Number.parseFloat(getComputedStyle(pill).borderTopLeftRadius) || 0,
      headroom: Number.parseFloat(style.getPropertyValue("--space-2")),
      row: Number.parseFloat(style.getPropertyValue("--c-composer-field")),
    },
    line: {
      left: text.left - box.left,
      bottom: box.bottom - text.bottom,
      height: text.height,
      width: field.clientWidth,
    },
  };
}
