/**
 * A session's open items: its open questions, promises, decisions with their
 * reasons, and the files to read again, kept in records rather than prose,
 * so that no summary decides what survives a compaction.
 *
 * - **Filing** ({@link filingPrompt}): before the hub compacts a session
 *   (after a move at its account's limit), before a person's Continue opens
 *   a new session, and once a turn ends with its context within its
 *   compaction policy's `fileRoom` of where its harness compacts it on its
 *   own, later (compaction.ts `fileAtThreshold`), the session takes one turn
 *   whose only job is to file what is open into its records. On a real
 *   13-hour chat, native compaction alone answered 16% of probes, CawCo's summary 35%, native
 *   compaction with the open items filed first 47%, and with only the
 *   records that already existed 17% (the continuation evaluation,
 *   2026-10-16): the filing is what carries.
 * - **Reading** ({@link createOpenItems}): code builds the "Open items"
 *   section from those rows, word for word: the session's plan (the tasks
 *   and to-dos it works on, still open), its task's open to-dos, the open
 *   tasks it filed,
 *   every question its delegation tree put to the person, open or answered
 *   and not yet taken (artifacts/questions.ts, its own first, an ended
 *   delegate's taken up by it), its notes still in the project's memory
 *   inbox, and its asks still waiting on the person (asks.ts). Every harness has it listed after each of its compactions,
 *   whoever asked for it, each reading the `open_items` tool: Claude Code
 *   through the agent's SessionStart hook on the `compact` source (claude.ts
 *   `openItemsAfterCompaction`), pi as a message that starts no turn on its
 *   `compaction_end` (pi-runtime.ts), OpenCode as synthetic input that starts
 *   no turn on its `session.compaction.ended` (CawCo's plugin,
 *   opencode-plugin.ts). A person's Continue opens the new session on it.
 */

import { askLink } from "@cawco/core/asks";
import type {
  ContextFill,
  FiledRecords,
  FilingWrote,
} from "@cawco/core/context-filing";
import type { PlanStep, SessionPlan, TaskTodo } from "@cawco/core/plan";
import { taskLink, todoLink } from "@cawco/core/references";
import { contextWords } from "@cawco/core/words/context";
import { ElysiaStatus, problem } from "elysia";
import type { QuestionAnswer } from "./artifacts/questions";
import type { Artifacts } from "./artifacts/service";
import type { AskedOf } from "./artifacts/shapes";
import type { DbShape } from "./db";
import type { inboxNotes, Note } from "./memory";
import type { Plans } from "./plans";
import { recordsProjectOf } from "./records-project";

import type { Tasks } from "./tasks";

/**
 * The filing turn's message: the hub's word to the session, standing alone.
 * It names every record a session has, by the tool that writes it, and asks
 * for nothing else. `then`: what follows the turn, a compaction of this
 * conversation, or a new session continuing it. `fill`: the reading a
 * filing at the session's context threshold fired at, whose turn opens on
 * how full its context is and closes on its harness compacting it later,
 * on its own; the body between is the same.
 */
export const filingPrompt = (
  then: "compacted" | "continued",
  fill?: ContextFill
): string =>
  [
    ...(fill
      ? [contextWords.filingFact(fill.tokens, fill.compactsAt), ""]
      : []),
    `Before this conversation is ${then === "compacted" ? "compacted" : "continued in a new session"}, file everything still open into your records, so it outlives the ${then === "compacted" ? "compaction" : "move"}: the hub lists those records word for word ${then === "compacted" ? "after it" : "in the new session's opening"}. This turn does only that.`,
    "",
    "- Work that must outlive this conversation and every promise made: a task (`task_create`), or a to-do on the task it belongs to (`todo_write` with `task` and `add`). Your task's to-dos you finished: `todo_write` with `tick`.",
    "- A decision taken on a task, with its reason, a constraint the person set (in plain words, never quoting them), an approach ruled out and why, and the files, paths, commands, ids and links to read again: a comment on that task (`task_comment`).",
    "- A lasting fact (convention, command, decision, place) or the person's correction or preference on how to work: `memory_note`.",
    "- A question still waiting on the person stays where you asked it: it is listed again from its record.",
    "",
    "Write again only what changed or is missing. Then end your turn.",
    ...(fill ? ["", contextWords.filingLater] : []),
  ].join("\n");

/**
 * The focus the hub's `/compact` carries, on every harness: what its summary
 * keeps. The open items themselves come back from the records after it,
 * which every harness lists (the module's doc).
 */
