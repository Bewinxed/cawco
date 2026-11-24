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

/** The box's own clip, the cut composed into its bottom inset. */
interface Base {
  left: string;
  right: string;
  round: string;
  top: string;
}

/** The keyframes are sampled this far apart (ms): a frame at 60Hz. */
const FRAME = 1000 / 60;
const INSET = /^inset\((.*)\)$/u;
const SPACES = /\s+/u;
/** Placed out of the flow: it does not move with what stands before it. */
const OUT_OF_FLOW = /absolute|fixed/u;

export interface EdgeCutOptions {
  /**
   * The slice of its foot drawn under it while it is cut: an empty element
   * beside it (an earlier sibling, so the box paints over it), placed and
   * styled here from the box's own look.
   */
  foot?: () => HTMLElement | null;
  /** The box's height as laid out now (px). */
  height: () => number;
  /** A slide has ended and the row stands laid out shut: the box's new height is its own. */
  settled?: () => void;
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

/** An `inset()` as its four sides and its rounding; any other clip as none. */
function baseOf(box: HTMLElement): Base {
  const style = getComputedStyle(box);
  const inset = INSET.exec(style.clipPath)?.[1];
  const [sides = "0px", round] = inset?.split(" round ") ?? [];
  const [top = "0px", right = top, , left = right] = sides.trim().split(SPACES);
  return {
    top,
    right,
    left,
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

  /** Places and dresses the foot slice from the box's own look, for this cut. */
  #placeFoot(): void {
    const node = this.#options.foot?.() ?? null;
    if (!node) {
      this.#foot = null;
      return;
    }
    const box = this.#box;
    const style = getComputedStyle(box);
    // The hung card draws its edge on `::after`, inside its box.
    const edge = getComputedStyle(box, "::after");
    const drawsEdge = edge.content !== "none" && edge.content !== "normal";
    const line = drawsEdge ? edge : style;
    const bottomLeft = style.borderBottomLeftRadius;
    const bottomRight = style.borderBottomRightRadius;
    const height =
      Math.max(
        Number.parseFloat(bottomLeft) || 0,
        Number.parseFloat(bottomRight) || 0
      ) + 1;
    Object.assign(node.style, {
      left: `${box.offsetLeft}px`,
      top: `${box.offsetTop}px`,
      width: `${box.offsetWidth}px`,
      height: `${height}px`,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      borderStyle: "solid",
      borderColor: line.borderBottomColor,
      borderWidth: `0 ${line.borderRightWidth} ${line.borderBottomWidth} ${line.borderLeftWidth}`,
      borderRadius: `0 0 ${bottomRight} ${bottomLeft}`,
    });
    node.dataset.cut = "";
    this.#foot = { node, height };
  }

  /**
   * Draws every run from now to the last one's end: the box's clip, the
   * foot slice and each moved element, one animation each.
   */
  #draw(): void {
    for (const animation of this.#drawn) {
      animation.cancel();
    }
    this.#drawn = [];
    if (this.#runs.size === 0) {
      this.#base = null;
      if (this.#foot) {
        delete this.#foot.node.dataset.cut;
        this.#foot = null;
      }
      return;
    }
    if (!this.#base) {
      this.#base = baseOf(this.#box);
      this.#placeFoot();
    }
    const base = this.#base;
    const foot = this.#foot;
    const start = now();
    const runs = [...this.#runs];
    const end = Math.max(...runs.map((run) => run.at + run.ms));
    const span = Math.max(end - start, 1);
    const times: number[] = [];
    for (let t = start; t < end; t += FRAME) {
      times.push(t);
    }
    times.push(end);
    const boxHeight = this.#options.height();
    const offsetOf = (t: number) => (t - start) / span;
    const clip: Keyframe[] = [];
    const slice: Keyframe[] = [];
    for (const t of times) {
      const cut = runs.reduce((sum, run) => sum + cutOf(run, t), 0);
      const offset = offsetOf(t);
      // With a foot slice the box's own last pixel row is cut too: the
      // slice's hairline stands there, and its shadow under it.
      const bottom = foot ? cut + 1 : cut;
      clip.push({
        offset,
        clipPath: `inset(${base.top} ${base.right} ${bottom}px ${base.left} round ${base.round})`,
      });
      if (foot) {
        slice.push({
          offset,
          transform: `translateY(${boxHeight - cut - foot.height}px)`,
        });
      }
    }
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
