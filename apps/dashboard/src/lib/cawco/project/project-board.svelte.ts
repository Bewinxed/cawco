/**
 * A project page's data: its tasks and stages as the hub answered them, from
 * the load and each re-read, its archived tasks, its views and the dated
 * tasks the Calendar places, and the writes that change them (a move, a
 * drop, a new task, a bulk change), each put into the list until the list
 * is read again. ProjectPage reads it and draws.
 */
import { detach } from "@cawco/core/detach";
import { todoProgress } from "@cawco/core/plan";
import type { ProjectView } from "@cawco/core/views";
import {
  archiveTask,
  createTask,
  listArchived,
  listTasks,
  moveTask,
  readStages,
  type StagesView,
  type TaskList,
  type TaskSummary,
  type TaskView,
  updateTask,
} from "#lib/cawco/project-tasks.js";
import type { TaskFind } from "#lib/cawco/tasks/task-find.svelte.js";
import { clearPicks, selection } from "#lib/cawco/tasks/task-select.svelte.js";
import { taskShare } from "#lib/cawco/tasks/task-share.js";
import type { ViewTaskRow } from "#lib/cawco/views/openui/context.js";
import { discardView, keepView, viewsOf } from "#lib/cawco/views-api.js";
import { hub } from "#lib/platform/hub.js";
import {
  failureSentence,
  type HubRead,
  hubData,
  failureWords as message,
  refusedOrUnreached,
} from "#lib/platform/hub-read.js";
import { departShared } from "#lib/platform/motion/share.svelte.js";
import { newestRead } from "#lib/platform/newest-read.js";
import type { ProjectPageData } from "./project-page-data";

/** A bulk change in flight: what it does, how far it is, where it stopped. */
export interface BulkRun {
  done: number;
  /** The task the hub refused, and its words; the rest stay picked. */
  failed: { id: string; text: string } | null;
  total: number;
  /** "Moving", "Labelling", "Archiving", "Dropping". */
  verb: string;
}

/** A refused read, as a sentence with its status for support. */
const refusal = (read: HubRead<unknown>): string | null =>
  read.ok ? null : failureSentence(read);

export class ProjectBoard {
  // --- the tasks: what the hub answered, from the load and each re-read ------

  list = $state<TaskList | null>(null);
  listProblem = $state<string | null>(null);
  stages = $state<StagesView | null>(null);
  stagesProblem = $state<string | null>(null);
  /** Moves the hub has not answered yet: the card already stands in its new column. */
  moving = $state<Record<string, string>>({});

