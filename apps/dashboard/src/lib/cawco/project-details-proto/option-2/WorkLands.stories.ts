/**
 * Where code goes, read alone: the four ways, each led by its glyph.
 */

import { shellFrame } from "./shell-seed";
import { REFUSED_WORDS, stageArgs } from "./stage-args";
import WorkLands from "./WorkLands.svelte";

export default {
  ...shellFrame,
  title: "Where code goes",
  component: WorkLands,
  args: stageArgs("At rest"),
};

/** Lantern web's code goes straight to its default branch. */
export const DefaultBranch = {};

/** The server refused my pick and put the old one back. */
export const PickRefused = {
  args: stageArgs("At rest", { landing: REFUSED_WORDS }),
};
