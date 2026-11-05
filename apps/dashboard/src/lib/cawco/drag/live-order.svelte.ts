/**
 * A list's order while one of its things is in the air (DragProvider): the
 * others make room as it passes, so the list on screen is a held copy that
 * each pass moves (dnd kit's `move`), and the list itself is written once,
 * at the drop, where the copy last stood. Escape lets the copy go: the
 * list stands as it was, and the thing flies back to its place.
 *
 *   const order = new LiveOrder();
 *   const shown = $derived(order.shown(ids));
 *   <DragProvider onDragStart={() => order.start(ids)}
 *     onDragOver={(e) => order.over(e)}
 *     onDragEnd={(e) => { const m = order.end(ids, e); if (m) write(m.from, m.to); }}>
 */
import { move } from "@dnd-kit/helpers";
import type { DragEnd, DragOver } from "./DragProvider.svelte";

/** A thing's move, from its place in the list to its new one. */
export interface Moved {
  from: number;
  to: number;
}

export class LiveOrder {
  /** The ids as the held copy stands; null with nothing in the air. */
  held = $state<string[] | null>(null);

  /** The order on screen: the held copy while a drag holds one, else the list's. */
  shown(order: readonly string[]): readonly string[] {
    return this.held ?? order;
  }

  /** A thing of this list was picked up. */
  start(order: readonly string[]): void {
    this.held = [...order];
  }

  /** It passed over another of the list: the others make room. */
  over(event: DragOver): void {
    if (this.held) {
      this.held = move(this.held, event);
    }
  }

  /**
   * It was let go. Its move in `order`, or null when it stands where it
   * was (put back with Escape, or let go on its own place).
   */
  end(order: readonly string[], event: DragEnd): Moved | null {
    const { held } = this;
    this.held = null;
    const id = event.operation.source?.id;
    if (!held || event.canceled || id === undefined) {
      return null;
    }
    const from = order.indexOf(String(id));
    const to = held.indexOf(String(id));
    return from < 0 || to < 0 || from === to ? null : { from, to };
  }
}
