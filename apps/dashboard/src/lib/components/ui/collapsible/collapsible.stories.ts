/**
 * The kit's Collapsible (Component Story Format 3, live components) in a
 * frame of its own (collapsible-frame): a fold shut and open. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import CollapsibleFrame from "./collapsible-frame.svelte";

export default {
  title: "Kit/Collapsible",
  component: CollapsibleFrame,
  args: {
    summary: "3 changes",
    lines: [
      "Stage moved from In progress to In review",
      "Brief edited by the owner",
      "Checks passed on the branch",
    ],
  },
};

/** Shut, saying what it holds. */
export const Shut = {};

/** Open on its lines. */
export const Open = { args: { open: true } };
