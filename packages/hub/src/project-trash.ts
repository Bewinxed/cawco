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
 *   never listed: its rows live on in the project that kept them;
 * - an entry with a folder and a record that does not read is listed with
 *   what its folder holds, under the name its record holds: a restore
 *   refuses it in words (restore-record-unreadable), and asking for a name
 *   would only lead there.
 *
 * Nothing in the trash is erased: a restore moves its folder back and drops
 * its record, whose rows are live again. A restore that held rows back
 * (db forget.ts) names each in its answer and writes its record over with
 * them alone (`kind: "held"`): the rows as the hub's schema held them, the
 * migrations that schema is, the cut links waiting on them, and each row's
 * reason. That entry is listed apart from the forgotten projects
 * (`GET /api/projects/held`), under the project it belongs to, and is never
 * brought back as a project: a try again (`retry`) puts its rows back as a
 * restore puts a record's, through every migration since, and writes it
 * over with what is still held back, or drops it once none is. Deleting it
 * for good (`discardHeld`), or its project (project-delete.ts), drops it.
 */

import { rmSync } from "node:fs";
import { readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { ARTIFACT_NAME } from "@cawco/core/artifact-kinds";
import { isBrowserKey } from "@cawco/core/browser";
import { makeFolderSync } from "@cawco/core/folders";
import type {
  ForgottenBrings,
  ForgottenFolderHints,
  ForgottenPlace,
  ForgottenProject,
  HeldRetried,
  HeldRows,
  ProjectRestored,
  RestoreHeldRow,
} from "@cawco/core/forgotten-project";
import { machineCalled } from "@cawco/core/machine-names";
import { type PlaceNesting, placeNesting } from "@cawco/core/place-nesting";
import {
  isDamagedRecord,
  readRecord,
  writeStateFileSync,
} from "@cawco/core/state-file";
import { unhandled } from "@cawco/core/unhandled";
import { projectTrashWords } from "@cawco/core/words/project-trash";
import { ElysiaStatus, problem } from "elysia";
import {
  minLength,
  object,
  parseJson,
  pipe,
  safeParse,
  string,
  trim,
} from "valibot";
import { z } from "zod";
import type { DbShape } from "./db";
import {
  heldRowsAt,
  type ProjectRows,
  ProjectRowsSchema,
  projectRowsAt,
  type RowsPut,
} from "./db/forget";
import {
  migratedRows,
  RecordMigrationsSchema,
  recordSchema,
} from "./db/restore-schema";
import {
  folderCommitsCarrying,
  hasProjectFolder,
  PROJECT_TRASH_DIR,
  projectRoot,
  trashProjectFolder,
  untrashProjectFolder,
} from "./project-folder";
import { readStages } from "./stages";
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

/** What every forget's record holds, whichever version wrote it. */
const ForgottenSchema = z.object({
  kind: z.literal("forgotten"),
  id: z.string(),
  name: z.string(),
  /** ms since the epoch. */
  forgottenAt: z.number(),
  /** The presence id of the client that asked; null when none said. */
  by: z.string().nullable(),
  rows: ProjectRowsSchema,
  /** Its browsers; none in a record written before the forget kept them. */
  browsers: z.array(KeptBrowserSchema).default([]),
});

/** Why a row was held back (core forgotten-project.ts `RestoreHeldWhy`). */
const RestoreHeldWhySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("unread"), columns: z.array(z.string()) }),
  z.object({ kind: z.literal("shape"), column: z.string(), issue: z.string() }),
  z.object({ kind: z.literal("constraint"), detail: z.string() }),
  z.object({
    kind: z.literal("depends"),
    table: z.string(),
    title: z.string().nullable(),
    id: z.string().nullable(),
  }),
  z.object({ kind: z.literal("taken") }),
  z.object({ kind: z.literal("orphan"), parent: z.string().nullable() }),
  z.object({
    kind: z.literal("machine"),
    machineId: z.string(),
    hostname: z.string().nullable(),
  }),
  z.object({ kind: z.literal("table") }),
]);

/** One row held back, named, and why (core `RestoreHeldRow`). */
const RestoreHeldRowSchema: z.ZodType<RestoreHeldRow> = z.object({
  id: z.string().nullable(),
  table: z.string(),
  title: z.string().nullable(),
  why: RestoreHeldWhySchema,
});

