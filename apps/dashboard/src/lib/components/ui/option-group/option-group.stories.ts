/**
 * The kit's OptionGroup (Component Story Format 3, live components) in a
 * frame of its own (option-group-frame): options keyed by digit, none
 * picked and one picked. The meta's args are every story's; a story's own
 * args are what it changes.
 */
import OptionGroupFrame from "./option-group-frame.svelte";

export default {
  title: "Kit/Option group",
  component: OptionGroupFrame,
  args: {
    label: "Where should the design system live?",
    options: [
      "Beside the dashboard, in its tokens folder",
      "In a package of its own",
      "In the design folder at the repository's root",
    ],
  },
};

/** Waiting for an answer. */
export const Unanswered = {};

/** An answer picked. */
export const Picked = {
  args: { value: "In a package of its own" },
};
