/**
 * One repository is one project (Projects spec §5.1, D1). A folder added
 * later joins the project that has its remote (server.ts
 * `createOrJoinProject`); projects made before the hub matched remotes
 * (migration 0078), and a project that learns its remote after another one
 * already has it, are folded here: each remote's projects into its oldest.
 *
 * A duplicate's tasks are taken in under the kept project's next numbers
 * (tasks.ts `adopt`, one commit), its folder's other files the kept project
 * lacks are copied in (one commit; a file both have keeps the kept project's
 * copy, and the duplicate's goes to the trash with its folder), then its
 * places, sessions, work items, threads and fleet rows move and its row goes
 * (db `foldProject`), and its folder is trashed. A duplicate that could not
 * be read whole or whose tasks did not move is left as it is, said in the
 * log, and tried again at the next start: only an emptied duplicate is
 * removed. Run once at hub start and whenever a project learns its remote;
 * with nothing to fold it does nothing.
 */
import { join } from "node:path";
import type { DbShape, ProjectRow } from "./db";
import {
  hasProjectFolder,
  listFolder,
  projectRoot,
  readFolderFile,
  trashProjectFolder,
  writeFolderFiles,
} from "./project-folder";
import { fileTaskNumber, TaskDoc } from "./task-file";
import { hubActor, STAGES_FILE, type Tasks } from "./tasks";

export interface MergeDeps {
  readonly db: Pick<DbShape, "foldProject" | "listProjects">;
  /** Says a machine's places changed: its fleet config goes again (project-placements.ts). */
  readonly placesChanged: (machineId: string, projectId: string) => void;
  /** Tells every dashboard the projects changed. */
  readonly projectsChanged: () => void;
  readonly tasks: Pick<Tasks, "adopt" | "stages">;
}

const log = (line: string): void => console.log(`[project-merge] ${line}`);

/** Each remote's projects, oldest first, for the remotes more than one project has. */
const duplicates = (
  projects: ProjectRow[],
  remote?: string
): ProjectRow[][] => {
  const byRemote = new Map<string, ProjectRow[]>();
  for (const project of projects) {
    if (project.remote && (!remote || project.remote === remote)) {
      byRemote.set(project.remote, [
        ...(byRemote.get(project.remote) ?? []),
        project,
      ]);
    }
  }
  return [...byRemote.values()]
    .filter((group) => group.length > 1)
    .map((group) =>
      [...group].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.id.localeCompare(b.id)
      )
    );
};

/**
 * The duplicate's folder, read whole: its task files as text, every other
 * file as bytes. Undefined when the listing stopped at its cap.
 */
const readWhole = async (
  dup: ProjectRow
): Promise<
  | {
      others: { bytes: Uint8Array; path: string }[];
      tasks: { content: string; path: string }[];
    }
  | undefined
> => {
  if (!(await hasProjectFolder(dup.id))) {
    return { tasks: [], others: [] };
  }
  const listing = await listFolder(dup.id, "", true);
  if (listing.truncated) {
    return undefined;
  }
  const files = listing.entries.filter((entry) => entry.kind === "file");
  const tasks = await Promise.all(
    files
      .filter(
        (entry) =>
          entry.path.startsWith("tasks/") &&
          fileTaskNumber(entry.path) !== undefined
      )
      .map(async (entry) => ({
        path: entry.path,
        content: (await readFolderFile(dup.id, entry.path)).content,
      }))
  );
  const taken = new Set(tasks.map((task) => task.path));
  const others = await Promise.all(
    files
      .filter((entry) => !taken.has(entry.path))
      .map(async (entry) => ({
        path: entry.path,
        bytes: await Bun.file(join(projectRoot(dup.id), entry.path)).bytes(),
      }))
  );
  return { tasks, others };
};

