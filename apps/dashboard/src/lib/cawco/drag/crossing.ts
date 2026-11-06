/**
 * Where a thing carried along its own list stands: it takes the place of
 * the one it covers half of along the list (its height down a column, its
 * width along a row), as the person sees it covered (the thing as
 * drawn under the hand, against where each of the others lands), wherever
 * the hand took it (by its top, its middle or its foot). The rule, settled
 * from what moves a neighbour elsewhere:
 *
 * - dnd kit's own sortable (@dnd-kit/collision 0.5.3, its default
 *   `pointerIntersection` then `shapeIntersection`): once the pointer is
 *   inside the neighbour, which depends on where the item was taken;
 * - Planka (plankanban/planka, react-beautiful-dnd 13, get-reorder-impact):
 *   once the dragged item's leading edge moves past the neighbour's centre,
 *   half of it covered; back once its trailing edge moves past the
 *   neighbour's displaced centre;
 * - Vikunja (go-vikunja/vikunja, SortableJS 1.15.7): once the pointer is in
 *   the neighbour's swap zone, the whole of it (`swapThreshold` 1).
 *
 * Half covered, read off the covering itself, is Planka's rule without the
 * dependence on the grab point the other two keep.
 *
 * Each of the others is read where it lands (its box with any flight's
 * travel left out): the list moves its rows on its own clock (`reflow`),
 * and one still in flight under the hand is not where it is going.
 *
 * Taking back the place just given up wants more: three quarters of that
 * one covered. A neighbour that made room lands half under the thing, less
 * the gap between them, so a hand that wobbles a few pixels over the line
 * would trade places back and forth; it moves once per crossing.
 *
 * A drag the keys carry steps from one to the next (dnd kit's keyboard
 * sorting, each step a dragover): it takes the place of the one it stepped
 * onto.
 */
import type { DragMove, DragOver } from "./DragProvider.svelte";

/** How much of one the thing must cover to take its place. */
const TAKE = 0.5;
/** How much of the one it just gave its place to it must cover to take it back. */
const TAKE_BACK = 0.75;

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
 * How much of `box` `over` covers along the list: across, for one beside
 * the slot (their tops level, a strip's tabs, a grid's row); down, for one
 * above or below it. The other way it need only touch, so a thing carried
 * a little to the side of a column still covers half of a card by its
 * height.
 */
function covered(over: Box, box: Box, slot: Box): number {
  const across =
    Math.min(over.right, box.right) - Math.max(over.left, box.left);
  const down = Math.min(over.bottom, box.bottom) - Math.max(over.top, box.top);
  if (across <= 0 || down <= 0) {
    return 0;
  }
  return Math.abs(box.top - slot.top) < 2
    ? across / (box.right - box.left)
    : down / (box.bottom - box.top);
}

/** The thing last given a place by this drag, and the one it took it from. */
let last: { source: string; gave: string } | null = null;

/** The one of `ids` (not `id`) the thing as drawn covers most of, and how much. */
function mostCovered(
  ids: readonly string[],
  id: string,
  elementOf: (id: string) => Element | null | undefined
): { id: string; share: number } | null {
  const carried = document.querySelector("[data-dnd-dragging]");
  if (!carried) {
    return null;
  }
  const drawn = carried.getBoundingClientRect();
  const held = document.querySelector("[data-dnd-placeholder]");
  const slot = held ? landed(held) : drawn;
  let best: { id: string; share: number } | null = null;
  for (const other of ids) {
    const element = other === id ? null : elementOf(other);
    const share = element ? covered(drawn, landed(element), slot) : 0;
    if (share > (best?.share ?? 0)) {
      best = { id: other, share };
    }
  }
  return best;
}

/**
 * The place, in `ids` (its list as it stands now, the thing among them),
 * the thing in the air takes now, or null where it stays. `elementOf`
 * finds each of the others as drawn in the list.
 */
export function placeOver(
  event: DragOver | DragMove,
  ids: readonly string[],
  elementOf: (id: string) => Element | null | undefined
): number | null {
  const { activatorEvent, source, target } = event.operation;
  const id = source ? String(source.id) : null;
  const from = id === null ? -1 : ids.indexOf(id);
  if (id === null || from < 0) {
    return null;
  }
  if (last?.source !== id) {
    last = null;
  }
  if (activatorEvent instanceof KeyboardEvent) {
    const to = target ? ids.indexOf(String(target.id)) : -1;
    return to >= 0 && to !== from ? to : null;
  }
  const best = mostCovered(ids, id, elementOf);
  if (!best || best.share < (last?.gave === best.id ? TAKE_BACK : TAKE)) {
    return null;
  }
  last = { source: id, gave: best.id };
  return ids.indexOf(best.id);
}
