/**
 * A box whose height changes are drawn by its clip, never by its layout (a
 * card hung from its anchor: motion/morph `clip`). Its layout takes each
 * change in one frame; what the eye sees moves on the compositor:
 *
 * - the box's foot is cut off by `clip-path: inset()`, composed with the
 *   box's own clip (a hung card's cut across its top and the room each
 *   other side for its shadow), the cut moving from where the foot was
 *   drawn to where it now stands;
 * - a row folding shut inside it (`slide`, from motion/fold) stays in the
 *   flow at its height, cut shut from its own foot, while everything after
 *   it up to the box moves up by `transform` as far as the row and its gap
 *   take; once that has run, the row is laid out shut and the moved
 *   elements stand where they were drawn, in one frame;
 * - the slice of the box's foot (`foot`: its hairline, its round corners,
 *   its shadow) is drawn under it, moving with the cut by `transform`: a
 *   clip hides all past its edge, the shadow with it.
 *
 * A box standing on its foot that grows upward (a docked composer's shell)
 * is cut across its head instead (`side: "head"`), its slice the head's.
 * A box with no clip of its own is left open on its other sides as far as
 * its shadow reaches. A translucent box is cut `flush`: along the slice's
 * inner edge, square there, so no strip of it is drawn twice.
 *
 * Several runs at once (rows leaving a stagger apart, a change of content
 * under them) sum: every keyframe is sampled a frame apart from the runs'
 * own curves, so the cut, the foot and each moved element stand where the
 * runs together put them, each on one animation of its own.
 */
import { easingOf } from "./curves.svelte";

/** One motion the cut draws: `from` px cut off the box's foot, moving to `to`. */
interface Run {
  /** When it started, on the document's timeline (ms). */
  at: number;
  curve: (t: number) => number;
  from: number;
  /** A row sliding shut: what stands after it, moved up as it goes. */
  movers: HTMLElement[];
  ms: number;
  to: number;
}

/** The box's own clip, the cut composed into the inset of its cut side. */
interface Base {
  bottom: string;
  /** Its rounding by corner (px, from the top left round), where it has no clip of its own. */
  corners: number[] | null;
  left: string;
  right: string;
  round: string;
  top: string;
}