/** The duplicate's other files the kept project lacks, copied in one commit; the ones both have are said. */
const copyOthers = async (
  keep: ProjectRow,
  dup: ProjectRow,
  others: { bytes: Uint8Array; path: string }[]
): Promise<void> => {
  const kept = (await hasProjectFolder(keep.id))
    ? new Set(
        (await listFolder(keep.id, "", true)).entries.map((entry) => entry.path)
      )
    : new Set<string>();
  // The kept project's stages stand, its stages.md or, without one, the
  // template it runs on: the duplicate's never replaces them.
  const both = others.filter(
    (file) => kept.has(file.path) || file.path === STAGES_FILE
  );
  for (const file of both) {
    log(
      `${dup.name}'s ${file.path}: ${keep.name}'s own stands; ${dup.name}'s goes to the trash with its folder.`
    );
  }
  const missing = others.filter((file) => !both.includes(file));
  if (missing.length > 0) {
    await writeFolderFiles(
      keep.id,
      missing.map((file) => ({ path: file.path, content: file.bytes })),
      {
        author: { name: "hub" },
        message: `${dup.name}'s files, merged in: ${missing.map((file) => file.path).join(", ")}`,
      }
    );
  }
};

/** Folds one duplicate into `keep`; false when it was left as it is. */
const fold = async (
  deps: MergeDeps,
  keep: ProjectRow,
  dup: ProjectRow
): Promise<boolean> => {
  const folder = await readWhole(dup);
  if (!folder) {
    log(
      `${dup.name} (${dup.id}) shares ${keep.remote} with ${keep.name}, but its folder is too large to read whole; it is left as it is.`
    );
    return false;
  }
  const ids = await deps.tasks.adopt(
    keep.id,
    folder.tasks,
    hubActor(`${dup.name} shares ${keep.remote} with this project`),
    dup.name
  );
  await copyOthers(keep, dup, folder.others);
  // A task in a stage the kept project does not have is said, to be moved.
  const named = new Set(
    (await deps.tasks.stages(keep.id)).stages.map((stage) => stage.name)
  );
  for (const [was, now] of ids) {
    const file = folder.tasks.find(
      (task) => `tsk-${fileTaskNumber(task.path)}` === was
    );
    const stage = file
      ? new TaskDoc(file.path, file.content).read().fields.stage
      : null;
    if (stage && !named.has(stage)) {
      log(
        `${now} (was ${was} of ${dup.name}) is in “${stage}”, which ${keep.name}'s stages do not have; move it to one of its stages.`
      );
    }
  }
  const moved = deps.db.foldProject(dup.id, keep.id, ids);
  if (await hasProjectFolder(dup.id)) {
    await trashProjectFolder(dup.id);
  }
  log(
    `${dup.name} (${dup.id}) folded into ${keep.name} (${keep.id}), one repository ${keep.remote}: ${ids.size} task(s), ${folder.others.length} other file(s), ${moved.places} place(s), ${moved.sessions} session(s), ${moved.workItems} work item(s), ${moved.threads} thread(s).`
  );
  for (const machineId of new Set(
    dup.places
      .filter((place) => place.kind !== "hub")
      .map((place) => place.machineId)
  )) {
    deps.placesChanged(machineId, keep.id);
  }
  return true;
};

/**
 * Folds every remote's duplicate projects into its oldest (only `remote`'s,
 * when named). Each duplicate is its own step: one that fails is said in the
 * log and left, the rest go on.
 */
export const mergeSameRemote = async (
  deps: MergeDeps,
  remote?: string
): Promise<void> => {
  let changed = false;
  for (const [keep, ...dups] of duplicates(deps.db.listProjects(), remote)) {
    for (const dup of dups) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one fold at a time, each its own commits
        changed = (await fold(deps, keep as ProjectRow, dup)) || changed;
      } catch (error) {
        log(
          `${dup.name} (${dup.id}) was not folded into ${keep?.name}: ${error instanceof Error ? error.message : String(error)}. It is left as it is; the next start tries again.`
        );
      }
    }
  }
  if (changed) {
    deps.projectsChanged();
  }
};
