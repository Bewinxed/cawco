/**
 * Where tasks live, read alone: the three homes with their marks.
 */

import { shellFrame } from "./shell-seed";
import { stageArgs } from "./stage-args";
import TasksEnter from "./TasksEnter.svelte";

export default {
  ...shellFrame,
  title: "Where tasks live",
  component: TasksEnter,
  args: { ...stageArgs("At rest"), syncing: false, onsync: () => undefined },
};

/** Tasks live in the project's own files. */
export const LocalFiles = {};

/** Synced with GitHub Issues, matched four minutes ago. */
export const SyncedWithGitHub = {
  args: {
    ...stageArgs("Tied to GitHub, in step"),
    syncing: false,
    onsync: () => undefined,
  },
};
