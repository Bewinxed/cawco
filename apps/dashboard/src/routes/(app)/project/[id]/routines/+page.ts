import { error } from "@sveltejs/kit";
import type { ProjectRow } from "#lib/cawco/client.svelte.js";
import { readHub } from "#lib/cawco/hub-read.js";
import type { StagesView } from "#lib/cawco/project-tasks.js";
import type { PageLoad } from "./$types";

/**
 * PREVIEW (S1 b): the project's routines on a page of their own, reached
 * from the project head's Routines button. The project names the page; its
 * stages name the template the empty page's starters are written for.
 */
export const load: PageLoad = async ({ fetch, params }) => {
  const [projects, stages] = await Promise.all([
    readHub<ProjectRow[]>(fetch, "/api/projects"),
    readHub<StagesView>(
      fetch,
      `/api/projects/${encodeURIComponent(params.id)}/stages`
    ),
  ]);
  if (!projects.ok) {
    error(
      projects.status,
      `Reading the projects failed: ${projects.detail} (${projects.status}). Reload the page to try again.`
    );
  }
  return {
    project: projects.value.find((row) => row.id === params.id) ?? null,
    // A template standing in for a missing stages.md is not the project's.
    template:
      stages.ok && stages.value.source === "file"
        ? stages.value.template
        : null,
  };
};
