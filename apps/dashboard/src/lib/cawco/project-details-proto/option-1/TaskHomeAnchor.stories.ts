/**
 * Where hyucksfield's tasks are kept (TaskHomeAnchor), on the views strip:
 * its tracker, how many tasks are linked and when they were last in step.
 */

import { partArgs } from "./states-args";
import TaskHomeAnchor from "./TaskHomeAnchor.svelte";

export default {
  title: "Project details/Option 1: Task home",
  component: TaskHomeAnchor,
  args: partArgs(),
};

/** Tied to samleelabs/hyucksfield: 12 tasks linked, in step 4 minutes ago. */
export const InStep = {};

/** GitHub refused the last sync. */
export const SyncRefused = { args: partArgs("GitHub refused the sync") };

/** The tracker is still being read. */
export const Reading = { args: partArgs("Still reading") };

/** Tasks are kept in CawCo's own files. */
export const OwnFiles = { args: partArgs("A project with no code") };
