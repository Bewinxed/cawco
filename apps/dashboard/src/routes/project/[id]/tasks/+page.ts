import { error } from "@sveltejs/kit";
import type { ProjectRow } from "#lib/cawco/client.svelte.js";
import { readHub } from "#lib/cawco/hub-read.js";
import type { StagesView, TaskList } from "#lib/cawco/project-tasks.js";
import type { PageLoad } from "./$types";

/**
 * A project's tasks, read through the hub proxy like the project page, so a
 * shared link renders on the server with its board drawn. The project is the
 * page and a refused read of it is the page's error; the tasks and the
 * stages are carried as they ended, so a refusal is said where the board
 * would be, never drawn as an empty board.
 */
export const load: PageLoad = async ({ fetch, params, url }) => {
  const base = `/api/projects/${encodeURIComponent(params.id)}`;
  const [projects, tasks, stages] = await Promise.all([
    readHub<ProjectRow[]>(fetch, "/api/projects"),
    readHub<TaskList>(fetch, `${base}/tasks`),
    readHub<StagesView>(fetch, `${base}/stages`),
  ]);
  if (!projects.ok) {
    return error(
      projects.status,
      `Reading the projects failed: ${projects.detail} (${projects.status}). Reload the page to try again.`
    );
  }
  const project = projects.value.find((row) => row.id === params.id) ?? null;
  return {
    project,
    tasks,
    stages,
    view: url.searchParams.get("view") === "table" ? "table" : "board",
    task: url.searchParams.get("task"),
  } as const;
};
