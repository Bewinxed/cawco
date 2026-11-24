/**
 * A project's nightly memory run (routines.ts, target `curator`), and every
 * write to its memory files but the person's own note (memory.ts
 * `makeNote`): nothing here waits for the person, and nothing reaches
 * memory unchecked.
 *
 * - **Upkeep, no model** ({@link upkeep}): the files and the ledger agreed
 *   (memory-lessons.ts `reconcile`), staged lessons past their days
 *   retired, inbox notes no run reached in a week archived unread, a
 *   knowledge lesson no brief carried for the archive's days (config.ts
 *   `MEMORY_ARCHIVE_DAYS`) archived, every file a lesson rests on read
 *   again on a machine of the project ({@link anchorsRead}: one gone makes
 *   its lesson stale, one there lands a staged lesson), a retired entry
 *   past its days taken out of the ledger, the index in its shape. One
 *   commit.
 * - **What it reads**: what the person typed to the project's sessions since
 *   the last run (db sends.ts `personSaidIn`, the hub's own record of who
 *   spoke: no transcript, so no agent's turn and no tool's result), and the
 *   notes agents left. Jev sorts them in one request ({@link jevRead}):
 *   which messages say how agents should work, and what each note is. Jev
 *   off, the newest messages go to the run as they are.
 * - **Corrected again, no model** ({@link revertCorrected}): Jev's second
 *   request asks, of each message the run reads and each lesson grep pairs
 *   it with (live, or taken out in the last 30 days), whether it states the
 *   lesson again or its opposite. A lesson the run took out that the person
 *   states again is put back as git held its line, and held; one the run
 *   made that he states the opposite of is taken back, and held; a live one
 *   he states again counts a repeat, and his second holds it and moves it
 *   up a home. Each is one commit, by the hub, and said under the message
 *   in the brief.
 * - **The run** is one delegate in the `curator` role, briefed by the hub
 *   ({@link brief}), that writes through `memory_apply` alone
 *   ({@link apply}). It cites each source by a handle the hub gave it, and
 *   the hub checks each operation ({@link checked}): the handle is this
 *   run's; a message states the lesson (Jev, at {@link SUPPORTS}); the
 *   lesson quotes no one (memory-sources.ts `quoteProblem`); a new lesson
 *   says what no lesson kept in its home or the index says (Jev, at
 *   {@link SAME}, this run's earlier adds among them: {@link jevOnNew}),
 *   and a note dropped as a duplicate names the live lesson it says again;
 *   an agent's
 *   lesson goes to knowledge, and lands only when notes of two sessions say
 *   it (memory-sources.ts `countsTogether`, and Jev on the pair) or a file
 *   it names holds its match ({@link anchored}), staged in the ledger until
 *   then; the caps and the night's limits hold. Each
 *   operation is one commit, by the Memory curator, with the notes it
 *   consumed archived in it.
 * - **A rule changed at once** ({@link ruleAsked}, `memory_rule`): a
 *   session removes, rewords or adds one of the project's rules at once,
 *   through the same checked change, one commit by the session; the
 *   person's newest message in the session's chain, when there is one, its
 *   source. What it changes is held: a removed rule stays out (no repeat
 *   puts it back, an agent's lesson saying it again is refused, upkeep
 *   keeps its entry), and an inbox note naming it is archived as settled.
 * - **Saves through git** ({@link commit}): every step reads the files
 *   from disk with the folder's HEAD, in its commit queue ({@link treeOf}),
 *   works out its change, and commits it on HEAD, rebased onto it when it
 *   moved since (project-folder.ts `rebased`, a three-way merge of each
 *   file). A rebase that meets a commit changing the same lines writes
 *   nothing, and the step reads again and works out its change again
 *   (project-folder.ts `againOnConflict`, three tries). What a step does
 *   outside the memory comes after its commit stands (a check filed), or
 *   is safe to do again: a read (a machine's file,
 *   a task's state, Jev). No writer writes over a newer commit.
 * - **Checks** ({@link plannedCheck}): a rule a tool can test is filed as
 *   a task in the project (`Check: <rule>`, through the tasks module, in
 *   the stage new tasks enter), its field `check` the lesson's id, the
 *   key it is found by over every task of any state ({@link fileCheck}):
 *   an open, done or dropped one is never filed again. The rule stays a
 *   line until the task is done, when upkeep enforces it and takes the
 *   line out ({@link tasksEnded}).
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
import { MEMORY_ARCHIVE_DAYS } from "./config";
import type { DbShape } from "./db";
import type { ProjectRow } from "./db/projects";
import type { PersonSaid } from "./db/sends";
import type {
  Lesson,
  LessonHome,
  LessonSource,
  MemoryRunState,
} from "./db/stored-types";
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
  type RuleAsk,
  saysAlready,
} from "./memory";
import {
  type Applied,
  applyOp,
  CAPS,
  type Change,
  CheckedOp,
  dayOf,
  grepScore,
  homeOf,
  INDEX_FILE,
  indexShape,
  isSkillName,
  isTopic,
  KNOWLEDGE_DIR,
  LEDGER_FILE,
  LESSONS_DIR,
  type LessonLine,
  lineOf,
  type MemoryTree,
  NOTE_ID,
  newLessonId,
  olderThan,
  parseLedger,
  parseLessons,
  pathOf,
  RUN_STATE_FILE,
  reconcile,
  renderLedger,
  wordsOf,
} from "./memory-lessons";
import {
  ANCHOR_MATCH,
  type AnchorPlace,
  anchorRead,
  chainOf,
  countsTogether,
  type MachineRead,
  quoteProblem,
  rootOf,
} from "./memory-sources";
import {
  againOnConflict,
  changeFolderFiles,
  type FolderAuthor,
  folderCommitsChanging,
  folderPath,
  REBASE_CONFLICT,
  readAtHead,
  readFolderFileAt,
  turnTaker,
  YOU,
} from "./project-folder";
import { redactSecrets } from "./secret-filter";
import { outsideUrls } from "./web-reads";

/** The project's memory files and ledger as one read found them, with the folder's HEAD they were read at: what a commit is rebased from. */
interface MemoryRead {
  head: string;
  tree: MemoryTree;
}

/** The most messages one night reads: the most the person said in a day. A correction is short; a longer message is a paste or a brief, and its start says which. */
const RUN_SAID = 240;
const SAID_CHARS = 1500;
/** How far back a night reads, when it has no mark yet or its last mark is older. */
const SAID_DAYS = 7;
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
/** Two notes say the same lesson at or over this: the likelier of two. */
const SAME = 0.5;
/** The operations one `memory_apply` call takes. */
const APPLY_OPS = 20;
/** Lessons grep pairs with a message in the brief, at most. */
const RELATED = 3;

const CURATOR: FolderAuthor = { name: "Memory curator" };
const HUB: FolderAuthor = { name: "CawCo hub" };

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
  replaced: number;
  /** Lessons put back because the person stated them again. */
  restored: number;
  retired: number;
  /** Lessons taken back because the person stated the opposite. */
  reverted: number;
  staged: number;
}

/** What Jev read a message of the person's to do to a lesson kept (§6.2). */
interface Correction {
  does: "repeats" | "reverses";
  /** The message's handle in the run (`m3`). */
  handle: string;
  id: string;
  text: string;
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

/** A lesson a message may state again or change: a live one's line, or the words of one the run took out. */
interface Kept {
  id: string;
  live: boolean;
  text: string;
}

/** Why a lesson left that a repeat of the person's puts back: the run replaced it, archived it unused, or its file went. */
const TAKEN_OUT: ReadonlySet<string> = new Set([
  "replaced",
  "unneeded",
  "stale",
]);

/** Whether `lesson` is one the run took out, with its words kept: a repeat of the person's puts it back. */
const takenOut = (lesson: Lesson): boolean =>
  (lesson.state === "retired" || lesson.state === "stale") &&
  lesson.retired !== undefined &&
  lesson.retired.text !== "" &&
  TAKEN_OUT.has(lesson.retired.why);

/** The memory files a lesson's line lives in, as git's pickaxe reads them for its commits (the archive among them). */
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
  /** What Jev read each message to do to lessons kept, and what the hub did, as the brief says it under the message, by handle. */
  corrected: Map<string, string[]>;
  counts: Counts;
  jev: boolean;
  /** Messages it was given, by handle (`m1`). */
  messages: Map<string, Given>;
  /** Notes it was given, by id, with where each is now. */
  notes: Map<string, Note>;
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
    | "listInstances"
    | "markDataMigrated"
    | "memoryFacts"
    | "personSaidIn"
    | "personSaidLast"
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
      restored: z.number().optional(),
      retired: z.number(),
      reverted: z.number().optional(),
      staged: z.number(),
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

const wordCount = (text: string): number =>
  text.split(SPACES).filter(Boolean).length;

/**
 * What upkeep does to one lesson, by its dates (§2 A.2): a staged one past
 * its days expires; a live knowledge one no brief carried (and no source
 * stated again) for the archive's days goes to the archive, unless the
 * person stated it again. Nothing for any other.
 */
const expiryOf = (
  id: string,
  lesson: Lesson,
  used: Date | undefined,
  today: string
): Change | undefined => {
  if (lesson.state === "staged") {
    return olderThan(lesson.since, today, CAPS.stagedDays)
      ? { kind: "retire", id, why: "expired" }
      : undefined;
  }
  const { home, held, seen, state } = lesson;
  const lastUse = used ? dayOf(used) : seen;
  return state === "live" &&
    home.at === "knowledge" &&
    !held &&
    olderThan(lastUse, today, MEMORY_ARCHIVE_DAYS)
    ? { kind: "archive", id }
    : undefined;
};

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
  restored: 0,
  retired: 0,
  reverted: 0,
  staged: 0,
});

type ChoiceQuestion = Extract<
  Experimental_DecisionQuestion,
  { type: "choice" }
>;

/** What Jev said of a night's reading: each message's kind and how likely an instruction, each note's verdict. */
interface JevRead {
  instruction: Map<string, number>;
  kinds: Map<string, SaidKind>;
  verdicts: Map<string, string>;
}

/** The night's questions to Jev: each message of {@link SAID_WORDS} words or more, and each note with no verdict. */
const readQuestions = (
  project: string,
  said: PersonSaid[],
  notes: Note[]
): [string, ChoiceQuestion][] => [
  ...said
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
    ]),
  ...notes
    .filter((note) => note.verdict === null)
    .map((note): [string, ChoiceQuestion] => [
      `note:${note.id}`,
      {
        type: "choice",
        instructions: {
          note: cut(note.text),
          question: memoryJevWords.noteQuestion(project),
        },
        criteria: memoryJevWords.noteKinds,
      },
    ]),
];

/** The Jev rows a batch of questions asks, by their names' prefixes. */
const rowsOf = (
  names: string[]
): ("said" | "inbox" | "support" | "same" | "kept")[] => {
  const rows = {
    "said:": "said",
    "note:": "inbox",
    "support:": "support",
    "same:": "same",
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
    } else if (name.startsWith("note:")) {
      read.verdicts.set(name.slice("note:".length), answer.choice);
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
  corrected: new Map(),
  notes: new Map(notes.map((note) => [note.id, note])),
  said: [],
  consumed: new Set(),
  counts: { ...emptyCounts(), ...counts },
  adds: 0,
  changes: 0,
  through: null,
  carried: new Set(),
});

