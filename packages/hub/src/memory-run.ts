/**
 * A project's nightly memory run (routines.ts, target `curator`), and every
 * write to its memory files but the person's own note (memory.ts
 * `makeNote`) and an agent's note into the inbox (memory.ts `note`):
 * nothing here waits for the person, and nothing reaches memory unchecked.
 *
 * - **Upkeep, no model** ({@link upkeep}): the index in its shape and every
 *   bullet of a home given an id; inbox notes no run reached in a week
 *   archived unread; a knowledge line no brief carried and no commit
 *   touched for the archive's days (config.ts `MEMORY_ARCHIVE_DAYS`)
 *   archived; a line whose anchor's file no longer holds its match taken
 *   out (its file read on a machine of the project, memory-sources.ts
 *   `anchorRead`); a rule whose check's task is done taken out. One commit.
 * - **What it reads**: what the person typed to the project's sessions since
 *   the last run (db sends.ts `personSaidIn`, the hub's own record of who
 *   spoke: no transcript, so no agent's turn and no tool's result), and the
 *   notes agents left. Jev reads in one request which messages say how
 *   agents should work ({@link jevRead}); Jev off, the newest messages go to
 *   the run as they are. The curator judges every note.
 * - **The run** is one delegate in the `curator` role, briefed by the hub
 *   ({@link brief}), that writes through `memory_apply` alone
 *   ({@link apply}). It cites each source by a handle the hub gave it, and
 *   the hub checks each operation: the handle is this run's; a message
 *   states the lesson (Jev, at {@link SUPPORTS}); the lesson quotes no one
 *   (memory-sources.ts `quoteProblem`), holds no secret and is one line
 *   within its length; a new lesson says what no line of its home or the
 *   index says (word for word, and Jev at {@link SAME}: {@link jevOnNew});
 *   an agent's lesson goes to knowledge and lands as the person's does, a
 *   file it names read for its match first ({@link anchored}); a rule of
 *   the index or a skill is reworded or removed only on a message of the
 *   person's that Jev confirms; with Jev off a new or changed lesson is
 *   refused; a file's character budget and the night's limits hold. Each
 *   operation is one commit by the Memory curator, its message naming its
 *   sources by reference, with the notes it consumed archived in it.
 * - **Lines taken out stay out** ({@link removedOf}): the lines git shows
 *   taken out since the last run are listed in the brief, and an add that
 *   says one again is refused unless a source of it is newer than its
 *   removal.
 * - **A rule changed at once** ({@link ruleAsked}, `memory_rule`): a
 *   session removes, rewords or adds one of the project's rules at once,
 *   one commit by the session, which is the change's author and source.
 * - **One way to write** ({@link written}): every change is decided where
 *   it is slow (Jev, a machine's file, the tasks, each read once), then
 *   made in the folder's commit queue (project-folder.ts
 *   `changeFolderInTurn`): the files read from disk, the change worked out
 *   on them, committed before any other commit lands. No base, no rebase,
 *   no retry; a change whose lesson or note left meanwhile is refused as
 *   no longer there.
 * - **Checks** ({@link plannedCheck}): a rule a tool can test is filed as
 *   a task in the project (`Check: <rule>`, through the tasks module, in
 *   the stage new tasks enter), its field `check` the lesson's id, the key
 *   it is found by over every task of any state ({@link fileCheck}): an
 *   open, done or dropped one is never filed again. The rule stays a line
 *   until the task is done, when upkeep takes the line out.
 * - **Provenance is git's**: who made a change is its commit's author, when
 *   is its date, and what it rests on is in its message, each source by
 *   reference (a message's send, a note's id); `git log -S "(L-…)"` finds
 *   every change of a line.
 * - **Close** ({@link close}): where the run read up to is kept
 *   (`memory/state.json`), messages it was given and named in no operation
 *   carried to the next night once, and the run's one line said.
 */

import type { InstanceRow } from "@cawco/core/protocol";
import type { RoutineOutcome } from "@cawco/core/routine-kinds";
import { DAY_MS } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { memoryJevWords, memoryRunWords } from "@cawco/core/words/memory-run";
import type { Experimental_DecisionQuestion } from "ai";
import { ElysiaStatus, problem } from "elysia";
import { z } from "zod";
import { MEMORY_ARCHIVE_DAYS, MEMORY_FILE_CHARS } from "./config";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import type { PersonSaid } from "./db/sends";
import type { MemoryRunState } from "./db/stored-types";
import { type JevAccess, jevAccess } from "./jev";
import { askRow, offLine } from "./jev-placement";
import type { JevResult } from "./jev-types";
import { boardTitle } from "./labels";
import {
  ARCHIVE_DIR,
  archivedNote,
  duplicateOutcome,
  fileOr,
  INBOX_DIR,
  type MemoryOp,
  memoryFiles,
  type Note,
  notesIn,
  RUN_SAID,
  type RuleAsk,
  SAID_DAYS,
  saysAlready,
} from "./memory";
import {
  type Anchor,
  allLessons,
  applyLineChange,
  CAPS,
  type Change,
  dayOf,
  grepScore,
  homeOf,
  INDEX_FILE,
  indexShape,
  isSkillName,
  isTopic,
  KNOWLEDGE_DIR,
  LESSONS_DIR,
  type LessonHome,
  type LessonLine,
  lessonLineOf,
  lessonOf,
  type MemoryFiles,
  NOTE_ID,
  newLessonId,
  olderThan,
  pathOf,
  RUN_STATE_FILE,
  withAnchor,
  withIds,
  wordsOf,
} from "./memory-lessons";
import {
  ANCHOR_MATCH,
  type AnchorPlace,
  anchorRead,
  type MachineRead,
  quoteProblem,
  rootOf,
} from "./memory-sources";
import {
  changeFolderInTurn,
  type FolderAuthor,
  type FolderChangeAsked,
  folderLineChanges,
  folderPath,
  YOU,
} from "./project-folder";
import { type AnyProblem, isProblem } from "./refusal";
import { redactSecrets } from "./secret-filter";
import { outsideUrls } from "./web-reads";

/** Why a memory write was not made: a sentence for the curator, or the folder's refusal. */
type Refusal = string | AnyProblem;

/** A memory change as the one write path commits it ({@link MemoryRun} `written`): the files after, its commit, each note it consumes archived with what came of it, files of `memory/` beside the lessons written or taken out, and its answer. */
interface MemoryWrite<T> {
  after: MemoryFiles;
  author: FolderAuthor;
  extra?: { content: string; path: string }[];
  gone?: string[];
  message: string;
  notes?: { note: Note; outcome: string }[];
  value: T;
}

/** A correction is short; a longer message is a paste or a brief, and its start says which. */
const SAID_CHARS = 1500;
/** A message shorter than this is no rule: never asked about, never a source. */
const SAID_WORDS = 6;
/** The messages the run itself reads: about a tenth of chat is worth keeping, so 60 leaves room for a day of nothing but corrections. */
const AGENT_SAID = 60;
/** The notes one run reads, oldest first. */
const RUN_NOTES = 60;
/** A note no run reached in this many days is archived unread. */
const NOTE_DAYS = 7;
/** Questions one Jev request carries. */
const JEV_QUESTIONS = 120;
/**
 * A message's support for a lesson at or over this lands it. Our own call: a
 * wrong accept steers every session until the person notices; a wrong
 * refusal costs one repeat from him.
 */
const SUPPORTS = 0.7;
/** A new lesson says what a kept one says at or over this: the likelier of two. */
const SAME = 0.5;
/** The operations one `memory_apply` call takes. */
const APPLY_OPS = 20;
/** Lessons grep pairs with a message in the brief, at most. */
const RELATED = 3;

const CURATOR: FolderAuthor = { name: "Memory curator" };
const HUB: FolderAuthor = { name: "CawCo hub" };

/** The subject a run's closing commit starts with ({@link MemoryRun} `closed`). */
const RUN_MARK = "memory: the nightly run's mark";
/** A lesson's id, as its line ends. */
const RULE_ID = /^L-[0-9a-f]{6}$/u;

type SaidKind = "instruction" | "task" | "other";
/** How a run ended, as its mark is kept. */
type RunOutcome = Extract<RoutineOutcome, "delivered" | "failed" | "silent">;

/** What a run read and wrote: the line it ends with. */
interface Counts {
  added: number;
  /** Checks filed as tasks. */
  checks: number;
  dropped: number;
  notes: number;
  read: number;
  /** Lessons reworded. */
  replaced: number;
  /** Lessons removed. */
  retired: number;
}

/** A check to file for a lesson: its id, its rule, and what to do instead. */
interface CheckAsk {
  id: string;
  method: string;
  text: string;
}

/** The task field naming the lesson a check's task is for: the check's key, looked up over every task of any state. */
const CHECK_FIELD = "check";
/** The field the memory run's tasks carried before (a check's, or one building a lesson into CawCo): each still open is dropped once ({@link MemoryRun} `start`). */
const LESSON_FIELD = "lesson";

/** A live lesson's line, as a message may state it again. */
interface Kept {
  id: string;
  text: string;
}

/** A lesson line taken out since the last run, as git holds it: its id, its words, and when. */
interface Removed {
  at: Date;
  id: string;
  text: string;
}

/** The memory files a lesson's line lives in, as git's log reads them (the archive among them). */
const LESSON_PATHS = [INDEX_FILE, LESSONS_DIR, KNOWLEDGE_DIR] as const;

/** One message given to a run, under its handle. */
interface Given {
  said: PersonSaid;
  /** Its session's handle (`s1`). */
  session: string;
  text: string;
}

/** A run under way: what its brief gave it, by handle, and what its operations used. */
interface Run {
  adds: number;
  /** Messages it was given, by uuid, carried from the night before. */
  carried: ReadonlySet<string>;
  changes: number;
  consumed: Set<string>;
  counts: Counts;
  jev: boolean;
  /** Messages it was given, by handle (`m1`). */
  messages: Map<string, Given>;
  /** Notes it was given, by id, with where each is now. */
  notes: Map<string, Note>;
  /** Lesson lines taken out since the last run (git): an add saying one again needs a source newer than its removal. */
  removed: Removed[];
  /** Every message it was given: what a lesson may not echo. */
  said: string[];
  /** The newest message the night read, Jev's or the run's: where the next one starts. */
  through: Date | null;
}

export interface MemoryRunDeps {
  readonly db: Pick<
    DbShape,
    | "dataMigrated"
    | "getInstancesByIds"
    | "getJevSettings"
    | "getOpenRouterConnection"
    | "markDataMigrated"
    | "memoryFacts"
    | "personSaidIn"
    | "project"
    | "sendRecord"
  >;
  /** The fleet's machines, by hostname and id, lower case: a URL to one of them is no outside page. */
  readonly fleetHosts: () => ReadonlySet<string>;
  /** The project's folder changed under its tasks (a commit landed). */
  readonly folderChanged: (projectId: string) => void;
  /**
   * A machine's files, over the `fs` verb: a file's text (`read`), and
   * whether a folder is there (`listed`; undefined when the machine did not
   * answer). What an anchor is read with (memory-sources.ts `anchorRead`).
   */
  readonly machine: {
    listed: (machineId: string, path: string) => Promise<boolean | undefined>;
    read: (machineId: string, path: string) => Promise<MachineRead>;
  };
  /** The skills the fleet lists for the project's sessions, each with its one-line description. */
  readonly skillsFor: (
    projectId: string
  ) => { description: string; name: string }[];
  /**
   * The project's tasks, as a check's is filed and found (tasks.ts): one
   * filed by the hub in the stage new tasks enter, answering its id; every
   * task carrying a field; one moved to dropped.
   */
  readonly tasks: {
    file: (
      projectId: string,
      draft: {
        acceptance: string;
        description: string;
        fields: Record<string, string>;
        title: string;
      }
    ) => Promise<{ id: string } | { refused: string }>;
    /**
     * Every task whose field `field` is set, on the board or archived, with
     * how it stands and the field's value: what a check's task is found by.
     */
    withField: (
      projectId: string,
      field: string
    ) => Promise<
      | { id: string; kind: "open" | "done" | "dropped"; value: string }[]
      | { refused: string }
    >;
    /**
     * Task `id` moved to the project's dropped stage with `reason`, when its
     * field `field` holds `value` and it is open; `kept` otherwise.
     */
    drop: (
      projectId: string,
      id: string,
      only: { field: string; reason: string; value: string }
    ) => Promise<"dropped" | "kept" | { refused: string }>;
  };
}

