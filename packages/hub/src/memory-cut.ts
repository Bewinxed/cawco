/**
 * The cut of 2026-11-26 in each project's folder (Projects spec §5.4): a
 * project's memory is its rules file alone, so what the inbox and the
 * nightly memory run kept goes, once, as the hub starts (`data_migrations`):
 *
 * - everything under `memory/`: the inbox, its archive, `state.json`, the
 *   old ledger, and `proposals/`, where an open delegate type proposal moves
 *   to `proposals/` (type-proposals.ts `PROPOSALS_DIR`) and one that changes
 *   anything else is dropped;
 * - the task file of each memory curator routine (`target: curator`), on the
 *   board or archived. Its trigger and runs went with migration 0497.
 *
 * - AGENTS.md's intro, where it still says the nightly run keeps it, said
 *   as it is now (core project-rules.ts `indexIntro`).
 *
 * One commit per project by the hub, made in one turn of the folder's
 * commit queue (project-folder.ts `changeFolderInTurn`), AGENTS.md read
 * inside it. `knowledge/` and `lessons/` stay where they are. A project whose folder can't be read or written is said in the
 * log and leaves the pass unmarked, to run again at the next start.
 */
import { projectRulesWords } from "@cawco/core/words/project-rules";
import { ElysiaStatus } from "elysia";
import { ProposalSchema } from "./db/stored-shapes";
import { INDEX_FILE } from "./memory-lessons";
import {
  changeFolderInTurn,
  type folderFileNames,
  type listFolder,
  type readFolderFile,
} from "./project-folder";
import type { AnyProblem, ProblemsOf } from "./refusal";
import { hubActor } from "./tasks";
import { PROPOSALS_DIR } from "./type-proposals";

