/**
 * The composer grown upward out of its pill: the shape the recall wheel
 * rolls in, and the one row that says a queued message is being edited. It
 * is drawn behind the pill, absolutely, so the transcript above never moves,
 * and while it stands the pill's own surface steps aside: the grown shape is
 * the composer.
 *
 * It grows as one piece: the whole pill rises at full width from its top
 * edge, evenly across it, its top corners rounding all the way; then its
 * shoulders curve in, by at most `taperRows` rows' worth however tall it
 * stands. What stands in it (the wheel's rows, the editing row) is clipped
 * to it, so it comes up out of the pill with the shape and folds back into
 * it. The wheel's rows stand inside its sides at their height (`inset`).
 *
 * Its edge is the pill's border (`--border-control`), and stays the border
 * while the field has keyboard focus: the grown composer draws no ring.
 *
 * The room over its top row is where a wheel row rolling past it goes out of
 * sight (RecallWheel). The wheel's shape is solid to its edge (`fade:
 * false`), so nothing behind it shows through; the queued edit's row fades
 * its top.
 *
 * Its drop comes in once it stands still, and is drawn once: a copy of the
 * outline under it with the shadow fixed. Folding, the copy shrinks with the
 * shape and fades out by a compositor animation (transform and opacity), so
 * no frame of the fold redraws a shadow.
 *
 * Every size is measured once, before it is made (`measureShape`); a frame
 * only writes.
 *
 * A parked ask grows the same shape to hold its card (Composer): its sides
 * rise straight (`taper: false`), since nothing in it leans back, and its
 * top is solid to the edge (`fade: false`), since its first line is the
 * ask's title, not an oldest row going out of sight.
 *
 * The composer's canvas may stand wider than the pill (`wide`): its top
 * reaches past the pill's edges by `wide.left` and `wide.right`: each side
 * steps out from the pill's edge over the pill's upper side, so the canvas
 * stands whole on the pill's top and its shoulders meet the pill's edges,
 * the step growing with the shoulders. The outline is drawn past the
 * shell's box (its SVG overflows), so nothing else moves. The wheel never
 * widens, so `inset` reads the pill's width.
 */
import { easeDrawer, motionOk } from "../motion/curves.svelte";

/** How far the shoulders curve in for each row of height, as a share of the width. */
const TAPER = 0.022;
/** Points sampled along each curve of a side, for `inset`. */
const SAMPLES = 48;
/** Keyframes the drop's fold is sampled at, off the outline's own height. */
const DROP_STEPS = 12;

