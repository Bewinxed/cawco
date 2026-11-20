/**
 * hyucksfield's bar (ProjectBar): its name with its places, Caw's seat with
 * his switch and the account, and the bar's acts.
 */
import ProjectBar from "./ProjectBar.svelte";
import { partArgs, refused, waitingOn } from "./states-args";

const nothing = () => undefined;

export default {
  title: "Project details/Option 1: Project bar",
  component: ProjectBar,
  args: { ...partArgs(), onask: nothing, onspinoff: nothing, onmore: nothing },
  parameters: { viewport: 1440 },
};

/** hyucksfield with Caw on, on Studio Max. */
export const CawOn = {};

/** Caw was turned off and the hub has not answered yet. */
export const TurningOff = { args: { changes: waitingOn("caw") } };

/** The hub refused the new name and kept hyucksfield. */
export const RenameRefused = {
  args: {
    changes: refused(
      "name",
      "The hub could not save the change: the project's record is being written by another change (busy). Nothing changed; try again."
    ),
  },
};

/** Its folder is missing and its account signed out. */
export const InTrouble = {
  args: {
    record: {
      ...partArgs("A folder is missing").record,
      accounts: partArgs("Its account is signed out").record.accounts,
    },
  },
};
