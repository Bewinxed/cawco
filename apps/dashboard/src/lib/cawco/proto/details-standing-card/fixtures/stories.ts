/**
 * What every Standing card states file shares: the fixture's args at rest
 * (Atlas site on two machines and the hub, tied to GitHub Issues, three
 * accounts, the card open on its details), the stores written for the rail
 * and the head, and the two other forms a screen is drawn in.
 */
import {
  ACCOUNTS,
  ATLAS,
  CONNECTIONS,
  FIND_SAME,
  FIND_TYPED,
  FOLDERS_IN_PLACE,
  MACHINES,
  MOVE_PLAN,
  MOVE_TO_NIXBOX,
  RESULT_PROVEN,
  RUN_COPYING,
  STAGES,
  TASKS,
  TIE_GITHUB,
  TIED_GITHUB,
} from "./records";

export const AT_REST = {
  frame: "desk",
  project: ATLAS,
  machines: MACHINES,
  folders: FOLDERS_IN_PLACE,
  tracker: TIED_GITHUB,
  accounts: ACCOUNTS,
  connections: CONNECTIONS,
  stages: STAGES,
  tasks: TASKS,
  open: true,
  face: "details",
  placeId: "place-obelisk",
  to: MOVE_TO_NIXBOX,
  plan: MOVE_PLAN,
  run: RUN_COPYING,
  result: RESULT_PROVEN,
  typed: FIND_TYPED,
  find: FIND_SAME,
  tie: TIE_GITHUB,
};

/**
 * Each story's `beforeEach`: the fleet's machines and the project, written
 * through the stores' own writers (imported here, in the story's own
 * runner), so the rail and the head read them as the app does.
 */
export async function seedStores(): Promise<void> {
  const board = await import("#lib/cawco/stores/board.svelte.js");
  const projects = await import("#lib/cawco/stores/projects.svelte.js");
  board.holdMachines(MACHINES);
  board.boardState.fleetRead = true;
  projects.keepProjects([ATLAS], projects.projectsLeave());
}

/** A smaller desk, 1024 by 768. */
export const SMALLER_DESK = {
  args: { frame: "short" },
  parameters: { viewport: 1024 },
};

/** A phone, 390 wide: the bottom sheet. */
export const PHONE = {
  args: { frame: "phone" },
  parameters: { viewport: 390 },
};

/** What a flow's `play` is handed: the live instance's `update`, which changes its args in place. */
export interface StoryPlay {
  update: (next: Record<string, unknown>) => Promise<void>;
}
