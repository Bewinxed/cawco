import { tv } from "#lib/utils.js";

/**
 * The composer's shell (the composer's surface brief, Composer: "a 12px pill in the panel
 * material (composer glass) with a 1px control edge and the tile shadow"):
 * what docks at a page's foot stands in it (a session's composer, a decision
 * page's note, the project's views). The composer glass (the panel material
 * at the base blur) so the page shows faintly under it; the opaque raised
 * surface where transparency is reduced (DESIGN.md, Materials). Its inset
 * and its row are its caller's. Its controls are concentric with it
 * (tailwind-super-corners' `sc-concentric-*`): its 12px less their inset.
 */
export const dockShellVariants = tv({
  base: "reduced-transparency:backdrop-filter-none rounded-lg bg-veil shadow-sm ring ring-ui-2 backdrop-blur-glass backdrop-saturate-160 reduced-transparency:bg-bg",
});
