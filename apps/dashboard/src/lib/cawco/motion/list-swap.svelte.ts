/**
 * Swapping one list for another without tearing either down: the new
 * session dialog's model list on a harness change, and the home's
 * Working/Finished switch. One mechanism, one set of timings.
 *
 * The timeline:
 * - The old rows (the first LEAVING) are copied into an inert `leaving`
 *   layer laid over the list's top and leave the other way (`ns-out-*`)
 *   together over --dur-exit (DESIGN.md, The Nothing Jumps Rule:
 *   departures all start on the same frame); the layer is cleared once
 *   they are out.
 * - The new rows mount at once, keyed `${gen}:${id}` so even a row in both
 *   lists enters as new, and come in from the side the choice moved toward
 *   (`ns-in-*`, 18px and a fade) over --dur-pop: the first once the old
 *   rows are out, each next --dur-stagger later, capped at STAGGER_CAP.
 * A relay: each new row arrives no sooner than the old row in its place
 * has gone (`rowAnim`'s `notBefore`, which a caller that knows the places
 * passes), so a row and its replacement are never on screen in the same
 * place in the same frame.
 *
 * The keyframes are global (app.css): the rows name them from an inline
 * style, which a component's scoped <style> cannot rewrite.
 */
import type { TransitionConfig } from "svelte/transition";
import { dur, ease, motionOk } from "./curves.svelte";

/** The leaving rows' beat. */
const outMs = () => dur("--dur-exit");
/** An incoming row's beat. */
export const inMs = () => dur("--dur-pop");
/** Between one incoming row and the next. */
const inStagger = () => dur("--dur-stagger");
/** Rows past this all move together; a stagger that keeps growing down a
    forty-row list is a wait, not a rhythm. */
const STAGGER_CAP = 9;
/** How many leaving rows keep animating. A list shows about five. */
const LEAVING = 8;

export class ListSwap<T> {
  /** The rows the last list had, still on screen while the new ones arrive. */
  leaving = $state<T[]>([]);
  /** Bumped on every swap; key incoming rows by it. */
  gen = $state(0);
  phase = $state<"in" | "idle">("idle");
  /** 1 when the choice moved forward (rows arrive from the right), else -1. */
  dir = $state(1);
  #clear: ReturnType<typeof setTimeout> | undefined;
  #idle: ReturnType<typeof setTimeout> | undefined;

  /** `enter`: the first list staggers in too, rather than standing there. */
  constructor(enter = false) {
    if (enter) {
      this.#enter();
    }
  }

  /**
   * Replaces the shown list: `outgoing` leaves, the new rows enter. `keep`
   * is how many leaving rows animate (the rest are dropped at once), `hold`
   * how long the leaving layer stands.
   */
  swap(
    outgoing: T[],
    dir: number,
    { keep = LEAVING, hold = outMs() }: { keep?: number; hold?: number } = {}
  ): void {
    this.dir = dir > 0 ? 1 : -1;
    this.leaving = outgoing.slice(0, keep);
    this.gen += 1;
    this.#enter();
    clearTimeout(this.#clear);
    this.#clear = setTimeout(
      () => {
        this.leaving = [];
      },
      motionOk.current ? hold : 0
    );
  }

  /**
   * Keeps the entrance standing `ms` from now, and the leaving rows until
   * the caller lets them go (`release`): for a caller that learns how long
   * its change runs only once the new rows are laid out, and settles it
   * itself. The leaving rows used to go on a timer of their own, a task
   * before the caller's settle: that one change to the list, made while a
   * closed box was still held at its end, let the reflow around the list
   * replay the whole change from where it stood before (the home's Recent
   * jumped back down the box's height and glided up again).
   */
  hold(ms: number): void {
    clearTimeout(this.#clear);
    clearTimeout(this.#idle);
    this.#idle = setTimeout(() => {
      this.phase = "idle";
    }, ms);
  }

  /** The leaving rows go, in the caller's own settle. */
  release(): void {
    clearTimeout(this.#clear);
    this.leaving = [];
  }

  /** When the leaving lines have gone, from the swap. */
  static leaveEnd(): number {
    return outMs();
  }

  /**
   * When the i-th incoming line starts, from the swap: never before the
   * leaving lines are out, so a row and the one it replaces are never both
   * in one place.
   */
  static enterAt(i: number, notBefore = 0): number {
    return Math.max(
      outMs() + Math.min(i, STAGGER_CAP) * inStagger(),
      notBefore
    );
  }

  /**
   * Rows a list grows by, with nothing leaving it (the update toast opening
   * to its whole notes): they come in as a swap's new rows do (`ns-in-r`),
   * --dur-stagger apart and capped alike, with no lead, since no old row is
   * there to wait for. With reduced motion they are simply there.
   */
  static reveal(rows: readonly Element[]): void {
    if (!motionOk.current) {
      return;
    }
    rows.forEach((row, i) => {
      row.animate(
        [
          { opacity: 0, transform: "translateX(18px)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: inMs(),
          delay: Math.min(i, STAGGER_CAP) * inStagger(),
          easing: ease("--ease-out"),
          fill: "backwards",
        }
      );
    });
  }

  #enter(): void {
    this.phase = "in";
    if (typeof window === "undefined") {
      return;
    }
    clearTimeout(this.#idle);
    this.#idle = setTimeout(
      () => {
        this.phase = "idle";
      },
      motionOk.current ? ListSwap.enterAt(STAGGER_CAP) + inMs() : 0
    );
  }

  /**
   * The `animation` for the i-th incoming row, starting no sooner than
   * `notBefore` ms: when the old row in its place is gone.
   */
  rowAnim(i: number, notBefore = 0): string {
    if (this.phase !== "in" || !motionOk.current) {
      return "none";
    }
    return `${this.dir > 0 ? "ns-in-r" : "ns-in-l"} var(--dur-pop) var(--ease-out) both ${ListSwap.enterAt(i, notBefore)}ms`;
  }

  /** The `animation` for a leaving row: every one leaves on the same frame. */
  leaveAnim(): string {
    if (!motionOk.current) {
      return "none";
    }
    return `${this.dir > 0 ? "ns-out-l" : "ns-out-r"} var(--dur-exit) var(--ease-out) both`;
  }

  /**
   * The outro of a whole view swapped for the next (a project's views, the
   * decisions list and a page): the view itself, held where it stood over
   * the pane's top, inert, leaves as the first leaving row does.
   */
  leaveView = (node: HTMLElement): TransitionConfig => {
    node.style.position = "absolute";
    node.style.inset = "0 0 auto";
    node.style.pointerEvents = "none";
    node.inert = true;
    node.setAttribute("aria-hidden", "true");
    node.style.animation = this.leaveAnim();
    return { duration: motionOk.current ? ListSwap.leaveEnd() : 0 };
  };
}
