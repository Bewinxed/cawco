/**
 * One repository is one project (Projects spec §5.1, D1). A folder added
 * later joins the project that links its remote (server.ts
 * `createOrJoinProject`); projects made before the hub matched remotes
 * (migration 0078), and a project that links a repository another one
 * already links, are folded here: projects joined by shared links into
 * their oldest.
 *
 * A duplicate's tasks are taken in under the kept project's next numbers
 * (tasks.ts `adopt`, one commit), its folder's other files the kept project
 * lacks are copied in (one commit; a file both have keeps the kept project's
 * copy, and the duplicate's goes to the trash with its folder), then its
 * places, sessions, work items, notes and fleet rows move and its row goes
 * (db `foldProject`), its connections are granted to the kept project
 * (connections.ts `projectFolded`, so its GitHub poller follows them), and
 * its folder is trashed (project-trash.ts, marked folded). A duplicate that could not
 * be read whole or whose tasks did not move is left as it is, said in the
 * log, and tried again at the next start: only an emptied duplicate is
 * removed. Run once at hub start and whenever a project gains a link;
 * with nothing to fold it does nothing.
 */

import { join } from "node:path";
import { ElysiaStatus } from "elysia";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import {
  hasProjectFolder,
  listFolder,
  readFolderFile,
  writeFolderFiles,
} from "./project-folder";
import { projectRefusalOf, projectRootOf } from "./project-refusal";
import { trashFoldedFolder } from "./project-trash";
import { fileTaskNumber, TaskDoc } from "./task-file";
import { CHANGES, TRAILERS } from "./task-history";
import { hubActor, STAGES_FILE, type Tasks } from "./tasks";

export interface MergeDeps {
  /** A duplicate's connections, granted to the project it joined (connections.ts `projectFolded`). */
  readonly connections: Pick<Connections, "projectFolded">;
  readonly db: Pick<DbShape, "connections" | "foldProject" | "listProjects">;
  /** Says a project's folder was moved away: every machine checks its boundaries' access (server.ts `projectFolderMoved`). */
  readonly folderMoved: () => void;
  /** Says a machine's places changed: its fleet config goes again (project-placements.ts). */
  readonly placesChanged: (machineId: string, projectId: string) => void;
  /** Tells every dashboard the projects changed. */
  readonly projectsChanged: () => void;
  readonly tasks: Pick<Tasks, "adopt" | "stages">;
}

const log = (line: string): void => console.log(`[project-merge] ${line}`);

/** A duplicate to fold, with the link it shares with another of its group. */
interface Duplicate {
  dup: ProjectRow;
  shared: string;
}

/** Oldest first: the order a group keeps its first by. */
const byAge = (a: ProjectRow, b: ProjectRow): number =>
  new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
  a.id.localeCompare(b.id);

/**
 * Every project `first` reaches through shared links, each with the link it
 * was reached by; each one reached is added to `grouped`.
 */
const reachedFrom = (
  first: ProjectRow,
  byLink: ReadonlyMap<string, ProjectRow[]>,
  grouped: Set<string>
): Duplicate[] => {
  const dups: Duplicate[] = [];
  const reach = [first];
  for (const one of reach) {
    for (const link of one.links) {
      for (const other of byLink.get(link) ?? []) {
        if (!grouped.has(other.id)) {
          grouped.add(other.id);
          reach.push(other);
          dups.push({ dup: other, shared: link });
        }
      }
    }
  }
  return dups;
};

/**
 * The projects that share a link, each group with its oldest first (the one
 * kept) and the rest each with a link it shares: projects joined through a
 * chain of shared links are one group (only `remote`'s group, when named).
 */
