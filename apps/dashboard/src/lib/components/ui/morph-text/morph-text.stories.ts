/**
 * The kit's MorphText (Component Story Format 3, live components), mounted
 * as itself: words that morph into the next words as they change. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import MorphText from "./morph-text.svelte";

export default {
  title: "Kit/Morph text",
  component: MorphText,
  args: { text: "Saving" },
};

/** A short label as it stands. */
export const Short = {};

/** A longer label, wrapping where it must. */
export const Wrapping = {
  args: { text: "Waiting for studio-mac to finish its update", wrap: true },
};
