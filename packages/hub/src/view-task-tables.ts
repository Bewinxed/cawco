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
  readonly listViews: (projectId: string, dir: string) => Promise<string[]>;
  readonly markDataMigrated: (name: string) => void;
  readonly projectIds: () => string[];
  readonly read: (projectId: string, path: string) => Promise<string>;
  readonly write: (
    projectId: string,
    writes: { content: string; path: string }[],
    options: { author: { name: string }; message: string }
  ) => Promise<unknown>;
}

/** One project's views with their task tables renamed, as the files to write; none when it has none. */
const renamedIn = async (
  deps: ViewTaskTablesDeps,
  projectId: string
): Promise<{ content: string; path: string }[]> => {
  const writes: { content: string; path: string }[] = [];
  for (const dir of FOLDERS) {
    for (const path of await deps.listViews(projectId, dir)) {
      const renamed = path.endsWith(EXT)
        ? taskTablesRenamed(await deps.read(projectId, path))
        : null;
      if (renamed !== null) {
        writes.push({ path, content: renamed });
      }
    }
  }
  return writes;
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
      const writes = await renamedIn(deps, projectId);
      if (writes.length > 0) {
        await deps.write(projectId, writes, {
          author: hubActor("views").author,
          message:
            "views: the task table is TaskTable, now that Table draws any rows",
        });
        console.info(
          `[views] project ${projectId}: TaskTable in ${writes.map((one) => one.path).join(", ")}`
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