/** Why a lesson's words are not one line within its home's cap, with a `Why:` within its own; nothing when they are. */
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

/** What became of a note an `add` consumed: staged with its lesson, corroborating the person's, or landed. */
const addOutcome = (id: string, staged: boolean, by: Lesson["by"]): string => {
  if (staged) {
    return `staged ${id}`;
  }
  return by === "owner" ? `corroborates ${id}` : `landed ${id}`;
};

/** Whether knowledge file `path` is there, or there is room for it under the cap on knowledge files. */
const roomFor = (tree: MemoryTree, path: string): boolean => {
  const topics = Object.keys(tree.files).filter(
    (each) => homeOf(each)?.at === "knowledge"
  );
  return topics.includes(path) || topics.length < CAPS.knowledgeFiles;
};

/** A run's closing commit (§2 D): its state's next mark. */
const markOfRun = (state: MemoryRunState, run: Run, outcome: RunOutcome) => {
  const at = new Date().toISOString();
  const next = nextState(state, run, outcome, at);
  return {
    author: HUB,
    message: `${RUN_MARK}, ${dayOf(at)}`,
    extra: Bun.deepEquals(next, state)
      ? []
      : [{ path: RUN_STATE_FILE, content: jsonText(next) }],
  };
};

/**
 * The lessons a message of the person's may state again or change (§2 B):
 * every live line, and each the run took out (replaced, or archived
 * unused) whose words the ledger keeps, which it does for
 * {@link CAPS.retiredDays} days.
 */
const keptLessons = (tree: MemoryTree): Kept[] => [
  ...Object.keys(tree.files).flatMap((path) =>
    homeOf(path)
      ? parseLessons(path, tree.files[path] ?? "").lessons.map((line) => ({
          id: line.id,
          text: line.text,
          live: true,
        }))
      : []
  ),
  ...Object.entries(tree.ledger.lessons).flatMap(([id, lesson]) =>
    takenOut(lesson) && lesson.retired
      ? [{ id, text: lesson.retired.text, live: false }]
      : []
  ),
];

/**
 * The lessons removed through memory_rule (memory-lessons.ts Change
 * `remove`): retired `hand`, held, their words kept. Only memory_rule or
 * the person's own message says one again; an agent's note never brings
 * it back.
 */
const removedRules = (tree: MemoryTree): Beside[] =>
  Object.entries(tree.ledger.lessons).flatMap(([id, lesson]) =>
    lesson.state === "retired" &&
    lesson.held &&
    lesson.retired?.why === "hand" &&
    lesson.retired.text !== ""
      ? [{ id, text: lesson.retired.text }]
      : []
  );

/** A lesson the run made itself, in the last {@link CAPS.retiredDays} days: not adopted from a hand edit, not one he approved before the run. */
const madeByRun = (lesson: Lesson, today: string): boolean =>
  !(
    olderThan(lesson.since, today, CAPS.retiredDays) ||
    lesson.sources.some(
      (source) => source.kind === "hand" || source.kind === "approved"
    )
  );

/** A message's source as the ledger keeps it: the send, by reference. */
const saidSource = (said: PersonSaid): LessonSource => ({
  kind: "said",
  send: said.uuid,
  session: said.instanceId,
  at: said.acceptedAt.toISOString(),
});

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
    given.said &&
    !run.consumed.has(handle) &&
    !state.carried.includes(given.said.uuid)
      ? [given.said.uuid]
      : []
  );
  return {
    ...state,
    through: run.through ? run.through.toISOString() : state.through,
    carried: [...run.carried, ...unnamed],
    lastRun: { at, ...run.counts },
  };
};

/** `tree` with lesson `id` resting on `sources` alone: a ledger edit, no line changes. */
const withSources = (
  tree: MemoryTree,
  id: string,
  sources: LessonSource[]
): MemoryTree => {
  const lesson = tree.ledger.lessons[id];
  return lesson ? withLesson(tree, id, { ...lesson, sources }) : tree;
};

/** Jev's question on each pair of `notes`, whether they state the same lesson, named under `key`. */
const pairQuestions = (
  key: string,
  notes: Note[]
): [string, Experimental_DecisionQuestion][] =>
  notes.flatMap((a, at) =>
    notes.slice(at + 1).map((b): [string, Experimental_DecisionQuestion] => [
      `same:${key}:${a.id}:${b.id}`,
      {
        type: "boolean",
        instructions: {
          a: a.text,
          b: b.text,
          question: memoryJevWords.sameQuestion,
        },
        criteria: memoryJevWords.sameCriteria,
      },
    ])
  );

/** A lesson of the memory beside which a new one is read: its id and words. */
interface Beside {
  id: string;
  text: string;
}

/**
 * The lessons a lesson bound for `home` may say again: each live one in that
 * home or the index, by its line, and with `staged`, each staged one bound
 * there, by its words; `except` left out.
 */
