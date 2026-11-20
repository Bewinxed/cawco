/**
 * What the Places popover holds (PlacesList): every place of hyucksfield at
 * once, its repository and its large-file storage, in the situations the
 * person meets them.
 */
import PlacesList from "./PlacesList.svelte";
import { partArgs, refused } from "./states-args";

export default {
  title: "Project details/Option 1: Places",
  component: PlacesList,
  args: partArgs(),
  parameters: { viewport: 480 },
};

/** Every place hyucksfield has: three machines, one of them offline, and its folder on the hub. */
export const AllPlaces = {};

/** The folder on studio-mac is gone, so nothing can start there until it is found. */
export const FolderMissing = { args: partArgs("A folder is missing") };

/** A project with no code: only its folder on the hub, no repository, no large files. */
export const NoCode = { args: partArgs("A project with no code") };

/** The hub refused a change to the large-file storage, and said why. */
export const StorageRefused = {
  args: {
    changes: refused(
      "largeFiles",
      "The hub could not save the change: the project's record is being written by another change (busy). Nothing changed; try again."
    ),
  },
};