/** The keyframes are sampled this far apart (ms): a frame at 60Hz. */
export const FRAME = 1000 / 60;
const INSET = /^inset\((.*)\)$/u;
/** One shadow of a computed `box-shadow`: its offsets, blur and spread. */
const SHADOW = /(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px (-?[\d.]+)px/gu;
const SPACES = /\s+/u;
/** Placed out of the flow: it does not move with what stands before it. */
const OUT_OF_FLOW = /absolute|fixed/u;

export interface EdgeCutOptions {
  /**
   * The box is cut along the slice's inner edge, square there, and the
   * slice draws that strip alone: nothing is drawn twice where a
   * translucent box would show both.
   */
  flush?: boolean;
  /**
   * The slice of its foot drawn under it while it is cut: an empty element
   * beside it (an earlier sibling, so the box paints over it), placed and
   * styled here from the box's own look.
   */
  foot?: () => HTMLElement | null;
  /** The box's height as laid out now (px). */
  height: () => number;
  /**
   * What draws the box's look, where the box only holds it (a field in
   * the touch area round it, which also draws its focus edge): the slice
   * wears its fill, border, rounding and shadow.
   */
  look?: () => HTMLElement;
  /** A slide has ended and the row stands laid out shut: the box's new height is its own. */
  settled?: () => void;
  /** The edge the cut moves: its foot (by default), or its head for a box that stands on its foot. */
  side?: "foot" | "head";
}

/** Every box cut by its clip, for a fold inside one to slide (motion/fold). */
export const cutters = new Map<HTMLElement, EdgeCut>();

/** The box nearest above `node` whose height changes are drawn by its clip. */
export function cutterOf(node: HTMLElement): EdgeCut | undefined {
  for (let at = node.parentElement; at; at = at.parentElement) {
    const cutter = cutters.get(at);
    if (cutter) {
      return cutter;
    }
  }
}

const now = (): number => {
  const time = document.timeline.currentTime;
  return typeof time === "number" ? time : performance.now();
};

/** A run's cut at `t`. */
const cutOf = (run: Run, t: number): number => {
  const p = Math.min(Math.max((t - run.at) / run.ms, 0), 1);
  return run.from + (run.to - run.from) * run.curve(p);
};

/** How far past its box a computed `box-shadow` draws, on its farthest side (px). */
function shadowReach(shadow: string): number {
  let reach = 0;
  for (const [, x, y, blur, spread] of shadow.matchAll(SHADOW)) {
    const out = Number(blur) + Number(spread);
    reach = Math.max(
      reach,
      Math.abs(Number(x)) + out,
      Math.abs(Number(y)) + out
    );
  }
  return Math.ceil(reach);
}

/**
 * The box's own `inset()` clip as its four sides and its rounding; with
 * none, open on each side as far as its look's shadow reaches, rounded as
 * its look is, grown by as much.
 */
function baseOf(box: HTMLElement, look: HTMLElement): Base {
  const style = getComputedStyle(box);
  const inset = INSET.exec(style.clipPath)?.[1];
  if (inset) {
    const [sides = "0px", round] = inset.split(" round ");
    const [top = "0px", right = top, bottom = top, left = right] = sides
      .trim()
      .split(SPACES);
    return {
      top,
      right,
      bottom,
      left,
      corners: null,
      round:
        round ??
        [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ].join(" "),
    };
  }
  const drawn = look === box ? style : getComputedStyle(look);
  const reach = shadowReach(drawn.boxShadow);
  const open = `${-reach}px`;
  const corners = [
    drawn.borderTopLeftRadius,
    drawn.borderTopRightRadius,
    drawn.borderBottomRightRadius,
    drawn.borderBottomLeftRadius,
  ].map((radius) => (Number.parseFloat(radius) || 0) + reach);
  return {
    top: open,
    right: open,
    bottom: open,
    left: open,
    corners,
    round: corners.map((radius) => `${radius}px`).join(" "),
  };
}

/** A flush slice's clip: its shadow stops at the seam, so it never darkens the box. */
const sliceClip = (head: boolean, reach: string): string =>
  head
    ? `inset(${reach} ${reach} 0px ${reach})`
    : `inset(0px ${reach} ${reach} ${reach})`;

/** The box's clip with `edge` px cut off its head or its foot. */
const insetAt = (
  base: Base,
  edge: number,
  head: boolean,
  round: string
): string =>
  head
    ? `inset(${edge}px ${base.right} ${base.bottom} ${base.left} round ${round})`
    : `inset(${base.top} ${base.right} ${edge}px ${base.left} round ${round})`;

/** The rounding of a flush cut: square on the side it cuts. */
function flushRound(base: Base, head: boolean): string {
  if (!base.corners) {
    return base.round;
  }
  const [topLeft, topRight, bottomRight, bottomLeft] = base.corners;
  const corners = head
    ? [0, 0, bottomRight, bottomLeft]
    : [topLeft, topRight, 0, 0];
  return corners.map((radius) => `${radius}px`).join(" ");
}

/**
 * An edge the box draws on a pseudo-element inside it, showing now: a hung
 * card's on `::after`.
 */
function drawnEdge(box: HTMLElement): CSSStyleDeclaration | null {
  for (const pseudo of ["::after", "::before"]) {
    const edge = getComputedStyle(box, pseudo);
    if (
      edge.content !== "none" &&
      edge.content !== "normal" &&
      (Number.parseFloat(edge.borderBottomWidth) || 0) > 0 &&
      Number.parseFloat(edge.opacity) >= 0.5
    ) {
      return edge;
    }
  }
  return null;
}

export class EdgeCut {
  readonly #box: HTMLElement;
  readonly #options: EdgeCutOptions;
  readonly #runs = new Set<Run>();
  /** A row's slide, by the animation that cuts it shut. */
  readonly #slides = new Map<Animation, Run>();
  /** The run a change of content set off; one at a time. */
  #content: Run | null = null;
  #base: Base | null = null;
  #drawn: Animation[] = [];
  /** The foot slice as placed for this cut, and how tall it is. */
  #foot: { node: HTMLElement; height: number } | null = null;

  constructor(box: HTMLElement, options: EdgeCutOptions) {
    this.#box = box;
    this.#options = options;
  }

  /** How much is cut off the foot now, every run's or the slides' alone. */
  cutNow(slidesOnly = false): number {
    const t = now();
    let cut = 0;
    for (const run of this.#runs) {
      if (!slidesOnly || run.movers.length > 0) {
        cut += cutOf(run, t);
      }
    }
    return cut;
  }

  /**
   * Cuts `node` shut from its foot over `ms`, everything after it up to the
   * box moving up by `distance` (its height and the gap it takes). The
   * returned animation is the row's own; once it has finished and the row
   * is laid out shut, `settled` lets the moved elements stand.
   */
  slide(
    node: HTMLElement,
    {
      distance,
      height,
      ms,
      easing,
      fade,
    }: {
      distance: number;
      easing: string;
      fade: number | null;
      height: number;
      ms: number;
    }
  ): Animation {
    const at = now();
    const run: Run = {
      at,
      ms,
      curve: easingOf(easing),
      from: 0,
      to: distance,
      movers: this.#after(node),
    };
    const from: Keyframe = { clipPath: "inset(0px 0px 0px 0px)" };
    const to: Keyframe = { clipPath: `inset(0px 0px ${height}px 0px)` };
    if (fade !== null) {
      from.opacity = fade;
      to.opacity = 0;
    }
    const animation = node.animate([from, to], {
      duration: ms,
      easing,
      fill: "forwards",
    });
    animation.startTime = at;
    this.#slides.set(animation, run);
    this.#runs.add(run);
    this.#draw();
    return animation;
  }

  /** A row's slide has run (or was cut short) and the row stands as it ends. */
  settled(animation: Animation): void {
    const run = this.#slides.get(animation);
    this.#slides.delete(animation);
    if (run) {
      this.#runs.delete(run);
      this.#draw();
      this.#options.settled?.();
    }
  }

  /**
   * The content changed the box's size: the cut runs from `from` px to `to`
   * over `ms`, in place of the run the last change set off; it starts at
   * the time returned, for the clock that ends it (`changed`). Null: the
   * change landed at once.
   */
  change(
    next: { from: number; to: number; ms: number; easing: string } | null
  ): number {
    if (!(next || this.#content)) {
      return now();
    }
    if (this.#content) {
      this.#runs.delete(this.#content);
    }
    this.#content = next
      ? {
          at: now(),
          ms: next.ms,
          curve: easingOf(next.easing),
          from: next.from,
          to: next.to,
          movers: [],
        }
      : null;
    if (this.#content) {
      this.#runs.add(this.#content);
    }
    this.#draw();
    return this.#content?.at ?? now();
  }

  /** The change's run has ended: the box stands as laid out. */
  changed(): void {
    if (this.#content) {
      this.#runs.delete(this.#content);
      this.#content = null;
      this.#draw();
    }
  }

  /** Every run let go: nothing cut, nothing moved. */
  stop(): void {
    this.#runs.clear();
    this.#slides.clear();
    this.#content = null;
    this.#draw();
  }

  /** In the flow after `node`, at every depth up to the box: what moves up as it shuts. */
  #after(node: HTMLElement): HTMLElement[] {
    const movers: HTMLElement[] = [];
    for (
      let at: HTMLElement | null = node;
      at && at !== this.#box;
      at = at.parentElement
    ) {
      for (
        let next = at.nextElementSibling;
        next;
        next = next.nextElementSibling
      ) {
        if (
          next instanceof HTMLElement &&
          !OUT_OF_FLOW.test(getComputedStyle(next).position)
        ) {
          movers.push(next);
        }
      }
    }
    return movers;
  }

  /**
   * Reads how the slice of the cut side is placed and dressed from the
   * box's look, for this cut: read again at each draw, as a box standing on
   * its foot has its head somewhere new after each change. Returns how to
   * place it, so every read is made before anything is written.
   */
  #readFoot(): (() => { height: number; node: HTMLElement }) | null {
    const node = this.#options.foot?.() ?? null;
    if (!node) {
      return null;
    }
    const box = this.#box;
    const style = getComputedStyle(this.#options.look?.() ?? box);
    const line = drawnEdge(box) ?? style;
    const head = this.#options.side === "head";
    const [start, end] = head
      ? [style.borderTopLeftRadius, style.borderTopRightRadius]
      : [style.borderBottomLeftRadius, style.borderBottomRightRadius];
    const height =
      Math.max(Number.parseFloat(start) || 0, Number.parseFloat(end) || 0) + 1;
    const reach = `${-shadowReach(style.boxShadow)}px`;
    const dress = {
      left: `${box.offsetLeft}px`,
      top: `${box.offsetTop}px`,
      width: `${box.offsetWidth}px`,
      height: `${height}px`,
      backgroundColor: style.backgroundColor,
      backdropFilter: style.backdropFilter,
      boxShadow: style.boxShadow,
      borderStyle: "solid",
      borderColor: head ? line.borderTopColor : line.borderBottomColor,
      borderWidth: head
        ? `${line.borderTopWidth} ${line.borderRightWidth} 0 ${line.borderLeftWidth}`
        : `0 ${line.borderRightWidth} ${line.borderBottomWidth} ${line.borderLeftWidth}`,
      borderRadius: head ? `${start} ${end} 0 0` : `0 0 ${end} ${start}`,
      clipPath: this.#options.flush ? sliceClip(head, reach) : "",
    };
    return () => {
      Object.assign(node.style, dress);
      node.dataset.cut = "";
      return { node, height };
    };
  }

  /** What a draw reads, all before it writes: the box's clip, its height, and how to place the slice. */
  #read(): {
    base: Base;
    boxHeight: number;
    placeFoot: (() => { height: number; node: HTMLElement }) | null;
  } {
    const look = this.#options.look?.() ?? this.#box;
    return {
      base: this.#base ?? baseOf(this.#box, look),
      placeFoot: this.#readFoot(),
      boxHeight: this.#options.height(),
    };
  }

  /** The box's clip and its slice's place at each of `times`, every run summed. */
  #cutFrames(
    runs: Run[],
    times: number[],
    offsetOf: (t: number) => number,
    { base, boxHeight }: { base: Base; boxHeight: number }
  ): { clip: Keyframe[]; slice: Keyframe[] } {
    const head = this.#options.side === "head";
    const flush = this.#options.flush === true;
    const round = flush ? flushRound(base, head) : base.round;
    const foot = this.#foot;
    // With a slice the box's own last pixel row is cut too: the slice's
    // hairline stands there, and its shadow past it. Flush, the box is cut
    // where the slice begins.
    const seam = flush ? (foot?.height ?? 0) : 1;
    const clip: Keyframe[] = [];
    const slice: Keyframe[] = [];
    for (const t of times) {
      const cut = runs.reduce((sum, run) => sum + cutOf(run, t), 0);
      const offset = offsetOf(t);
      clip.push({
        offset,
        clipPath: insetAt(base, foot ? cut + seam : cut, head, round),
      });
      if (foot) {
        const at = head ? cut : boxHeight - cut - foot.height;
        slice.push({ offset, transform: `translateY(${at}px)` });
      }
    }
    return { clip, slice };
  }

  /**
   * Draws every run from now to the last one's end: the box's clip, the
   * foot slice and each moved element, one animation each.
   */
  #draw(): void {
    // Everything read before anything is written: the cancels below leave
    // the box's style stale.
    const read = this.#runs.size > 0 ? this.#read() : null;
    for (const animation of this.#drawn) {
      animation.cancel();
    }
    this.#drawn = [];
    if (!read) {
      this.#base = null;
      if (this.#foot) {
        delete this.#foot.node.dataset.cut;
        this.#foot = null;
      }
      return;
    }
    const { base, boxHeight, placeFoot } = read;
    this.#base = base;
    this.#foot = placeFoot?.() ?? null;
    const start = now();
    const runs = [...this.#runs];
    const end = Math.max(...runs.map((run) => run.at + run.ms));
    const span = Math.max(end - start, 1);
    const times: number[] = [];
    for (let t = start; t < end; t += FRAME) {
      times.push(t);
    }
    times.push(end);
    const offsetOf = (t: number) => (t - start) / span;
    const foot = this.#foot;
    const { clip, slice } = this.#cutFrames(runs, times, offsetOf, {
      base,
      boxHeight,
    });
    const timing: KeyframeAnimationOptions = {
      duration: span,
      easing: "linear",
      fill: "forwards",
    };
    const play = (node: HTMLElement, frames: Keyframe[]) => {
      const animation = node.animate(frames, timing);
      animation.startTime = start;
      this.#drawn.push(animation);
    };
    play(this.#box, clip);
    if (foot) {
      play(foot.node, slice);
    }
    // Each moved element by the sum of the slides it stands after.
    const moved = new Map<HTMLElement, Run[]>();
    for (const run of runs) {
      for (const mover of run.movers) {
        moved.set(mover, [...(moved.get(mover) ?? []), run]);
      }
    }
    for (const [mover, by] of moved) {
      if (!mover.isConnected) {
        continue;
      }
      play(
        mover,
        times.map((t) => ({
          offset: offsetOf(t),
          transform: `translateY(${-by.reduce((sum, run) => sum + cutOf(run, t), 0)}px)`,
        }))
      );
    }
  }
}
