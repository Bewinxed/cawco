/**
 * The rail's projects and the fleet's machines, written into their stores
 * before a story draws the shell (a store module is imported inside the
 * story's beforeEach, so each story runs with a store of its own).
 */
import { MACHINES, PROJECTS } from "./board-fixture";

export async function seedShell(): Promise<void> {
  const { projectsState } =
    await import("#lib/cawco/stores/projects.svelte.js");
  const { boardState } = await import("#lib/cawco/stores/board.svelte.js");
  projectsState.projects = PROJECTS;
  projectsState.projectsRead = true;
  boardState.machines = MACHINES;
  boardState.fleetRead = true;
}
