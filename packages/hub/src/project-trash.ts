/**
 * Forgetting a project can be undone: a restored project comes back as it
 * was when it was forgotten, its row and settings (its account included),
 * its places, tasks, notes, rules, routines, memory documents, pages,
 * browsers and folder, and its sessions counted as its own again.
 *
 * Everything a forget sets aside sits in the trash, `<data>/projects/.trash/`,
 * under one entry name, `<projectId>-<time>`: the project's folder, moved
 * there as it always was (project-folder.ts `trashProjectFolder`), and beside
 * it `<entry>.json`, the record of every row its delete took and every link
 * it cut (db forget.ts), written in the delete's own transaction before
 * anything goes. A project that never had a folder leaves its record alone.
 * Its browsers' profiles live on their machines (a local Chromium's under
 * the agent's `browsers/<key>/`, a container's in its runtime's volume): the
 * forget stops each one that runs and keeps its profile there (browsers.ts
 * `forgetProject`), and the record names each, so the restored project's
 * sessions find their sign-ins where they were. The trash is the one place
 * the list of forgotten projects is read from:
 *
 * - an entry with a record brings back everything above;
 * - an entry with a folder and no record is a project forgotten before the
 *   hub kept records: its row went for good, so its folder alone comes back
 *   (its task files, which the tasks index reads again, its stages, pages'
 *   sources, memory and design files) under a new row with its old id and
 *   the name the restore gives it, since no file in it names the project.
 *   A duplicate folded into another project (project-merge.ts) before then
 *   left one of these too. What tells it: the project that kept it holds a
 *   merge commit (`CawCo-Change: merge`, tasks.ts `adopt`) that wrote a task
 *   file for each of its tasks, by title. One whose every task such a
 *   commit wrote was a fold, and is neither listed nor restored; one only
 *   some of whose tasks one wrote can't be told, and is listed with the
 *   project they live in (`tasksIn`); one with no task files can't be told
 *   either, and is listed as it is;
 * - a folded duplicate's entry since carries a record that says so, and is
 *   never listed: its rows live on in the project that kept them.
 *
 * Nothing in the trash is erased: a restore moves its folder back and drops
 * its record, whose rows are live again.
 */
import { mkdirSync, rmSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BrowserKey } from "@cawco/core/browser";
import type {
  ForgottenBrings,
  ForgottenProject,
  ProjectRestored,
} from "@cawco/core/forgotten-project";
import {
  isDamagedRecord,
  readRecord,
  writeStateFileSync,
} from "@cawco/core/state-file";
import { projectTrashWords } from "@cawco/core/words/project-trash";
import { z } from "zod";
import type { DbShape } from "./db";
import { type ProjectRows, ProjectRowsSchema } from "./db/forget";
import {
  folderCommitsCarrying,
  hasProjectFolder,
  PROJECT_TRASH_DIR,
  projectRoot,
  trashProjectFolder,
  untrashProjectFolder,
} from "./project-folder";
import {
  ARCHIVE_DIR,
  fileTaskNumber,
  fileTaskSlug,
  TaskDoc,
  taskSlug,
} from "./task-file";
import { CHANGES, TRAILERS } from "./task-history";

/** A browser of the project as the forget left it: stopped on its machine, its profile kept there. */
const KeptBrowserSchema = z.object({
  machineId: z.string(),
  key: z.string(),
  name: z.string(),
  host: z.string(),
});

/** What a forget writes beside the folder, or a fold: the entry's own word on what it is. */
const EntryRecordSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("forgotten"),
    version: z.literal(1),
    id: z.string(),
    name: z.string(),
    /** ms since the epoch. */
    forgottenAt: z.number(),
    /** The presence id of the client that asked; null when none said. */
    by: z.string().nullable(),
    rows: ProjectRowsSchema,
    /** Its browsers; none in a record written before the forget kept them. */
    browsers: z.array(KeptBrowserSchema).default([]),
  }),
  z.object({
    kind: z.literal("folded"),
    version: z.literal(1),
    id: z.string(),
    /** The project it was folded into. */
    into: z.string(),
    foldedAt: z.number(),
  }),
]);
type EntryRecord = z.input<typeof EntryRecordSchema>;
type KeptBrowser = z.infer<typeof KeptBrowserSchema>;

/** `<projectId>-<ISO time, its colons as dashes>`, as the trash has always named a folder. */
const ENTRY = /^(.+)-(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}\.\d{3}Z)$/u;
const RECORD = ".json";
/**
 * A record is written once, never over another, and read by the hub alone:
 * it holds the project's rows whole (its rules, prompts and pages).
 */
