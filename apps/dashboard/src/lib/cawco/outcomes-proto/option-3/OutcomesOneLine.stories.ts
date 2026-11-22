/**
 * Outcomes, option 3, "one line each" (Component Story Format 3, live
 * components): the project page's head and view strip as they ship, and
 * the Outcomes view in the pane, fed the project "cockpit" on a Sunday
 * afternoon. Each outcome is his sentence and one sentence of where it
 * stands; the one a run's question waits on comes first, with the
 * question and its two answers in it. Every outcome opens from its open
 * control to its lines.
 */
import { hubAs } from "#lib/cawco/hub-stand-in.js";
import { COCKPIT_ARGS } from "./outcomes.args";
import OutcomesLive from "./outcomes-live.svelte";

export default {
  title: "Outcomes/One line each",
  component: OutcomesLive,
  args: COCKPIT_ARGS,
  decorators: [hubAs("connected")],
};

/** He opens Outcomes and the staging check's question waits first, with its two answers. */
export const Arrival = {};
