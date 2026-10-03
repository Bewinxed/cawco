import { error } from "@sveltejs/kit";
import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
import { type HubFailure, readHub } from "#lib/cawco/hub-read.js";
import type { PageLoad } from "./$types";

/** The error page's line for a read the page cannot stand without. */
const refused = (what: string, failure: HubFailure): never =>
  error(
    failure.status,
    `Reading ${what} failed: ${failure.detail} (${failure.status}). Reload the page to try again.`
  );

/**
 * The project, and the machine it lives on, are read through the hub proxy
 * rather than the app socket, so the page renders on the server and a shared
 * link opens straight into it — with the machine's chip and inventory drawn
 * from the first frame instead of arriving under the rail's other cards.
 *
 * The page is the project: a read the hub refused is the page's error, with
 * the hub's own words, never "No such project" or a machine that seems away.
 */
export const load: PageLoad = async ({ fetch, params }) => {
  const [projects, machines] = await Promise.all([
    readHub<ProjectRow[]>(fetch, "/api/projects"),
    readHub<Machine[]>(fetch, "/api/agents"),
  ]);
  if (!projects.ok) {
    return refused("the projects", projects);
  }
  if (!machines.ok) {
    return refused("the machines", machines);
  }
  const project = projects.value.find((row) => row.id === params.id) ?? null;
  const machine = project
    ? (machines.value.find((row) => row.machineId === project.machineId) ??
      null)
    : null;
  return { project, machine };
};