const RECORD_WRITE = { exclusive: true, mode: 0o600 } as const;
/** The line every commit a fold made carries (tasks.ts `adopt`, project-merge.ts). */
const MERGE_LINE = `${TRAILERS.change}: ${CHANGES.merge}`;

const entryOf = (projectId: string, at: Date): string =>
  `${projectId}-${at.toISOString().replaceAll(":", "-")}`;

const recordPath = (entry: string): string =>
  join(PROJECT_TRASH_DIR, `${entry}${RECORD}`);

/** One entry in the trash: what it holds, read off its names. */
interface Entry {
  at: number;
  entry: string;
  folder: boolean;
  id: string;
  record: boolean;
}

/** Whether `id` is a project id the folder rules take. */
const isProjectId = (id: string): boolean => {
  try {
    projectRoot(id);
    return true;
  } catch {
    return false;
  }
};

/** Every entry the trash holds, newest first; none when there is no trash. */
const entries = async (): Promise<Entry[]> => {
  const names = await readdir(PROJECT_TRASH_DIR, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  );
  const found = new Map<string, Entry>();
  for (const one of names) {
    const record = one.isFile() && one.name.endsWith(RECORD);
    if (!(record || one.isDirectory())) {
      continue;
    }
    const entry = record ? one.name.slice(0, -RECORD.length) : one.name;
    const parts = ENTRY.exec(entry);
    if (!(parts?.[1] && isProjectId(parts[1]))) {
      continue;
    }
    const at = Date.parse(`${parts[2]}:${parts[3]}:${parts[4]}`);
    const kept = found.get(entry) ?? {
      at,
      entry,
      folder: false,
      id: parts[1],
      record: false,
    };
    kept.record ||= record;
    kept.folder ||= !record;
    found.set(entry, kept);
  }
  return [...found.values()].sort((a, b) => b.at - a.at);
};

/** The entry's record: undefined when it has none, a DamagedRecord when it does not read. */
const recordOf = async (entry: Entry) =>
  entry.record
    ? await readRecord(recordPath(entry.entry), EntryRecordSchema)
    : undefined;

/** How many task files the folder at `root` holds. */
const taskFiles = async (root: string): Promise<number> =>
  (await readdir(join(root, "tasks")).catch(() => [])).filter(
    (file) => fileTaskNumber(file) !== undefined
  ).length;

/**
 * The slugs of a trashed folder's task files, archived ones too, from each
 * file's title: the names a fold gave them in the project it joined
 * (tasks.ts `adopt`, task-file.ts `taskPath`).
 */
const trashedSlugs = async (entry: string): Promise<string[]> => {
  const root = join(PROJECT_TRASH_DIR, entry);
  const slugs: string[] = [];
  for (const dir of ["tasks", ARCHIVE_DIR]) {
    for (const file of await readdir(join(root, dir)).catch(() => [])) {
      if (fileTaskNumber(file) === undefined) {
        continue;
      }
      const content = await readFile(join(root, dir, file), "utf8").catch(
        () => undefined
      );
      if (content !== undefined) {
        slugs.push(taskSlug(new TaskDoc(`${dir}/${file}`, content).title()));
      }
    }
  }
  return slugs;
};

/** A fold a live project's folder holds: the task files one merge commit wrote, by slug. */
interface Merge {
  id: string;
  name: string;
  slugs: string[];
}

/** Every fold the live projects' folders hold. */
const mergesOf = async (
  projects: readonly { id: string; name: string }[]
): Promise<Merge[]> => {
  const merges: Merge[] = [];
  for (const project of projects) {
    if (!(await hasProjectFolder(project.id))) {
      continue;
    }
    for (const commit of await folderCommitsCarrying(project.id, MERGE_LINE)) {
      const slugs = commit.paths.flatMap((path) => fileTaskSlug(path) ?? []);
      if (slugs.length > 0) {
        merges.push({ id: project.id, name: project.name, slugs });
      }
    }
  }
  return merges;
};

/** How many of `slugs` one merge wrote, each counted once per file. */
const overlap = (slugs: readonly string[], merge: Merge): number => {
  const left = [...merge.slugs];
  let found = 0;
  for (const slug of slugs) {
    const at = left.indexOf(slug);
    if (at >= 0) {
      left.splice(at, 1);
      found += 1;
    }
  }
  return found;
};

/**
 * The live project a folder with no record shares the most tasks with,
 * through one fold's commit, and whether that commit wrote every one of
 * them (a fold for sure); undefined when no fold wrote any, or it has none.
 */
