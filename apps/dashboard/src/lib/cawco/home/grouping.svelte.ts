/**
 * How the sidebar's two lists are grouped, kept per browser (and copied to
 * the server, which draws the first paint by them: kept.svelte.ts) the way
 * folder-prefs keeps a shut folder: Recent's up to three levels (Day,
 * Project, Area, Machine; Day then Project until the reader picks) and
 * Projects' up to two (Area, Machine; Area first). The rail and the phone's
 * home read the one answer. Which group parents are folded is kept here
 * too, by their path: Older starts folded, every other group open.
 */
import { z } from "zod";
import { parseJson, stored, writeJson } from "../../platform/storage";
import { drawnFrom } from "../kept.svelte";

/** What one level of Recent groups its sessions by. */
export type GroupBy = "day" | "project" | "area" | "machine";
/** What one level of Projects groups its projects by. */
export type ProjectGroupBy = "area" | "machine";

/** A list's levels in order, a cleared one `null`. */
export type Levels<T extends string> = (T | null)[];

export const RECENT_OPTIONS: readonly GroupBy[] = [
  "day",
  "project",
  "area",
  "machine",
];
export const PROJECT_OPTIONS: readonly ProjectGroupBy[] = ["area", "machine"];

const RECENT_KEY = "cawco-recent-groups";
const PROJECTS_KEY = "cawco-project-groups";
const FOLDS_KEY = "cawco-recent-folds";

/** The levels as `raw` holds them, each one an option or cleared, `count` of them. */
function levelsOf<T extends string>(
  raw: string | null,
  options: readonly T[],
  fallback: Levels<T>
): Levels<T> {
  const kept = parseJson(raw, z.array(z.string().nullable()), fallback);
  if (kept.length !== fallback.length) {
    return fallback;
  }
  return kept.map((by) =>
    by !== null && (options as readonly string[]).includes(by)
      ? (by as T)
      : null
  );
}

const recentOf = (raw: string | null) =>
  levelsOf<GroupBy>(raw, RECENT_OPTIONS, ["day", "project", null]);
const projectsOf = (raw: string | null) =>
  levelsOf<ProjectGroupBy>(raw, PROJECT_OPTIONS, ["area", null]);
const foldsOf = (raw: string | null): Record<string, boolean> =>
  parseJson(raw, z.record(z.string(), z.boolean()), {});

const state = $state({
  recent: recentOf(stored("local", RECENT_KEY)),
  projects: projectsOf(stored("local", PROJECTS_KEY)),
  /** Each group parent's path, against its default: Older's folded, the rest open. */
  folds: foldsOf(stored("local", FOLDS_KEY)),
});

/**
 * The levels in force, in order: a cleared level skipped, and one that
 * repeats a level above it too (a stored pair from before a pick freed it).
 */
export function inForce<T extends string>(levels: Levels<T>): T[] {
  return levels.filter(
    (by, at): by is T => by !== null && levels.indexOf(by) === at
  );
}

/**
 * A press on a column's item: on the ticked one, the level clears; on
 * another, the level takes it. A grouping another level holds is not
 * offered there (the menu greys it), so a level never repeats one.
 */
function picked<T extends string>(levels: Levels<T>, at: number, by: T) {
  const next = [...levels];
  next[at] = next[at] === by ? null : by;
  return next;
}

/** The fold of a project's running sessions under its row in Projects, as a path the folds keep. */
export const runningPath = (projectId: string): string =>
  `running:${projectId}`;

/**
 * A parent folded by default: Older, at the list's top level, and a
 * project's running sessions under its row in Projects.
 */
const foldedAtFirst = (path: string): boolean =>
  path === "day:older" || path.startsWith("running:");

export const grouping = {
  get recent(): Levels<GroupBy> {
    return drawnFrom(RECENT_KEY, state.recent, recentOf);
  },
  get projects(): Levels<ProjectGroupBy> {
    return drawnFrom(PROJECTS_KEY, state.projects, projectsOf);
  },
  pickRecent(at: number, by: GroupBy): void {
    state.recent = picked(state.recent, at, by);
    writeJson(RECENT_KEY, state.recent);
  },
  pickProjects(at: number, by: ProjectGroupBy): void {
    state.projects = picked(state.projects, at, by);
    writeJson(PROJECTS_KEY, state.projects);
  },
  /** Whether the parent at `path` is folded. */
  folded(path: string): boolean {
    return (
      drawnFrom(FOLDS_KEY, state.folds, foldsOf)[path] ?? foldedAtFirst(path)
    );
  },
  toggle(path: string): void {
    const folded = !grouping.folded(path);
    if (folded === foldedAtFirst(path)) {
      delete state.folds[path];
    } else {
      state.folds[path] = folded;
    }
    writeJson(FOLDS_KEY, state.folds);
  },
};
