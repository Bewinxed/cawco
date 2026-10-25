/**
 * Suggestions, every look in every state it meets (Component Story Format
 * 3, live components), through its seam (SuggestionsFrame): on the recess
 * Caw's thread stands on, with a club's website's starters. Each look is a
 * group; in each, three (Caw's first thread), one, seven, the longest the
 * hub writes, the skeletons while they are read, the first one reached by
 * the keyboard, the first one held down, the phone's width, and the empty
 * Decisions tab's own. The canvas draws hover, focus and pressed columns
 * of every story besides. The meta's args are every story's; a story's own
 * args are what it changes.
 */
import SuggestionsFrame from "./SuggestionsFrame.svelte";

export default {
  title: "Suggestions/Suggestions",
  component: SuggestionsFrame,
  args: { look: "list", placement: "thread", set: "three" },
};

/** List: Lightfield's and Plane AI's ruled list. Three, in Caw's first thread. */
export const List = { args: { look: "list" } };

/** List: one. */
export const ListOne = { args: { look: "list", set: "one" } };

/** List: seven, more than the hub writes today. */
export const ListMany = { args: { look: "list", set: "many" } };

/** List: the longest the hub writes, one an unbroken name, wrapping inside. */
export const ListLong = { args: { look: "list", set: "long" } };

/** List: while they are read, three skeletons at the look's own size. */
export const ListLoading = { args: { look: "list", loading: 3 } };

/** List: the first reached by the keyboard, the house ring on it. */
export const ListFocus = { args: { look: "list", state: "focus" } };

/** List: the first held down: a wide item tints, a chip scales. */
export const ListPressed = { args: { look: "list", state: "pressed" } };

/** List: at a phone's width. */
export const ListPhone = {
  args: { look: "list", set: "long" },
  parameters: { viewport: 390 },
};

/** List: the empty Decisions tab's one action, an empty panel's placement. */
export const ListPanel = {
  args: { look: "list", placement: "panel", set: "decisions" },
};

/** Rows: Cofounder's raised rows, each sentence over its reason. Three, in Caw's first thread. */
export const Rows = { args: { look: "rows" } };

/** Rows: one. */
export const RowsOne = { args: { look: "rows", set: "one" } };

/** Rows: seven, more than the hub writes today. */
export const RowsMany = { args: { look: "rows", set: "many" } };

/** Rows: the longest the hub writes, one an unbroken name, wrapping inside. */
export const RowsLong = { args: { look: "rows", set: "long" } };

/** Rows: while they are read, three skeletons at the look's own size. */
export const RowsLoading = { args: { look: "rows", loading: 3 } };

/** Rows: the first reached by the keyboard, the house ring on it. */
export const RowsFocus = { args: { look: "rows", state: "focus" } };

/** Rows: the first held down: a wide item tints, a chip scales. */
export const RowsPressed = { args: { look: "rows", state: "pressed" } };

/** Rows: at a phone's width. */
export const RowsPhone = {
  args: { look: "rows", set: "long" },
  parameters: { viewport: 390 },
};

/** Rows: the empty Decisions tab's one action, an empty panel's placement. */
export const RowsPanel = {
  args: { look: "rows", placement: "panel", set: "decisions" },
};

/** Chips: the kit's option chips, as Langdock, AirOps and Relevance AI set them under the field. Three, in Caw's first thread. */
export const Chips = { args: { look: "chips" } };

/** Chips: one. */
export const ChipsOne = { args: { look: "chips", set: "one" } };

/** Chips: seven, more than the hub writes today. */
export const ChipsMany = { args: { look: "chips", set: "many" } };

/** Chips: the longest the hub writes, one an unbroken name, wrapping inside. */
export const ChipsLong = { args: { look: "chips", set: "long" } };

/** Chips: while they are read, three skeletons at the look's own size. */
export const ChipsLoading = { args: { look: "chips", loading: 3 } };

/** Chips: the first reached by the keyboard, the house ring on it. */
export const ChipsFocus = { args: { look: "chips", state: "focus" } };

/** Chips: the first held down: a wide item tints, a chip scales. */
export const ChipsPressed = { args: { look: "chips", state: "pressed" } };

/** Chips: at a phone's width. */
export const ChipsPhone = {
  args: { look: "chips", set: "long" },
  parameters: { viewport: 390 },
};

/** Chips: the empty Decisions tab's one action, an empty panel's placement. */
export const ChipsPanel = {
  args: { look: "chips", placement: "panel", set: "decisions" },
};
