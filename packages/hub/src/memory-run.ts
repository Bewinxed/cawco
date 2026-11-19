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
 * - **Checks** ({@link plannedCheck}): a rule a tool can test is filed as
 *   a task in the project (`Check: <rule>`, through the tasks module, in
 *   the stage new tasks enter), its id kept on the lesson; the rule stays
 *   a line until the task is done, when upkeep enforces it and takes the
 *   line out ({@link tasksEnded}). A lesson of the index or a skill the
 *   person states again twice is filed as one by the hub.
 * - **Lessons about CawCo** ({@link productTask}): a lesson that says how
 *   CawCo behaves, or should behave, for every user (a defect worked
 *   around, what a tool or a session does) has the lifecycle of a check.
 *   In a project that develops CawCo, Jev reads each new lesson and a
 *   replace's new words for it (row `product`, in the request that reads
 *   it as kept already, {@link jevOnNew}); one it reads yes of is written
 *   as any lesson, and a task to build it into CawCo is filed, unless an
 *   open task asks for it already, its id kept on the lesson (`product`).
 *   The lesson stays until the task is done, when upkeep retires it
 *   `product`; a dropped task clears the mark and the lesson stays
 *   ({@link tasksEnded}). Anywhere else the lesson is kept unmarked: that
 *   project cannot change CawCo, and its agents need the lesson until
 *   CawCo carries it. The recovery, asked for, does it once for what came
 *   before ({@link productRepair}).
 * - **Re-test on a model change** ({@link retest}, §6.3): when the
 *   project's sessions ran in the last week on a model the run's state
 *   does not hold, each index and skill lesson with a probe (a situation,
 *   and what a right answer does, written by the curator) is asked of that
 *   model three times in clean one-turn sessions (routines.ts `probe`),
 *   the lesson left out; Jev judges each answer. One the model passed
 *   every time moves to knowledge, its `Why:` naming the model and the
 *   day; the rest stay, tested. Off the night's path, one commit. The
 *   check of whether probes tell anything at all ({@link probeCheck}, the
 *   spec's proof run 7) runs each probe with and without its lesson.
 * - **Close** ({@link close}): where the run read up to is kept
 *   (`memory/state.json`), messages it was given and named in no operation
 *   carried to the next night once, and the run's one line said.
 * - **The cutover** ({@link cutover}), once per project as the hub starts on
 *   this: AGENTS.md and `knowledge/` converted to lessons, every line that
 *   breaks a text rule or a cap handed to the **recovery** run
 *   (`memory/recovery.json`), with the notes archived unread before because
 *   their session had read the web ({@link recoveryBrief}). The recovery
 *   archives nothing unread: a note its run names in no operation is the
 *   next run's first, and each run that judged something starts the next
 *   ({@link recoveryLeft}). Each time it is asked for, the live lessons
 *   that say the same are made one first ({@link mergedSame}), lessons
 *   about CawCo get their task once ({@link productRepair}), and it reads
 *   on, after what it holds, every note no run judged: those earlier
 *   recovery runs archived unread, and those archived as a duplicate of no
 *   live lesson ({@link recoveryStart}).
 */

import { developsCawco } from "@cawco/core/binary-distribution";
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { RoutineOutcome } from "@cawco/core/routine-kinds";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
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
  MemoryLedger,
  MemoryRunState,
  WorkBudget,
} from "./db/stored-types";
import { type JevAccess, jevAccess } from "./jev";
import { askRow, offLine } from "./jev-placement";
import type { JevResult } from "./jev-types";
import {
  ARCHIVE_DIR,
  archivedNote,
  duplicateOutcome,
  duplicateUnjudged,
  fileOr,
  INBOX_DIR,
  type MemoryOp,
  memoryFiles,
  type Note,
  notesIn,
  saysAlready,
} from "./memory";
import { convertFile, type OldFact } from "./memory-legacy";
import {
  applyOp,
  CAPS,
  type Change,
  CheckedOp,
  dayOf,
  grepScore,
  homeOf,
  INDEX_FILE,
  indexShape,
  indexWithRule,
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
  countsTogether,
  type MachineRead,
  quoteProblem,
  rootOf,
} from "./memory-sources";
import {
  changeFolderFiles,
  type FolderAuthor,
  folderCommitsCarrying,
  folderCommitsChanging,
  folderHistory,
  folderPath,
  readFolderFileAt,
  turnTaker,
  YOU,
} from "./project-folder";
import { redactSecrets } from "./secret-filter";
import { outsideUrls } from "./web-reads";

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
 * refusal costs one repeat from him. The recovery run measures it.
 */
const SUPPORTS = 0.7;
/** Two notes say the same lesson at or over this: the likelier of two. */
const SAME = 0.5;
/** The operations one `memory_apply` call takes. */
const APPLY_OPS = 20;
/** Lessons grep pairs with a message in the brief, at most. */
const RELATED = 3;
/** The recovery run's notes, and the messages before each it reads. */
const RECOVERY_NOTES = 60;
const RECOVERY_HOURS = 48;
const RECOVERY_FILE = "memory/recovery.json";

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
  /** Lessons about CawCo given a task to build them into CawCo ({@link productTask}). */
  product: number;
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

/** The task field naming the lesson a check's task, or a task building one into CawCo, is for. */
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

const LESSON_ID_TAIL = /\s*\(L-[0-9a-f]{6}\)\s*$/u;

/** Whether one line of `content` says `text` word for word and no more, its lesson id aside: a duplicate, where a longer line saying it too is not. */
const saysAsLine = (content: string, text: string): boolean =>
  content.split("\n").some((line) => {
    const bare = line.replace(LESSON_ID_TAIL, "");
    return saysAlready(bare, text) && saysAlready(text, bare);
  });

/** The lesson of `path`'s file whose line says `text` word for word and no more. */
const lineSaying = (
  path: string,
  content: string,
  text: string
): string | undefined =>
  parseLessons(path, content).lessons.find(
    (line) => saysAlready(line.text, text) && saysAlready(text, line.text)
  )?.id;

/** What a probe's clean session came to: its answer, or why it gave none (routines.ts `probe`). */
export type ProbeAnswer =
  { kind: "answered"; text: string } | { kind: "failed"; why: string };

/** The runs of a probe on one model, each a clean session: three of three passed is the model doing it unprompted. */
const PROBE_RUNS = 3;
/** A re-test's dollars in all, its probes' sessions sharing them. */
const RETEST_USD = 10;
/** A probe's session: one answer and its finish_item, with room for a read. */
const PROBE_TURNS = 4;
const PROBE_MINUTES = 10;
/** An answer passes its probe at or over this: the likelier of two. */
const PROBE_PASS = 0.5;
/** How far back a session's model counts as one the project runs on. */
const MODEL_DAYS = 7;
/** The lessons a probe check runs, at most: the five the build spec's proof run names. */
const PROBE_CHECK_LESSONS = 5;
/** Where a probe check writes what it found. */
const PROBE_CHECK_FILE = "memory/probe-check.json";

/** The memory files a lesson's line lives in, as git's pickaxe reads them for its commits (the archive among them). */
const LESSON_PATHS = [INDEX_FILE, LESSONS_DIR, KNOWLEDGE_DIR] as const;