  readonly #kindByStage = $derived(
    new Map(
      (this.stages?.stages ?? []).map((stage) => [stage.name, stage.kind])
    )
  );
  /** The list with each pending move shown where it is going. */
  readonly tasks = $derived<TaskSummary[]>(
    (this.list?.tasks ?? []).map((task) => {
      const stage = this.moving[task.id];
      if (stage === undefined) {
        return task;
      }
      const kind = this.#kindByStage.get(stage) ?? null;
      return {
        ...task,
        stage,
        kind,
        needsYou: kind === "you" || task.lastAttemptFailed,
      };
    })
  );

  /** The archived tasks, for the board's Archived rail. */
  archived = $state<TaskSummary[]>([]);
  /** Reads of the archived tasks so far: only the newest one's answer is kept. */
  readonly #archivedReads = newestRead();

  /** The project's views, kept then drafted, once read. */
  views = $state<ProjectView[]>([]);
  viewsRead = $state(false);
  viewsProblem = $state<string | null>(null);
  /** The tasks with their dates, as the `tasks` view tool answers them: what the Calendar places. */
  dated = $state<ViewTaskRow[] | null>(null);
  /** Reads of the views, and of the dated tasks, so far: only each newest one's answer is kept. */
  readonly #viewsReads = newestRead();
  readonly #datedReads = newestRead();

  /** Reads of the tasks so far: only the newest one's answer is kept. */
  readonly #reads = newestRead();

  /**
   * Moves the hub refused from the board, by task: the card is back in its
   * column with the hub's sentence (which names the moves that are open)
   * under it, and Try again makes the same move.
   */
  refusedMoves = $state<Record<string, { reason: string; stage: string }>>({});

  /** The bulk change in flight, or where the hub stopped it. */
  bulkRun = $state<BulkRun | null>(null);
  /** Goes on from where a refused bulk change stopped. */
  bulkAgain: (() => void) | null = null;

  readonly #project: () => string;
  readonly #find: TaskFind;

  constructor({
    project,
    seed,
    find,
  }: {
    /** The project the page is. */
    project: () => string;
    /** What the server read for it, on a cold load that named it; null when the tab opened in the browser. */
    seed: ProjectPageData | null;
    /** What the hub found for the filter's words, which moves with the tasks. */
    find: TaskFind;
  }) {
    this.#project = project;
    this.#find = find;
    this.list = seed?.tasks.ok ? seed.tasks.value : null;
    this.listProblem = seed ? refusal(seed.tasks) : null;
    this.stages = seed?.stages.ok ? seed.stages.value : null;
    this.stagesProblem = seed ? refusal(seed.stages) : null;
  }

  async readArchived() {
    const id = this.#project();
    const newest = this.#archivedReads.next();
    try {
      const read = await listArchived(id);
      if (id === this.#project() && newest()) {
        this.archived = read.tasks;
      }
    } catch {
      // The board stands without them.
    }
  }

  async readViews() {
    const id = this.#project();
    const newest = this.#viewsReads.next();
    try {
      const read = await viewsOf(id);
      if (id === this.#project() && newest()) {
        this.views = read;
        this.viewsProblem = null;
      }
    } catch (error) {
      if (newest()) {
        this.viewsProblem = message(error);
      }
    } finally {
      this.viewsRead = true;
    }
  }

  async readDated() {
    const id = this.#project();
    const newest = this.#datedReads.next();
    try {
      const read = await hubData(
        hub.api.projects({ id })["view-tools"].tasks.post({}),
        refusedOrUnreached
      );
      if (id === this.#project() && newest()) {
        this.dated = read.rows;
      }
    } catch {
      // The Calendar waits for the next read; the board stands.
    }
  }

  // --- the hub's writes ---------------------------------------------------------

  /** Keep: the draft becomes a kept view where it stands in the list. */
  async keepView(name: string) {
    const kept = await keepView(this.#project(), name);
    this.views = this.views.map((view) => (view.name === name ? kept : view));
  }

  /**
   * Discard: the draft goes from the list. `leave` runs once the hub has
   * discarded it and before it goes, so the page turns from its tab while
   * the tab still stands.
   */
  async discardView(name: string, leave: () => void) {
    await discardView(this.#project(), name);
    leave();
    this.views = this.views.filter((view) => view.name !== name);
  }

  async refresh() {
    const id = this.#project();
    const newest = this.#reads.next();
    const [read, readStagesNow] = await Promise.allSettled([
      listTasks(id),
      readStages(id),
    ]);
    if (id !== this.#project() || !newest()) {
      return;
    }
    if (read.status === "fulfilled") {
      this.list = read.value;
      this.listProblem = null;
    } else {
      this.listProblem = message(read.reason);
    }
    if (readStagesNow.status === "fulfilled") {
      this.stages = readStagesNow.value;
      this.stagesProblem = null;
    } else {
      this.stagesProblem = message(readStagesNow.reason);
    }
    detach(this.readDated(), "readDated");
    detach(this.readArchived(), "readArchived");
    // What the words find moves with the tasks (a description changed).
    detach(this.#find.again(), "again");
  }

  /**
   * A task the hub just wrote, put into the list until the list is read
   * again. The row is the client's own reading of the task as the hub's
   * write answered it (a TaskView); the hub's own list row comes from its
   * index (hub tasks.ts `summaryOf`), so `problem` is the one the list last
   * said, and the links, fields and to-dos are read off the view.
   */
  patch(task: TaskView) {
    if (!this.list) {
      return;
    }
    const { list } = this;
    const row: TaskSummary = {
      ...(list.tasks.find((each) => each.id === task.id) ?? {
        problem: null,
        rank: task.rank,
        type: task.type,
      }),
      id: task.id,
      number: task.number,
      path: task.path,
      title: task.title,
      stage: task.stage,
      kind: task.kind,
      needsYou: task.needsYou,
      waitsOn: task.waitsOn,
      partOf: task.partOf,
      foundIn: task.foundIn,
      duplicateOf: task.duplicateOf,
      // The row's fields are the ones that hold one scalar (the hub's TaskSummary).
      fields: Object.fromEntries(
        Object.entries(task.extra).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      ),
      labels: task.labels,
      links: task.links.map(({ source, kind, ref, state, url, mode }) => ({
        source,
        kind,
        ref,
        state,
        url,
        mode,
      })),
      outputs: task.outputs,
      rank: task.rank,
      type: task.type,
      todos: todoProgress(task.todos),
      createdAt: task.createdAt,
      createdBy: task.createdBy,
      updatedAt: task.updatedAt,
      updatedBy: task.updatedBy,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      droppedAt: task.droppedAt,
      archivedAt: task.archivedAt,
      closeReason: task.closeReason,
      attempts: task.attempts,
      waits: task.waits,
      unblocks: task.unblocks,
      parts: task.parts,
      heldBy: task.heldBy,
      ready: task.ready,
      builtOn: task.builtOn,
      lastAttemptFailed: task.lastAttemptFailed,
      lastAttemptStopped: task.lastAttemptStopped,
      liveAttempt: task.liveAttempt,
      queuedStart: task.queuedStart,
      startProblem: task.startProblem,
    };
    const known = list.tasks.some((each) => each.id === task.id);
    this.list = {
      ...list,
      tasks: known
        ? list.tasks.map((each) => (each.id === task.id ? row : each))
        : [...list.tasks, row],
    };
  }

  changed(task: TaskView) {
    this.patch(task);
    detach(this.refresh(), "refresh");
  }

  /**
   * A move, the card standing where it was put, saying it moves, until the
   * hub answers. A refusal puts the card back where it was, and the hub's
   * sentence (which names the moves that are open) is thrown to whoever
   * asked: the board says it under the card, the sheet beside its picker.
   */
  async move(
    id: string,
    stage: string,
    source?: HTMLElement,
    reason?: string
  ): Promise<TaskView> {
    departShared(taskShare(id), source);
    this.moving = { ...this.moving, [id]: stage };
    try {
      const task = await moveTask(this.#project(), id, stage, reason);
      this.patch(task);
      return task;
    } catch (error) {
      departShared(taskShare(id));
      throw error;
    } finally {
      const { [id]: _, ...rest } = this.moving;
      this.moving = rest;
      detach(this.refresh(), "refresh");
    }
  }

  drop(id: string, stage: string, source?: HTMLElement) {
    const { [id]: _, ...rest } = this.refusedMoves;
    this.refusedMoves = rest;
    this.move(id, stage, source).catch((error: unknown) => {
      this.refusedMoves = {
        ...this.refusedMoves,
        [id]: { reason: message(error), stage },
      };
    });
  }

  refusedMove(id: string) {
    const refused = this.refusedMoves[id];
    return refused
      ? { reason: refused.reason, again: () => this.drop(id, refused.stage) }
      : null;
  }

  async create(title: string, stage: string): Promise<string> {
    const task = await createTask(this.#project(), { title, stage });
    this.changed(task);
    return task.id;
  }

  // --- a bulk change -----------------------------------------------------------

  /**
   * A bulk change, one task at a time through each task's own route, in the
   * order picked. Each task the hub confirms leaves the selection; a
   * refusal stops the run there, says the task and the hub's words, and
   * the tasks not yet changed stay picked for Try again.
   */
  async bulk(
    verb: string,
    ids: string[],
    act: (id: string) => Promise<unknown>,
    total = ids.length,
    before = 0
  ) {
    this.bulkRun = { verb, done: before, total, failed: null };
    for (const [at, id] of ids.entries()) {
      try {
        await act(id);
      } catch (error) {
        this.bulkRun = {
          verb,
          done: before + at,
          total,
          failed: { id, text: message(error) },
        };
        this.bulkAgain = () =>
          this.bulk(verb, ids.slice(at), act, total, before + at);
        detach(this.refresh(), "refresh");
        return;
      }
      selection.ids = selection.ids.filter((each) => each !== id);
      this.bulkRun = { verb, done: before + at + 1, total, failed: null };
    }
    this.bulkRun = null;
    this.bulkAgain = null;
    clearPicks();
    detach(this.refresh(), "refresh");
  }

  bulkMove(ids: string[], stage: string) {
    return this.bulk("Moving", ids, (id) => this.move(id, stage));
  }

  bulkDrop(ids: string[], dropTo: string, reason: string) {
    return this.bulk("Dropping", ids, (id) =>
      this.move(id, dropTo, undefined, reason)
    );
  }

  bulkLabel(ids: string[], label: string) {
    return this.bulk("Labelling", ids, async (id) => {
      const row = this.tasks.find((task) => task.id === id);
      this.patch(
        await updateTask(this.#project(), id, {
          labels: [...new Set([...(row?.labels ?? []), label])],
        })
      );
    });
  }

  bulkArchive(ids: string[]) {
    return this.bulk("Archiving", ids, async (id) => {
      await archiveTask(this.#project(), id);
      if (this.list) {
        this.list = {
          ...this.list,
          tasks: this.list.tasks.filter((task) => task.id !== id),
        };
      }
    });
  }

  endBulk() {
    clearPicks();
    this.bulkRun = null;
    this.bulkAgain = null;
  }
}
