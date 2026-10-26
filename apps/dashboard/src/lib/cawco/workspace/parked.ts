/**
 * What the phone's two stacks share, the tab swipe's panes
 * (gesture.svelte.ts) and the two-finger deck's cards (deck.svelte.ts): the
 * elements the stylesheet parks beside the one in front, and a settle a
 * press stops and its release lets go on.
 */
import { type Sample, sampleAt } from "../motion/spring";

/** One element in view: it and its distance from the one in front. */
export interface Parked {
  delta: number;
  el: HTMLElement;
}

/** The elements under `root` matching `selector` that stand in front or beside it. */
export function gatherParked(
  root: HTMLElement | null,
  selector: string
): Parked[] {
  if (!root) {
    return [];
  }
  const found: Parked[] = [];
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    const delta = Number(el.dataset.delta);
    if (Math.abs(delta) <= 1) {
      found.push({ el, delta });
    }
  }
  return found;
}

/** Where a settle is right now, read off the clock of the one in front's animation. */
export function settleAt(
  items: Parked[],
  animations: Animation[],
  path: Sample[]
): Sample | null {
  const animation = animations[items.findIndex((item) => item.delta === 0)];
  const at = animation?.currentTime;
  if (typeof at !== "number" || path.length === 0) {
    return null;
  }
  return sampleAt(path, at / 1000);
}

/**
 * A settle a press stops where it is: `hold` stops it there and keeps its
 * velocity (or lands it, when where it is could not be read), `resume` lets
 * it go on from there once the press leaves without moving it, `drop`
 * forgets it once the press moves.
 */
export function catchSettle(settle: {
  animations: () => Animation[];
  items: () => Parked[];
  land: () => void;
  path: () => Sample[];
  spring: (velocity: number) => void;
  /** Stands the stack at `x`, its offset. */
  stand: (x: number) => void;
  stop: () => void;
}) {
  let held: number | null = null;
  return {
    hold(): void {
      const animations = settle.animations();
      if (animations.length === 0) {
        return;
      }
      const at = settleAt(settle.items(), animations, settle.path());
      settle.stop();
      if (!at) {
        settle.land();
        return;
      }
      held = at.v;
      settle.stand(at.x);
    },
    resume(): void {
      if (held === null) {
        return;
      }
      const velocity = held;
      held = null;
      settle.spring(velocity);
    },
    drop(): void {
      held = null;
    },
  };
}
