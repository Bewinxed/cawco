/**
 * A project's tasks (§5.2 of the Projects spec): one file each in the
 * project's hub folder (task-file.ts has the format), an index the hub keeps
 * beside them, and the one way the dashboard and sessions change them.
 *
 * - **Files are the truth.** Every change here reads the file, changes the
 *   lines it owns and writes it back through project-folder.ts, so it is a
 *   commit with an author and a message (`task tsk-12: stage draft → review
 *   (by you)`). A file changed by hand is read as it is.
 * - **The index** (`project_tasks`) holds what a list shows, per file, with
 *   the hash of the content it was read from. A list reads every task file
 *   and re-indexes the ones whose hash moved, so a hand edit shows on the
 *   next read; a write through here re-indexes its own file at once. The hub
 *   catches up every project that has a folder when it starts.
 * - **Tracker.** A project keeps its tasks in CawCo's files (`tracker:
 *   cawco`). GitHub Issues and Linear are named in the setting and refused
 *   until they are built.
 *
 * Changes to one project's tasks are taken one at a time: two to-dos ticked
 * at once both land.
 */
import type { InstanceRow } from "@cawco/core";
import { Elysia, t } from "elysia";
import type { TaskIndexRow } from "./db";
import type { Tracker } from "./db/schema";
import {
  type FolderAuthor,
  FolderRefusal,
  folderPathsInHistory,
  hasProjectFolder,
  listFolder,
  readFolderFile,
  refused,
  turnTaker,
  writeFolderFile,
  YOU,
} from "./project-folder";
import {
  type Edge,
  fileTaskNumber,
  type ParsedTask,
  TaskDoc,
  type TaskFields,
  type Todo,
  taskId,
  taskNumber,
  taskPath,
} from "./task-file";

/**
 * Who moves a task, as `stages.md` names them: you (the dashboard), the
 * project's lead (Caw, §5.3), a session working in the project, an approved
 * action, a routine.
 */
export type Mover = "you" | "lead" | "session" | "action" | "routine";

/** Who is changing a task: what stage moves they may make, and whom the commit is by. */
export interface TaskActor {
  author: FolderAuthor;
  mover: Mover;
}

/** The operator, at the dashboard. */
export const YOU_ACTOR: TaskActor = { mover: "you", author: YOU };

/** A session calling the task tools: it moves stages as a session, and commits under its name. */
export const sessionActor = (row: InstanceRow): TaskActor => ({
  mover: "session",
  author: {
    name:
      row.title?.trim() ||
      row.derivedTitle?.trim() ||
      `session ${row.id.slice(0, 8)}`,
  },
});

/** What the service needs of the hub's database. */
export interface TaskStore {
  readonly drop: (projectId: string, paths: string[]) => void;
  readonly index: (projectId: string) => TaskIndexRow[];
  readonly project: (
    id: string
  ) => { id: string; tracker: Tracker } | undefined;
  readonly projectIds: () => string[];
  readonly put: (rows: TaskIndexRow[]) => void;
  readonly setTracker: (id: string, tracker: Tracker) => void;
}

/** One task as a list shows it: the index's row. */
export interface TaskSummary {
  after: string[];
  id: string;
  labels: string[];
  number: number;
  parent: string | null;
  path: string;
  /** What in the file could not be read, in a sentence; null when all of it could. */
  problem: string | null;
  rank: string | null;
  stage: string;
  title: string;
  todos: { done: number; total: number };
  type: string | null;
  /** When the hub last saw the file's content change, ms epoch. */
  updatedAt: number;
}

export interface TaskList {
  /** Files in tasks/ the hub could not list as tasks, one sentence each. */
  problems: string[];
  tasks: TaskSummary[];
  tracker: Tracker;
}

/** One task, its file read whole. */
export interface TaskView {
  acceptance: string;
  after: string[];
  checks: string[];
  description: string;
  /** Front matter keys the file carries that a task file does not know; kept as written. */
  extra: string[];
  foundIn: string | null;
  /** sha256 hex of the file as read. */
  hash: string;
  id: string;
  labels: string[];
  number: number;
  outputs: string[];
  parent: string | null;
  path: string;
  problems: string[];
  rank: string | null;
  related: string[];
  /** The body's other `## ` sections, as written. */
  sections: { heading: string; text: string }[];
  stage: string;
  title: string;
  todos: Todo[];
  type: string | null;
}

