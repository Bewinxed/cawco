/**
 * A project's memory (Projects spec §5.4, the memory build of 2026-11-19):
 * what the person tells agents, and what agents learn, reaches later
 * sessions of the project with nothing waiting for him.
 *
 * - **Files**, in the project's folder (project-folder.ts), every change a
 *   commit with an author: the index, `AGENTS.md`, loaded into every
 *   session of the project at its launch (`indexOf`, launches.ts
 *   `grantLaunch`); a skill's lessons, `lessons/<skill>.md`, which the
 *   index points to; knowledge, `knowledge/<topic>.md`, which an attempt's
 *   brief carries by the task's words (`contextFor`); the inbox,
 *   `memory/inbox/` (one file per agent's note) and its archive. The line
 *   format, the ledger and the caps are memory-lessons.ts's. No agent writes
 *   any of them with `folder_write` ({@link personsTier}).
 * - **Writers**: the nightly memory run (memory-run.ts), the one writer of
 *   the index's rules, skills' lessons and knowledge, through `memory_apply`
 *   and checks of its own; the person's Make a note (`makeNote`), into the
 *   index's `## Notes`, which the run never changes; a session's note
 *   (`note`), into the inbox.
 * - **Notes** (`memory_note`, and `cawco tool memory_note`): an agent's
 *   words into the inbox, with who wrote them, in what role and kind of
 *   session, for which task and when. Their labels are the hub's word,
 *   never the caller's ({@link TurnWatch}, kept in the database): a
 *   routine's run, a heartbeat (a turn the hub did not deliver, a
 *   keep-alive's), a harness subagent still running, or a session that read
 *   the web. A label decides only whether a note counts toward the run's
 *   two-session rule (memory-sources.ts `countsTogether`).
 * - **Rules first**: a note holding what reads as a credential is written
 *   with it redacted (secret-filter.ts) and archived at once; one a live
 *   lesson's line already says word for word is archived at once as a
 *   duplicate of that lesson. The rest wait for the nightly run.
 * - **Brief context** (dispatch.ts): the knowledge lessons a task needs,
 *   within the brief's budget. Code greps the task's words over the lines
 *   (and takes every line of the files its `context:` names); Jev on, one
 *   yes/no per line on whether it bears on the task orders them, Jev failing
 *   refuses the start with its words; off, the grep's score orders them.
 *   Each line a brief carries is a use (db `fact_uses`, by lesson id).
 * - **What past sessions said** is `find` (find-tool.ts), the dashboard's
 *   Find, over every machine's transcripts: no store of its own here.
 */

import { frontMatterBlock } from "@cawco/core/fleet";
import { traitsOf } from "@cawco/core/harness/traits";
import { isRecord } from "@cawco/core/is-record";
import type { InstanceRow } from "@cawco/core/protocol";
import type { RoutineRunView } from "@cawco/core/routine-kinds";
import type {
  NeutralMessage,
  NeutralOrigin,
} from "@cawco/core/session-messages";
import { unhandled } from "@cawco/core/unhandled";
import { memoryWords } from "@cawco/core/words/memory";
import { memoryRunWords } from "@cawco/core/words/memory-run";
import { Elysia, ElysiaStatus, problem, t } from "elysia";
import { z } from "zod";
import { MEMORY_FILE_CHARS } from "./config";
import type { DbShape } from "./db";
import type { SessionTaintRow } from "./db/projects";
import { ROUTINE_ORIGIN } from "./hub-words";
import { type JevAccess, jevAccess } from "./jev";
import { askRow, offLine } from "./jev-placement";
import { boardTitle } from "./labels";
import { defineTool, answered as isAnswer, sentence } from "./mcp-tool";
import {
  BRAND,
  dayOf,
  grepScore,
  homeOf,
  INDEX_FILE,
  indexSays,
  KNOWLEDGE_ARCHIVE,
  KNOWLEDGE_DIR,
  LESSONS_DIR,
  type LessonLine,
  NOTE_ID,
  parseLessons,
  withNote,
  wordsOf,
} from "./memory-lessons";
import {
  memoryAppliedWords,
  memoryNotedWords,
  memoryReadWords,
  memoryWithdrawnWords,
  type Noted,
} from "./presenters/project";
import {
  folderFileNames,
  folderFilePaths,
  folderPath,
  listFolder,
  readFolderFile,
  writeFolderFile,
  YOU,
} from "./project-folder";
import type { AnyProblem } from "./refusal";
import { roleOf } from "./roles";
import type { EnsureCurator } from "./routine-schedule";
import { redactSecrets } from "./secret-filter";
import { listOf, scalarOf } from "./task-file";
import { readsWeb, type WebContext } from "./web-reads";
import { isRoutineParent } from "./work-item-state";

const MEMORY_DIR = "memory";
export const INBOX_DIR = "memory/inbox";
export const ARCHIVE_DIR = "memory/archive";

/** The longest note an agent writes, and the longest "Make a note". */
const NOTE_LIMIT = 4000;
/** What one brief carries of all its context together; each file's share is the file budget (config.ts). */
const CONTEXT_CHARS = 24_000;
/** The lines a brief's grep shortlists, the most words in common first, before Jev or the budget. */
const SHORTLIST = 60;
/**
 * A yes at or over this keeps a line Jev judged in the brief: the likelier
 * of two, as a Noul reads ("Use 0.5 when yes and no are equally easy to act
 * on", https://docs.typesafe.ai/primitives/noul). Our own call.
 */
const BEARS = 0.5;
/** How far up its delegation chain a session's routine run is looked for. */
const ANCESTRY = 12;
const LEADING_SLASHES = /^\/+/u;

/** The hub's word on a session that labels a note it writes. */
export type Taint = "routine" | "heartbeat" | "subagent" | "web";
/** What the rules found a note to be as it was written. */
type Verdict = "secret" | "duplicate";
/** What kind of session wrote a note. */
type Source = "session" | "delegate" | "attempt" | "routine";

/** The rules' word on a note as it is written: its words, and what they found it to be (a duplicate names the live lesson it says again). */
type Ruled = { text: string } & (
  | { verdict: null }
  | { verdict: "secret" }
  | { verdict: "duplicate"; lesson: string }
);

const isVerdict = (word: string | null): word is Verdict =>
  word === "secret" || word === "duplicate";

