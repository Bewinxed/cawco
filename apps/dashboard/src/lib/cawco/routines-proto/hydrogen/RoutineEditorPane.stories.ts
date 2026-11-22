/**
 * Adding or changing a routine by hand (Component Story Format 3, live
 * components): its name, what each run does, when it may run, and when.
 */
import RoutineEditorPane from "./RoutineEditorPane.svelte";
import { INITIAL_ROUTINES } from "./routines-data";

const ignore = (): void => {
  // The form's presses are the screen's; here it stands alone.
};

export default {
  args: { editing: null, onclose: ignore, onsubmit: ignore },
  component: RoutineEditorPane,
  parameters: { viewport: 600 },
  title: "Project/Routines/Editor",
};

/** A new routine, blank. */
export const New = {};

/** Changing the morning triage. */
export const Editing = {
  args: {
    editing: INITIAL_ROUTINES.find((one) => one.id === "rtn-morning-triage"),
    onback: ignore,
  },
};

/** CawCo's own routine: only when it runs can change. */
export const BuiltIn = {
  args: {
    editing: INITIAL_ROUTINES.find((one) => one.id === "rtn-nightly-memory"),
    onback: ignore,
  },
};
