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
 *   format, the changes and the budgets are memory-lessons.ts's. No agent writes
 *   any of them with `folder_write` ({@link personsTier}).
 * - **Writers**: memory-run.ts, the one writer of the index's rules, skills'
 *   lessons and knowledge: the nightly memory run, through `memory_apply`
 *   and checks of its own, and a session's change to a rule
 *   (`memory_rule`, memory-run.ts `ruleAsked`), which removes, rewords or
 *   adds one at once, each reading the files, working out its change and
 *   committing it in one turn of the folder's commit queue
 *   (project-folder.ts `changeFolderInTurn`), so none writes over another;
 *   a session's note (`note`), into the inbox. The index's `## Notes` is
 *   the person's, edited in the folder, and no run changes it.
 * - **Notes** (`memory_note`, and `cawco tool memory_note`): an agent's
 *   words into the inbox, with who wrote them, in what role and kind of
 *   session, for which task and when.
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
import type { InstanceRow } from "@cawco/core/protocol";
import { DAY_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { memoryWords } from "@cawco/core/words/memory";
import { memoryRunWords } from "@cawco/core/words/memory-run";
import { ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import { MEMORY_FILE_CHARS } from "./config";
import type { DbShape } from "./db";
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
  renderLesson,
  wordsOf,
} from "./memory-lessons";
import { quoteProblem } from "./memory-sources";
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
} from "./project-folder";
import type { AnyProblem } from "./refusal";
import { roleOf } from "./roles";
import type { EnsureCurator } from "./routine-schedule";
import { redactSecrets } from "./secret-filter";
import { scalarOf } from "./task-file";

const MEMORY_DIR = "memory";
export const INBOX_DIR = "memory/inbox";
export const ARCHIVE_DIR = "memory/archive";

/** The longest note an agent writes. */
const NOTE_LIMIT = 4000;
/** The most messages one night reads: the most the person said in a day (memory-run.ts); a note is checked against as many for his words. */
export const RUN_SAID = 240;
/** How far back a night reads, when it has no mark yet or its last mark is older (memory-run.ts); a note is checked against the same week. */
export const SAID_DAYS = 7;
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
const LEADING_SLASHES = /^\/+/u;

/** What the rules found a note to be as it was written. */
type Verdict = "secret" | "duplicate";
/** What kind of session wrote a note. */
type Source = "session" | "delegate" | "attempt";

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

// --- notes ----------------------------------------------------------------------

