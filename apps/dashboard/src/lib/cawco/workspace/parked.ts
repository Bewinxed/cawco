/**
 * What the phone's two stacks share, the tab swipe's panes
 * (gesture.svelte.ts) and the two-finger deck's cards (deck.svelte.ts): the
 * elements the stylesheet parks beside the one in front, and a settle a
 * press stops and its release lets go on.
 */
import type { Sample } from "../motion/spring";

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

/**
 * A settle a press stops where it is: `hold` stops it there and keeps its
 * velocity (or lands it, when where it is could not be read), `resume` lets
 * it go on from there once the press leaves without moving it, `drop`
 * forgets it once the press moves.
 */
export function catchSettle(settle: {
  land: () => void;
  playing: () => boolean;
  progress: () => Sample | null;
  spring: (velocity: number) => void;
  /** Stands the stack at `x`, its offset. */
  stand: (x: number) => void;
  stop: () => void;
}) {
  let held: number | null = null;
  return {
    hold(): void {
      if (!settle.playing()) {
        return;
      }
      const at = settle.progress();
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
