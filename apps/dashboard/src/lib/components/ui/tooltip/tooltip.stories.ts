/**
 * The kit's Tooltip (Component Story Format 3, live components) in a frame
 * of its own (tooltip-frame): open over the control it names, with the keys
 * that do the same and without. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import TooltipFrame from "./tooltip-frame.svelte";

export default {
  title: "Kit/Tooltip",
  component: TooltipFrame,
  args: { label: "New session", keys: "⇧⌘N", room: 48 },
};

/** Naming a control, with its keys. */
export const WithKeys = {};

/** A longer name, no keys. */
export const Words = {
  args: { label: "Move this session to another machine", keys: undefined },
};
