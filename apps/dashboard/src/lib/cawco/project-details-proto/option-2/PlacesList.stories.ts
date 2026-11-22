/**
 * Run environments, read alone: the project's folders as their card lists them.
 */

import PlacesList from "./PlacesList.svelte";
import { shellFrame } from "./shell-seed";
import { stageArgs } from "./stage-args";

export default {
  ...shellFrame,
  title: "Run environments",
  component: PlacesList,
  args: stageArgs("At rest"),
};

/** Three folders: atlas where sessions start, kestrel, and the hub's own copy. */
export const AtRest = {};

/** A folder on kestrel is gone and its machine is offline. */
export const FolderNotFound = { args: stageArgs("Two stages in trouble") };

/** Adding a folder: the machine to pick and the path to type, under the folders. */
export const AddingAFolder = {
  args: { ...stageArgs("At rest"), opening: "folder" },
};

/** I chose Stop using on kestrel's folder: it says what goes and what stays first. */
export const StoppingAFolder = {
  args: { ...stageArgs("At rest"), opening: "drop:p-kestrel" },
};
