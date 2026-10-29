/**
 * A bare symbol in a glass group (DESIGN.md, The Title Bars Follow Liquid
 * Glass Rule): a borderless 28px item, its 20px Solar glyph in the muted
 * ink, a fill only while hovered or pressed, 44px under a finger, the
 * house ring on a key's focus. One class list, so every item of the
 * graph's bars is the same object.
 */
export const SYMBOL =
  "relative grid size-c-bar-item flex-none place-items-center rounded-pill text-ink-muted touch-hit transition-[background-color,color,scale] duration-(--dur-control) ease-out not-aria-pressed:hover:bg-surface-hover hover:text-ink-strong active:scale-(--press-scale) focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset) aria-pressed:bg-surface-pressed aria-pressed:text-ink-strong [&_svg]:size-c-bar-symbol";

/** A word-labelled action beside the symbols (Reset): the sm ghost, its own group (Keep actions with text labels separate). */
export const GHOST =
  "h-c-btn-h-sm flex-none rounded-sm px-space-2 type-label text-ink-strong touch-hit transition-colors duration-(--dur-control) ease-out hover:bg-surface-hover focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)";

/** The house focus ring, for a control drawn by hand. */
export const RING =
  "focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-offset)";
