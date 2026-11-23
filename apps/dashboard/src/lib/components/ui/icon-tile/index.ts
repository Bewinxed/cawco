import { tv } from "#lib/utils.js";

/**
 * The icon tile (DESIGN.md, Icon tile: "a raised 26px square at 8px
 * squares with the tile shadow, dashed for empty or inverted for chosen";
 * Identity marks and tiles: "Icon tile: a raised 26px square at 8px radius
 * with the tile shadow, holding a 16px duotone glyph in its section or
 * machine hue. Chosen, it inverts to an `ink-strong` fill with an `on-ink`
 * glyph"). Its glyph's hue is the caller's (`style:color`, left off while
 * chosen). Chosen is the element's state, `data-ink`; its fill and ink cross
 * over --duration-slow.
 *
 * - `empty`: a dashed outline with no fill, for a row that adds the thing
 *   ("Connect a machine…", "New project…").
 */
export const iconTileVariants = tv({
  base: "inline-flex size-6.5 flex-none items-center justify-center rounded-sm bg-bg shadow-sm transition-[background-color,color] duration-(--duration-slow) ease-out data-ink:bg-tx data-ink:text-bg data-ink:shadow-none [&_svg]:flex-none",
  variants: {
    empty: {
      true: "border border-dashed border-tx-2 bg-transparent shadow-none",
    },
  },
});
