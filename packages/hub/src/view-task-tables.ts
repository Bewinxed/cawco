/**
 * The one-time pass that renames a view's task table (tsk-330). Until the
 * view library gained a general `Table` (rows of any values, which an
 * agent's block draws too), `Table` drew the project's tasks; that one is
 * `TaskTable` now. Every view kept or drafted before it was written when
 * `Table` could only mean the task table, so each `Table(` call outside a
 * string in every project's `views/` and `views/drafts/` is renamed, one
 * commit per project by the hub. It runs once, as the hub starts
 * (`data_migrations`): a view written after it means the general Table.
 */

import type { AnyProblem } from "./refusal";
import { hubActor } from "./tasks";

/** The pass's name in `data_migrations`. */
const VIEW_TASK_TABLES = "view_task_tables";

/** The views folders a project keeps its programs in. */
const FOLDERS = ["views", "views/drafts"] as const;
const EXT = ".oui";
/** A program's strings, each whole: double- or single-quoted, escapes kept. */
const STRING = /"(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?/gu;
/** A `Table(` call: the identifier `Table` alone, then its parenthesis. */
const TABLE_CALL = /(^|[^\w$])Table(\s*\()/gu;

/**
 * `source` with each `Table(` call written `TaskTable(`, outside its
 * strings. Null when it holds none.
 */
const taskTablesRenamed = (source: string): string | null => {
  let out = "";
  let at = 0;
  for (const string of source.matchAll(STRING)) {
    out += source.slice(at, string.index).replace(TABLE_CALL, "$1TaskTable$2");
    out += string[0];
    at = string.index + string[0].length;
  }
  out += source.slice(at).replace(TABLE_CALL, "$1TaskTable$2");
  return out === source ? null : out;
};

export interface ViewTaskTablesDeps {
  readonly dataMigrated: (name: string) => boolean;
  /** The `.oui` files directly in a project's folder `dir`, as paths from the folder's root; none when it isn't there. */
  readonly listViews: (
    projectId: string,
    dir: string
  ) => Promise<string[] | AnyProblem>;
  readonly markDataMigrated: (name: string) => void;
  readonly projectIds: () => string[];
  readonly read: (
    projectId: string,
    path: string
  ) => Promise<string | AnyProblem>;
  readonly write: (
    projectId: string,
    writes: { content: string; path: string }[],
    options: { author: { name: string }; message: string }
  ) => Promise<AnyProblem | undefined>;
}

/** One project's views with their task tables renamed, as the files to write; none when it has none; the folder's refusal of a read. */
const renamedIn = async (deps: ViewTaskTablesDeps, projectId: string) => {
  const writes: { content: string; path: string }[] = [];
  for (const dir of FOLDERS) {
    const views = await deps.listViews(projectId, dir);
    if (!Array.isArray(views)) {
      return views;
    }
    for (const path of views.filter((one) => one.endsWith(EXT))) {
      const source = await deps.read(projectId, path);
      if (typeof source !== "string") {
        return source;
      }
      const renamed = taskTablesRenamed(source);
      if (renamed !== null) {
        writes.push({ path, content: renamed });
      }
    }
  }
  return writes;
};

/** One project's views renamed and written, in one commit; the folder's refusal of a read or of the write. */
const renameIn = async (deps: ViewTaskTablesDeps, projectId: string) => {
  const writes = await renamedIn(deps, projectId);
  if (!Array.isArray(writes)) {
    return writes;
  }
  if (writes.length === 0) {
    return;
  }
  const refused = await deps.write(projectId, writes, {
    author: hubActor("views").author,
    message:
      "views: the task table is TaskTable, now that Table draws any rows",
  });
  if (refused) {
    return refused;
  }
  console.info(
    `[views] project ${projectId}: TaskTable in ${writes.map((one) => one.path).join(", ")}`
  );
};

/**
 * Runs the pass once: every project's views renamed, then marked done. A
 * project whose folder can't be read or written is said in the log and
 * leaves the pass unmarked, to run again at the next start.
 */
export const renameViewTaskTables = async (
  deps: ViewTaskTablesDeps
): Promise<void> => {
  if (deps.dataMigrated(VIEW_TASK_TABLES)) {
    return;
  }
  let whole = true;
  for (const projectId of deps.projectIds()) {
    try {
      const refused = await renameIn(deps, projectId);
      if (refused) {
        whole = false;
        console.warn(
          `[views] project ${projectId}'s task tables were not renamed: ${refused.response.detail}`
        );
      }
    } catch (error) {
      whole = false;
      console.warn(
        `[views] project ${projectId}'s task tables were not renamed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (whole) {
    deps.markDataMigrated(VIEW_TASK_TABLES);
  }
};
