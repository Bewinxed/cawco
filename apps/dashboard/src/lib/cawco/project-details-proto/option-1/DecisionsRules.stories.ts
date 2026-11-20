/**
 * Who decides and Review before done, at the top of the Decisions view
 * (DecisionsRules): who settles each kind of choice, and whether finished
 * work waits for the person.
 */
import DecisionsRules from "./DecisionsRules.svelte";
import { partArgs, refused, waitingOn } from "./states-args";

export default {
  title: "Project details/Option 1: Decisions rules",
  component: DecisionsRules,
  args: partArgs(),
  parameters: { viewport: 1440 },
};

/** Scope goes to Caw; every other kind follows the fleet; only I move a task to done. */
export const ProjectRule = {};

/** The rule file does not read, so every choice comes to me until it is fixed. */
export const Unreadable = { args: partArgs("Its rule file does not read") };

/** Look and words was handed to Caw, and the hub has not answered yet. */
export const Handing = { args: { changes: waitingOn("decides.look") } };

/** The hub refused turning review off, and said why. */
export const ReviewRefused = {
  args: {
    changes: refused(
      "review",
      "The hub could not save the change: the project's record is being written by another change (busy). Nothing changed; try again."
    ),
  },
};