const RunStateSchema = z.object({
  carried: z.array(z.string()),
  lastRun: z
    .object({
      added: z.number(),
      at: z.string(),
      checks: z.number().optional(),
      dropped: z.number(),
      read: z.number(),
      replaced: z.number(),
      retired: z.number(),
      staged: z.number().optional(),
    })
    .nullable(),
  through: z.string(),
}) satisfies z.ZodType<MemoryRunState>;

/** The choices Jev reads a message by: whether it says how agents work here from now on. */
const SAID_CRITERIA: Record<SaidKind, string> = memoryJevWords.saidKinds;

const isSaidKind = (choice: string): choice is SaidKind =>
  Object.hasOwn(SAID_CRITERIA, choice);

/** A message's words, cut to what one read takes. */
const cut = (text: string): string =>
  text.length > SAID_CHARS ? `${text.slice(0, SAID_CHARS)}…` : text;

const SPACES = /\s+/u;
const HEADING_MARKS = /^#+\s*/u;
const LESSON_ID = /L-[0-9a-f]{6}/gu;

const wordCount = (text: string): number =>
  text.split(SPACES).filter(Boolean).length;

/** A JSON file of the folder, read by `schema`; `fallback` when it is not there; why when it does not read. */
const readJson = async <T>(
  projectId: string,
  path: string,
  schema: z.ZodType<T>,
  fallback: T
) => {
  const text = await fileOr(projectId, path);
  if (text instanceof ElysiaStatus) {
    return text;
  }
  if (text.trim() === "") {
    return fallback;
  }
  try {
    return schema.parse(JSON.parse(text));
  } catch (error) {
    return problem(500, {
      code: "memory-file-unread",
      detail: `${path} does not read: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

/** A JSON file as the folder keeps it. */
const jsonText = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const emptyCounts = (): Counts => ({
  added: 0,
  checks: 0,
  dropped: 0,
  notes: 0,
  read: 0,
  replaced: 0,
  retired: 0,
});

type ChoiceQuestion = Extract<
  Experimental_DecisionQuestion,
  { type: "choice" }
>;

/** What Jev said of a night's reading: each message's kind and how likely an instruction. */
interface JevRead {
  instruction: Map<string, number>;
  kinds: Map<string, SaidKind>;
}

/** The night's questions to Jev: each message of {@link SAID_WORDS} words or more. */
const readQuestions = (
  project: string,
  said: PersonSaid[]
): [string, ChoiceQuestion][] =>
  said
    .filter((one) => wordCount(one.text) >= SAID_WORDS)
    .map((one): [string, ChoiceQuestion] => [
      `said:${one.uuid}`,
      {
        type: "choice",
        instructions: {
          message: cut(one.text),
          question: memoryJevWords.saidQuestion(project),
        },
        criteria: SAID_CRITERIA,
      },
    ]);

/** The Jev rows a batch of questions asks, by their names' prefixes. */
const rowsOf = (names: string[]): ("said" | "support" | "kept")[] => {
  const rows = {
    "said:": "said",
    "support:": "support",
    "kept:": "kept",
  } as const;
  return Object.entries(rows).flatMap(([prefix, row]) =>
    names.some((name) => name.startsWith(prefix)) ? [row] : []
  );
};

/** Jev's choices on the night's questions, into `read`. */
const readAnswers = (
  answers: Record<
    string,
    { choice: string; probabilities?: Readonly<Record<string, number>> }
  >,
  read: JevRead
): void => {
  for (const [name, answer] of Object.entries(answers)) {
    if (name.startsWith("said:") && isSaidKind(answer.choice)) {
      const uuid = name.slice("said:".length);
      read.kinds.set(uuid, answer.choice);
      read.instruction.set(uuid, answer.probabilities?.instruction ?? 0);
    }
  }
};

/** `asked` put to Jev {@link JEV_QUESTIONS} a request, each request's rows by its questions' names, each request's answers handed to `take`. */
const inBatches = async <Question extends Experimental_DecisionQuestion>(
  projectId: string,
  key: JevAccess,
  state: Record<string, string>,
  asked: readonly [string, Question][],
  take: (answers: JevResult<Record<string, Question>>["answers"]) => void
): Promise<void> => {
  for (let at = 0; at < asked.length; at += JEV_QUESTIONS) {
    const batch = Object.fromEntries(asked.slice(at, at + JEV_QUESTIONS));
    const result = await askRow(
      rowsOf(Object.keys(batch)),
      projectId,
      key,
      state,
      batch
    );
    take(result.answers);
  }
};

/** The messages the run reads: Jev's instructions, the likeliest first; Jev off, the newest long enough to be a rule. */
const instructionsOf = (
  said: PersonSaid[],
  jev: JevRead | undefined
): PersonSaid[] =>
  jev
    ? said
        .filter((one) => jev.kinds.get(one.uuid) === "instruction")
        .sort(
          (a, b) =>
            (jev.instruction.get(b.uuid) ?? 0) -
            (jev.instruction.get(a.uuid) ?? 0)
        )
    : said
        .filter((one) => wordCount(one.text) >= SAID_WORDS)
        .slice(-AGENT_SAID);

/** A run with nothing read yet but `notes`. */
const newRun = (jev: boolean, notes: Note[], counts: Partial<Counts>): Run => ({
  jev,
  messages: new Map(),
  notes: new Map(notes.map((note) => [note.id, note])),
  removed: [],
  said: [],
  consumed: new Set(),
  counts: { ...emptyCounts(), ...counts },
  adds: 0,
  changes: 0,
  through: null,
  carried: new Set(),
});

/** Why a lesson's words are not one line within its home's length, with a `Why:` within its own; nothing when they are. */
const shapeProblem = (
  text: string,
  why: string | undefined,
  home: LessonHome
): string | undefined => {
  if (text.includes("\n") || why?.includes("\n")) {
    return memoryRunWords.oneLine;
  }
  const fact = home.at === "knowledge";
  const cap = fact ? CAPS.fact : CAPS.rule;
  if (text.length > cap) {
    return memoryRunWords.tooLong(text.length, cap, fact ? "fact" : "rule");
  }
  if (why && why.length > CAPS.why) {
    return memoryRunWords.tooLong(why.length, CAPS.why, "Why: line");
  }
};

/** Why `words` quote the person (memory-sources.ts `quoteProblem`), said by where; nothing when they do not. */
const wordsProblem = (
  words: string,
  said: readonly string[]
): string | undefined => {
  const quoted = quoteProblem(words, said);
  if (quoted?.kind === "echoes") {
    return memoryRunWords.echoes(quoted.word);
  }
  return quoted?.kind === "quotes" ? memoryRunWords.quotes : undefined;
};

/**
 * The run's state once a run ends (§2 D): a failed run's is as it was, so
 * the next night reads the same messages; else its mark moves to the newest
 * message it read, the messages it was given and named in no operation are
 * carried once (one carried already is not again), and its counts kept.
 */
const nextState = (
  state: MemoryRunState,
  run: Run,
  outcome: RunOutcome,
  at: string
): MemoryRunState => {
  if (outcome === "failed") {
    return state;
  }
  const unnamed = [...run.messages].flatMap(([handle, given]) =>
    run.consumed.has(handle) || state.carried.includes(given.said.uuid)
      ? []
      : [given.said.uuid]
  );
  return {
    ...state,
    through: run.through ? run.through.toISOString() : state.through,
    carried: [...run.carried, ...unnamed],
    lastRun: { at, ...run.counts },
  };
};

/** Every live lesson line of `files`: what a message may state again. */
const keptLessons = (files: MemoryFiles): Kept[] =>
  allLessons(files).map(({ line }) => ({ id: line.id, text: line.text }));

/**
 * The lesson lines git shows taken out by `changes` (newest first), each
 * at its newest removal: a line a commit took out and did not put back in
 * any memory file (a move, an archive or a reword keeps its id). One live
 * in `files` now was put back since, and is none.
 */
const removedOf = (
  changes: readonly { added: string[]; at: Date; removed: string[] }[],
  files: MemoryFiles
): Removed[] => {
  const live = new Set(keptLessons(files).map((line) => line.id));
  const found = new Map<string, Removed>();
  for (const change of changes) {
    const back = new Set(
      change.added.flatMap((line) => lessonLineOf(line)?.id ?? [])
    );
    for (const line of change.removed) {
      const gone = lessonLineOf(line);
      if (
        gone &&
        !(back.has(gone.id) || live.has(gone.id) || found.has(gone.id))
      ) {
        found.set(gone.id, { ...gone, at: change.at });
      }
    }
  }
  return [...found.values()];
};

/** A lesson of the memory beside which a new one is read: its id and words. */
interface Beside {
  id: string;
  text: string;
}

/** The lessons a lesson bound for `home` may say again: each live one in that home or the index, by its line. */
const besideOf = (files: MemoryFiles, home: LessonHome): Beside[] => {
  const into = pathOf(home);
  return allLessons(files).flatMap(({ line, path }) =>
    path === INDEX_FILE || path === into
      ? [{ id: line.id, text: line.text }]
      : []
  );
};

/** Jev's question on each lesson of `beside`, whether `text` says what it says, named under `key`. */
const keptQuestions = (
  key: string,
  text: string,
  beside: readonly Beside[]
): [string, Experimental_DecisionQuestion][] =>
  beside.map((kept): [string, Experimental_DecisionQuestion] => [
    `kept:${key}:${kept.id}`,
    {
      type: "boolean",
      instructions: {
        lesson: text,
        kept: kept.text,
        question: memoryJevWords.keptQuestion,
      },
      criteria: memoryJevWords.keptCriteria,
    },
  ]);

/** The one of `beside` Jev read yes of under `key`, saying what the lesson asked says: the likeliest at or over {@link SAME}. */
const likeliest = (
  key: string,
  beside: readonly { id: string }[],
  answers: Map<string, number> | undefined
): string | undefined => {
  let best: { id: string; score: number } | undefined;
  for (const kept of beside) {
    const score = answers?.get(`kept:${key}:${kept.id}`) ?? 0;
    if (score >= SAME && score > (best?.score ?? 0)) {
      best = { id: kept.id, score };
    }
  }
  return best?.id;
};

/** A message's source as a commit message names it: the send, by reference. */
const saidSource = (said: PersonSaid): string =>
  memoryRunWords.sourceSaid(
    said.uuid,
    said.instanceId,
    said.acceptedAt.toISOString()
  );

/** A note's source as a commit message names it: the note, by its id. */
const noteSource = (note: Note): string =>
  memoryRunWords.sourceNote(note.id, note.session);

/** A commit message: its subject, then its sources, one a line. */
const withSources = (subject: string, sources: readonly string[]): string =>
  sources.length > 0
    ? `${subject}\n\n${memoryRunWords.sourcesHead}\n${sources.map((one) => `- ${one}`).join("\n")}`
    : subject;

/** The `Why:` line the re-test wrote when it moved a rule out of AGENTS.md (removed 2026-11-24): what the one-time commit of the ledger's end undoes. */
const RETEST_WHY =
  /^\S+ did this unprompted in three of three probes on \d{4}-\d{2}-\d{2}, so it moved here from where every session loads it\.$/u;
/** The ledger the memory kept until 2026-11-24, read once by the commit that takes it out ({@link MemoryRun} `ledgerGone`). */
const OLD_LEDGER = "memory/lessons.json";
/** The ledger's entries as that commit reads them: state, sources and staged words, each loose. */
const OldLedgerSchema = z.object({
  lessons: z.record(
    z.string(),
    z.object({
      state: z.string(),
      sources: z.array(z.record(z.string(), z.unknown())).catch([]),
      staged: z
        .object({
          home: z.object({ at: z.string(), topic: z.string().optional() }),
          text: z.string(),
        })
        .optional()
        .catch(undefined),
    })
  ),
});

/** A source of the old ledger as the commit message names it. */
const oldSource = (source: Record<string, unknown>): string | undefined => {
  const text = (key: string): string => {
    const value = source[key];
    return typeof value === "string" ? value : "";
  };
  switch (text("kind")) {
    case "said":
      return memoryRunWords.sourceSaid(
        text("send"),
        text("session"),
        text("at")
      );
    case "note":
      return memoryRunWords.sourceNote(text("id"), text("session"));
    case "file":
      return memoryRunWords.sourceFile(text("path"), text("match"));
    case "approved":
    case "hand":
      return memoryRunWords.sourceCommit(text("kind"), text("commit"));
    default:
      return;
  }
};

export const createMemoryRun = ({
  db,
  fleetHosts,
  folderChanged,
  machine,
  skillsFor,
  tasks,
}: MemoryRunDeps) => {
  /** Each project's run under way. */
  const runs = new Map<string, Run>();

  const projectOf = (projectId: string) => {
    const project = db.project(projectId);
    return project
      ? project
      : problem(404, {
          code: "memory-project-unknown",
          detail: `The hub keeps no project ${projectId}.`,
        });
  };

  // --- the files ----------------------------------------------------------------

  /** The memory files as they stand on disk, by path. */
  const filesOf = async (projectId: string) => {
    const paths = await memoryFiles(projectId);
    if (paths instanceof ElysiaStatus) {
      return paths;
    }
    const files: Record<string, string> = {};
    for (const path of paths.filter((each) => each.endsWith(".md"))) {
      const text = await fileOr(projectId, path);
      // A binary file of the brand kit is not read as words.
      if (text instanceof ElysiaStatus) {
        if (text.status === 413 || text.status === 415) {
          continue;
        }
        return text;
      }
      files[path] = text;
    }
    const read: MemoryFiles = files;
    return read;
  };

  /**
   * The one way the project's memory changes (§5.2 step 7): in the folder's
   * commit queue (project-folder.ts `changeFolderInTurn`), the files read
   * from disk, `decide` works out its change on them, and it is committed
   * before any other commit lands, so no writer writes over another and
   * nothing is tried twice. `decide` only reads and works out: what is slow
   * (Jev, a machine's file, the tasks) is done before, on a read of its
   * own. Its change is the files after, each note it consumes archived with
   * what came of it, and files of `memory/` beside them; a note that left
   * the inbox meanwhile refuses it, no longer there. Its answer, or why
   * not (a sentence for the curator, or the folder's refusal); nothing is
   * written when nothing changed.
   */
  const written = async <T>(
    projectId: string,
    decide: (
      files: MemoryFiles
    ) => MemoryWrite<T> | Refusal | Promise<MemoryWrite<T> | Refusal>
  ): Promise<{ sha?: string; value: T } | Refusal> => {
    const done = await changeFolderInTurn(
      projectId,
      async (): Promise<
        | {
            change?: FolderChangeAsked;
            value: { kept: T } | { refused: string };
          }
        | AnyProblem
      > => {
        const files = await filesOf(projectId);
        if (isProblem(files)) {
          return files;
        }
        const decided = await decide(files);
        if (isProblem(decided)) {
          return decided;
        }
        if (typeof decided === "string") {
          return { value: { refused: decided } };
        }
        for (const { note } of decided.notes ?? []) {
          if ((await fileOr(projectId, note.path)) === "") {
            return { value: { refused: memoryRunWords.noteGone(note.id) } };
          }
        }
        const change = changeOf(files, decided);
        return change
          ? { change, value: { kept: decided.value } }
          : { value: { kept: decided.value } };
      }
    );
    if (isProblem(done)) {
      return done;
    }
    if ("refused" in done.value) {
      return done.value.refused;
    }
    if (done.commits) {
      folderChanged(projectId);
      console.log(
        `[memory] ${projectId}: ${done.commits.paths.length} file(s) at ${done.commits.sha.slice(0, 9)}`
      );
    }
    return {
      value: done.value.kept,
      ...(done.commits ? { sha: done.commits.sha } : {}),
    };
  };

  /** A decided write as the folder commits it: every memory file it changed, each note archived, the extra files, the files taken out; none when nothing changed. */
  const changeOf = <T>(
    files: MemoryFiles,
    { after, author, extra, gone = [], message, notes = [] }: MemoryWrite<T>
  ) => {
    const writes = Object.entries(after).flatMap(([path, content]) =>
      content !== undefined && content !== files[path]
        ? [{ path, content }]
        : []
    );
    for (const { note, outcome } of notes) {
      writes.push(archivedNote(note, outcome));
    }
    writes.push(...(extra ?? []));
    const archived = new Set(
      notes.map(({ note }) => archivedNote(note, "").path)
    );
    const deletes = [
      ...notes
        .map(({ note }) => note.path)
        .filter((path) => !archived.has(path)),
      ...gone,
    ];
    return writes.length + deletes.length === 0
      ? undefined
      : { writes, deletes, author, message };
  };

  /** Each knowledge lesson's last carry into a brief (db `fact_uses`), by its id. */
  const usesOf = (projectId: string): ReadonlyMap<string, Date> =>
    db.memoryFacts.lessonUses(projectId);

  /** `files` with `change` made, or as they were when it cannot be (its lesson gone, a file past its budget): upkeep's own changes. */
  const changedBy = (files: MemoryFiles, change: Change): MemoryFiles => {
    const done = applyLineChange(files, change);
    return "files" in done ? done.files : files;
  };

  // --- upkeep ------------------------------------------------------------------

  /**
   * The project's memory made whole before a run reads it (§2 A): the index
   * in its shape and every bullet of a home given an id; inbox notes no run
   * reached in a week let go; a knowledge line no brief carried and no
   * commit touched for the archive's days archived; a line whose anchor's
   * file no longer holds its match taken out; a rule whose check's task is
   * done taken out. The machines, the tasks and git are read first; what
   * they found is made on the memory as it stands, in one commit,
   * `memory: upkeep <day>`, its message saying why each line left.
   */
  const upkeep = async (project: ProjectRow) => {
    const first = await filesOf(project.id);
    if (isProblem(first)) {
      return first;
    }
    const today = dayOf(new Date());
    const since = new Date(Date.now() - MEMORY_ARCHIVE_DAYS * DAY_MS);
    const touched = await touchedSince(project.id, since);
    if (isProblem(touched)) {
      return touched;
    }
    const out = [
      ...(await anchorsGone(project.id, first)),
      ...(await checksDone(project.id, first)),
    ];
    return await written(project.id, async (files) => {
      const why: string[] = [];
      let after = unusedArchived(
        shaped(project.name, files),
        { touched, uses: usesOf(project.id), today },
        why
      );
      for (const { id, said } of out) {
        if (lessonOf(after, id)) {
          after = changedBy(after, { kind: "remove", id });
          why.push(said);
        }
      }
      const inbox = await notesIn(project.id, INBOX_DIR);
      if (inbox instanceof ElysiaStatus) {
        return inbox;
      }
      return {
        after,
        author: HUB,
        message:
          why.length > 0
            ? `memory: upkeep ${today}\n\n${why.map((one) => `- ${one}`).join("\n")}`
            : `memory: upkeep ${today}`,
        notes: inbox
          .filter((note) => olderThan(dayOf(note.time), today, NOTE_DAYS))
          .map((note) => ({ note, outcome: "dropped: unread" })),
        value: undefined,
      };
    });
  };

  /** `files` with each knowledge line no brief carried and no commit touched for the archive's days archived, why said into `why`. */
  const unusedArchived = (
    files: MemoryFiles,
    read: {
      today: string;
      touched: ReadonlySet<string>;
      uses: ReadonlyMap<string, Date>;
    },
    why: string[]
  ): MemoryFiles => {
    let after = files;
    for (const { line, path } of allLessons(files)) {
      const used = read.uses.get(line.id);
      const carried =
        used !== undefined &&
        !olderThan(dayOf(used), read.today, MEMORY_ARCHIVE_DAYS);
      if (
        homeOf(path)?.at === "knowledge" &&
        !read.touched.has(line.id) &&
        !carried
      ) {
        after = changedBy(after, { kind: "archive", id: line.id });
        why.push(memoryRunWords.upkeepArchived(line.id, MEMORY_ARCHIVE_DAYS));
      }
    }
    return after;
  };

  /** `files` with the index in its shape and every bullet of a home given an id. */
  const shaped = (projectName: string, files: MemoryFiles): MemoryFiles => {
    const taken = new Set(keptLessons(files).map((each) => each.id));
    const after: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if (content === undefined) {
        continue;
      }
      const marked = homeOf(path)
        ? withIds(path, content, (id) => taken.has(id))
        : content;
      after[path] =
        path === INDEX_FILE ? indexShape(projectName, marked) : marked;
    }
    return after;
  };

  /** The lessons git shows a commit put in or named since `since` (a line added, or its id in a subject): those a disuse archive leaves. */
  const touchedSince = async (projectId: string, since: Date) => {
    const changes = await folderLineChanges(projectId, [KNOWLEDGE_DIR], since);
    if (isProblem(changes)) {
      return changes;
    }
    const touched = new Set<string>();
    for (const change of changes) {
      for (const line of change.added) {
        const id = lessonLineOf(line)?.id;
        if (id) {
          touched.add(id);
        }
      }
      for (const id of change.subject.match(LESSON_ID) ?? []) {
        touched.add(id);
      }
    }
    return touched;
  };

  /**
   * Every line whose anchor's file is read again (§2 A.3) on a machine of the
   * project: one whose file or match is gone, to take out, and why. A file
   * no machine answered for is tried the next night.
   */
  const anchorsGone = async (
    projectId: string,
    files: MemoryFiles
  ): Promise<{ id: string; said: string }[]> => {
    const places = checkoutsOf(projectId);
    const gone: { id: string; said: string }[] = [];
    for (const { line } of allLessons(files)) {
      if (
        line.anchor &&
        (await anchorRead(machine, places, line.anchor)).kind === "gone"
      ) {
        gone.push({
          id: line.id,
          said: memoryRunWords.upkeepAnchorGone(
            line.id,
            line.anchor.path,
            line.anchor.match
          ),
        });
      }
    }
    return gone;
  };

  /**
   * Every line whose check's task is done (§2 A.4), found by the task's
   * `check` field over every task of any state: the check holds the rule,
   * so its line is taken out.
   */
  const checksDone = async (
    projectId: string,
    files: MemoryFiles
  ): Promise<{ id: string; said: string }[]> => {
    const filed = await tasks.withField(projectId, CHECK_FIELD);
    if ("refused" in filed) {
      console.warn(
        `[memory] ${projectId}: its checks' tasks were not read: ${filed.refused}`
      );
      return [];
    }
    return filed.flatMap((task) =>
      task.kind === "done" && lessonOf(files, task.value)
        ? [
            {
              id: task.value,
              said: memoryRunWords.upkeepChecked(task.value, task.id),
            },
          ]
        : []
    );
  };

  // --- the night's reading ------------------------------------------------------

  /** `memory/state.json`, or where a project with none starts. */
  const stateOf = (projectId: string) =>
    readJson<MemoryRunState>(projectId, RUN_STATE_FILE, RunStateSchema, {
      carried: [],
      lastRun: null,
      through: "",
    });

  /**
   * What the person said since the last run, oldest first: the messages
   * carried from it, then those after its mark, at most a week back and
   * {@link RUN_SAID} in all.
   */
  const saidSince = (projectId: string, state: MemoryRunState, now: Date) => {
    const weekAgo = new Date(now.getTime() - SAID_DAYS * DAY_MS);
    const mark = state.through ? new Date(state.through) : weekAgo;
    const after = mark > weekAgo ? mark : weekAgo;
    const carried = state.carried.flatMap((uuid): PersonSaid[] => {
      const row = db.sendRecord(uuid);
      const text = sentText(uuid);
      return row && text !== undefined
        ? [
            {
              uuid,
              instanceId: row.instanceId,
              acceptedAt: row.acceptedAt,
              text,
            },
          ]
        : [];
    });
    const fresh = db.personSaidIn(
      projectId,
      after,
      now,
      RUN_SAID - carried.length
    );
    return [
      ...carried,
      ...fresh.filter((said) => !state.carried.includes(said.uuid)),
    ];
  };

  /**
   * One Jev request for each {@link JEV_QUESTIONS} questions over one state
   * (§2 B): per message of {@link SAID_WORDS} words or more, whether it says
   * how agents work here. Undefined with Jev off (the log says so); Jev
   * failing throws its words.
   */
  const jevRead = async (project: ProjectRow, said: PersonSaid[]) => {
    const key = jevAccess(db);
    if (!key) {
      offLine(
        "said",
        project.id,
        `the run reads the newest ${AGENT_SAID} of ${said.length} messages unsorted`
      );
      return;
    }
    const asked = readQuestions(project.name, said);
    const read: JevRead = { kinds: new Map(), instruction: new Map() };
    await inBatches(
      project.id,
      key,
      { project: project.name },
      asked,
      (answers) => readAnswers(answers, read)
    );
    return read;
  };

  // --- the brief -----------------------------------------------------------------

  /** The lessons of `kept` a message shares the most words with, at most {@link RELATED}: what it may repeat or change. */
  const relatedTo = (text: string, kept: readonly Kept[]): Kept[] => {
    const words = wordsOf(text);
    return kept
      .map((lesson) => ({ lesson, score: grepScore(words, lesson.text) }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, RELATED)
      .map(({ lesson }) => lesson);
  };

  /** The skill lessons and knowledge files, each by name, first line, line count and size; the room each budget has left. */
  const filesText = (files: MemoryFiles, run: Run): string => {
    const listed = Object.keys(files)
      .filter((path) => path !== INDEX_FILE && homeOf(path))
      .sort()
      .map((path) => {
        const content = files[path] ?? "";
        const first =
          content
            .split("\n")
            .find((line) => line.trim() !== "")
            ?.replace(HEADING_MARKS, "") ?? "";
        const count = allLessons({ [path]: content }).length;
        return `- ${path}: ${first} (${count} lesson${count === 1 ? "" : "s"}, ${content.length} characters)`;
      });
    const index = files[INDEX_FILE] ?? "";
    return [
      memoryRunWords.briefFiles,
      listed.length > 0 ? listed.join("\n") : memoryRunWords.briefNoFiles,
      memoryRunWords.briefRoom(
        index.length,
        CAPS.indexChars,
        MEMORY_FILE_CHARS,
        Math.max(0, CAPS.nightAdds - run.adds),
        Math.max(0, CAPS.nightChanges - run.changes)
      ),
    ].join("\n\n");
  };

  /** The root a note's session hangs from, as its brief names it: the session at the top of its chain. */
  const rootOfNote = (note: Note): string => {
    const row = (id: string) => db.getInstancesByIds([id]).at(0);
    const own = row(note.session);
    return own ? rootOf(own, row) : note.session;
  };

  /** The brief's text: the messages, the notes, the index, the lines taken out since the last run, the files and the skills. */
  const briefText = (project: ProjectRow, files: MemoryFiles, run: Run) => {
    const live = keptLessons(files);
    const listed = [...run.messages].map(([handle, given]) => {
      // The lessons grep pairs it with: what it may state again or change.
      const related = relatedTo(given.text, live);
      return [
        `### ${handle} · ${dayOf(given.said.acceptedAt)} · ${given.session}`,
        given.text,
        ...(related.length > 0
          ? [
              `${memoryRunWords.briefRelated}\n${related.map((line) => `- ${line.id}: ${line.text}`).join("\n")}`,
            ]
          : []),
      ].join("\n\n");
    });
    const notes = [...run.notes.values()].map(
      (note) =>
        `### ${note.id} · ${dayOf(note.time)} · ${sessionHandle(run, rootOfNote(note))}\n\n${note.text}`
    );
    const skills = skillsFor(project.id);
    return [
      listed.length > 0
        ? [memoryRunWords.briefMessages(listed.length), ...listed].join("\n\n")
        : memoryRunWords.briefNoMessages,
      notes.length > 0
        ? [memoryRunWords.briefNotes(notes.length), ...notes].join("\n\n")
        : memoryRunWords.briefNoNotes,
      `${memoryRunWords.briefIndex}\n\n${(files[INDEX_FILE] ?? "").trim()}`,
      ...(run.removed.length > 0
        ? [
            [
              memoryRunWords.briefRemoved(run.removed.length),
              ...run.removed.map(
                (one) => `- ${one.id} (${dayOf(one.at)}): ${one.text}`
              ),
            ].join("\n"),
          ]
        : []),
      filesText(files, run),
      `${memoryRunWords.briefSkills}\n\n${
        skills.length > 0
          ? skills
              .map((skill) => `- ${skill.name}: ${skill.description}`)
              .join("\n")
          : memoryRunWords.briefNoSkills
      }`,
    ].join("\n\n");
  };

  /** The handle a session goes by in this run's brief (`s1`), given on first use. */
  const sessionHandle = (run: Run, session: string): string => {
    const known = sessionHandles.get(run)?.get(session);
    if (known) {
      return known;
    }
    const handles = sessionHandles.get(run) ?? new Map<string, string>();
    sessionHandles.set(run, handles);
    const handle = `s${handles.size + 1}`;
    handles.set(session, handle);
    return handle;
  };
  const sessionHandles = new WeakMap<Run, Map<string, string>>();

  /**
   * What the nightly run reads, made ready (§2 A and B): upkeep, the
   * messages since the last run, sorted by Jev, and the notes waiting.
   * `none` when nothing is left for the run, its mark kept; else the
   * brief. Jev failing throws its words.
   */
  const brief = async (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const night = await nightRead(project);
    if (isProblem(night)) {
      return night;
    }
    const { state, said, waiting, jev } = night;
    const instructions = instructionsOf(said, jev);
    const carriedNow = new Set(state.carried);
    const run = newRun(jev !== undefined, waiting, {
      read: said.length,
      notes: waiting.length,
    });
    run.through = said.at(-1)?.acceptedAt ?? null;
    run.carried = new Set(
      instructions
        .slice(AGENT_SAID)
        .map((one) => one.uuid)
        .filter((uuid) => !carriedNow.has(uuid))
    );
    run.said = said.map((one) => one.text);
    const given = instructions
      .slice(0, AGENT_SAID)
      .sort((a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime());
    for (const one of given) {
      run.messages.set(`m${run.messages.size + 1}`, {
        said: one,
        text: cut(one.text),
        session: sessionHandle(run, one.instanceId),
      });
    }
    const since = state.lastRun
      ? new Date(state.lastRun.at)
      : new Date(Date.now() - SAID_DAYS * DAY_MS);
    return await ready(project, run, since);
  };

  /**
   * A night's reading, made ready: upkeep, the messages since the last run
   * and the notes waiting, and Jev's word on each message.
   */
  const nightRead = async (project: ProjectRow) => {
    const kept = await upkeep(project);
    if (typeof kept === "string") {
      return problem(409, { code: "memory-upkeep-refused", detail: kept });
    }
    if (isProblem(kept)) {
      return kept;
    }
    const state = await stateOf(project.id);
    if (state instanceof ElysiaStatus) {
      return state;
    }
    const said = saidSince(project.id, state, new Date());
    const inbox = await notesIn(project.id, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const waiting = inbox.slice(0, RUN_NOTES);
    const jev = await jevRead(project, said);
    return { state, said, waiting, jev };
  };

  /**
   * A run made ready: kept under way and briefed, the lesson lines taken
   * out since `since` (the last run, else the week a night reads) read off
   * git; or, with nothing to read, its mark kept and `none`.
   */
  const ready = async (project: ProjectRow, run: Run, since: Date) => {
    if (run.messages.size === 0 && run.notes.size === 0) {
      runs.delete(project.id);
      const marked = await closed(project.id, run, "silent");
      if (marked) {
        return marked;
      }
      return { kind: "none" as const, reason: memoryRunWords.nothingToRead };
    }
    const files = await filesOf(project.id);
    if (isProblem(files)) {
      return files;
    }
    const changes = await folderLineChanges(project.id, LESSON_PATHS, since);
    if (isProblem(changes)) {
      return changes;
    }
    run.removed = removedOf(changes, files);
    runs.set(project.id, run);
    return {
      kind: "run" as const,
      text: briefText(project, files, run),
    };
  };

  // --- memory_apply ------------------------------------------------------------------

  /** A source handle or note id resolved against the run: a message, a note, or why not. */
  const sourceOf = (run: Run, handle: string) => {
    const given = run.messages.get(handle);
    if (given) {
      return { kind: "message" as const, handle, given };
    }
    const note = run.notes.get(handle);
    return note ? { kind: "note" as const, note } : undefined;
  };

  type Resolved = NonNullable<ReturnType<typeof sourceOf>>;

  /** The Jev questions of operation `index`: each message's support for its lesson, or, for a removal, whether it asks the rule gone. */
  const opQuestions = (
    run: Run,
    op: MemoryOp,
    index: number,
    files: MemoryFiles
  ): [string, Experimental_DecisionQuestion][] => {
    if (op.op === "drop" || op.op === "move") {
      return [];
    }
    const text =
      "text" in op ? op.text : (lessonOf(files, op.id)?.line.text ?? "");
    const removal = op.op === "remove";
    return op.sources.flatMap(
      (handle): [string, Experimental_DecisionQuestion][] => {
        const found = sourceOf(run, handle);
        return found?.kind === "message"
          ? [
              [
                `support:${index}:${found.handle}`,
                {
                  type: "boolean",
                  instructions: {
                    message: found.given.text,
                    lesson: text,
                    question: removal
                      ? memoryJevWords.removeQuestion
                      : memoryJevWords.supportQuestion,
                  },
                  criteria: removal
                    ? memoryJevWords.removeCriteria
                    : memoryJevWords.supportCriteria,
                },
              ],
            ]
          : [];
      }
    );
  };

  /** The Jev questions one call asks ({@link opQuestions}), by name. */
  const questionsOf = (run: Run, ops: MemoryOp[], files: MemoryFiles) =>
    Object.fromEntries(
      ops.flatMap((op, index) => opQuestions(run, op, index, files))
    );

  /** The home an operation names; or why it is none. */
  const homeAsked = (
    projectId: string,
    home: Extract<MemoryOp, { op: "add" }>["home"]
  ): LessonHome | string => {
    if (home === "index") {
      return { at: "index" };
    }
    if ("skill" in home) {
      const listed = skillsFor(projectId).some(
        (skill) => skill.name === home.skill
      );
      return listed && isSkillName(home.skill)
        ? { at: "skill", skill: home.skill }
        : memoryRunWords.noSkill(home.skill);
    }
    return isTopic(home.knowledge)
      ? { at: "knowledge", topic: home.knowledge }
      : memoryRunWords.noTopic(home.knowledge);
  };

  /** Why a lesson's words may not stand, or nothing: one line, its length, no quote, no secret, not said already, and an agent's with no outside page. */
  const textProblem = async (
    run: Run,
    files: MemoryFiles,
    lesson: { home: LessonHome; text: string; why: string | undefined },
    byAgent: boolean
  ): Promise<string | undefined> => {
    const { home, text, why } = lesson;
    const unshaped = shapeProblem(text, why, home);
    if (unshaped) {
      return unshaped;
    }
    for (const words of [text, why ?? ""]) {
      const said = wordsProblem(words, run.said);
      if (said) {
        return said;
      }
      if ((await redactSecrets(words)) !== words) {
        return memoryRunWords.secret;
      }
    }
    const kept = Object.entries(files).find(
      ([path, content]) => homeOf(path) && content && saysAlready(content, text)
    );
    if (kept) {
      return memoryRunWords.saysAlready(kept[0]);
    }
    if (byAgent && outsideUrls(text, fleetHosts()).length > 0) {
      return memoryRunWords.outsideUrl;
    }
  };

  /** The sources Jev bears out for operation `index`: messages at or over {@link SUPPORTS}, notes as cited; why none is left otherwise. */
  const supported = (
    run: Run,
    index: number,
    resolved: Resolved[],
    answers: Map<string, number> | undefined
  ): { messages: Given[]; notes: Note[] } | string => {
    const messages = resolved.flatMap((found) =>
      found.kind === "message"
        ? [{ found, score: answers?.get(`support:${index}:${found.handle}`) }]
        : []
    );
    const notes = resolved.flatMap((found) =>
      found.kind === "note" ? [found.note] : []
    );
    if (!run.jev || messages.length === 0) {
      return { messages: messages.map(({ found }) => found.given), notes };
    }
    const held = messages.filter(({ score }) => (score ?? 0) >= SUPPORTS);
    if (held.length === 0) {
      const best = Math.max(...messages.map(({ score }) => score ?? 0));
      return memoryRunWords.notSupported(best, SUPPORTS);
    }
    return { messages: held.map(({ found }) => found.given), notes };
  };

  /** What an operation rests on, each source as its commit message names it. */
  const sourcesOf = (kept: { messages: Given[]; notes: Note[] }): string[] => [
    ...kept.messages.map((given) => saidSource(given.said)),
    ...kept.notes.map(noteSource),
  ];

  /** When the newest of an operation's sources was said or noted. */
  const newestOf = (kept: { messages: Given[]; notes: Note[] }): Date =>
    new Date(
      Math.max(
        0,
        ...kept.messages.map((given) => given.said.acceptedAt.getTime()),
        ...kept.notes.map((note) => Date.parse(note.time) || 0)
      )
    );

  /** What one checked operation commits, and the notes it consumes with their outcome; or why it is refused. */
  type Planned =
    | {
        /** None for a drop or a corroboration, which change no line. */
        change?: Change;
        consumed: string[];
        notes: { note: Note; outcome: string }[];
        said: string;
        /** What it rests on, as its commit message names each. */
        sources: string[];
        /** A check to file for a lesson once the commit stands. */
        check?: CheckAsk;
      }
    | string;

  /** An `add`, checked (§5.2): its sources, its words, its home; an agent's lands as the person's does, in knowledge. */
  const plannedAdd = async (
    projectId: string,
    run: Run,
    files: MemoryFiles,
    op: Extract<MemoryOp, { op: "add" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> => {
    const kept = checkedSources(run, op.sources, index, answers);
    if (typeof kept === "string") {
      return kept;
    }
    const byAgent = kept.messages.length === 0;
    const text = op.text.trim();
    const why = op.why?.trim() || undefined;
    const home = await checkedLesson(
      projectId,
      run,
      files,
      op.home,
      { text, why, byAgent },
      newestOf(kept)
    );
    if (typeof home === "string") {
      return home;
    }
    if (run.adds >= CAPS.nightAdds) {
      return memoryRunWords.nightAdds(CAPS.nightAdds);
    }
    const anchor = op.anchor ? await anchored(projectId, op.anchor) : null;
    if (typeof anchor === "string") {
      return anchor;
    }
    const taken = new Set(keptLessons(files).map((each) => each.id));
    const id = newLessonId((one) => taken.has(one));
    const line: LessonLine = { id, text, why: why ?? null, anchor };
    return {
      change: { kind: "add", home, line },
      consumed: op.sources,
      notes: kept.notes.map((note) => ({
        note,
        outcome: byAgent ? `landed ${id}` : `corroborates ${id}`,
      })),
      said: memoryRunWords.added(id, pathOf(home)),
      sources: sourcesOf(kept),
    };
  };

  /**
   * What Jev reads a new lesson as, in one request: one that says what a
   * kept one says ({@link likeliest}) is refused, naming the one to
   * corroborate, of every live lesson in its home and the index, this
   * run's earlier adds among them (each is in `files`); one that says what
   * a line of `removed` said is refused as taken out since the last run.
   * With Jev off the lesson is refused: Jev reads whether a kept lesson
   * says it and what its sources state, and the night's messages named in
   * no operation are carried to the next. Jev failing, its words.
   */
  const jevOnNew = async (
    projectId: string,
    run: Run,
    files: MemoryFiles,
    lesson: { home: LessonHome; text: string },
    removed: readonly Removed[]
  ): Promise<string | undefined> => {
    if (!run.jev) {
      return memoryRunWords.jevFailed(
        "Jev is off, and a new lesson waits for it"
      );
    }
    const beside = [...besideOf(files, lesson.home), ...removed];
    try {
      const answers = await answersOf(
        projectId,
        Object.fromEntries(keptQuestions("add", lesson.text, beside))
      );
      const id = likeliest("add", beside, answers);
      const gone = removed.find((one) => one.id === id);
      if (gone) {
        return memoryRunWords.removedSince(gone.id, dayOf(gone.at));
      }
      return id ? memoryRunWords.keptAlready(id) : undefined;
    } catch (error) {
      return memoryRunWords.jevFailed(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  /**
   * An anchor checked and read (§4.3): a path inside the project's
   * checkout and a literal match of at most {@link ANCHOR_MATCH} characters
   * on one line, the file read at the first checkout whose machine answers.
   * The anchor when the match is there, or when no machine answered (read
   * again each night); why not when the file or the match is not there, or
   * the anchor does not read.
   */
  const anchored = async (
    projectId: string,
    asked: { match: string; path: string }
  ): Promise<Anchor | string> => {
    const path = folderPath(asked.path.trim());
    const match = asked.match.trim();
    if (
      path instanceof ElysiaStatus ||
      path === "" ||
      path.includes(" | ") ||
      match === "" ||
      match.includes("\n") ||
      match.length > ANCHOR_MATCH
    ) {
      return memoryRunWords.anchorUnfit(ANCHOR_MATCH);
    }
    const read = await anchorRead(machine, checkoutsOf(projectId), {
      path,
      match,
    });
    return read.kind === "gone"
      ? memoryRunWords.anchorGone(path, match)
      : { path, match };
  };

  /** The project's checkouts, the primary first, as an anchor is read at. */
  const checkoutsOf = (projectId: string): AnchorPlace[] =>
    (db.project(projectId)?.places ?? []).flatMap((place) =>
      place.kind === "checkout"
        ? [{ machineId: place.machineId, path: place.path }]
        : []
    );

  /** An operation's sources resolved against the run, the messages Jev bears out kept; or why not. */
  const checkedSources = (
    run: Run,
    handles: string[],
    index: number,
    answers: Map<string, number> | undefined
  ) => {
    const resolved = resolvedSources(run, handles);
    return typeof resolved === "string"
      ? resolved
      : supported(run, index, resolved, answers);
  };

  /** A new lesson's home as asked, and its words, checked: an agent's goes to knowledge, no kept lesson says it already ({@link jevOnNew}), and no line taken out since the last run says it unless a source is newer; the home, or why not. */
  const checkedLesson = async (
    projectId: string,
    run: Run,
    files: MemoryFiles,
    asked: Extract<MemoryOp, { op: "add" }>["home"],
    lesson: { byAgent: boolean; text: string; why: string | undefined },
    newest: Date
  ): Promise<LessonHome | string> => {
    const home = homeAsked(projectId, asked);
    if (typeof home === "string") {
      return home;
    }
    if (lesson.byAgent && home.at !== "knowledge") {
      return memoryRunWords.agentHome;
    }
    const bad = await textProblem(
      run,
      files,
      { home, text: lesson.text, why: lesson.why },
      lesson.byAgent
    );
    if (bad) {
      return bad;
    }
    // A line taken out since the last run stays out, unless a source is newer than its removal.
    const removed = run.removed.filter((one) => one.at > newest);
    const gone = removed.find(
      (one) =>
        saysAlready(one.text, lesson.text) || saysAlready(lesson.text, one.text)
    );
    if (gone) {
      return memoryRunWords.removedSince(gone.id, dayOf(gone.at));
    }
    const kept = await jevOnNew(
      projectId,
      run,
      files,
      { home, text: lesson.text },
      removed
    );
    return kept ?? home;
  };

  /** Each handle resolved, or why one is not this run's. */
  const resolvedSources = (
    run: Run,
    handles: string[]
  ): Resolved[] | string => {
    if (handles.length === 0) {
      return memoryRunWords.noSources;
    }
    const resolved: Resolved[] = [];
    for (const handle of handles) {
      const found = sourceOf(run, handle);
      if (!found) {
        return memoryRunWords.notAHandle(handle);
      }
      resolved.push(found);
    }
    return resolved;
  };

  /**
   * Why `kept` may not change a line of `path` (§4.4), or nothing: a rule
   * of the index or a skill's lessons changes only on a message of the
   * person's, which Jev reads (a fact of knowledge, on a note too).
   */
  const changeAuthority = (
    run: Run,
    path: string,
    kept: { messages: Given[] }
  ): string | undefined => {
    if (kept.messages.length > 0) {
      return run.jev
        ? undefined
        : memoryRunWords.jevFailed(
            "Jev is off, and a change to a kept lesson waits for it"
          );
    }
    return homeOf(path)?.at === "knowledge"
      ? undefined
      : memoryRunWords.ruleNeedsMessage;
  };

  /**
   * The live lesson an operation names and its sources, the messages Jev
   * bears out kept; with `change`, only what may change it
   * ({@link changeAuthority}). Why not otherwise.
   */
  const keptFor = (
    run: Run,
    files: MemoryFiles,
    op: { id: string; sources: string[] },
    at: { answers: Map<string, number> | undefined; index: number },
    change: boolean
  ) => {
    const held = lessonOf(files, op.id);
    if (!held) {
      return memoryRunWords.noLesson(op.id);
    }
    const kept = checkedSources(run, op.sources, at.index, at.answers);
    if (typeof kept === "string") {
      return kept;
    }
    const authority = change
      ? changeAuthority(run, held.path, kept)
      : undefined;
    return authority ?? { held, kept };
  };

  /** A `reword`, checked: a live lesson's words changed in place, a rule's only by the person's message. */
  const plannedReword = async (
    run: Run,
    files: MemoryFiles,
    op: Extract<MemoryOp, { op: "reword" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> => {
    const found = keptFor(run, files, op, { index, answers }, true);
    if (typeof found === "string") {
      return found;
    }
    const { held, kept } = found;
    const text = op.text.trim();
    const why = op.why.trim();
    const bad = await textProblem(
      run,
      files,
      { home: homeOf(held.path) ?? { at: "index" }, text, why },
      kept.messages.length === 0
    );
    if (bad) {
      return bad;
    }
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      change: { kind: "reword", id: op.id, text, why: why || null },
      consumed: op.sources,
      notes: kept.notes.map((note) => ({ note, outcome: `landed ${op.id}` })),
      said: memoryRunWords.reworded(op.id, held.path),
      sources: sourcesOf(kept),
    };
  };

  /** A `remove`, checked: a live lesson's line taken out, a rule's only by the person's message asking it gone. */
  const plannedRemove = (
    run: Run,
    files: MemoryFiles,
    op: Extract<MemoryOp, { op: "remove" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Planned => {
    const found = keptFor(run, files, op, { index, answers }, true);
    if (typeof found === "string") {
      return found;
    }
    const { held, kept } = found;
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      change: { kind: "remove", id: op.id },
      consumed: op.sources,
      notes: kept.notes.map((note) => ({ note, outcome: `removes ${op.id}` })),
      said: memoryRunWords.removed(op.id, held.path),
      sources: sourcesOf(kept),
    };
  };

  /** A `corroborate`, checked: a source stated a live lesson again; its notes are archived as corroborating it, no line changes. */
  const plannedCorroborate = (
    run: Run,
    files: MemoryFiles,
    op: Extract<MemoryOp, { op: "corroborate" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Planned => {
    const found = keptFor(run, files, op, { index, answers }, false);
    if (typeof found === "string") {
      return found;
    }
    const { kept } = found;
    return {
      consumed: op.sources,
      notes: kept.notes.map((note) => ({
        note,
        outcome: `corroborates ${op.id}`,
      })),
      said: memoryRunWords.corroborated(op.id),
      sources: sourcesOf(kept),
    };
  };

  /** A `move`, checked: a live lesson to another home. */
  const plannedMove = (
    projectId: string,
    run: Run,
    files: MemoryFiles,
    op: Extract<MemoryOp, { op: "move" }>
  ): Planned => {
    if (!lessonOf(files, op.id)) {
      return memoryRunWords.noLesson(op.id);
    }
    const home = homeAsked(projectId, op.home);
    if (typeof home === "string") {
      return home;
    }
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      change: { kind: "move", id: op.id, home },
      consumed: [],
      notes: [],
      said: memoryRunWords.moved(op.id, pathOf(home)),
      sources: [],
    };
  };

  /**
   * A `drop`, checked: its sources are this run's, and a duplicate names
   * the live lesson it says again (`of`); its notes leave for the archive
   * with the reason, a duplicate's naming that lesson.
   */
  const plannedDrop = (
    run: Run,
    files: MemoryFiles,
    op: Extract<MemoryOp, { op: "drop" }>
  ): Planned => {
    const resolved = resolvedSources(run, op.sources);
    if (typeof resolved === "string") {
      return resolved;
    }
    let outcome = `dropped: ${op.reason}`;
    if (op.reason === "duplicate") {
      const of = op.of?.trim();
      if (!of) {
        return memoryRunWords.duplicateOf;
      }
      if (!lessonOf(files, of)) {
        return memoryRunWords.noLesson(of);
      }
      outcome = duplicateOutcome(of);
    }
    return {
      consumed: op.sources,
      notes: resolved.flatMap((found) =>
        found.kind === "note" ? [{ note: found.note, outcome }] : []
      ),
      said: memoryRunWords.dropped(
        op.sources.length,
        outcome.slice("dropped: ".length)
      ),
      sources: [],
    };
  };

  /**
   * A `check`, checked (§5.2): of a kept live lesson (`id`), its sources
   * read as for a corroboration; else a new lesson, as an `add` is. Either
   * way its task is filed once the commit stands ({@link fileCheck}), and
   * the rule stays a line until the task is done.
   */
  const plannedCheck = async (
    projectId: string,
    run: Run,
    files: MemoryFiles,
    op: Extract<MemoryOp, { op: "check" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> => {
    const method = op.method.trim();
    const bad = await methodProblem(run, method);
    if (bad) {
      return bad;
    }
    if (op.id) {
      const found = keptFor(
        run,
        files,
        { id: op.id, sources: op.sources },
        { index, answers },
        false
      );
      if (typeof found === "string") {
        return found;
      }
      const { held, kept } = found;
      if (run.changes >= CAPS.nightChanges) {
        return memoryRunWords.nightChanges(CAPS.nightChanges);
      }
      return {
        consumed: op.sources,
        notes: kept.notes.map((note) => ({
          note,
          outcome: `corroborates ${op.id}`,
        })),
        said: memoryRunWords.checkAsked(held.line.id),
        sources: sourcesOf(kept),
        check: { id: held.line.id, text: held.line.text, method },
      };
    }
    const added = await plannedAdd(
      projectId,
      run,
      files,
      { op: "add", text: op.text, home: op.home, sources: op.sources },
      index,
      answers
    );
    if (typeof added === "string" || added.change?.kind !== "add") {
      return added;
    }
    return {
      ...added,
      check: {
        id: added.change.line.id,
        text: added.change.line.text,
        method,
      },
    };
  };

  /** Why a check's method may not stand, or nothing: one line within a fact's length, quoting no one, holding no secret. */
  const methodProblem = async (
    run: Run,
    method: string
  ): Promise<string | undefined> => {
    if (method === "" || method.includes("\n")) {
      return memoryRunWords.oneLine;
    }
    if (method.length > CAPS.fact) {
      return memoryRunWords.tooLong(method.length, CAPS.fact, "method");
    }
    const said = wordsProblem(method, run.said);
    if (said) {
      return said;
    }
    return (await redactSecrets(method)) === method
      ? undefined
      : memoryRunWords.secret;
  };

  /** Operation `op` checked, by its kind. */
  const planned = (
    projectId: string,
    run: Run,
    files: MemoryFiles,
    op: MemoryOp,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> | Planned => {
    switch (op.op) {
      case "add":
        return plannedAdd(projectId, run, files, op, index, answers);
      case "reword":
        return plannedReword(run, files, op, index, answers);
      case "remove":
        return plannedRemove(run, files, op, index, answers);
      case "corroborate":
        return plannedCorroborate(run, files, op, index, answers);
      case "move":
        return plannedMove(projectId, run, files, op);
      case "check":
        return plannedCheck(projectId, run, files, op, index, answers);
      case "drop":
        return plannedDrop(run, files, op);
      default:
        return unhandled("memory operation", op);
    }
  };

  /** Jev's answers for one call's questions, by name, {@link JEV_QUESTIONS} a request: each yes's probability. Jev off, none; failing, its words. */
  const answersOf = async (
    projectId: string,
    questions: Record<string, Experimental_DecisionQuestion>
  ) => {
    const key = jevAccess(db);
    if (!key || Object.keys(questions).length === 0) {
      return;
    }
    const answers = new Map<string, number>();
    await inBatches(projectId, key, {}, Object.entries(questions), (each) => {
      for (const [name, answer] of Object.entries(each)) {
        answers.set(name, "probability" in answer ? answer.probability : 0);
      }
    });
    return answers;
  };

  /** {@link answersOf}, Jev failing its words as the caller's refusal. */
  const answersOrRefusal = async (
    projectId: string,
    questions: Record<string, Experimental_DecisionQuestion>
  ) => {
    try {
      return await answersOf(projectId, questions);
    } catch (error) {
      return problem(502, {
        code: "memory-jev-failed",
        detail: memoryRunWords.jevFailed(
          error instanceof Error ? error.message : String(error)
        ),
      });
    }
  };

  /** The run a session's call belongs to: the curator's of its project, while one is under way. */
  const runFor = (actor: {
    projectId?: string | null;
    role?: string | null;
  }) => {
    const run =
      actor.role === "curator" && actor.projectId
        ? runs.get(actor.projectId)
        : undefined;
    return run && actor.projectId
      ? { run, projectId: actor.projectId }
      : problem(403, { code: "memory-not-run", detail: memoryRunWords.notRun });
  };

  /**
   * The curator's `memory_apply` (§5.2): each operation checked and, when it
   * passes, made and committed alone, in order; one Jev request for the
   * whole call's sources. Answers one line per operation: what it
   * committed, or why it was refused.
   */
  const apply = async (
    actor: { projectId?: string | null; role?: string | null },
    ops: MemoryOp[]
  ) => {
    const found = runFor(actor);
    if (found instanceof ElysiaStatus) {
      return found;
    }
    const { run, projectId } = found;
    if (ops.length > APPLY_OPS) {
      return problem(400, {
        code: "memory-apply-many",
        detail: memoryRunWords.tooMany(APPLY_OPS),
      });
    }
    const files = await filesOf(projectId);
    if (isProblem(files)) {
      return files;
    }
    const answers = await answersOrRefusal(
      projectId,
      questionsOf(run, ops, files)
    );
    if (answers instanceof ElysiaStatus) {
      return answers;
    }
    const lines = await appliedAll(projectId, run, ops, answers);
    // Every message and note of the brief is named by some operation, a drop included (§2 C).
    const unnamed = [
      ...[...run.messages.keys()].filter((handle) => !run.consumed.has(handle)),
      ...run.notes.keys(),
    ];
    return {
      lines:
        unnamed.length > 0
          ? [...lines, memoryRunWords.unnamed(unnamed)]
          : lines,
    };
  };

  /**
   * Each operation checked on the memory as it stands, then, when it
   * passes, made and committed alone, in order: one line each. Its checks
   * (Jev, a machine's file) run on a read of their own; the change is made
   * in the folder's commit queue on the memory as it then is
   * ({@link written}), and one whose lesson left meanwhile is refused as no
   * longer there.
   */
  const appliedAll = async (
    projectId: string,
    run: Run,
    ops: MemoryOp[],
    answers: Map<string, number> | undefined
  ): Promise<string[]> => {
    const lines: string[] = [];
    for (const [index, op] of ops.entries()) {
      const files = await filesOf(projectId);
      const plan = isProblem(files)
        ? files
        : await planned(projectId, run, files, op, index, answers);
      const made =
        typeof plan === "string" || isProblem(plan)
          ? plan
          : await committed(projectId, run, plan, op);
      if (typeof made === "string" || isProblem(made)) {
        const why = typeof made === "string" ? made : made.response.detail;
        lines.push(`${index + 1}. ${memoryRunWords.refused(why)}`);
        continue;
      }
      // Its check, once the operation stands.
      const said = await followedUp(projectId, run, made.plan, made.said);
      lines.push(`${index + 1}. ${memoryRunWords.applied(said)}`);
    }
    return lines;
  };

  /**
   * A planned operation made on the memory as it stands and committed
   * ({@link written}): one commit by the Memory curator, its message naming
   * the operation's sources, its consumed notes archived in it; refused
   * when the lesson it changes is no longer there, a new lesson's id was
   * taken meanwhile, or its file would pass its character budget. The
   * run's counts moved once it stands.
   */
  const committed = async (
    projectId: string,
    run: Run,
    plan: Exclude<Planned, string>,
    op: MemoryOp
  ) => {
    const done = await written(projectId, (files) => {
      const { change } = plan;
      if (change?.kind === "add" && lessonOf(files, change.line.id)) {
        return memoryRunWords.noLongerThere(change.line.id);
      }
      const applied = change ? applyLineChange(files, change) : { files };
      if ("gone" in applied) {
        return memoryRunWords.noLongerThere(applied.gone);
      }
      if ("over" in applied) {
        return memoryRunWords.overBudget(applied.over);
      }
      return {
        after: applied.files,
        author: CURATOR,
        message: withSources(`memory: ${plan.said}`, plan.sources),
        notes: plan.notes.map(({ note, outcome }) => ({
          note: run.notes.get(note.id) ?? note,
          outcome,
        })),
        value: undefined,
      };
    });
    if (typeof done === "string" || isProblem(done)) {
      return done;
    }
    consume(run, plan.consumed);
    count(run, plan, op);
    return { plan, said: plan.said };
  };

  /** A committed operation's check filed ({@link fileCheck}): what the operation said, and what filing it said. */
  const followedUp = async (
    projectId: string,
    run: Run,
    plan: Exclude<Planned, string>,
    said: string
  ): Promise<string> => {
    if (!plan.check) {
      return said;
    }
    const filed = await fileCheck(projectId, plan.check);
    run.counts.checks += filed.task ? 1 : 0;
    return `${said}; ${filed.said}`;
  };

  /** An operation's sources named, the run's notes among them gone from what it has left to name. */
  const consume = (run: Run, handles: readonly string[]): void => {
    for (const handle of handles) {
      run.consumed.add(handle);
      run.notes.delete(handle);
    }
  };

  /**
   * A lesson's check filed (§5.2 `check`): a task in the project, in the
   * stage new tasks enter, through the tasks module (`checkTitle`, its
   * method and lesson id in the description, one acceptance line), its
   * field `check` the lesson's id. The field is its key, looked up over
   * every task of any state first: an open one is the check already; a
   * done or dropped one is the answer, and nothing is filed again. The
   * lesson needs no mark: upkeep finds the task by its field. A task that
   * was not filed leaves the rule as a line, and says why.
   */
  const fileCheck = async (projectId: string, ask: CheckAsk) => {
    const filed = await tasks.withField(projectId, CHECK_FIELD);
    if ("refused" in filed) {
      return { said: memoryRunWords.checkNotFiled(filed.refused) };
    }
    const found = filed.find((each) => each.value === ask.id);
    if (found) {
      return { said: memoryRunWords.checkHas(ask.id, found.id) };
    }
    const task = await tasks.file(projectId, {
      title: memoryRunWords.checkTitle(ask.text),
      description: memoryRunWords.checkDescription(
        ask.id,
        ask.text,
        ask.method
      ),
      acceptance: memoryRunWords.checkAcceptance,
      fields: { [CHECK_FIELD]: ask.id },
    });
    return "refused" in task
      ? { said: memoryRunWords.checkNotFiled(task.refused) }
      : { said: memoryRunWords.checkFiled(ask.id, task.id), task: task.id };
  };

  /** The run's counts and limits moved by one committed operation. */
  const count = (
    run: Run,
    plan: Exclude<Planned, string>,
    op: MemoryOp
  ): void => {
    const { counts } = run;
    const { change } = plan;
    if (!change) {
      counts.dropped += op.op === "drop" ? op.sources.length : 0;
      // A kept lesson made a check.
      run.changes += plan.check ? 1 : 0;
      return;
    }
    switch (change.kind) {
      case "add":
        counts.added += 1;
        run.adds += 1;
        return;
      case "reword":
        counts.replaced += 1;
        run.changes += 1;
        return;
      case "remove":
        counts.retired += 1;
        run.changes += 1;
        return;
      case "move":
      case "archive":
        run.changes += 1;
        return;
      default:
        unhandled("memory change", change);
    }
  };

  // --- close ---------------------------------------------------------------------

  /**
   * Where a run ended (§2 D): what it read is marked read (a failed run's
   * is read again the next night), messages it was given and named in no
   * operation carried once, the run's counts kept. Its refusal, or nothing.
   */
  const closed = async (projectId: string, run: Run, outcome: RunOutcome) => {
    const done = await written(projectId, async (files) => {
      const state = await stateOf(projectId);
      if (state instanceof ElysiaStatus) {
        return state;
      }
      const at = new Date().toISOString();
      const next = nextState(state, run, outcome, at);
      return {
        after: files,
        author: HUB,
        message: `${RUN_MARK}, ${dayOf(at)}`,
        extra: Bun.deepEquals(next, state)
          ? []
          : [{ path: RUN_STATE_FILE, content: jsonText(next) }],
        value: undefined,
      };
    });
    if (typeof done === "string") {
      return problem(409, { code: "memory-mark-refused", detail: done });
    }
    return isProblem(done) ? done : undefined;
  };

  /**
   * A run's end, as its routine settles it (routines.ts): its mark kept and
   * its line said, delivered when it changed something, silent when not; a
   * failed run's words stand and nothing is marked read. No run under way
   * (the hub restarted since its brief): nothing to say beyond what ended.
   */
  const close = (
    projectId: string,
    ended: { outcome: string; output: string | null }
  ):
    | { outcome: Exclude<RunOutcome, "failed">; output: string | null }
    | undefined => {
    const run = runs.get(projectId);
    runs.delete(projectId);
    if (!run) {
      return;
    }
    if (ended.outcome === "failed") {
      detachedClose(projectId, run, "failed");
      return;
    }
    const { added, dropped, replaced, retired } = run.counts;
    if (added + replaced + retired + dropped === 0) {
      detachedClose(projectId, run, "silent");
      return { outcome: "silent", output: null };
    }
    detachedClose(projectId, run, "delivered");
    return {
      outcome: "delivered",
      output: memoryRunWords.runLine(dayOf(new Date()), run.counts),
    };
  };

  /** {@link closed}, off the settle's path, its refusal said in the log. */
  const detachedClose = (
    projectId: string,
    run: Run,
    outcome: RunOutcome
  ): void => {
    closed(projectId, run, outcome).then(
      (refused) => {
        if (refused) {
          console.warn(
            `[memory] ${projectId}: the run's mark was not kept: ${refused.response.detail}`
          );
        }
      },
      (error: unknown) => {
        console.warn(
          `[memory] ${projectId}: the run's mark was not kept: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    );
  };

  // --- a note withdrawn -----------------------------------------------------------

  const idUnfit = (id: string) =>
    NOTE_ID.test(id)
      ? undefined
      : problem(400, {
          code: "memory-note-id-unfit",
          detail: `${id} is not a note id (n-YYYYMMDD-HHMMSS-xxxxxx).`,
        });

  /** The note `id` names, in the inbox or the archive; refused when it is no note's id, no note of the project's, or withdrawn already. */
  const withdrawable = async (projectId: string, id: string) => {
    const unfit = idUnfit(id);
    if (unfit) {
      return unfit;
    }
    const inbox = await notesIn(projectId, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const archive = await notesIn(projectId, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    const note = [...inbox, ...archive].find((each) => each.id === id);
    if (!note) {
      return problem(404, {
        code: "memory-note-unknown",
        detail: `${id} is no note of this project.`,
      });
    }
    return note.outcome === "withdrawn"
      ? problem(409, {
          code: "memory-note-withdrawn",
          detail: `${id} is withdrawn already.`,
        })
      : note;
  };

  /**
   * The person withdraws a note (a hub route), or purges the session that
   * wrote it: the note goes to the archive `withdrawn`, one commit. A
   * lesson the curator wrote from it is in the curator's own words, checked,
   * and stays.
   */
  const withdraw = async (
    projectId: string,
    id: string
  ): Promise<{ sha: string; withdrawn: string } | AnyProblem> => {
    const done = await written(projectId, async (files) => {
      const note = await withdrawable(projectId, id);
      if (note instanceof ElysiaStatus) {
        return note;
      }
      return {
        after: files,
        author: YOU,
        message: `memory: ${id} withdrawn`,
        notes: [{ note, outcome: "withdrawn" }],
        value: undefined,
      };
    });
    if (typeof done === "string") {
      return problem(409, { code: "memory-note-read", detail: done });
    }
    return isProblem(done) ? done : { withdrawn: id, sha: done.sha ?? "" };
  };

  const notYours = (id: string) =>
    problem(403, {
      code: "memory-note-not-yours",
      detail: `${id} was left by another session; a session withdraws only its own notes.`,
    });

  /** The inbox note `id` that session `sessionId` left, or why it is not one it may withdraw. */
  const ownInboxNote = async (
    projectId: string,
    sessionId: string,
    id: string
  ) => {
    const inbox = await notesIn(projectId, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const waiting = inbox.find((each) => each.id === id);
    if (waiting) {
      return waiting.session === sessionId ? waiting : notYours(id);
    }
    const archive = await notesIn(projectId, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    const archived = archive.find((each) => each.id === id);
    if (!archived) {
      return problem(404, {
        code: "memory-note-unknown",
        detail: `${id} is no note of this project.`,
      });
    }
    return archived.session === sessionId
      ? problem(409, {
          code: "memory-note-read",
          detail: `${id} has left the inbox (${archived.outcome ?? "archived"}), so it can no longer be withdrawn.`,
        })
      : notYours(id);
  };

  /**
   * A session takes back a note it left (`memory_withdraw`): the note leaves
   * the inbox for the archive `withdrawn`, one commit by its author, so no
   * run reads it. Refused for a note another session left, and for one a
   * run has archived already; a run whose brief holds it finds it no longer
   * there. No lesson rests on a note no run read, so none changes.
   */
  const unnote = async (
    actor: { id: string; projectId?: string | null },
    id: string
  ) => {
    const { projectId } = actor;
    if (!projectId) {
      return problem(409, {
        code: "memory-session-no-project",
        detail: "This session is in no project, so it left no note.",
      });
    }
    const unfit = idUnfit(id);
    if (unfit) {
      return unfit;
    }
    const done = await written(projectId, async (files) => {
      const note = await ownInboxNote(projectId, actor.id, id);
      if (note instanceof ElysiaStatus) {
        return note;
      }
      return {
        after: files,
        author: { name: note.author },
        message: `memory: ${id} withdrawn by the session that left it`,
        notes: [{ note, outcome: "withdrawn" }],
        value: note.text,
      };
    });
    if (typeof done === "string") {
      return problem(409, { code: "memory-note-read", detail: done });
    }
    return isProblem(done) ? done : { withdrawn: id, text: done.value };
  };

  /**
   * The person purged a session (its transcript deleted): every note it
   * wrote, in the inbox or the archive, is withdrawn as {@link withdraw}
   * does one; a note withdrawn already stays as it is.
   */
  const purged = async (projectId: string, instanceId: string) => {
    const inbox = await notesIn(projectId, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const archive = await notesIn(projectId, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    const done: string[] = [];
    for (const note of [...inbox, ...archive].filter(
      (each) => each.session === instanceId && each.outcome !== "withdrawn"
    )) {
      const gone = await withdraw(projectId, note.id);
      if (isProblem(gone)) {
        console.warn(
          `[memory] ${projectId}: ${note.id} of purged session ${instanceId} is not withdrawn: ${gone.response.detail}`
        );
      } else {
        done.push(note.id);
      }
    }
    return { withdrawn: done };
  };

  // --- a rule changed at once ------------------------------------------------------------

  /** Why a rule's words through memory_rule may not stand: one line within its length, no secret, said by no other live line. Nothing when they may. */
  const ruleWordsProblem = async (
    files: MemoryFiles,
    words: { text: string; why: string | undefined },
    home: LessonHome,
    except: string | undefined
  ) => {
    const unshaped = shapeProblem(words.text, words.why, home);
    if (unshaped) {
      return problem(400, { code: "memory-rule-unfit", detail: unshaped });
    }
    for (const each of [words.text, words.why ?? ""]) {
      if ((await redactSecrets(each)) !== each) {
        return problem(400, {
          code: "memory-rule-secret",
          detail: memoryRunWords.secret,
        });
      }
    }
    const same = keptLessons(files).find(
      (line) =>
        line.id !== except &&
        saysAlready(line.text, words.text) &&
        saysAlready(words.text, line.text)
    );
    return same
      ? problem(409, {
          code: "memory-rule-same",
          detail: memoryRunWords.ruleSame(same.id),
        })
      : undefined;
  };

  /** The live lesson `id` names and its file, or why it names none memory_rule may act on. */
  const ruleOf = (files: MemoryFiles, id: string) => {
    if (!RULE_ID.test(id)) {
      return problem(400, {
        code: "memory-rule-id-unfit",
        detail: memoryRunWords.ruleIdUnfit(id),
      });
    }
    return (
      lessonOf(files, id) ??
      problem(404, {
        code: "memory-rule-unknown",
        detail: memoryRunWords.ruleUnknown(id),
      })
    );
  };

  /** A rule's rewording through memory_rule, checked ({@link ruleChange}). */
  const ruleRewording = async (
    files: MemoryFiles,
    ask: Extract<RuleAsk, { action: "reword" }>
  ) => {
    const held = ruleOf(files, ask.rule);
    if (held instanceof ElysiaStatus) {
      return held;
    }
    const words = {
      text: ask.text,
      why: ask.why ?? held.line.why ?? undefined,
    };
    const home = homeOf(held.path) ?? { at: "index" };
    const unfit = await ruleWordsProblem(files, words, home, ask.rule);
    if (unfit) {
      return unfit;
    }
    const change: Change = {
      kind: "reword",
      id: ask.rule,
      text: words.text,
      why: words.why ?? null,
    };
    return {
      change,
      subject: memoryRunWords.reworded(ask.rule, held.path),
      answer: memoryRunWords.ruleReworded(ask.rule, held.path),
    };
  };

  /** A rule added through memory_rule, checked ({@link ruleChange}). */
  const ruleAddition = async (
    files: MemoryFiles,
    ask: Extract<RuleAsk, { action: "add" }>
  ) => {
    const home: LessonHome = { at: "index" };
    const unfit = await ruleWordsProblem(
      files,
      { text: ask.text, why: ask.why },
      home,
      undefined
    );
    if (unfit) {
      return unfit;
    }
    const taken = new Set(keptLessons(files).map((each) => each.id));
    const id = newLessonId((one) => taken.has(one));
    const change: Change = {
      kind: "add",
      home,
      line: { id, text: ask.text, why: ask.why ?? null, anchor: null },
    };
    return {
      change,
      subject: memoryRunWords.added(id, INDEX_FILE),
      answer: memoryRunWords.ruleAdded(id, INDEX_FILE),
    };
  };

  /**
   * A rule change through memory_rule, checked against the memory as
   * `files` hold it: the change, its commit's subject and its answer; or
   * why not.
   */
  const ruleChange = (files: MemoryFiles, ask: RuleAsk) => {
    switch (ask.action) {
      case "remove": {
        const held = ruleOf(files, ask.rule);
        if (held instanceof ElysiaStatus) {
          return held;
        }
        const change: Change = { kind: "remove", id: ask.rule };
        return {
          change,
          subject: memoryRunWords.ruleRemoveSaid(ask.rule),
          answer: memoryRunWords.ruleRemoved(
            ask.rule,
            held.path,
            held.line.text
          ),
        };
      }
      case "reword":
        return ruleRewording(files, ask);
      case "add":
        return ruleAddition(files, ask);
      default:
        return unhandled("memory rule ask", ask);
    }
  };

  /**
   * A session changes one of the project's rules at once (`memory_rule`):
   * removes it, rewords it or adds one, one commit by the session, its
   * message naming the session as the change's author and source: a
   * session's judgement is its own, whatever the person said in its chain.
   * Refused for a session in no project, and for a change that would take
   * its file past its character budget. A removed rule is a line taken
   * out: the next run's brief lists it, and an add saying it again needs a
   * newer source. Its checks are quick, so the change is checked, made and
   * committed in one turn of the folder's commit queue ({@link written}).
   */
  const ruleAsked = async (actor: InstanceRow, ask: RuleAsk) => {
    const { projectId } = actor;
    if (!projectId) {
      return problem(409, {
        code: "memory-session-no-project",
        detail: memoryRunWords.ruleNoProject,
      });
    }
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const author = boardTitle(actor);
    const done = await written(projectId, async (files) => {
      const asked = await ruleChange(files, ask);
      if (asked instanceof ElysiaStatus) {
        return asked;
      }
      const applied = applyLineChange(files, asked.change);
      if ("gone" in applied) {
        return memoryRunWords.noLongerThere(applied.gone);
      }
      if ("over" in applied) {
        return problem(409, {
          code: "memory-rule-over-budget",
          detail: memoryRunWords.overBudget(applied.over),
        });
      }
      return {
        after: applied.files,
        author: { name: author },
        message: `memory: ${memoryRunWords.ruleCommit(asked.subject)}\n\n${memoryRunWords.ruleBy(author, actor.id)}`,
        value: asked.answer,
      };
    });
    if (typeof done === "string") {
      return problem(409, { code: "memory-rule-refused", detail: done });
    }
    return isProblem(done) ? done : done.value;
  };

  /** A send's words, by its uuid, when the hub still keeps it as the person's. */
  const sentText = (uuid: string): string | undefined => {
    const row = db.sendRecord(uuid);
    if (!(row && row.originKind === "human")) {
      return;
    }
    const { content } = row.body.message;
    return typeof content === "string"
      ? content
      : content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("\n\n");
  };

  // --- once, as the hub starts on this -------------------------------------------------

  /**
   * The tasks the memory run filed for its lessons (a field `lesson`: a
   * check's, or one building a lesson into CawCo), each still open moved to
   * the dropped stage, once per project as the hub starts on this: the
   * memory task loop that filed and dropped them is gone, so dispatch never
   * starts one. A project whose drops did not all go through is tried at
   * the next start.
   */
  const lessonTasksDropped = async (project: ProjectRow): Promise<void> => {
    const name = `memory-lesson-tasks-dropped:${project.id}`;
    if (db.dataMigrated(name)) {
      return;
    }
    const filed = await tasks.withField(project.id, LESSON_FIELD);
    if ("refused" in filed) {
      console.warn(
        `[memory] ${project.name}: its lessons' tasks were not read: ${filed.refused}`
      );
      return;
    }
    let left = 0;
    for (const task of filed.filter((each) => each.kind === "open")) {
      const dropped = await tasks.drop(project.id, task.id, {
        field: LESSON_FIELD,
        value: task.value,
        reason: memoryRunWords.lessonTaskDropped,
      });
      if (typeof dropped !== "string") {
        left += 1;
        console.warn(
          `[memory] ${project.name}: ${task.id} was not dropped: ${dropped.refused}`
        );
      }
    }
    if (left === 0) {
      db.markDataMigrated(name);
    }
  };

  /**
   * `files` with the re-test undone: each lesson line whose `Why:` is the
   * re-test's words loses that line, and one the re-test moved to a
   * knowledge topic goes back to AGENTS.md, unless AGENTS.md would pass its
   * budget (its id then in `left`).
   */
  const retestUndone = (files: MemoryFiles, left: string[]): MemoryFiles => {
    let after = files;
    for (const { line, path } of allLessons(files)) {
      if (!(line.why && RETEST_WHY.test(line.why))) {
        continue;
      }
      after = changedBy(after, {
        kind: "reword",
        id: line.id,
        text: line.text,
        why: null,
      });
      if (homeOf(path)?.at === "knowledge") {
        const back = applyLineChange(after, {
          kind: "move",
          id: line.id,
          home: { at: "index" },
        });
        if ("files" in back) {
          after = back.files;
        } else {
          left.push(line.id);
        }
      }
    }
    return after;
  };

  /** An old ledger entry's file, as an anchor: its first `file` source. */
  const oldAnchor = (
    lesson: z.infer<typeof OldLedgerSchema>["lessons"][string]
  ): Anchor | null => {
    for (const one of lesson.sources) {
      const { kind, match, path } = one;
      if (
        kind === "file" &&
        typeof path === "string" &&
        typeof match === "string"
      ) {
        return { path, match };
      }
    }
    return null;
  };

  /** `files` with one old ledger entry settled: a live one's file written into its line, a staged one landed in its topic (its id into `left` when its file would pass its budget). */
  const settledOne = (
    files: MemoryFiles,
    id: string,
    lesson: z.infer<typeof OldLedgerSchema>["lessons"][string],
    left: string[]
  ): MemoryFiles => {
    const anchor = oldAnchor(lesson);
    const held = lessonOf(files, id);
    if (lesson.state === "live") {
      return anchor && held ? withAnchor(files, id, anchor) : files;
    }
    const topic = lesson.staged?.home.topic;
    if (
      !(
        lesson.state === "staged" &&
        lesson.staged &&
        topic &&
        isTopic(topic)
      ) ||
      held
    ) {
      return files;
    }
    const landed = applyLineChange(files, {
      kind: "add",
      home: { at: "knowledge", topic },
      line: { id, text: lesson.staged.text, why: null, anchor },
    });
    if ("files" in landed) {
      return landed.files;
    }
    left.push(id);
    return files;
  };

  /**
   * `files` with the ledger's lessons settled ({@link settledOne}): each
   * live one's file written into its line as its anchor, and each staged
   * one landed in its knowledge topic (the gate on agents' facts is gone,
   * the owner's word of 2026-11-24). Each live or staged lesson's sources,
   * as the commit message names them.
   */
  const ledgerSettled = (
    files: MemoryFiles,
    lessons: z.infer<typeof OldLedgerSchema>["lessons"],
    left: string[]
  ): { files: MemoryFiles; sources: string[] } => {
    let after = files;
    const sources: string[] = [];
    for (const [id, lesson] of Object.entries(lessons)) {
      after = settledOne(after, id, lesson, left);
      const said = lesson.sources.flatMap((one) => oldSource(one) ?? []);
      const kept = lesson.state === "live" || lesson.state === "staged";
      if (kept && said.length > 0) {
        sources.push(`${id}: ${said.join("; ")}`);
      }
    }
    return { files: after, sources };
  };

  /** JSON's words read: undefined for none, and for words that do not read as JSON, why (which no schema here takes). */
  const jsonOf = (text: string): unknown => {
    if (text.trim() === "") {
      return;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      return { unread: error instanceof Error ? error.message : String(error) };
    }
  };

  /**
   * The ledger's end worked out on `files` ({@link ledgerGone}): the files
   * after it, the ledger and every knowledge file it left with no lesson
   * taken out, `memory/state.json` as the run keeps it now, and the
   * sources in the message; why not when the ledger does not read.
   */
  const ledgerEnd = (
    files: MemoryFiles,
    read: { ledgerText: string; stateText: string },
    left: string[]
  ): MemoryWrite<undefined> | string => {
    const had = read.ledgerText.trim() !== "";
    const ledger = OldLedgerSchema.safeParse(
      had ? jsonOf(read.ledgerText) : { lessons: {} }
    );
    if (!ledger.success) {
      return `${OLD_LEDGER} does not read: ${ledger.error.message}`;
    }
    const settled = ledgerSettled(files, ledger.data.lessons, left);
    const after = retestUndone(settled.files, left);
    const emptied = Object.keys(after).filter(
      (path) =>
        homeOf(path)?.at === "knowledge" &&
        allLessons({ [path]: after[path] }).length === 0 &&
        allLessons({ [path]: files[path] }).length > 0
    );
    const state = RunStateSchema.safeParse(jsonOf(read.stateText));
    const kept = state.success ? jsonText(state.data) : read.stateText;
    return {
      after: Object.fromEntries(
        Object.entries(after).filter(([path]) => !emptied.includes(path))
      ),
      author: HUB,
      message: withSources(memoryRunWords.ledgerGone, settled.sources),
      extra:
        kept === read.stateText
          ? []
          : [{ path: RUN_STATE_FILE, content: kept }],
      gone: [...(had ? [OLD_LEDGER] : []), ...emptied],
      value: undefined,
    };
  };

  /**
   * The ledger's end (§5.2 step 6), once per project as the hub starts on
   * this, one commit by the hub through the one write path: every lesson's
   * sources the ledger (`memory/lessons.json`) held named in the commit's
   * message, by reference ({@link ledgerSettled}); each rule the re-test
   * moved out of AGENTS.md back in it without the re-test's `Why:`
   * ({@link retestUndone}); a knowledge file left with no lesson taken out;
   * the ledger deleted; `memory/state.json` keeping only where the run read
   * up to. A change past a file's budget is left as it was and said in the
   * log. Tried at the next start when it did not go through.
   */
  const ledgerGone = async (project: ProjectRow): Promise<void> => {
    const name = `memory-ledger-gone:${project.id}`;
    if (db.dataMigrated(name)) {
      return;
    }
    const left: string[] = [];
    const done = await written(project.id, async (files) => {
      const ledgerText = await fileOr(project.id, OLD_LEDGER);
      if (ledgerText instanceof ElysiaStatus) {
        return ledgerText;
      }
      const stateText = await fileOr(project.id, RUN_STATE_FILE);
      if (stateText instanceof ElysiaStatus) {
        return stateText;
      }
      return ledgerEnd(files, { ledgerText, stateText }, left);
    });
    for (const id of left) {
      console.warn(
        `[memory] ${project.name}: ${id} stays where it was: its file would pass its budget`
      );
    }
    if (typeof done === "string" || isProblem(done)) {
      console.warn(
        `[memory] ${project.name}: the ledger's end did not go through: ${typeof done === "string" ? done : done.response.detail}`
      );
      return;
    }
    db.markDataMigrated(name);
  };

  /** What the hub does once per project as it starts on this build: the memory run's open tasks dropped ({@link lessonTasksDropped}), and the ledger's end ({@link ledgerGone}). */
  const start = async (projects: readonly ProjectRow[]): Promise<void> => {
    for (const project of projects) {
      await lessonTasksDropped(project);
      await ledgerGone(project);
    }
  };

  return {
    start,
    brief,
    withdraw,
    unnote,
    ruleAsked,
    purged,
    apply,
    close,
    upkeep,
  };
};

export type MemoryRun = ReturnType<typeof createMemoryRun>;
