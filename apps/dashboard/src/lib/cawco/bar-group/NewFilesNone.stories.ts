/**
 * Whether Files marks new files, the recommended answer: no mark. Files is
 * FilesItem itself, with no count.
 */
import BarGroup from "./BarGroup.svelte";

export default {
  title: "New files/No mark",
  component: BarGroup,
  args: { form: "desk", files: "none" },
  parameters: { viewport: 360 },
};

/** Desk: new files landed; the folder looks as it always does. */
export const NewFiles = { args: { fresh: true } };
