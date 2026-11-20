/**
 * Option 3, "Passport and rules sheet", live: Hyucksfield's page in the
 * app's shell, its board live, the Passport hung from Details in the
 * project's bar. The rail's projects and the fleet's machines are written
 * into their stores before each story.
 */
import { MACHINES, PROJECTS } from "./board-fixture";
import PassportLive from "./passport-live.svelte";

export default {
  title: "Option 3/Passport",
  component: PassportLive,
  args: { situation: "All in order", opened: true },
  parameters: { viewport: 1440 },
  beforeEach: async () => {
    const { projectsState } =
      await import("#lib/cawco/stores/projects.svelte.js");
    const { boardState } = await import("#lib/cawco/stores/board.svelte.js");
    projectsState.projects = PROJECTS;
    projectsState.projectsRead = true;
    boardState.machines = MACHINES;
    boardState.fleetRead = true;
  },
};

/** I open Details beside the board to check how Hyucksfield is set to run. */
export const CheckHowItRuns = {};

/** The board as I left it, the Passport put away and Details in the bar. */
export const PassportAway = { args: { opened: false } };

/** A folder is missing, so Details carries the count of what is in trouble. */
export const FolderMissing = {
  args: { opened: false, situation: "A folder is missing" },
};