/** A new task. Edges name tasks as `tsk-12` (or `12`). */
export interface TaskDraft {
  acceptance?: string;
  after?: string[];
  checks?: string[];
  description?: string;
  foundIn?: string;
  labels?: string[];
  outputs?: string[];
  parent?: string;
  rank?: string;
  related?: string[];
  stage?: string;
  title: string;
  /** Top-level to-dos, one line each. */
  todos?: string[];
  type?: string;
}

/** A change to a task's fields and owned sections; what is left out stays. Null clears. */
export interface TaskPatch {
  acceptance?: string;
  checks?: string[];
  description?: string;
  labels?: string[];
  outputs?: string[];
  rank?: string | null;
  title?: string;
  type?: string | null;
}

/** To-do changes made together, in one commit. A to-do is named by id (`td-3`) or position (`2.1`). */
export interface TodoChanges {
  add?: { text: string; under?: string }[];
  edit?: { todo: string; text: string }[];
  tick?: string[];
  untick?: string[];
}

const TITLE_LIMIT = 200;
const TODO_LIMIT = 500;
const TEXT_LIMIT = 20_000;
const ITEM_LIMIT = 200;
const LIST_LIMIT = 50;
const STAGE_NAME = /^[a-z][a-z0-9_-]{0,39}$/;
const TYPE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SECTION_LINE = /^##\s/m;
const TODO_MARKER_START = /^\[td-\d+\]/;
const LINE_BREAK = /[\r\n]/;

/** Where a task starts when nothing names its stage, until stages.md says otherwise. */
const FIRST_STAGE = "ready";

const refuse = (code: 400 | 403 | 404 | 409 | 422, message: string): never => {
  throw new FolderRefusal(code, message);
};

const hashOf = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

// --- what a caller may write ------------------------------------------------------

const oneLine = (what: string, text: string, limit: number): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    refuse(400, `The ${what} is empty; write a few words.`);
  }
  if (LINE_BREAK.test(trimmed)) {
    refuse(400, `The ${what} is one line; take out the line break.`);
  }
  if (trimmed.length > limit) {
    refuse(
      400,
      `The ${what} is ${trimmed.length} characters long; it stops at ${limit}.`
    );
  }
  return trimmed;
};

/** A description or acceptance criteria: free text that must not open a section of its own. */
const block = (what: string, text: string): string => {
  if (text.length > TEXT_LIMIT) {
    refuse(
      400,
      `The ${what} is ${text.length} characters long; it stops at ${TEXT_LIMIT}.`
    );
  }
  if (SECTION_LINE.test(text)) {
    refuse(
      400,
      `The ${what} holds a "## " heading, which would start a section of its own in the task file; use "### " inside it.`
    );
  }
  return text.trim();
};

const todoText = (text: string): string => {
  const line = oneLine("to-do", text, TODO_LIMIT);
  if (TODO_MARKER_START.test(line)) {
    refuse(
      400,
      "A to-do's text cannot start with an id marker like [td-3]; the hub numbers to-dos itself."
    );
  }
  return line;
};

const items = (what: string, list: string[]): string[] => {
  if (list.length > LIST_LIMIT) {
    refuse(
      400,
      `${what} holds ${list.length} items; it stops at ${LIST_LIMIT}.`
    );
  }
  return [
    ...new Set(list.map((item) => oneLine(`${what} item`, item, ITEM_LIMIT))),
  ];
};

const typeName = (type: string): string => {
  const name = type.trim();
  if (!TYPE_NAME.test(name)) {
    refuse(
      400,
      `“${type}” is not a delegate type name: letters, digits, ".", "_" and "-", up to 64.`
    );
  }
  return name;
};

