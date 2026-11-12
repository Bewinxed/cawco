/**
 * The empty state on Caw's axis (The Caw Stands On The Axis Rule). Before
 * setup, mark, title, line and a lone action centred as one block; on an
 * empty board, Caw alone centred over the column, the title, the line and
 * the starters on its left edge.
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

/** An empty board: Caw over four things to start him on. */
export const Starters = { args: { look: "starters" } };

/** The project isn't set up and Caw can't start it, so there is nothing to press. */
export const NoAction = { args: { look: "none" } };
