import { hubRequest } from "@cawco/core/hub-request";
import type { ProjectRow } from "#lib/cawco/client.svelte.js";
import type { StagesView, TaskList } from "#lib/cawco/project-tasks.js";
import { checkoutOf } from "#lib/cawco/projects.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";
import { type FindSeed, wordsOf } from "#lib/cawco/tasks/task-find.svelte.js";
import {
  failureSentence,
  type HubFailure,
  type HubRead,
  readHub,
} from "#lib/platform/hub-read.js";

/**
 * What a project's tab is painted from on a cold load: the project and its
 * machine, its tasks and stages, read through the hub proxy by the project
 * route's server load, so a reload or a shared link paints the board in the
 * server's HTML. A tab opened in the browser reads its tasks and stages
 * itself and takes the project and the machines from the live store
 * (ProjectPage `refresh`). A refused read of the projects or the machines
 * is the page's error; the tasks and stages are carried as they ended, so
 * a refusal is said where the board would be, never drawn as an empty
 * board.
 */
export interface ProjectPageData {
  find: FindSeed;
  machine: Machine | null;
  /** A machine is online as the page opens: whether Caw can start, until the dashboard's own machines are in (CawLead `canTalk`). */
  machinesOnline: boolean;
  project: ProjectRow | null;
  stages: HubRead<StagesView>;
  tasks: HubRead<TaskList>;
}

/** Why a project's tab cannot stand: the projects or the machines were not read. */
export interface ProjectPageRefusal {
  failure: HubFailure;
  what: "the projects" | "the machines";
}

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
    return { words, found: null, problem: failureSentence(live) };
  }
  if (!archived.ok) {
    return { words, found: null, problem: failureSentence(archived) };
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

/** Reads a project's tab whole for the server's paint, or says which read it cannot stand without. */
export async function readProjectPage(
  fetch: typeof globalThis.fetch,
  projectId: string,
  search: URLSearchParams
): Promise<ProjectPageData | ProjectPageRefusal> {
  const path = { id: projectId };
  // The filter's words are the hub's to match (task-find.svelte.ts): a link
  // that carries them opens on what the hub found, live and archived.
  const words = wordsOf(search.get("q") ?? "");
  const finding = (archived: boolean) =>
    readHub<TaskList>(
      fetch,
      hubRequest("GET /api/projects/:id/tasks", {
        path,
        query: { q: words, ...(archived ? { archived: "1" } : {}) },
      })
    );
  const [projects, machines, tasks, stages, found, foundArchived] =
    await Promise.all([
      readHub<ProjectRow[]>(fetch, hubRequest("GET /api/projects")),
      readHub<Machine[]>(fetch, hubRequest("GET /api/agents")),
      readHub<TaskList>(
        fetch,
        hubRequest("GET /api/projects/:id/tasks", { path })
      ),
      readHub<StagesView>(
        fetch,
        hubRequest("GET /api/projects/:id/stages", { path })
      ),
      words ? finding(false) : null,
      words ? finding(true) : null,
    ]);
  if (!projects.ok) {
    return { what: "the projects", failure: projects };
  }
  if (!machines.ok) {
    return { what: "the machines", failure: machines };
  }
  const project = projects.value.find((row) => row.id === projectId) ?? null;
  const primary = project ? checkoutOf(project) : undefined;
  const machine = primary
    ? (machines.value.find((row) => row.machineId === primary.machineId) ??
      null)
    : null;
  return {
    project,
    machine,
    machinesOnline: machines.value.some((row) => row.status === "online"),
    tasks,
    stages,
    find: findSeed(words, found, foundArchived),
  };
}

/** Whether a read stood, or said what refused it. */
export const isRefusal = (
  read: ProjectPageData | ProjectPageRefusal
): read is ProjectPageRefusal => "what" in read;

/** The sentence a refusal is said in, where the tab would stand. */
export const refusalSentence = ({ what, failure }: ProjectPageRefusal) =>
  `Reading ${what} failed. ${failureSentence(failure)}`;
