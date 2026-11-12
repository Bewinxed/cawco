/**
 * The board's empty states (DESIGN.md, The Alignment Rule), in the
 * project page's pane inset (ProjectPaneFrame). On an empty board, Caw
 * alone centred over the column, the title, the line and the starters on
 * its left edge; before setup, Caw (or the folder glyph where he can't
 * start), the title, the line and the button centred as one block.
 */
import { inProjectPane } from "#lib/cawco/project/pane-frame.js";
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
  decorators: [inProjectPane],
  parameters: { viewport: 1440 },
};

/** The project isn't set up yet, so Caw offers to set it up. */
export const NotSetUp = { args: { look: "setup" } };

/** An empty board: Caw over four things to start him on. */
export const Starters = { args: { look: "starters" } };

/** Not set up, and Caw can't start it: nothing to press. */
export const NoAction = { args: { look: "none" } };
