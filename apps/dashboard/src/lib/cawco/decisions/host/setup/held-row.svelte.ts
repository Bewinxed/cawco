/**
 * A stage carried by its reorder handle, as the house order list carries an
 * account (accounts/OrderList.svelte): the row in the hand follows the
 * pointer, the list moves it a place each time it crosses a row's pitch,
 * and it drops into its place on the house exit curve. Up and down arrows
 * on the handle move it a place.
 */
import { tick } from "svelte";
import { dur, ease, motionOk } from "../../../motion/curves.svelte";

export class HeldRow {
  /** The index of the row in the hand, and how far it is carried from its place. */
  at = $state<number | null>(null);
  carried = $state(0);

  /**
   * @param move moves the row at `from` to `to` within the rows the handle may
   *   reach (`first` to `last`, inclusive).
   */
  private readonly move: (from: number, to: number) => void;
  constructor(move: (from: number, to: number) => void) {
    this.move = move;
  }

  grab(event: PointerEvent, index: number, first: number, last: number): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const row = handle.closest("li");
    const step = row ? row.getBoundingClientRect().height : 44;
    const from = index;
    let at = index;
    const y0 = event.clientY;
    handle.setPointerCapture(event.pointerId);
    this.at = index;
    const onmove = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      const next = Math.max(
        first,
        Math.min(last, Math.round(from + dy / step))
      );
      if (next !== at) {
        this.move(at, next);
        at = next;
        this.at = next;
      }
      this.carried = dy - (at - from) * step;
    };
    const drop = () => {
      handle.removeEventListener("pointermove", onmove);
      handle.removeEventListener("pointerup", drop);
      handle.removeEventListener("pointercancel", drop);
      const left = this.carried;
      const dropped = this.at;
      this.at = null;
      this.carried = 0;
      if (motionOk.current && left !== 0 && dropped !== null) {
        const landed = handle
          .closest("ol")
          ?.querySelector<HTMLElement>(`[data-row="${dropped}"]`);
        landed?.animate(
          [{ transform: `translateY(${left}px)` }, { transform: "none" }],
          { duration: dur("--dur-exit"), easing: ease("--ease-out") }
        );
      }
    };
    handle.addEventListener("pointermove", onmove);
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", drop);
  }

  /** Up or down a place, the focus kept on the handle it moved. */
  nudge(
    event: KeyboardEvent,
    index: number,
    first: number,
    last: number
  ): void {
    const by = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (by === undefined) {
      return;
    }
    event.preventDefault();
    const to = index + by;
    if (to < first || to > last) {
      return;
    }
    const list = (event.currentTarget as HTMLElement).closest("ol");
    this.move(index, to);
    tick().then(() =>
      list
        ?.querySelector<HTMLElement>(`[data-row="${to}"] [data-slot="handle"]`)
        ?.focus()
    );
  }
}
