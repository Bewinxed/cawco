import { tv } from "#lib/utils.js";

/**
 * The icon tile (DESIGN.md, Identity marks and tiles: "Icon tile"): a 26px
 * slot holding a 16px duotone glyph, bare, in its section or machine hue (The
 * Bare Glyph Rule: no tile is drawn round it at rest). Chosen, the slot fills
 * `ink-solid` with an `on-ink` glyph: a selection, not a container. Its
 * glyph's hue is the caller's (`style:color`, left off while chosen). Chosen
 * is the element's state, `data-ink`; its fill and ink cross over --dur-pop.
 *
 * - `empty`: the glyph in `ink-muted`, for a row that adds the thing
 *   ("Connect a machine…", "New project…").
 */
export const iconTileVariants = tv({
  base: "inline-flex size-c-mark flex-none items-center justify-center rounded-sm transition-[background-color,color] duration-(--dur-pop) ease-out data-ink:bg-ink-solid data-ink:text-on-ink [&_svg]:flex-none",
  variants: {
    empty: {
      true: "text-ink-muted",
    },
  },
});