const foldOf = (
  slugs: readonly string[],
  merges: readonly Merge[]
):
  | { into: { id: string; name: string }; tasks: number; whole: boolean }
  | undefined => {
  let best: { merge: Merge; tasks: number } | undefined;
  for (const merge of merges) {
    const tasks = overlap(slugs, merge);
    if (tasks > (best?.tasks ?? 0)) {
      best = { merge, tasks };
    }
  }
  return best
    ? {
        into: { id: best.merge.id, name: best.merge.name },
        tasks: best.tasks,
        whole: best.tasks === slugs.length,
      }
    : undefined;
};

/** Each table's rows the record holds. */
const rowsIn = (rows: ProjectRows) => (table: string) =>
  rows.tables.find((one) => one.table === table)?.rows ?? [];

/** What a record brings, by the tables that hold each part. */
const bringsOf = (
  count: (table: string) => number,
  linked: { browsers: number; sessions: number },
  account: string | null,
  folder: boolean,
  rows: number
): ForgottenBrings => ({
  account,
  browsers: linked.browsers,
  folder,
  memoryDocs: count("fleet_memory_docs"),
  notes: count("project_notes"),
  pages: count("artifacts"),
  places: count("project_places"),
  routines: count("routines"),
  rows,
  rules: count("rules"),
  sessions: linked.sessions,
  settings: true,
  tasks: count("project_tasks"),
  tasksIn: null,
});

/** The account the record's row names; null for none. */
const accountIn = (rows: ProjectRows): string | null => {
  const projects = rows.tables.find((one) => one.table === "projects");
  const at = projects?.columns.indexOf("account") ?? -1;
  const account = at >= 0 ? projects?.rows[0]?.[at] : null;
  return typeof account === "string" ? account : null;
};

/** The sessions a record unlinked. */
const sessionsIn = (rows: ProjectRows): number =>
  rows.unlinked
    .filter((one) => one.table === "instances")
    .reduce((sum, one) => sum + one.rows.length, 0);

/** What a folder brings with no record beside it: its files alone. */
const folderBrings = (
  tasks: number,
  tasksIn: ForgottenBrings["tasksIn"]
): ForgottenBrings => ({
  account: null,
  browsers: 0,
  folder: true,
  memoryDocs: 0,
  notes: 0,
  pages: 0,
  places: 0,
  routines: 0,
  rows: 0,
  rules: 0,
  sessions: 0,
  settings: false,
  tasks,
  tasksIn,
});

/** Counts by table, added. */
const summed = (
  ...counts: Record<string, number>[]
): Record<string, number> => {
  const sum: Record<string, number> = {};
  for (const one of counts) {
    for (const [table, n] of Object.entries(one)) {
      sum[table] = (sum[table] ?? 0) + n;
    }
  }
  return sum;
};

/**
 * Project `id`'s newest trash entry (`forgottenAt`: the one forgotten then)
 * and its record; a record that does not read is refused in words.
 */
const newestEntry = async (id: string, forgottenAt: number | undefined) => {
  const entry = (await entries()).find(
    (one) =>
      one.id === id && (forgottenAt === undefined || one.at === forgottenAt)
  );
  const record = entry
    ? await recordOf(entry).catch((error: unknown) => {
        if (isDamagedRecord(error)) {
          throw new RestoreRefusal(
            422,
            projectTrashWords.unreadable(id, error.reason)
          );
        }
        throw error;
      })
    : undefined;
  return { entry, record };
};

