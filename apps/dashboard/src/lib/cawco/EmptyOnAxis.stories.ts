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
  // The board it stands in, at a desk's width; the canvas's widths draw it on a phone.
  parameters: { viewport: 1440 },
};

/** The project isn't set up yet, so Caw offers to set it up. */
export const NotSetUp = { args: { look: "setup" } };

/** An empty board, with four things to start Caw on. */
export const Starters = { args: { look: "starters" } };

/** The project isn't set up and Caw can't start it, so there is nothing to press. */
export const NoAction = { args: { look: "none" } };
