/**
 * A session's open items: its open questions, promises, decisions with their
 * reasons, and the files to read again, kept in records rather than prose,
 * so that no summary decides what survives a compaction.
 *
 * - **Filing** ({@link filingPrompt}): before the hub compacts a session
 *   (after a move at its account's limit) and before a person's Continue
 *   opens a new session, the session takes one turn whose only job is to
 *   file what is open into its records. On a real 13-hour chat, native
 *   compaction alone answered 16% of probes, CawCo's summary 35%, native
 *   compaction with the open items filed first 47%, and with only the
 *   records that already existed 17% (the continuation evaluation,
 *   2026-10-16): the filing is what carries.
 * - **Reading** ({@link createOpenItems}): code builds the "Open items"
 *   section from those rows, word for word: the session's plan (its open
 *   steps and its spec), its task's open to-dos, the open tasks it filed, its
 *   decision pages not yet decided with their cards, and its notes still in
 *   the project's memory inbox. Claude Code adds it to every compacted
 *   context through the fleet's SessionStart hook on the `compact` source
 *   (`cawco tool open_items`); a person's Continue opens the new session on
 *   it.
 */
import type { InstanceRow, PlanStep, SessionPlan, TaskTodo } from "@cawco/core";
import type { DecisionCard, DecisionPageRead } from "@cawco/core/decisions";
import type { DbShape } from "./db";
import type { Decisions } from "./decisions";
import type { Note } from "./memory";
import type { Tasks } from "./tasks";

/**
 * The filing turn's message: the hub's word to the session, standing alone.
 * It names every record a session has, by the tool that writes it, and asks
 * for nothing else. `then`: what follows the turn, a compaction of this
 * conversation, or a new session continuing it.
 */
export const filingPrompt = (then: "compacted" | "continued"): string =>
  [
    `Before this conversation is ${then === "compacted" ? "compacted" : "continued in a new session"}, file everything still open into your records, so it outlives the ${then === "compacted" ? "compaction" : "move"}: the hub lists those records word for word ${then === "compacted" ? "after it" : "in the new session's opening"}. This turn does only that.`,
    "",
    "- Every open step, every promise made, and every question still waiting on an answer: your plan, `todo_write` with `steps`, one line each, pending or in_progress (where CawCo's to-dos are off for you, your harness's own task list).",
    "- Every decision taken and its reason, every constraint the person set (in their words), every approach ruled out and why, and the files, paths, commands, ids and links to read again: your spec, `todo_write` with `spec`, the whole document.",
    "- In a project: work that must outlive this conversation, `task_create`; your task's to-dos, `todo_write` with `task`; a lasting fact for the project's later sessions (a convention, a decision), `memory_note`.",
    "",
    "Write again only what changed or is missing. Then end your turn.",
  ].join("\n");

/**
 * The focus the hub's `/compact` carries: what Claude Code's summary keeps.
 * The open items themselves come back from the records after it.
 */
export const COMPACT_FOCUS =
  "Keep, word for word where short: what the person asked, decided, ruled out or set as a constraint, with their reasons; what was tried and why it was set aside; where the work stands; the names, numbers, paths, commands, ids and links in play. Open questions, promises and next steps are listed again after this from the session's records.";

/** The heading every Open items section opens with. */
export const OPEN_ITEMS_HEADING =
  "## Open items (this session's records, word for word)";

/** What the reader gathered: each source's rows, as stored. */
export interface OpenItemRows {
  /** Its decision pages not decided yet, each with its cards. */
  decisions: { cards: DecisionCard[]; read: DecisionPageRead }[];
  /** Its notes still in its project's memory inbox. */
  notes: Note[];
  /** Its plan: steps, spec, and an attempt's task with its to-dos. */
  plan: SessionPlan | null;
  /** The open tasks it filed, each with its description and open to-dos. */
  tasks: {
    description: string;
    id: string;
    stage: string;
    title: string;
    todos: TaskTodo[];
  }[];
}

const stepLine = (step: PlanStep): string =>
  `${"  ".repeat(step.depth)}- [${step.status}] ${step.content}`;

const todoLine = (todo: TaskTodo): string =>
  `${"  ".repeat(todo.depth)}- ${todo.id ? `${todo.id} ` : ""}(${todo.path}) ${todo.text}`;

/** Text under a list line, indented so it stays that line's. */
const under = (text: string): string[] =>
  text
    .trim()
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""));

/**
 * The Open items section, built from `rows`: each source under its own
 * heading, its rows as stored; a source with nothing open says nothing. With
 * nothing open anywhere it says so, so a reader knows the records were read.
 */
