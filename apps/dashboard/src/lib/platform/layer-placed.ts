/**
 * The event a kit floating layer's box fires once its layer stands placed
 * on its anchor (at an open, or on a new anchor): its drawn box and the
 * side of its anchor it took (components/ui/anchored.svelte.ts). What
 * draws by where the layer stands (a hanging card's neck, motion/hang.ts)
 * hears it rather than measuring a placement of its own.
 */
export const PLACED = "kit-placed";

/** What a placed layer's event says. */
export interface Placed {
  box: DOMRect;
  side: "top" | "right" | "bottom" | "left";
}
