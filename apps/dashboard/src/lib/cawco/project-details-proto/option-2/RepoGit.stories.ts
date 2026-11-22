/**
 * Repository & Git, read alone: the linked repository, Git LFS's row and where code goes.
 */

import RepoGit from "./RepoGit.svelte";
import { shellFrame } from "./shell-seed";
import { stageArgs } from "./stage-args";

export default {
  ...shellFrame,
  title: "Repository & Git",
  component: RepoGit,
  args: stageArgs("At rest"),
};

/** One repository on GitHub, Git LFS on its host, code to the default branch. */
export const AtRest = {};

/** Large files on a server of my own: its address and the key it signs in with. */
export const CustomLargeFileServer = {
  args: { ...stageArgs("At rest"), opening: "largeFiles" },
};
