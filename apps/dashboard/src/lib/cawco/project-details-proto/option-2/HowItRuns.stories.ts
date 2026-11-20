/**
 * Option 2, the work path: the project page with its "How it runs" view
 * open, inside the app's shell as it ships (its rail, the project's bar
 * and its views strip), fed one project's record (records.ts). The live
 * story is the person's: they read how the project runs and press what
 * they would press, answered by the fixture's mock hub.
 */

import HowItRunsLive from "./how-it-runs-live.svelte";
import { SITUATIONS, type Situation } from "./records";
import { seedShell } from "./shell-seed";

export default {
  title: "How it runs",
  component: HowItRunsLive,
  args: { situation: "At rest" },
  parameters: { viewport: "desk" },
  beforeEach: ({ args }: { args: { situation: Situation } }) => {
    seedShell(SITUATIONS[args.situation]);
  },
};

/** Checking how Lantern web runs before handing it the week's work. */
export const CheckHowItRuns = {};