/**
 * Why no agent may write `rel` in a project's folder with `folder_write`, or
 * nothing: the memory files are the nightly memory run's (memory-run.ts)
 * and the person's own notes', `memory/` is the inbox and the run's
 * records, and `design/` is the design system, written through
 * `design_write` alone (design-system.ts).
 */
export const personsTier = (rel: string): string | undefined => {
  if (
    rel === INDEX_FILE ||
    rel === KNOWLEDGE_DIR ||
    rel.startsWith(`${KNOWLEDGE_DIR}/`) ||
    rel === LESSONS_DIR ||
    rel.startsWith(`${LESSONS_DIR}/`)
  ) {
    return `${rel} is the project's memory, written by its nightly memory run from what the person says and what agents note: note what should last with memory_note. A free-form document, such as how something is operated or made, goes in reference/, written with folder_write.`;
  }
  if (rel === MEMORY_DIR || rel.startsWith(`${MEMORY_DIR}/`)) {
    return "memory/ is the agents' inbox: write a note with memory_note.";
  }
  if (rel === "design" || rel.startsWith("design/")) {
    return "design/ is the project's design system: it is written only with design_write, where a change goes to the person as a proposal. Delegate the change.";
  }
  return undefined;
};

// --- what a session has been doing ---------------------------------------------

/** How long what the web test reads of the fleet (its hostnames, its MCP servers' URLs) is kept before it is read again. */
const FLEET_READ_MS = 60_000;
/** A keep-alive's send (keep-alive.ts): the hub's heartbeat, not a delivery. */
const KEEPALIVE = "keepalive";
/** Whether a subagent of `harness` ends with its call's result (its descriptor's `subagentEndsWithCall`). */
const endsWithCall = (harness: string | undefined): boolean =>
  traitsOf(harness).subagentEndsWithCall;

/** Where the watch keeps each session's state (db `session_taints`), and what it reads of the fleet. */
export interface TaintStore {
  /** The fleet's machines, by hostname and id: hosts inside the fleet (web-reads.ts). */
  fleetHosts: () => Iterable<string>;
  get: (instanceId: string) => SessionTaintRow | undefined;
  /** The URL the fleet's MCP server of that name is reached at; undefined for one run as a command, or none by that name. */
  mcpUrl: (server: string) => string | undefined;
  put: (row: SessionTaintRow) => void;
}

const blank = (instanceId: string): SessionTaintRow => ({
  instanceId,
  web: false,
  fromRoutine: null,
  delivered: false,
  routine: null,
  subagents: [],
  updatedAt: new Date(0),
});

/**
 * What every session has done that labels a note it writes, from the frames
 * the hub admits and the sends its harness reads, kept in the database so a
 * hub restart mid-turn keeps it (db `session_taints`):
 * - **Delivered** (heartbeat by its absence): since its last turn's result
 *   the session read a send the hub delivered: a person's words, a hub or
 *   peer message, a routine's wake, a work item's brief. A turn nothing
 *   delivered started itself (a harness timer: ScheduleWakeup, CronCreate,
 *   /loop, a background task's end), and a keep-alive is no delivery. A
 *   note is written after its turn's input was read, so a delivery is
 *   always seen before the note it precedes.
 * - **Web**, sticky: once the session (or a subagent of it) called a tool
 *   that read content from outside the fleet (web-reads.ts: a search, a
 *   connection's tool, an outside service's MCP server, a URL or a fetcher's
 *   target that is not local), every later note of it is labelled `web`.
 * - **Subagents**, by their own start and end: Claude's `task_started` and
 *   `task_notification`, OpenCode's `task_started` and its call's result.
 *   A turn's end closes none of them.
 * - **Routine**: the wake a conversation's turn read, until its result; and a
 *   session a routine-run turn started, for its life.
 */