export const COMPACT_FOCUS =
  "Keep, word for word where short: what the person asked, decided, ruled out or set as a constraint, with their reasons; what was tried and why it was set aside; where the work stands; the names, numbers, paths, commands, ids and links in play. Open questions, promises and next steps are listed again after this from the session's records.";

/** The heading every Open items section opens with. */
const OPEN_ITEMS_HEADING =
  "## Open items (this session's records, word for word)";

/** What the reader gathered: each source's rows, as stored. */
export interface OpenItemRows {
  /** Its asks still waiting on the person, approvals and questions, each by its link. */
  asks: string[];
  /** Its notes still in its project's memory inbox. */
  notes: Note[];
  /** Its plan: the tasks and to-dos it works on, and an attempt's task with its to-dos. */
  plan: SessionPlan | null;
  /** The project its records live in (records-project.ts). */
  projectId: string;
  /** Every question its delegation tree put to the person, open or answered, its own first (artifacts/service.ts `questions`). */
  questions: AskedOf[];
  /** The open tasks it filed, each with its description and open to-dos. */
  tasks: {
    description: string;
    id: string;
    stage: string;
    title: string;
    todos: TaskTodo[];
  }[];
}

/** A step's record by its link, its words the label; a gone one's handle and words. */
const stepRecordWords = (projectId: string, step: PlanStep): string => {
  if (step.gone) {
    return `${step.id} ${step.content}`;
  }
  return step.todo
    ? todoLink(projectId, step.task, step.todo, step.content)
    : taskLink(projectId, step.task, step.content);
};

/** A step's line: its status, then its record ({@link stepRecordWords}). */
const stepLine =
  (projectId: string) =>
  (step: PlanStep): string =>
    `${"  ".repeat(step.depth)}- [${step.status}] ${stepRecordWords(projectId, step)}`;

/** A to-do's line: its link, its words the label, when it has an id and a task; else its marker or position and its words. */
const todoLine =
  (projectId: string, task: string | undefined) =>
  (todo: TaskTodo): string =>
    `${"  ".repeat(todo.depth)}- ${
      task && todo.id
        ? todoLink(projectId, task, todo.id, todo.text)
        : `${todo.id ?? todo.path} ${todo.text}`
    }`;

/** Text under a list line, indented so it stays that line's. */
const under = (text: string): string[] =>
  text
    .trim()
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""));

/** Questions one read of the Open items lists, at most: a page, from `cursor`. Our call. */
const QUESTIONS_PAGE = 30;

/** Which questions a read lists, and how: from `cursor` (a count), each said whole when `detailed`. */
export interface QuestionsPage {
  cursor: number;
  detailed: boolean;
}

/** His words in a line: quoted, cut at `most` characters unless the read is detailed. */
const quoted = (text: string, detailed: boolean, most = 160): string => {
  const flat = detailed ? text.trim() : text.trim().replace(/\s+/gu, " ");
  return `“${!detailed && flat.length > most ? `${flat.slice(0, most - 1)}…` : flat}”`;
};

/** What he answered with, in words. */
const answerWords = (answer: QuestionAnswer, detailed: boolean): string => {
  switch (answer.by) {
    case "pick":
      return `picked ${(answer.options ?? []).map((one) => quoted(one, detailed, 60)).join(", ")}${answer.said ? `, note ${quoted(answer.said, detailed)}` : ""}`;
    case "note":
      return `note ${quoted(answer.said, detailed)}`;
    case "value":
      return `set ${answer.said}`;
    case "pin":
      return `a pin on it you answered and resolved: ${quoted(answer.said, detailed)}`;
    case "reply":
      return `replied ${quoted(answer.said, detailed)}`;
    case "resolve":
      return "resolved it";
    case "dismiss":
      return answer.said
        ? `dismissed it without a pick, saying ${quoted(answer.said, detailed)}`
        : "dismissed it without a pick or a word";
    default:
      return String(answer.by);
  }
};

/** An artifact's line in the questions part: its link and kind, and whose it is when not the session's. */
const artifactHead = (of: AskedOf): string => {
  const ended = of.session?.ended ? ", ended: yours now" : "";
  const whose = of.session ? `, made in ${of.session.link}${ended}` : "";
  return `- ${of.artifact.link} (${of.artifact.kind}${whose})`;
};

