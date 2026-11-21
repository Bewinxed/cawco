/**
 * Where agents run, read alone: the folders, Git LFS and the account.
 */

import SessionsStart from "./SessionsStart.svelte";
import { shellFrame } from "./shell-seed";
import { stageArgs } from "./stage-args";

export default {
  ...shellFrame,
  title: "Where agents run",
  component: SessionsStart,
  args: stageArgs("At rest"),
};

/** Three folders, the account named, Git LFS on each repo's host. */
export const AtRest = {};

/** A folder on kestrel is gone and its machine is offline. */
export const FolderNotFound = { args: stageArgs("Two stages in trouble") };

/** The named account is signed out everywhere. */
export const AccountSignedOut = { args: stageArgs("Named account signed out") };

/** A writing project: no Git LFS. */
export const NoCode = { args: stageArgs("A project with no code") };