/** What a forget writes beside the folder, a fold, or the rows a restore held back: the entry's own word on what it is. */
const EntryRecordSchema = z.discriminatedUnion("kind", [
  z.discriminatedUnion("version", [
    /** Written before a record named its schema: a restore places it by its columns (db restore-schema.ts). */
    ForgottenSchema.extend({ version: z.literal(1) }),
    ForgottenSchema.extend({
      version: z.literal(2),
      /** The migrations the database had applied as it was forgotten: its rows' schema. */
      migrations: RecordMigrationsSchema,
    }),
  ]),
  z.object({
    kind: z.literal("folded"),
    version: z.literal(1),
    id: z.string(),
    /** The project it was folded into. */
    into: z.string(),
    foldedAt: z.number(),
  }),
  z.object({
    kind: z.literal("held"),
    version: z.literal(1),
    id: z.string(),
    /** The project's name when its rows were held back. */
    name: z.string(),
    /** When it was forgotten, ms since the epoch: the entry's name says it too. */
    forgottenAt: z.number(),
    /** When the rows were last tried: the restore, or the latest try again. */
    heldAt: z.number(),
    /** The migrations the hub had applied as they were held back: `rows`' schema. */
    migrations: RecordMigrationsSchema,
    /** The rows held back, and the cut links naming them (db forget.ts `kept`). */
    rows: ProjectRowsSchema,
    /** Each row held back, named, and why, as the latest try said it. */
    held: z.array(RestoreHeldRowSchema).min(1),
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
/** Rows held back are written over their entry's record, which held them: read by the hub alone, as it is. */
const HELD_WRITE = { mode: 0o600 } as const;
/** The line every commit a fold made carries (tasks.ts `adopt`, project-merge.ts). */
const MERGE_LINE = `${TRAILERS.change}: ${CHANGES.merge}`;

const entryOf = (projectId: string, at: Date): string =>
  `${projectId}-${at.toISOString().replaceAll(":", "-")}`;

/** The machine the trash's folders are named on: the hub's own, as its places' rows name it (db `HUB_PLACE_MACHINE`). */
const TRASH_MACHINE = "hub";

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
const isProjectId = (id: string): boolean =>
  !(projectRoot(id) instanceof ElysiaStatus);

/** Every entry the trash holds, newest first; none when there is no trash. */
const entries = (): Promise<Entry[]> => entriesIn(PROJECT_TRASH_DIR);

/** Every entry the trash at `dir` holds, newest first. */
const entriesIn = async (dir: string): Promise<Entry[]> => {
  const names = await readdir(dir, { withFileTypes: true }).catch(
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

/**
 * The name a record holds when it does not read whole: its own `name`, read
 * alone. A record outlives the schema it was written to, and a field beside
 * the name that no longer reads takes nothing from the name it names.
 */
const RecordNameSchema = pipe(
  string(),
  parseJson(),
  object({ name: pipe(string(), trim(), minLength(1)) })
);

/** The name the record at `path` holds, read alone; null when not even its name reads. */
const nameAt = async (path: string): Promise<string | null> => {
  const read = safeParse(
    RecordNameSchema,
    await readFile(path, "utf8").catch(() => undefined)
  );
  return read.success ? read.output.name : null;
};

/** The name the entry's record holds, read alone; null when it has no record, or not even its name reads. */
const recordName = (entry: Entry): Promise<string | null> =>
  entry.record ? nameAt(recordPath(entry.entry)) : Promise.resolve(null);

/** How one trash entry names its project ({@link trashNaming}). */
export interface EntryNaming {
  entry: string;
  /** Whether it holds the project's folder. */
  folder: boolean;
  id: string;
  /** The name its record holds, read alone; null: it holds none. */
  name: string | null;
  /**
   * Its record's kind as it reads; `unread`: a record that does not read
   * whole; `none`: no record (a folder forgotten before the hub kept them,
   * or a fold of then).
   */
  record: "folded" | "forgotten" | "held" | "none" | "unread";
}

/**
 * How each entry of the trash at `dir` names its project, read as the list
 * reads it, newest first: a copy of a hub's trash is counted by it
 * (scripts/forgotten-names-places.ts).
 */
export const trashNaming = async (dir: string): Promise<EntryNaming[]> => {
  /** The kind of the record at `path` as it reads. */
  const kindAt = async (path: string): Promise<EntryNaming["record"]> => {
    try {
      return (await readRecord(path, EntryRecordSchema))?.kind ?? "none";
    } catch (error) {
      if (isDamagedRecord(error)) {
        return "unread";
      }
      throw error;
    }
  };
  const named: EntryNaming[] = [];
  for (const entry of await entriesIn(dir)) {
    const path = join(dir, `${entry.entry}${RECORD}`);
    named.push({
      entry: entry.entry,
      folder: entry.folder,
      id: entry.id,
      name: entry.record ? await nameAt(path) : null,
      record: entry.record ? await kindAt(path) : "none",
    });
  }
  return named;
};

/** How many task files the folder at `root` holds. */
const taskFiles = async (root: string): Promise<number> =>
  (await readdir(join(root, "tasks")).catch(() => [])).filter(
    (file) => fileTaskNumber(file) !== undefined
  ).length;

/** A trashed folder's task files, archived ones too: each one's number and title. */
const trashedTasks = async (
  entry: string
): Promise<{ number: number; title: string }[]> => {
  const root = join(PROJECT_TRASH_DIR, entry);
  const tasks: { number: number; title: string }[] = [];
  for (const dir of ["tasks", ARCHIVE_DIR]) {
    for (const file of await readdir(join(root, dir)).catch(() => [])) {
      const number = fileTaskNumber(file);
      if (number === undefined) {
        continue;
      }
      const content = await readFile(join(root, dir, file), "utf8").catch(
        () => undefined
      );
      if (content !== undefined) {
        tasks.push({
          number,
          title: new TaskDoc(`${dir}/${file}`, content).title(),
        });
      }
    }
  }
  return tasks;
};

/** The heading AGENTS.md's stub opens with (project-folder.ts), which names no project. */
const STUB_HEADING = "AGENTS.md";
/** A markdown heading's text, its closing hashes dropped. */
const HEADING = /^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;

/** The first heading of the folder's AGENTS.md but the stub's; null for none. */
const headingIn = async (root: string): Promise<string | null> => {
  const text = await readFile(join(root, "AGENTS.md"), "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const heading = HEADING.exec(line.trim())?.[1]?.trim();
    if (heading && heading !== STUB_HEADING) {
      return heading;
    }
  }
  return null;
};

/** The stage names the folder's stages.md reads to; none when it has none or it does not read. */
const stagesIn = async (root: string): Promise<string[]> => {
  const text = await readFile(join(root, "stages.md"), "utf8").catch(
    () => undefined
  );
  const reading = text === undefined ? undefined : readStages(text);
  return reading?.ok ? reading.stages.stages.map((stage) => stage.name) : [];
};

/** The folder's decision pages: each folder under decisions/ named as a page is. */
const pagesIn = async (root: string): Promise<string[]> =>
  (
    await readdir(join(root, "decisions"), { withFileTypes: true }).catch(
      () => []
    )
  )
    .filter((one) => one.isDirectory() && ARTIFACT_NAME.test(one.name))
    .map((one) => one.name)
    .sort();

/** When a file under `dir` last changed, git's own left out; null when it holds none. */
const changedIn = async (dir: string): Promise<number | null> => {
  let newest: number | null = null;
  for (const one of await readdir(dir, { withFileTypes: true }).catch(
    () => []
  )) {
    if (one.name === ".git") {
      continue;
    }
    const path = join(dir, one.name);
    let at: number | null = null;
    if (one.isDirectory()) {
      at = await changedIn(path);
    } else if (one.isFile()) {
      at = (await stat(path).catch(() => undefined))?.mtimeMs ?? null;
    }
    if (at !== null && (newest === null || at > newest)) {
      newest = at;
    }
  }
  return newest === null ? null : Math.floor(newest);
};

/** What a trashed folder with no record says about the project, read off its files. */
const hintsOf = async (
  entry: string,
  tasks: readonly { number: number; title: string }[]
): Promise<ForgottenFolderHints> => {
  const root = join(PROJECT_TRASH_DIR, entry);
  const newest = tasks.reduce<{ number: number; title: string } | null>(
    (best, one) => (best && best.number >= one.number ? best : one),
    null
  );
  return {
    changedAt: await changedIn(root),
    heading: await headingIn(root),
    newestTask: newest,
    pages: await pagesIn(root),
    stages: await stagesIn(root),
  };
};

/** A fold a live project's folder holds: the task files one merge commit wrote, by slug. */
interface Merge {
  id: string;
  name: string;
  slugs: string[];
}

/** Every fold the live projects' folders hold; the first folder's refusal. */
const mergesOf = async (projects: readonly { id: string; name: string }[]) => {
  const merges: Merge[] = [];
  for (const project of projects) {
    const has = await hasProjectFolder(project.id);
    if (has instanceof ElysiaStatus) {
      return has;
    }
    if (!has) {
      continue;
    }
    const commits = await folderCommitsCarrying(project.id, MERGE_LINE);
    if (commits instanceof ElysiaStatus) {
      return commits;
    }
    for (const commit of commits) {
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

/** Why a record's schema can't be placed (db restore-schema.ts), in words. */
const unplacedWords = (
  name: string,
  placed: Extract<ReturnType<typeof recordSchema>, { ok: false }>
): string => {
  switch (placed.why) {
    case "newer":
      return projectTrashWords.schemaNewer(name, placed.unknown.length);
    case "none":
      return projectTrashWords.schemaNone(name);
    case "several":
      return projectTrashWords.schemaSeveral(
        name,
        placed.tags.at(0) ?? "",
        placed.tags.at(-1) ?? ""
      );
    default:
      return unhandled("record's schema", placed);
  }
};

/** How many rows of each table a restore held back. */
const heldByTable = (
  held: readonly RestoreHeldRow[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const one of held) {
    counts[one.table] = (counts[one.table] ?? 0) + 1;
  }
  return counts;
};

/**
 * Project `id`'s newest trash entry (`forgottenAt`: the one forgotten then)
 * and its record; a record that does not read is refused in words
 * (restore-record-unreadable).
 */
const newestEntry = async (id: string, forgottenAt: number | undefined) => {
  const entry = (await entries()).find(
    (one) =>
      one.id === id && (forgottenAt === undefined || one.at === forgottenAt)
  );
  const record = entry
    ? await recordOf(entry).catch((error: unknown) => {
        if (isDamagedRecord(error)) {
          return problem(422, {
            code: "restore-record-unreadable",
            detail: projectTrashWords.unreadable(id, error.reason),
          });
        }
        throw error;
      })
    : undefined;
  return { entry, record };
};

/** A forget's record, whichever version wrote it. */
type ForgottenRecord = Extract<
  z.infer<typeof EntryRecordSchema>,
  { kind: "forgotten" }
>;

/**
 * Project `id`'s record's rows as today's schema holds them: placed at the
 * schema it was made at and brought through every migration since (db
 * restore-schema.ts), its cut links as it keeps them; or why not, in words.
 */
const migratedRecord = async (id: string, record: ForgottenRecord) => {
  const placed = recordSchema(
    record.rows,
    record.version === 2 ? record.migrations : undefined
  );
  if (!placed.ok) {
    return problem(422, {
      code: "restore-record-unreadable",
      detail: unplacedWords(record.name, placed),
    });
  }
  console.log(
    `${projectTrashWords.restoreLine(id)} its record's rows, at ${placed.found === "marked" ? "the schema it names" : `${placed.found.tag}, found by its columns`}, brought through the migrations since on a scratch database`
  );
  const migrated = await migratedRows(record.rows, placed.journal, (scratch) =>
    projectRowsAt(scratch, id)
  ).catch((error: unknown) =>
    problem(422, {
      code: "restore-record-unreadable",
      detail: projectTrashWords.migrationFailed(
        record.name,
        error instanceof Error ? error.message : String(error)
      ),
    })
  );
  if (migrated instanceof ElysiaStatus) {
    return migrated;
  }
  if (!migrated.ok) {
    return problem(422, {
      code: "restore-record-unreadable",
      detail: projectTrashWords.columnMissing(record.name, migrated.missing),
    });
  }
  return { tables: migrated.tables, unlinked: record.rows.unlinked };
};

/**
 * The entry's record once rows went back, from it or from its rows held
 * back: dropped when none is held back, else written over with the rows
 * held back alone (`kind: "held"`), each said in the log.
 */
const keepHeld = async (
  entry: string,
  of: { id: string; name: string; forgottenAt: number },
  put: Pick<RowsPut, "held" | "kept" | "migrations">
): Promise<void> => {
  if (put.held.length === 0) {
    await rm(recordPath(entry), { force: true });
    return;
  }
  writeStateFileSync(
    recordPath(entry),
    JSON.stringify({
      kind: "held",
      version: 1,
      id: of.id,
      name: of.name,
      forgottenAt: of.forgottenAt,
      heldAt: Date.now(),
      migrations: put.migrations,
      rows: put.kept,
      held: put.held,
    } satisfies EntryRecord),
    HELD_WRITE
  );
  for (const one of put.held) {
    console.log(
      `${projectTrashWords.restoreLine(of.id)} held back ${projectTrashWords.heldRow(one)}`
    );
  }
};

/** What a forgotten project held, as its record names it: what a delete for good removes of it. */
export interface TrashedProject {
  /** Its browsers, kept on their machines. */
  browsers: { key: string; machineId: string }[];
  /** The trash entries it has, newest first. */
  entries: string[];
  /** Its folders in the trash, absolute, newest first. */
  folders: string[];
  /** The name its newest record gives it; null when none does. */
  name: string | null;
  /** Its places as its records keep them. */
  places: { id: string; kind: string; machineId: string; path: string }[];
  /** The sessions its forgets unlinked. */
  sessions: string[];
}

/** One table's rows of a record as objects, by column name. */
const objectsIn = (rows: ProjectRows, table: string) => {
  const kept = rows.tables.find((one) => one.table === table);
  return (kept?.rows ?? []).map((row) =>
    Object.fromEntries(
      kept?.columns.map((column, at) => [column, row[at]]) ?? []
    )
  );
};

/**
 * What project `id` holds in the trash, every entry of it read (a record
 * that does not read names nothing); undefined when it has none.
 */
export const trashedProject = async (
  id: string
): Promise<TrashedProject | undefined> => {
  const mine = (await entries()).filter((one) => one.id === id);
  return mine.length === 0 ? undefined : await heldIn(mine);
};

/** What one project's trash entries hold, `mine` newest first. */
const heldIn = async (mine: readonly Entry[]): Promise<TrashedProject> => {
  const held: TrashedProject = {
    browsers: [],
    entries: mine.map((one) => one.entry),
    folders: mine
      .filter((one) => one.folder)
      .map((one) => join(PROJECT_TRASH_DIR, one.entry)),
    name: null,
    places: [],
    sessions: [],
  };
  for (const entry of mine) {
    const record = await recordOf(entry).catch(() => undefined);
    if (!(record?.kind === "forgotten" || record?.kind === "held")) {
      if (!record) {
        // A record that does not read still names its project.
        held.name ??= await recordName(entry);
      }
      continue;
    }
    held.name ??= record.name;
    if (record.kind === "forgotten") {
      held.browsers.push(...record.browsers);
    }
    held.sessions.push(
      ...record.rows.unlinked
        .filter((one) => one.table === "instances")
        .flatMap((one) => {
          const at = one.key.indexOf("id");
          return at < 0 ? [] : one.rows.map((row) => String(row[at]));
        })
    );
    for (const place of objectsIn(record.rows, "project_places")) {
      held.places.push({
        id: String(place.id),
        kind: String(place.kind),
        machineId: String(place.machine_id),
        path: String(place.path),
      });
    }
  }
  return held;
};

/** Every place of project `id` the hub records: its live ones, then those its trash records keep. */
export const recordedPlaces = (
  db: Pick<DbShape, "project">,
  id: string,
  trashed: TrashedProject | undefined
): { id: string; kind: string; machineId: string; path: string }[] => [
  ...(db.project(id)?.places ?? []),
  ...(trashed?.places ?? []),
];

/** A checkout on a machine's disk that a delete with `fromDisk` removes, read against the live projects there (core place-nesting.ts). */
export interface DiskPlace extends PlaceNesting {
  id: string;
  machineId: string;
  path: string;
}

/**
 * The checkouts a delete of project `id` with `fromDisk` removes
 * (project-delete.ts): its own live ones and those its trash records keep,
 * each machine and path once, on machines still in the fleet (one removed
 * from it holds nothing CawCo can reach), each read against the other live
 * projects' checkouts: the one that refuses it, and those whose wider
 * folder holds it. The list of forgotten projects names the same, and a
 * live project's places carry the same reading (project-out.ts `createProjectOut`).
 */
export const diskPlaces = (
  db: Pick<DbShape, "machineFacts" | "listProjects" | "project">,
  id: string,
  trashed: TrashedProject | undefined
): DiskPlace[] => {
  const joined = new Set(db.machineFacts().map((agent) => agent.machineId));
  const live = db.listProjects();
  return [
    ...new Map(
      recordedPlaces(db, id, trashed)
        .filter((place) => place.kind === "checkout")
        .map((place) => [`${place.machineId}\0${place.path}`, place])
    ).values(),
  ]
    .filter((place) => joined.has(place.machineId))
    .map(({ id: placeId, machineId, path }) => ({
      id: placeId,
      machineId,
      path,
      ...placeNesting(id, { machineId, path }, live),
    }));
};

/** Every entry of project `id` in the trash gone for good, its folder and its record, rows a restore held back with them: how many entries. */
export const purgeTrash = async (id: string): Promise<number> => {
  const mine = (await entries()).filter((one) => one.id === id);
  for (const entry of mine) {
    await rm(join(PROJECT_TRASH_DIR, entry.entry), {
      recursive: true,
      force: true,
    });
    await rm(recordPath(entry.entry), { force: true });
  }
  return mine.length;
};

/**
 * A folded duplicate's folder set aside (project-merge.ts), with a record
 * that says it was folded into `into`, so it is never listed as forgotten.
 * Answers where the folder went, or the folder's refusal of the move.
 */
export const trashFoldedFolder = async (id: string, into: string) => {
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

export const projectTrash = (
  db: Pick<
    DbShape,
    | "browsers"
    | "createProject"
    | "forgetProject"
    | "machineFacts"
    | "listProjects"
    | "namedMachines"
    | "project"
    | "restoreProject"
    | "retryHeldRows"
  >
) => {
  /** The live project holding `id`, refused in words (restore-id-taken). */
  const liveHolds = (id: string) => {
    const live = db.project(id);
    return live
      ? problem(409, {
          code: "restore-id-taken",
          detail: projectTrashWords.idTaken(live.name, id),
        })
      : undefined;
  };
  /** A folder standing where the entry's goes back to, refused in words (restore-folder-taken), or the folder's refusal of the id. */
  const folderHolds = async (entry: Entry, name: string) => {
    const root = projectRoot(entry.id);
    if (root instanceof ElysiaStatus) {
      return root;
    }
    if (entry.folder && (await stat(root).catch(() => undefined))) {
      return problem(409, {
        code: "restore-folder-taken",
        detail: projectTrashWords.folderTaken(name, root),
      });
    }
  };
  /** The entry's folder moved out to the trash again, when it has one; the folder's refusal of the move. */
  const putBack = async (entry: Entry) => {
    if (!entry.folder) {
      return;
    }
    const out = await trashProjectFolder(entry.id, entry.entry);
    return out instanceof ElysiaStatus ? out : undefined;
  };
  /** Moves the entry's folder back, runs `put`, and moves it out again when `put` refuses or throws; a refused move's refusal first. */
  const withFolder = async <T>(entry: Entry, put: () => T) => {
    const back = await untrashProjectFolder(
      entry.id,
      entry.folder ? entry.entry : null
    );
    if (back instanceof ElysiaStatus) {
      return back;
    }
    let done: T;
    try {
      done = put();
    } catch (error) {
      const out = await putBack(entry);
      if (out) {
        return out;
      }
      throw error;
    }
    if (done instanceof ElysiaStatus) {
      return (await putBack(entry)) ?? done;
    }
    return done;
  };
  /**
   * The entry's record brought back: its rows through every migration since
   * (db restore-schema.ts), put back as today's schema holds them, the rows
   * held back named; refused in words, each cause its own code.
   */
  const restoreRecord = async (
    id: string,
    entry: Entry,
    record: ForgottenRecord
  ) => {
    const held = liveHolds(id) ?? (await folderHolds(entry, record.name));
    if (held) {
      return held;
    }
    const rows = await migratedRecord(id, record);
    if (rows instanceof ElysiaStatus) {
      return rows;
    }
    const restored = await withFolder(entry, () => {
      const done = db.restoreProject(id, rows);
      return done.ok ? done : notRestored(id, record.name, done);
    });
    if (restored instanceof ElysiaStatus) {
      return restored;
    }
    await keepHeld(entry.entry, record, restored);
    const left = heldByTable(restored.held);
    // Its browsers were never moved: each its machine still keeps is its
    // own again, its profile where it was; one removed since is gone.
    const browsers = stillKept(record.browsers);
    if (browsers < record.browsers.length) {
      left.browsers = record.browsers.length - browsers;
    }
    const back: ProjectRestored = {
      id,
      name: record.name,
      brought: bringsOf(
        (table) => restored.back[table] ?? 0,
        { browsers, sessions: restored.relinked.instances ?? 0 },
        db.project(id)?.account ?? null,
        entry.folder,
        Object.values(restored.back).reduce((sum, n) => sum + n, 0)
      ),
      held: restored.held,
      left,
    };
    return back;
  };
  /** Why the database put none of the record's rows back, in words, each cause its own code. */
  const notRestored = (
    id: string,
    name: string,
    done: Extract<ReturnType<DbShape["restoreProject"]>, { ok: false }>
  ) => {
    switch (done.why) {
      case "live":
        return problem(409, {
          code: "restore-id-taken",
          detail: projectTrashWords.idTaken(db.project(id)?.name ?? id, id),
        });
      case "place":
        return problem(409, {
          code: "restore-place-taken",
          detail: projectTrashWords.placeTaken(
            name,
            done.holder.name,
            done.path
          ),
        });
      case "own":
        return problem(422, {
          code: "restore-record-unreadable",
          detail: projectTrashWords.ownHeld(
            name,
            projectTrashWords.heldWhy(done.held.why)
          ),
        });
      default:
        return unhandled("restore's outcome", done);
    }
  };
  /** The record's browsers its machines still keep: one the person removed since is gone with its profile. */
  const stillKept = (browsers: readonly KeptBrowser[]): number =>
    browsers.filter(
      (one) => isBrowserKey(one.key) && db.browsers.get(one.machineId, one.key)
    ).length;
  /** The folds the live projects hold, read once per call and only when asked. */
  const mergesOnce = () => {
    let read: ReturnType<typeof mergesOf> | undefined;
    return () => {
      read ??= mergesOf(db.listProjects());
      return read;
    };
  };
  /** What a folder with no record brings, and the project it was folded into when every task of it lives there; a live folder's refusal. */
  const folderAlone = async (
    entry: Entry,
    merges: () => ReturnType<typeof mergesOf>
  ) => {
    const tasks = await trashedTasks(entry.entry);
    const slugs = tasks.map((one) => taskSlug(one.title));
    const folds = slugs.length > 0 ? await merges() : [];
    if (folds instanceof ElysiaStatus) {
      return folds;
    }
    const fold = slugs.length > 0 ? foldOf(slugs, folds) : undefined;
    return {
      tasks,
      brings: folderBrings(
        await taskFiles(join(PROJECT_TRASH_DIR, entry.entry)),
        fold ? { ...fold.into, tasks: fold.tasks } : null
      ),
      foldedInto: fold?.whole ? fold.into : undefined,
    };
  };

  /**
   * An entry with no record that reads, listed by what its folder alone
   * holds, under the name its record still holds; none for one with no
   * folder, or a fold's folder, which is none a person forgot.
   */
  const folderListed = async (
    entry: Entry,
    merges: () => ReturnType<typeof mergesOf>
  ) => {
    const alone = entry.folder ? await folderAlone(entry, merges) : undefined;
    if (alone instanceof ElysiaStatus) {
      return alone;
    }
    if (!alone || alone.foldedInto) {
      return;
    }
    const name = await recordName(entry);
    const listed: Omit<ForgottenProject, "places"> = {
      id: entry.id,
      name,
      forgottenAt: entry.at,
      by: null,
      brings: alone.brings,
      hints: name === null ? await hintsOf(entry.entry, alone.tasks) : null,
    };
    return listed;
  };

  /** A folder with no record brought back under a new row named `name`, unless it was a fold; refused in words. */
  const restoreFolder = async (entry: Entry, asked: { name?: string }) => {
    const { id } = entry;
    const alone = await folderAlone(entry, mergesOnce());
    if (alone instanceof ElysiaStatus) {
      return alone;
    }
    if (alone.foldedInto) {
      return problem(409, {
        code: "restore-folded",
        detail: projectTrashWords.foldedInto(id, alone.foldedInto.name),
      });
    }
    const name = asked.name?.trim();
    if (!name) {
      return problem(400, {
        code: "restore-name-needed",
        detail: projectTrashWords.nameNeeded(id),
      });
    }
    const held = liveHolds(id) ?? (await folderHolds(entry, name));
    if (held) {
      return held;
    }
    const made = await withFolder(entry, () =>
      db.createProject({ id, name, remote: null })
    );
    if (made instanceof ElysiaStatus) {
      return made;
    }
    const root = projectRoot(id);
    if (root instanceof ElysiaStatus) {
      return root;
    }
    const restored: ProjectRestored = {
      id,
      name,
      // Its one place: its folder on the hub, which a new row makes.
      brought: {
        ...folderBrings(await taskFiles(root), null),
        places: 1,
      },
      held: [],
      left: {},
    };
    return restored;
  };

  /** A machine by the name the hub holds for it now, else its id. */
  const nameOf = (
    machineId: string,
    fleet: ReturnType<typeof db.namedMachines>
  ): string =>
    fleet.some((one) => one.machineId === machineId)
      ? machineCalled(machineId, fleet)
      : machineId;
  /**
   * Every place deleting project `id` with its files removes, read as the
   * delete reads them (project-delete.ts): its folders in the trash, then
   * {@link diskPlaces}.
   */
  const placesOf = (
    id: string,
    held: TrashedProject,
    fleet: ReturnType<typeof db.namedMachines>
  ): ForgottenPlace[] => [
    ...held.folders.map((path): ForgottenPlace => ({
      kind: "hub",
      machineId: TRASH_MACHINE,
      machineName: TRASH_MACHINE,
      path,
      within: [],
    })),
    ...diskPlaces(db, id, held).map(
      ({ machineId, path, within }): ForgottenPlace => ({
        kind: "checkout",
        machineId,
        machineName: nameOf(machineId, fleet),
        path,
        within,
      })
    ),
  ];

  /** Every forgotten project of the trash's entries, but folds; a live folder's refusal. */
  const listed = async () => {
    const out: ForgottenProject[] = [];
    const merges = mergesOnce();
    const all = await entries();
    const fleet = db.namedMachines();
    const places = new Map<string, ForgottenPlace[]>();
    /** Project `id`'s places, read once per call: every entry of it is deleted together. */
    const placesFor = async (id: string): Promise<ForgottenPlace[]> => {
      const kept = places.get(id);
      if (kept) {
        return kept;
      }
      const read = placesOf(
        id,
        await heldIn(all.filter((one) => one.id === id)),
        fleet
      );
      places.set(id, read);
      return read;
    };
    for (const entry of all) {
      const record = await recordOf(entry).catch((error: unknown) => {
        if (isDamagedRecord(error)) {
          console.warn(`[hub] forgotten project ${entry.id}: ${error.message}`);
          return;
        }
        throw error;
      });
      if (record?.kind === "folded" || record?.kind === "held") {
        continue;
      }
      if (record) {
        const rows = rowsIn(record.rows);
        out.push({
          id: record.id,
          name: record.name,
          forgottenAt: record.forgottenAt,
          by: record.by,
          hints: null,
          places: await placesFor(entry.id),
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
      const folder = await folderListed(entry, merges);
      if (folder instanceof ElysiaStatus) {
        return folder;
      }
      if (folder) {
        out.push({ ...folder, places: await placesFor(entry.id) });
      }
    }
    return out;
  };

  return {
    /**
     * Forgets project `id`: its record written to the trash, its rows deleted,
     * its folder moved beside the record. `by` is the presence id of the
     * client that asked. Its browsers were stopped first (browsers.ts
     * `forgetProject`); the record names them. Undefined: there is no such
     * project.
     */
    forget: async (
      id: string,
      by: string | null
    ): Promise<Forgot | undefined> => {
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
      makeFolderSync(PROJECT_TRASH_DIR);
      let rows: ProjectRows | undefined;
      try {
        rows = db.forgetProject(id, (kept, migrations) =>
          writeStateFileSync(
            path,
            JSON.stringify({
              kind: "forgotten",
              version: 2,
              migrations,
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
      const notMoved = (why: string): undefined => {
        console.warn(
          `[hub] project ${id}'s folder was not moved to the trash: ${why}`
        );
      };
      const moved = await trashProjectFolder(id, entry).catch(
        (error: unknown): undefined =>
          notMoved(error instanceof Error ? error.message : String(error))
      );
      const folder =
        moved instanceof ElysiaStatus ? notMoved(moved.response.detail) : moved;
      return {
        browsers: browsers.length,
        entry,
        folder,
        name: project.name,
        rows: rows.tables.reduce((sum, one) => sum + one.rows.length, 0),
        sessions: sessionsIn(rows),
      };
    },

    /** Every forgotten project the trash can bring back, newest first. */
    forgotten: listed,

    /**
     * Brings project `id` back from its newest entry (`forgottenAt`: the one
     * forgotten then); `name` names one forgotten before the hub kept its
     * name. Refused in the hub's words, each cause its own code.
     */
    restore: async (
      id: string,
      asked: { forgottenAt?: number; name?: string }
    ) => {
      const { entry, record } = await newestEntry(id, asked.forgottenAt);
      if (record instanceof ElysiaStatus) {
        return record;
      }
      if (!(entry && (record || entry.folder))) {
        return problem(404, {
          code: "restore-not-forgotten",
          detail: projectTrashWords.notForgotten(id),
        });
      }
      if (record?.kind === "folded") {
        return problem(409, {
          code: "restore-folded",
          detail: projectTrashWords.foldedInto(
            id,
            db.project(record.into)?.name ?? record.into
          ),
        });
      }
      // Rows held back are no forgotten project: tried again, never brought back.
      if (record?.kind === "held") {
        return problem(404, {
          code: "restore-not-forgotten",
          detail: projectTrashWords.heldNotForgotten(
            db.project(id)?.name ?? record.name,
            record.held.length
          ),
        });
      }
      if (!record) {
        return await restoreFolder(entry, asked);
      }
      return await restoreRecord(id, entry, record);
    },

    /** Every entry of rows a restore held back, newest first, each under its project (core `HeldRows`). */
    held: async (): Promise<HeldRows[]> => {
      const out: HeldRows[] = [];
      for (const entry of await entries()) {
        const record = entry.record
          ? await recordOf(entry).catch((error: unknown) => {
              if (isDamagedRecord(error)) {
                console.warn(
                  `[hub] rows held back of project ${entry.id}: ${error.message}`
                );
                return;
              }
              throw error;
            })
          : undefined;
        if (record?.kind !== "held") {
          continue;
        }
        const live = db.project(record.id);
        out.push({
          id: record.id,
          name: live?.name ?? record.name,
          live: live !== undefined,
          forgottenAt: record.forgottenAt,
          heldAt: record.heldAt,
          rows: record.held,
        });
      }
      return out;
    },

    /**
     * Puts the rows a restore of project `id` held back (its entry forgotten
     * at `forgottenAt`) back into it, as its restore put the rest: through
     * every migration since they were held back, then checked and held back
     * again as a restore's are. The entry is written over with what is still
     * held back, or dropped once none is. Refused in words while the project
     * is not live, or the entry is gone or does not read.
     */
    retry: async (id: string, { forgottenAt }: { forgottenAt: number }) => {
      const found = await heldEntry(id, forgottenAt);
      if (found instanceof ElysiaStatus) {
        return found;
      }
      const { entry, record } = found;
      const live = db.project(id);
      if (!live) {
        return problem(409, {
          code: "held-project-forgotten",
          detail: projectTrashWords.heldProjectForgotten(record.name),
        });
      }
      const placed = recordSchema(record.rows, record.migrations);
      if (!placed.ok) {
        return problem(422, {
          code: "held-rows-unreadable",
          detail: unplacedWords(live.name, placed),
        });
      }
      const migrated = await migratedRows(
        record.rows,
        placed.journal,
        (scratch) => heldRowsAt(scratch, record.rows)
      ).catch((error: unknown) =>
        problem(422, {
          code: "held-rows-unreadable",
          detail: projectTrashWords.migrationFailed(
            live.name,
            error instanceof Error ? error.message : String(error)
          ),
        })
      );
      if (migrated instanceof ElysiaStatus) {
        return migrated;
      }
      if (!migrated.ok) {
        return problem(422, {
          code: "held-rows-unreadable",
          detail: projectTrashWords.columnMissing(live.name, migrated.missing),
        });
      }
      const done = db.retryHeldRows(id, {
        tables: migrated.tables,
        unlinked: record.rows.unlinked,
      });
      if (!done.ok) {
        return problem(409, {
          code: "held-project-forgotten",
          detail: projectTrashWords.heldProjectForgotten(record.name),
        });
      }
      await keepHeld(entry.entry, { ...record, name: live.name }, done);
      const retried: HeldRetried = {
        id,
        name: live.name,
        back: Object.values(done.back).reduce((sum, n) => sum + n, 0),
        held: done.held,
      };
      return retried;
    },

    /** The rows a restore of project `id` held back (its entry forgotten at `forgottenAt`) deleted for good; refused in words when there is no such entry. */
    discardHeld: async (
      id: string,
      { forgottenAt }: { forgottenAt: number }
    ) => {
      const found = await heldEntry(id, forgottenAt);
      if (found instanceof ElysiaStatus) {
        return found;
      }
      await rm(recordPath(found.entry.entry), { force: true });
      return {
        name: db.project(id)?.name ?? found.record.name,
        rows: found.record.held.length,
      };
    },
  };
};

/** Project `id`'s entry forgotten at `forgottenAt` when it holds rows a restore held back; refused in words when there is none, or its record does not read. */
const heldEntry = async (id: string, forgottenAt: number) => {
  const { entry, record } = await newestEntry(id, forgottenAt);
  if (record instanceof ElysiaStatus) {
    return record;
  }
  if (!(entry && record?.kind === "held")) {
    return problem(404, {
      code: "held-rows-none",
      detail: projectTrashWords.heldNone(id),
    });
  }
  return { entry, record };
};

export type ProjectTrash = ReturnType<typeof projectTrash>;
