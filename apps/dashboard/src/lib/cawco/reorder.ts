/**
 * Reordering by drag on Pragmatic drag and drop, as a page's blocks and a
 * setup draft's stages move (blocks/block-dnd.svelte.ts,
 * project/stage-dnd.svelte.ts): where the drop line stands while an item
 * is over another, and where the item lands when it is let go, both read
 * off the target's closest edge (pragmatic-drag-and-drop-hitbox).
 */
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";

type Data = Record<string | symbol, unknown>;

/** The target the pointer is nearest, by its key, and the edge a drop would take. */
export interface EdgeOver {
  edge: Edge;
  key: string;
}

/**
 * The drop line as the pointer moves over target `key`: on its closest
 * edge, and on none while the item over it is the one dragged. Heard as the
 * pointer enters, so the line is drawn from that frame, and on every frame
 * it moves (Pragmatic throttles `onDrag` to frames).
 */
export function hintEdge(
  hint: { over: EdgeOver | null },
  key: string,
  dragged: string | undefined,
  self: Data
): void {
  const edge = extractClosestEdge(self);
  if (dragged === key || edge === null) {
    if (hint.over?.key === key) {
      hint.over = null;
    }
    return;
  }
  if (hint.over?.key !== key || hint.over.edge !== edge) {
    hint.over = { key, edge };
  }
}

/**
 * Where the dragged item lands, let go over `target` (its key under
 * `field` in the target's data): its place in `order`, or null when it
 * would not move (dropped on itself, or on nothing).
 */
export function dropPlace(
  order: string[],
  dragged: string | undefined,
  target: { data: Data } | undefined,
  field: string
): number | null {
  const edge = target ? extractClosestEdge(target.data) : null;
  const onto = target?.data[field];
  if (
    dragged === undefined ||
    typeof onto !== "string" ||
    edge === null ||
    onto === dragged
  ) {
    return null;
  }
  return placeAt(order, dragged, onto, edge);
}

/**
 * Where `item` lands, dropped at `onto`'s `edge`: before the target (its
 * top or leading side) or after it, counted in the order `item` has
 * already left. Null when it would not move.
 */
function placeAt(
  order: string[],
  item: string,
  onto: string,
  edge: Edge
): number | null {
  const from = order.indexOf(item);
  const at = order.indexOf(onto);
  if (from < 0 || at < 0) {
    return null;
  }
  let to = edge === "top" || edge === "left" ? at : at + 1;
  if (from < to) {
    to -= 1;
  }
  return to === from ? null : to;
}