/** A question's lines: answered or dismissed with what he said and when, or open, by its link; detailed, what was asked of a pin and a card's why. */
const questionLines = (
  question: AskedOf["questions"][number],
  detailed: boolean
): string[] => {
  const { answer } = question;
  const head =
    (question.state === "answered" || question.state === "dismissed") && answer
      ? `${question.state}, ${answerWords(answer, detailed)} (${answer.at.slice(0, 16).replace("T", " ")})`
      : "open";
  return [
    `  - ${head}: ${question.link}`,
    ...(detailed && question.kind === "pin" && question.words
      ? [`    You asked: ${quoted(question.words, true)}`]
      : []),
    ...(detailed && question.why ? [`    Why: ${question.why}`] : []),
  ];
};

/**
 * The questions part: each artifact by its link, whose it is when not the
 * session's, then each question open, answered or dismissed, by its link (what
 * `question_close` takes), a page of {@link QUESTIONS_PAGE} from the
 * cursor, its own first as the reader gave them.
 */
const questionsPart = (
  asked: readonly AskedOf[],
  page: QuestionsPage
): string[] => {
  const all = asked.flatMap((of) =>
    of.questions.map((question) => ({ of, question }))
  );
  if (all.length === 0) {
    return [];
  }
  const shown = all.slice(page.cursor, page.cursor + QUESTIONS_PAGE);
  const lines: string[] = [
    "### Questions you and your delegates put to the person",
    "An open one waits on him; an answered or dismissed one waits on you: act on it, then close it with question_close (taken, or withdrawn when it no longer applies). A dismissed one he put down without a pick: don't ask it again in the same words.",
  ];
  shown.forEach(({ of, question }, n) => {
    if (shown[n - 1]?.of !== of) {
      lines.push(artifactHead(of));
    }
    lines.push(...questionLines(question, page.detailed));
  });
  const next = page.cursor + shown.length;
  if (next < all.length) {
    lines.push(
      `${all.length - next} more questions past these: open_items with cursor ${next}.`
    );
  }
  return lines;
};

/**
 * The Open items section, built from `rows`: each source under its own
 * heading, its rows as stored; a source with nothing open says nothing. With
 * nothing open anywhere it says so, so a reader knows the records were read.
 */
function openItemsSection(rows: OpenItemRows, page: QuestionsPage): string {
  const parts: string[] = [];
  const steps = (rows.plan?.steps ?? []).filter(
    (step) => step.status !== "completed"
  );
  if (steps.length > 0) {
    parts.push(
      "### Your plan's open tasks and to-dos",
      ...steps.map(stepLine(rows.projectId))
    );
  }
  const todos = (rows.plan?.todos ?? []).filter((todo) => !todo.done);
  if (rows.plan?.taskId && todos.length > 0) {
    parts.push(
      "### Your task's open to-dos",
      ...todos.map(todoLine(rows.projectId, rows.plan.taskId))
    );
  }
  if (rows.tasks.length > 0) {
    parts.push(
      "### Open tasks you filed",
      ...rows.tasks.flatMap((task) => [
        `- ${taskLink(rows.projectId, task.id, task.title)} (${task.stage})`,
        ...(task.description.trim() ? under(task.description) : []),
        ...task.todos
          .filter((todo) => !todo.done)
          .map((todo) => `  ${todoLine(rows.projectId, task.id)(todo)}`),
      ])
    );
  }
  parts.push(...questionsPart(rows.questions, page));
  if (rows.asks.length > 0) {
    parts.push(
      "### Your asks waiting on the person (each answer arrives as a message)",
      ...rows.asks.map((link) => `- ${link}`)
    );
  }
  if (rows.notes.length > 0) {
    parts.push(
      "### Your notes still in the project's memory inbox",
      ...rows.notes.flatMap((note) => [
        `- ${note.id} (${note.time})`,
        ...under(note.text),
      ])
    );
  }
  return [
    OPEN_ITEMS_HEADING,
    ...(parts.length > 0
      ? parts
      : [
          "Nothing open is filed: no open plan steps, to-dos, tasks, questions to the person, notes or asks.",
        ]),
  ].join("\n");
}

/** A to-do as {@link recordsOf} compares it: its task, place, tick and words. */
const todoRecord =
  (task: string) =>
  (todo: TaskTodo): string =>
    [task, todo.path, todo.done ? "x" : " ", todo.text].join("\t");

/**
 * What `rows` hold, each record one line to compare (core `FiledRecords`):
 * what a filing at the threshold counts what it wrote against
 * ({@link filingWrote}). A step is its status and the record it names.
 */
