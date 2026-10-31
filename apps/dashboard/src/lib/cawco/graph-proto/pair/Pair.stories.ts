/**
 * The design graph built as a pair (task tsk-18, Option 3): Here and Next
 * stand side by side, the seam between them is the move, and Done is the
 * one verdict. Under review is the task column's own states file on the
 * project's 60 tasks; every move is the column's own motion. One story per
 * width the owner judges at, and the two postures the structure opens on.
 */
import Pair from "./Pair.svelte";

export default {
  title: "Design graph structures/The pair",
  component: Pair,
  args: { height: 900 },
  parameters: { viewport: 1440 },
};

/** At a desk, 1440 wide: Here and Next both live, the move between them on the seam. */
export const Desk = {};

/** On a phone, 390 wide: Here fills the width and Next is its edge; hold the edge to see Next over Here. */
export const Phone = { args: { height: 844 }, parameters: { viewport: 390 } };

/** The owner's 2529-wide window, Several kept: the pair at its own widths, Differences on. */
export const Wide = {
  args: { height: 1100, kept: "Several", differences: true },
  parameters: { viewport: 2529 },
};

/** The whole set open at the foot, as when the agent gave no sequence: a press stands a state in Next. */
export const WholeSet = { args: { set: true, kept: "Picked" } };
