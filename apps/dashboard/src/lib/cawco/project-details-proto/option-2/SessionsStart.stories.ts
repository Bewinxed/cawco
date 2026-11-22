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

/** Adding a folder: the machine to pick and the path to type, under the folders. */
export const AddingAFolder = {
  args: { ...stageArgs("At rest"), opening: "folder" },
};

/** Large files on a server of my own: its address and the key it signs in with. */
export const CustomLargeFileServer = {
  args: { ...stageArgs("At rest"), opening: "largeFiles" },
};

/** I chose Stop using on kestrel's folder: it says what goes and what stays first. */
export const StoppingAFolder = {
  args: { ...stageArgs("At rest"), opening: "drop:p-kestrel" },
};