const duplicates = (
  projects: ProjectRow[],
  remote?: string
): { keep: ProjectRow; dups: Duplicate[] }[] => {
  const byLink = new Map<string, ProjectRow[]>();
  for (const project of projects) {
    for (const link of project.links) {
      byLink.set(link, [...(byLink.get(link) ?? []), project]);
    }
  }
  const grouped = new Set<string>();
  const groups: { keep: ProjectRow; dups: Duplicate[] }[] = [];
  for (const keep of [...projects].sort(byAge)) {
    if (grouped.has(keep.id)) {
      continue;
    }
    grouped.add(keep.id);
    const dups = reachedFrom(keep, byLink, grouped);
    const linked = [keep, ...dups.map(({ dup }) => dup)].flatMap(
      (one) => one.links
    );
    if (dups.length > 0 && (!remote || linked.includes(remote))) {
      groups.push({ keep, dups });
    }
  }
  return groups;
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
  const has = await hasProjectFolder(dup.id);
  if (has instanceof ElysiaStatus) {
    throw projectRefusalOf(has);
  }
  if (!has) {
    return { tasks: [], others: [] };
  }
  const listing = await listFolder(dup.id, "", true);
  if (listing instanceof ElysiaStatus) {
    throw projectRefusalOf(listing);
  }
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
      .map(async (entry) => {
        const file = await readFolderFile(dup.id, entry.path);
        if (file instanceof ElysiaStatus) {
          throw projectRefusalOf(file);
        }
        return { path: entry.path, content: file.content };
      })
  );
  const taken = new Set(tasks.map((task) => task.path));
  const others = await Promise.all(
    files
      .filter((entry) => !taken.has(entry.path))
      .map(async (entry) => ({
        path: entry.path,
        bytes: await Bun.file(join(projectRootOf(dup.id), entry.path)).bytes(),
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
  const has = await hasProjectFolder(keep.id);
  if (has instanceof ElysiaStatus) {
    throw projectRefusalOf(has);
  }
  const listed = has ? await listFolder(keep.id, "", true) : undefined;
  if (listed instanceof ElysiaStatus) {
    throw projectRefusalOf(listed);
  }
  const kept = new Set(listed?.entries.map((entry) => entry.path));
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
    const written = await writeFolderFiles(
      keep.id,
      missing.map((file) => ({ path: file.path, content: file.bytes })),
      {
        author: { name: "hub" },
        // The hub's trailers (task-history.ts): a task file it carries over
        // is the hub's own, so its start is never judged as a stray write.
        message: [
          `${dup.name}'s files, merged in: ${missing.map((file) => file.path).join(", ")}`,
          "",
          `${TRAILERS.actor}: hub`,
          `${TRAILERS.mover}: hub`,
          `${TRAILERS.what}: ${dup.name}'s files, merged in`,
          `${TRAILERS.change}: ${CHANGES.merge}`,
        ].join("\n"),
      }
    );
    if (written instanceof ElysiaStatus) {
      throw projectRefusalOf(written);
    }
  }
};

/** Folds one duplicate into `keep`; false when it was left as it is. */
const fold = async (
  deps: MergeDeps,
  keep: ProjectRow,
  { dup, shared }: Duplicate
): Promise<boolean> => {
  const folder = await readWhole(dup);
  if (!folder) {
    log(
      `${dup.name} (${dup.id}) shares ${shared} with ${keep.name}'s projects, but its folder is too large to read whole; it is left as it is.`
    );
    return false;
  }
  const ids = await deps.tasks.adopt(
    keep.id,
    folder.tasks,
    hubActor(`${dup.name} shares ${shared} with this project`),
    dup.name
  );
  if (ids instanceof ElysiaStatus) {
    throw projectRefusalOf(ids);
  }
  await copyOthers(keep, dup, folder.others);
  // A task in a stage the kept project does not have is said, to be moved.
  const stages = await deps.tasks.stages(keep.id);
  if (stages instanceof ElysiaStatus) {
    throw projectRefusalOf(stages);
  }
  const named = new Set(stages.stages.map((stage) => stage.name));
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
  // Its own grants alone: what its area grants stays the area's.
  const grants = deps.db.connections
    .list()
    .filter((one) => deps.db.connections.projectsOf(one.id).includes(dup.id))
    .map((one) => one.name);
  const moved = deps.db.foldProject(dup.id, keep.id, ids);
  deps.connections.projectFolded(grants, keep.id);
  if (await hasProjectFolder(dup.id)) {
    // Marked folded, never listed as a forgotten project: its rows live on
    // in the kept one.
    await trashFoldedFolder(dup.id, keep.id);
    deps.folderMoved();
  }
  log(
    `${dup.name} (${dup.id}) folded into ${keep.name} (${keep.id}), one repository ${shared}: ${ids.size} task(s), ${folder.others.length} other file(s), ${moved.places} place(s), ${moved.sessions} session(s), ${moved.workItems} work item(s).`
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
 * Folds every group of projects that share links into its oldest (only
 * `remote`'s, when named). Each duplicate is its own step: one that fails is said in the
 * log and left, the rest go on.
 */
export const mergeSameRemote = async (
  deps: MergeDeps,
  remote?: string
): Promise<void> => {
  let changed = false;
  for (const { keep, dups } of duplicates(deps.db.listProjects(), remote)) {
    for (const one of dups) {
      try {
        changed = (await fold(deps, keep, one)) || changed;
      } catch (error) {
        log(
          `${one.dup.name} (${one.dup.id}) was not folded into ${keep.name}: ${error instanceof Error ? error.message : String(error)}. It is left as it is; the next start tries again.`
        );
      }
    }
  }
  if (changed) {
    deps.projectsChanged();
  }
};
