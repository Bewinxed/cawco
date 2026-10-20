/**
 * Whether Files marks new files, the alternative: a dot on the folder's
 * upper-trailing corner until Files is opened.
 */
import BarGroup from "./BarGroup.svelte";

export default {
  title: "New files/A dot",
  component: BarGroup,
  args: { form: "desk", files: "dot" },
  parameters: { viewport: 360 },
};

/** Desk: new files landed, the dot on the folder. */
export const NewFiles = { args: { fresh: true } };

/** Desk: Files was opened, the dot cleared. */
export const Seen = { args: { fresh: false } };
