/**
 * A list ordered by the hand: a row dragged up or down follows the pointer
 * while the others make room on the list's reflow (motion/rows), and drops
 * into its place; the up and down arrows move a focused row one place.
 * Each move hands the new order to `onchange` at once; what the order is
 * saved to, and what a refusal puts back, is the list's own.
 *
 *   const hand = new HandOrder();
 *   <ol bind:this={list} {@attach reflow()}>
 *     <li data-flip={hand.held === id ? undefined : ""}
 *         style:transform={hand.carry(id)}>
 *       <button onpointerdown={(e) => hand.grab(e, id, order, onchange, list)}
 *               onkeydown={(e) => hand.nudge(e, id, order, onchange, list)}
 *               data-id={id}>
 *
 * The rows are the list's direct children, one step apart; the grabbed
 * control carries `data-id`, which the arrows' focus follows.
 */
import { tick } from "svelte";
import { dur, ease, motionOk } from "./curves.svelte";
import { REFLOW_REREAD } from "./rows.svelte";

export class HandOrder {
  /** The row in the hand. */
  held = $state<string | null>(null);
  /** How far it has been carried from its place, in px. */
  carried = $state(0);

  /** The held row's transform; undefined for every other row. */
  carry(id: string): string | undefined {
    return this.held === id ? `translateY(${this.carried}px)` : undefined;
  }

  grab(
    event: PointerEvent,
    id: string,
    order: readonly string[],
    onchange: (order: string[]) => void,
    list: HTMLElement | null,
    /** The row was let go where it moved to: the order to keep. */
    ondone?: (order: string[]) => void
  ): void {
    if (event.button !== 0 || !list) {
      return;
    }
    event.preventDefault();
    const row = event.currentTarget as HTMLElement;
    const items = [...list.children] as HTMLElement[];
    const step =
      items.length > 1
        ? items[1].offsetTop - items[0].offsetTop
        : row.offsetHeight;
    const from = order.indexOf(id);
    let now = [...order];
    let at = from;
    const y0 = event.clientY;
    row.setPointerCapture(event.pointerId);
    this.held = id;
    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - y0;
      const next = Math.max(
        0,
        Math.min(order.length - 1, Math.round(from + dy / step))
      );
      if (next !== at) {
        const ids = now.filter((one) => one !== id);
        ids.splice(next, 0, id);
        at = next;
        now = ids;
        onchange(ids);
      }
      this.carried = dy - (at - from) * step;
    };
    const drop = async () => {
      row.removeEventListener("pointermove", move);
      row.removeEventListener("pointerup", drop);
      row.removeEventListener("pointercancel", drop);
      const left = this.carried;
      this.held = null;
      this.carried = 0;
      if (motionOk.current && left !== 0) {
        row.animate(
          [{ transform: `translateY(${left}px)` }, { transform: "none" }],
          { duration: dur("--dur-exit"), easing: ease("--ease-out") }
        );
      }
      if (at !== from) {
        ondone?.(now);
      }
      await tick();
      list.dispatchEvent(new Event(REFLOW_REREAD));
    };
    row.addEventListener("pointermove", move);
    row.addEventListener("pointerup", drop);
    row.addEventListener("pointercancel", drop);
  }

  nudge(
    event: KeyboardEvent,
    id: string,
    order: readonly string[],
    onchange: (order: string[]) => void,
    list: HTMLElement | null,
    /** The row moved a place: the order to keep. */
    ondone?: (order: string[]) => void
  ): void {
    const by = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (by === undefined) {
      return;
    }
    event.preventDefault();
    const from = order.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= order.length) {
      return;
    }
    const ids = [...order];
    ids.splice(from, 1);
    ids.splice(to, 0, id);
    onchange(ids);
    ondone?.(ids);
    tick().then(() =>
      list?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus()
    );
  }
}
