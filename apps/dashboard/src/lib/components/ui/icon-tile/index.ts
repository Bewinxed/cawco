import { tv } from "#lib/utils.js";

/**
 * The icon tile (DESIGN.md, New-session dialog: "Icon tiles are raised 8px
 * squares with the tile shadow, dashed for empty or inverted for chosen";
 * Identity marks and tiles: "Icon tile: a raised 26px square at 8px radius
 * with the tile shadow, holding a 16px duotone glyph in its section or
 * machine hue. Chosen, it inverts to an `ink-solid` fill with an `on-ink`
 * glyph"). Its glyph's hue is the caller's (`style:color`, left off while
 * chosen). Chosen is the element's state, `data-ink`; its fill and ink cross
 * over --dur-pop.
 *
 * - `empty`: a dashed outline with no fill, for a row that adds the thing
 *   ("Connect a machine…", "New project…").
 */
export const iconTileVariants = tv({
  base: "inline-flex size-c-mark flex-none items-center justify-center rounded-sm bg-surface-raised shadow-tile transition-[background-color,color] duration-(--dur-pop) ease-out data-ink:bg-ink-solid data-ink:text-on-ink data-ink:shadow-none [&_svg]:flex-none",
  variants: {
    empty: {
      true: "border border-dashed border-neutral-8 bg-transparent shadow-none",
    },
  },
});
