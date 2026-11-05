/**
 * The empty state on Caw's axis (The Caw Stands On The Axis Rule): mark,
 * title, line and action centred as one block. A lone action stands under
 * the line; a column of starters fills the block.
 */
import EmptyOnAxis from "./EmptyOnAxis.svelte";

const starters = [
  { glyph: "stages", text: "Set up the stages this project moves through" },
  { glyph: "tasks", text: "Turn the open issues into tasks" },
  { glyph: "routine", text: "Check the build every morning" },
  { glyph: "search", text: "Find what changed since last week" },
] as const;

export default {
  title: "Empty/On the axis",
  component: EmptyOnAxis,
  args: { look: "setup", starters: [...starters] },
};

/** Not set up yet, its one action "Set it up with Caw" centred under the line. */
export const NotSetUp = {
  args: { look: "setup" },
  parameters: { viewport: 1440 },
};

/** Not set up yet on a phone, the button still under the line. */
export const NotSetUpPhone = {
  args: { look: "setup" },
  parameters: { viewport: "phone" },
};

/** An empty board's starters, a column as wide as the block. */
export const Starters = {
  args: { look: "starters" },
  parameters: { viewport: 1440 },
};

/** An empty board's starters on a phone, one column, full width. */
export const StartersPhone = {
  args: { look: "starters" },
  parameters: { viewport: "phone" },
};

/** Not set up and Caw can't start it: the folder, the title and the line, no action. */
export const NoAction = {
  args: { look: "none" },
  parameters: { viewport: 1440 },
};

/** No action, on a phone. */
export const NoActionPhone = {
  args: { look: "none" },
  parameters: { viewport: "phone" },
};
