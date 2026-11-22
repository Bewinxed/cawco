/**
 * The kit's Command (Component Story Format 3, live components) in a frame
 * of its own (command-frame): rows in groups under a search, and nothing
 * matching. The meta's args are every story's; a story's own args are what
 * it changes.
 */
import CommandFrame from "./command-frame.svelte";

export default {
  title: "Kit/Command",
  component: CommandFrame,
  args: {
    search: "",
    groups: [
      {
        heading: "Sessions",
        rows: ["Fix tray chip overflow", "Move the session list onto tabs"],
      },
      { heading: "Machines", rows: ["obelisk-of-light", "studio-mac"] },
    ],
  },
};

/** Rows in their groups. */
export const Grouped = {};

/** Nothing matches the search. */
export const NoMatch = { args: { search: "kubernetes", groups: [] } };