/** The pass's name in `data_migrations`. */
const MEMORY_CUT = "memory_cut";
const MEMORY_DIR = "memory";
const OLD_PROPOSALS = `${MEMORY_DIR}/proposals`;
/** Where a project's task files are, on the board and archived (task-file.ts). */
const TASK_DIRS = ["tasks", "tasks/archive"] as const;
/** A front matter block on top of a file. */
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---/u;
/** A routine's `target:` naming the memory curator. */
const CURATOR_TARGET = /^target:\s*["']?curator["']?\s*$/mu;

type Refused =
  | ProblemsOf<ReturnType<typeof listFolder>>
  | ProblemsOf<ReturnType<typeof folderFileNames>>
  | ProblemsOf<ReturnType<typeof readFolderFile>>
  | AnyProblem;

export interface MemoryCutDeps {
  /** Puts a project's task index back in step with its files (tasks.ts `catchUp`). */
  readonly catchUp: (projectId: string) => Promise<unknown>;
  readonly dataMigrated: (name: string) => boolean;
  /** The entries directly under `dir`, each a file or a folder (project-folder.ts `listFolder`). */
  readonly entries: (
    projectId: string,
    dir: string
  ) => Promise<{ kind: string; path: string }[] | Refused>;
  /** Whether a project has a folder; reading one that does not makes it. */
  readonly hasFolder: (projectId: string) => Promise<boolean | Refused>;
  readonly markDataMigrated: (name: string) => void;
  /** Every name in `dir`, uncapped; none when it isn't there (project-folder.ts `folderFileNames`). */
  readonly names: (
    projectId: string,
    dir: string
  ) => Promise<string[] | Refused>;
  readonly projectIds: () => string[];
  /** A file of a project's folder; undefined when it isn't there. */
  readonly read: (
    projectId: string,
    path: string
  ) => Promise<string | undefined | Refused>;
  /** The project's folder changed under its tasks. */
  readonly touched: (projectId: string) => void;
}

const isRefused = (value: unknown): value is Refused =>
  value instanceof ElysiaStatus;

/** Every file under `memory/`: its own files, and each of its folders' (the inbox, the archive, proposals). */
const memoryFiles = async (deps: MemoryCutDeps, projectId: string) => {
  const top = await deps.entries(projectId, MEMORY_DIR);
  if (isRefused(top)) {
    return top;
  }
  const files: string[] = [];
  for (const entry of top) {
    if (entry.kind === "file") {
      files.push(entry.path);
      continue;
    }
    const names = await deps.names(projectId, entry.path);
    if (isRefused(names)) {
      return names;
    }
    files.push(...names.map((name) => `${entry.path}/${name}`));
  }
  return files;
};

/** An old proposal's file as a delegate type proposal keeps it now (the notes it cited left out), when it reads as one and every file it changes is a delegate type; undefined otherwise. */
const typeProposalOf = (text: string): string | undefined => {
  let read: ReturnType<typeof ProposalSchema.safeParse>;
  try {
    read = ProposalSchema.safeParse(JSON.parse(text));
  } catch {
    return;
  }
  const typesOnly =
    read.success &&
    read.data.files.length > 0 &&
    read.data.files.every((file) => file.path.startsWith("delegates/"));
  return typesOnly ? `${JSON.stringify(read.data, null, 2)}\n` : undefined;
};

/** The memory curator routines' task files, on the board and archived. */
const curatorTasks = async (deps: MemoryCutDeps, projectId: string) => {
  const found: string[] = [];
  for (const dir of TASK_DIRS) {
    const names = await deps.names(projectId, dir);
    if (isRefused(names)) {
      return names;
    }
    for (const name of names.filter((each) => each.endsWith(".md"))) {
      const path = `${dir}/${name}`;
      const text = await deps.read(projectId, path);
      if (isRefused(text)) {
        return text;
      }
      const front = text === undefined ? undefined : FRONT.exec(text)?.[1];
      if (front !== undefined && CURATOR_TARGET.test(front)) {
        found.push(path);
      }
    }
  }
  return found;
};

/** The intros the hub wrote under AGENTS.md's title before the cut, which named the nightly run or the approval cards. */
const OLD_INTROS: ReadonlySet<string> = new Set([
  "Kept by CawCo's nightly memory run from what you tell agents. Your own notes are under Notes and are never changed.",
  "Owned by you; agents propose changes.",
]);

/** AGENTS.md with an intro the hub wrote before the cut said as it is now; undefined when it holds none. */
const withIntro = (index: string): string | undefined => {
  const lines = index.split("\n");
  const at = lines.findIndex((line) => OLD_INTROS.has(line.trim()));
  if (at < 0) {
    return;
  }
  lines[at] = projectRulesWords.indexIntro;
  return lines.join("\n");
};

/** One project's cut, in one commit by the hub; the folder's refusal of a read or of the commit. */
const cutIn = async (deps: MemoryCutDeps, projectId: string) => {
  const has = await deps.hasFolder(projectId);
  if (has !== true) {
    return has === false ? undefined : has;
  }
  const memory = await memoryFiles(deps, projectId);
  if (isRefused(memory)) {
    return memory;
  }
  const routines = await curatorTasks(deps, projectId);
  if (isRefused(routines)) {
    return routines;
  }
  const writes: { content: string; path: string }[] = [];
  for (const path of memory.filter((each) =>
    each.startsWith(`${OLD_PROPOSALS}/`)
  )) {
    const text = await deps.read(projectId, path);
    if (isRefused(text)) {
      return text;
    }
    const kept = text === undefined ? undefined : typeProposalOf(text);
    if (kept !== undefined) {
      writes.push({
        path: `${PROPOSALS_DIR}/${path.slice(OLD_PROPOSALS.length + 1)}`,
        content: kept,
      });
    }
  }
  const deletes = [...memory, ...routines];
  const done = await changeFolderInTurn(projectId, async () => {
    const index = await deps.read(projectId, INDEX_FILE);
    if (isRefused(index)) {
      return index;
    }
    const intro = index === undefined ? undefined : withIntro(index);
    const all =
      intro === undefined
        ? writes
        : [...writes, { path: INDEX_FILE, content: intro }];
    return all.length + deletes.length === 0
      ? { value: undefined }
      : {
          change: {
            writes: all,
            deletes,
            author: hubActor("memory cut").author,
            message: `memory: the inbox, the nightly run's records and its routine leave; AGENTS.md is the project's rules (${memory.length} file(s) under memory/, ${routines.length} routine task(s), ${writes.length} delegate type proposal(s) moved to ${PROPOSALS_DIR}/${intro === undefined ? "" : ", AGENTS.md's intro says who keeps it now"})`,
          },
          value: undefined,
        };
  });
  if (isRefused(done)) {
    return done;
  }
  if (!done.commits) {
    return;
  }
  await deps.catchUp(projectId);
  deps.touched(projectId);
  console.info(
    `[memory] project ${projectId}: memory/ and ${routines.length} curator routine task(s) removed`
  );
};

/**
 * Runs the cut once over every project's folder, then marks it done; a
 * project that failed leaves it unmarked, to run again at the next start.
 */
export const cutProjectMemory = async (deps: MemoryCutDeps): Promise<void> => {
  if (deps.dataMigrated(MEMORY_CUT)) {
    return;
  }
  let whole = true;
  for (const projectId of deps.projectIds()) {
    try {
      const refused = await cutIn(deps, projectId);
      if (refused) {
        whole = false;
        console.warn(
          `[memory] project ${projectId}'s memory/ was not cut: ${refused.response.detail}`
        );
      }
    } catch (error) {
      whole = false;
      console.warn(
        `[memory] project ${projectId}'s memory/ was not cut: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (whole) {
    deps.markDataMigrated(MEMORY_CUT);
  }
};
