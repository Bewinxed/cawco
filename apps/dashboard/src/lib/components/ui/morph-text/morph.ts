/**
 * The morph MorphText draws: the words a text had become the new ones,
 * letter by letter, on torph's text matching (`segmentText`, `diffSegments`;
 * its README: "The text matching torph runs on is exported for building
 * your own behaviour on top of it") and this renderer instead of torph's.
 *
 * torph's renderer tweens its root's width and height from the old words'
 * size to the new ones', which slides whatever stands after the text, and
 * runs its fades on clocks of their own (linear, a quarter to a half of the
 * duration) beside the letters' moves. Here:
 *
 * - The box never tweens. Each step holds the root at the larger of the size
 *   it was drawn at and the size the new words lay out at, at once, so
 *   nothing beside it moves while the letters cross. It lets go when the
 *   step settles.
 * - Every animation of a step runs on one clock: one start time, one
 *   duration, one curve. A letter that stays glides from where it was drawn;
 *   one that arrives fades up from 0.95; one that leaves stays where it was
 *   and fades down to 0.95; a digit rolls, in from below and out above, in
 *   a slot that clips it.
 * - A step that lands mid-step starts from what is drawn: each letter from
 *   where it is and how opaque it is, the leaving ones fading on from there.
 */
import { diffSegments, type Segment, segmentText } from "torph";

const LOCALE = "en";
const SHRINK = "scale(0.95)";

/** Where a letter is drawn in the box, and how opaque. */
interface Drawn {
  opacity: number;
  x: number;
  y: number;
}

type Run = (el: Element, keyframes: Keyframe[]) => void;

const isBreak = (el: Element): boolean => el.tagName === "BR";

/** A segment's element: a line break, a rolling digit in its slot, or text. */
function make(segment: Segment): HTMLElement {
  if (segment.string === "\n") {
    return document.createElement("br");
  }
  const el = document.createElement("span");
  if (segment.kind === "digit") {
    el.dataset.roll = "";
    const face = document.createElement("span");
    face.textContent = segment.string;
    el.append(face);
  } else {
    el.textContent = segment.string;
  }
  return el;
}

/** What rolls in a digit's slot: the face inside it; any other letter is itself. */
const face = (el: HTMLElement): HTMLElement =>
  el.dataset.roll === undefined
    ? el
    : ((el.firstElementChild as HTMLElement | null) ?? el);

/** A letter arriving fades up from 0.95; a digit rolls in from below. */
function arrive(el: HTMLElement, run: Run): void {
  run(el, [{ opacity: 0 }, { opacity: 1 }]);
  if (el.dataset.roll === undefined) {
    run(el, [{ transform: SHRINK }, { transform: "none" }]);
  } else {
    run(face(el), [{ transform: "translateY(100%)" }, { transform: "none" }]);
  }
}

/** A letter that stays glides from where it was drawn, and fades up if it was fading. */
function glide(el: HTMLElement, was: Drawn, origin: DOMRect, run: Run): void {
  const at = el.getBoundingClientRect();
  const dx = was.x - (at.left - origin.left);
  const dy = was.y - (at.top - origin.top);
  if (dx !== 0 || dy !== 0) {
    run(el, [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: "none" },
    ]);
  }
  if (was.opacity < 1) {
    run(el, [{ opacity: was.opacity }, { opacity: 1 }]);
  }
}

/** A letter leaving fades down to 0.95 where it stands; a digit rolls out above. */
function go(el: HTMLElement, opacity: number, run: Run): void {
  run(el, [{ opacity }, { opacity: 0 }]);
  if (el.dataset.roll === undefined) {
    run(el, [{ transform: "none" }, { transform: SHRINK }]);
  } else {
    run(face(el), [{ transform: "none" }, { transform: "translateY(-100%)" }]);
  }
}

export class Morph {
  readonly #root: HTMLElement;
  readonly #duration: number;
  readonly #easing: string;
  #segments: Segment[] = [];
  /** The elements in flow, by segment id. */
  readonly #flow = new Map<string, HTMLElement>();
  /** Letters on their way out, out of flow where they were drawn. */
  #leaving: HTMLElement[] = [];
  #clock: Animation[] = [];
  #step = 0;

  constructor(root: HTMLElement, duration: number, easing: string) {
    this.#root = root;
    this.#duration = duration;
    this.#easing = easing;
  }

