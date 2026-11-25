/**
 * How the settings' sections stand (Gemini Neon's critique, the owner's
 * pick of 2026-11-22): each section's heading and settings on one white
 * card with a crisp edge on the page's ground, sized to what it holds, its
 * groups apart by spacing alone, with no rule under any heading.
 */

/**
 * A section's card: the raised surface on the visible edge, its heading and
 * groups a space-4 apart. Its padding holds its border inside it, so its
 * content stands a space-4 in from the card's outer edge.
 */
export const SECTION_CARD =
  "flex min-w-0 flex-col gap-space-4 rounded-lg border border-ui-2 bg-bg p-[calc(var(--spacing-space-4)_-_1px)]";

/** One group in a card: its label over its controls. */
export const CARD_GROUP = "flex min-w-0 flex-col gap-space-2";

/** A group's label: the row and option label's step, in strong ink (the four-step scale's second). */
export const GROUP_LABEL = "m-0 type-label font-medium text-tx";