const stageName = (stage: string): string => {
  const name = stage.trim();
  if (!STAGE_NAME.test(name)) {
    refuse(
      400,
      `“${stage}” is not a stage name: lowercase letters, digits, "_" and "-", starting with a letter.`
    );
  }
  return name;
};

// --- the service --------------------------------------------------------------

const summaryOf = (row: TaskIndexRow): TaskSummary => ({
  id: row.id,
  number: row.number,
  path: row.path,
  title: row.title,
  stage: row.stage,
  type: row.type,
  after: row.after,
  parent: row.parent,
  rank: row.rank,
  labels: row.labels,
  todos: { done: row.todosDone, total: row.todosTotal },
  updatedAt: row.updatedAt.getTime(),
  problem: row.problem,
});

const viewOf = (
  path: string,
  number: number,
  parsed: ParsedTask,
  title: string,
  hash: string
): TaskView => ({
  id: taskId(number),
  number,
  path,
  title,
  stage: parsed.fields.stage ?? "",
  type: parsed.fields.type,
  after: parsed.fields.after,
  parent: parsed.fields.parent,
  related: parsed.fields.related,
  foundIn: parsed.fields.foundIn,
  checks: parsed.fields.checks,
  outputs: parsed.fields.outputs,
  rank: parsed.fields.rank,
  labels: parsed.fields.labels,
  description: parsed.description,
  acceptance: parsed.acceptance,
  todos: parsed.todos,
  sections: parsed.sections,
  extra: parsed.extra,
  problems: parsed.problems,
  hash,
});

/** A list's sort: ranked tasks by rank, then the rest by number. */
const byRank = (a: TaskSummary, b: TaskSummary): number => {
  if (a.rank !== null && b.rank !== null && a.rank !== b.rank) {
    return a.rank < b.rank ? -1 : 1;
  }
  if ((a.rank === null) !== (b.rank === null)) {
    return a.rank === null ? 1 : -1;
  }
  return a.number - b.number || (a.path < b.path ? -1 : 1);
};

/** What an edge's commit message says it did. */
const EDGE_PHRASE: Record<Edge, string> = {
  after: "after",
  parent: "parent",
  related: "related to",
  found_in: "found in",
};

/** Sets or clears a one-task edge (`parent`, `found_in`). */
const linkOne = (
  doc: TaskDoc,
  edge: "parent" | "found_in",
  target: string,
  remove: boolean | undefined
): string => {
  const phrase = `${EDGE_PHRASE[edge]} ${target}`;
  if (!remove) {
    doc.setField(edge, target);
    return phrase;
  }
  const { fields } = doc.read();
  if ((edge === "parent" ? fields.parent : fields.foundIn) === target) {
    doc.setField(edge, null);
  }
  return `no longer ${phrase}`;
};

/** Adds or takes out one task of a list edge (`after`, `related`). */
const linkMany = (
  doc: TaskDoc,
  edge: "after" | "related",
  target: string,
  remove: boolean | undefined
): string => {
  const phrase = `${EDGE_PHRASE[edge]} ${target}`;
  const list = doc.read().fields[edge];
  doc.setField(
    edge,
    remove
      ? list.filter((each) => each !== target)
      : [...new Set([...list, target])]
  );
  return remove ? `no longer ${phrase}` : phrase;
};

/** Applies a patch to a task file; answers what it changed, for the commit message. */
const applyPatch = (doc: TaskDoc, patch: TaskPatch): string => {
  const changed: string[] = [];
  const set = (name: string, apply: () => void) => {
    apply();
    changed.push(name);
  };
  const { title, description, acceptance, type, rank } = patch;
  if (title !== undefined) {
    set("title", () => doc.setTitle(oneLine("title", title, TITLE_LIMIT)));
  }
  if (description !== undefined) {
    set("description", () =>
      doc.setDescription(block("description", description))
    );
  }
  if (acceptance !== undefined) {
    set("acceptance criteria", () =>
      doc.setAcceptance(block("acceptance criteria", acceptance))
    );
  }
  if (type !== undefined) {
    set("type", () => doc.setField("type", type ? typeName(type) : null));
  }
  if (rank !== undefined) {
    set("rank", () =>
      doc.setField("rank", rank ? oneLine("rank", rank, 64) : null)
    );
  }
  for (const field of ["checks", "outputs", "labels"] as const) {
    const list = patch[field];
    if (list !== undefined) {
      set(field, () => doc.setField(field, items(field, list)));
    }
  }
  return `update ${changed.join(", ") || "nothing"}`;
};