/** A restore the hub turns down: its status, and the words the caller reads. */
export class RestoreRefusal extends Error {
  readonly status: 400 | 404 | 409 | 422;
  constructor(status: 400 | 404 | 409 | 422, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * A folded duplicate's folder set aside (project-merge.ts), with a record
 * that says it was folded into `into`, so it is never listed as forgotten.
 * Answers where the folder went.
 */
export const trashFoldedFolder = async (
  id: string,
  into: string
): Promise<string | undefined> => {
  const at = new Date();
  const entry = entryOf(id, at);
  writeStateFileSync(
    recordPath(entry),
    JSON.stringify({
      kind: "folded",
      version: 1,
      id,
      into,
      foldedAt: at.getTime(),
    } satisfies EntryRecord),
    RECORD_WRITE
  );
  return await trashProjectFolder(id, entry);
};

/** A forget as it went. */
export interface Forgot {
  /** Its browsers, stopped with their profiles kept on their machines. */
  browsers: number;
  /** The trash entry it went to. */
  entry: string;
  /** Its folder's place in the trash; undefined when it had none, or the move failed (said in the log). */
  folder: string | undefined;
  name: string;
  /** Every row the delete took. */
  rows: number;
  /** Sessions it unlinked. */
  sessions: number;
}

export interface ProjectTrash {
  /**
   * Forgets project `id`: its record written to the trash, its rows deleted,
   * its folder moved beside the record. `by` is the presence id of the
   * client that asked. Its browsers were stopped first (browsers.ts
   * `forgetProject`); the record names them. Undefined: there is no such
   * project.
   */
  readonly forget: (
    id: string,
    by: string | null
  ) => Promise<Forgot | undefined>;
  /** Every forgotten project the trash can bring back, newest first. */
  readonly forgotten: () => Promise<ForgottenProject[]>;
  /**
   * Brings project `id` back from its newest entry (`forgottenAt`: the one
   * forgotten then); `name` names one forgotten before the hub kept its
   * name. Throws a {@link RestoreRefusal} in the hub's words.
   */
  readonly restore: (
    id: string,
    asked: { forgottenAt?: number; name?: string }
  ) => Promise<ProjectRestored>;
}

export const projectTrash = (
  db: Pick<
    DbShape,
    | "browsers"
    | "createProject"
    | "forgetProject"
    | "listProjects"
    | "project"
    | "restoreProject"
  >
): ProjectTrash => {
  /** The live project holding `id`, refused in words. */
  const refuseLive = (id: string): void => {
    const live = db.project(id);
    if (live) {
      throw new RestoreRefusal(409, projectTrashWords.idTaken(live.name, id));
    }
  };
  /** A folder standing where the entry's goes back to, refused in words. */
  const refuseFolder = async (entry: Entry, name: string): Promise<void> => {
    const root = projectRoot(entry.id);
    if (entry.folder && (await stat(root).catch(() => undefined))) {
      throw new RestoreRefusal(409, projectTrashWords.folderTaken(name, root));
    }
  };
  /** Moves the entry's folder back, runs `put`, and moves it out again when `put` throws. */
  const withFolder = async <T>(entry: Entry, put: () => T): Promise<T> => {
    await untrashProjectFolder(entry.id, entry.folder ? entry.entry : null);
    try {
      return put();
    } catch (error) {
      if (entry.folder) {
        await trashProjectFolder(entry.id, entry.entry);
      }
      throw error;
    }
  };
  /** The record's browsers its machines still keep: one the person removed since is gone with its profile. */
  const stillKept = (browsers: readonly KeptBrowser[]): number =>
    browsers.filter((one) =>
      db.browsers.get(one.machineId, one.key as BrowserKey)
    ).length;
  /** The folds the live projects hold, read once per call and only when asked. */
  const mergesOnce = () => {
    let read: Promise<Merge[]> | undefined;
    return () => {
      read ??= mergesOf(db.listProjects());
      return read;
    };
  };
  /** What a folder with no record brings, and the project it was folded into when every task of it lives there. */
  const folderAlone = async (entry: Entry, merges: () => Promise<Merge[]>) => {
    const slugs = await trashedSlugs(entry.entry);
    const fold = slugs.length > 0 ? foldOf(slugs, await merges()) : undefined;
    return {
      brings: folderBrings(
        await taskFiles(join(PROJECT_TRASH_DIR, entry.entry)),
        fold ? { ...fold.into, tasks: fold.tasks } : null
      ),
      foldedInto: fold?.whole ? fold.into : undefined,
    };
  };

  /** A folder with no record brought back under a new row named `name`, unless it was a fold. */
  const restoreFolder = async (
    entry: Entry,
    asked: { name?: string }
  ): Promise<ProjectRestored> => {
    const { id } = entry;
    const alone = await folderAlone(entry, mergesOnce());
    if (alone.foldedInto) {
      throw new RestoreRefusal(
        409,
        projectTrashWords.foldedInto(id, alone.foldedInto.name)
      );
    }
    const name = asked.name?.trim();
    if (!name) {
      throw new RestoreRefusal(400, projectTrashWords.nameNeeded(id));
    }
    refuseLive(id);
    await refuseFolder(entry, name);
    await withFolder(entry, () => db.createProject({ id, name, remote: null }));
    return {
      id,
      name,
      // Its one place: its folder on the hub, which a new row makes.
      brought: {
        ...folderBrings(await taskFiles(projectRoot(id)), null),
        places: 1,
      },
      left: {},
    };
  };

  /** Every forgotten project of the trash's entries, but folds. */
  const listed = async (): Promise<ForgottenProject[]> => {
    const out: ForgottenProject[] = [];
    const merges = mergesOnce();
    for (const entry of await entries()) {
      const record = await recordOf(entry).catch((error: unknown) => {
        if (isDamagedRecord(error)) {
          console.warn(`[hub] forgotten project ${entry.id}: ${error.message}`);
          return;
        }
        throw error;
      });
      if (record?.kind === "folded") {
        continue;
      }
      if (record) {
        const rows = rowsIn(record.rows);
        out.push({
          id: record.id,
          name: record.name,
          forgottenAt: record.forgottenAt,
          by: record.by,
          brings: bringsOf(
            (table) => rows(table).length,
            {
              browsers: stillKept(record.browsers),
              sessions: sessionsIn(record.rows),
            },
            accountIn(record.rows),
            entry.folder,
            record.rows.tables.reduce((sum, one) => sum + one.rows.length, 0)
          ),
        });
        continue;
      }
      // A record that does not read lists what its folder alone holds; a
      // fold's folder is none a person forgot.
      const alone = entry.folder ? await folderAlone(entry, merges) : undefined;
      if (alone && !alone.foldedInto) {
        out.push({
          id: entry.id,
          name: null,
          forgottenAt: entry.at,
          by: null,
          brings: alone.brings,
        });
      }
    }
    return out;
  };

  return {
    forget: async (id, by) => {
      const project = db.project(id);
      if (!project) {
        return;
      }
      const at = new Date();
      const entry = entryOf(id, at);
      const path = recordPath(entry);
      const browsers = db.browsers
        .list()
        .filter((one) => one.key === `project:${id}`)
        .map(({ machineId, key, name, host }) => ({
          machineId,
          key,
          name,
          host,
        }));
      mkdirSync(PROJECT_TRASH_DIR, { recursive: true });
      let rows: ProjectRows | undefined;
      try {
        rows = db.forgetProject(id, (kept) =>
          writeStateFileSync(
            path,
            JSON.stringify({
              kind: "forgotten",
              version: 1,
              id,
              name: project.name,
              forgottenAt: at.getTime(),
              by,
              rows: kept,
              browsers,
            } satisfies EntryRecord),
            RECORD_WRITE
          )
        );
      } catch (error) {
        // The project stands: a record of a forget that never happened goes.
        rmSync(path, { force: true });
        throw error;
      }
      if (!rows) {
        rmSync(path, { force: true });
        return;
      }
      // The project is gone either way; a folder that could not be moved
      // stays where it was, and the hub says so in its log.
      const folder = await trashProjectFolder(id, entry).catch(
        (error: unknown): undefined => {
          console.warn(
            `[hub] project ${id}'s folder was not moved to the trash: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      );
      return {
        browsers: browsers.length,
        entry,
        folder,
        name: project.name,
        rows: rows.tables.reduce((sum, one) => sum + one.rows.length, 0),
        sessions: sessionsIn(rows),
      };
    },

    forgotten: listed,

    restore: async (id, asked) => {
      const { entry, record } = await newestEntry(id, asked.forgottenAt);
      if (!(entry && (record || entry.folder))) {
        throw new RestoreRefusal(404, projectTrashWords.notForgotten(id));
      }
      if (record?.kind === "folded") {
        throw new RestoreRefusal(
          409,
          projectTrashWords.foldedInto(
            id,
            db.project(record.into)?.name ?? record.into
          )
        );
      }
      if (!record) {
        return await restoreFolder(entry, asked);
      }
      refuseLive(id);
      await refuseFolder(entry, record.name);
      const restored = await withFolder(entry, () => {
        const done = db.restoreProject(id, record.rows);
        if (!done.ok) {
          throw done.why === "live"
            ? new RestoreRefusal(
                409,
                projectTrashWords.idTaken(db.project(id)?.name ?? id, id)
              )
            : new RestoreRefusal(
                409,
                projectTrashWords.placeTaken(
                  record.name,
                  done.holder.name,
                  done.path
                )
              );
        }
        return done;
      });
      // Its rows are live again: the record has nothing left to keep.
      await rm(recordPath(entry.entry), { force: true });
      const left = summed(restored.taken, restored.gone);
      // Its browsers were never moved: each its machine still keeps is its
      // own again, its profile where it was; one removed since is gone.
      const browsers = stillKept(record.browsers);
      if (browsers < record.browsers.length) {
        left.browsers = record.browsers.length - browsers;
      }
      return {
        id,
        name: record.name,
        brought: bringsOf(
          (table) => restored.back[table] ?? 0,
          { browsers, sessions: restored.relinked.instances ?? 0 },
          db.project(id)?.account ?? null,
          entry.folder,
          Object.values(restored.back).reduce((sum, n) => sum + n, 0)
        ),
        left,
      };
    },
  };
};
