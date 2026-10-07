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
 * shoulders curve in, by as much as a wheel row shrinks at that height. What
 * stands in it (the wheel's rows, the editing row) is clipped to it, so it
 * comes up out of the button with the shape and folds back into it.
 *
 * Its edge is the pill's border (`--border-control`), and stays the border
 * while the field has keyboard focus: the grown composer draws no ring.
 *
 * The top fades out over the transcript, frosted progressively: a stack of
 * bands, each blurring twice the one above, each cut to the shape and masked
 * in its own box (a parent clipping or masking them would cut them off from
 * the transcript they blur). The bands and the drop come in once the shape
 * stands still; nothing that moves carries a backdrop filter.
 *
 * Every size is measured once, before it is made (`measureShape`); a frame
 * only writes.
 *
 * A parked ask grows the same shape to hold its card (Composer): its sides
 * rise straight (`taper: false`), since nothing in it leans back, and its
 * top is solid to the edge (`fade: false`), since its first line is the
 * ask's title, not an oldest row going out of sight.
 */
import { easeDrawer, motionOk } from "../motion/curves.svelte";

/** How much narrower each wheel row is than the one below it, as a share. */
export const SHRINK = 0.022;
/** The frosted bands' blurs, top band first (px), and each band's height. */
const BLURS = [0.5, 1, 2, 4, 8, 16];
const BAND = 6;

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
  readonly #mid: SVGStopElement;
  readonly #edge: SVGStopElement;
  readonly #bands: HTMLDivElement[] = [];
  readonly #clips = new Map<HTMLElement, () => ClipBox>();
  readonly #taper: boolean;
  readonly #fade: boolean;
  #frame = 0;
  #done: (() => void) | null = null;

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
      for (const [i, px] of BLURS.entries()) {
        const band = document.createElement("div");
        band.className = "grown-band";
        band.style.backdropFilter = `blur(${px}px)`;
        band.style.setProperty("-webkit-backdrop-filter", `blur(${px}px)`);
        // Each band fades in over its first step and out over its last,
        // overlapping the next; the last holds to its foot.
        const mask =
          i === BLURS.length - 1
            ? `linear-gradient(transparent, #000 ${BAND}px)`
            : `linear-gradient(transparent, #000 ${BAND}px, transparent ${2 * BAND}px)`;
        band.style.maskImage = mask;
        band.style.setProperty("-webkit-mask-image", mask);
        host.append(band);
        this.#bands.push(band);
      }
    }
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

  /** How far the shoulders curve in, grown: as far as the top row shrinks. */
  taper(ext = this.ext): number {
    if (!this.#taper) {
      return 0;
    }
    const { row, w, headroom } = this.#size;
    return (SHRINK * (Math.max(0, (ext - headroom) / row) + 0.5) * w) / 2;
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
    this.#halo.style.height = `${height}px`;
    this.#svg.setAttribute("viewBox", `0 0 ${this.#size.w} ${height}`);
    this.#path.setAttribute("d", d);
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

  /** The drop and the frosted bands, once it stands grown. */
  #settle(): void {
    if (this.open !== 1) {
      return;
    }
    const height = this.paint();
    for (const [i, band] of this.#bands.entries()) {
      const top = i * BAND;
      const tall = (i === this.#bands.length - 1 ? 3 : 2) * BAND;
      band.style.bottom = `${height - top - tall}px`;
      band.style.height = `${tall}px`;
      band.style.clipPath = this.#cut(height, {
        left: 0,
        bottom: height - top - tall,
        height: tall,
      });
      band.classList.add("settled");
    }
    this.#halo.classList.add("settled");
  }

  /**
   * Grows or folds to `open`, reaching `ext` above the pill, over `ms` on
   * the drawer curve. Turns back from wherever it is drawn. With reduced
   * motion it lands at once.
   */
  morphTo(open: number, ext: number, ms: number): Promise<void> {
    cancelAnimationFrame(this.#frame);
    this.#done?.();
    this.#halo.classList.remove("settled");
    for (const band of this.#bands) {
      band.classList.remove("settled");
    }
    const fromOpen = this.open;
    const fromExt = this.ext;
    return new Promise((done) => {
      this.#done = done;
      const land = () => {
        this.#done = null;
        this.#settle();
        done();
      };
      if (!motionOk.current || ms <= 0) {
        this.open = open;
        this.ext = ext;
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
    for (const band of this.#bands) {
      band.remove();
    }
    for (const el of this.#clips.keys()) {
      el.style.clipPath = "";
    }
    this.#clips.clear();
  }
}

/** Where the field's last line stands in the shell: the line the wheel's pick sits on. */
export interface LineBox {
  bottom: number;
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
      width: field.clientWidth,
    },
  };
}
