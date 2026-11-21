/**
 * Option 1 of the Routines view, live: project Harbor on Saturday 21 Nov
 * at 13:40 in the app's shell, every routine in one list. A routine's Open
 * stands it beside the list with its latest run whole; an earlier run's
 * Open shows its whole result in place; the session buttons go to the
 * session that did a run.
 */
import { hubAs } from "../../hub-stand-in";
import { standHarbor } from "./harbor-stand";
import Live from "./routines-live.svelte";

export default {
  title: "Routines/Option 1",
  component: Live,
  args: { opened: null, run: null, stale: false },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
  beforeEach: standHarbor,
};

/** Harbor's routines on a Saturday afternoon: two need me, one is running, and nothing is open beside them. */
export const Harbor = {};
