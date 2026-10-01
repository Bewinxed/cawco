import type { Machine, ProjectRow } from "$lib/cawco/client.svelte";
import type { PageLoad } from "./$types";

/**
 * The project, and the machine it lives on, are read through the hub proxy
 * rather than the app socket, so the page renders on the server and a shared
 * link opens straight into it — with the machine's chip and inventory drawn
 * from the first frame instead of arriving under the rail's other cards.
 */
export const load: PageLoad = async ({ fetch, params }) => {
  const [projectsResponse, machinesResponse] = await Promise.all([
    fetch("/api/projects"),
    fetch("/api/agents"),
  ]);
  const projects: unknown = projectsResponse.ok
    ? await projectsResponse.json()
    : [];
  const machines: unknown = machinesResponse.ok
    ? await machinesResponse.json()
    : [];
  const project = Array.isArray(projects)
    ? ((projects as ProjectRow[]).find((row) => row.id === params.id) ?? null)
    : null;
  const machine =
    project && Array.isArray(machines)
      ? ((machines as Machine[]).find(
          (row) => row.machineId === project.machineId
        ) ?? null)
      : null;
  return { project, machine };
};
