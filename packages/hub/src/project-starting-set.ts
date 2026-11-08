/**
 * A project's starting set (core `StartingSet`, tsk-329 story 4): the skills
 * and MCP servers a session in the project starts with when its delegate
 * type names none (starting-set.ts `sessionStartingSet`). Files are the
 * truth (Projects spec §2): `starting-set.md` in the project's hub folder,
 * beside `gate.md` and `decides.md`.
 *
 * ```
 * ---
 * skills: [grill, "mattpocock-skills:tdd"]
 * servers: [exa]
 * ---
 * Anything after the block is notes for people; the hub reads none of it.
 * ```
 *
 * No file: no set, and its sessions start with everything installed. Every
 * write of it, `project_settings`' and a session's `folder_write` alike,
 * passes {@link startingSetFileProblems} first (server.ts guards it). One
 * that does not read (a commit pushed from outside CawCo) is taken for no
 * set, as before any set, and said wherever the set is read.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type StartingSet,
  startingSetProblem,
} from "@cawco/core/delegate-types";
import { type FrontMatterLine, frontMatterBlock } from "@cawco/core/fleet";
import {
  deleteFolderFile,
  projectRoot,
  writeFolderFile,
} from "./project-folder";
import { listOf, renderList } from "./task-file";

/** The file in a project's folder that names its starting set. */
export const STARTING_SET_FILE = "starting-set.md";

const FIELDS = ["skills", "servers"] as const;

/** A starting-set file's set, or what keeps it from reading. */
export type StartingSetReading =
  { ok: true; set: StartingSet } | { ok: false; problems: string[] };

/** Each name once, trimmed, in the order written. */
const names = (list: readonly string[]): string[] => [
  ...new Set(list.map((name) => name.trim())),
];

/**
 * A starting set from the front matter lines that name it: `skills` and
 * `servers`, each a list, either left out for none. `where` names what holds
 * them in a refusal (this file, or a type file's `starting_set`). What a
 * project's file and a project delegate type's `starting_set` both read
 * (project-delegate-types.ts).
 */
export const startingSetOfLines = (
  lines: readonly FrontMatterLine[],
  where: string
): StartingSetReading => {
  const problems: string[] = [];
  const set: StartingSet = { skills: [], servers: [] };
  for (const line of lines) {
    if (line.key === undefined) {
      continue;
    }
    if (!(FIELDS as readonly string[]).includes(line.key)) {
      problems.push(
        `“${line.key}” is not a field of ${where}: it reads skills and servers.`
      );
      continue;
    }
    const list = listOf(line);
    if (!list) {
      problems.push(`${line.key} is a list, like [a, b].`);
      continue;
    }
    set[line.key as (typeof FIELDS)[number]] = names(list);
  }
  const blank = startingSetProblem(set);
  return problems.length > 0 || blank
    ? { ok: false, problems: [...problems, ...(blank ? [`${blank}.`] : [])] }
    : { ok: true, set };
};

/** `content` read as a starting-set file. */
const readStartingSetFile = (content: string): StartingSetReading => {
  const block = frontMatterBlock(content);
  if (!block) {
    return {
      ok: false,
      problems: [
        `${STARTING_SET_FILE} opens with a --- block naming skills and servers.`,
      ],
    };
  }
  return startingSetOfLines(block.lines, STARTING_SET_FILE);
};

/** Why `content` would not read as a starting-set file: the folder's write guard. */
export const startingSetFileProblems = (content: string): string[] => {
  const read = readStartingSetFile(content);
  return read.ok ? [] : read.problems;
};

/** `set` as its file writes it, keeping the notes after the block of the file it replaces. */
const startingSetFileOf = (set: StartingSet, previous?: string): string => {
  const notes = previous === undefined ? "" : frontMatterBlock(previous)?.body;
  return `---\nskills: ${renderList(set.skills)}\nservers: ${renderList(set.servers)}\n---\n${
    notes ||
    "The skills and MCP servers this project's sessions start with, besides CawCo's own.\n"
  }`;
};

/** A project's starting-set file as it stands: its text, its set, or what keeps it from reading. */
export interface ProjectStartingSet {
  /** Its problems when it does not read: its sessions then start with everything. */
  problems?: string[];
  /** Its set; absent with no file, or one that does not read. */
  set?: StartingSet;
  /** The file's text; absent with no file. */
  text?: string;
}

/**
 * The project's starting set, read from its folder now. Synchronous (one
 * small file), so a session's start resolves it in the step that opens its
 * row, as a project's delegate types are read (project-delegate-types.ts).
 */
export const projectStartingSet = (projectId: string): ProjectStartingSet => {
  let text: string;
  try {
    text = readFileSync(
      join(projectRoot(projectId), STARTING_SET_FILE),
      "utf8"
    );
  } catch {
    return {};
  }
  const read = readStartingSetFile(text);
  return read.ok ? { text, set: read.set } : { text, problems: read.problems };
};

/**
 * Writes the project's starting-set file with `set`, as one commit by
 * `author`, its notes kept; null deletes it, so its sessions start with
 * everything. What `project_settings`' `set_starting_set` applies.
 */
export const writeProjectStartingSet = async (
  projectId: string,
  set: StartingSet | null,
  author: string
): Promise<void> => {
  const { text } = projectStartingSet(projectId);
  const message = set
    ? `Set the starting set: ${set.skills.length} skills, ${set.servers.length} servers`
    : "Remove the starting set";
  if (set) {
    await writeFolderFile(
      projectId,
      STARTING_SET_FILE,
      startingSetFileOf(set, text),
      { author: { name: author }, message }
    );
  } else if (text !== undefined) {
    await deleteFolderFile(projectId, STARTING_SET_FILE, {
      author: { name: author },
      message,
    });
  }
};
