import { error } from "@sveltejs/kit";
import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
import { type HubFailure, type HubRead, readHub } from "#lib/cawco/hub-read.js";
import type { StagesView, TaskList } from "#lib/cawco/project-tasks.js";
import { checkoutOf } from "#lib/cawco/projects.js";
import { type FindSeed, wordsOf } from "#lib/cawco/tasks/task-find.svelte.js";
import type { PageLoad } from "./$types";

/** The error page's line for a read the page cannot stand without. */
const refused = (what: string, failure: HubFailure): never =>
  error(
    failure.status,
    `Reading ${what} failed: ${failure.detail} (${failure.status}). Reload the page to try again.`
  );

/** What the hub found for the URL's words, or why it could not say, for TaskFind. */
function findSeed(
  words: string,
  live: HubRead<TaskList> | null,
  archived: HubRead<TaskList> | null
): FindSeed {
  if (!(words && live && archived)) {
    return { words, found: null, problem: null };
  }
  if (!live.ok) {
    return { words, found: null, problem: `${live.detail} (${live.status}).` };
  }
  if (!archived.ok) {
    return {
      words,
      found: null,
      problem: `${archived.detail} (${archived.status}).`,
    };
  }
  return {
    words,
    found: {
      words,
      ids: new Set(
        [...live.value.tasks, ...archived.value.tasks].map((task) => task.id)
      ),
    },
    problem: null,
  };
}

/**
 * The project's views: the project and its machine, its tasks and stages,
 * read through the hub proxy so the page renders on the server and a shared
 * link opens straight onto its board. The project is the page and a refused
 * read of it is the page's error; the tasks and stages are carried as they
 * ended, so a refusal is said where the board would be, never drawn as an
 * empty board. `?view=` names the view (the board when absent) and
 * `?task=` the task whose sheet is open; on the Decisions tab `?page=`
 * names the decision page open in it and `?mode=graph` its graph.
 */
export const load: PageLoad = async ({ fetch, params, url }) => {
  const base = `/api/projects/${encodeURIComponent(params.id)}`;
  // The filter's words are the hub's to match (task-find.svelte.ts): a link
  // that carries them opens on what the hub found, live and archived.
  const words = wordsOf(url.searchParams.get("q") ?? "");
  const finding = (archived: boolean) =>
    readHub<TaskList>(
      fetch,
      `${base}/tasks?${new URLSearchParams({ q: words, ...(archived ? { archived: "1" } : {}) })}`
    );
  const [projects, machines, tasks, stages, found, foundArchived] =
    await Promise.all([
      readHub<ProjectRow[]>(fetch, "/api/projects"),
      readHub<Machine[]>(fetch, "/api/agents"),
      readHub<TaskList>(fetch, `${base}/tasks`),
      readHub<StagesView>(fetch, `${base}/stages`),
      words ? finding(false) : null,
      words ? finding(true) : null,
    ]);
  if (!projects.ok) {
    return refused("the projects", projects);
  }
  if (!machines.ok) {
    return refused("the machines", machines);
  }
  const project = projects.value.find((row) => row.id === params.id) ?? null;
  const primary = project ? checkoutOf(project) : undefined;
  const machine = primary
    ? (machines.value.find((row) => row.machineId === primary.machineId) ??
      null)
    : null;
  return {
    /** The page hands the shell's bar its view strip (bar-strip.svelte). */
    barStrip: project !== null,
    project,
    machine,
    tasks,
    stages,
    find: findSeed(words, found, foundArchived),
    view: url.searchParams.get("view") ?? "board",
    task: url.searchParams.get("task"),
    decisionPage: url.searchParams.get("page"),
    decisionMode: (url.searchParams.get("mode") === "graph"
      ? "graph"
      : "list") as "graph" | "list",
  };
};
