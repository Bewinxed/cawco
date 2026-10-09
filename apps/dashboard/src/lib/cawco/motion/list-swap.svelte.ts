/**
 * Swapping one list for another without tearing either down: the new
 * session dialog's model list on a harness change, and the home's
 * Working/Finished switch. One mechanism, one set of timings.
 *
 * The timeline:
 * - The old rows (the first LEAVING) are copied into an inert `leaving`
 *   layer laid over the list's top and leave the other way (`ns-out-*`)
 *   over OUT_MS, OUT_STAGGER apart, top down; the layer is cleared once the
 *   last one is out.
 * - The new rows mount at once, keyed `${gen}:${id}` so even a row in both
 *   lists enters as new, and come in from the side the choice moved toward
 *   (`ns-in-*`, 18px and a fade) over IN_MS: the first once the first old
 *   row is out (IN_LEAD = OUT_MS), each next IN_STAGGER later, capped at
 *   STAGGER_CAP.
 * A relay: each new row arrives no sooner than the old row in its place
 * has gone (`rowAnim`'s `notBefore`, which a caller that knows the places
 * passes), so a row and its replacement are never on screen in the same
 * place in the same frame.
 *
 * The keyframes are global (app.css): the rows name them from an inline
 * style, which a component's scoped <style> cannot rewrite.
 */
import { ease, motionOk } from "./curves.svelte";

export const OUT_MS = 200;
const OUT_STAGGER = 18;
/** The entrance waits for the exit's first row: never both in one place. */
const IN_LEAD = OUT_MS;
export const IN_MS = 300;
const IN_STAGGER = 40;
/** Rows past this all move together; a stagger that keeps growing down a
    forty-row list is a wait, not a rhythm. */
const STAGGER_CAP = 9;
/** How many leaving rows keep animating. A list shows about five. */
const LEAVING = 8;
/** How long the leaving layer stands, its last row's delay plus its exit. */
export const LEAVE_MS = OUT_MS + OUT_STAGGER * LEAVING;

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
    { keep = LEAVING, hold = LEAVE_MS }: { keep?: number; hold?: number } = {}
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

  /** When the i-th leaving line has gone, from the swap. */
  static leaveEnd(i: number): number {
    return Math.min(i, STAGGER_CAP) * OUT_STAGGER + OUT_MS;
  }

  /** When the i-th incoming line starts, from the swap. */
  static enterAt(i: number, notBefore = 0): number {
    return Math.max(IN_LEAD + Math.min(i, STAGGER_CAP) * IN_STAGGER, notBefore);
  }

  /**
   * Rows a list grows by, with nothing leaving it (the update toast opening
   * to its whole notes): they come in as a swap's new rows do (`ns-in-r`),
   * IN_STAGGER apart and capped alike, with no lead, since no old row is
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
          duration: IN_MS,
          delay: Math.min(i, STAGGER_CAP) * IN_STAGGER,
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
      motionOk.current ? IN_LEAD + STAGGER_CAP * IN_STAGGER + IN_MS : 0
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
    return `${this.dir > 0 ? "ns-in-r" : "ns-in-l"} ${IN_MS}ms var(--ease-out) both ${ListSwap.enterAt(i, notBefore)}ms`;
  }

  /** The `animation` for the i-th leaving row. */
  leaveAnim(i: number): string {
    if (!motionOk.current) {
      return "none";
    }
    return `${this.dir > 0 ? "ns-out-l" : "ns-out-r"} ${OUT_MS}ms var(--ease-out) both ${Math.min(i, STAGGER_CAP) * OUT_STAGGER}ms`;
  }
}