export const createTurnWatch = (store: TaintStore) => {
  const held = new Map<string, SessionTaintRow>();
  let fleet:
    | { at: number; context: WebContext; urls: Map<string, string | undefined> }
    | undefined;

  /** What the web test reads of the fleet: its hostnames and ids (lower case), its MCP servers' URLs; read again once a minute. */
  const webContext = (): WebContext => {
    const now = Date.now();
    if (!fleet || now - fleet.at > FLEET_READ_MS) {
      const urls = new Map<string, string | undefined>();
      fleet = {
        at: now,
        urls,
        context: {
          fleet: new Set(
            [...store.fleetHosts()].map((host) => host.toLowerCase())
          ),
          mcpUrl: (server) => {
            if (!urls.has(server)) {
              urls.set(server, store.mcpUrl(server));
            }
            return urls.get(server);
          },
        },
      };
    }
    return fleet.context;
  };

  const stateOf = (instanceId: string): SessionTaintRow => {
    const known = held.get(instanceId);
    if (known) {
      return known;
    }
    const read = store.get(instanceId) ?? blank(instanceId);
    held.set(instanceId, read);
    return read;
  };

  /** The session's state with `patch` over it, kept, and stored when it changed. */
  const change = (
    instanceId: string,
    patch: Partial<Omit<SessionTaintRow, "instanceId" | "updatedAt">>
  ): void => {
    const before = stateOf(instanceId);
    const after: SessionTaintRow = { ...before, ...patch };
    if (
      after.web === before.web &&
      after.fromRoutine === before.fromRoutine &&
      after.delivered === before.delivered &&
      after.routine === before.routine &&
      Bun.deepEquals(after.subagents, before.subagents)
    ) {
      return;
    }
    after.updatedAt = new Date();
    held.set(instanceId, after);
    try {
      store.put(after);
    } catch (error) {
      // A frame from a process the hub keeps no row for: it has no
      // credential, so it writes no note, and its state stays in memory.
      console.warn(
        `[memory] ${instanceId}: its taint was not stored: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  /** The tools a model's message calls (the session's or a subagent's): the web read makes the session's taint stick. */
  const called = (
    instanceId: string,
    neutral: Extract<NeutralMessage, { type: "assistant" }>
  ): void => {
    const calls = neutral.message.content.filter(
      (block) => block.type === "tool_use"
    );
    if (
      calls.length > 0 &&
      !stateOf(instanceId).web &&
      calls.some((block) =>
        readsWeb(
          block.name,
          isRecord(block.input) ? block.input : {},
          webContext()
        )
      )
    ) {
      change(instanceId, { web: true });
    }
  };

  /** A subagent's own start or end (system frames). */
  const tasked = (
    instanceId: string,
    neutral: Extract<NeutralMessage, { type: "system" }>
  ): void => {
    const { subagents } = stateOf(instanceId);
    const task = neutral.task_id;
    if (!task) {
      return;
    }
    // Only a real subagent's start names its type; a background command's does not.
    if (neutral.subtype === "task_started" && neutral.subagent_type) {
      if (!subagents.some((open) => open.task === task)) {
        change(instanceId, {
          subagents: [
            ...subagents,
            { task, call: neutral.tool_use_id ?? null },
          ],
        });
      }
    } else if (neutral.subtype === "task_notification" && neutral.status) {
      change(instanceId, {
        subagents: subagents.filter((open) => open.task !== task),
      });
    }
  };

  /** The session's own tool results: on a harness whose subagent ends with its call, that call's result ends it. */
  const answered = (
    instanceId: string,
    neutral: Extract<NeutralMessage, { type: "user" }>,
    harness: string | undefined
  ): void => {
    const { subagents } = stateOf(instanceId);
    const { content } = neutral.message;
    if (
      subagents.length === 0 ||
      neutral.parent_tool_use_id ||
      !endsWithCall(harness) ||
      !Array.isArray(content)
    ) {
      return;
    }
    const answers = new Set(
      content.flatMap((block) =>
        block.type === "tool_result" ? [block.tool_use_id] : []
      )
    );
    change(instanceId, {
      subagents: subagents.filter(
        (open) => !(open.call && answers.has(open.call))
      ),
    });
  };

  return {
    /** A frame the hub admitted from the session, on `harness`. */
    frame(
      instanceId: string,
      neutral: NeutralMessage,
      harness: string | undefined
    ): void {
      if (neutral.type === "result") {
        change(instanceId, { delivered: false, routine: null });
      } else if (neutral.type === "assistant") {
        called(instanceId, neutral);
      } else if (neutral.type === "system") {
        tasked(instanceId, neutral);
      } else if (neutral.type === "user") {
        answered(instanceId, neutral, harness);
      }
    },

    /** A send the hub delivered, read by the session's harness: its turn is delivered; a routine's wake of a conversation makes it the run's. */
    read(instanceId: string, origin: NeutralOrigin | undefined): void {
      if (origin?.kind === "system" && origin.name === KEEPALIVE) {
        return;
      }
      const routine =
        origin?.kind === "system" && origin.name?.startsWith(ROUTINE_ORIGIN)
          ? origin.name.slice(ROUTINE_ORIGIN.length)
          : undefined;
      change(instanceId, {
        delivered: true,
        ...(routine ? { routine } : {}),
      });
    },

    /** A session a parent's turn started (work-items.ts): a routine-run turn's child is the run's, for its life. */
    spawned(instanceId: string, parentId: string): void {
      const parent = stateOf(parentId);
      const routine = parent.routine ?? parent.fromRoutine;
      if (routine) {
        change(instanceId, { fromRoutine: routine });
      }
    },

    /** The session's process ended: its turn and its subagents with it; what it read and where it came from stay. */
    ended(instanceId: string): void {
      change(instanceId, { delivered: false, routine: null, subagents: [] });
    },

    state: (instanceId: string): SessionTaintRow => stateOf(instanceId),
  };
};

type TurnWatch = ReturnType<typeof createTurnWatch>;

// --- notes ----------------------------------------------------------------------

export interface Note {
  author: string;
  /** Who sorted it, when the rules did as it was written; null otherwise. */
  by: string | null;
  id: string;
  /**
   * Archived only: what came of it (`landed L-…`, `staged L-…`,
   * `corroborates L-…`, `dropped: <reason>`, `withdrawn`).
   */
  outcome: string | null;
  path: string;
  role: string;
  session: string;
  /**
   * When its fact became true, as its writer stated it (`YYYY-MM-DD`), when
   * that is before the note was written.
   */
  since: string | null;
  source: string;
  /** Its front matter's labels, word for word: the hub writes a session's {@link Taint}s there. */
  taint: string[];
  task: string | null;
  text: string;
  time: string;
  verdict: Verdict | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * A note's `since` as its writer gave it: a day before `today` is kept, today
 * is the note's own day (none kept), a day to come or no day is refused.
 */
const sinceAsked = (since: string | undefined, today: string) => {
  if (since === undefined) {
    return null;
  }
  if (!(DAY.test(since) && !Number.isNaN(Date.parse(since)))) {
    return problem(400, {
      code: "memory-since-unread",
      detail: `since is "${since}": give the day as YYYY-MM-DD, like {"text": "…", "since": "2026-09-01"}.`,
    });
  }
  if (since > today) {
    return problem(400, {
      code: "memory-since-to-come",
      detail: `since is ${since}, a day to come: note a fact once it holds.`,
    });
  }
  return since < today ? since : null;
};

const STAMP_PUNCTUATION = /[-:]/gu;

/** `n-20261013-120000-ab12cd`: sorts by when it was made. */
const noteIdAt = (at: Date): string => {
  const stamp = at
    .toISOString()
    .slice(0, 19)
    .replace(STAMP_PUNCTUATION, "")
    .replace("T", "-");
  const tail = crypto.randomUUID().replaceAll("-", "").slice(0, 6);
  return `n-${stamp}-${tail}`;
};

/** A free-text field's value, quoted so front matter reads it back whole. */
const quoted = (value: string): string =>
  JSON.stringify(value.replaceAll('"', "'").replaceAll("\n", " "));

const renderNote = (note: Note): string =>
  [
    "---",
    `id: ${note.id}`,
    `author: ${quoted(note.author)}`,
    `session: ${note.session}`,
    `role: ${note.role}`,
    `source: ${note.source}`,
    ...(note.task ? [`task: ${note.task}`] : []),
    `time: ${note.time}`,
    ...(note.since ? [`since: ${note.since}`] : []),
    ...(note.taint.length > 0 ? [`taint: [${note.taint.join(", ")}]`] : []),
    ...(note.verdict ? [`verdict: ${note.verdict}`] : []),
    ...(note.by ? [`by: ${note.by}`] : []),
    ...(note.outcome ? [`outcome: ${quoted(note.outcome)}`] : []),
    "---",
    note.text.trim(),
    "",
  ].join("\n");

const parseNote = (path: string, content: string): Note | undefined => {
  const block = frontMatterBlock(content);
  if (!block) {
    return;
  }
  const field = (key: string): string | null => {
    const line = block.lines.find((each) => each.key === key);
    return line ? scalarOf(line) : null;
  };
  const id = field("id");
  if (!(id && NOTE_ID.test(id))) {
    return;
  }
  const taintLine = block.lines.find((each) => each.key === "taint");
  const verdict = field("verdict");
  const since = field("since");
  return {
    id,
    path,
    author: field("author") ?? "",
    session: field("session") ?? "",
    role: field("role") ?? "",
    source: field("source") ?? "",
    task: field("task"),
    time: field("time") ?? "",
    since: since && DAY.test(since) ? since : null,
    taint: (taintLine ? listOf(taintLine) : undefined) ?? [],
    verdict: isVerdict(verdict) ? verdict : null,
    by: field("by"),
    outcome: field("outcome"),
    text: block.body.trim(),
  };
};

/** A note as the archive keeps it once `outcome` came of it: its file there, its words as they were. */
export const archivedNote = (note: Note, outcome: string) => ({
  path: `${ARCHIVE_DIR}/${note.id}.md`,
  content: renderNote({ ...note, outcome }),
});

// --- the rules ----------------------------------------------------------------------

const LOOSE = /[\s*_`>#|-]+/gu;
/** Words as an exact match compares them: case, markdown marks and spacing aside. */
const plain = (text: string): string =>
  text.toLowerCase().replace(LOOSE, " ").trim();

/** Whether `known` already says `text`, word for word. */
export const saysAlready = (known: string, text: string): boolean => {
  const said = plain(text);
  return said.length > 0 && plain(known).includes(said);
};

// --- the folder -----------------------------------------------------------------------

/** A text file of the folder, or "" when it is not there. */
export const fileOr = async (projectId: string, path: string) => {
  const file = await readFolderFile(projectId, path);
  if (file instanceof ElysiaStatus) {
    return file.status === 404 ? "" : file;
  }
  return file.content;
};

/** The memory files of a project's folder: the index, the skills' lessons, knowledge and its archive. */
export const memoryFiles = async (projectId: string) => {
  const lessons = await folderFilePaths(projectId, LESSONS_DIR);
  if (lessons instanceof ElysiaStatus) {
    return lessons;
  }
  const knowledge = await folderFilePaths(projectId, KNOWLEDGE_DIR, true);
  if (knowledge instanceof ElysiaStatus) {
    return knowledge;
  }
  return [INDEX_FILE, ...lessons, ...knowledge];
};

/** Every knowledge file a brief may carry (its archive aside), by path, with its words; a binary one of the brand kit left out. */
const knowledgeOf = async (projectId: string) => {
  const listing = await listFolder(projectId, KNOWLEDGE_DIR, true);
  if (listing instanceof ElysiaStatus) {
    return listing.status === 404 ? [] : listing;
  }
  const files = listing.entries.filter(
    (entry) =>
      entry.kind === "file" && !entry.path.startsWith(`${KNOWLEDGE_ARCHIVE}/`)
  );
  const read = await Promise.all(
    files.map((entry) => readFolderFile(projectId, entry.path))
  );
  const knowledge: { content: string; path: string }[] = [];
  for (const file of read) {
    if (file instanceof ElysiaStatus) {
      if (file.status === 413 || file.status === 415) {
        continue;
      }
      return file;
    }
    knowledge.push({ path: file.path, content: file.content });
  }
  return knowledge;
};

/** The lesson lines of the memory files' homes, each live: what a duplicate note repeats. */
const keptLines = async (projectId: string) => {
  const paths = await memoryFiles(projectId);
  if (paths instanceof ElysiaStatus) {
    return paths;
  }
  const lines: LessonLine[] = [];
  for (const path of paths.filter((each) => homeOf(each))) {
    const text = await fileOr(projectId, path);
    if (text instanceof ElysiaStatus) {
      if (text.status === 413 || text.status === 415) {
        continue;
      }
      return text;
    }
    lines.push(...parseLessons(path, text).lessons);
  }
  return lines;
};

const DUPLICATE = "dropped: duplicate";
const DUPLICATE_OF = /^dropped: duplicate of (L-[0-9a-f]{6})$/u;

/** An archived note's outcome when it says what live lesson `id` says. */
export const duplicateOutcome = (id: string): string => `${DUPLICATE} of ${id}`;

/**
 * Whether `note` was archived as a duplicate without a live lesson it
 * duplicates: one that names none (written before a duplicate named its
 * lesson), or names one that is no longer live. Such a note was never
 * judged, and the recovery reads it.
 */
export const duplicateUnjudged = (
  note: Note,
  live: (id: string) => boolean
): boolean => {
  if (!note.outcome?.startsWith(DUPLICATE)) {
    return false;
  }
  const named = DUPLICATE_OF.exec(note.outcome)?.[1];
  return !(named && live(named));
};

/** The notes in one of memory/'s folders, oldest first. */
export const notesIn = async (projectId: string, dir: string) => {
  const all = await folderFileNames(projectId, dir);
  if (all instanceof ElysiaStatus) {
    return all;
  }
  const names = all.filter((name) => name.endsWith(".md")).sort();
  const read = await Promise.all(
    names.map(async (name) => {
      const path = `${dir}/${name}`;
      const text = await fileOr(projectId, path);
      return text instanceof ElysiaStatus ? text : parseNote(path, text);
    })
  );
  const notes: Note[] = [];
  for (const one of read) {
    if (one instanceof ElysiaStatus) {
      return one;
    }
    if (one !== undefined) {
      notes.push(one);
    }
  }
  return notes;
};

/** The notes still in a project's inbox, oldest first: what its sessions noted and no run has read. */
export const inboxNotes = (projectId: string) => notesIn(projectId, INBOX_DIR);

// --- what a brief carries ---------------------------------------------------------------

/** The task a brief is for, as `contextFor` reads it. */
interface BriefTask {
  acceptance: string;
  /** Project folder files the task names (its `context:`): the conversation's pick. */
  context: string[];
  description: string;
  id: string;
  title: string;
}

/** A knowledge lesson as a brief reads it: its line and its file. */
interface Fact {
  line: LessonLine;
  path: string;
}

/** A lesson as its file says it: the line, and its `Why:` under it. */
const factLine = ({ line }: Fact): string =>
  `- ${line.text} (${line.id})${line.why ? `\n  Why: ${line.why}` : ""}`;

/**
 * Grep's shortlist for a brief: the lessons holding the task's words, and
 * every lesson of a file the task names; named first, then the most words
 * in common, at most {@link SHORTLIST}.
 */
const briefShortlist = (
  facts: Fact[],
  task: BriefTask,
  named: ReadonlySet<string>
): Fact[] => {
  const words = wordsOf(
    [task.title, task.description, task.acceptance].join("\n")
  );
  return facts
    .map((fact) => ({
      fact,
      named: named.has(fact.path),
      score: grepScore(words, fact.line.text),
    }))
    .filter((each) => each.named || each.score > 0)
    .sort((a, b) => Number(b.named) - Number(a.named) || b.score - a.score)
    .slice(0, SHORTLIST)
    .map(({ fact }) => fact);
};

/** A file's words as a brief carries them: whole up to its share, else cut, said so. */
const excerpt = (content: string, limit: number): string =>
  content.length > limit
    ? `${content.slice(0, limit).trimEnd()}\n\n… (cut here; the rest is in the project's folder)`
    : content.trim();

/** Files a brief carries whole (a brand kit file the task names), each up to its budget, and the room left after them. */
const wholeFiles = (
  files: { content: string; path: string }[]
): { parts: string[]; room: number } => {
  let room = CONTEXT_CHARS;
  const parts = files.map((file) => {
    if (room <= 0) {
      return memoryWords.briefLeftOut(file.path);
    }
    const said = excerpt(file.content, Math.min(MEMORY_FILE_CHARS, room));
    room -= said.length;
    return `### ${file.path}\n\n${said}`;
  });
  return { parts, room };
};

/**
 * The lessons a brief admits from `queue`, in order, whole, until `room` is
 * spent, no file past its budget. By file, and how many were left out.
 */
const admitFacts = (
  queue: Fact[],
  room: number
): { admitted: Map<string, Fact[]>; left: number } => {
  const admitted = new Map<string, Fact[]>();
  const spent = new Map<string, number>();
  let free = room;
  let left = 0;
  for (const fact of queue) {
    const size = factLine(fact).length + 1;
    const share = spent.get(fact.path) ?? 0;
    if (size > free || share + size > MEMORY_FILE_CHARS) {
      left += 1;
      continue;
    }
    free -= size;
    spent.set(fact.path, share + size);
    admitted.set(fact.path, [...(admitted.get(fact.path) ?? []), fact]);
  }
  return { admitted, left };
};

// --- the module -------------------------------------------------------------------------

/** The memory tools' input: `memory_apply`'s operations (memory-run.ts checks each). */
const HomeInput = z.union([
  z.literal("index"),
  z.object({ skill: z.string() }),
  z.object({ knowledge: z.string() }),
]);
const OpInput = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    text: z.string(),
    why: z.string().optional(),
    home: HomeInput,
    sources: z.array(z.string()),
    probe: z.object({ prompt: z.string(), pass: z.string() }).optional(),
    anchor: z
      .object({ path: z.string(), match: z.string() })
      .optional()
      .describe(
        "A repository file and a literal string in it that bear the lesson out."
      ),
  }),
  z.object({
    op: z.literal("replace"),
    id: z.string(),
    text: z.string(),
    why: z.string(),
    sources: z.array(z.string()),
  }),
  z.object({
    op: z.literal("corroborate"),
    id: z.string(),
    sources: z.array(z.string()),
  }),
  z.object({ op: z.literal("move"), id: z.string(), home: HomeInput }),
  z.object({
    op: z.literal("check"),
    id: z.string().optional(),
    text: z.string(),
    method: z.string(),
    home: HomeInput,
    sources: z.array(z.string()),
  }),
  z.object({
    op: z.literal("drop"),
    sources: z.array(z.string()),
    reason: z.enum([
      "scaffolding",
      "untrusted",
      "duplicate",
      "already-said",
      "unsourced",
    ]),
    of: z.string().optional(),
  }),
]);

