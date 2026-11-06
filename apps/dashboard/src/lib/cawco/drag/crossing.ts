/**
 * When a thing carried along its own list takes the place of the one it is
 * over: once the hand has crossed that one's middle, in the direction it is
 * travelling, and not before. The rows of a list move on its own clock
 * (`reflow`), so the row that made room is still in flight under the hand
 * for a beat, and dnd kit's collisions read it there: taking its place the
 * moment it was touched sent it back the next frame, and back again, a card
 * that "had a seizure" while held still over its neighbour. Read against
 * where each row stands once landed (its layout box, the flight left out),
 * a crossing happens once, and going back takes the hand going back over
 * the middle.
 *
 * Along a row (a strip of tabs, a grid's row) the middle is across; down a
 * column it is the height's. A drag the keys carry has chosen its row
 * already: it crosses at once.
 */
import type { DragMove, DragOver } from "./DragProvider.svelte";

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

/** Where `element` stands once landed: its box with any flight's travel (transform, translate) taken out. */
function landed(element: Element): Box {
  const box = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const moved =
    style.transform === "none"
      ? new DOMMatrixReadOnly()
      : new DOMMatrixReadOnly(style.transform);
  const [tx = 0, ty = 0] =
    style.translate === "none"
      ? []
      : style.translate.split(" ").map((one) => Number.parseFloat(one) || 0);
  const x = moved.m41 + tx;
  const y = moved.m42 + ty;
  return {
    left: box.left - x,
    right: box.right - x,
    top: box.top - y,
    bottom: box.bottom - y,
  };
}

/**
 * Whether the thing in the air, at place `from` in its list, has crossed
 * the middle of the one it is over, at place `to` there. Its own place is
 * read off the slot held open for it (dnd kit's placeholder).
 */
export function crossed(
  event: DragOver | DragMove,
  from: number,
  to: number
): boolean {
  const { activatorEvent, position, target } = event.operation;
  if (activatorEvent instanceof KeyboardEvent || from === to) {
    return true;
  }
  const over = target?.element;
  const slot = document.querySelector("[data-dnd-placeholder]");
  if (!(over && slot)) {
    return true;
  }
  const them = landed(over);
  const mine = landed(slot);
  const { x, y } = position.current;
  // Side by side (their tops level): the middle across; else down.
  const along = Math.abs(them.top - mine.top) < 2;
  const middle = along
    ? (them.left + them.right) / 2
    : (them.top + them.bottom) / 2;
  const hand = along ? x : y;
  return to > from ? hand > middle : hand < middle;
}
