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

/** Pressed on GitHub Issues: its setup open, the repository picked in the New session form's picker. */
export const SettingUpGitHub = {
  args: { opening: "github" },
};

/** Pressed on Linear: its setup open, a sign-in and a team to pick. */
export const SettingUpLinear = {
  args: { opening: "linear" },
};
