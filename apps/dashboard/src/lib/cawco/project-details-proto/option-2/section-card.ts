/**
 * How the settings' sections stand (Gemini Neon's critique, the owner's
 * pick of 2026-11-22): each section's settings on one white card with a
 * crisp edge on the page's ground, its groups apart by spacing alone, with
 * no rule under any heading.
 */

/** A section's card: the raised surface on the visible edge, its groups a space-5 apart. */
export const SECTION_CARD =
  "flex min-w-0 flex-col gap-space-5 rounded-lg border border-border bg-surface-raised p-space-5";

/** One group in a card: its label over its controls. */
export const CARD_GROUP = "flex min-w-0 flex-col gap-space-2";

/** A group's label: the row and option label's step, in strong ink (the four-step scale's second). */
export const GROUP_LABEL = "m-0 type-label font-medium text-ink-strong";
