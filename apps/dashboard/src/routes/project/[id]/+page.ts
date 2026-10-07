import { error } from "@sveltejs/kit";
import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
import { type HubFailure, readHub } from "#lib/cawco/hub-read.js";
import type { StagesView, TaskList } from "#lib/cawco/project-tasks.js";
import type { PageLoad } from "./$types";

/** The error page's line for a read the page cannot stand without. */
const refused = (what: string, failure: HubFailure): never =>
  error(
    failure.status,
    `Reading ${what} failed: ${failure.detail} (${failure.status}). Reload the page to try again.`
  );

/**
 * The project's views: the project and its machine, its tasks and stages,
 * read through the hub proxy so the page renders on the server and a shared
 * link opens straight onto its board. The project is the page and a refused
 * read of it is the page's error; the tasks and stages are carried as they
 * ended, so a refusal is said where the board would be, never drawn as an
 * empty board. `?view=` names the view (the board when absent) and
 * `?task=` the task whose sheet is open.
 */
export const load: PageLoad = async ({ fetch, params, url }) => {
  const base = `/api/projects/${encodeURIComponent(params.id)}`;
  const [projects, machines, tasks, stages] = await Promise.all([
    readHub<ProjectRow[]>(fetch, "/api/projects"),
    readHub<Machine[]>(fetch, "/api/agents"),
    readHub<TaskList>(fetch, `${base}/tasks`),
    readHub<StagesView>(fetch, `${base}/stages`),
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
  return {
    project,
    machine,
    tasks,
    stages,
    view: url.searchParams.get("view") ?? "board",
    task: url.searchParams.get("task"),
  };
};