export interface Note {
  author: string;
  /** Who sorted it, when the rules did as it was written; null otherwise. */
  by: string | null;
  id: string;
  /**
   * Archived only: what came of it (`landed L-…`, `corroborates L-…`,
   * `removes L-…`, `dropped: <reason>`, `withdrawn`; `staged L-…` before
   * 2026-11-24).
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

/** An archived note's outcome when it says what live lesson `id` says. */
export const duplicateOutcome = (id: string): string => `${DUPLICATE} of ${id}`;

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

/** A lesson as its file says it: the line, its `Why:` and its anchor under it. */
const factLine = ({ line }: Fact): string => renderLesson(line);

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
    anchor: z
      .object({ path: z.string(), match: z.string() })
      .optional()
      .describe(
        "A repository file and a literal string in it that bear the lesson out."
      ),
  }),
  z.object({
    op: z.literal("reword"),
    id: z.string(),
    text: z.string(),
    why: z.string(),
    sources: z.array(z.string()),
  }),
  z.object({
    op: z.literal("remove"),
    id: z.string(),
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

/** A change to one of the project's rules a session makes at once (`memory_rule`, memory-run.ts `ruleAsked`). */
export type RuleAsk =
  | { action: "remove"; rule: string }
  | { action: "reword"; rule: string; text: string; why?: string }
  | { action: "add"; text: string; why?: string };

/** `memory_rule`'s flat input as the one change it asks for; the refusal's words when a field it needs is missing. */
const ruleAskOf = (input: {
  action: RuleAsk["action"];
  rule?: string;
  text?: string;
  why?: string;
}): RuleAsk | string => {
  const rule = input.rule?.trim();
  const text = input.text?.trim();
  const why = input.why?.trim() || undefined;
  switch (input.action) {
    case "remove":
      return rule
        ? { action: "remove", rule }
        : memoryRunWords.ruleAskUnfit("remove", "rule");
    case "reword":
      return rule && text
        ? { action: "reword", rule, text, ...(why ? { why } : {}) }
        : memoryRunWords.ruleAskUnfit("reword", rule ? "text" : "rule");
    case "add":
      return text
        ? { action: "add", text, ...(why ? { why } : {}) }
        : memoryRunWords.ruleAskUnfit("add", "text");
    default:
      return unhandled("memory_rule action", input.action);
  }
};

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
    | "personSaidIn"
    | "project"
    | "workItem"
  >;
  /** The project's folder changed under its tasks (a commit landed). */
  readonly folderChanged: (projectId: string) => void;
  /** A session changes one of the project's rules at once (memory-run.ts `ruleAsked`): what changed, in a sentence. */
  readonly rule: (
    actor: InstanceRow,
    ask: RuleAsk
  ) => Promise<string | AnyProblem>;
  /** A session takes back a note it left (memory-run.ts `unnote`). */
  readonly unnote: (
    actor: InstanceRow,
    id: string
  ) => Promise<{ text: string; withdrawn: string } | AnyProblem>;
}

export const createMemory = ({
  apply,
  curator,
  db,
  folderChanged,
  rule,
  unnote,
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

  /** What kind of session `actor` is: an attempt at a task, a delegate, or a session of its own. */
  const sourceOf = (actor: InstanceRow): Source => {
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
   * An agent's note into its project's inbox, one commit; refused when it
   * quotes the person ({@link quotesPerson}). `since`: the day its fact became true, when that is before today
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
    const quoting = quotesPerson(projectId, words, at);
    if (quoting) {
      return quoting;
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

  /**
   * The refusal of a note that quotes the person (memory-sources.ts
   * `quoteProblem`, the check a lesson passes): a double-quoted span of
   * three words or more, or five of his words in a row from what he typed
   * to the project's sessions in the week the nightly run reads. Nothing
   * when it quotes no one.
   */
  const quotesPerson = (projectId: string, words: string, at: Date) => {
    const said = db
      .personSaidIn(
        projectId,
        new Date(at.getTime() - SAID_DAYS * DAY_MS),
        at,
        RUN_SAID
      )
      .map((one) => one.text);
    const found = quoteProblem(words, said);
    if (!found) {
      return;
    }
    return problem(400, {
      code: "memory-note-quotes",
      detail:
        found.kind === "echoes"
          ? memoryRunWords.noteEchoes(found.word)
          : memoryRunWords.noteQuotes,
    });
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
      verdict,
      by: verdict ? "rules" : null,
      outcome: outcome || null,
      text,
    };
  };

  /** Note `made` from session `from`, one commit by its author; said in the log. */
  const writeNote = async (projectId: string, made: Note, from: string) => {
    const written = await writeFolderFile(
      projectId,
      made.path,
      renderNote(made),
      {
        author: { name: made.author },
        message: `memory: a note from ${made.author}`,
      }
    );
    if (written instanceof ElysiaStatus) {
      return written;
    }
    folderChanged(projectId);
    console.log(
      `[memory] ${projectId}: ${made.id} from ${from} (${made.source}${made.verdict ? `, ${made.verdict}` : ""}) at ${written.sha.slice(0, 9)}`
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
    note,
    read,
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
        MEMORY_RULE_DEFINITION.run(async (input) => {
          const ask = ruleAskOf(input);
          return typeof ask === "string"
            ? problem(400, { code: "memory-rule-ask-unfit", detail: ask })
            : await rule(me(), ask);
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
  "memory_rule",
  "memory_read",
  "memory_apply",
]);

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

const MEMORY_RULE_DEFINITION = defineTool(
  "memory_rule",
  memoryRunWords.ruleTool,
  {
    action: z.enum(["remove", "reword", "add"]),
    rule: z
      .string()
      .optional()
      .describe("For remove and reword: its id, like L-28939a."),
    text: z
      .string()
      .max(NOTE_LIMIT)
      .optional()
      .describe("For reword and add: the rule in one sentence."),
    why: z
      .string()
      .max(NOTE_LIMIT)
      .optional()
      .describe("For reword and add: why it holds, in one line."),
  },
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
  MEMORY_RULE_DEFINITION.listed(),
  MEMORY_READ_DEFINITION.listed(),
  MEMORY_APPLY_DEFINITION.listed(),
];
