/**
 * The places by hyucksfield's name (PlacesAnchor): how many it has, or the
 * one whose folder is gone; a press opens every place at once.
 */
import PlacesAnchor from "./PlacesAnchor.svelte";
import { partArgs } from "./states-args";

export default {
  title: "Project details/Option 1: Places anchor",
  component: PlacesAnchor,
  args: partArgs(),
};

/** hyucksfield has four places. */
export const Places = {};

/** A folder is missing. */
export const FolderMissing = { args: partArgs("A folder is missing") };

/** A project with only its folder on the hub. */
export const HubOnly = { args: partArgs("A project with no code") };
