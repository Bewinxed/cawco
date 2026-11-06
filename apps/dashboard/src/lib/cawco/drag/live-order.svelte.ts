/**
 * A list's order while one of its things is in the air (DragProvider): the
 * others make room as it passes, so the list on screen is a held copy that
 * each crossing moves (the hand past the middle of the one it is over,
 * drag/crossing), and the list itself is written once,
 * at the drop, where the copy last stood. Escape lets the copy go: the
 * list stands as it was, and the thing flies back to its place.
 *
 *   const order = new LiveOrder();
 *   const shown = $derived(order.shown(ids));
 *   <DragProvider {...order.handlers(() => ids, (m) => write(m.from, m.to))}>
 */
import { crossed } from "./crossing";
import type { DragEnd, DragMove, DragOver } from "./DragProvider.svelte";

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

  /**
   * It moved, or came over another of the list: once the hand has crossed
   * that one's middle it takes its place, and the others make room.
   */
  over(event: DragOver | DragMove): void {
    const { held } = this;
    const { source, target } = event.operation;
    if (!(held && source && target)) {
      return;
    }
    const from = held.indexOf(String(source.id));
    const to = held.indexOf(String(target.id));
    if (from < 0 || to < 0 || from === to || !crossed(event, from, to)) {
      return;
    }
    this.held = held.toSpliced(from, 1).toSpliced(to, 0, String(source.id));
  }

  /**
   * A DragProvider's handlers for a list whose order is `order()`: `write`
   * hears the thing's move once, at the drop.
   */
  handlers(order: () => readonly string[], write: (move: Moved) => void) {
    return {
      onDragStart: () => this.start(order()),
      onDragMove: (event: DragMove) => this.over(event),
      onDragOver: (event: DragOver) => this.over(event),
      onDragEnd: (event: DragEnd) => {
        const move = this.end(order(), event);
        if (move) {
          write(move);
        }
      },
    };
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
