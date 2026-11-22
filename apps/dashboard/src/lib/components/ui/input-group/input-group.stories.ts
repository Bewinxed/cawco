/**
 * The kit's InputGroup (Component Story Format 3, live components) in a
 * frame of its own (input-group-frame): a field between a glyph and a
 * control, empty, filled and disabled. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import InputGroupFrame from "./input-group-frame.svelte";

export default {
  title: "Kit/Input group",
  component: InputGroupFrame,
  args: { label: "Find a session", placeholder: "Find a session or a task" },
};

/** Waiting for a search. */
export const Empty = {};

/** A search typed in. */
export const Filled = { args: { value: "pairing flow" } };

/** Can't search while the hub reconnects. */
export const Disabled = { args: { disabled: true } };
