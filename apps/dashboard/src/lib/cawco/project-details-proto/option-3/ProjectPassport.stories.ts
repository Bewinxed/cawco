/**
 * Option 3, "Passport and rules sheet", live: Hyucksfield's page in the
 * app's shell, its board live, the Passport hung from Details in the
 * project's bar. The rail's projects and the fleet's machines are written
 * into their stores before each story.
 */
import { seedShell } from "./board-fixture-seed";
import PassportLive from "./passport-live.svelte";

export default {
  title: "Option 3/Passport",
  component: PassportLive,
  args: { situation: "All in order", opened: true },
  parameters: { viewport: 1440 },
  beforeEach: seedShell,
};

/** I open Details beside the board to check how Hyucksfield is set to run. */
export const CheckHowItRuns = {};