export function openItemsSection(rows: OpenItemRows): string {
  const parts: string[] = [];
  const steps = (rows.plan?.steps ?? []).filter(
    (step) => step.status !== "completed"
  );
  if (steps.length > 0) {
    parts.push("### Your plan's open steps", ...steps.map(stepLine));
  }
  if (rows.plan?.spec?.markdown.trim()) {
    parts.push(
      `### Your spec (written ${rows.plan.spec.at})`,
      rows.plan.spec.markdown.trim()
    );
  }
  const todos = (rows.plan?.todos ?? []).filter((todo) => !todo.done);
  if (rows.plan?.taskId && todos.length > 0) {
    parts.push(
      `### Your task ${rows.plan.taskId}'s open to-dos`,
      ...todos.map(todoLine)
    );
  }
  if (rows.tasks.length > 0) {
    parts.push(
      "### Open tasks you filed",
      ...rows.tasks.flatMap((task) => [
        `- ${task.id} (${task.stage}): ${task.title}`,
        ...(task.description.trim() ? under(task.description) : []),
        ...task.todos
          .filter((todo) => !todo.done)
          .map((todo) => `  ${todoLine(todo)}`),
      ])
    );
  }
  if (rows.decisions.length > 0) {
    parts.push(
      "### Your decision pages the person has not decided",
      ...rows.decisions.flatMap(({ read, cards }) => [
        `- ${read.name} (${read.state}): ${read.title}`,
        ...cards.flatMap((card) => [
          `  - ${card.question}`,
          ...(card.why.trim() ? [`    Why: ${card.why.trim()}`] : []),
        ]),
      ])
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
          "Nothing open is filed: no open plan steps, spec, to-dos, tasks, decision pages or notes.",
        ]),
  ].join("\n");
}

export interface OpenItemsDeps {
  db: Pick<DbShape, "getInstancesByIds" | "workItem">;
  decisions: Pick<Decisions, "undecidedBy">;
  /** A project's memory inbox, oldest first (memory.ts `inboxNotes`). */
  inbox: (projectId: string) => Promise<Note[]>;
  /** A session's plan as its followers hold it (plans.ts `read`). */
  plan: (instanceId: string) => Promise<SessionPlan>;
  tasks: Pick<Tasks, "get" | "list">;
}

/** The project a session's records live in: its own, else its work item's. */
const projectOf = (deps: OpenItemsDeps, row: InstanceRow): string | null =>
  row.projectId ??
  (row.workItemId ? deps.db.workItem(row.workItemId)?.projectId : null) ??
  null;

/** The open tasks `instanceId` filed in `projectId`, each read whole. */
const filedTasks = async (
  deps: OpenItemsDeps,
  projectId: string,
  instanceId: string
): Promise<OpenItemRows["tasks"]> => {
  const list = await deps.tasks.list(projectId);
  const open = list.tasks.filter(
    (task) =>
      task.createdBy?.id === instanceId &&
      task.kind !== "done" &&
      task.kind !== "dropped" &&
      task.archivedAt === null
  );
  return await Promise.all(
    open.map(async (task) => {
      const read = await deps.tasks.get(projectId, task.id);
      return {
        id: read.id,
        stage: read.stage,
        title: read.title,
        description: read.description,
        todos: read.todos,
      };
    })
  );
};

export const createOpenItems = (deps: OpenItemsDeps) => {
  /** Every source's rows for `instanceId`; a session in no project has its plan alone. */
  const rows = async (instanceId: string): Promise<OpenItemRows> => {
    const [row] = deps.db.getInstancesByIds([instanceId]);
    if (!row) {
      throw new Error(`No session ${instanceId} on this hub.`);
    }
    const projectId = projectOf(deps, row);
    const plan = await deps.plan(instanceId);
    if (!projectId) {
      return { plan, tasks: [], decisions: [], notes: [] };
    }
    const [tasks, decisions, notes] = await Promise.all([
      filedTasks(deps, projectId, instanceId),
      deps.decisions.undecidedBy(projectId, instanceId),
      deps.inbox(projectId),
    ]);
    return {
      plan,
      tasks,
      decisions,
      notes: notes.filter((note) => note.session === instanceId),
    };
  };
  return {
    rows,
    /** The Open items section for `instanceId`, built now from its records. */
    read: async (instanceId: string): Promise<string> =>
      openItemsSection(await rows(instanceId)),
  };
};

export type OpenItems = ReturnType<typeof createOpenItems>;