/** One message given to a run, under its handle. */
interface Given {
  /** A line of AGENTS.md or knowledge/ from before the nightly run (the recovery's), in place of a message. */
  legacy?: { path: string; text: string };
  said?: PersonSaid;
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
  kind: "nightly" | "recovery";
  /** Messages and legacy lines it was given, by handle (`m1`, `l1`). */
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
  /** One clean, one-turn answer of a model to a probe (routines.ts `probe`), bound late: the routines are made after this module. */
  readonly probe: (
    projectId: string,
    ask: {
      budget: WorkBudget;
      harness: HarnessKind;
      model: string;
      prompt: string;
    }
  ) => Promise<ProbeAnswer>;
  /** The project's next recovery run started (routines.ts `recover`), when the one that ended judged something and left something. */
  readonly recoverNext: (projectId: string) => void;
  /** The skills the fleet lists for the project's sessions, each with its one-line description. */
  readonly skillsFor: (
    projectId: string
  ) => { description: string; name: string }[];
  /**
   * The project's tasks, as a check's or a lesson's for CawCo is filed and
   * read (tasks.ts): one filed by the hub in the stage new tasks enter,
   * answering its id; how one has ended (`dropped` when there is no such
   * task); those not done or dropped, each by its title; one dropped
   * opened again; one filed for a lesson dropped.
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
    open: (
      projectId: string
    ) => Promise<{ id: string; title: string }[] | { refused: string }>;
    state: (
      projectId: string,
      id: string
    ) => Promise<"open" | "done" | "dropped" | undefined>;
    /**
     * Task `id` open again for `reason`: one dropped moved to the stage new
     * tasks enter (`reopened`); one open or done left where it is, as it
     * stands; `gone` when there is no such task.
     */
    reopen: (
      projectId: string,
      id: string,
      reason: string
    ) => Promise<"reopened" | "open" | "done" | "gone" | { refused: string }>;
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

/** `memory/recovery.json`: what the recovery's runs read, until an operation names each. */
const RecoverySchema = z.object({
  legacy: z.array(z.object({ path: z.string(), text: z.string() })),
  notes: z.array(z.string()),
  runs: z.number(),
});
type Recovery = z.infer<typeof RecoverySchema>;

const RunStateSchema = z.object({
  carried: z.array(z.string()),
  lastRun: z
    .object({
      added: z.number(),
      at: z.string(),
      checks: z.number().optional(),
      dropped: z.number(),
      product: z.number().optional(),
      read: z.number(),
      replaced: z.number(),
      restored: z.number().optional(),
      retired: z.number(),
      reverted: z.number().optional(),
      staged: z.number(),
    })
    .nullable(),
  models: z.array(z.string()).optional(),
  productTasked: z.string().optional(),
  recovered: z.string().optional(),
  through: z.string(),
}) satisfies z.ZodType<MemoryRunState>;

/** The choices Jev reads a message by: whether it says how agents work here from now on. */
const SAID_CRITERIA: Record<SaidKind, string> = memoryJevWords.saidKinds;

const isSaidKind = (choice: string): choice is SaidKind =>
  Object.hasOwn(SAID_CRITERIA, choice);

/** A task title's room for a lesson's words after its lead (tasks.ts takes 200 characters). */
const TITLE_WORDS = 170;

/** A lesson's words as a task's title carries them. */
const titleWords = (text: string): string =>
  text.length > TITLE_WORDS ? `${text.slice(0, TITLE_WORDS)}…` : text;

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
  product: 0,
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
): (
  "said" | "inbox" | "support" | "same" | "kept" | "product" | "covers"
)[] => {
  const rows = {
    "said:": "said",
    "note:": "inbox",
    "support:": "support",
    "same:": "same",
    "kept:": "kept",
    "product:": "product",
    "covers:": "covers",
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
const newRun = (
  kind: Run["kind"],
  jev: boolean,
  notes: Note[],
  counts: Partial<Counts>
): Run => ({
  kind,
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

/** Each live lesson of `tree` with its line's words, and each staged one with its staged words. */
const keptOrStaged = (tree: MemoryTree) =>
  Object.entries(tree.ledger.lessons).flatMap(([id, lesson]) => {
    const live = lesson.state === "live";
    const text = live ? lineOf(tree, id)?.text : lesson.staged?.text;
    return text && (live || lesson.state === "staged") ? [{ id, text }] : [];
  });

/**
 * Every lesson the ledger's history retired `product`, by its id: of
 * `commits` (newest first), the first whose ledger holds it retired
 * `product` and whose parent's holds it live or staged; that parent's
 * entry, the parent, and the task kept on the retirement.
 */
const productRetirements = async (
  commits: readonly { parent: string | null; sha: string }[],
  ledgerAt: (sha: string) => Promise<MemoryLedger | undefined>
) => {
  const found = new Map<
    string,
    { entry: Lesson; parent: string; task: string | undefined }
  >();
  for (const { sha, parent } of commits) {
    if (!parent) {
      continue;
    }
    const after = await ledgerAt(sha);
    const before = await ledgerAt(parent);
    for (const [id, lesson] of Object.entries(after?.lessons ?? {})) {
      const entry = before?.lessons[id];
      if (
        !found.has(id) &&
        lesson.retired?.why === "product" &&
        (entry?.state === "live" || entry?.state === "staged")
      ) {
        found.set(id, { entry, parent, task: lesson.retired.task });
      }
    }
  }
  return found;
};

/**
 * A run's closing commit (§2 D): its state's next mark, and the recovery's
 * inputs left, the file gone once none is.
 */
const markOfRun = (
  state: MemoryRunState,
  run: Run,
  outcome: RunOutcome,
  recovery:
    { done: boolean; file?: { content: string; path: string } } | undefined
) => {
  const at = new Date().toISOString();
  const next = nextState(state, run, outcome, at);
  const kept = recovery?.done ? { ...next, recovered: dayOf(at) } : next;
  return {
    author: HUB,
    message: `${markOf(run.kind)}, ${dayOf(at)}`,
    extra: [
      ...(Bun.deepEquals(kept, state)
        ? []
        : [{ path: RUN_STATE_FILE, content: jsonText(kept) }]),
      ...(recovery?.file ? [recovery.file] : []),
    ],
    gone: recovery?.done ? [RECOVERY_FILE] : [],
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
  // A recovery run reads old messages: the nightly's mark and carry are not its.
  if (run.kind === "recovery") {
    return { ...state, lastRun: { at, ...run.counts } };
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

/** Jev's question whether lesson `text` is about how CawCo behaves for every user, named under `key`. */
const productQuestion = (
  key: string,
  text: string
): [string, Experimental_DecisionQuestion] => [
  `product:${key}`,
  {
    type: "boolean",
    instructions: { lesson: text, question: memoryJevWords.productQuestion },
    criteria: memoryJevWords.productCriteria,
  },
];

/** Whether Jev read the lesson asked under `key` as about CawCo, at or over {@link SAME}. */
const aboutCawco = (
  key: string,
  answers: Map<string, number> | undefined
): boolean => (answers?.get(`product:${key}`) ?? 0) >= SAME;

/** Jev's question on each task of `open`, whether it builds lesson `text` into CawCo, named under `key`. */
const coversQuestions = (
  key: string,
  text: string,
  open: readonly { id: string; title: string }[]
): [string, Experimental_DecisionQuestion][] =>
  open.map((task): [string, Experimental_DecisionQuestion] => [
    `covers:${key}:${task.id}`,
    {
      type: "boolean",
      instructions: {
        lesson: text,
        task: task.title,
        question: memoryJevWords.coversQuestion,
      },
      criteria: memoryJevWords.coversCriteria,
    },
  ]);

/** The one of `beside` Jev read yes of in `row` under `key` (`kept`: it says what the lesson asked says; `covers`: the open task builds the lesson into CawCo): the likeliest at or over {@link SAME}. */
const likeliest = (
  row: "kept" | "covers",
  key: string,
  beside: readonly { id: string }[],
  answers: Map<string, number> | undefined
): string | undefined => {
  let best: { id: string; score: number } | undefined;
  for (const kept of beside) {
    const score = answers?.get(`${row}:${key}:${kept.id}`) ?? 0;
    if (score >= SAME && score > (best?.score ?? 0)) {
      best = { id: kept.id, score };
    }
  }
  return best?.id;
};

/**
 * What a live lesson whose line `line` another memory file says word for
 * word becomes: merged into that line's lesson, or retired as no longer
 * needed when the line is the person's own (the index's Notes); nothing
 * when no other file says it.
 */
const duplicateChange = (
  tree: MemoryTree,
  id: string,
  line: string,
  own: string | undefined
): Change | undefined => {
  const others = Object.entries(tree.files).flatMap(([path, content]) =>
    path !== own && homeOf(path) !== undefined && content !== undefined
      ? [{ path, content }]
      : []
  );
  const into = others
    .map(({ path, content }) => lineSaying(path, content, line))
    .find((found) => tree.ledger.lessons[found ?? ""]?.state === "live");
  if (into) {
    return { kind: "merge", id, into };
  }
  return others.some(({ content }) => saysAsLine(content, line))
    ? { kind: "retire", id, why: "unneeded" }
    : undefined;
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

/** Whether a lesson id names a live lesson of `tree`. */
const liveIn =
  (tree: MemoryTree) =>
  (id: string): boolean =>
    tree.ledger.lessons[id]?.state === "live";

/**
 * Each pair of live lessons that may say the same: in one home, or one of
 * them in the index, sharing two words or more (memory-lessons.ts
 * `grepScore`). Each pair once, the smaller id first.
 */
const samePairs = (tree: MemoryTree): [Beside, Beside][] => {
  const live = Object.entries(tree.ledger.lessons)
    .flatMap(([id, lesson]) => {
      const line = lesson.state === "live" ? lineOf(tree, id) : undefined;
      const path = pathOf(lesson.home);
      return line && path ? [{ id, text: line.text, path }] : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  return live.flatMap((a, at) =>
    live
      .slice(at + 1)
      .filter(
        (b) =>
          (a.path === b.path ||
            a.path === INDEX_FILE ||
            b.path === INDEX_FILE) &&
          grepScore(wordsOf(a.text), b.text) >= 2
      )
      .map((b): [Beside, Beside] => [
        { id: a.id, text: a.text },
        { id: b.id, text: b.text },
      ])
  );
};

/** How early a session reads a lesson's home: the index at its start, a skill's lessons before the skill, knowledge in a brief. */
const HOME_RANK: Record<LessonHome["at"], number> = {
  index: 3,
  skill: 2,
  knowledge: 1,
  none: 0,
};

/**
 * Of two lessons that say the same, the one kept first and the one merged
 * into it second: the one the person holds, then his, then the one in the
 * home sessions read first (the index, a skill, knowledge), then the one
 * stated again the most, then the older, then the smaller id.
 */
const keptFirst = (
  tree: MemoryTree,
  a: string,
  b: string
): [string, string] => {
  const rank = (id: string) => {
    const lesson = tree.ledger.lessons[id];
    return [
      lesson?.held ? 1 : 0,
      lesson?.by === "owner" ? 1 : 0,
      HOME_RANK[lesson?.home.at ?? "none"],
      lesson?.repeats ?? 0,
    ] as const;
  };
  const [ra, rb] = [rank(a), rank(b)];
  for (const at of [0, 1, 2, 3] as const) {
    if (ra[at] !== rb[at]) {
      return ra[at] > rb[at] ? [a, b] : [b, a];
    }
  }
  const since = (id: string) => tree.ledger.lessons[id]?.since ?? "";
  if (since(a) !== since(b)) {
    return since(a) < since(b) ? [a, b] : [b, a];
  }
  return a < b ? [a, b] : [b, a];
};

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

/** `tree` with lesson `id` waiting on no task of `mark`: its check's, or the one building it into CawCo. */
const unmarked = (
  tree: MemoryTree,
  id: string,
  mark: "check" | "product"
): MemoryTree => {
  const lesson = tree.ledger.lessons[id];
  if (!lesson) {
    return tree;
  }
  const { [mark]: _ended, ...rest } = lesson;
  return withLesson(tree, id, rest);
};

/** Whether a line's words stand as a lesson: within `cap`, one line, quoting no one. */
const fits = (text: string, cap: number): boolean =>
  text.length <= cap &&
  !text.includes("\n") &&
  quoteProblem(text, []) === undefined;

/** A legacy line's words for the recovery run: its fact and its why. */
const legacyText = (fact: OldFact): string =>
  fact.why ? `${fact.text} Why: ${fact.why}` : fact.text;

/** What the cutover made so far: the lessons by id, and the lines left for the recovery run. */
interface Conversion {
  legacy: { path: string; text: string }[];
  lessons: Record<string, Lesson>;
  today: string;
}

/** A converted fact's lesson line, its id new to the conversion, its `Why:` kept when it fits. */
const lessonOf = (conversion: Conversion, fact: OldFact) => ({
  id: newLessonId((taken) => taken in conversion.lessons),
  text: fact.text,
  why: fact.why && fits(fact.why, CAPS.why) ? fact.why : null,
});

/**
 * Knowledge file `path` in `files` converted in place (§11.2): each current
 * fact line a lesson (`by: agent`), each one that breaks a rule left for
 * the recovery run, its past lines appended to its topic's archive.
 */
const convertKnowledge = (
  conversion: Conversion,
  files: Partial<Record<string, string>>,
  path: string,
  sourcesOf: (fact: OldFact) => LessonSource[]
): void => {
  const home = homeOf(path);
  if (home?.at !== "knowledge") {
    return;
  }
  const { today } = conversion;
  const converted = convertFile(files[path] ?? "", (fact) => {
    if (!fits(fact.text, CAPS.fact)) {
      conversion.legacy.push({ path, text: legacyText(fact) });
      return;
    }
    const line = lessonOf(conversion, fact);
    conversion.lessons[line.id] = {
      by: "agent",
      home,
      repeats: 0,
      seen: today,
      since: today,
      sources: sourcesOf(fact),
      state: "live",
    };
    return line;
  });
  files[path] = converted.content;
  if (converted.past.length > 0) {
    const into = `${KNOWLEDGE_DIR}/archive/${home.topic}.md`;
    const before = files[into] ?? "";
    files[into] =
      `${before.trimEnd()}${before.trim() ? "\n\n" : ""}${converted.past.join("\n")}\n`;
  }
};

/**
 * AGENTS.md converted (§11.3): each fact line of its curated sections a
 * rule of its `## Rules`, which the person approved, one that breaks a rule
 * left for the recovery run; then in the index's shape, his `## Notes` as
 * they stand.
 */
const convertIndex = (
  conversion: Conversion,
  projectName: string,
  content: string,
  head: string
): string => {
  const { today } = conversion;
  const rules: LessonLineOf[] = [];
  const stripped = convertFile(content, (fact) => {
    if (!fits(fact.text, CAPS.rule)) {
      conversion.legacy.push({ path: INDEX_FILE, text: legacyText(fact) });
      return;
    }
    const line = lessonOf(conversion, fact);
    conversion.lessons[line.id] = {
      by: "owner",
      home: { at: "index" },
      repeats: 0,
      seen: today,
      since: today,
      sources: [{ kind: "approved", commit: head }],
      state: "live",
    };
    rules.push(line);
    return null;
  });
  return rules.reduce(
    (index, rule) => indexWithRule(index, rule),
    indexShape(projectName, stripped.content)
  );
};

type LessonLineOf = ReturnType<typeof lessonOf>;

/** What a staged lesson's `add` answers: one note, or Jev off. */
const stagedWords = (id: string, staged: { waits: boolean }): string =>
  staged.waits ? memoryRunWords.stagedForJev(id) : memoryRunWords.stagedAs(id);

export const createMemoryRun = ({
  db,
  fleetHosts,
  folderChanged,
  machine,
  probe,
  recoverNext,
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

  // --- the tree ----------------------------------------------------------------

  /** The project's memory files and ledger as they stand, and the folder's head they were read at. */
  const treeOf = async (projectId: string) => {
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
    const ledgerText = await fileOr(projectId, LEDGER_FILE);
    if (ledgerText instanceof ElysiaStatus) {
      return ledgerText;
    }
    const ledger = parseLedger(ledgerText);
    if (typeof ledger === "string") {
      return problem(500, { code: "memory-ledger-unread", detail: ledger });
    }
    const history = await folderHistory(projectId, "", 1);
    if (history instanceof ElysiaStatus) {
      return history;
    }
    const tree: MemoryTree = { files, ledger };
    return { tree, head: history.commits[0]?.sha ?? "" };
  };

  /**
   * One commit of `after` over `before`: every memory file it changed, the
   * ledger when it changed, and each note it consumed archived with what
   * came of it. Nothing when nothing changed.
   */
  const commit = async (
    projectId: string,
    before: MemoryTree,
    after: MemoryTree,
    change: {
      author: FolderAuthor;
      /** Files of `memory/` beside the tree: the run's state, the recovery's inputs. */
      extra?: { content: string; path: string }[];
      /** Files of `memory/` taken out. */
      gone?: string[];
      message: string;
      notes?: { note: Note; outcome: string }[];
    }
  ) => {
    const writes = Object.entries(after.files).flatMap(([path, content]) =>
      content !== undefined && content !== before.files[path]
        ? [{ path, content }]
        : []
    );
    const ledger = renderLedger(after.ledger);
    if (ledger !== renderLedger(before.ledger)) {
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
      { author: change.author, message: change.message }
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
   * days taken out of the ledger. One commit, `memory: upkeep <day>`.
   */
  const upkeep = async (project: ProjectRow) => {
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
    const recovery = await recoveryOf(project.id);
    if (recovery instanceof ElysiaStatus) {
      return recovery;
    }
    // A note the recovery still holds waits for it, however old.
    const held = new Set(recovery?.notes ?? []);
    const unread = inbox.filter(
      (note) =>
        !held.has(note.id) && olderThan(dayOf(note.time), today, NOTE_DAYS)
    );
    return await commit(project.id, before, tree, {
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
   * Every lesson whose task has ended (§2 A.4): a live one's check, or the
   * task building a live or staged one into CawCo. Done, the check holds
   * the rule, so the lesson is enforced and its line taken out; or CawCo
   * carries it, so the lesson retires `product`. Dropped or gone, the
   * lesson stays as it is and waits on no task.
   */
  const tasksEnded = async (
    projectId: string,
    tree: MemoryTree,
    today: string
  ): Promise<MemoryTree> => {
    let now = tree;
    for (const id of Object.keys(tree.ledger.lessons)) {
      now = await taskEnded(projectId, now, id, "check", today);
      now = await taskEnded(projectId, now, id, "product", today);
    }
    return now;
  };

  /** {@link tasksEnded} for lesson `id`'s task of `mark`: its check's (a live lesson's), or the one building it into CawCo (a live or staged one's). */
  const taskEnded = async (
    projectId: string,
    tree: MemoryTree,
    id: string,
    mark: "check" | "product",
    today: string
  ): Promise<MemoryTree> => {
    const lesson = tree.ledger.lessons[id];
    const task = lesson?.[mark]?.task;
    const waits =
      lesson?.state === "live" ||
      (mark === "product" && lesson?.state === "staged");
    if (!(task && waits)) {
      return tree;
    }
    const ended = await tasks.state(projectId, task);
    if (ended === "dropped") {
      return unmarked(tree, id, mark);
    }
    if (ended !== "done") {
      return tree;
    }
    const change: Change =
      mark === "check"
        ? { kind: "enforce", id }
        : { kind: "product", id, task };
    return applyOp(tree, checked(change), today, usesOf(projectId)).tree;
  };

  /** The ledger without retired, stale and expired entries past their days. */
  const withoutOldRetired = (tree: MemoryTree, today: string): MemoryTree => ({
    ...tree,
    ledger: {
      ...tree.ledger,
      lessons: Object.fromEntries(
        Object.entries(tree.ledger.lessons).filter(
          ([, lesson]) =>
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
        Math.max(0, adds(run) - run.adds),
        Math.max(0, CAPS.nightChanges - run.changes)
      ),
    ].join("\n\n");
  };

  /** The night's limit on added lessons: the recovery's is its own. */
  const adds = (run: Run): number =>
    run.kind === "recovery" ? RECOVERY_ADDS : CAPS.nightAdds;

  /** The brief's text: the messages, the notes, the staged lessons, the index, the files and the skills. */
  const briefText = (project: ProjectRow, tree: MemoryTree, run: Run) => {
    const messages = [...run.messages].filter(([, given]) => given.said);
    const legacy = [...run.messages].filter(([, given]) => given.legacy);
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
      ...(run.kind === "recovery" ? [memoryRunWords.briefRecovery] : []),
      messages.length > 0
        ? [memoryRunWords.briefMessages(messages.length), ...listed].join(
            "\n\n"
          )
        : memoryRunWords.briefNoMessages,
      ...(legacy.length > 0
        ? [
            [
              memoryRunWords.briefLegacy(legacy.length),
              ...legacy.map(([handle, given]) =>
                memoryRunWords.briefLegacyLine(
                  handle,
                  given.legacy?.path ?? "",
                  given.text
                )
              ),
            ].join("\n\n"),
          ]
        : []),
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
  const brief = async (projectId: string) => {
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
    const run = newRun("nightly", jev !== undefined, sorted, {
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
      const read = await treeOf(project.id);
      if (read instanceof ElysiaStatus) {
        return read;
      }
      const done = await correctedOne(project.id, run, read.tree, one);
      if (done instanceof ElysiaStatus) {
        return done;
      }
      did.set(one.id, done);
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
    tree: MemoryTree,
    one: Correction
  ) => {
    const lesson = tree.ledger.lessons[one.id];
    const said = run.messages.get(one.handle)?.said;
    if (!(lesson && said)) {
      return memoryRunWords.didNothing;
    }
    const source = saidSource(said);
    const today = dayOf(new Date());
    if (one.does === "repeats" && takenOut(lesson)) {
      return await putBack(projectId, run, tree, one.id, lesson, source);
    }
    if (one.does === "repeats" && lesson.state === "live") {
      return await repeatOf(projectId, run, tree, one.id, lesson, source);
    }
    if (
      one.does === "reverses" &&
      lesson.state === "live" &&
      !lesson.held &&
      madeByRun(lesson, today)
    ) {
      return await takeBack(projectId, run, tree, one.id);
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
    tree: MemoryTree,
    id: string,
    lesson: Lesson,
    source: LessonSource
  ) => {
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
      tree,
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
    tree: MemoryTree,
    id: string
  ) => {
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
      tree,
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
    tree: MemoryTree,
    changes: Change[],
    sha: string
  ) => {
    const today = dayOf(new Date());
    const uses = usesOf(projectId);
    const after = changes.reduce(
      (now, change) => applyOp(now, checked(change), today, uses).tree,
      tree
    );
    return await commit(projectId, tree, after, {
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
    run: Run,
    tree: MemoryTree,
    id: string,
    lesson: Lesson,
    source: LessonSource
  ) => {
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
    const sha = await commit(projectId, tree, after, {
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
      ? await checkedUp(projectId, run, { id, text }, lesson)
      : memoryRunWords.didCounted(times);
  };

  /**
   * A held lesson of the index or a skill's lessons moved up its last home
   * (§6.2): a check, filed by the hub, its method the rule itself. One in
   * knowledge that could not move, or one with a check already, stays.
   */
  const checkedUp = async (
    projectId: string,
    run: Run,
    line: { id: string; text: string },
    lesson: Lesson
  ) => {
    if (lesson.home.at === "knowledge" || lesson.check) {
      return memoryRunWords.didHeldStays;
    }
    const filed = await fileCheck(
      projectId,
      { ...line, method: line.text },
      HUB
    );
    if (filed instanceof ElysiaStatus) {
      return filed;
    }
    run.counts.checks += filed.task ? 1 : 0;
    return filed.task
      ? memoryRunWords.didChecked(filed.task)
      : memoryRunWords.didHeldStays;
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
    retestIfNew(project, state);
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
      const read = await treeOf(project.id);
      if (read instanceof ElysiaStatus) {
        return read;
      }
      const done = await commit(project.id, read.tree, read.tree, {
        author: { name: "Jev" },
        message: `memory: Jev sorts out ${out.length} note${out.length === 1 ? "" : "s"}`,
        notes: out,
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

  /** A source handle or note id resolved against the run: a message, a legacy line, a note, or why not. */
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
  const sourcesFor = (
    messages: Given[],
    notes: Note[],
    head: string
  ): LessonSource[] => [
    ...messages.map((given): LessonSource =>
      given.said ? saidSource(given.said) : { kind: "approved", commit: head }
    ),
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
        /** A lesson about CawCo to give its task once the commit stands ({@link productGiven}), and the task the lesson it replaces waited on. */
        product?: { earlier?: string; id: string; text: string };
      }
    | string;

  /** An `add`, checked (§5.2): its sources, its words, its home; staged when an agent's notes do not yet count as two sessions. */
  const plannedAdd = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    head: string,
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
    const checkedHome = await checkedLesson(projectId, run, tree, op.home, {
      text,
      why,
      by,
    });
    if (typeof checkedHome === "string") {
      return checkedHome;
    }
    const { home, product } = checkedHome;
    if (run.adds >= adds(run)) {
      return memoryRunWords.nightAdds(adds(run));
    }
    const read = await anchorAndProbe(projectId, run, op);
    if (typeof read === "string") {
      return read;
    }
    const { file, probed } = read;
    const staged = stagingOf(run, by, file, () =>
      twoSessions(index, kept.notes, answers)
    );
    if (staged && stagedCount(tree) >= CAPS.staged) {
      return memoryRunWords.stagedFull(CAPS.staged);
    }
    return addPlanned(tree, head, op.sources, kept, {
      by,
      file,
      probe: probed,
      home,
      text,
      why,
      staged,
      product,
    });
  };

  /** An `add`'s anchor read ({@link anchored}) and its probe checked ({@link probeOf}), each when it has one; why not otherwise. */
  const anchorAndProbe = async (
    projectId: string,
    run: Run,
    op: Extract<MemoryOp, { op: "add" }>
  ) => {
    const file = op.anchor ? await anchored(projectId, op.anchor) : undefined;
    if (typeof file === "string") {
      return file;
    }
    const probed = op.probe ? await probeOf(run, op.probe) : undefined;
    return typeof probed === "string" ? probed : { file, probed };
  };

  /**
   * What Jev reads a new lesson as, in one request: one that says what a
   * kept one says ({@link likeliest}) is refused, naming the one to
   * corroborate, of every live lesson in its home and the index, and every
   * staged one bound there, this run's earlier adds among them (each is in
   * `tree`); else, in a project that develops CawCo, whether it is about
   * CawCo (row `product`, {@link productTask}). Not about CawCo with Jev
   * off: the lesson is staged then, and Jev reads it the first night it is
   * on ({@link recheckStaged}). Jev failing, its words.
   */
  const jevOnNew = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    text: string,
    home: LessonHome
  ): Promise<{ product: boolean } | string> => {
    if (!run.jev) {
      return { product: false };
    }
    const beside = besideOf(tree, home, { staged: true });
    try {
      const answers = await answersOf(
        projectId,
        Object.fromEntries([
          ...(buildsCawco(projectId) ? [productQuestion("add", text)] : []),
          ...keptQuestions("add", text, beside),
        ])
      );
      const id = likeliest("kept", "add", beside, answers);
      return id
        ? memoryRunWords.keptAlready(id)
        : { product: aboutCawco("add", answers) };
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
    head: string,
    consumed: string[],
    kept: { messages: Given[]; notes: Note[] },
    lesson: {
      by: Lesson["by"];
      /** The file it names, read or to be read. */
      file: LessonSource | undefined;
      /** How it is re-tested on a new model. */
      probe: Lesson["probe"];
      home: LessonHome;
      /** Whether it is about CawCo, to give its task once it is written. */
      product: boolean;
      staged: { waits: boolean } | undefined;
      text: string;
      why: string | undefined;
    }
  ): Planned => {
    const id = newLessonId((taken) => taken in tree.ledger.lessons);
    const {
      by,
      file,
      home,
      probe: probed,
      product,
      staged,
      text,
      why,
    } = lesson;
    return {
      change: {
        kind: "add",
        id,
        by,
        home,
        sources: [
          ...sourcesFor(kept.messages, kept.notes, head),
          ...(file ? [file] : []),
        ],
        text,
        why: why || null,
        ...(probed ? { probe: probed } : {}),
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
      ...(product ? { product: { id, text } } : {}),
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

  /** A new lesson's home as asked, and its words, checked: an agent's goes to knowledge, and no kept lesson says it already ({@link jevOnNew}); the home and whether it is about CawCo, or why not. */
  const checkedLesson = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    asked: Extract<MemoryOp, { op: "add" }>["home"],
    lesson: { by: Lesson["by"]; text: string; why: string | undefined }
  ): Promise<{ home: LessonHome; product: boolean } | string> => {
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
    const read = await jevOnNew(projectId, run, tree, lesson.text, home);
    return typeof read === "string" ? read : { home, product: read.product };
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

  /** A replaced lesson's new one (`id`, its words `text`) to give its task when Jev reads its words as about CawCo (row `product`), in a project that develops CawCo, with the task the lesson it replaces waited on (`earlier`); none with Jev off. Jev failing, its words. */
  const replacedProduct = async (
    projectId: string,
    run: Run,
    {
      earlier,
      ...one
    }: { earlier: string | undefined; id: string; text: string }
  ): Promise<
    { product?: { earlier?: string; id: string; text: string } } | string
  > => {
    if (!(run.jev && buildsCawco(projectId))) {
      return {};
    }
    try {
      const answers = await answersOf(
        projectId,
        Object.fromEntries([productQuestion("replace", one.text)])
      );
      return aboutCawco("replace", answers)
        ? { product: { ...one, ...(earlier ? { earlier } : {}) } }
        : {};
    } catch (error) {
      return memoryRunWords.jevFailed(
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  /** A `replace`, checked: a live lesson's words changed, the person's own only by his message; new words about CawCo get their task once written. */
  const plannedReplace = async (
    projectId: string,
    run: Run,
    tree: MemoryTree,
    head: string,
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
    const product = await replacedProduct(projectId, run, {
      id: newId,
      text,
      earlier: lesson.product?.task,
    });
    if (typeof product === "string") {
      return product;
    }
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      change: {
        kind: "replace",
        id: op.id,
        newId,
        by,
        sources: sourcesFor(kept.messages, kept.notes, head),
        text,
        why,
      },
      consumed: op.sources,
      notes: kept.notes.map((note) => ({ note, outcome: `landed ${newId}` })),
      said: memoryRunWords.replaced(op.id, newId, pathOf(lesson.home) ?? ""),
      ...product,
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
    head: string,
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
      ...corroboration(op.id, lands, kept, head, op.sources),
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
    head: string,
    consumed: string[]
  ) => ({
    change: {
      kind: "corroborate" as const,
      id,
      lands,
      sources: sourcesFor(kept.messages, kept.notes, head),
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
    head: string,
    op: MemoryOp,
    index: number,
    answers: Map<string, number> | undefined
  ): Promise<Planned> | Planned => {
    switch (op.op) {
      case "add":
        return plannedAdd(projectId, run, tree, head, op, index, answers);
      case "replace":
        return plannedReplace(projectId, run, tree, head, op, index, answers);
      case "corroborate":
        return plannedCorroborate(run, tree, head, op, index, answers);
      case "move":
        return plannedMove(projectId, run, tree, op);
      case "check":
        return plannedCheck(projectId, run, tree, head, op, index, answers);
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
      const plan = await planned(
        projectId,
        run,
        read.tree,
        read.head,
        op,
        index,
        answers
      );
      const done =
        typeof plan === "string"
          ? plan
          : await committed(projectId, run, read, plan, op);
      if (typeof done === "string" || done instanceof ElysiaStatus) {
        const why = typeof done === "string" ? done : done.response.detail;
        lines.push(`${index + 1}. ${memoryRunWords.refused(why)}`);
        continue;
      }
      lines.push(`${index + 1}. ${memoryRunWords.applied(done.said)}`);
      read = { tree: done.tree, head: done.sha ?? read.head };
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
    const sha = await commit(projectId, read.tree, applied.tree, {
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
    return await followedUp(projectId, run, plan, {
      tree: applied.tree,
      said,
      sha,
    });
  };

  /** A committed operation's tasks, each in a commit of its own: its check filed ({@link fileCheck}), and a lesson about CawCo given its task ({@link productGiven}); `first` as the last commit left it. */
  const followedUp = async (
    projectId: string,
    run: Run,
    plan: Exclude<Planned, string>,
    first: { said: string; sha: string | undefined; tree: MemoryTree }
  ) => {
    let done = first;
    if (plan.check) {
      const filed = await fileCheck(projectId, plan.check, CURATOR);
      if (filed instanceof ElysiaStatus) {
        return filed;
      }
      run.counts.checks += filed.task ? 1 : 0;
      done = {
        tree: filed.tree ?? done.tree,
        said: `${done.said}; ${filed.said}`,
        sha: filed.sha ?? done.sha,
      };
    }
    if (plan.product) {
      const given = await productGiven(projectId, plan.product);
      if (given instanceof ElysiaStatus) {
        return given;
      }
      run.counts.product += given.task ? 1 : 0;
      done = {
        tree: given.tree ?? done.tree,
        said: `${done.said}; ${given.said}`,
        sha: given.sha ?? done.sha,
      };
    }
    return done;
  };

  /** An operation's sources named, the run's notes among them gone from what it has left to name. */
  const consume = (run: Run, handles: readonly string[]): void => {
    for (const handle of handles) {
      run.consumed.add(handle);
      run.notes.delete(handle);
    }
  };

  /** Whether the project develops CawCo (core `developsCawco`: a checkout among its places whose root commit is CawCo's, the rule law-tasks.ts files CawCo's defects by): only there can a lesson about CawCo become a task. */
  const buildsCawco = (projectId: string): boolean =>
    developsCawco(db.project(projectId)?.places ?? []);

  /**
   * The task that builds lesson `one`, about CawCo, into CawCo: `earlier`,
   * a task it rested on before, open again when it was dropped and kept as
   * it stands when open or done; else an open task grep pairs with it (at
   * most {@link RELATED}) that Jev reads as building it already (row
   * `covers`); else one filed for it through the path a check's task takes.
   * Its id and what came of it; why not when no task was filed or Jev
   * failed.
   */
  const productTask = async (
    projectId: string,
    one: { id: string; text: string },
    earlier?: string
  ): Promise<{ said: string; task: string } | string> => {
    if (earlier) {
      const open = await tasks.reopen(
        projectId,
        earlier,
        memoryRunWords.productTaskReopened(one.id)
      );
      if (typeof open !== "string") {
        return memoryRunWords.productNotFiled(one.id, open.refused);
      }
      if (open !== "gone") {
        return {
          task: earlier,
          said: {
            reopened: memoryRunWords.productReopened,
            open: memoryRunWords.productCovered,
            done: memoryRunWords.productBuilt,
          }[open](one.id, earlier),
        };
      }
    }
    const open = await tasks.open(projectId);
    if ("refused" in open) {
      return memoryRunWords.productNotFiled(one.id, open.refused);
    }
    const words = wordsOf(one.text);
    const paired = open
      .map((task) => ({ task, score: grepScore(words, task.title) }))
      .filter(({ score }) => score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, RELATED)
      .map(({ task }) => task);
    let answers: Map<string, number> | undefined;
    try {
      answers = await answersOf(
        projectId,
        Object.fromEntries(coversQuestions("lesson", one.text, paired))
      );
    } catch (error) {
      return memoryRunWords.productNotFiled(
        one.id,
        error instanceof Error ? error.message : String(error)
      );
    }
    const covering = likeliest("covers", "lesson", paired, answers);
    if (covering) {
      return {
        task: covering,
        said: memoryRunWords.productCovered(one.id, covering),
      };
    }
    const filed = await tasks.file(projectId, {
      title: memoryRunWords.productTitle(titleWords(one.text)),
      description: memoryRunWords.productDescription(one.text, one.id),
      acceptance: memoryRunWords.productAcceptance,
      fields: { [LESSON_FIELD]: one.id },
    });
    if ("refused" in filed) {
      return memoryRunWords.productNotFiled(one.id, filed.refused);
    }
    return {
      task: filed.id,
      said: memoryRunWords.productFiled(one.id, filed.id),
    };
  };

  /** `tree` with lesson `one`, about CawCo, waiting on its task ({@link productTask}) as `product`; as it was when no task was given, and what came of it either way. */
  const productMarked = async (
    projectId: string,
    tree: MemoryTree,
    one: { id: string; text: string },
    earlier?: string
  ): Promise<{ said: string; task?: string; tree: MemoryTree }> => {
    const given = await productTask(projectId, one, earlier);
    const lesson = tree.ledger.lessons[one.id];
    if (typeof given === "string" || !lesson) {
      return { said: typeof given === "string" ? given : "", tree };
    }
    return {
      said: given.said,
      task: given.task,
      tree: withLesson(tree, one.id, {
        ...lesson,
        product: { task: given.task },
      }),
    };
  };

  /**
   * A lesson written as about CawCo given its task ({@link productMarked})
   * once its commit stands, in a second commit by the Memory curator, as
   * {@link fileCheck} does a check's. A lesson given no task stays without
   * one, and the answer says why.
   */
  const productGiven = async (
    projectId: string,
    { earlier, ...one }: { earlier?: string; id: string; text: string }
  ) => {
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const marked = await productMarked(projectId, read.tree, one, earlier);
    if (!marked.task) {
      return { said: marked.said };
    }
    const sha = await commit(projectId, read.tree, marked.tree, {
      author: CURATOR,
      message: `memory: ${marked.said}`,
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    return { said: marked.said, task: marked.task, tree: marked.tree, sha };
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
    head: string,
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
        head,
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
      head,
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
    head: string,
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
    if (lesson.check) {
      return memoryRunWords.checkHas(op.id, lesson.check.task);
    }
    const kept = checkedSources(run, op.sources, at.index, at.answers);
    if (typeof kept === "string") {
      return kept;
    }
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    return {
      ...corroboration(op.id, false, kept, head, op.sources),
      said: memoryRunWords.checkAsked(op.id),
      check: { id: op.id, text: line.text, method: op.method },
    };
  };

  /** A probe's words checked (each one line within a fact's cap, quoting no one, holding no secret); why not otherwise. */
  const probeOf = async (
    run: Run,
    asked: { pass: string; prompt: string }
  ): Promise<{ pass: string; prompt: string } | string> => {
    const probed = { prompt: asked.prompt.trim(), pass: asked.pass.trim() };
    for (const words of [probed.prompt, probed.pass]) {
      if (
        words === "" ||
        words.includes("\n") ||
        words.length > CAPS.fact ||
        wordsProblem(words, run.said) ||
        (await redactSecrets(words)) !== words
      ) {
        return memoryRunWords.probeUnfit(CAPS.fact);
      }
    }
    return probed;
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
   * method and lesson id in the description, one acceptance line); then a
   * second commit writing the task into the lesson's ledger entry. A task
   * that was not filed leaves the rule as a line, and says why.
   */
  const fileCheck = async (
    projectId: string,
    ask: CheckAsk,
    author: FolderAuthor
  ) => {
    const task = await tasks.file(projectId, {
      title: memoryRunWords.checkTitle(ask.text),
      description: memoryRunWords.checkDescription(
        ask.id,
        ask.text,
        ask.method
      ),
      acceptance: memoryRunWords.checkAcceptance,
      fields: { [LESSON_FIELD]: ask.id },
    });
    if ("refused" in task) {
      return { said: memoryRunWords.checkNotFiled(task.refused) };
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const lesson = read.tree.ledger.lessons[ask.id];
    if (!lesson) {
      return { said: memoryRunWords.checkNotFiled(ask.id), task: task.id };
    }
    const tree = withLesson(read.tree, ask.id, {
      ...lesson,
      check: { task: task.id },
    });
    const said = memoryRunWords.checkFiled(ask.id, task.id);
    const sha = await commit(projectId, read.tree, tree, {
      author,
      message: `memory: ${said}`,
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    return { said, task: task.id, tree, sha };
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
   * operation carried once, the run's counts kept; its one line, or nothing
   * when it changed nothing. A recovery run's inputs left are kept for its
   * next run, which starts at once when this one judged something, at most
   * {@link RECOVERY_CHAIN} in a row.
   */
  const closed = (projectId: string, run: Run, outcome: RunOutcome) =>
    stateTurn(projectId, () => closedInTurn(projectId, run, outcome));

  /** {@link closed}, inside the project's turn on its run state. */
  const closedInTurn = async (
    projectId: string,
    run: Run,
    outcome: RunOutcome
  ) => {
    const state = await stateOf(projectId);
    if (state instanceof ElysiaStatus) {
      return state;
    }
    const recovery =
      run.kind === "recovery" && outcome !== "failed"
        ? await recoveryLeft(projectId, run)
        : undefined;
    if (recovery instanceof ElysiaStatus) {
      return recovery;
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const done = await commit(
      projectId,
      read.tree,
      read.tree,
      markOfRun(state, run, outcome, recovery)
    );
    if (done instanceof ElysiaStatus) {
      return done;
    }
    if (run.kind === "recovery") {
      chainOn(projectId, recovery);
    }
  };

  /**
   * A recovery run's end: the next one started when it judged something
   * and left something, at most {@link RECOVERY_CHAIN} in a row; why not
   * said in the log when inputs are left.
   */
  const chainOn = (
    projectId: string,
    left: { file?: unknown; next: boolean } | undefined
  ): void => {
    const chain = (chained.get(projectId) ?? 0) + 1;
    chained.set(projectId, chain);
    if (left?.next && chain < RECOVERY_CHAIN) {
      recoverNext(projectId);
    } else if (left?.file) {
      console.log(
        `[memory] ${projectId}: the recovery stops after ${chain} run${chain === 1 ? "" : "s"} in a row with inputs left: ${left.next ? "its chain is at its most" : "its last run judged none of them"}; asking for it again reads on`
      );
    }
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
    const {
      added,
      dropped,
      product,
      replaced,
      restored,
      retired,
      reverted,
      staged,
    } = run.counts;
    if (
      added +
        replaced +
        retired +
        staged +
        dropped +
        restored +
        reverted +
        product ===
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

  // --- re-test on a model change (§6.3) ------------------------------------------------

  /** Each project's read-modify-write of `memory/state.json`, one at a time: a run's close, a re-test's end. */
  const stateTurn = turnTaker();
  /** Projects with a re-test under way. */
  const retesting = new Set<string>();

  /** The models the project's sessions ran on in the last {@link MODEL_DAYS} days, each with its harness, the newest use first. */
  const modelsNow = (projectId: string): [string, HarnessKind][] => {
    const since = Date.now() - MODEL_DAYS * DAY_MS;
    const used = new Map<string, { at: number; harness: HarnessKind }>();
    for (const row of db.listInstances()) {
      const at = new Date(row.updatedAt ?? 0).getTime();
      const had = row.model ? used.get(row.model) : undefined;
      if (
        row.projectId === projectId &&
        row.model &&
        at >= since &&
        (!had || had.at < at)
      ) {
        used.set(row.model, { at, harness: row.harness });
      }
    }
    return [...used]
      .sort(([, a], [, b]) => b.at - a.at)
      .map(([model, { harness }]) => [model, harness]);
  };

  /**
   * A re-test started, off the night's path, for each model the project's
   * sessions ran on that `state.models` does not hold (§2 A.6); none while
   * one is under way. A model is held once its re-test ends, so one cut
   * short (a restart, Jev off) runs again the next night.
   */
  const retestIfNew = (project: ProjectRow, state: MemoryRunState): void => {
    const known = new Set(state.models ?? []);
    const fresh = modelsNow(project.id).filter(([model]) => !known.has(model));
    if (fresh.length === 0 || retesting.has(project.id)) {
      return;
    }
    retesting.add(project.id);
    const all = async () => {
      for (const [model, harness] of fresh) {
        const refused = await retest(project, model, harness);
        if (refused instanceof ElysiaStatus) {
          console.warn(
            `[memory] ${project.name}: the re-test on ${model} did not end: ${refused.response.detail}`
          );
          return;
        }
      }
    };
    all()
      .catch((error: unknown) =>
        console.warn(
          `[memory] ${project.name}: the re-test did not end: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      .finally(() => retesting.delete(project.id));
  };

  /** The index and skill lessons a re-test runs a probe of: live, not held, with a probe, not tested on `model`. */
  const probedOn = (tree: MemoryTree, model: string) =>
    Object.entries(tree.ledger.lessons).flatMap(([id, lesson]) =>
      lesson.state === "live" &&
      !lesson.held &&
      lesson.probe &&
      lesson.tested !== model &&
      (lesson.home.at === "index" || lesson.home.at === "skill")
        ? [{ id, probe: lesson.probe }]
        : []
    );

  /**
   * A re-test on `model` (§6.3): each index and skill lesson with a probe,
   * not held, run {@link PROBE_RUNS} times on the model in a clean session,
   * the lesson left out, Jev judging each answer against the probe's
   * `pass`. One the model passed every time goes to knowledge, its `Why:`
   * naming the model and the day; any other stays, tested on the model.
   * Then the hub's own check again: a lesson another memory file says word
   * for word is taken out. One commit, the model held in the run's state.
   * Jev off with lessons to judge: nothing is decided, and the model is
   * tried again the next night.
   */
  const retest = async (
    project: ProjectRow,
    model: string,
    harness: HarnessKind
  ) => {
    const first = await treeOf(project.id);
    if (first instanceof ElysiaStatus) {
      return first;
    }
    const probed = probedOn(first.tree, model);
    const key = jevAccess(db);
    if (probed.length > 0 && !key) {
      offLine(
        "probe",
        project.id,
        `the re-test on ${model} waits for Jev, which judges each probe's answer`
      );
      return;
    }
    const usd = RETEST_USD / Math.max(1, probed.length * PROBE_RUNS);
    const passes = new Map<string, number>();
    for (const one of probed) {
      const answers = await probeRuns(project.id, {
        harness,
        model,
        prompt: one.probe.prompt,
        usd,
      });
      passes.set(
        one.id,
        key ? await probePasses(project.id, key, one.probe.pass, answers) : 0
      );
    }
    return await stateTurn(project.id, () =>
      retestCommitted(project, model, passes)
    );
  };

  /** {@link PROBE_RUNS} answers of `ask.model` to one prompt, each in a clean session of its own, on a share of the re-test's dollars. */
  const probeRuns = (
    projectId: string,
    ask: { harness: HarnessKind; model: string; prompt: string; usd: number }
  ): Promise<ProbeAnswer[]> =>
    Promise.all(
      Array.from({ length: PROBE_RUNS }, () =>
        probe(projectId, {
          harness: ask.harness,
          model: ask.model,
          prompt: ask.prompt,
          budget: { turns: PROBE_TURNS, minutes: PROBE_MINUTES, usd: ask.usd },
        })
      )
    );

  /** How many of a probe's answers pass it, by Jev at {@link PROBE_PASS}: one with no answer does not. */
  const probePasses = async (
    projectId: string,
    key: JevAccess,
    pass: string,
    answers: ProbeAnswer[]
  ): Promise<number> => {
    const questions = Object.fromEntries(
      answers.flatMap(
        (answer, at): [string, Experimental_DecisionQuestion][] =>
          answer.kind === "answered"
            ? [
                [
                  `probe:${at}`,
                  {
                    type: "boolean",
                    instructions: {
                      reply: cut(answer.text),
                      pass,
                      question: memoryJevWords.probeQuestion,
                    },
                    criteria: memoryJevWords.probeCriteria,
                  },
                ],
              ]
            : []
      )
    );
    if (Object.keys(questions).length === 0) {
      return 0;
    }
    const result = await askRow("probe", projectId, key, {}, questions);
    return Object.values(result.answers).filter(
      (answer) => "probability" in answer && answer.probability >= PROBE_PASS
    ).length;
  };

  /**
   * A re-test's decisions committed over the tree as it stands now (a run
   * may have changed it while the probes ran): each lesson still live and
   * not held moved to knowledge when it passed every probe, else marked
   * tested; word-for-word duplicates taken out; `model` held in the run's
   * state. One commit.
   */
  const retestCommitted = async (
    project: ProjectRow,
    model: string,
    passes: ReadonlyMap<string, number>
  ) => {
    const read = await treeOf(project.id);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const state = await stateOf(project.id);
    if (state instanceof ElysiaStatus) {
      return state;
    }
    const today = dayOf(new Date());
    const uses = usesOf(project.id);
    const still = new Set(probedOn(read.tree, model).map((one) => one.id));
    let tree = withoutDuplicates(read.tree, today, uses);
    let moved = 0;
    for (const [id, passed] of passes) {
      if (!still.has(id)) {
        continue;
      }
      const change: Change =
        passed >= PROBE_RUNS
          ? {
              kind: "demote",
              id,
              model,
              why: memoryRunWords.retestWhy(model, today),
            }
          : { kind: "tested", id, model };
      moved += change.kind === "demote" ? 1 : 0;
      ({ tree } = applyOp(tree, checked(change), today, uses));
    }
    const unprobed = Object.values(tree.ledger.lessons).filter(
      (lesson) =>
        lesson.state === "live" &&
        !lesson.probe &&
        (lesson.home.at === "index" || lesson.home.at === "skill")
    ).length;
    const next: MemoryRunState = {
      ...state,
      models: [...new Set([...(state.models ?? []), model])],
    };
    const said = memoryRunWords.retested(
      model,
      moved,
      passes.size - moved,
      unprobed
    );
    console.log(`[memory] ${project.name}: ${said}`);
    return await commit(project.id, read.tree, tree, {
      author: HUB,
      message: `memory: ${said}`,
      extra: [{ path: RUN_STATE_FILE, content: jsonText(next) }],
    });
  };

  /** `tree` with each live lesson a line of another memory file says word for word (§6.3 step 1) merged into that line's lesson, or retired as no longer needed when the line is the person's own (the index's Notes). */
  const withoutDuplicates = (
    tree: MemoryTree,
    today: string,
    uses: ReadonlyMap<string, Date>
  ): MemoryTree => {
    let now = tree;
    for (const [id, lesson] of Object.entries(tree.ledger.lessons)) {
      const own = pathOf(lesson.home);
      const line = lessonText(now, id);
      if (!(lesson.state === "live" && !lesson.held && line !== undefined)) {
        continue;
      }
      const change = duplicateChange(now, id, line, own);
      if (change) {
        now = applyOp(now, checked(change), today, uses).tree;
      }
    }
    return now;
  };

  /**
   * Whether a lesson's probe tells anything (§13 proof run 7): for each
   * lesson asked (an id and a probe), or else the index's lessons that have
   * a probe, at most {@link PROBE_CHECK_LESSONS}, its probe run
   * {@link PROBE_RUNS} times without the lesson and as many with it, on the
   * model the project's sessions ran on last; Jev judges each answer. Runs
   * off the caller's path; what it found is written to
   * `memory/probe-check.json` in one commit. Refused with Jev off, with no
   * model seen, or with no lesson to check.
   */
  const probeCheck = async (
    projectId: string,
    asked: readonly { id: string; pass: string; prompt: string }[] | undefined
  ) => {
    if (checking.has(projectId)) {
      return problem(409, {
        code: "memory-probe-check-going",
        detail: memoryRunWords.probeCheckGoing(PROBE_CHECK_FILE),
      });
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const key = jevAccess(db);
    const [latest] = modelsNow(projectId);
    const lessons = (
      asked ??
      Object.entries(read.tree.ledger.lessons).flatMap(([id, lesson]) =>
        lesson.state === "live" && lesson.home.at === "index" && lesson.probe
          ? [{ id, ...lesson.probe }]
          : []
      )
    )
      .flatMap((one) => {
        const text = lessonText(read.tree, one.id);
        return text ? [{ ...one, text }] : [];
      })
      .slice(0, PROBE_CHECK_LESSONS);
    if (!(key && latest && lessons.length > 0)) {
      return problem(409, {
        code: "memory-probe-check-unfit",
        detail: memoryRunWords.probeCheckUnfit(
          !key,
          latest === undefined,
          lessons.length === 0
        ),
      });
    }
    const [model, harness] = latest;
    checking.add(projectId);
    probeChecked(projectId, key, { model, harness }, lessons)
      .then(
        (refused) => {
          if (refused instanceof ElysiaStatus) {
            console.warn(
              `[memory] ${projectId}: the probe check's file was not written: ${refused.response.detail}`
            );
          }
        },
        (error: unknown) =>
          console.warn(
            `[memory] ${projectId}: the probe check did not end: ${error instanceof Error ? error.message : String(error)}`
          )
      )
      .finally(() => checking.delete(projectId));
    return {
      started: true as const,
      model,
      lessons: lessons.map((one) => one.id),
      file: PROBE_CHECK_FILE,
    };
  };

  /** Projects with a probe check under way. */
  const checking = new Set<string>();

  /** {@link probeCheck}'s runs and its file. */
  const probeChecked = async (
    projectId: string,
    key: JevAccess,
    on: { harness: HarnessKind; model: string },
    lessons: readonly {
      id: string;
      pass: string;
      prompt: string;
      text: string;
    }[]
  ) => {
    const usd = RETEST_USD / (lessons.length * PROBE_RUNS * 2);
    const found: { id: string; of: number; with: number; without: number }[] =
      [];
    for (const one of lessons) {
      const without = await probeRuns(projectId, {
        ...on,
        prompt: one.prompt,
        usd,
      });
      const withRule = await probeRuns(projectId, {
        ...on,
        prompt: memoryRunWords.probeWithRule(one.text, one.prompt),
        usd,
      });
      found.push({
        id: one.id,
        of: PROBE_RUNS,
        without: await probePasses(projectId, key, one.pass, without),
        with: await probePasses(projectId, key, one.pass, withRule),
      });
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    return await commit(projectId, read.tree, read.tree, {
      author: HUB,
      message: `memory: ${memoryRunWords.probeChecked(found.length)}`,
      extra: [
        {
          path: PROBE_CHECK_FILE,
          content: jsonText({
            model: on.model,
            at: new Date().toISOString(),
            lessons: found,
          }),
        },
      ],
    });
  };

  // --- recovery ------------------------------------------------------------------------

  /** The recovery's inputs as `memory/recovery.json` keeps them; none when the project has no recovery to run. */
  const recoveryOf = (projectId: string) =>
    readJson<Recovery | null>(
      projectId,
      RECOVERY_FILE,
      RecoverySchema.nullable(),
      null
    );

  /**
   * The one-time recovery run's brief (§11): the notes archived unread
   * before because their session had read the web, each with the person's
   * messages in its session in the {@link RECOVERY_HOURS} before it, the
   * inbox's notes, and the lines of AGENTS.md and `knowledge/` the cutover
   * did not convert (each a source of its own, `approved`). At most
   * {@link RECOVERY_NOTES} notes a run; a second run reads the rest.
   */
  const recoveryBrief = async (projectId: string) => {
    const project = projectOf(projectId);
    if (project instanceof ElysiaStatus) {
      return project;
    }
    const recovery = await recoveryOf(projectId);
    if (recovery instanceof ElysiaStatus) {
      return recovery;
    }
    if (!recovery) {
      return { kind: "none" as const, reason: memoryRunWords.nothingToRead };
    }
    const notes = await recoveryNotes(project, recovery);
    if (notes instanceof ElysiaStatus) {
      return notes;
    }
    const run = newRun("recovery", jevAccess(db) !== undefined, notes, {
      notes: notes.length,
    });
    const seen = new Set<string>();
    for (const note of notes) {
      for (const said of saidBefore(projectId, note, seen)) {
        seen.add(said.uuid);
        run.messages.set(`m${run.messages.size + 1}`, {
          said,
          text: cut(said.text),
          session: sessionHandle(run, said.instanceId),
        });
        run.said.push(said.text);
      }
    }
    recovery.legacy.forEach((line, at) => {
      run.messages.set(`l${at + 1}`, {
        legacy: line,
        text: line.text,
        session: line.path,
      });
      run.said.push(line.text);
    });
    run.counts.read = run.messages.size;
    return await ready(project, run);
  };

  /** The recovery's notes for its next run, after upkeep: those it holds that no run has judged, in its order, at most {@link RECOVERY_NOTES}. */
  const recoveryNotes = async (project: ProjectRow, recovery: Recovery) => {
    const kept = await upkeep(project);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    const waiting = await unjudged(project.id, recovery.notes);
    return waiting instanceof ElysiaStatus
      ? waiting
      : waiting.slice(0, RECOVERY_NOTES);
  };

  /**
   * The notes of `ids` no run has judged yet, in the order of `ids`: in the
   * inbox, archived unread before because their session had read the web
   * (`tainted`), archived unread with no operation naming them
   * (`dropped: unread`), or archived as a duplicate of no live lesson
   * (memory.ts `duplicateUnjudged`). A note a run judged since is no longer
   * the recovery's.
   */
  const unjudged = async (projectId: string, ids: readonly string[]) => {
    const named = await notesNamed(projectId, new Set(ids));
    if (named instanceof ElysiaStatus) {
      return named;
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const live = liveIn(read.tree);
    const byId = new Map(
      named
        .filter(
          (note) =>
            note.outcome === null ||
            note.outcome.startsWith("tainted") ||
            note.outcome === UNREAD ||
            duplicateUnjudged(note, live)
        )
        .map((note) => [note.id, note])
    );
    return ids.flatMap((id) => {
      const note = byId.get(id);
      return note ? [note] : [];
    });
  };

  /** What the person typed in a note's session in the {@link RECOVERY_HOURS} before it, long enough to be a rule, none `seen` already. */
  const saidBefore = (
    projectId: string,
    note: Note,
    seen: ReadonlySet<string>
  ): PersonSaid[] => {
    const at = new Date(note.time);
    return db
      .personSaidIn(
        projectId,
        new Date(at.getTime() - RECOVERY_HOURS * HOUR_MS),
        at,
        RUN_SAID
      )
      .filter(
        (said) =>
          said.instanceId === note.session &&
          !seen.has(said.uuid) &&
          wordCount(said.text) >= SAID_WORDS
      );
  };

  /**
   * The recovery's inputs once a recovery run ends: the notes and legacy
   * lines an operation named are gone from it; a note it was given and
   * named in no operation stays, first, for the next run, so none is
   * archived unread. `next` when something is left and this run judged
   * something (a run that judged nothing ends the chain: what is left waits
   * for the recovery to be asked again); `done`, with the file gone, when
   * nothing is left.
   */
  const recoveryLeft = async (projectId: string, run: Run) => {
    const recovery = await recoveryOf(projectId);
    if (recovery instanceof ElysiaStatus) {
      return recovery;
    }
    if (!recovery) {
      return { done: false, next: false, file: undefined };
    }
    const unnamed = [...run.notes.keys()];
    const waiting = await unjudged(projectId, [
      ...unnamed,
      ...recovery.notes.filter((id) => !run.notes.has(id)),
    ]);
    if (waiting instanceof ElysiaStatus) {
      return waiting;
    }
    const left: Recovery = {
      legacy: recovery.legacy.filter(
        (_, at) => !run.consumed.has(`l${at + 1}`)
      ),
      notes: waiting.map((note) => note.id),
      runs: recovery.runs + 1,
    };
    const judged =
      left.notes.length < recovery.notes.length ||
      left.legacy.length < recovery.legacy.length;
    const done = left.notes.length + left.legacy.length === 0;
    return {
      done,
      next: !done && judged,
      file: done ? undefined : { path: RECOVERY_FILE, content: jsonText(left) },
    };
  };

  /**
   * The recovery's inputs as it is asked for (§11): those it holds, and
   * after them the notes no run judged that it does not hold: each a
   * recovery run archived `dropped: unread` (written by one of its marks'
   * commits), and each archived as a duplicate of no live lesson (memory.ts
   * `duplicateUnjudged`). The legacy lines are those it holds, or with none
   * held, those the last `memory/recovery.json` held before it went.
   * Undefined when there is nothing to read.
   */
  const recoveryAgain = async (projectId: string, held: Recovery | null) => {
    const marks = await folderCommitsCarrying(projectId, RECOVERY_MARK);
    if (marks instanceof ElysiaStatus) {
      return marks;
    }
    const written = new Set(marks.flatMap((mark) => mark.paths));
    const archive = await notesIn(projectId, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const live = liveIn(read.tree);
    const notes = [
      ...new Set([
        ...(held?.notes ?? []),
        ...archive
          .filter(
            (note) =>
              (note.outcome === UNREAD && written.has(note.path)) ||
              duplicateUnjudged(note, live)
          )
          .map((note) => note.id),
      ]),
    ];
    const legacy = held ? held.legacy : await lastLegacy(projectId);
    if (legacy instanceof ElysiaStatus) {
      return legacy;
    }
    const again: Recovery = { legacy, notes, runs: held?.runs ?? 0 };
    return notes.length + legacy.length > 0 ? again : undefined;
  };

  /** The legacy lines `memory/recovery.json` held when it was last written, before it went; none when it never was. */
  const lastLegacy = async (projectId: string) => {
    const history = await folderHistory(projectId, RECOVERY_FILE, 2);
    if (history instanceof ElysiaStatus) {
      return history;
    }
    // Newest first: the commit that took it out, then the last that wrote it.
    const [, written] = history.commits;
    if (!written) {
      return [];
    }
    const text = await readFolderFileAt(projectId, written.sha, RECOVERY_FILE);
    if (text instanceof ElysiaStatus || text === undefined) {
      return [];
    }
    try {
      return RecoverySchema.parse(JSON.parse(text)).legacy;
    } catch {
      return [];
    }
  };

  /**
   * The recovery asked for (routines.ts `recover`): whether it has inputs
   * for a run. Asked by a person (`by: "ask"`), the lessons that say the
   * same are made one first ({@link mergedSame}), lessons about CawCo get
   * their task once ({@link productRepair}), its inputs are topped up
   * with every note no run judged ({@link recoveryAgain}) in one commit, and
   * its chain of runs counts again from here; by the run before
   * (`by: "chain"`), it reads on what it holds.
   */
  const recoveryStart = async (projectId: string, by: "ask" | "chain") => {
    const recovery = await recoveryOf(projectId);
    if (recovery instanceof ElysiaStatus) {
      return recovery;
    }
    if (by === "chain" && recovery) {
      return true;
    }
    if (by === "ask") {
      chained.delete(projectId);
      const merged = await mergedSame(projectId);
      if (merged instanceof ElysiaStatus) {
        return merged;
      }
      const repaired = await productRepair(projectId);
      if (repaired instanceof ElysiaStatus) {
        return repaired;
      }
    }
    return await toppedUp(projectId, recovery);
  };

  /** The recovery's inputs topped up ({@link recoveryAgain}) and written in one commit when it gained any; whether it has any. */
  const toppedUp = async (projectId: string, recovery: Recovery | null) => {
    const again = await recoveryAgain(projectId, recovery);
    if (again instanceof ElysiaStatus) {
      return again;
    }
    if (!again) {
      return false;
    }
    const added = again.notes.length - (recovery?.notes.length ?? 0);
    if (recovery && added === 0) {
      return true;
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const sha = await commit(projectId, read.tree, read.tree, {
      author: HUB,
      message: `memory: the recovery asked again, ${added} notes no run judged and ${again.legacy.length} lines to read`,
      extra: [{ path: RECOVERY_FILE, content: jsonText(again) }],
    });
    return sha instanceof ElysiaStatus ? sha : true;
  };

  /**
   * The live lessons that say the same made one (the invariant an `add`
   * keeps, {@link jevOnNew}, made true of what came before it): each pair
   * of live lessons in one home, or one of them in the index, sharing two
   * words or more, asked of Jev ({@link keptQuestions}); each pair at or
   * over {@link SAME}, the likeliest first, merged, the lesson kept the one
   * the person stated again or holds, then his, then the most repeated,
   * then the oldest. One commit by the hub; nothing with Jev off (said in
   * the log) or no pair.
   */
  const mergedSame = async (projectId: string) => {
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    if (!jevAccess(db)) {
      offLine(
        "kept",
        projectId,
        "lessons that say the same wait for Jev to be merged"
      );
      return;
    }
    const pairs = samePairs(read.tree);
    const answers = await answersOrRefusal(
      projectId,
      Object.fromEntries(
        pairs.flatMap(([a, b]) => keptQuestions(a.id, a.text, [b]))
      )
    );
    if (answers instanceof ElysiaStatus) {
      return answers;
    }
    const today = dayOf(new Date());
    const uses = usesOf(projectId);
    const done: { id: string; into: string }[] = [];
    const gone = new Set<string>();
    const same = pairs
      .map(([a, b]) => ({
        a,
        b,
        score: answers?.get(`kept:${a.id}:${b.id}`) ?? 0,
      }))
      .filter(({ score }) => score >= SAME)
      .sort((x, y) => y.score - x.score);
    let { tree } = read;
    for (const { a, b } of same) {
      if (gone.has(a.id) || gone.has(b.id)) {
        continue;
      }
      const [into, id] = keptFirst(tree, a.id, b.id);
      ({ tree } = applyOp(
        tree,
        checked({ kind: "merge", id, into }),
        today,
        uses
      ));
      gone.add(id);
      done.push({ id, into });
    }
    if (done.length === 0) {
      return;
    }
    const said = memoryRunWords.merged(done);
    console.log(`[memory] ${projectId}: ${said}`);
    return await commit(projectId, read.tree, tree, {
      author: HUB,
      message: `memory: ${said}`,
    });
  };

  /**
   * Once per project (the run state's `productTasked`), what came before
   * the lifecycle of lessons about CawCo ({@link productTask}) brought
   * under it: each lesson retired `product` before CawCo carried it is put
   * back as it stood ({@link productReturns}); in a project that develops
   * CawCo, Jev reads every live and staged lesson (row `product`), and each
   * it reads yes of waits on its task, the one it rested on before when
   * there is one ({@link productMarked}). One commit by the hub, the run
   * state marked in it; then each task filed for a lesson that no lesson
   * waits on now is dropped ({@link unrestedDropped}). Nothing in a project
   * that develops CawCo with Jev off (said in the log): the next ask tries
   * again. A lesson given no task stays without one, said in the log.
   */
  const productRepair = async (projectId: string) => {
    const state = await stateOf(projectId);
    if (state instanceof ElysiaStatus || state.productTasked) {
      return state instanceof ElysiaStatus ? state : undefined;
    }
    const ours = buildsCawco(projectId);
    if (ours && !jevAccess(db)) {
      offLine(
        "product",
        projectId,
        "lessons about CawCo wait for Jev to get their tasks"
      );
      return;
    }
    const read = await treeOf(projectId);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const before = await productRetirementsOf(projectId);
    if (before instanceof ElysiaStatus) {
      return before;
    }
    const today = dayOf(new Date());
    let tree = await productReturns(projectId, read.tree, before, today);
    const back = Object.keys(read.tree.ledger.lessons).filter(
      (id) =>
        read.tree.ledger.lessons[id]?.retired?.why === "product" &&
        tree.ledger.lessons[id]?.retired === undefined
    );
    const marked = ours
      ? await productMarkedAll(projectId, tree, before)
      : { given: [], tree };
    if (marked instanceof ElysiaStatus) {
      return marked;
    }
    ({ tree } = marked);
    const said = memoryRunWords.productRepaired(back, marked.given);
    console.log(`[memory] ${projectId}: ${said}`);
    const sha = await commit(projectId, read.tree, tree, {
      author: HUB,
      message: `memory: ${said}`,
      extra: [
        {
          path: RUN_STATE_FILE,
          content: jsonText({ ...state, productTasked: today }),
        },
      ],
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    await unrestedDropped(projectId, tree, before);
    return sha;
  };

  /** `tree` with each live and staged lesson Jev reads as about CawCo (row `product`) waiting on its task, the one the history shows it rested on before (`before`) when there is one ({@link productMarked}); those given one. */
  const productMarkedAll = async (
    projectId: string,
    tree: MemoryTree,
    before: Awaited<ReturnType<typeof productRetirements>>
  ) => {
    const kept = keptOrStaged(tree).filter(
      ({ id }) => !tree.ledger.lessons[id]?.product
    );
    const answers = await answersOrRefusal(
      projectId,
      Object.fromEntries(kept.map((one) => productQuestion(one.id, one.text)))
    );
    if (answers instanceof ElysiaStatus) {
      return answers;
    }
    const given: { id: string; task: string }[] = [];
    let now = tree;
    for (const one of kept.filter(({ id }) => aboutCawco(id, answers))) {
      const marked = await productMarked(
        projectId,
        now,
        one,
        before.get(one.id)?.task
      );
      console.log(`[memory] ${projectId}: ${marked.said}`);
      now = marked.tree;
      if (marked.task) {
        given.push({ id: one.id, task: marked.task });
      }
    }
    return { given, tree: now };
  };

  /** Every lesson the memory folder's history retired `product` ({@link productRetirements}), from the commits git's pickaxe finds changing the ledger's count of `product` retirements. */
  const productRetirementsOf = async (projectId: string) => {
    const commits = await folderCommitsChanging(projectId, '"why": "product"', [
      LEDGER_FILE,
    ]);
    if (commits instanceof ElysiaStatus) {
      return commits;
    }
    const ledgers = new Map<string, MemoryLedger | undefined>();
    const ledgerAt = async (sha: string) => {
      if (!ledgers.has(sha)) {
        const text = await readFolderFileAt(projectId, sha, LEDGER_FILE);
        const ledger =
          text instanceof ElysiaStatus || text === undefined
            ? undefined
            : parseLedger(text);
        ledgers.set(sha, typeof ledger === "string" ? undefined : ledger);
      }
      return ledgers.get(sha);
    };
    return await productRetirements(commits, ledgerAt);
  };

  /**
   * `tree` with each lesson retired `product` put back as it stood before
   * the commit that retired it (`before`): its ledger entry from that
   * commit's parent, and, when it was live, its line from its home there.
   * One no commit shows is left as it is, said in the log.
   */
  const productReturns = async (
    projectId: string,
    tree: MemoryTree,
    before: Awaited<ReturnType<typeof productRetirements>>,
    today: string
  ): Promise<MemoryTree> => {
    const uses = usesOf(projectId);
    let now = tree;
    for (const [id, lesson] of Object.entries(tree.ledger.lessons)) {
      if (lesson.retired?.why !== "product") {
        continue;
      }
      const found = before.get(id);
      if (!found) {
        console.warn(
          `[memory] ${projectId}: ${id} stays retired: no commit of the ledger shows it before it was taken out`
        );
        continue;
      }
      const change = await returnOf(projectId, id, lesson.retired.text, found);
      now = applyOp(now, checked(change), today, uses).tree;
    }
    return now;
  };

  /** Lesson `id` put back as `found` holds it, its line read from its home at that parent when it was live (`text`, the words the ledger kept, when git has none). */
  const returnOf = async (
    projectId: string,
    id: string,
    text: string,
    { entry, parent }: { entry: Lesson; parent: string }
  ): Promise<Extract<Change, { kind: "return" }>> => {
    const path = entry.state === "live" ? pathOf(entry.home) : undefined;
    if (!path) {
      return { kind: "return", id, entry };
    }
    const content = await readFolderFileAt(projectId, parent, path);
    const line =
      typeof content === "string"
        ? parseLessons(path, content).lessons.find((one) => one.id === id)
        : undefined;
    return {
      kind: "return",
      id,
      entry,
      line: line ?? { id, text, why: null },
    };
  };

  /**
   * Each task the history shows a lesson retired `product` to (`before`)
   * moved to dropped, its reason naming the lesson, when no lesson of
   * `tree` waits on it and it was filed for that lesson (its field `lesson`
   * holds the id): a task that was open before a lesson was routed to it
   * stays. Said in the log; a refusal leaves the task where it is.
   */
  const unrestedDropped = async (
    projectId: string,
    tree: MemoryTree,
    before: Awaited<ReturnType<typeof productRetirements>>
  ) => {
    const rested = new Set(
      Object.values(tree.ledger.lessons).flatMap((lesson) =>
        lesson.product ? [lesson.product.task] : []
      )
    );
    for (const [id, { task }] of before) {
      if (!task || rested.has(task)) {
        continue;
      }
      const dropped = await tasks.drop(projectId, task, {
        field: LESSON_FIELD,
        value: id,
        reason: memoryRunWords.productTaskDropped(id),
      });
      if (dropped === "dropped" || typeof dropped !== "string") {
        console.log(
          `[memory] ${projectId}: ${task} of ${id} ${dropped === "dropped" ? "dropped" : `not dropped: ${dropped.refused}`}`
        );
      }
    }
  };

  /** Each project's recovery runs chained since it was last asked for. */
  const chained = new Map<string, number>();

  /** The notes of `ids`, wherever each is now (the inbox or the archive). */
  const notesNamed = async (projectId: string, ids: ReadonlySet<string>) => {
    const inbox = await notesIn(projectId, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const archive = await notesIn(projectId, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    return [...inbox, ...archive].filter((note) => ids.has(note.id));
  };

  // --- a note withdrawn -----------------------------------------------------------

  /** The note `id` names, in the inbox or the archive; refused when it is no note's id, no note of the project's, or withdrawn already. */
  const withdrawable = async (projectId: string, id: string) => {
    if (!NOTE_ID.test(id)) {
      return problem(400, {
        code: "memory-note-id-unfit",
        detail: `${id} is not a note id (n-YYYYMMDD-HHMMSS-xxxxxx).`,
      });
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
  const withdraw = async (projectId: string, id: string) => {
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
    const sha = await commit(projectId, read.tree, tree, {
      author: YOU,
      message: `memory: ${id} withdrawn`,
      notes: [{ note, outcome: "withdrawn" }],
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    return { withdrawn: id, sha: sha ?? "", retires, keeps };
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

  // --- staged lessons Jev did not check ------------------------------------------------

  /**
   * The staged lessons written while Jev was off (`staged.waits`), checked
   * on the first night it is on (§7): one that says what a live lesson in
   * its home or the index says is merged into it; else one resting on the
   * person's message lands when Jev finds the message states it and is
   * retired when not; one resting on agents' notes lands when two of them
   * count as two sessions saying the same, and otherwise waits on as
   * staged. One that stays and is about CawCo, in a project that develops
   * CawCo, waits on its task ({@link productMarked}). One commit.
   */
  const recheckStaged = async (project: ProjectRow) => {
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
    const ours = buildsCawco(project.id);
    const answers = await answersOf(
      project.id,
      Object.fromEntries(
        waiting.flatMap(([id, lesson]) =>
          stagedQuestions(id, lesson, notesOf, beside.get(id) ?? [], ours)
        )
      )
    );
    const today = dayOf(new Date());
    let { tree } = read;
    for (const [id, lesson] of waiting) {
      tree = await rechecked(
        project.id,
        tree,
        [id, lesson],
        { notes: notesOf(lesson), beside: beside.get(id) ?? [] },
        { answers, today }
      );
    }
    return await commit(project.id, read.tree, tree, {
      author: { name: "Jev" },
      message: `memory: Jev checks ${waiting.length} lesson${waiting.length === 1 ? "" : "s"} staged while it was off`,
    });
  };

  /** `tree` with one lesson staged while Jev was off as Jev's answers make it ({@link recheckStaged}): changed ({@link recheckedChange}) or waiting on with Jev's check done, and, when it stays and is about CawCo, waiting on its task. */
  const rechecked = async (
    projectId: string,
    tree: MemoryTree,
    [id, lesson]: [string, Lesson],
    read: { beside: readonly Beside[]; notes: Note[] },
    {
      answers,
      today,
    }: { answers: Map<string, number> | undefined; today: string }
  ): Promise<MemoryTree> => {
    const text = lesson.staged?.text ?? "";
    const change = recheckedChange(id, lesson, read, answers);
    let now = tree;
    if (change) {
      now = applyOp(tree, checked(change), today, usesOf(projectId)).tree;
    } else if (lesson.staged) {
      const { waits: _, ...staged } = lesson.staged;
      now = withLesson(tree, id, { ...lesson, staged });
    }
    const after = now.ledger.lessons[id]?.state;
    if (!(
      aboutCawco(id, answers) &&
      (after === "live" || after === "staged")
    )) {
      return now;
    }
    const marked = await productMarked(projectId, now, { id, text });
    console.log(`[memory] ${projectId}: ${marked.said}`);
    return marked.tree;
  };

  /** Jev's questions on one lesson staged while it was off: whether it is about CawCo (only in a project that develops CawCo, `ours`), each message's support, each pair of notes' sameness, and whether it says what a lesson of `beside` says. */
  const stagedQuestions = (
    id: string,
    lesson: Lesson,
    notesOf: (lesson: Lesson) => Note[],
    beside: readonly Beside[],
    ours: boolean
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
      ...(ours ? [productQuestion(id, text)] : []),
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
    const into = likeliest("kept", id, beside, answers);
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

  // --- the cutover -----------------------------------------------------------------------

  /**
   * One project's memory moved to lessons (§11), once: each current fact
   * line of `knowledge/` a lesson in place (`by: agent`, its notes as
   * sources, a file's prose before facts as approved), its `## Formerly` and
   * `## Conflict` lines to its archive; each fact line of AGENTS.md's
   * curated sections a rule of its `## Rules` (approved by the person);
   * AGENTS.md in its shape, his `## Notes` as they stand. A line that breaks
   * a text rule or a cap (a quoted span, past its length) is not converted:
   * it goes to `memory/recovery.json` for the recovery run, with every note
   * archived unread before because its session had read the web. One
   * commit. Nothing when the project's ledger is there already.
   */
  const cutover = async (project: ProjectRow) => {
    const ledger = await fileOr(project.id, LEDGER_FILE);
    if (ledger instanceof ElysiaStatus) {
      return ledger;
    }
    if (ledger.trim() !== "") {
      return;
    }
    const read = await treeOf(project.id);
    if (read instanceof ElysiaStatus) {
      return read;
    }
    const archive = await notesIn(project.id, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    const noteNamed = new Map(archive.map((note) => [note.id, note]));
    const today = dayOf(new Date());
    const sourcesOf = (fact: OldFact): LessonSource[] => [
      ...fact.notes.map((id): LessonSource => {
        const note = noteNamed.get(id);
        return note
          ? noteSource(note)
          : { kind: "note", id, session: "", root: id, labels: [] };
      }),
      ...(fact.approved || fact.notes.length === 0
        ? [{ kind: "approved" as const, commit: read.head }]
        : []),
    ];
    const conversion: Conversion = { lessons: {}, legacy: [], today };
    const files: Partial<Record<string, string>> = { ...read.tree.files };
    for (const path of Object.keys(read.tree.files)) {
      convertKnowledge(conversion, files, path, sourcesOf);
    }
    const index = convertIndex(
      conversion,
      project.name,
      files[INDEX_FILE] ?? "",
      read.head
    );
    const { tree } = reconcile(
      {
        files: { ...files, [INDEX_FILE]: index },
        ledger: { version: 1, lessons: conversion.lessons },
      },
      today,
      read.head
    );
    const { lessons, legacy } = conversion;
    const inbox = await notesIn(project.id, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const tainted = [
      ...archive.filter((note) => note.outcome?.startsWith("tainted")),
      ...inbox,
    ].map((note) => note.id);
    const recovery: Recovery = { legacy, notes: tainted, runs: 0 };
    const sha = await commit(project.id, read.tree, tree, {
      author: HUB,
      message: `memory: lessons in place of fact lines, ${Object.keys(lessons).length} converted, ${legacy.length} left for the recovery run`,
      extra:
        legacy.length + tainted.length > 0
          ? [{ path: RECOVERY_FILE, content: jsonText(recovery) }]
          : [],
    });
    if (sha instanceof ElysiaStatus) {
      return sha;
    }
    console.log(
      `[memory] ${project.name}: cutover: ${Object.keys(lessons).length} lines converted, ${legacy.length} legacy, ${tainted.length} notes for the recovery run`
    );
  };

  /**
   * The cutover as the hub starts on it ({@link cutover}): each project's
   * once, marked done when it went through; one that did not is said in the
   * log and tried at the next start.
   */
  const start = async (projects: readonly ProjectRow[]): Promise<void> => {
    for (const project of projects) {
      const name = `memory-lessons:${project.id}`;
      if (db.dataMigrated(name)) {
        continue;
      }
      try {
        const refused = await cutover(project);
        if (refused) {
          console.warn(
            `[memory] ${project.name}: its memory was not moved to lessons: ${refused.response.detail}`
          );
          continue;
        }
        db.markDataMigrated(name);
      } catch (error) {
        console.warn(
          `[memory] ${project.name}: its memory was not moved to lessons: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  };

  return {
    start,
    brief,
    recoveryBrief,
    withdraw,
    purged,
    cutover,
    recheckStaged,
    apply,
    close,
    upkeep,
    recoveryStart,
    probeCheck,
  };
};

/** The recovery run's limit on added lessons, for each of its two runs. */
const RECOVERY_ADDS = 30;
/**
 * The recovery runs that start one after another before it waits to be
 * asked again: each judges up to {@link RECOVERY_NOTES} notes on its own
 * budget (routines.ts `RECOVERY_BUDGET`), so six read 360, past the most
 * any project has needed (92), and cap one ask at six runs' budget.
 */
const RECOVERY_CHAIN = 6;
/** A note archived with no operation naming it. */
const UNREAD = "dropped: unread";
/** The subject a run's closing commit starts with ({@link closed}). */
const markOf = (kind: Run["kind"]): string => `memory: the ${kind} run's mark`;
/** A recovery run's closing commit, as its notes archived unread are found again. */
const RECOVERY_MARK = markOf("recovery");

export type MemoryRun = ReturnType<typeof createMemoryRun>;
