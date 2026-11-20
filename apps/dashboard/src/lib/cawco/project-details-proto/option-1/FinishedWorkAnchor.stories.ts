/**
 * Where hyucksfield's finished work goes (FinishedWorkAnchor), at the
 * finish edge of the views strip; a press opens the four ways.
 */
import FinishedWorkAnchor from "./FinishedWorkAnchor.svelte";
import { partArgs } from "./states-args";

export default {
  title: "Project details/Option 1: Finished work",
  component: FinishedWorkAnchor,
  args: partArgs(),
};

/** Finished work lands on a branch with a pull request. */
export const BranchAndPullRequest = {};
