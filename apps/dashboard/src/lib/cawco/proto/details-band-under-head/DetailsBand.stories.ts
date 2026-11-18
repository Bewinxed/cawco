/**
 * A project's details as a band under its head (Option 2, Component Story
 * Format 3, live components): the project page as it ships, the rail, the
 * head, the band and the board under it, drawn by details-band-page.svelte
 * from the records in band-records.ts. The stores the rail and the head
 * read are written in each story's `beforeEach`.
 */
import {
  ACCOUNTS,
  DECIDES,
  MACHINES,
  MOVE,
  OTHER_PROJECTS,
  PROJECT,
  STAGES,
  STANDINGS,
  TASKS,
  TRACKER,
} from "./band-records";
import DetailsBandPage from "./details-band-page.svelte";

export default {
  title: "Project details/Band under the head",
  component: DetailsBandPage,
  args: {
    open: true,
    project: PROJECT,
    machines: MACHINES,
    accounts: ACCOUNTS,
    tracker: TRACKER,
    decides: DECIDES,
    standings: STANDINGS,
    move: MOVE,
    stages: STAGES,
    tasks: TASKS,
  },
  parameters: { viewport: 1440 },
};

/** The rail's and the head's stores, written as the hub would fill them. */
async function fleet() {
  const projects = await import("#lib/cawco/stores/projects.svelte.js");
  projects.projectsState.projects = [PROJECT, ...OTHER_PROJECTS];
  projects.projectsState.projectsRead = true;
  const board = await import("#lib/cawco/stores/board.svelte.js");
  board.holdMachines(MACHINES);
  board.boardState.fleetRead = true;
  const accounts = await import("#lib/cawco/stores/accounts.svelte.js");
  accounts.accountsState.accounts = ACCOUNTS;
}

/** Checking how Atlas site is set to run: where it lives, who decides, where its tasks and finished work go, and which account runs it. */
export const CheckHowItRuns = { beforeEach: fleet };