/** One `memory_apply` operation, as the curator writes it. */
export type MemoryOp = z.infer<typeof OpInput>;

export interface MemoryDeps {
  /** The nightly memory run's `memory_apply` (memory-run.ts `apply`). */
  readonly apply: (
    actor: InstanceRow,
    ops: MemoryOp[]
  ) => Promise<{ lines: string[] } | AnyProblem>;
  /**
   * The project's curator routine (routines.ts), made as the project's
   * first note is written if it has none. Bound late: the routines are
   * made after this module.
   */
  readonly curator: () => { ensure: EnsureCurator };
  readonly db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "listProjects"
    | "memoryFacts"
    | "project"
    | "workItem"
  >;
  /** The project's folder changed under its tasks (a commit landed). */
  readonly folderChanged: (projectId: string) => void;
  /** A session takes back a note it left (memory-run.ts `unnote`). */
  readonly unnote: (
    actor: InstanceRow,
    id: string
  ) => Promise<{ text: string; withdrawn: string } | AnyProblem>;
  readonly watch: TurnWatch;
}

export const createMemory = ({
  apply,
  curator,
  db,
  folderChanged,
  unnote,
  watch,
}: MemoryDeps) => {
  /**
   * Each project's index as a session launches with it ({@link indexOf}):
   * read at the hub's start and again at every commit that changes
   * AGENTS.md ({@link folderCommitted}).
   */
  const indexes = new Map<string, string>();

  const projectOf = (projectId: string) => {
    const project = db.project(projectId);
    if (!project) {
      return problem(404, {
        code: "memory-project-unknown",
        detail: `The hub keeps no project ${projectId}.`,
      });
    }
    return project;
  };

  const row = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id]).at(0);

  // --- labels --------------------------------------------------------------------

  /**
   * Whether the session runs for a routine, as the hub stored it: its turn
   * read a routine's wake, or it or a session above it is a routine run's
   * (a parent `routine:<id>`) or was started by a routine-run turn.
   */
  const routineRun = (actor: InstanceRow): boolean => {
    if (watch.state(actor.id).routine) {
      return true;
    }
    let at: InstanceRow | undefined = actor;
    for (let depth = 0; at && depth < ANCESTRY; depth += 1) {
      if (
        isRoutineParent(at.parentInstanceId) ||
        watch.state(at.id).fromRoutine
      ) {
        return true;
      }
      const item = at.workItemId ? db.workItem(at.workItemId) : undefined;
      if (isRoutineParent(item?.parentInstanceId)) {
        return true;
      }
      at = at.parentInstanceId ? row(at.parentInstanceId) : undefined;
    }
    return false;
  };

  /** The hub's labels on a note `actor` writes now. */
  const taintOf = (actor: InstanceRow): Taint[] => {
    const state = watch.state(actor.id);
    const taint: Taint[] = [];
    if (routineRun(actor)) {
      taint.push("routine");
    }
    // A turn the hub did not deliver started itself, and a keep-alive's turn
    // is the hub's own heartbeat (its mark on the row).
    if (
      !state.delivered ||
      db.getInstancesByIds([actor.id])[0]?.keepAliveTurn
    ) {
      taint.push("heartbeat");
    }
    if (state.subagents.length > 0) {
      taint.push("subagent");
    }
    if (state.web) {
      taint.push("web");
    }
    return taint;
  };

  const sourceOf = (actor: InstanceRow): Source => {
    if (routineRun(actor)) {
      return "routine";
    }
    const item = actor.workItemId ? db.workItem(actor.workItemId) : undefined;
    if (item?.taskId) {
      return "attempt";
    }
    // Delegated work is a delegate's; a session another session started
    // with `start_session` writes as a session.
    return actor.workItemId ? "delegate" : "session";
  };

  // --- notes -----------------------------------------------------------------------

  /**
   * The rules' word on a note's words, as they will be written to the
   * project's git: every secret redacted (secret-filter.ts), the note a
   * `secret`; one a live lesson's line says word for word a `duplicate` of
   * that lesson.
   */
  const byRules = async (projectId: string, words: string) => {
    const redacted = await redactSecrets(words);
    if (redacted !== words) {
      const secret: Ruled = { text: redacted, verdict: "secret" };
      return secret;
    }
    const lines = await keptLines(projectId);
    if (lines instanceof ElysiaStatus) {
      return lines;
    }
    const line = lines.find((each) => saysAlready(each.text, words));
    const ruled: Ruled = line
      ? { text: words, verdict: "duplicate", lesson: line.id }
      : { text: words, verdict: null };
    return ruled;
  };

  /** The project whose inbox a session's note goes to, or the refusal: a session in no project, or a project the hub does not keep. */
  const inboxOf = (actor: InstanceRow) =>
    actor.projectId
      ? projectOf(actor.projectId)
      : problem(409, {
          code: "memory-session-no-project",
          detail:
            "This session is in no project; a note goes to a project's inbox.",
        });

  /**
   * An agent's note into its project's inbox, one commit, its labels the
   * hub's. `since`: the day its fact became true, when that is before today
   * (a backfill); a day to come is refused. A secret or a duplicate goes
   * straight to the archive, and the run never reads it.
   */
  const note = async (
    actor: InstanceRow,
    raw: string,
    since?: string
  ): Promise<Noted | AnyProblem> => {
    const project = inboxOf(actor);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const projectId = project.id;
    const words = raw.trim();
    if (!words) {
      return problem(400, {
        code: "memory-note-empty",
        detail: "A note needs words.",
      });
    }
    const at = new Date();
    const held = sinceAsked(since, dayOf(at));
    if (held instanceof ElysiaStatus) {
      return held;
    }
    const ruled = await byRules(projectId, words);
    if (ruled instanceof ElysiaStatus) {
      return ruled;
    }
    const made = noteOf(actor, at, held, ruled);
    const written = await writeNote(projectId, made, actor.id);
    if (written instanceof ElysiaStatus) {
      return written;
    }
    const unensured = curator().ensure(projectId);
    if (unensured) {
      return unensured;
    }
    switch (ruled.verdict) {
      case "secret":
        return { id: made.id, reaches: "nowhere", verdict: "secret" };
      case "duplicate":
        return {
          id: made.id,
          reaches: "nowhere",
          verdict: "duplicate",
          lesson: ruled.lesson,
        };
      case null:
        return { id: made.id, reaches: "run" };
      default:
        return unhandled("note verdict", ruled);
    }
  };

  /** `actor`'s note made `at`, true since `since`, in the words and with the verdict the rules gave it: in the inbox, or archived at once when the rules sorted it out. */
  const noteOf = (
    actor: InstanceRow,
    at: Date,
    since: string | null,
    ruled: Ruled
  ): Note => {
    const { text, verdict } = ruled;
    const outcome =
      ruled.verdict === "duplicate"
        ? duplicateOutcome(ruled.lesson)
        : verdict && `dropped: ${verdict}`;
    const item = actor.workItemId ? db.workItem(actor.workItemId) : undefined;
    const id = noteIdAt(at);
    return {
      id,
      path: `${verdict ? ARCHIVE_DIR : INBOX_DIR}/${id}.md`,
      author: boardTitle(actor),
      session: actor.id,
      role: roleOf(actor),
      source: sourceOf(actor),
      task: item?.taskId ?? null,
      time: at.toISOString(),
      since,
      taint: taintOf(actor),
      verdict,
      by: verdict ? "rules" : null,
      outcome: outcome || null,
      text,
    };
  };

  /** Note `made` from session `from`, one commit by its author; said in the log. */
  const writeNote = async (projectId: string, made: Note, from: string) => {
    const labelled = made.taint.length > 0;
    const written = await writeFolderFile(
      projectId,
      made.path,
      renderNote(made),
      {
        author: { name: made.author },
        message: `memory: a note from ${made.author}${labelled ? ` (${made.taint.join(", ")})` : ""}`,
      }
    );
    if (written instanceof ElysiaStatus) {
      return written;
    }
    folderChanged(projectId);
    console.log(
      `[memory] ${projectId}: ${made.id} from ${from} (${made.source}${labelled ? `, labels ${made.taint.join("+")}` : ""}${made.verdict ? `, ${made.verdict}` : ""}) at ${written.sha.slice(0, 9)}`
    );
    return written;
  };

  /** What the curator reads: the inbox's waiting notes and the memory files, or one of them, or one note. */
  const read = async (actor: InstanceRow, raw: string | undefined) => {
    const { projectId } = actor;
    if (!projectId) {
      return problem(409, {
        code: "memory-session-no-project",
        detail: "This session is in no project.",
      });
    }
    if (!raw) {
      const inbox = await inboxNotes(projectId);
      if (inbox instanceof ElysiaStatus) {
        return inbox;
      }
      const files = await memoryFiles(projectId);
      if (files instanceof ElysiaStatus) {
        return files;
      }
      return {
        inbox: inbox.map((each) => ({
          id: each.id,
          from: each.author,
          since: each.since ?? dayOf(each.time),
          text: each.text,
        })),
        files: files.filter(
          (path) => path !== INDEX_FILE || indexes.has(projectId)
        ),
      };
    }
    const rel = folderPath(raw);
    if (rel instanceof ElysiaStatus) {
      return rel;
    }
    if (!(
      rel === INDEX_FILE ||
      rel.startsWith(`${KNOWLEDGE_DIR}/`) ||
      rel.startsWith(`${LESSONS_DIR}/`) ||
      rel.startsWith(`${INBOX_DIR}/`)
    )) {
      return problem(400, {
        code: "memory-read-path-unfit",
        detail:
          "Read AGENTS.md, a lessons/ or knowledge/ file, or a memory/inbox/ note.",
      });
    }
    return await readFolderFile(projectId, rel);
  };

  // --- the person's own note ----------------------------------------------------------

  /** "Make a note": the person's words straight into the index's `## Notes`, as their commit; the nightly run never changes them. */
  const makeNote = async (projectId: string, raw: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const words = raw.trim();
    if (!words) {
      return problem(400, {
        code: "memory-note-empty",
        detail: "Say what to note.",
      });
    }
    if (words.length > NOTE_LIMIT) {
      return problem(400, {
        code: "memory-note-too-long",
        detail: `The note is ${words.length} characters long; a note stops at ${NOTE_LIMIT}.`,
      });
    }
    const before = await fileOr(projectId, INDEX_FILE);
    if (before instanceof ElysiaStatus) {
      return before;
    }
    const after = withNote(project.name, before, words);
    const written = await writeFolderFile(projectId, INDEX_FILE, after, {
      author: YOU,
      message: "AGENTS.md: a note from you",
    });
    if (written instanceof ElysiaStatus) {
      return written;
    }
    folderChanged(projectId);
    console.log(
      `[memory] ${projectId}: you noted in AGENTS.md at ${written.sha.slice(0, 9)}`
    );
    return { path: INDEX_FILE, sha: written.sha, changed: written.changed };
  };

  // --- what a brief carries --------------------------------------------------------------

  /**
   * Jev's yes/no per shortlisted lesson on whether it bears on `task`, the
   * re-rank recipe (https://docs.typesafe.ai/cookbooks/rerank_typesafe: "one
   * Noul per query-candidate pair, then sorts candidates by the value"), in
   * one request. Jev failing throws its words (JevFailed).
   */
  const jevBears = async (
    key: JevAccess,
    projectId: string,
    task: BriefTask,
    facts: Fact[]
  ): Promise<Map<Fact, number>> => {
    const result = await askRow(
      "context",
      projectId,
      key,
      {
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          acceptance: task.acceptance,
        },
      },
      Object.fromEntries(
        facts.map((fact, index) => [
          `l${index}`,
          {
            type: "boolean" as const,
            instructions: {
              fact: fact.line.text,
              file: fact.path,
              question:
                "Does `fact`, a fact the project keeps, bear on doing `task`: would an agent doing it act differently, or avoid a mistake, for knowing it?",
            },
            criteria: {
              true: "Knowing it changes how the task is done, checked or handed in.",
              false: "It is about something the task does not touch.",
            },
          },
        ])
      )
    );
    return new Map(
      facts.map((fact, index) => [
        fact,
        result.answers[`l${index}`]?.probability ?? 0,
      ])
    );
  };

  /**
   * The shortlist's order for a brief: Jev's yes/no on each lesson (one
   * under {@link BEARS} leaves), else grep's order. Jev failing throws
   * (JevFailed): the attempt does not start.
   */
  const orderForBrief = async (
    projectId: string,
    task: BriefTask,
    shortlist: Fact[]
  ): Promise<Fact[]> => {
    const key = jevAccess(db);
    if (!key) {
      if (shortlist.length > 0) {
        offLine(
          "context",
          projectId,
          `${task.id} carries the lessons its words find, by grep score`
        );
      }
      return shortlist;
    }
    if (shortlist.length === 0) {
      return [];
    }
    const bears = await jevBears(key, projectId, task, shortlist);
    return shortlist
      .filter((one) => (bears.get(one) ?? 0) >= BEARS)
      .sort((a, b) => (bears.get(b) ?? 0) - (bears.get(a) ?? 0));
  };

  /**
   * The brief's project facts for an attempt at `task` (module header): the
   * brand kit files the task names, then the knowledge lessons it needs,
   * whole, within the brief's budget. Each lesson carried is a use. The
   * project's rules are not here: the attempt's session launches with them
   * ({@link indexOf}). Nothing when the project has none of it.
   */
  const contextFor = async (projectId: string, task: BriefTask) => {
    const knowledge = await knowledgeOf(projectId);
    if (knowledge instanceof ElysiaStatus) {
      return knowledge;
    }
    const named = new Set(
      task.context.map((path) => path.replace(LEADING_SLASHES, ""))
    );
    const facts = knowledge
      .filter((file) => homeOf(file.path)?.at === "knowledge")
      .flatMap((file) =>
        parseLessons(file.path, file.content).lessons.map((line) => ({
          line,
          path: file.path,
        }))
      );
    const ordered = await orderForBrief(
      projectId,
      task,
      briefShortlist(facts, task, named)
    );
    const whole = wholeFiles(
      knowledge.filter(
        (file) =>
          BRAND.test(file.path) && named.has(file.path) && file.content !== ""
      )
    );
    const { admitted, left } = admitFacts(ordered, whole.room);
    db.memoryFacts.useLessons(
      projectId,
      [...admitted.values()].flat().map((fact) => fact.line.id),
      new Date()
    );
    const facts_ = [...admitted]
      .map(([path, kept]) => `From ${path}:\n${kept.map(factLine).join("\n")}`)
      .join("\n\n");
    const parts = [
      ...whole.parts,
      ...(admitted.size > 0
        ? [
            `${facts_}${left > 0 ? `\n\n${memoryRunWords.briefFactsLeft(left, KNOWLEDGE_DIR)}` : ""}`,
          ]
        : []),
    ];
    return parts.length === 0
      ? ""
      : memoryRunWords.briefFacts(parts.join("\n\n"));
  };

  // --- the index --------------------------------------------------------------------

  /** Project `projectId`'s index read again into {@link indexes}; a read the folder refuses leaves the copy it had. */
  const readIndex = async (projectId: string) => {
    const agents = await fileOr(projectId, INDEX_FILE);
    if (agents instanceof ElysiaStatus) {
      return agents;
    }
    indexes.set(
      projectId,
      indexSays(agents) ? memoryRunWords.indexInstruction(agents) : ""
    );
  };

  /** Every project's index read, as the hub starts. */
  const start = async (): Promise<void> => {
    await Promise.all(
      db.listProjects().map(async (project) => {
        try {
          const indexed = await readIndex(project.id);
          if (indexed) {
            console.warn(
              `[memory] ${project.name}: its index was not read: ${indexed.response.detail}`
            );
          }
        } catch (error) {
          console.warn(
            `[memory] ${project.name}: its index was not read: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );
  };

  return {
    watch,
    note,
    read,
    makeNote,
    contextFor,
    start,

    /**
     * Project `projectId`'s index (AGENTS.md) as every session of the
     * project launches with it (launches.ts `grantLaunch`), under the words
     * saying what it is; empty when it says nothing yet. A copy, read at the
     * hub's start and at each commit that changes it.
     */
    indexOf: (projectId: string): string => indexes.get(projectId) ?? "",

    /** A commit changed `paths` in `projectId`'s folder: its index is read again when AGENTS.md is among them. */
    folderCommitted: async (projectId: string, paths: ReadonlySet<string>) =>
      paths.has(INDEX_FILE) ? await readIndex(projectId) : undefined,

    /**
     * The memory tools, bound to the calling session; with no session, the
     * same definitions for discovery.
     */
    tools(actor: InstanceRow | undefined) {
      const me = (): InstanceRow => {
        if (!actor) {
          throw new Error("Discovery cannot execute tools");
        }
        return actor;
      };
      return [
        MEMORY_NOTE_DEFINITION.run(async ({ text, since }) => {
          const noted = await note(me(), text, since);
          return isAnswer(noted) ? memoryNotedWords(noted) : noted;
        }),
        MEMORY_WITHDRAW_DEFINITION.run(async ({ note: id }) => {
          const gone = await unnote(me(), id);
          return isAnswer(gone) ? memoryWithdrawnWords(gone) : gone;
        }),
        MEMORY_READ_DEFINITION.run(({ path }) => read(me(), path)),
        MEMORY_APPLY_DEFINITION.run(({ ops }) => apply(me(), ops)),
      ];
    },
  };
};

export type Memory = ReturnType<typeof createMemory>;

/** Every memory tool, by name. */
export const MEMORY_TOOLS: ReadonlySet<string> = new Set([
  "memory_note",
  "memory_withdraw",
  "memory_read",
  "memory_apply",
]);

/**
 * The person's own memory acts outside a conversation: "Make a note"
 * straight into AGENTS.md; withdrawing a note, which retires the lessons
 * resting on it alone in the same commit (memory-run.ts `withdraw`); the
 * recovery run of the notes archived unread (routines.ts `recover`); and
 * the check of whether lessons' probes tell anything (memory-run.ts
 * `probeCheck`), which runs on and writes `memory/probe-check.json`.
 */
export const memoryRoutes = (
  memory: Memory,
  acts: {
    probeCheck: (
      projectId: string,
      lessons: { id: string; pass: string; prompt: string }[] | undefined
    ) => Promise<
      | { file: string; lessons: string[]; model: string; started: true }
      | AnyProblem
    >;
    recover: (projectId: string) => Promise<RoutineRunView | AnyProblem>;
    withdraw: (
      projectId: string,
      note: string
    ) => Promise<
      | { keeps: number; retires: number; sha: string; withdrawn: string }
      | AnyProblem
    >;
  }
) =>
  new Elysia()
    .post(
      "/api/projects/:id/memory/notes",
      {
        body: t.Object({ text: t.String({ maxLength: NOTE_LIMIT }) }),
        detail: { hide: true },
      },
      ({ params, body }) => memory.makeNote(params.id, body.text)
    )
    .post(
      "/api/projects/:id/memory/notes/:note/withdraw",
      { detail: { hide: true } },
      ({ params }) => acts.withdraw(params.id, params.note)
    )
    .post(
      "/api/projects/:id/memory/recover",
      { detail: { hide: true } },
      ({ params }) => acts.recover(params.id)
    )
    .post(
      "/api/projects/:id/memory/probe-check",
      {
        body: t.Optional(
          t.Object({
            lessons: t.Optional(
              t.Array(
                t.Object({
                  id: t.String(),
                  prompt: t.String({ maxLength: 300 }),
                  pass: t.String({ maxLength: 300 }),
                }),
                { maxItems: 5 }
              )
            ),
          })
        ),
        detail: { hide: true },
      },
      ({ params, body }) => acts.probeCheck(params.id, body?.lessons)
    );

const MEMORY_NOTE_DEFINITION = defineTool(
  "memory_note",
  memoryRunWords.noteTool,
  {
    text: z.string().max(NOTE_LIMIT),
    since: z
      .string()
      .optional()
      .describe("YYYY-MM-DD it became true, if before today."),
  },
  sentence
);

const MEMORY_WITHDRAW_DEFINITION = defineTool(
  "memory_withdraw",
  memoryRunWords.withdrawTool,
  { note: z.string().describe("Its id from memory_note.") },
  sentence
);

const MEMORY_READ_DEFINITION = defineTool(
  "memory_read",
  "The project's memory: AGENTS.md, its lessons/ and knowledge/ files, and its inbox notes. Use it to read what the project keeps before changing it.",
  {
    path: z
      .string()
      .optional()
      .describe(
        "AGENTS.md, a lessons/ or knowledge/ file, or an inbox note; no path, the inbox's notes and the memory files."
      ),
  },
  memoryReadWords
);

const MEMORY_APPLY_DEFINITION = defineTool(
  "memory_apply",
  memoryRunWords.applyTool,
  {
    ops: z
      .array(OpInput)
      .min(1)
      .max(20)
      .describe(
        'sources: your brief\'s handles (m3, l2) and note ids. home: "index", {skill}, or {knowledge: <topic>}.'
      ),
  },
  memoryAppliedWords
);

/** The tools as a listing reads them, before any session's handlers are bound. */
export const MEMORY_DEFINITIONS = [
  MEMORY_NOTE_DEFINITION.listed(),
  MEMORY_WITHDRAW_DEFINITION.listed(),
  MEMORY_READ_DEFINITION.listed(),
  MEMORY_APPLY_DEFINITION.listed(),
];
