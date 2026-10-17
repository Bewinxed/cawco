/**
 * DESIGN STATES: a suggestion's silhouette, shared by the panel's hero and
 * the board. The house's raised tile (TaskCard's recipe: raised surface,
 * tile shadow, radius-sm, space-2 space-3 space-3), the hover wash and the
 * press scale of a compact control. An offer on the board is the same
 * shape on a dashed control edge and no surface of its own, so it never
 * reads as a task until Caw has filed it.
 */
const SHAPE =
  "grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-x-(--space-2) rounded-sm px-(--space-3) pt-(--space-2) pb-(--space-3) text-start";
const PRESS =
  "pressable focus-inset cursor-pointer text-[var(--ink-strong)] transition-[background-color,transform] duration-(--dur-control) ease-(--ease-out) hover:bg-[var(--surface-hover)]";

/** The tile's shape on the raised surface, for a skeleton standing at its size. */
export const TILE_SHAPE = `${SHAPE} bg-[var(--surface-raised)] shadow-[var(--shadow-tile)]`;
/** A suggestion: the raised tile, pressable. */
export const TILE = `${TILE_SHAPE} border-0 ${PRESS}`;
/** An offer standing where its task would land: the tile's shape on a dashed edge. */
export const OFFER = `${SHAPE} border border-dashed border-[var(--border-control)] bg-transparent ${PRESS}`;
