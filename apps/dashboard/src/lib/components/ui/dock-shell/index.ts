import { tv } from "#lib/utils.js";

/**
 * The composer's shell (DESIGN.md, Composer: "a 12px pill in the panel
 * material (composer glass) with a 1px control edge and the tile shadow"):
 * what docks at a page's foot stands in it (a session's composer, a decision
 * page's note, the project's views). The composer glass (the panel material
 * at the base blur) so the page shows faintly under it; the opaque raised
 * surface where transparency is reduced (DESIGN.md, Materials). Its inset
 * and its row are its caller's. Its controls are concentric with it
 * (design.css `concentric-in`): its 12px less their inset and its edge.
 */
export const dockShellVariants = tv({
  base: "reduced-transparency:backdrop-filter-none rounded-lg border border-border-control bg-material-panel shadow-tile backdrop-blur-(--material-blur) backdrop-saturate-(--material-saturate) concentric-in r-inset-c-inset-composer r-outer-lg reduced-transparency:bg-surface-raised",
});