const besideOf = (
  tree: MemoryTree,
  home: LessonHome,
  { except, staged }: { except?: string; staged: boolean }
): Beside[] => {
  const into = pathOf(home);
  return Object.entries(tree.ledger.lessons).flatMap(([id, lesson]) => {
    const live = lesson.state === "live";
    const bound = staged ? lesson.staged?.home : undefined;
    const at = live ? lesson.home : bound;
    const text = live ? lineOf(tree, id)?.text : lesson.staged?.text;
    const path = at ? pathOf(at) : undefined;
    return id !== except &&
      text &&
      path &&
      (path === INDEX_FILE || path === into)
      ? [{ id, text }]
      : [];
  });
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

/** For each staged lesson of `waiting`, the live lessons it may say again ({@link besideOf}), by its id. */
const stagedBeside = (
  tree: MemoryTree,
  waiting: readonly [string, Lesson][]
): Map<string, Beside[]> =>
  new Map(
    waiting.map(([id, lesson]) => [
      id,
      lesson.staged
        ? besideOf(tree, lesson.staged.home, { except: id, staged: false })
        : [],
    ])
  );

/** `tree` with lesson `id`'s entry as `lesson`: a ledger edit, no line changes. */
const withLesson = (
  tree: MemoryTree,
  id: string,
  lesson: Lesson
): MemoryTree => ({
  ...tree,
  ledger: {
    ...tree.ledger,
    lessons: { ...tree.ledger.lessons, [id]: lesson },
  },
});

/** What a staged lesson's `add` answers: one note, or Jev off. */
const stagedWords = (id: string, staged: { waits: boolean }): string =>
  staged.waits ? memoryRunWords.stagedForJev(id) : memoryRunWords.stagedAs(id);

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
  /** The projects whose run is being briefed: their inbox is being read. */
  const briefing = new Set<string>();
  /** Each project's session withdrawals under way, which a brief waits for before it reads the inbox. */
  const unnoting = new Map<string, Set<Promise<unknown>>>();

  /**
   * `read` run as the inbox's reader: from its first step a session's
   * withdrawal is refused, and it starts once the withdrawals already under
   * way have committed, so it reads each note either withdrawn or whole.
   */
  const asReader = async <T>(
    projectId: string,
    read: () => Promise<T>
  ): Promise<T> => {
    briefing.add(projectId);
    try {
      await Promise.allSettled(unnoting.get(projectId) ?? []);
      return await read();
    } finally {
      briefing.delete(projectId);
    }
  };

  const projectOf = (projectId: string) => {
    const project = db.project(projectId);
    return project
      ? project
      : problem(404, {
          code: "memory-project-unknown",
          detail: `The hub keeps no project ${projectId}.`,
        });
  };

  // --- the tree ----------------------------------------------------------------

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
    return files;
  };

  /**
   * The project's memory files and ledger, read from disk with the folder's
   * HEAD in its commit queue (project-folder.ts `readAtHead`), so they are
   * HEAD's: the base a commit of them is rebased from.
   */
  const treeOf = (projectId: string) =>
    readAtHead(projectId, async (head) => {
      const files = await filesOf(projectId);
      if (files instanceof ElysiaStatus) {
        return files;
      }
      const ledgerText = await fileOr(projectId, LEDGER_FILE);
      if (ledgerText instanceof ElysiaStatus) {
        return ledgerText;
      }
      const ledger = parseLedger(ledgerText);
      if (typeof ledger === "string") {
        return problem(500, { code: "memory-ledger-unread", detail: ledger });
      }
      const read: MemoryRead = { tree: { files, ledger }, head };
      return read;
    });

  /**
   * One commit of `after` over `from`'s tree: every memory file it changed, the
   * ledger when it changed, and each note it consumed archived with what
   * came of it. Nothing when nothing changed. Committed on HEAD: when HEAD
   * moved since `from` was read, rebased onto it (project-folder.ts
   * `rebased`), and refused {@link REBASE_CONFLICT} when another commit
   * changed the same lines, so no writer writes over a newer commit; the
   * writer then makes its change again from the files as they stand.
   */
  const commit = async (
    projectId: string,
    from: MemoryRead,
    after: MemoryTree,
    change: {
      author: FolderAuthor;
      /** Files of `memory/` beside the tree: the run's state. */
      extra?: { content: string; path: string }[];
      /** Files of `memory/` taken out. */
      gone?: string[];
      message: string;
      notes?: { note: Note; outcome: string }[];
    }
  ) => {
    const writes = Object.entries(after.files).flatMap(([path, content]) =>
      content !== undefined && content !== from.tree.files[path]
        ? [{ path, content }]
        : []
    );
    const ledger = renderLedger(after.ledger);
    if (ledger !== renderLedger(from.tree.ledger)) {
      writes.push({ path: LEDGER_FILE, content: ledger });
    }
    const notes = change.notes ?? [];
    for (const { note, outcome } of notes) {
      writes.push(archivedNote(note, outcome));
    }
    writes.push(...(change.extra ?? []));
    const archivedPaths = new Set(
      notes.map(({ note }) => archivedNote(note, "").path)
    );
    const deletes = [
      ...notes
        .map(({ note }) => note.path)
        .filter((path) => !archivedPaths.has(path)),
      ...(change.gone ?? []),
    ];
    if (writes.length + deletes.length === 0) {
      return;
    }
    const done = await changeFolderFiles(
      projectId,
      { writes, deletes },
      { author: change.author, message: change.message, base: from.head }
    );
    if (done instanceof ElysiaStatus) {
      return done;
    }
    folderChanged(projectId);
    console.log(
      `[memory] ${projectId}: ${change.message.split("\n")[0]} at ${done.sha.slice(0, 9)}`
    );
    return done.sha;
  };

  /** Each knowledge lesson's last carry into a brief (db `fact_uses`), by its id. */
  const usesOf = (projectId: string): ReadonlyMap<string, Date> =>
    db.memoryFacts.lessonUses(projectId);

  /** A note's source as the ledger keeps it: its session, that session's root, and the hub's labels on it. */
  const noteSource = (note: Note): Extract<LessonSource, { kind: "note" }> => {
    const row = (id: string) => db.getInstancesByIds([id]).at(0);
    const own = row(note.session);
    return {
      kind: "note",
      id: note.id,
      session: note.session,
      root: own ? rootOf(own, row) : note.session,
      labels: note.taint,
    };
  };

  // --- upkeep ------------------------------------------------------------------

  /**
   * The project's memory made whole before a run reads it (§2 A): every
   * line and entry agreed, the index in its shape, staged lessons past their
   * days and inbox notes no run reached in a week let go, knowledge no brief
   * carried for the archive's days archived, and retired entries past their
   * days taken out of the ledger. One commit, `memory: upkeep <day>`. Its
   * machine and task reads are reads, so a clash reads and works it all
   * out again ({@link againOnConflict}).
   */
  const upkeep = (project: ProjectRow) =>
    againOnConflict(() => upkeepOnce(project));

  /** {@link upkeep} once, on the memory as it stands. */
  const upkeepOnce = async (project: ProjectRow) => {
    const read = await treeOf(project.id);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const today = dayOf(new Date());
    const before = read.tree;
    const agreed = reconcile(before, today, read.head).tree;
    let tree: MemoryTree = {
      ...agreed,
      files: {
        ...agreed.files,
        [INDEX_FILE]: indexShape(project.name, agreed.files[INDEX_FILE] ?? ""),
      },
    };
    const uses = usesOf(project.id);
    for (const [id, lesson] of Object.entries(tree.ledger.lessons)) {
      const change = expiryOf(id, lesson, uses.get(id), today);
      if (change) {
        ({ tree } = applyOp(tree, checked(change), today, uses));
      }
    }
    tree = await anchorsRead(project.id, tree, today);
    tree = await tasksEnded(project.id, tree, today);
    tree = withoutOldRetired(tree, today);
    const inbox = await notesIn(project.id, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const unread = inbox.filter((note) =>
      olderThan(dayOf(note.time), today, NOTE_DAYS)
    );
    return await commit(project.id, read, tree, {
      author: HUB,
      message: `memory: upkeep ${today}`,
      notes: unread.map((note) => ({ note, outcome: "dropped: unread" })),
    });
  };

  /**
   * Every file a lesson rests on read again (§2 A.3), the person's held
   * lessons aside: a lesson whose file or match is gone goes stale, its line
   * taken out; one whose file is there keeps the day and the sha256 it was
   * read at, and a staged one it bears out lands. A file no machine
   * answered for is tried the next night.
   */
  const anchorsRead = async (
    projectId: string,
    tree: MemoryTree,
    today: string
  ): Promise<MemoryTree> => {
    const places = checkoutsOf(projectId);
    const uses = usesOf(projectId);
    let now = tree;
    for (const [id, lesson] of Object.entries(tree.ledger.lessons)) {
      if (
        !lesson.held &&
        (lesson.state === "live" || lesson.state === "staged")
      ) {
        now = await anchorsOf(now, id, lesson, places, today, uses);
      }
    }
    return now;
  };

  /** {@link anchorsRead} for one lesson: its files read, and `now` with what came of them. */
  const anchorsOf = async (
    now: MemoryTree,
    id: string,
    lesson: Lesson,
    places: readonly AnchorPlace[],
    today: string,
    uses: ReadonlyMap<string, Date>
  ): Promise<MemoryTree> => {
    const files = lesson.sources.flatMap((source, at) =>
      source.kind === "file" ? [{ at, source }] : []
    );
    if (files.length === 0) {
      return now;
    }
    const reads = await Promise.all(
      files.map(({ source }) => anchorRead(machine, places, source))
    );
    if (reads.some((read) => read.kind === "gone")) {
      return applyOp(now, checked({ kind: "stale", id }), today, uses).tree;
    }
    const sources = [...lesson.sources];
    files.forEach(({ at, source }, n) => {
      const read = reads[n];
      if (read?.kind === "found") {
        sources[at] = { ...source, sha256: read.sha256, read: today };
      }
    });
    const kept = withSources(now, id, sources);
    const borne = reads.some((each) => each.kind === "found");
    const into = lesson.staged ? (pathOf(lesson.staged.home) ?? "") : "";
    return lesson.state === "staged" &&
      borne &&
      !lesson.staged?.waits &&
      roomFor(kept, into)
      ? applyOp(
          kept,
          checked({ kind: "corroborate", id, lands: true, sources: [] }),
          today,
          uses
        ).tree
      : kept;
  };

  /**
   * Every lesson whose check's task is done (§2 A.4), found by the task's
   * `check` field over every task of any state: the check holds the rule,
   * so the lesson is enforced and its line taken out.
   */
  const tasksEnded = async (
    projectId: string,
    tree: MemoryTree,
    today: string
  ): Promise<MemoryTree> => {
    const filed = await tasks.withField(projectId, CHECK_FIELD);
    if ("refused" in filed) {
      console.warn(
        `[memory] ${projectId}: its checks' tasks were not read: ${filed.refused}`
      );
      return tree;
    }
    let now = tree;
    for (const task of filed) {
      if (
        task.kind === "done" &&
        now.ledger.lessons[task.value]?.state === "live"
      ) {
        now = applyOp(
          now,
          checked({ kind: "enforce", id: task.value }),
          today,
          usesOf(projectId)
        ).tree;
      }
    }
    return now;
  };

  /** The ledger without retired, stale and expired entries past their days. */
  const withoutOldRetired = (tree: MemoryTree, today: string): MemoryTree => ({
    ...tree,
    ledger: {
      ...tree.ledger,
      lessons: Object.fromEntries(
        Object.entries(tree.ledger.lessons).filter(
          ([, lesson]) =>
            lesson.held === true ||
            !(
              lesson.retired &&
              olderThan(lesson.retired.on, today, CAPS.retiredDays)
            )
        )
      ),
    },
  });

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
   * how agents work here; per note with no verdict, what it is. Undefined
   * with Jev off (the log says so); Jev failing throws its words.
   */
  const jevRead = async (
    project: ProjectRow,
    said: PersonSaid[],
    notes: Note[]
  ) => {
    const key = jevAccess(db);
    if (!key) {
      offLine(
        "said",
        project.id,
        `the run reads the newest ${AGENT_SAID} of ${said.length} messages and ${notes.length} notes unsorted`
      );
      return;
    }
    const asked = readQuestions(project.name, said, notes);
    const read: JevRead = {
      kinds: new Map(),
      verdicts: new Map(),
      instruction: new Map(),
    };
    await inBatches(
      project.id,
      key,
      { project: project.name },
      asked,
      (answers) => readAnswers(answers, read)
    );
    const { kinds, verdicts, instruction } = read;
    return { kinds, verdicts, instruction };
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

  /** The skill lessons and knowledge files, each by name, first line and line count; the room each cap has left. */
  const filesText = (tree: MemoryTree, run: Run): string => {
    const listed = Object.keys(tree.files)
      .filter((path) => path !== INDEX_FILE && homeOf(path))
      .sort()
      .map((path) => {
        const content = tree.files[path] ?? "";
        const first =
          content
            .split("\n")
            .find((line) => line.trim() !== "")
            ?.replace(HEADING_MARKS, "") ?? "";
        const count = parseLessons(path, content).lessons.length;
        return `- ${path}: ${first} (${count} lesson${count === 1 ? "" : "s"})`;
      });
    const index = tree.files[INDEX_FILE] ?? "";
    const topics = Object.keys(tree.files).filter(
      (path) => homeOf(path)?.at === "knowledge"
    ).length;
    return [
      memoryRunWords.briefFiles,
      listed.length > 0 ? listed.join("\n") : memoryRunWords.briefNoFiles,
      memoryRunWords.briefRoom(
        parseLessons(INDEX_FILE, index).lessons.length,
        CAPS.indexRules,
        index.length,
        CAPS.indexChars,
        topics,
        CAPS.knowledgeFiles,
        Math.max(0, CAPS.nightAdds - run.adds),
        Math.max(0, CAPS.nightChanges - run.changes)
      ),
    ].join("\n\n");
  };

  /** The brief's text: the messages, the notes, the staged lessons, the index, the files and the skills. */
  const briefText = (project: ProjectRow, tree: MemoryTree, run: Run) => {
    const messages = [...run.messages].filter(([, given]) => given.said);
    const live = keptLessons(tree).filter((lesson) => lesson.live);
    const listed = messages.map(([handle, given]) => {
      const corrected = run.corrected.get(handle) ?? [];
      // Jev on, what it read the message to do; off, the lessons grep pairs it with.
      const related = run.jev ? [] : relatedTo(given.text, live);
      return [
        `### ${handle} · ${dayOf(given.said?.acceptedAt ?? new Date())} · ${given.session}`,
        given.text,
        ...(corrected.length > 0
          ? [`${memoryRunWords.briefCorrected}\n${corrected.join("\n")}`]
          : []),
        ...(related.length > 0
          ? [
              `${memoryRunWords.briefRelated}\n${related.map((line) => `- ${line.id}: ${line.text}`).join("\n")}`,
            ]
          : []),
      ].join("\n\n");
    });
    const notes = [...run.notes.values()].map((note) => {
      const source = noteSource(note);
      const labels = note.taint.length > 0 ? note.taint.join(", ") : "none";
      return `### ${note.id} · ${dayOf(note.time)} · ${sessionHandle(run, source.root)} · labels: ${labels}\n\n${note.text}`;
    });
    const staged = Object.entries(tree.ledger.lessons).filter(
      ([, lesson]) => lesson.state === "staged" && lesson.staged
    );
    const skills = skillsFor(project.id);
    return [
      messages.length > 0
        ? [memoryRunWords.briefMessages(messages.length), ...listed].join(
            "\n\n"
          )
        : memoryRunWords.briefNoMessages,
      notes.length > 0
        ? [memoryRunWords.briefNotes(notes.length), ...notes].join("\n\n")
        : memoryRunWords.briefNoNotes,
      ...(staged.length > 0
        ? [
            `${memoryRunWords.briefStaged(staged.length)}\n\n${staged
              .map(
                ([id, lesson]) =>
                  `- ${id} (${lesson.staged ? (pathOf(lesson.staged.home) ?? "") : ""}): ${lesson.staged?.text}`
              )
              .join("\n")}`,
          ]
        : []),
      `${memoryRunWords.briefIndex}\n\n${(tree.files[INDEX_FILE] ?? "").trim()}`,
      filesText(tree, run),
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
   * messages since the last run and the notes waiting, sorted by Jev, the
   * notes it sorted out archived. `none` when nothing is left for the run,
   * its mark kept; else the brief. Jev failing throws its words.
   */
  const brief = (projectId: string) =>
    asReader(projectId, () => briefOf(projectId));

  const briefOf = async (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const night = await nightRead(project);
    if (night instanceof ElysiaStatus) {
      return night;
    }
    const { state, said, waiting, jev, sorted } = night;
    const instructions = instructionsOf(said, jev);
    const carriedNow = new Set(state.carried);
    const run = newRun(jev !== undefined, sorted, {
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
    const corrected = await revertCorrected(project, run);
    if (corrected instanceof ElysiaStatus) {
      return corrected;
    }
    return await ready(project, run);
  };

  // --- a lesson corrected again (§6.2) -------------------------------------------------

  /**
   * Jev's second request of the night (§2 B): for each message the run reads
   * and each lesson grep pairs it with ({@link keptLessons}, at most
   * {@link RELATED}), whether the message states the lesson again, states
   * its opposite, or neither. The pairs that do something, in the messages'
   * order; none with Jev off. Jev failing throws its words.
   */
  const correctsRead = async (
    project: ProjectRow,
    run: Run,
    tree: MemoryTree
  ): Promise<Correction[]> => {
    const key = jevAccess(db);
    if (!key) {
      return [];
    }
    const kept = keptLessons(tree);
    const named = new Map(kept.map((lesson) => [lesson.id, lesson]));
    const asked: [string, ChoiceQuestion][] = [...run.messages].flatMap(
      ([handle, given]) =>
        given.said
          ? relatedTo(given.text, kept).map(
              (lesson): [string, ChoiceQuestion] => [
                `corrects:${handle}:${lesson.id}`,
                {
                  type: "choice",
                  instructions: {
                    message: given.text,
                    lesson: lesson.text,
                    question: memoryJevWords.correctsQuestion,
                  },
                  criteria: memoryJevWords.correctsKinds,
                },
              ]
            )
          : []
    );
    const found: Correction[] = [];
    for (let at = 0; at < asked.length; at += JEV_QUESTIONS) {
      const batch = Object.fromEntries(asked.slice(at, at + JEV_QUESTIONS));
      const result = await askRow(
        "corrects",
        project.id,
        key,
        { project: project.name },
        batch
      );
      for (const [name, answer] of Object.entries(result.answers)) {
        const [, handle = "", id = ""] = name.split(":");
        const lesson = named.get(id);
        if (
          lesson &&
          (answer.choice === "repeats" || answer.choice === "reverses")
        ) {
          found.push({ handle, id, does: answer.choice, text: lesson.text });
        }
      }
    }
    const order = [...run.messages.keys()];
    return found.sort(
      (a, b) => order.indexOf(a.handle) - order.indexOf(b.handle)
    );
  };

  /**
   * What the hub does, with no model, when the person states a lesson again
   * or its opposite (§6.2), each lesson by his newest message on it, each
   * change one commit: a lesson the run took out that he states again is put
   * back as git held its line, and held; one the run made in the last
   * {@link CAPS.retiredDays} days that he states the opposite of is taken
   * back (the one it replaced put back), and held, so no run makes it
   * again; a live one he states again counts a repeat, and at his second it
   * is held and moves up a home. Any other is the run's to replace. What
   * was done is said under each message in the brief.
   */
  const revertCorrected = async (project: ProjectRow, run: Run) => {
    if (!run.jev) {
      return;
    }
    const first = await treeOf(project.id);
    if (first instanceof ElysiaStatus) {
      return first;
    }
    const found = await correctsRead(project, run, first.tree);
    const newest = new Map(found.map((one) => [one.id, one]));
    const did = new Map<string, string>();
    for (const one of newest.values()) {
      // Read, worked out and committed again on a clash.
      const said = await againOnConflict(async () => {
        const read = await treeOf(project.id);
        return read instanceof ElysiaStatus
          ? read
          : await correctedOne(project.id, run, read, one);
      });
      if (said instanceof ElysiaStatus) {
        return said;
      }
      did.set(one.id, said);
    }
    for (const one of found) {
      const lines = run.corrected.get(one.handle) ?? [];
      lines.push(
        memoryRunWords.briefCorrection(
          one.id,
          one.does,
          one.text,
          did.get(one.id) ?? memoryRunWords.didNothing
        )
      );
      run.corrected.set(one.handle, lines);
    }
  };

  /** What the hub does to one lesson a message corrects, committed; what it did, as the brief says it. */
  const correctedOne = async (
    projectId: string,
    run: Run,
    read: MemoryRead,
    one: Correction
  ) => {
    const { tree } = read;
    const lesson = tree.ledger.lessons[one.id];
    const said = run.messages.get(one.handle)?.said;
    if (!(lesson && said)) {
      return memoryRunWords.didNothing;
    }
    const source = saidSource(said);
    const today = dayOf(new Date());
    if (one.does === "repeats" && takenOut(lesson)) {
      return await putBack(projectId, run, read, one.id, lesson, source);
    }
    if (one.does === "repeats" && lesson.state === "live") {
      return await repeatOf(projectId, read, one.id, lesson, source);
    }
    if (
      one.does === "reverses" &&
      lesson.state === "live" &&
      !lesson.held &&
      madeByRun(lesson, today)
    ) {
      return await takeBack(projectId, run, read, one.id);
    }
    return memoryRunWords.didNothing;
  };

  /**
   * Lesson `id` as its line stood before `commit` (in its home's file at
   * the commit's parent), its `Why:` with it; the ledger's words when git
   * no longer reads it there.
   */
  const lineBefore = async (
    projectId: string,
    at: { parent: string | null } | undefined,
    id: string,
    lesson: Lesson
  ): Promise<LessonLine> => {
    const path = pathOf(lesson.home);
    const kept: LessonLine = {
      id,
      text: lesson.retired?.text ?? "",
      why: null,
    };
    if (!(at?.parent && path)) {
      return kept;
    }
    const content = await readFolderFileAt(projectId, at.parent, path);
    if (content instanceof ElysiaStatus || content === undefined) {
      return kept;
    }
    return (
      parseLessons(path, content).lessons.find((line) => line.id === id) ?? kept
    );
  };

  /** The commits that changed lesson `id`'s line, newest first (git's pickaxe on its id). */
  const lineCommits = (projectId: string, id: string) =>
    folderCommitsChanging(projectId, `(${id})`, LESSON_PATHS);

  /**
   * A lesson the run took out and the person stated again, put back as its
   * line stood before the commit that took it out, held, his message a
   * source; the lesson that replaced it, if one did, taken back. One commit.
   */
  const putBack = async (
    projectId: string,
    run: Run,
    read: MemoryRead,
    id: string,
    lesson: Lesson,
    source: LessonSource
  ) => {
    const { tree } = read;
    const commits = await lineCommits(projectId, id);
    if (commits instanceof ElysiaStatus) {
      return commits;
    }
    const [removal] = commits;
    const line = await lineBefore(projectId, removal, id, lesson);
    if (line.text === "") {
      return memoryRunWords.didNothing;
    }
    const by = lesson.retired?.by;
    const replacing = by ? tree.ledger.lessons[by] : undefined;
    const changes: Change[] = [
      ...(by && replacing?.state === "live"
        ? [{ kind: "revert" as const, id: by }]
        : []),
      { kind: "restore", id, line, held: true, source },
    ];
    const sha = await revertCommitted(
      projectId,
      read,
      changes,
      removal?.sha ?? ""
    );
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    run.counts.restored += 1;
    return memoryRunWords.didPutBack;
  };

  /**
   * A lesson the run made and the person stated the opposite of, taken
   * back as the commit that made it put it in: retired and held; the lesson
   * it replaced, if it did, put back as its line stood before that commit.
   * One commit.
   */
  const takeBack = async (
    projectId: string,
    run: Run,
    read: MemoryRead,
    id: string
  ) => {
    const { tree } = read;
    const commits = await lineCommits(projectId, id);
    if (commits instanceof ElysiaStatus) {
      return commits;
    }
    // Its first commit is the one that put its line in (an id is never reused).
    const making = commits.at(-1);
    const replaced = Object.entries(tree.ledger.lessons).find(
      ([, each]) =>
        each.state === "retired" &&
        each.retired?.why === "replaced" &&
        each.retired.by === id
    );
    const before = replaced
      ? await lineBefore(projectId, making, replaced[0], replaced[1])
      : undefined;
    const changes: Change[] = [
      { kind: "revert", id },
      ...(replaced && before?.text
        ? [
            {
              kind: "restore" as const,
              id: replaced[0],
              line: before,
              held: false,
            },
          ]
        : []),
    ];
    const sha = await revertCommitted(
      projectId,
      read,
      changes,
      making?.sha ?? ""
    );
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    run.counts.reverted += 1;
    return memoryRunWords.didTookBack;
  };

  /** `changes` applied and committed as the revert of `sha`, by the hub. */
  const revertCommitted = async (
    projectId: string,
    read: MemoryRead,
    changes: Change[],
    sha: string
  ) => {
    const today = dayOf(new Date());
    const uses = usesOf(projectId);
    const after = changes.reduce(
      (now, change) => applyOp(now, checked(change), today, uses).tree,
      read.tree
    );
    return await commit(projectId, read, after, {
      author: HUB,
      message: `memory: ${memoryRunWords.reverted(sha.slice(0, 9))}`,
    });
  };

  /**
   * A live lesson the person stated again: one more repeat, his message a
   * source; at his second, held, and a knowledge lesson moved up to the
   * index when its words fit a rule. One commit.
   */
  const repeatOf = async (
    projectId: string,
    read: MemoryRead,
    id: string,
    lesson: Lesson,
    source: LessonSource
  ) => {
    const { tree } = read;
    const times = lesson.repeats + 1;
    const held = times >= 2;
    const text = lineOf(tree, id)?.text ?? "";
    const up: LessonHome | undefined =
      held && lesson.home.at === "knowledge" && text.length <= CAPS.rule
        ? { at: "index" }
        : undefined;
    const today = dayOf(new Date());
    const after = applyOp(
      tree,
      checked({ kind: "repeat", id, source, held, ...(up ? { up } : {}) }),
      today,
      usesOf(projectId)
    ).tree;
    const sha = await commit(projectId, read, after, {
      author: HUB,
      message: `memory: ${up ? memoryRunWords.repeatedUp(id, INDEX_FILE) : memoryRunWords.repeated(id, times)}`,
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    if (up) {
      return memoryRunWords.didHeld(INDEX_FILE);
    }
    return held
      ? memoryRunWords.didHeldStays
      : memoryRunWords.didCounted(times);
  };

  /**
   * A night's reading, made ready: upkeep, the lessons staged while Jev was
   * off checked, the messages since the last run and the notes waiting,
   * Jev's word on each, and the notes it sorted out archived.
   */
  const nightRead = async (project: ProjectRow) => {
    const kept = await upkeep(project);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    const rechecked = await recheckStaged(project);
    if (rechecked instanceof ElysiaStatus) {
      return rechecked;
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
    const jev = await jevRead(project, said, waiting);
    const sorted = await sortedOut(project, waiting, jev?.verdicts);
    return sorted instanceof ElysiaStatus
      ? sorted
      : { state, said, waiting, jev, sorted };
  };

  /**
   * A run made ready: kept under way and briefed, or, with nothing to read,
   * its mark kept and `none`.
   */
  const ready = async (project: ProjectRow, run: Run) => {
    if (run.messages.size === 0 && run.notes.size === 0) {
      runs.delete(project.id);
      const marked = await closed(project.id, run, "silent");
      if (marked instanceof ElysiaStatus) {
        return marked;
      }
      return { kind: "none" as const, reason: memoryRunWords.nothingToRead };
    }
    const read = await treeOf(project.id);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    runs.set(project.id, run);
    return {
      kind: "run" as const,
      text: briefText(project, read.tree, run),
    };
  };

  /** The notes Jev sorted out archived as dropped, in one commit; the notes left. */
  const sortedOut = async (
    project: ProjectRow,
    notes: Note[],
    verdicts: Map<string, string> | undefined
  ) => {
    const out = notes.flatMap((note) => {
      const verdict = verdicts?.get(note.id);
      return verdict && verdict !== "lasting"
        ? [{ note, outcome: `dropped: ${verdict}` }]
        : [];
    });
    if (out.length > 0) {
      const done = await againOnConflict(async () => {
        const read = await treeOf(project.id);
        return read instanceof ElysiaStatus
          ? read
          : await commit(project.id, read, read.tree, {
              author: { name: "Jev" },
              message: `memory: Jev sorts out ${out.length} note${out.length === 1 ? "" : "s"}`,
              notes: out,
            });
      });
      if (done instanceof ElysiaStatus) {
        return done;
      }
    }
    const gone = new Set(out.map(({ note }) => note.id));
    return notes.filter((note) => !gone.has(note.id));
  };

  // --- memory_apply ------------------------------------------------------------------

  /** Brands a change the checks passed: the one place a {@link CheckedOp} is made (scripts/memory-cutover-check.ts, C6). */
  const checked = (change: Change): CheckedOp => new CheckedOp(change);

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

  /** The Jev questions one call asks: each message's support for each lesson citing it, and whether each pair of notes says the same. */
  const questionsOf = (run: Run, ops: MemoryOp[], tree: MemoryTree) => {
    const questions: Record<string, Experimental_DecisionQuestion> = {};
    ops.forEach((op, index) => {
      if (op.op === "drop" || op.op === "move") {
        return;
      }
      const text =
        "text" in op
          ? op.text
          : (tree.ledger.lessons[op.id]?.staged?.text ??
            lessonText(tree, op.id) ??
            "");
      const resolved = op.sources.flatMap((handle) => {
        const found = sourceOf(run, handle);
        return found ? [found] : [];
      });
      for (const found of resolved) {
        if (found.kind === "message") {
          questions[`support:${index}:${found.handle}`] = {
            type: "boolean",
            instructions: {
              message: found.given.text,
              lesson: text,
              question: memoryJevWords.supportQuestion,
            },
            criteria: memoryJevWords.supportCriteria,
          };
        }
      }
      const notes = [
        ...resolved.flatMap((found) =>
          found.kind === "note" ? [found.note] : []
        ),
        ...(op.op === "corroborate" ? stagedNotes(tree, op.id) : []),
      ];
      Object.assign(
        questions,
        Object.fromEntries(pairQuestions(`${index}`, notes))
      );
    });
    return questions;
  };

  /** The notes a staged lesson already rests on, as the archive keeps them (their words for Jev's pair). */
  const stagedNotes = (tree: MemoryTree, id: string): Note[] =>
    (tree.ledger.lessons[id]?.sources ?? []).flatMap((source) => {
      if (source.kind !== "note") {
        return [];
      }
      const note = archivedNotes.get(source.id);
      return note ? [note] : [];
    });

  /** The archive's notes this call read, by id: a staged lesson's sources. */
  const archivedNotes = new Map<string, Note>();

  /** A live lesson's words as its file says them. */
  const lessonText = (tree: MemoryTree, id: string): string | undefined =>
    lineOf(tree, id)?.text;

  /** The home an operation names, as the ledger keeps it; or why it is none. */
  const homeAsked = (
    projectId: string,
    tree: MemoryTree,
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
    if (!isTopic(home.knowledge)) {
      return memoryRunWords.noTopic(home.knowledge);
    }
    return roomFor(tree, `${KNOWLEDGE_DIR}/${home.knowledge}.md`)
      ? { at: "knowledge", topic: home.knowledge }
      : memoryRunWords.topicsFull(CAPS.knowledgeFiles);
  };

  /** Why a lesson's words may not stand, or nothing: one line, its cap, no quote, no secret, not said already, and an agent's with no outside page. */
  const textProblem = async (
    run: Run,
    tree: MemoryTree,
    text: string,
    why: string | undefined,
    home: LessonHome,
    by: Lesson["by"]
  ): Promise<string | undefined> => {
    const shaped = shapeProblem(text, why, home);
    if (shaped) {
      return shaped;
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
    const kept = Object.entries(tree.files).find(
      ([path, content]) => homeOf(path) && content && saysAlready(content, text)
    );
    if (kept) {
      return memoryRunWords.saysAlready(kept[0]);
    }
    const gone =
      by === "agent"
        ? removedRules(tree).find(
            (one) => saysAlready(one.text, text) || saysAlready(text, one.text)
          )
        : undefined;
    if (gone) {
      return memoryRunWords.removedRule(gone.id);
    }
    if (by === "agent" && outsideUrls(text, fleetHosts()).length > 0) {
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

  /** The ledger's sources for what an operation rests on. */
  const sourcesFor = (messages: Given[], notes: Note[]): LessonSource[] => [
    ...messages.map((given) => saidSource(given.said)),
    ...notes.map(noteSource),
  ];

  /** Whether some two of `notes` count as two sessions saying the same thing (Jev's pair, at {@link SAME}). */
  const twoSessions = (
    index: number,
    notes: Note[],
    answers: Map<string, number> | undefined
  ): boolean => pairsCount(`${index}`, notes, answers);

  /** What one checked operation commits, and the notes it consumes with their outcome; or why it is refused. */
  type Planned =
    | {
        /** None for a drop, which changes no lesson. */
        change?: Change;
        consumed: string[];
        notes: { note: Note; outcome: string }[];
        said: string;
        /** Its commit's subject, when other than what it says. */
        subject?: string;
        /** A check to file for a lesson once the commit stands. */
        check?: CheckAsk;
      }
    | string;

  /** An `add`, checked (§5.2): its sources, its words, its home; staged when an agent's notes do not yet count as two sessions. */
  const plannedAdd = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    op: Extract<MemoryOp, { op: "add" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> => {
    const kept = checkedSources(run, op.sources, index, answers);
    if (typeof kept === "string") {
      return kept;
    }
    const by: Lesson["by"] = kept.messages.length > 0 ? "owner" : "agent";
    const text = op.text.trim();
    const why = op.why?.trim();
    const home = await checkedLesson(projectId, run, tree, op.home, {
      text,
      why,
      by,
    });
    if (typeof home === "string") {
      return home;
    }
    if (run.adds >= CAPS.nightAdds) {
      return memoryRunWords.nightAdds(CAPS.nightAdds);
    }
    const file = op.anchor ? await anchored(projectId, op.anchor) : undefined;
    if (typeof file === "string") {
      return file;
    }
    const staged = stagingOf(run, by, file, () =>
      twoSessions(index, kept.notes, answers)
    );
    if (staged && stagedCount(tree) >= CAPS.staged) {
      return memoryRunWords.stagedFull(CAPS.staged);
    }
    return addPlanned(tree, op.sources, kept, {
      by,
      file,
      home,
      text,
      why,
      staged,
    });
  };

  /**
   * What Jev reads a new lesson as, in one request: one that says what a
   * kept one says ({@link likeliest}) is refused, naming the one to
   * corroborate, of every live lesson in its home and the index, and every
   * staged one bound there, this run's earlier adds among them (each is in
   * `tree`); an agent's that says what the person removed
   * ({@link removedRules}) is refused, as memory_rule's or the person's to
   * bring back. With Jev off the lesson is staged, and Jev reads it the
   * first night it is on ({@link recheckStaged}). Jev failing, its words.
   */
  const jevOnNew = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    lesson: { by: Lesson["by"]; text: string },
    home: LessonHome
  ): Promise<string | undefined> => {
    if (!run.jev) {
      return;
    }
    const { text } = lesson;
    const beside = besideOf(tree, home, { staged: true });
    const removed = lesson.by === "agent" ? removedRules(tree) : [];
    try {
      const answers = await answersOf(
        projectId,
        Object.fromEntries(keptQuestions("add", text, [...beside, ...removed]))
      );
      const id = likeliest("add", [...beside, ...removed], answers);
      if (id && removed.some((one) => one.id === id)) {
        return memoryRunWords.removedRule(id);
      }
      return id ? memoryRunWords.keptAlready(id) : undefined;
    } catch (error) {
      return memoryRunWords.jevFailed(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  /**
   * Whether a new lesson is staged, and on what (§4.3): with Jev off, every
   * new lesson waits for it, which reads whether a kept lesson says it
   * already and what its sources state; an agent's lesson waits for a
   * second session unless a file the hub read bears it out (one no machine
   * answered for is read again each night). Undefined: it lands.
   */
  const stagingOf = (
    run: Run,
    by: Lesson["by"],
    file: LessonSource | undefined,
    twoOf: () => boolean
  ): { waits: boolean } | undefined => {
    const waits = !run.jev;
    const borne = file?.kind === "file" && file.read !== "";
    return waits || !(by === "owner" || borne || twoOf())
      ? { waits }
      : undefined;
  };

  /**
   * An anchor checked and read (§4.3): a path inside the project's
   * checkout and a literal match of at most {@link ANCHOR_MATCH} characters
   * on one line, the file read at the first checkout whose machine answers.
   * Its source when the match is there, or when no machine answered (its
   * day and sha256 empty: read again each night); why not when the file or
   * the match is not there, or the anchor does not read.
   */
  const anchored = async (
    projectId: string,
    anchor: { match: string; path: string }
  ): Promise<Extract<LessonSource, { kind: "file" }> | string> => {
    const path = folderPath(anchor.path.trim());
    const { match } = anchor;
    if (
      path instanceof ElysiaStatus ||
      path === "" ||
      match.trim() === "" ||
      match.includes("\n") ||
      match.length > ANCHOR_MATCH
    ) {
      return memoryRunWords.anchorUnfit(ANCHOR_MATCH);
    }
    const read = await anchorRead(machine, checkoutsOf(projectId), {
      path,
      match,
    });
    if (read.kind === "gone") {
      return memoryRunWords.anchorGone(path, match);
    }
    const found = read.kind === "found";
    return {
      kind: "file",
      path,
      match,
      sha256: found ? read.sha256 : "",
      read: found ? dayOf(new Date()) : "",
    };
  };

  /** The project's checkouts, the primary first, as an anchor is read at. */
  const checkoutsOf = (projectId: string): AnchorPlace[] =>
    (db.project(projectId)?.places ?? []).flatMap((place) =>
      place.kind === "checkout"
        ? [{ machineId: place.machineId, path: place.path }]
        : []
    );

  /** A checked `add` as one operation commits it: the change, the notes it consumes, and what it says. */
  const addPlanned = (
    tree: MemoryTree,
    consumed: string[],
    kept: { messages: Given[]; notes: Note[] },
    lesson: {
      by: Lesson["by"];
      /** The file it names, read or to be read. */
      file: LessonSource | undefined;
      home: LessonHome;
      staged: { waits: boolean } | undefined;
      text: string;
      why: string | undefined;
    }
  ): Planned => {
    const id = newLessonId((taken) => taken in tree.ledger.lessons);
    const { by, file, home, staged, text, why } = lesson;
    return {
      change: {
        kind: "add",
        id,
        by,
        home,
        sources: [
          ...sourcesFor(kept.messages, kept.notes),
          ...(file ? [file] : []),
        ],
        text,
        why: why || null,
        ...(staged
          ? { staged: staged.waits ? { waits: "jev" as const } : {} }
          : {}),
      },
      consumed,
      notes: kept.notes.map((note) => ({
        note,
        outcome: addOutcome(id, staged !== undefined, by),
      })),
      said: staged
        ? stagedWords(id, staged)
        : memoryRunWords.added(id, pathOf(home) ?? INDEX_FILE),
      ...(staged ? { subject: memoryRunWords.staged(id) } : {}),
    };
  };

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

  /** A new lesson's home as asked, and its words, checked: an agent's goes to knowledge, and no kept lesson says it already ({@link jevOnNew}); the home, or why not. */
  const checkedLesson = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    asked: Extract<MemoryOp, { op: "add" }>["home"],
    lesson: { by: Lesson["by"]; text: string; why: string | undefined }
  ): Promise<LessonHome | string> => {
    const home = homeAsked(projectId, tree, asked);
    if (typeof home === "string") {
      return home;
    }
    if (lesson.by === "agent" && home.at !== "knowledge") {
      return memoryRunWords.agentHome;
    }
    const bad = await textProblem(
      run,
      tree,
      lesson.text,
      lesson.why,
      home,
      lesson.by
    );
    if (bad) {
      return bad;
    }
    const kept = await jevOnNew(projectId, run, tree, lesson, home);
    return kept ?? home;
  };

  /** How many lessons wait staged. */
  const stagedCount = (tree: MemoryTree): number =>
    Object.values(tree.ledger.lessons).filter(
      (lesson) => lesson.state === "staged"
    ).length;

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

  /** A `replace`, checked: a live lesson's words changed, the person's own only by his message. */
  const plannedReplace = async (
    run: Run,
    tree: MemoryTree,
    op: Extract<MemoryOp, { op: "replace" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> => {
    const lesson = tree.ledger.lessons[op.id];
    if (lesson?.state !== "live") {
      return lesson
        ? memoryRunWords.notLive(op.id)
        : memoryRunWords.noLesson(op.id);
    }
    const kept = checkedSources(run, op.sources, index, answers);
    if (typeof kept === "string") {
      return kept;
    }
    const by: Lesson["by"] = kept.messages.length > 0 ? "owner" : "agent";
    const authority = replaceAuthority(run, lesson, by, op.id, () =>
      twoSessions(index, kept.notes, answers)
    );
    if (authority) {
      return authority;
    }
    const text = op.text.trim();
    const why = op.why.trim();
    const bad = await textProblem(run, tree, text, why, lesson.home, by);
    if (bad) {
      return bad;
    }
    const newId = newLessonId((taken) => taken in tree.ledger.lessons);
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      change: {
        kind: "replace",
        id: op.id,
        newId,
        by,
        sources: sourcesFor(kept.messages, kept.notes),
        text,
        why,
      },
      consumed: op.sources,
      notes: kept.notes.map((note) => ({ note, outcome: `landed ${newId}` })),
      said: memoryRunWords.replaced(op.id, newId, pathOf(lesson.home) ?? ""),
    };
  };

  /**
   * Why a source may not change lesson `id` (§4.4), or nothing: an agent's
   * notes never change the person's rule or one he stated again, and only
   * as two sessions; a change resting on his message waits for Jev to read
   * it.
   */
  const replaceAuthority = (
    run: Run,
    lesson: Lesson,
    by: Lesson["by"],
    id: string,
    twoOf: () => boolean
  ): string | undefined => {
    if (by === "owner") {
      return run.jev
        ? undefined
        : memoryRunWords.jevFailed(
            "Jev is off, and a change to a kept lesson waits for it"
          );
    }
    if (lesson.held) {
      return memoryRunWords.held(id);
    }
    if (lesson.by === "owner") {
      return memoryRunWords.agentReplaces;
    }
    return twoOf() ? undefined : memoryRunWords.sameSession;
  };

  /** A `corroborate`, checked: a source stated a lesson again; a note of a second session lands a staged one. */
  const plannedCorroborate = (
    run: Run,
    tree: MemoryTree,
    op: Extract<MemoryOp, { op: "corroborate" }>,
    index: number,
    answers: Map<string, number> | undefined
  ): Planned => {
    const lesson = tree.ledger.lessons[op.id];
    if (!(lesson?.state === "live" || lesson?.state === "staged")) {
      return memoryRunWords.noLesson(op.id);
    }
    const kept = checkedSources(run, op.sources, index, answers);
    if (typeof kept === "string") {
      return kept;
    }
    const { staged } = lesson;
    const lands =
      staged !== undefined &&
      run.jev &&
      (kept.messages.length > 0 ||
        twoSessions(
          index,
          [...stagedNotes(tree, op.id), ...kept.notes],
          answers
        ));
    const path = staged ? (pathOf(staged.home) ?? "") : "";
    if (lands && staged?.home.at === "knowledge" && !roomFor(tree, path)) {
      return memoryRunWords.topicsFull(CAPS.knowledgeFiles);
    }
    return {
      ...corroboration(op.id, lands, kept, op.sources),
      said: lands
        ? memoryRunWords.landed(op.id, path)
        : memoryRunWords.corroborated(op.id),
    };
  };

  /** What a source stating lesson `id` again commits: its sources kept on it, its notes archived as corroborating it. */
  const corroboration = (
    id: string,
    lands: boolean,
    kept: { messages: Given[]; notes: Note[] },
    consumed: string[]
  ) => ({
    change: {
      kind: "corroborate" as const,
      id,
      lands,
      sources: sourcesFor(kept.messages, kept.notes),
    },
    consumed,
    notes: kept.notes.map((note) => ({
      note,
      outcome: `corroborates ${id}`,
    })),
  });

  /** A `move`, checked: a live lesson to another home, an agent's to knowledge only. */
  const plannedMove = (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    op: Extract<MemoryOp, { op: "move" }>
  ): Planned => {
    const lesson = tree.ledger.lessons[op.id];
    if (!(lesson && lesson.state === "live")) {
      return memoryRunWords.notLive(op.id);
    }
    if (lesson.held) {
      return memoryRunWords.held(op.id);
    }
    const home = homeAsked(projectId, tree, op.home);
    if (typeof home === "string") {
      return home;
    }
    if (lesson.by === "agent" && home.at !== "knowledge") {
      return memoryRunWords.agentHome;
    }
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      change: { kind: "move", id: op.id, home },
      consumed: [],
      notes: [],
      said: memoryRunWords.moved(op.id, pathOf(home) ?? ""),
    };
  };

  /**
   * A `drop`, checked: its sources are this run's, and a duplicate names
   * the live lesson it says again (`of`); its notes leave for the archive
   * with the reason, a duplicate's naming that lesson.
   */
  const plannedDrop = (
    run: Run,
    tree: MemoryTree,
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
      const lesson = tree.ledger.lessons[of];
      if (lesson?.state !== "live") {
        return lesson
          ? memoryRunWords.notLive(of)
          : memoryRunWords.noLesson(of);
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
    };
  };

  /** Operation `op` checked, by its kind. */
  const planned = (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    op: MemoryOp,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> | Planned => {
    switch (op.op) {
      case "add":
        return plannedAdd(projectId, run, tree, op, index, answers);
      case "replace":
        return plannedReplace(run, tree, op, index, answers);
      case "corroborate":
        return plannedCorroborate(run, tree, op, index, answers);
      case "move":
        return plannedMove(projectId, run, tree, op);
      case "check":
        return plannedCheck(projectId, run, tree, op, index, answers);
      case "drop":
        return plannedDrop(run, tree, op);
      default:
        return memoryRunWords.noSources;
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
   * passes, applied and committed alone, in order; one Jev request for the
   * whole call. Answers one line per operation: what it committed, or why
   * it was refused.
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
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const answers = await jevAnswers(projectId, run, ops, read.tree);
    if (answers instanceof ElysiaStatus) {
      return answers;
    }
    const lines = await appliedAll(projectId, run, read, ops, answers);
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

  /** Jev's answers to one call's questions ({@link questionsOf}), the archive's notes read for them; Jev failing, its words as the call's refusal. */
  const jevAnswers = async (
    projectId: string,
    run: Run,
    ops: MemoryOp[],
    tree: MemoryTree
  ) => {
    const archive = await notesIn(projectId, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    for (const note of archive) {
      archivedNotes.set(note.id, note);
    }
    return await answersOrRefusal(projectId, questionsOf(run, ops, tree));
  };

  /** Each operation checked and, when it passes, committed alone, in order: one line each. */
  const appliedAll = async (
    projectId: string,
    run: Run,
    first: { head: string; tree: MemoryTree },
    ops: MemoryOp[],
    answers: Map<string, number> | undefined
  ): Promise<string[]> => {
    let read = first;
    const lines: string[] = [];
    for (const [index, op] of ops.entries()) {
      // The first try on the memory as the last commit left it; on a clash,
      // planned again on the memory as it stands now.
      let tries = 0;
      const committedOp = await againOnConflict(async () => {
        tries += 1;
        const at = tries === 1 ? read : await treeOf(projectId);
        if (at instanceof ElysiaStatus) {
          return at;
        }
        const plan = await planned(projectId, run, at.tree, op, index, answers);
        if (typeof plan === "string") {
          return plan;
        }
        const made = await committed(projectId, run, at, plan, op);
        return made instanceof ElysiaStatus ? made : { ...made, plan, at };
      });
      if (
        typeof committedOp === "string" ||
        committedOp instanceof ElysiaStatus
      ) {
        const why =
          typeof committedOp === "string"
            ? committedOp
            : committedOp.response.detail;
        lines.push(`${index + 1}. ${memoryRunWords.refused(why)}`);
        continue;
      }
      // Its check, once the operation stands.
      const said = await followedUp(
        projectId,
        run,
        committedOp.plan,
        committedOp.said
      );
      lines.push(`${index + 1}. ${memoryRunWords.applied(said)}`);
      read = {
        tree: committedOp.tree,
        head: committedOp.sha ?? committedOp.at.head,
      };
    }
    return lines;
  };

  /** A planned operation applied and committed: one commit by the Memory curator, its consumed notes archived in it; the run's counts moved. */
  const committed = async (
    projectId: string,
    run: Run,
    read: { head: string; tree: MemoryTree },
    plan: Exclude<Planned, string>,
    op: MemoryOp
  ) => {
    const today = dayOf(new Date());
    const applied = plan.change
      ? applyOp(read.tree, checked(plan.change), today, usesOf(projectId))
      : { tree: read.tree, evicted: [], redirected: false };
    const moved = [
      ...applied.evicted.map((each) =>
        memoryRunWords.evicted(each.id, each.from, each.to)
      ),
      ...(applied.redirected && plan.change?.kind === "add"
        ? [memoryRunWords.redirected(plan.change.id)]
        : []),
    ];
    const said = [plan.said, ...moved].join("; ");
    const sha = await commit(projectId, read, applied.tree, {
      author: CURATOR,
      message: `memory: ${[plan.subject ?? plan.said, ...moved].join("; ")}`,
      notes: plan.notes.map(({ note, outcome }) => ({
        note: run.notes.get(note.id) ?? note,
        outcome,
      })),
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    consume(run, plan.consumed);
    count(run, plan.change, op);
    return { tree: applied.tree, said, sha };
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
   * A `check`, checked (§5.2): of a kept live lesson (`id`), its sources
   * corroborating it; else a new lesson, as an `add` is, that must land, not
   * stage. Either way its task is filed once the commit stands
   * ({@link fileCheck}), and the rule stays a line until the task is done.
   */
  const plannedCheck = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
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
      return plannedCheckOf(
        run,
        tree,
        { ...op, id: op.id, method },
        {
          index,
          answers,
        }
      );
    }
    const added = await plannedAdd(
      projectId,
      run,
      tree,
      { op: "add", text: op.text, home: op.home, sources: op.sources },
      index,
      answers
    );
    if (typeof added === "string" || added.change?.kind !== "add") {
      return added;
    }
    if (added.change.staged) {
      return memoryRunWords.checkStaged;
    }
    return {
      ...added,
      check: { id: added.change.id, text: added.change.text, method },
    };
  };

  /** A `check` of kept lesson `op.id`: live, with no check yet; its sources corroborate it. */
  const plannedCheckOf = (
    run: Run,
    tree: MemoryTree,
    op: { id: string; method: string; sources: string[] },
    at: { answers: Map<string, number> | undefined; index: number }
  ): Planned => {
    const lesson = tree.ledger.lessons[op.id];
    const line = lineOf(tree, op.id);
    if (!(lesson?.state === "live" && line)) {
      return lesson
        ? memoryRunWords.notLive(op.id)
        : memoryRunWords.noLesson(op.id);
    }
    const kept = checkedSources(run, op.sources, at.index, at.answers);
    if (typeof kept === "string") {
      return kept;
    }
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      ...corroboration(op.id, false, kept, op.sources),
      said: memoryRunWords.checkAsked(op.id),
      check: { id: op.id, text: line.text, method: op.method },
    };
  };

  /** Why a check's method may not stand, or nothing: one line within a fact's cap, quoting no one, holding no secret. */
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
  const count = (run: Run, change: Change | undefined, op: MemoryOp): void => {
    const { counts } = run;
    if (!change) {
      counts.dropped += op.op === "drop" ? op.sources.length : 0;
      return;
    }
    if (change.kind === "add" && change.staged) {
      counts.staged += 1;
    } else if (change.kind === "add") {
      counts.added += 1;
      run.adds += 1;
    } else if (change.kind === "replace") {
      counts.replaced += 1;
      run.changes += 1;
    } else if (
      change.kind === "move" ||
      (change.kind === "corroborate" && op.op === "check")
    ) {
      // A kept lesson moved, or made a check.
      run.changes += 1;
    }
  };

  // --- close ---------------------------------------------------------------------

  /**
   * Where a run ended (§2 D): what it read is marked read (a failed run's
   * is read again the next night), messages it was given and named in no
   * operation carried once, the run's counts kept.
   */
  const closed = (projectId: string, run: Run, outcome: RunOutcome) =>
    stateTurn(projectId, () =>
      // Read, worked out and committed again on a clash.
      againOnConflict(async () => {
        const state = await stateOf(projectId);
        if (state instanceof ElysiaStatus) {
          return state;
        }
        const read = await treeOf(projectId);
        if (read instanceof ElysiaStatus) {
          return read;
        }
        const sha = await commit(
          projectId,
          read,
          read.tree,
          markOfRun(state, run, outcome)
        );
        return sha instanceof ElysiaStatus ? sha : undefined;
      })
    );

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
    const { added, dropped, replaced, restored, retired, reverted, staged } =
      run.counts;
    if (
      added + replaced + retired + staged + dropped + restored + reverted ===
      0
    ) {
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

  /** Each project's read-modify-write of `memory/state.json`, one at a time. */
  const stateTurn = turnTaker();

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
   * wrote it: the note leaves for the archive `withdrawn`, and in the same
   * commit every lesson resting on it alone is retired as withdrawn; a
   * lesson with other sources keeps them.
   */
  const withdraw = (projectId: string, id: string) =>
    againOnConflict(() => withdrawOnce(projectId, id));

  /** {@link withdraw} once, on the memory as it stands. */
  const withdrawOnce = async (projectId: string, id: string) => {
    const note = await withdrawable(projectId, id);
    if (note instanceof ElysiaStatus) {
      return note;
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const today = dayOf(new Date());
    let { tree } = read;
    let retires = 0;
    let keeps = 0;
    for (const [lessonId, lesson] of Object.entries(read.tree.ledger.lessons)) {
      const others = lesson.sources.filter(
        (source) => !(source.kind === "note" && source.id === id)
      );
      if (
        lesson.state === "retired" ||
        others.length === lesson.sources.length
      ) {
        continue;
      }
      if (others.length === 0) {
        retires += 1;
        ({ tree } = applyOp(
          tree,
          checked({ kind: "retire", id: lessonId, why: "withdrawn" }),
          today,
          usesOf(projectId)
        ));
      } else {
        keeps += 1;
        tree = withSources(tree, lessonId, others);
      }
    }
    const sha = await commit(projectId, read, tree, {
      author: YOU,
      message: `memory: ${id} withdrawn`,
      notes: [{ note, outcome: "withdrawn" }],
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    return { withdrawn: id, sha: sha ?? "", retires, keeps };
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

  /** `change` run as one of the project's withdrawals under way, which a brief waits for ({@link asReader}). */
  const asUnnoting = async <T>(
    projectId: string,
    change: () => Promise<T>
  ): Promise<T> => {
    const pending = unnoting.get(projectId) ?? new Set<Promise<unknown>>();
    unnoting.set(projectId, pending);
    const done = change();
    pending.add(done);
    try {
      return await done;
    } finally {
      pending.delete(done);
      if (pending.size === 0) {
        unnoting.delete(projectId);
      }
    }
  };

  /**
   * A session takes back a note it left (`memory_withdraw`): the note leaves
   * the inbox for the archive `withdrawn`, one commit by its author, so no
   * run reads it. Refused for a note another session left, and for one a
   * run has read: archived already, or in the brief of a run being made or
   * under way. No lesson rests on a note no run read, so none changes.
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
    const note = await ownInboxNote(projectId, actor.id, id);
    if (note instanceof ElysiaStatus) {
      return note;
    }
    // Checked with no await before asUnnoting registers the withdrawal: a
    // brief that starts later waits for it, one already started refuses it.
    if (briefing.has(projectId) || runs.get(projectId)?.notes.has(id)) {
      return problem(409, {
        code: "memory-note-read",
        detail: `The memory run is reading ${id} now, so it can no longer be withdrawn.`,
      });
    }
    const sha = await asUnnoting(projectId, () =>
      againOnConflict(async () => {
        const read = await treeOf(projectId);
        if (read instanceof ElysiaStatus) {
          return read;
        }
        return await commit(projectId, read, read.tree, {
          author: { name: note.author },
          message: `memory: ${id} withdrawn by the session that left it`,
          notes: [{ note, outcome: "withdrawn" }],
        });
      })
    );
    return sha instanceof ElysiaStatus
      ? sha
      : { withdrawn: id, text: note.text };
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
      if (gone instanceof ElysiaStatus) {
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

  /** The person's newest message in `actor`'s chain ({@link chainOf}) as a source, when there is one: recorded on a rule change through memory_rule. */
  const personsWord = (
    actor: Pick<InstanceRow, "id" | "parentInstanceId">
  ): LessonSource | undefined => {
    const row = (id: string) => db.getInstancesByIds([id]).at(0);
    const said = db.personSaidLast(chainOf(actor, row));
    return said ? saidSource(said) : undefined;
  };

  /** Why a rule's words through memory_rule may not stand: one line within its cap, no secret, said by no other live line. Nothing when they may. */
  const ruleWordsProblem = async (
    tree: MemoryTree,
    words: { text: string; why: string | undefined },
    home: LessonHome,
    except: string | undefined
  ) => {
    const shaped = shapeProblem(words.text, words.why, home);
    if (shaped) {
      return problem(400, { code: "memory-rule-unfit", detail: shaped });
    }
    for (const each of [words.text, words.why ?? ""]) {
      if ((await redactSecrets(each)) !== each) {
        return problem(400, {
          code: "memory-rule-secret",
          detail: memoryRunWords.secret,
        });
      }
    }
    const same = Object.entries(tree.files)
      .flatMap(([path, content]) =>
        homeOf(path) ? parseLessons(path, content ?? "").lessons : []
      )
      .find(
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

  /** The live or staged lesson `id` names, or why it names none memory_rule may act on (`live` only: one with a line). */
  const ruleOf = (tree: MemoryTree, id: string, liveOnly: boolean) => {
    if (!RULE_ID.test(id)) {
      return problem(400, {
        code: "memory-rule-id-unfit",
        detail: memoryRunWords.ruleIdUnfit(id),
      });
    }
    const lesson = tree.ledger.lessons[id];
    if (!lesson) {
      return problem(404, {
        code: "memory-rule-unknown",
        detail: memoryRunWords.ruleUnknown(id),
      });
    }
    return lesson.state === "live" || (!liveOnly && lesson.state === "staged")
      ? lesson
      : problem(409, {
          code: "memory-rule-not-live",
          detail: memoryRunWords.ruleNotLive(id, lesson.state),
        });
  };

  /** The inbox notes of `free` that name lesson `id`, each archived as settled by the change through memory_rule. */
  const settledBy = (
    free: readonly Note[],
    verb: "removed" | "reworded",
    id: string
  ) => {
    const names = new RegExp(`\\b${id}\\b`, "u");
    return free
      .filter((note) => names.test(note.text))
      .map((note) => ({
        note,
        outcome: memoryRunWords.ruleSettled(verb, id),
      }));
  };

  /** What eviction moved, said after a change. */
  const evictedWords = (applied: {
    evicted: { from: string; id: string; to: string }[];
  }) =>
    applied.evicted
      .map((each) => ` ${memoryRunWords.evicted(each.id, each.from, each.to)}.`)
      .join("");

  /** Who a change through memory_rule is by, and what it rests on: the person's message, when there is one. */
  const whoseRule = (source: LessonSource | undefined) =>
    source
      ? { by: "owner" as const, sources: [source] }
      : { by: "agent" as const, sources: [] };

  /** A removal through memory_rule, checked ({@link ruleChange}). */
  const ruleRemoval = (
    tree: MemoryTree,
    rule: string,
    source: LessonSource | undefined,
    free: readonly Note[]
  ) => {
    const lesson = ruleOf(tree, rule, false);
    if (lesson instanceof ElysiaStatus) {
      return lesson;
    }
    const text = lineOf(tree, rule)?.text ?? lesson.staged?.text ?? "";
    const path = pathOf(lesson.home) ?? LEDGER_FILE;
    const notes = settledBy(free, "removed", rule);
    const change: Change = {
      kind: "remove",
      id: rule,
      ...(source ? { source } : {}),
    };
    return {
      change,
      subject: memoryRunWords.ruleRemoveSaid(rule),
      notes,
      answer: () => memoryRunWords.ruleRemoved(rule, path, text, notes.length),
    };
  };

  /** A rewording through memory_rule, checked ({@link ruleChange}). */
  const ruleRewording = async (
    tree: MemoryTree,
    ask: Extract<RuleAsk, { action: "reword" }>,
    source: LessonSource | undefined,
    free: readonly Note[]
  ) => {
    const { by, sources } = whoseRule(source);
    const lesson = ruleOf(tree, ask.rule, true);
    if (lesson instanceof ElysiaStatus) {
      return lesson;
    }
    const words = {
      text: ask.text,
      why: ask.why ?? lineOf(tree, ask.rule)?.why ?? undefined,
    };
    const unfit = await ruleWordsProblem(tree, words, lesson.home, ask.rule);
    if (unfit) {
      return unfit;
    }
    const newId = newLessonId((taken) => taken in tree.ledger.lessons);
    const path = pathOf(lesson.home) ?? INDEX_FILE;
    const notes = settledBy(free, "reworded", ask.rule);
    const change: Change = {
      kind: "replace",
      by,
      held: true,
      id: ask.rule,
      newId,
      sources,
      text: words.text,
      why: words.why ?? null,
    };
    return {
      change,
      subject: memoryRunWords.replaced(ask.rule, newId, path),
      notes,
      answer: (applied: Applied) =>
        `${memoryRunWords.ruleReworded(ask.rule, newId, path, notes.length)}${evictedWords(applied)}`,
    };
  };

  /** A rule added through memory_rule, checked ({@link ruleChange}). */
  const ruleAddition = async (
    tree: MemoryTree,
    ask: Extract<RuleAsk, { action: "add" }>,
    source: LessonSource | undefined
  ) => {
    const { by, sources } = whoseRule(source);
    const home: LessonHome = { at: "index" };
    const unfit = await ruleWordsProblem(
      tree,
      { text: ask.text, why: ask.why },
      home,
      undefined
    );
    if (unfit) {
      return unfit;
    }
    const id = newLessonId((taken) => taken in tree.ledger.lessons);
    const change: Change = {
      kind: "add",
      by,
      held: true,
      home,
      id,
      sources,
      text: ask.text,
      why: ask.why ?? null,
    };
    return {
      change,
      subject: memoryRunWords.added(id, INDEX_FILE),
      notes: [],
      answer: (applied: Applied) => {
        const landed = applied.tree.ledger.lessons[id]?.home;
        return `${memoryRunWords.ruleAdded(id, (landed && pathOf(landed)) ?? INDEX_FILE)}${evictedWords(applied)}`;
      },
    };
  };

  /**
   * A rule change through memory_rule, checked against the memory as
   * `tree` holds it: the change, its commit's subject, the inbox notes of
   * `free` it settles, and its answer once applied; or why not.
   */
  const ruleChange = (
    tree: MemoryTree,
    ask: RuleAsk,
    source: LessonSource | undefined,
    free: readonly Note[]
  ) => {
    switch (ask.action) {
      case "remove":
        return ruleRemoval(tree, ask.rule, source, free);
      case "reword":
        return ruleRewording(tree, ask, source, free);
      case "add":
        return ruleAddition(tree, ask, source);
      default:
        return unhandled("memory rule ask", ask);
    }
  };

  /** {@link ruleAsked} once, on the memory as it stands: the change checked, applied and committed by the session, with the inbox notes it settles. */
  const ruleOnce = async (
    actor: InstanceRow,
    ask: RuleAsk,
    source: LessonSource | undefined
  ) => {
    const projectId = actor.projectId ?? "";
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const inbox = await notesIn(projectId, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    // A note a run is reading, or one a brief being made may read, stays for the run.
    const reading = runs.get(projectId)?.notes;
    const free = briefing.has(projectId)
      ? []
      : inbox.filter((note) => !reading?.has(note.id));
    const asked = await ruleChange(read.tree, ask, source, free);
    if (asked instanceof ElysiaStatus) {
      return asked;
    }
    const applied = applyOp(
      read.tree,
      checked(asked.change),
      dayOf(new Date()),
      usesOf(projectId)
    );
    const sha = await commit(projectId, read, applied.tree, {
      author: { name: boardTitle(actor) },
      message: `memory: ${memoryRunWords.ruleCommit(asked.subject)}`,
      notes: asked.notes,
    });
    return sha instanceof ElysiaStatus ? sha : asked.answer(applied);
  };

  /**
   * A session changes one of the project's rules at once (`memory_rule`):
   * removes it, rewords it or adds one, through the change the run's own
   * operations go through, one commit by the session. Refused for a session
   * in no project. The person's newest message in its chain
   * ({@link chainOf}), when there is one, is the change's source. What it
   * changes is held: a removed rule stays out ({@link removedRules},
   * `takenOut` never reads it, upkeep keeps its entry), and a reworded or
   * added one is never changed by the run. An inbox note that names a rule
   * it removed or reworded is archived as settled in the same commit,
   * unless a run is reading it. Made again on the memory as it then stands
   * when another writer committed under it.
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
    const source = personsWord(actor);
    return await asUnnoting(projectId, () =>
      againOnConflict(() => ruleOnce(actor, ask, source))
    );
  };

  // --- staged lessons Jev did not check ------------------------------------------------

  /**
   * The staged lessons written while Jev was off (`staged.waits`), checked
   * on the first night it is on (§7): one that says what a live lesson in
   * its home or the index says is merged into it; else one resting on the
   * person's message lands when Jev finds the message states it and is
   * retired when not; one resting on agents' notes lands when two of them
   * count as two sessions saying the same, and otherwise waits on as
   * staged. One commit.
   */
  const recheckStaged = (project: ProjectRow) =>
    againOnConflict(() => recheckStagedOnce(project));

  /** {@link recheckStaged} once, on the memory as it stands. */
  const recheckStagedOnce = async (project: ProjectRow) => {
    if (!jevAccess(db)) {
      return;
    }
    const read = await treeOf(project.id);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const waiting = Object.entries(read.tree.ledger.lessons).filter(
      ([, lesson]) =>
        lesson.state === "staged" && lesson.staged?.waits === "jev"
    );
    if (waiting.length === 0) {
      return;
    }
    const archive = await notesIn(project.id, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    const named = new Map(archive.map((note) => [note.id, note]));
    const notesOf = (lesson: Lesson): Note[] =>
      lesson.sources.flatMap((source) => {
        const note = source.kind === "note" ? named.get(source.id) : undefined;
        return note ? [note] : [];
      });
    const beside = stagedBeside(read.tree, waiting);
    const answers = await answersOf(
      project.id,
      Object.fromEntries(
        waiting.flatMap(([id, lesson]) =>
          stagedQuestions(id, lesson, notesOf, beside.get(id) ?? [])
        )
      )
    );
    const today = dayOf(new Date());
    let { tree } = read;
    for (const [id, lesson] of waiting) {
      tree = rechecked(
        project.id,
        tree,
        [id, lesson],
        { notes: notesOf(lesson), beside: beside.get(id) ?? [] },
        { answers, today }
      );
    }
    return await commit(project.id, read, tree, {
      author: { name: "Jev" },
      message: `memory: Jev checks ${waiting.length} lesson${waiting.length === 1 ? "" : "s"} staged while it was off`,
    });
  };

  /** `tree` with one lesson staged while Jev was off as Jev's answers make it ({@link recheckStaged}): changed ({@link recheckedChange}) or waiting on with Jev's check done. */
  const rechecked = (
    projectId: string,
    tree: MemoryTree,
    [id, lesson]: [string, Lesson],
    read: { beside: readonly Beside[]; notes: Note[] },
    {
      answers,
      today,
    }: { answers: Map<string, number> | undefined; today: string }
  ): MemoryTree => {
    const change = recheckedChange(id, lesson, read, answers);
    let now = tree;
    if (change) {
      now = applyOp(tree, checked(change), today, usesOf(projectId)).tree;
    } else if (lesson.staged) {
      const { waits: _, ...staged } = lesson.staged;
      now = withLesson(tree, id, { ...lesson, staged });
    }
    return now;
  };

  /** Jev's questions on one lesson staged while it was off: each message's support, each pair of notes' sameness, and whether it says what a lesson of `beside` says. */
  const stagedQuestions = (
    id: string,
    lesson: Lesson,
    notesOf: (lesson: Lesson) => Note[],
    beside: readonly Beside[]
  ): [string, Experimental_DecisionQuestion][] => {
    const text = lesson.staged?.text ?? "";
    const support = lesson.sources.flatMap(
      (source): [string, Experimental_DecisionQuestion][] => {
        const said = source.kind === "said" ? sentText(source.send) : undefined;
        return source.kind === "said" && said !== undefined
          ? [
              [
                `support:${id}:${source.send}`,
                {
                  type: "boolean",
                  instructions: {
                    message: cut(said),
                    lesson: text,
                    question: memoryJevWords.supportQuestion,
                  },
                  criteria: memoryJevWords.supportCriteria,
                },
              ],
            ]
          : [];
      }
    );
    return [
      ...support,
      ...pairQuestions(`${id}`, notesOf(lesson)),
      ...keptQuestions(id, text, beside),
    ];
  };

  /**
   * What Jev's answers make of a lesson staged while it was off: one that
   * says what a live lesson of `beside` says is merged into it; else one resting
   * on the person's message lands when a message states it and is retired
   * when none does; one resting on notes lands when two count as two
   * sessions saying the same. Nothing when it waits on.
   */
  const recheckedChange = (
    id: string,
    lesson: Lesson,
    { notes, beside }: { beside: readonly Beside[]; notes: Note[] },
    answers: Map<string, number> | undefined
  ): Change | undefined => {
    const into = likeliest(id, beside, answers);
    if (into) {
      return { kind: "merge", id, into };
    }
    const saids = lesson.sources.flatMap((source) =>
      source.kind === "said" ? [source.send] : []
    );
    if (saids.length > 0) {
      const states = saids.some(
        (send) => (answers?.get(`support:${id}:${send}`) ?? 0) >= SUPPORTS
      );
      return states
        ? { kind: "corroborate", id, lands: true, sources: [] }
        : { kind: "retire", id, why: "unneeded" };
    }
    return pairsCount(`${id}`, notes, answers)
      ? { kind: "corroborate", id, lands: true, sources: [] }
      : undefined;
  };

  /** Whether some two of `notes` count as two sessions saying the same thing, by Jev's answers on the pairs named under `key`. */
  const pairsCount = (
    key: string,
    notes: Note[],
    answers: Map<string, number> | undefined
  ): boolean =>
    notes.some((a, at) =>
      notes.slice(at + 1).some((b) => {
        // Asked in either order (pairQuestions), read in both.
        const same =
          answers?.get(`same:${key}:${a.id}:${b.id}`) ??
          answers?.get(`same:${key}:${b.id}:${a.id}`) ??
          0;
        return countsTogether(noteSource(a), noteSource(b)) && same >= SAME;
      })
    );

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

  /** What the hub does once per project as it starts on this build ({@link lessonTasksDropped}). */
  const start = async (projects: readonly ProjectRow[]): Promise<void> => {
    for (const project of projects) {
      await lessonTasksDropped(project);
    }
  };

  return {
    start,
    brief,
    withdraw,
    unnote,
    ruleAsked,
    purged,
    recheckStaged,
    apply,
    close,
    upkeep,
  };
};

/** A lesson's id, as its line ends. */
const RULE_ID = /^L-[0-9a-f]{6}$/u;

/** The subject a run's closing commit starts with ({@link closed}). */
const RUN_MARK = "memory: the nightly run's mark";

export type MemoryRun = ReturnType<typeof createMemoryRun>;