export const recordsOf = (rows: OpenItemRows): FiledRecords => ({
  steps: (rows.plan?.steps ?? []).map((step) =>
    [step.status, step.id].join("\t")
  ),
  todos: [
    ...(rows.plan?.taskId
      ? (rows.plan.todos ?? []).map(todoRecord(rows.plan.taskId))
      : []),
    ...rows.tasks.flatMap((task) => task.todos.map(todoRecord(task.id))),
  ],
  tasks: rows.tasks.map((task) => task.id),
  notes: rows.notes.map((note) => note.id),
});

/**
 * What a filing wrote, from its session's records as it started (`before`)
 * and as its turn ended (`after`): each kind of record of `after` not in
 * `before`, counted (a step closed or new counts, a step dropped does
 * not). The to-dos of a task it filed count with that task, not again as
 * to-dos.
 */
export const filingWrote = (
  before: FiledRecords,
  after: FiledRecords
): FilingWrote => {
  const fresh = (was: readonly string[], now: readonly string[]) => {
    const had = new Set(was);
    return now.filter((one) => !had.has(one));
  };
  const filed = new Set(fresh(before.tasks, after.tasks));
  return {
    steps: fresh(before.steps, after.steps).length,
    todos: fresh(before.todos, after.todos).filter(
      (todo) => !filed.has(todo.slice(0, todo.indexOf("\t")))
    ).length,
    tasks: filed.size,
    notes: fresh(before.notes, after.notes).length,
  };
};

export interface OpenItemsDeps {
  db: Pick<DbShape, "asks" | "getInstancesByIds" | "workItem">;
  /** A project's memory inbox, oldest first (memory.ts `inboxNotes`), or the folder's refusal. */
  inbox: typeof inboxNotes;
  /** A session's plan as its followers hold it (plans.ts `read`), or its refusal. */
  plan: Plans["read"];
  /** Every question a session's delegation tree put to the person (artifacts/service.ts `questions`), or the refusal of a session the hub does not have. */
  questions: Artifacts["questions"];
  tasks: Pick<Tasks, "get" | "list">;
}

/** The open tasks `instanceId` filed in `projectId`, each read whole; the first refused read. */
const filedTasks = async (
  deps: OpenItemsDeps,
  projectId: string,
  instanceId: string
) => {
  const list = await deps.tasks.list(projectId);
  if (list instanceof ElysiaStatus) {
    return list;
  }
  const open = list.tasks.filter(
    (task) =>
      task.createdBy?.id === instanceId &&
      task.kind !== "done" &&
      task.kind !== "dropped" &&
      task.archivedAt === null
  );
  const reads = await Promise.all(
    open.map((task) => deps.tasks.get(projectId, task.id))
  );
  const filed: OpenItemRows["tasks"] = [];
  for (const read of reads) {
    if (read instanceof ElysiaStatus) {
      return read;
    }
    filed.push({
      id: read.id,
      stage: read.stage,
      title: read.title,
      description: read.description,
      todos: read.todos,
    });
  }
  return filed;
};

export const createOpenItems = (deps: OpenItemsDeps) => {
  /** Every source's rows for `instanceId`, read in the project its records live in; the first refused read. */
  const rows = async (instanceId: string) => {
    const [row] = deps.db.getInstancesByIds([instanceId]);
    if (!row) {
      return problem(404, {
        code: "open-items-session-unknown",
        detail: `No session ${instanceId} on this hub.`,
      });
    }
    const projectId = recordsProjectOf(deps.db, row);
    const plan = await deps.plan(instanceId);
    if (plan instanceof ElysiaStatus) {
      return plan;
    }
    const asks = deps.db.asks.openOf(instanceId).map(askLink);
    const questions = deps.questions(instanceId);
    if (questions instanceof ElysiaStatus) {
      return questions;
    }
    const [tasks, notes] = await Promise.all([
      filedTasks(deps, projectId, instanceId),
      deps.inbox(projectId),
    ]);
    if (tasks instanceof ElysiaStatus) {
      return tasks;
    }
    if (notes instanceof ElysiaStatus) {
      return notes;
    }
    const held: OpenItemRows = {
      projectId,
      asks,
      plan,
      questions,
      tasks,
      notes: notes.filter((note) => note.session === instanceId),
    };
    return held;
  };
  return {
    rows,
    /** The Open items section for `instanceId`, built now from its records: its questions from `page`'s cursor, said whole when detailed. */
    read: async (
      instanceId: string,
      page: QuestionsPage = { cursor: 0, detailed: false }
    ) => {
      const held = await rows(instanceId);
      return held instanceof ElysiaStatus ? held : openItemsSection(held, page);
    },
  };
};