/** A to-do change the file could not make, as the caller's refusal. */
const found = (problem: string | undefined): void => {
  if (problem !== undefined) {
    refuse(404, problem);
  }
};

const mark = (
  doc: TaskDoc,
  refs: string[] | undefined,
  done: boolean
): string | undefined => {
  if (!refs?.length) {
    return;
  }
  for (const ref of refs) {
    found(doc.tickTodo(ref, done));
  }
  return `${done ? "tick" : "untick"} ${refs.join(", ")}`;
};

/** Applies to-do changes: rewords, ticks, unticks, then adds (adds never renumber a position). */
const applyTodos = (doc: TaskDoc, changes: TodoChanges): string => {
  const said: string[] = [];
  for (const { todo, text } of changes.edit ?? []) {
    found(doc.editTodo(todo, todoText(text)));
    said.push(`reword ${todo}`);
  }
  for (const done of [
    mark(doc, changes.tick, true),
    mark(doc, changes.untick, false),
  ]) {
    if (done) {
      said.push(done);
    }
  }
  const added: string[] = [];
  for (const { text, under } of changes.add ?? []) {
    const done = doc.addTodo(todoText(text), under);
    if (typeof done === "string") {
      refuse(404, done);
    } else {
      added.push(done.id);
    }
  }
  if (added.length > 0) {
    said.push(`add ${added.join(", ")}`);
  }
  if (said.length === 0) {
    refuse(400, "Name a to-do to tick, untick, add or reword.");
  }
  return said.join("; ");
};

/** Commit messages say who: `(by you)`, `(by Fix tray chip)`. */
const byWhom = (actor: TaskActor): string => `(by ${actor.author.name})`;