/** The composer's sizes, read once before anything is written. */
export interface ShapeSize {
  /** The pill's height: the shape's foot. */
  base: number;
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

/** One shadow of a `--shadow-*` token: its offset, its blur and its colour. */
interface Shadow {
  blur: number;
  color: string;
  dx: number;
  dy: number;
}
const SHADOW =
  /^\s*(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+([\d.]+)(?:px)?\s+(.+?)\s*$/;
/** A one-shadow token as written (`0 14px 28px <colour>`), or null. */
function shadowOf(value: string): Shadow | null {
  const m = SHADOW.exec(value);
  return m
    ? { dx: Number(m[1]), dy: Number(m[2]), blur: Number(m[3]), color: m[4] }
    : null;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

let made = 0;

export class GrownShape {
  /** How far it has grown: 0 is the pill, 1 is grown. */
  open = 0;
  /** How far above the pill it reaches, grown. */
  ext: number;
  /** How far its grown top reaches past the pill's left and right edges, px. */
  wide = { left: 0, right: 0 };
  readonly #size: ShapeSize;
  readonly #halo: HTMLDivElement;
  readonly #svg: SVGSVGElement;
  readonly #path: SVGPathElement;
  /** Its drop, a copy of the outline under it, drawn once it stands. */
  readonly #drop: HTMLDivElement;
  readonly #dropSvg: SVGSVGElement;
  readonly #dropPath: SVGPathElement;
  /** The drop's shadow, and how far past the outline it reaches. */
  readonly #dropFilter: SVGFilterElement;
  readonly #dropReach: number;
  /** The drop's fold, while it runs. */
  #dropFold: Animation | null = null;
  readonly #mid: SVGStopElement;
  readonly #edge: SVGStopElement;
  readonly #clips = new Map<HTMLElement, () => ClipBox>();
  readonly #taper: boolean;
  /** The most rows of height the shoulders curve in for. */
  readonly #taperRows: number;
  readonly #fade: boolean;
  /** The sides' inset by height, grown, and the reach it was worked out for. */
  #sides: { ext: number; at: number[]; inset: number[] } | null = null;
  #frame = 0;
  #done: (() => void) | null = null;
  /** What the drop waits on after the next morph lands, besides it. */
  #after: Promise<void> | null = null;
  /** The shell's laid-out width, followed: the shape is always as wide as it. */
  readonly #follow: ResizeObserver;

  constructor(
    host: HTMLElement,
    size: ShapeSize,
    ext: number,
    {
      taper = true,
      taperRows = Number.POSITIVE_INFINITY,
      fade = true,
    }: { taper?: boolean; taperRows?: number; fade?: boolean } = {}
  ) {
    this.#size = size;
    this.ext = ext;
    this.#taper = taper;
    this.#taperRows = taperRows;
    this.#fade = fade;
    const clear = fade ? "stop-opacity: 0" : "";
    made += 1;
    const fill = `grown-fill-${made}`;
    const edge = `grown-edge-${made}`;
    // The drop is its own copy of the outline, its shadow drawn into it,
    // moving by transform and opacity alone: a shadow's filter changing
    // brought WebKit's compositor down (Playwright WebKit, ten opens and
    // folds: a filter transition on the shape crashed the page). The shadow
    // is the SVG's own filter, painted once with the outline, never a CSS
    // filter on the layer: WebKit applies a layer's filter again every frame
    // the layer moves (Playwright WebKit at 390, a fold's slow frames 3.75 a
    // round with it, 0.25 without), and draws no CSS filter on an SVG path.
    const shadows = ["--shadow-drop", "--shadow-drop-near"]
      .map((token) => shadowOf(getComputedStyle(host).getPropertyValue(token)))
      .filter((s): s is Shadow => s !== null);
    const lay = shadows
      .map(
        ({ dx, dy, blur, color }) =>
          `<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${blur / 2}" style="flood-color: ${color}"/>`
      )
      .join("");
    this.#dropReach = Math.max(
      0,
      ...shadows.map(
        (s) => Math.max(Math.abs(s.dx), Math.abs(s.dy)) + s.blur * 1.5
      )
    );
    const shade = `grown-drop-${made}`;
    this.#drop = document.createElement("div");
    this.#drop.className = "grown-drop";
    this.#drop.setAttribute("aria-hidden", "true");
    this.#drop.innerHTML = `<svg><defs><filter id="${shade}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${lay}</filter></defs><path fill="url(#${fill})" filter="url(#${shade})"/></svg>`;
    host.append(this.#drop);
    this.#dropSvg = this.#drop.querySelector("svg") as SVGSVGElement;
    this.#dropPath = this.#drop.querySelector("path") as SVGPathElement;
    this.#dropFilter = this.#drop.querySelector("filter") as SVGFilterElement;
    this.#halo = document.createElement("div");
    this.#halo.className = "grown-halo";
    this.#halo.setAttribute("data-slot", "grown-halo");
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
    // The shell resized (the window, the panel): the shape takes its width,
    // its border box as laid out, which no transform it stands in changes.
    // Its first report lands the fraction `offsetWidth` rounded away.
    this.#follow = new ResizeObserver(([entry]) => {
      const w = entry?.borderBoxSize[0]?.inlineSize ?? host.offsetWidth;
      if (w > 0 && Math.abs(w - this.#size.w) >= 0.01) {
        this.#size.w = w;
        this.#sides = null;
        this.paint();
        if (this.#drop.classList.contains("settled")) {
          this.#settle();
        }
      }
    });
    this.#follow.observe(host);
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
    const rows = Math.min(this.#taperRows, Math.max(0, (ext - headroom) / row));
    return (TAPER * (rows + 0.5) * w) / 2;
  }

  /**
   * The drop comes in once the next morph has landed and `still` has
   * resolved too: what stands in the shape has stopped moving. Rows still
   * rolling under a fresh shadow cost WebKit a frame in three (Playwright
   * WebKit: every slow frame of an open fell after the shape landed, while
   * the roll's spring settled).
   */
  settleAfter(still: Promise<void>): void {
    this.#after = still;
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
   * How far in from its reach each side of the grown outline stands `y` px
   * below its top: the shoulder's curve, which runs from the pill's top to
   * the top corner (`outline` at 1), found by halving.
   */
  taperAt(y: number): number {
    const { r } = this.#size;
    const k = this.taper();
    const s = Math.max(r, this.ext);
    const d = s - r;
    if (y >= s) {
      return 0;
    }
    // y(t) falls from s at t = 0 to r at t = 1; x(t) moves in by k·(3t² - 2t³).
    const yAt = (at: number) => {
      const u = 1 - at;
      return (
        u * u * u * s +
        3 * u * u * at * (s - d * 0.55) +
        3 * u * at * at * (r + d * 0.35) +
        at * at * at * r
      );
    };
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (yAt(mid) > y) {
        lo = mid;
      } else {
        hi = mid;
      }
    }
    const t = (lo + hi) / 2;
    return k * (3 * t * t - 2 * t * t * t);
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
    const { w, base, r } = this.#size;
    const { ext } = this;
    // Up from the pill's top evenly across it: the top stays level.
    const up = ext * easeDrawer(p * 1.25);
    const height = base + up;
    const tR = 0;
    const tL = 0;
    const pw = easeDrawer(clamp01((p - 0.25) / 0.75));
    const k = this.taper() * pw;
    // How far each side stands out past the pill (the canvas wider than it),
    // and the band of the pill's upper side its step out takes.
    const eR = this.wide.right * pw;
    const eL = this.wide.left * pw;
    const L = -eL + k;
    const R = w + eR - k;
    // Each side runs straight up the pill, steps out to its reach at the
    // pill's top, then sweeps in to its rounded top corner.
    const sR = Math.max(tR + r, up);
    const sL = Math.max(tL + r, up);
    const bR = Math.min(Math.abs(eR), Math.max(0, height - r - sR));
    const bL = Math.min(Math.abs(eL), Math.max(0, height - r - sL));
    const P = map;
    let d = `M ${P(r, height)} L ${P(w - r, height)} A ${r} ${r} 0 0 0 ${P(w, height - r)} L ${P(w, sR + bR)}`;
    d += ` C ${P(w, sR + bR * 0.45)} ${P(w + eR, sR + bR * 0.55)} ${P(w + eR, sR)}`;
    d += ` C ${P(w + eR, sR - (sR - tR - r) * 0.55)} ${P(R, tR + r + (sR - tR - r) * 0.35)} ${P(R, tR + r)}`;
    d += ` Q ${P(R, tR)} ${P(R - r, tR)}`;
    // The top eases from one side's height to the other's.
    const span = R - L - 2 * r;
    d += ` C ${P(R - r - span * 0.4, tR)} ${P(L + r + span * 0.4, tL)} ${P(L + r, tL)}`;
    d += ` Q ${P(L, tL)} ${P(L, tL + r)}`;
    d += ` C ${P(L, tL + r + (sL - tL - r) * 0.35)} ${P(-eL, sL - (sL - tL - r) * 0.55)} ${P(-eL, sL)}`;
    d += ` C ${P(-eL, sL + bL * 0.55)} ${P(0, sL + bL * 0.45)} ${P(0, sL + bL)}`;
    d += ` L ${P(0, height - r)} A ${r} ${r} 0 0 0 ${P(r, height)} Z`;
    return { d, height, up };
  }

  /** The shape at `p` as `path()`, in a box `box` placed in the shell: a keyframe for what stands in it. */
  cutAt(p: number, box: ClipBox): string {
    return this.#cut(this.outline(p).height, box, p);
  }

  /** The outline and its drop, for a motion that moves them as layers. */
  get layers(): { halo: HTMLElement; drop: HTMLElement } {
    return { halo: this.#halo, drop: this.#drop };
  }

  /** The drop goes at once: a motion of the layers is about to run. */
  unsettle(): void {
    this.#dropFold?.cancel();
    this.#dropFold = null;
    this.#drop.classList.remove("settled");
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

  /** Draws the outline `d`, `height` tall, into one of its copies. */
  #draw(
    box: HTMLElement,
    svg: SVGSVGElement,
    path: SVGPathElement,
    d: string,
    height: number
  ): void {
    box.style.height = `${height}px`;
    svg.setAttribute("viewBox", `0 0 ${this.#size.w} ${height}`);
    path.setAttribute("d", d);
  }

  /** Writes the shape where it is now. Writes only. */
  paint(): number {
    const { d, height, up } = this.outline(this.open);
    this.#draw(this.#halo, this.#svg, this.#path, d, height);
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

  /** The drop, once it stands grown: drawn here, once, and faded in. */
  #settle(): void {
    if (this.open !== 1) {
      return;
    }
    this.#dropFold?.cancel();
    this.#dropFold = null;
    const { d, height } = this.outline(1);
    this.#draw(this.#drop, this.#dropSvg, this.#dropPath, d, height);
    // The shadow's own region: the outline and as far past it as it reaches.
    const reach = this.#dropReach;
    const { left, right } = this.wide;
    for (const [name, value] of [
      ["x", -reach - Math.max(0, left)],
      ["y", -reach],
      [
        "width",
        this.#size.w + Math.max(0, left) + Math.max(0, right) + 2 * reach,
      ],
      ["height", height + 2 * reach],
    ] as const) {
      this.#dropFilter.setAttribute(name, String(value));
    }
    this.#drop.classList.add("settled");
  }

  /**
   * The drop follows the shape over `ms`: it stretches to the shape's
   * height at each moment (its foot on the pill's), and folding (`fade`)
   * fades out evenly over the whole of it, so no one frame takes much of it
   * away. Transform and opacity only: the compositor runs it, and its
   * shadow is never redrawn. Standing grown again, it is drawn anew.
   */
  #followDrop(
    to: number,
    ext: number,
    ms: number,
    base: number,
    fade: boolean
  ): void {
    this.#dropFold?.cancel();
    this.#dropFold = null;
    if (!motionOk.current || ms <= 0) {
      if (fade) {
        this.#drop.classList.remove("settled");
      }
      return;
    }
    const from = this.open;
    const fromExt = this.ext;
    const fromBase = this.#size.base;
    const tall = Number.parseFloat(this.#drop.style.height) || 1;
    // Still fading in, it fades out from where it is: its fade-in (a CSS
    // transition, which would outrank this motion) gives way to it.
    const shown = Number(getComputedStyle(this.#drop).opacity);
    for (const run of this.#drop.getAnimations()) {
      if (run instanceof CSSTransition) {
        run.cancel();
      }
    }
    const frames: Keyframe[] = [];
    for (let i = 0; i <= DROP_STEPS; i += 1) {
      const t = i / DROP_STEPS;
      const up =
        lerp(fromExt, ext, easeDrawer(t)) *
        easeDrawer(lerp(from, to, t) * 1.25);
      const height = lerp(fromBase, base, easeDrawer(t)) + up;
      frames.push({
        transform: `scaleY(${(height / tall).toFixed(4)})`,
        // Folding it fades out; standing grown, it finishes coming in.
        opacity: fade ? shown * (1 - t) : shown + (1 - shown) * t,
      });
    }
    const run = this.#drop.animate(frames, {
      duration: ms,
      easing: "linear",
      fill: "forwards",
    });
    this.#dropFold = run;
    run.finished.then(
      () => {
        if (fade && this.#dropFold === run) {
          // Hidden for good in the same task the motion lets go of it.
          this.#drop.classList.remove("settled");
          run.cancel();
          this.#dropFold = null;
        }
      },
      () => undefined
    );
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
    if (this.#drop.classList.contains("settled") && open <= this.open) {
      this.#followDrop(open, ext, ms, base, open < this.open);
    } else {
      // Growing (or turned back mid-fold): the drop comes in once it lands.
      this.#dropFold?.cancel();
      this.#dropFold = null;
      this.#drop.classList.remove("settled");
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
    this.#follow.disconnect();
    cancelAnimationFrame(this.#frame);
    this.#done?.();
    this.#halo.remove();
    this.#drop.remove();
    for (const el of this.#clips.keys()) {
      el.style.clipPath = "";
    }
    this.#clips.clear();
  }
}

/**
 * A rounded box as `path()`, drawn with the grown outline's own commands
 * in the same order, so a motion between the two interpolates point by
 * point: the composer's canvas folding into its chip's box and opening
 * out of it.
 */
export function boxCut(
  box: { left: number; top: number; width: number; height: number },
  r: number
): string {
  const x0 = box.left;
  const y0 = box.top;
  const x1 = box.left + box.width;
  const y1 = box.top + box.height;
  const q = Math.min(r, box.width / 2, box.height / 2);
  const P = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  const top = P(x1, y0 + q);
  const left = P(x0, y0 + q);
  let d = `M ${P(x0 + q, y1)} L ${P(x1 - q, y1)} A ${q} ${q} 0 0 0 ${P(x1, y1 - q)} L ${top}`;
  // The outline's step out and its shoulder, each a curve of no length here.
  d += ` C ${top} ${top} ${top} C ${top} ${top} ${top}`;
  d += ` Q ${P(x1, y0)} ${P(x1 - q, y0)}`;
  d += ` C ${P(x1 - q, y0)} ${P(x0 + q, y0)} ${P(x0 + q, y0)}`;
  d += ` Q ${P(x0, y0)} ${left}`;
  d += ` C ${left} ${left} ${left} C ${left} ${left} ${left}`;
  d += ` L ${P(x0, y1 - q)} A ${q} ${q} 0 0 0 ${P(x0 + q, y1)} Z`;
  return `path("${d}")`;
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

/** Where the shell stands in the window: its foot (viewport px) and the window's height. */
export interface ViewBox {
  bottom: number;
  height: number;
}

/**
 * How much the transforms `el` stands under scale it on the screen now (a
 * popover rising out of `--pop-scale`): its box's width over its laid-out
 * width. A length read off `getBoundingClientRect()` divided by it is the
 * layout's, which is what a shape drawn in that box is cut in.
 */
export function layoutScale(el: HTMLElement): number {
  const laid = el.offsetWidth;
  const shown = el.getBoundingClientRect().width;
  return laid > 0 && shown > 0 ? shown / laid : 1;
}

/**
 * The sizes a grown shape stands on, read in one pass: the shell and where
 * it stands in the window, its pill, the field's one-line height (one wheel
 * row) and its last line. The room over the top row is a step of the
 * spacing ladder. Read before anything is written, so growing costs the page
 * one layout, in the frame it is drawn.
 */
export function measureShape(
  shell: HTMLElement,
  pill: HTMLElement,
  field: HTMLElement
): { size: ShapeSize; line: LineBox; view: ViewBox } {
  const box = shell.getBoundingClientRect();
  const text = field.getBoundingClientRect();
  const style = getComputedStyle(shell);
  // The shape is drawn in the shell's own box, under any transform it
  // stands in: a popover still at its open scale shows the shell smaller
  // than it is laid out, and a shape cut to that box clips the card for
  // good. Its sizes are the layout's; the rects' offsets are scaled back.
  // The shape then follows the shell's border box as it resizes (GrownShape).
  const w = shell.offsetWidth;
  const scale = layoutScale(shell);
  return {
    view: { bottom: box.bottom, height: window.innerHeight },
    size: {
      w,
      base: pill.offsetHeight,
      r: Number.parseFloat(getComputedStyle(pill).borderTopLeftRadius) || 0,
      headroom: Number.parseFloat(style.getPropertyValue("--space-2")),
      row: Number.parseFloat(style.getPropertyValue("--c-composer-field")),
    },
    line: {
      left: (text.left - box.left) / scale,
      bottom: (box.bottom - text.bottom) / scale,
      height: text.height / scale,
      width: field.clientWidth,
    },
  };
}
