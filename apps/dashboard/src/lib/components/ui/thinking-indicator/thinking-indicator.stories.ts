/**
 * The kit's ThinkingIndicator (Component Story Format 3, live components),
 * mounted as itself: with its glyph and without. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import ThinkingIndicator from "./thinking-indicator.svelte";

export default {
  title: "Kit/Thinking indicator",
  component: ThinkingIndicator,
  args: {},
};

/** The agent is thinking. */
export const Thinking = {};

/** Thinking, its words alone in a line of text. */
export const Inline = { args: { showIcon: false, fit: "inline" } };