  /**
   * Lays `value` out at once, the box held at least `hold` (the size the
   * text was drawn at before the morph took it over).
   */
  show(value: string, hold: { width: number; height: number }): void {
    this.#segments = segmentText(value, LOCALE, true);
    this.#flow.clear();
    const els = this.#segments.map((segment) => {
      const el = make(segment);
      this.#flow.set(segment.id, el);
      return el;
    });
    this.#root.replaceChildren(...els);
    this.#hold(hold);
  }

  /**
   * Morphs to `value` on one clock. Resolves true once the step has settled,
   * false when a later step took over first.
   */
  async to(value: string): Promise<boolean> {
    this.#step += 1;
    const step = this.#step;
    const box = this.#root.getBoundingClientRect();
    const drawn = this.#read(box);
    for (const animation of this.#clock) {
      animation.cancel();
    }

    const { segments, splits } = diffSegments(this.#segments, value, LOCALE, {
      numbers: true,
    });
    this.#segments = segments;
    for (const [id, pieces] of splits) {
      this.#split(id, pieces, drawn);
    }
    this.#leave(new Set(segments.map((segment) => segment.id)), drawn);
    const { flow, arriving } = this.#lay(segments);
    this.#hold(box);

    this.#clock = this.#run(flow, arriving, drawn);
    try {
      await Promise.all(this.#clock.map((animation) => animation.finished));
    } catch {
      return false;
    }
    if (step !== this.#step) {
      return false;
    }
    for (const el of this.#leaving) {
      el.remove();
    }
    this.#leaving = [];
    for (const animation of this.#clock) {
      animation.cancel();
    }
    this.#clock = [];
    return true;
  }

  /** What is drawn now, where it is drawn: mid-step, its moves included. */
  #read(box: DOMRect): Map<HTMLElement, Drawn> {
    const drawn = new Map<HTMLElement, Drawn>();
    for (const el of [...this.#flow.values(), ...this.#leaving]) {
      if (isBreak(el)) {
        continue;
      }
      const at = el.getBoundingClientRect();
      drawn.set(el, {
        opacity: Number(getComputedStyle(el).opacity),
        x: at.left - box.left,
        y: at.top - box.top,
      });
    }
    return drawn;
  }

  /**
   * A word that stays but now matches letter by letter is drawn as its
   * letters from here on, each from where the word was drawn.
   */
  #split(id: string, pieces: Segment[], drawn: Map<HTMLElement, Drawn>): void {
    const whole = this.#flow.get(id);
    if (!whole) {
      return;
    }
    const was = drawn.get(whole);
    const at = whole.getBoundingClientRect();
    const els = pieces.map(make);
    whole.replaceWith(...els);
    this.#flow.delete(id);
    for (const [i, piece] of pieces.entries()) {
      const el = els[i];
      this.#flow.set(piece.id, el);
      if (!was || isBreak(el)) {
        continue;
      }
      const own = el.getBoundingClientRect();
      drawn.set(el, {
        opacity: was.opacity,
        x: was.x + (own.left - at.left),
        y: was.y + (own.top - at.top),
      });
    }
  }

  /** What leaves stands out of flow where it was drawn. */
  #leave(staying: Set<string>, drawn: Map<HTMLElement, Drawn>): void {
    for (const [id, el] of this.#flow) {
      if (staying.has(id)) {
        continue;
      }
      this.#flow.delete(id);
      if (!isBreak(el)) {
        this.#leaving.push(el);
      }
    }
    for (const el of this.#leaving) {
      const was = drawn.get(el);
      el.style.position = "absolute";
      el.style.insetInlineStart = `${was?.x ?? 0}px`;
      el.style.insetBlockStart = `${was?.y ?? 0}px`;
    }
  }

  /** The new words in flow, the leaving letters after them. */
  #lay(segments: Segment[]): {
    flow: HTMLElement[];
    arriving: Set<HTMLElement>;
  } {
    const arriving = new Set<HTMLElement>();
    const flow = segments.map((segment) => {
      const kept = this.#flow.get(segment.id);
      if (kept) {
        if (!isBreak(kept) && kept.textContent !== segment.string) {
          face(kept).textContent = segment.string;
        }
        return kept;
      }
      const el = make(segment);
      this.#flow.set(segment.id, el);
      arriving.add(el);
      return el;
    });
    this.#root.replaceChildren(...flow, ...this.#leaving);
    return { flow, arriving };
  }

  /** Every animation of the step, on one start, duration and curve. */
  #run(
    flow: HTMLElement[],
    arriving: Set<HTMLElement>,
    drawn: Map<HTMLElement, Drawn>
  ): Animation[] {
    const timing: KeyframeAnimationOptions = {
      duration: this.#duration,
      easing: this.#easing,
      fill: "both",
    };
    const clock: Animation[] = [];
    const run: Run = (el, keyframes) => {
      clock.push(el.animate(keyframes, timing));
    };
    const origin = this.#root.getBoundingClientRect();
    for (const el of flow) {
      if (isBreak(el)) {
        continue;
      }
      if (arriving.has(el)) {
        arrive(el, run);
        continue;
      }
      const was = drawn.get(el);
      if (was) {
        glide(el, was, origin, run);
      }
    }
    for (const el of this.#leaving) {
      go(el, drawn.get(el)?.opacity ?? 1, run);
    }
    const start = document.timeline.currentTime;
    for (const animation of clock) {
      animation.startTime = start;
    }
    return clock;
  }

  /** Holds the box at least `was`, and at least what it lays out at now. */
  #hold(was: { width: number; height: number }): void {
    const root = this.#root;
    root.style.minInlineSize = "";
    root.style.minBlockSize = "";
    const now = root.getBoundingClientRect();
    root.style.minInlineSize = `${Math.max(was.width, now.width)}px`;
    root.style.minBlockSize = `${Math.max(was.height, now.height)}px`;
  }
}
