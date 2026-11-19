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
 *   `MEMORY_ARCHIVE_DAYS`) archived, a retired entry past its days taken
 *   out of the ledger, the index in its shape. One commit.
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
 *   lesson quotes no one (memory-sources.ts `quoteProblem`); an agent's
 *   lesson goes to knowledge, and lands only when notes of two sessions say
 *   it (memory-sources.ts `countsTogether`, and Jev on the pair), staged in
 *   the ledger until then; the caps and the night's limits hold. Each
 *   operation is one commit, by the Memory curator, with the notes it
 *   consumed archived in it.
 * - **Close** ({@link close}): where the run read up to is kept
 *   (`memory/state.json`), messages it was given and named in no operation
 *   carried to the next night once, and the run's one line said.
 * - **The cutover** ({@link cutover}), once per project as the hub starts on
 *   this: AGENTS.md and `knowledge/` converted to lessons, every line that
 *   breaks a text rule or a cap handed to the **recovery** run
 *   (`memory/recovery.json`), with the notes archived unread before because
 *   their session had read the web ({@link recoveryBrief}).
 */
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
  MemoryRunState,
} from "./db/stored-types";
import { jevAccess } from "./jev";
import { askRow, offLine } from "./jev-placement";
import {
  ARCHIVE_DIR,
  archivedNote,
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
import { countsTogether, quoteProblem, rootOf } from "./memory-sources";
import {
  changeFolderFiles,
  type FolderAuthor,
  folderCommitsChanging,
  folderHistory,
  readFolderFileAt,
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

/** A lesson a message may state again or change: a live one's line, or the words of one the run took out. */
interface Kept {
  id: string;
  live: boolean;
  text: string;
}

/** Why a lesson left that a repeat of the person's puts back: the run replaced it, or archived it unused. */
const TAKEN_OUT: ReadonlySet<string> = new Set(["replaced", "unneeded"]);

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
  /** The skills the fleet lists for the project's sessions, each with its one-line description. */
  readonly skillsFor: (
    projectId: string
  ) => { description: string; name: string }[];
}

/** A send kept as `memory/recovery.json`'s inputs: what the one-time recovery run reads, until each is read. */
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
      dropped: z.number(),
      read: z.number(),
      replaced: z.number(),
      restored: z.number().optional(),
      retired: z.number(),
      reverted: z.number().optional(),
      staged: z.number(),
    })
    .nullable(),
  recovered: z.string().optional(),
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
const rowsOf = (names: string[]): ("said" | "inbox" | "support" | "same")[] => {
  const rows = {
    "said:": "said",
    "note:": "inbox",
    "support:": "support",
    "same:": "same",
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
    lesson.state === "retired" &&
    lesson.retired?.text &&
    TAKEN_OUT.has(lesson.retired.why)
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
  skillsFor,
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
    for (let at = 0; at < asked.length; at += JEV_QUESTIONS) {
      const batch = Object.fromEntries(asked.slice(at, at + JEV_QUESTIONS));
      const result = await askRow(
        rowsOf(Object.keys(batch)),
        project.id,
        key,
        { project: project.name },
        batch
      );
      readAnswers(result.answers, read);
    }
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
    if (
      one.does === "repeats" &&
      lesson.state === "retired" &&
      lesson.retired &&
      TAKEN_OUT.has(lesson.retired.why)
    ) {
      return await putBack(projectId, run, tree, one.id, lesson, source);
    }
    if (one.does === "repeats" && lesson.state === "live") {
      return await repeatOf(projectId, tree, one.id, lesson, source);
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
    const home = await checkedLesson(projectId, run, tree, op.home, {
      text,
      why,
      by,
    });
    if (typeof home === "string") {
      return home;
    }
    if (run.adds >= adds(run)) {
      return memoryRunWords.nightAdds(adds(run));
    }
    const waits =
      !run.jev && (kept.messages.length > 0 || kept.notes.length > 1);
    const staged =
      waits || !(by === "owner" || twoSessions(index, kept.notes, answers));
    if (staged && stagedCount(tree) >= CAPS.staged) {
      return memoryRunWords.stagedFull(CAPS.staged);
    }
    return addPlanned(tree, head, op.sources, kept, {
      by,
      home,
      text,
      why,
      staged: staged ? { waits } : undefined,
    });
  };

  /** A checked `add` as one operation commits it: the change, the notes it consumes, and what it says. */
  const addPlanned = (
    tree: MemoryTree,
    head: string,
    consumed: string[],
    kept: { messages: Given[]; notes: Note[] },
    lesson: {
      by: Lesson["by"];
      home: LessonHome;
      staged: { waits: boolean } | undefined;
      text: string;
      why: string | undefined;
    }
  ): Planned => {
    const id = newLessonId((taken) => taken in tree.ledger.lessons);
    const { by, home, staged, text, why } = lesson;
    return {
      change: {
        kind: "add",
        id,
        by,
        home,
        sources: sourcesFor(kept.messages, kept.notes, head),
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

  /** A lesson's home as asked, and its words, checked: an agent's goes to knowledge; the home, or why not. */
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
    return bad ?? home;
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
    if (run.changes >= CAPS.nightChanges) {
      return memoryRunWords.nightChanges(CAPS.nightChanges);
    }
    const newId = newLessonId((taken) => taken in tree.ledger.lessons);
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
      change: {
        kind: "corroborate",
        id: op.id,
        lands,
        sources: sourcesFor(kept.messages, kept.notes, head),
      },
      consumed: op.sources,
      notes: kept.notes.map((note) => ({
        note,
        outcome: `corroborates ${op.id}`,
      })),
      said: lands
        ? memoryRunWords.landed(op.id, path)
        : memoryRunWords.corroborated(op.id),
    };
  };

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

  /** A `drop`, checked: its sources are this run's; its notes leave for the archive with the reason. */
  const plannedDrop = (
    run: Run,
    op: Extract<MemoryOp, { op: "drop" }>
  ): Planned => {
    const resolved = resolvedSources(run, op.sources);
    if (typeof resolved === "string") {
      return resolved;
    }
    return {
      consumed: op.sources,
      notes: resolved.flatMap((found) =>
        found.kind === "note"
          ? [{ note: found.note, outcome: `dropped: ${op.reason}` }]
          : []
      ),
      said: memoryRunWords.dropped(op.sources.length, op.reason),
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
        return plannedReplace(run, tree, head, op, index, answers);
      case "corroborate":
        return plannedCorroborate(run, tree, head, op, index, answers);
      case "move":
        return plannedMove(projectId, run, tree, op);
      case "drop":
        return plannedDrop(run, op);
      default:
        return memoryRunWords.noSources;
    }
  };

  /** Jev's answers for one call's questions, by name: each yes's probability. Jev off, none; failing, its words. */
  const answersOf = async (
    projectId: string,
    questions: Record<string, Experimental_DecisionQuestion>
  ) => {
    const key = jevAccess(db);
    if (!key || Object.keys(questions).length === 0) {
      return;
    }
    const rows = [
      ...(Object.keys(questions).some((name) => name.startsWith("support:"))
        ? (["support"] as const)
        : []),
      ...(Object.keys(questions).some((name) => name.startsWith("same:"))
        ? (["same"] as const)
        : []),
    ];
    const result = await askRow(rows, projectId, key, {}, questions);
    return new Map(
      Object.entries(result.answers).map(([name, answer]) => [
        name,
        "probability" in answer ? answer.probability : 0,
      ])
    );
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
    return { lines: await appliedAll(projectId, run, read, ops, answers) };
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
    try {
      return await answersOf(projectId, questionsOf(run, ops, tree));
    } catch (error) {
      return problem(502, {
        code: "memory-jev-failed",
        detail: memoryRunWords.jevFailed(
          error instanceof Error ? error.message : String(error)
        ),
      });
    }
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
    for (const handle of plan.consumed) {
      run.consumed.add(handle);
      run.notes.delete(handle);
    }
    count(run, plan.change, op);
    return { tree: applied.tree, said, sha };
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
    } else if (change.kind === "move") {
      run.changes += 1;
    }
  };

  // --- close ---------------------------------------------------------------------

  /**
   * Where a run ended (§2 D): what it read is marked read (a failed run's
   * is read again the next night), messages it was given and named in no
   * operation carried once, the recovery's notes it left archived unread,
   * the run's counts kept; its one line, or nothing when it changed nothing.
   */
  const closed = async (projectId: string, run: Run, outcome: RunOutcome) => {
    const state = await stateOf(projectId);
    if (state instanceof ElysiaStatus) {
      return state;
    }
    const at = new Date().toISOString();
    const next = nextState(state, run, outcome, at);
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
    const kept = recovery?.done ? { ...next, recovered: dayOf(at) } : next;
    const files = [
      ...(Bun.deepEquals(kept, state)
        ? []
        : [{ path: RUN_STATE_FILE, content: jsonText(kept) }]),
      ...(recovery?.file ? [recovery.file] : []),
    ];
    const done = await commit(projectId, read.tree, read.tree, {
      author: HUB,
      message: `memory: the ${run.kind} run's mark, ${dayOf(at)}`,
      extra: files,
      gone: recovery?.done ? [RECOVERY_FILE] : [],
      notes: recovery?.unread ?? [],
    });
    return done instanceof ElysiaStatus ? done : undefined;
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

  /** The recovery's notes for its next run, after upkeep: the archived ones it was handed, then the inbox's, at most {@link RECOVERY_NOTES}. */
  const recoveryNotes = async (project: ProjectRow, recovery: Recovery) => {
    const kept = await upkeep(project);
    if (kept instanceof ElysiaStatus) {
      return kept;
    }
    const archive = await notesIn(project.id, ARCHIVE_DIR);
    if (archive instanceof ElysiaStatus) {
      return archive;
    }
    const inbox = await notesIn(project.id, INBOX_DIR);
    if (inbox instanceof ElysiaStatus) {
      return inbox;
    }
    const wanted = new Set(recovery.notes);
    // A note a nightly run read since is no longer the recovery's.
    return [...archive, ...inbox]
      .filter(
        (note) =>
          wanted.has(note.id) &&
          (note.outcome === null || note.outcome.startsWith("tainted"))
      )
      .slice(0, RECOVERY_NOTES);
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
   * The recovery's inputs once a recovery run ends: its notes no operation
   * named archived unread, the legacy lines it read gone, the notes left
   * for a second run kept; the file gone when nothing is left, and the run
   * marked done.
   */
  const recoveryLeft = async (projectId: string, run: Run) => {
    const recovery = await recoveryOf(projectId);
    if (recovery instanceof ElysiaStatus) {
      return recovery;
    }
    if (!recovery) {
      return { done: false, unread: [], file: undefined };
    }
    const given = new Set([...run.notes.keys(), ...run.consumed]);
    const left: Recovery = {
      legacy: recovery.legacy.filter(
        (_, at) => !run.consumed.has(`l${at + 1}`)
      ),
      notes: recovery.notes.filter((id) => !given.has(id)),
      runs: recovery.runs + 1,
    };
    const last = left.runs >= RECOVERY_RUNS;
    const unreadIds = new Set([
      ...[...run.notes.keys()].filter((id) => recovery.notes.includes(id)),
      ...(last ? left.notes : []),
    ]);
    const unread = await notesNamed(projectId, unreadIds);
    if (unread instanceof ElysiaStatus) {
      return unread;
    }
    const done = last || left.notes.length + left.legacy.length === 0;
    return {
      done,
      unread: unread
        .filter(
          (note) => note.outcome === null || note.outcome.startsWith("tainted")
        )
        .map((note) => ({ note, outcome: "dropped: unread" })),
      file: done ? undefined : { path: RECOVERY_FILE, content: jsonText(left) },
    };
  };

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
   * on the first night it is on (§7): one resting on the person's message
   * lands when Jev finds the message states it and is retired when not;
   * one resting on agents' notes lands when two of them count as two
   * sessions saying the same, and otherwise waits on as staged. One commit.
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
    const answers = await answersOf(
      project.id,
      Object.fromEntries(
        waiting.flatMap(([id, lesson]) => stagedQuestions(id, lesson, notesOf))
      )
    );
    const today = dayOf(new Date());
    let { tree } = read;
    for (const [id, lesson] of waiting) {
      const change = recheckedChange(id, lesson, notesOf(lesson), answers);
      if (change) {
        ({ tree } = applyOp(tree, checked(change), today, usesOf(project.id)));
      } else if (lesson.staged) {
        const { waits: _, ...staged } = lesson.staged;
        tree = withLesson(tree, id, { ...lesson, staged });
      }
    }
    return await commit(project.id, read.tree, tree, {
      author: { name: "Jev" },
      message: `memory: Jev checks ${waiting.length} lesson${waiting.length === 1 ? "" : "s"} staged while it was off`,
    });
  };

  /** Jev's questions on one lesson staged while it was off: each message's support, each pair of notes' sameness. */
  const stagedQuestions = (
    id: string,
    lesson: Lesson,
    notesOf: (lesson: Lesson) => Note[]
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
    return [...support, ...pairQuestions(`${id}`, notesOf(lesson))];
  };

  /**
   * What Jev's answers make of a lesson staged while it was off: one resting
   * on the person's message lands when a message states it and is retired
   * when none does; one resting on notes lands when two count as two
   * sessions saying the same. Nothing when it waits on.
   */
  const recheckedChange = (
    id: string,
    lesson: Lesson,
    notes: Note[],
    answers: Map<string, number> | undefined
  ): Change | undefined => {
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
    /** Whether project `projectId` has recovery inputs left to run. */
    recoveryWaits: async (projectId: string) => {
      const recovery = await recoveryOf(projectId);
      return recovery instanceof ElysiaStatus ? recovery : recovery !== null;
    },
    /** How many recovery runs project `projectId` has had. */
    recoveryRuns: async (projectId: string) => {
      const recovery = await recoveryOf(projectId);
      return recovery instanceof ElysiaStatus
        ? recovery
        : (recovery?.runs ?? 0);
    },
  };
};

/** The recovery run's limit on added lessons, for each of its two runs. */
const RECOVERY_ADDS = 30;
/** The recovery's runs: two of 60 notes each read every note it was handed. */
export const RECOVERY_RUNS = 2;

export type MemoryRun = ReturnType<typeof createMemoryRun>;
