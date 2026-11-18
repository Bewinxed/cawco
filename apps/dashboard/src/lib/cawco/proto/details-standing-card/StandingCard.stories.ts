/**
 * A project's details as a card hung from the head's place mark (Option 1,
 * Standing card, of the details' structure; Component Story Format 3, live
 * components): over the project's page as the app draws it, the rail and
 * the board live around it. A press on the place mark puts it away and
 * brings it back; a pick in it changes once the stand-in hub has answered.
 *
 * Each story's `beforeEach` writes the fleet's machines and the project
 * through the stores' own writers, so the rail and the head read them as the
 * app does.
 */

import {
  ACCOUNTS,
  ATLAS,
  DECIDES_OWN,
  FOLDERS_IN_PLACE,
  MACHINES,
  STAGES,
  TASKS,
  TIED_GITHUB,
} from "./fixtures/records";
import StandingCardInShell from "./standing-card-in-shell.svelte";

export default {
  title: "Project details/Standing card",
  component: StandingCardInShell,
  args: {
    project: ATLAS,
    machines: MACHINES,
    folders: FOLDERS_IN_PLACE,
    decides: DECIDES_OWN,
    tracker: TIED_GITHUB,
    accounts: ACCOUNTS,
    stages: STAGES,
    tasks: TASKS,
    open: true,
  },
  parameters: { viewport: 1440 },
};

/** Checking how Atlas site is set to run: where it lives, who decides, where its tasks and finished work go, and the account it runs on. */
export const HowItRuns = {
  async beforeEach() {
    const board = await import("#lib/cawco/stores/board.svelte.js");
    const projects = await import("#lib/cawco/stores/projects.svelte.js");
    board.holdMachines(MACHINES);
    board.boardState.fleetRead = true;
    projects.keepProjects([ATLAS], projects.projectsLeave());
  },
};