export const createTasks = (store: TaskStore) => {
  /** One change to a project's tasks at a time, around the folder's own commits. */
  const inTurn = turnTaker();
  /** The highest task number each project has handed out, once read from its history. */
  const issued = new Map<string, number>();

  const known = (projectId: string): Tracker => {
    const project = store.project(projectId);
    if (!project) {
      return refuse(404, `The hub keeps no project ${projectId}.`);
    }
    return project.tracker;
  };

  /** Refuses a change while the project's tasks live somewhere other than its files. */
  const writable = (projectId: string): void => {
    const tracker = known(projectId);
    if (tracker !== "cawco") {
      refuse(
        409,
        `This project's tracker is ${tracker}, which the hub cannot write yet; set it back to cawco to keep tasks in the project folder.`
      );
    }
  };

  const indexRow = (
    projectId: string,
    path: string,
    number: number,
    content: string,
    hash: string
  ): TaskIndexRow => {
    const doc = new TaskDoc(path, content);
    const parsed = doc.read();
    return {
      projectId,
      path,
      id: taskId(number),
      number,
      title: parsed.title ?? doc.title(),
      stage: parsed.fields.stage ?? "",
      type: parsed.fields.type,
      after: parsed.fields.after,
      parent: parsed.fields.parent,
      rank: parsed.fields.rank,
      labels: parsed.fields.labels,
      todosDone: parsed.todos.filter((todo) => todo.done).length,
      todosTotal: parsed.todos.length,
      problem: parsed.problems.join(" ") || null,
      hash,
      updatedAt: new Date(),
    };
  };

  /**
   * Reads every task file and re-indexes the ones whose content changed since
   * the index last saw them; forgets rows whose files are gone. Answers the
   * index and what in tasks/ could not be listed.
   */
  const sync = async (
    projectId: string
  ): Promise<{ problems: string[]; rows: TaskIndexRow[] }> => {
    const problems: string[] = [];
    const listing = await listFolder(projectId, "tasks").catch(
      (error: unknown) => {
        if (error instanceof FolderRefusal && error.status === 404) {
          return { entries: [], truncated: false, path: "tasks" };
        }
        throw error;
      }
    );
    if (listing.truncated) {
      problems.push(
        "tasks/ holds more files than one listing reads; the ones past the cap are not listed."
      );
    }
    const indexed = new Map(
      store.index(projectId).map((row) => [row.path, row])
    );
    const files: { path: string; number: number }[] = [];
    for (const entry of listing.entries) {
      if (entry.kind !== "file" || !entry.path.endsWith(".md")) {
        continue;
      }
      const number = fileTaskNumber(entry.path);
      if (number === undefined) {
        problems.push(
          `${entry.path} is not named like a task (tsk-<number>-<slug>.md), so it is not listed.`
        );
      } else {
        files.push({ path: entry.path, number });
      }
    }
    const read = await Promise.all(
      files.map(async ({ path, number }) => {
        try {
          const { content } = await readFolderFile(projectId, path);
          const hash = hashOf(content);
          return indexed.get(path)?.hash === hash
            ? undefined
            : indexRow(projectId, path, number, content, hash);
        } catch (error) {
          if (error instanceof FolderRefusal) {
            problems.push(error.message);
            return;
          }
          throw error;
        }
      })
    );
    store.put(read.filter((row): row is TaskIndexRow => row !== undefined));
    const present = new Set(files.map((file) => file.path));
    store.drop(
      projectId,
      [...indexed.keys()].filter((path) => !present.has(path))
    );
    const rows = store.index(projectId);
    const claimed = new Map<string, string[]>();
    for (const row of rows) {
      claimed.set(row.id, [...(claimed.get(row.id) ?? []), row.path]);
    }
    for (const [id, paths] of claimed) {
      if (paths.length > 1) {
        problems.push(
          `${id} is claimed by ${paths.length} files (${paths.join(", ")}); rename all but one.`
        );
      }
    }
    return { rows, problems };
  };

  /**
   * The file a reference names, catching up the index when it does not know
   * it yet. Two files claiming one id read as the first; a change to it is
   * refused until one is renamed.
   */
  const locate = async (
    projectId: string,
    ref: string,
    forChange = false
  ): Promise<{ path: string; number: number }> => {
    const number = taskNumber(ref);
    if (number === undefined) {
      return refuse(
        400,
        `“${ref}” is not a task id; tasks are named like tsk-12.`
      );
    }
    const find = (rows: TaskIndexRow[]) =>
      rows.filter((row) => row.number === number);
    let claims = find(store.index(projectId));
    if (claims.length === 0) {
      claims = find((await sync(projectId)).rows);
    }
    const [first] = claims;
    if (!first) {
      return refuse(404, `The project has no task ${taskId(number)}.`);
    }
    if (forChange && claims.length > 1) {
      refuse(
        409,
        `${taskId(number)} is claimed by ${claims.length} files (${claims.map((row) => row.path).join(", ")}); rename all but one before changing it.`
      );
    }
    return { path: first.path, number };
  };

  /** Every task id the project's index knows, for edge checks. */
  const ids = async (projectId: string): Promise<Set<string>> =>
    new Set((await sync(projectId)).rows.map((row) => row.id));

  /** Edges as `tsk-…`, each one a task the project has. */
  const targets = async (
    projectId: string,
    edge: string,
    refs: string[],
    self?: string
  ): Promise<string[]> => {
    if (refs.length === 0) {
      return [];
    }
    const have = await ids(projectId);
    return [
      ...new Set(
        refs.map((ref) => {
          const number = taskNumber(ref);
          if (number === undefined) {
            return refuse(
              400,
              `${edge}: “${ref}” is not a task id; tasks are named like tsk-12.`
            );
          }
          const id = taskId(number);
          if (id === self) {
            return refuse(400, `${self} cannot be ${edge} itself.`);
          }
          if (!have.has(id)) {
            return refuse(404, `${edge}: the project has no task ${id}.`);
          }
          return id;
        })
      ),
    ];
  };

  const single = async (
    projectId: string,
    edge: string,
    ref: string | undefined
  ): Promise<string | null> =>
    ref ? ((await targets(projectId, edge, [ref]))[0] ?? null) : null;

  /** One past the highest number the folder ever held, or this process handed out. */
  const nextNumber = async (projectId: string): Promise<number> => {
    let highest = issued.get(projectId);
    if (highest === undefined) {
      const history = await folderPathsInHistory(projectId, "tasks");
      highest = Math.max(
        0,
        ...history.map((path) => fileTaskNumber(path) ?? 0)
      );
    }
    const next =
      Math.max(highest, ...store.index(projectId).map((row) => row.number)) + 1;
    issued.set(projectId, next);
    return next;
  };

  const view = (path: string, number: number, content: string): TaskView => {
    const doc = new TaskDoc(path, content);
    return viewOf(path, number, doc.read(), doc.title(), hashOf(content));
  };

  /** Writes a task file through the folder (one commit) and re-indexes it. */
  const save = async (
    projectId: string,
    path: string,
    number: number,
    content: string,
    actor: TaskActor,
    message: string
  ): Promise<TaskView> => {
    await writeFolderFile(projectId, path, content, {
      author: actor.author,
      message,
    });
    store.put([indexRow(projectId, path, number, content, hashOf(content))]);
    return view(path, number, content);
  };

  /**
   * Reads a task's file, lets `apply` change it, and writes it back when it
   * changed. `apply` answers what it did, for the commit message.
   */
  const change = (
    projectId: string,
    ref: string,
    actor: TaskActor,
    apply: (doc: TaskDoc, id: string) => Promise<string> | string
  ): Promise<TaskView> =>
    inTurn(projectId, async () => {
      writable(projectId);
      const { path, number } = await locate(projectId, ref, true);
      const id = taskId(number);
      const { content } = await readFolderFile(projectId, path);
      const doc = new TaskDoc(path, content);
      const did = await apply(doc, id);
      const next = doc.toString();
      if (next === content) {
        return view(path, number, content);
      }
      return await save(
        projectId,
        path,
        number,
        next,
        actor,
        `task ${id}: ${did} ${byWhom(actor)}`
      );
    });

  /** Would `id` waiting on `target` (or having it as parent) close a loop? */
  const loops = (
    rows: TaskIndexRow[],
    id: string,
    target: string,
    next: (row: TaskIndexRow) => string[]
  ): boolean => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const seen = new Set<string>();
    const stack = [target];
    while (stack.length > 0) {
      const at = stack.pop() as string;
      if (at === id) {
        return true;
      }
      if (seen.has(at)) {
        continue;
      }
      seen.add(at);
      const row = byId.get(at);
      if (row) {
        stack.push(...next(row));
      }
    }
    return false;
  };

  return {
    /** The project's tasks from the index, caught up with the files first. */
    async list(projectId: string, filter: { stage?: string } = {}) {
      const tracker = known(projectId);
      const { rows, problems } = await sync(projectId);
      const tasks = rows
        .map(summaryOf)
        .filter((task) => !filter.stage || task.stage === filter.stage)
        .sort(byRank);
      return { tracker, tasks, problems } satisfies TaskList;
    },

    /** One task, its file read and parsed; the index catches up if the file moved. */
    async get(projectId: string, ref: string): Promise<TaskView> {
      known(projectId);
      const { path, number } = await locate(projectId, ref);
      const { content } = await readFolderFile(projectId, path);
      const hash = hashOf(content);
      const row = store.index(projectId).find((each) => each.path === path);
      if (row?.hash !== hash) {
        store.put([indexRow(projectId, path, number, content, hash)]);
      }
      return view(path, number, content);
    },

    create(
      projectId: string,
      draft: TaskDraft,
      actor: TaskActor
    ): Promise<TaskView> {
      return inTurn(projectId, async () => {
        writable(projectId);
        const title = oneLine("title", draft.title, TITLE_LIMIT);
        const fields: Partial<TaskFields> = {
          stage: stageName(draft.stage ?? FIRST_STAGE),
          type: draft.type ? typeName(draft.type) : null,
          after: await targets(projectId, "after", draft.after ?? []),
          parent: await single(projectId, "parent", draft.parent),
          related: await targets(projectId, "related", draft.related ?? []),
          foundIn: await single(projectId, "found_in", draft.foundIn),
          checks: items("checks", draft.checks ?? []),
          outputs: items("outputs", draft.outputs ?? []),
          rank: draft.rank ? oneLine("rank", draft.rank, 64) : null,
          labels: items("labels", draft.labels ?? []),
        };
        const description = block("description", draft.description ?? "");
        const acceptance = block("acceptance criteria", draft.acceptance ?? "");
        const todos = (draft.todos ?? []).map(todoText);
        const number = await nextNumber(projectId);
        const path = taskPath(number, title);
        const doc = TaskDoc.create(path, {
          title,
          fields,
          description,
          acceptance,
          todos,
        });
        return await save(
          projectId,
          path,
          number,
          doc.toString(),
          actor,
          `task ${taskId(number)}: create “${title}” in ${fields.stage} ${byWhom(actor)}`
        );
      });
    },

    /** Fields and owned sections; what the patch leaves out stays as written. */
    update(
      projectId: string,
      ref: string,
      patch: TaskPatch,
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, (doc) => applyPatch(doc, patch));
    },

    /** Moves a task to another stage. */
    move(
      projectId: string,
      ref: string,
      stage: string,
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, (doc) => {
        const to = stageName(stage);
        const from = doc.read().fields.stage ?? "";
        doc.setField("stage", to);
        return `stage ${from || "(none)"} → ${to}`;
      });
    },

    /** Adds or removes one edge from a task to another. */
    link(
      projectId: string,
      ref: string,
      request: { edge: Edge; to: string; remove?: boolean },
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, async (doc, id) => {
        const { edge, remove } = request;
        const number = taskNumber(request.to);
        if (number === undefined) {
          return refuse(
            400,
            `“${request.to}” is not a task id; tasks are named like tsk-12.`
          );
        }
        const target = remove
          ? taskId(number)
          : (await targets(projectId, edge, [request.to], id))[0];
        const rows = store.index(projectId);
        if (edge === "parent" || edge === "found_in") {
          if (
            !remove &&
            edge === "parent" &&
            loops(rows, id, target, (row) => (row.parent ? [row.parent] : []))
          ) {
            refuse(
              409,
              `${target} is already under ${id}, so ${id} cannot be its child.`
            );
          }
          return linkOne(doc, edge, target, remove);
        }
        if (
          !remove &&
          edge === "after" &&
          loops(rows, id, target, (row) => row.after)
        ) {
          refuse(
            409,
            `${target} already waits for ${id}, so ${id} waiting for it would never start.`
          );
        }
        return linkMany(doc, edge, target, remove);
      });
    },

    /** Ticks, unticks, adds and rewords to-dos, all in one commit. */
    todos(
      projectId: string,
      ref: string,
      changes: TodoChanges,
      actor: TaskActor
    ): Promise<TaskView> {
      return change(projectId, ref, actor, (doc) => applyTodos(doc, changes));
    },

    /** Sets where the project's tasks live; only CawCo's files are built. */
    setTracker(projectId: string, tracker: Tracker): { tracker: Tracker } {
      known(projectId);
      if (tracker !== "cawco") {
        refuse(
          409,
          `${tracker === "github" ? "GitHub Issues" : "Linear"} as a tracker is not built yet; this project keeps its tasks in CawCo's files (tracker: cawco).`
        );
      }
      store.setTracker(projectId, tracker);
      return { tracker };
    },

    /** Catches up the index of every project that has a folder: what the hub does as it starts. */
    async syncAll(): Promise<void> {
      for (const projectId of store.projectIds()) {
        // biome-ignore lint/performance/noAwaitInLoops: one project at a time keeps a start from reading every folder at once
        if (await hasProjectFolder(projectId)) {
          try {
            await sync(projectId);
          } catch (error) {
            console.warn(
              `[tasks] project ${projectId}'s task index was not caught up: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      }
    },
  };
};

export type Tasks = ReturnType<typeof createTasks>;

// --- routes ----------------------------------------------------------------

const EDGE = t.Union([
  t.Literal("after"),
  t.Literal("parent"),
  t.Literal("related"),
  t.Literal("found_in"),
]);
const TRACKER = t.Union([
  t.Literal("cawco"),
  t.Literal("github"),
  t.Literal("linear"),
]);

/**
 * The dashboard's routes for a project's tasks, under
 * `/api/projects/:id/tasks`, and its tracker setting. Changes from here are
 * the operator's ("you").
 */
export const taskRoutes = (tasks: Tasks) =>
  new Elysia()
    .get(
      "/api/projects/:id/tasks",
      { query: t.Object({ stage: t.Optional(t.String()) }) },
      async ({ params, query }) => {
        try {
          return await tasks.list(params.id, { stage: query.stage });
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks",
      {
        body: t.Object({
          title: t.String(),
          stage: t.Optional(t.String()),
          type: t.Optional(t.String()),
          after: t.Optional(t.Array(t.String())),
          parent: t.Optional(t.String()),
          related: t.Optional(t.Array(t.String())),
          foundIn: t.Optional(t.String()),
          checks: t.Optional(t.Array(t.String())),
          outputs: t.Optional(t.Array(t.String())),
          rank: t.Optional(t.String()),
          labels: t.Optional(t.Array(t.String())),
          description: t.Optional(t.String()),
          acceptance: t.Optional(t.String()),
          todos: t.Optional(t.Array(t.String())),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.create(params.id, body, YOU_ACTOR);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .get("/api/projects/:id/tasks/:taskId", async ({ params }) => {
      try {
        return await tasks.get(params.id, params.taskId);
      } catch (error) {
        return refused(error);
      }
    })
    .patch(
      "/api/projects/:id/tasks/:taskId",
      {
        body: t.Object({
          title: t.Optional(t.String()),
          description: t.Optional(t.String()),
          acceptance: t.Optional(t.String()),
          type: t.Optional(t.Nullable(t.String())),
          rank: t.Optional(t.Nullable(t.String())),
          checks: t.Optional(t.Array(t.String())),
          outputs: t.Optional(t.Array(t.String())),
          labels: t.Optional(t.Array(t.String())),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.update(params.id, params.taskId, body, YOU_ACTOR);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/stage",
      { body: t.Object({ stage: t.String() }) },
      async ({ params, body }) => {
        try {
          return await tasks.move(
            params.id,
            params.taskId,
            body.stage,
            YOU_ACTOR
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/links",
      {
        body: t.Object({
          edge: EDGE,
          to: t.String(),
          remove: t.Optional(t.Boolean()),
        }),
      },
      async ({ params, body }) => {
        try {
          return await tasks.link(params.id, params.taskId, body, YOU_ACTOR);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/projects/:id/tasks/:taskId/todos",
      { body: t.Object({ text: t.String(), under: t.Optional(t.String()) }) },
      async ({ params, body }) => {
        try {
          return await tasks.todos(
            params.id,
            params.taskId,
            { add: [body] },
            YOU_ACTOR
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .patch(
      "/api/projects/:id/tasks/:taskId/todos/:todo",
      {
        body: t.Object({
          done: t.Optional(t.Boolean()),
          text: t.Optional(t.String()),
        }),
      },
      async ({ params, body }) => {
        try {
          let changes: TodoChanges = {};
          if (body.done !== undefined) {
            changes = body.done
              ? { tick: [params.todo] }
              : { untick: [params.todo] };
          }
          if (body.text !== undefined) {
            changes.edit = [{ todo: params.todo, text: body.text }];
          }
          return await tasks.todos(
            params.id,
            params.taskId,
            changes,
            YOU_ACTOR
          );
        } catch (error) {
          return refused(error);
        }
      }
    )
    .put(
      "/api/projects/:id/tracker",
      { body: t.Object({ tracker: TRACKER }) },
      ({ params, body }) => {
        try {
          return tasks.setTracker(params.id, body.tracker);
        } catch (error) {
          return refused(error);
        }
      }
    );
