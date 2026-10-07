/**
 * Caw, a project's lead (Projects spec §5.3, §5.6; D4, D13).
 *
 * - **A setting per project**: on or off, and the harness Caw runs on. On by
 *   default for a project made with Caw; off for every project from before.
 * - **The lead is P1's lead.** `projects.lead_instance_id` names Caw's
 *   session; the dispatcher's attempts report to it and work-items.ts makes
 *   it a co-parent of the project's items, as before. Only the hub sets it:
 *   it starts the session on the first event while Caw is on, on a checkout
 *   of the project on a machine that is online, with the role `lead`, so the
 *   `cawco` server lists it board tools only, and its harness denies its edit
 *   and shell tools on every spawn of its row (server.ts `bounded`).
 * - **Woken by events only**, never a timer: your message in a thread, an
 *   attempt at a task landing or failing (its report, or a line from here
 *   while the project has no Caw session yet), a task entering a stage of
 *   kind `you`, your ask for a view. Each wake is one message to its session
 *   through the one send path, which revives a session at rest. An event the
 *   person should read is also noted in a thread (`author: "event"`): the
 *   thread it belongs to, else the project's newest.
 * - **Off**: the lead is cleared and its session ended, so nothing for the
 *   project wakes a model. Reports go to the parent alone, asks with no
 *   session to take them and failed attempts to you (push.ts), and the
 *   dispatcher starts nothing on its own.
 * - **Threads**: conversations with Caw, kept here; Caw answers with
 *   `thread_reply`. A thread's status is derived, never stored: `working`
 *   while the lead is busy on a turn that thread woke, `needs-you` while a
 *   question the lead asked in it is parked, else `ready`. The lead's
 *   question is tagged with its thread (server.ts) and your answer lands in
 *   it. Every change reaches open dashboards as `thread.upsert` and
 *   `thread.message` frames.
 * - **Views**: Caw drafts a view with `view_draft` (views.ts); you keep or
 *   discard it.
 * - Each lead shows its spend: what every Caw session of the project has
 *   cost, from the usage buckets budgets already read.
 */
import {
  CAW_DENIED_TOOLS,
  CAWCO_COMPONENT_NAMES,
  type CawHarness,
  type CawView,
  type Envelope,
  type InstanceRow,
  type PermissionRequestFrame,
  type PermissionResult,
  type ProjectSpend,
  questionsOf,
  type SendPayload,
  type SpawnPayload,
  type ThreadAnswer,
  type ThreadMessage,
  type ThreadMessageFrame,
  type ThreadRead,
  type ThreadSaid,
  type ThreadStatus,
  type ThreadSummary,
  type ThreadUpsertFrame,
  type UserAnswers,
} from "@cawco/core";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import { tool } from "./admin-tools";
import type {
  DbShape,
  ThreadListRow,
  ThreadMessageRow,
  ThreadRow,
  WorkItemRow,
} from "./db";
import type { TaskEvent, TaskView } from "./tasks";
import type { Views } from "./views";

/**
 * The model Caw runs after a change: the one it names (blank is the
 * harness's default), else none on a new harness (its models are its own),
 * else the one he had.
 */
const modelAfter = (
  had: string | null,
  asked: string | null | undefined,
  rehomed: boolean
): string | null => {
  if (asked !== undefined) {
    return asked?.trim() || null;
  }
  return rehomed ? null : had;
};

/** The harnesses Caw runs on, in the order a picker offers them. */
export const CAW_HARNESSES = Object.keys(CAW_DENIED_TOOLS) as CawHarness[];

/** Caw's denied tools on `harness`; refused on a harness that cannot deny them. */
export const cawDenied = (harness: string): readonly string[] => {
  if (!(harness in CAW_DENIED_TOOLS)) {
    throw new Error(
      `Caw does not run on ${harness}: it cannot deny Caw's edit and shell tools.`
    );
  }
  return CAW_DENIED_TOOLS[harness as CawHarness];
};

/**
 * A spawn as it reaches a machine: a lead row's (a project's Caw) also denies
 * Caw's edit and shell tools on `harness`, whatever else it denies.
 */
export const withCawDenials = (
  payload: SpawnPayload,
  row: Pick<InstanceRow, "role">,
  harness: string
): SpawnPayload =>
  row.role === "lead"
    ? {
        ...payload,
        denyTools: [
          ...new Set([...(payload.denyTools ?? []), ...cawDenied(harness)]),
        ],
      }
    : payload;

/**
 * What wakes Caw: the words it reads, the thread the event belongs to, and
 * the note the person reads in that thread (none for your own message,
 * which is in the thread already).
 */
export interface CawEvent {
  note?: { body?: string; title: string };
  text: string;
  /** Its thread: the note goes there, and that thread is `working` while the turn it wakes runs. */
  threadId?: string;
}

const messageOf = (row: ThreadMessageRow): ThreadMessage => {
  const base = {
    id: row.id,
    threadId: row.threadId,
    createdAt: row.createdAt.getTime(),
  };
  switch (row.author) {
    case "event":
      return {
        ...base,
        author: "event",
        noteTitle: row.noteTitle ?? "",
        ...(row.body ? { body: row.body } : {}),
      };
    case "caw":
      return {
        ...base,
        author: "caw",
        body: row.body,
        ...(row.tasks?.length ? { tasks: row.tasks } : {}),
      };
    default:
      return {
        ...base,
        author: "you",
        body: row.body,
        ...(row.question ? { question: row.question } : {}),
        ...(row.answer ? { answer: row.answer } : {}),
      };
  }
};

/** How long a thread's title runs: the first line of its first message, cut. */
const TITLE_MAX = 60;
const FIRST_LINE = /\r?\n/;
const TASK_ID = /^tsk-\d{1,9}$/;

const titleFrom = (body: string): string => {
  const line = body.trim().split(FIRST_LINE)[0]?.trim() ?? "";
  return line.length > TITLE_MAX
    ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : line;
};

/** An attempt's end, in the word an event note reads. */
const ENDED: Record<string, string> = {
  done: "landed",
  failed: "failed",
  cancelled: "was cancelled",
};

/** Statuses a lead session cannot be woken from: its row is gone for good. */
const GONE: ReadonlySet<string> = new Set(["discarded"]);

/** A refusal a route answers with its status. */
export class CawRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(code: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = code;
  }
}

const refuse = (code: 400 | 403 | 404 | 409, message: string): never => {
  throw new CawRefusal(code, message);
};

/** What Caw reads first, before the event that started it. */
const briefOf = (projectName: string): string =>
  [
    `You are Caw, the lead of the project “${projectName}” in CawCo.`,
    "You have the project's board (task_read, task_create, task_update, task_link, task_start, task_retry, todo_write), its threads (thread_read, thread_reply), its views (view_draft), delegate with the tools that steer the project's work (handoff, answer_delegate, stop_delegate, interrupt_delegate, set_item_checks), and send_to_user. You have no edit or shell tools: work that changes files becomes a task or a delegate.",
    "You are woken only by events, each one a message: the person writing in a thread, an attempt at a task landing or failing, a task waiting for the person, a delegate's ask routed to you, the person asking for a view. Handle the event, then end your turn. Nothing wakes you on a timer.",
    "When the person writes in a thread, answer in that thread with thread_reply; the person does not see what you say outside it. Name the tasks a reply is about in its `tasks`. Code coordinates, models judge, the person decides: permissions, merges, configuration and public actions are theirs, so ask in the thread (AskUserQuestion lands there).",
    "A view-request event is the person asking for a view of the project's tasks: answer it with view_draft, then say in that thread what you drafted; the person keeps or discards it.",
  ].join("\n\n");

export interface CawDeps {
  /** The asks parked on the hub now (pending.ts). */
  readonly asks: () => Envelope[];
  readonly db: Pick<
    DbShape,
    | "addThreadMessage"
    | "allThreads"
    | "addThreadSpend"
    | "createThread"
    | "getInstancesByIds"
    | "leadSpendUsd"
    | "newestThread"
    | "project"
    | "projectSpend"
    | "projectThreads"
    | "setProjectCaw"
    | "thread"
    | "threadMessages"
    | "threadOfTask"
  >;
  /** Ends a session (the lead, when Caw is turned off or moves harness). */
  readonly end: (instanceId: string) => void;
  /** Whether a machine is connected now. */
  readonly online: (machineId: string) => boolean;
  /** Tells every open dashboard a thread changed (the ledger's broadcast). */
  readonly publish: (frame: ThreadUpsertFrame | ThreadMessageFrame) => void;
  /** Delivers one message to a session through the hub's one send path. */
  readonly send: (envelope: Envelope<SendPayload>) => void;
  /** Starts a session, resolved once its machine says it is in place. */
  readonly spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
  /** A task as its project's files have it. */
  readonly task: (projectId: string, id: string) => Promise<TaskView>;
  /** Writes Caw's draft views (views.ts). */
  readonly views: Pick<Views, "draft">;
}

export const createCaw = ({
  asks,
  db,
  end,
  online,
  publish,
  send,
  spawn,
  task,
  views,
}: CawDeps) => {
  /** Lead sessions being started now, by project: one start per project at a time. */
  const starting = new Map<string, Promise<InstanceRow>>();
  /**
   * The thread each lead's current turn was woken by, by lead session; kept
   * in memory: it is the process's state, read off its pulses. `started`
   * once the turn's first busy pulse came, so the idle one after ends it.
   */
  const turns = new Map<
    string,
    { projectId: string; started: boolean; threadId: string }
  >();

  /**
   * The thread each lead's latest turn answered, kept past the turn's idle
   * pulse: its result, which carries the turn's cost, can land after it.
   */
  const answered = new Map<string, string>();

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    refuse(404, `The hub keeps no project ${projectId}.`);

  const row = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0] as InstanceRow | undefined;

  // --- status and frames ---------------------------------------------------

  const statusOf = (threadId: string): ThreadStatus => {
    if (
      asks().some(
        (ask) =>
          (ask.payload as { threadId?: unknown } | undefined)?.threadId ===
          threadId
      )
    ) {
      return "needs-you";
    }
    for (const turn of turns.values()) {
      if (turn.threadId === threadId) {
        return "working";
      }
    }
    return "ready";
  };

  const summaryOf = (thread: ThreadRow): ThreadSummary => ({
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    lastAt: thread.updatedAt.getTime(),
    status: statusOf(thread.id),
  });

  const upsert = (thread: ThreadRow | undefined): void => {
    if (thread) {
      publish({ kind: "thread.upsert", thread: summaryOf(thread) });
    }
  };

  /**
   * A message added to a thread, to every dashboard: the message, then the
   * row it moved. `withRow: false` when a wake follows, which publishes the row
   * once with the turn's status, so it never reads `ready` for a moment.
   */
  const said = (
    thread: ThreadRow,
    added: ThreadMessageRow,
    withRow = true
  ): ThreadSaid => {
    const message = messageOf(added);
    publish({ kind: "thread.message", threadId: thread.id, message });
    if (withRow) {
      upsert(thread);
    }
    return { thread: summaryOf(thread), message };
  };

  /** The lead's turn now answers `threadId`: it is `working`, and the thread before it no longer. */
  const follow = (lead: InstanceRow, projectId: string, threadId: string) => {
    answered.set(lead.id, threadId);
    const before = turns.get(lead.id);
    turns.set(lead.id, { projectId, threadId, started: false });
    if (before && before.threadId !== threadId) {
      upsert(db.thread(before.threadId));
    }
    upsert(db.thread(threadId));
  };

  /** A lead's turn is over without an idle pulse: its session ended. */
  const unfollow = (instanceId: string): void => {
    const turn = turns.get(instanceId);
    if (turn) {
      turns.delete(instanceId);
      upsert(db.thread(turn.threadId));
    }
  };

  /**
   * Notes an event in its thread, else the project's newest, else a thread
   * of its own; answers the thread it went to. `withRow` as {@link said}.
   */
  const noteIn = (
    projectId: string,
    threadId: string | undefined,
    note: { body?: string; title: string },
    withRow = true
  ): string => {
    const thread =
      (threadId ? db.thread(threadId) : undefined) ??
      db.newestThread(projectId);
    const event = {
      author: "event" as const,
      body: note.body?.trim() ?? "",
      noteTitle: note.title,
    };
    if (thread) {
      const added = db.addThreadMessage({ threadId: thread.id, ...event });
      said(added.thread, added.message, withRow);
      return thread.id;
    }
    const made = db.createThread({
      id: crypto.randomUUID(),
      projectId,
      title: titleFrom(note.title),
      first: event,
    });
    said(made.thread, made.message, withRow);
    return made.thread.id;
  };

  // --- the lead session ----------------------------------------------------

  /** The project's Caw session, when it has one the hub can still wake. */
  const standing = (
    project: ReturnType<typeof projectOf>
  ): InstanceRow | undefined => {
    const lead = project.leadInstanceId
      ? row(project.leadInstanceId)
      : undefined;
    return lead &&
      lead.role === "lead" &&
      lead.projectId === project.id &&
      !GONE.has(lead.status) &&
      online(lead.machineId)
      ? lead
      : undefined;
  };

  /** Where Caw starts: a checkout on a machine that is online, the primary place first. */
  const placeFor = (project: ReturnType<typeof projectOf>) => {
    const checkouts = project.places.filter(
      (place) => place.kind === "checkout" && online(place.machineId)
    );
    return (
      checkouts.find(
        (place) =>
          place.machineId === project.machineId && place.path === project.cwd
      ) ?? checkouts[0]
    );
  };

  /** Why Caw could not start for the project now, or null. */
  const problemOf = (project: ReturnType<typeof projectOf>): string | null => {
    if (!project.caw || standing(project)) {
      return null;
    }
    return placeFor(project)
      ? null
      : `No checkout of ${project.name} is on a machine that is online, so Caw cannot start. Bring one of its machines online.`;
  };

  const message = (target: InstanceRow, content: string): void =>
    send({
      verb: "send",
      machineId: target.machineId,
      instanceId: target.id,
      payload: {
        instanceId: target.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: { kind: "system", name: "caw" },
        },
      },
    });

  /**
   * Starts the project's Caw session, makes it the lead, and sends it its
   * brief with the event that started it: a session is only ever started by
   * an event.
   */
  const startLead = async (
    project: ReturnType<typeof projectOf>,
    event: string
  ): Promise<InstanceRow> => {
    const place =
      placeFor(project) ??
      refuse(409, problemOf(project) ?? "Caw cannot start.");
    const instanceId = crypto.randomUUID();
    cawDenied(project.cawHarness);
    await spawn(place.machineId, {
      instanceId,
      cwd: place.path,
      harness: project.cawHarness,
      ...(project.cawModel ? { model: project.cawModel } : {}),
      projectId: project.id,
      title: "Caw",
      role: "lead",
      requestId: crypto.randomUUID(),
    });
    db.setProjectCaw(project.id, { leadInstanceId: instanceId });
    const lead = row(instanceId);
    if (!lead) {
      throw new Error(`Caw's session ${instanceId} has no row on this hub.`);
    }
    message(lead, `${briefOf(project.name)}\n\n${event}`);
    console.log(
      `[caw] ${project.name}: started Caw on ${project.cawHarness} (${instanceId})`
    );
    return lead;
  };

  /**
   * The project's Caw session: the one it has, or one started now for
   * `event` while Caw is on (its first message, after its brief). Undefined
   * while Caw is off. Callers at once share one start; `started` says whether
   * this call's event went out with it.
   */
  const leadFor = async (
    projectId: string,
    event: string
  ): Promise<{ row: InstanceRow; started: boolean } | undefined> => {
    const project = projectOf(projectId);
    if (!project.caw) {
      return undefined;
    }
    const current = standing(project);
    if (current) {
      return { row: current, started: false };
    }
    const pending = starting.get(projectId);
    if (pending) {
      return { row: await pending, started: false };
    }
    const start = startLead(project, event).finally(() =>
      starting.delete(projectId)
    );
    starting.set(projectId, start);
    return { row: await start, started: true };
  };

  /**
   * The one way any event source wakes a project's Caw (§5.3: your message,
   * an attempt landing or failing, a needs-you item, your ask for a view;
   * routines, GitHub events and check results call it the same way). Its
   * note goes into its thread first; then one message to Caw's session,
   * starting the session when it has none, and that thread follows the turn.
   * Nothing while Caw is off; there is no timer behind it. Answers whether a
   * model was woken.
   */
  const wake = async (projectId: string, event: CawEvent): Promise<boolean> => {
    // The thread's row goes out once, with the status this wake leaves it in.
    const settle = (id: string | undefined) =>
      upsert(id ? db.thread(id) : undefined);
    if (!projectOf(projectId).caw) {
      settle(event.threadId);
      return false;
    }
    const threadId = event.note
      ? noteIn(projectId, event.threadId, event.note, false)
      : event.threadId;
    const text =
      event.note && threadId
        ? `${event.text}\n\n(Noted in thread ${threadId}; answer there with thread_reply when the person should hear of it.)`
        : event.text;
    let lead: Awaited<ReturnType<typeof leadFor>>;
    try {
      lead = await leadFor(projectId, text);
    } catch (error) {
      settle(threadId);
      throw error;
    }
    if (!lead) {
      settle(threadId);
      return false;
    }
    if (threadId) {
      follow(lead.row, projectId, threadId);
    }
    if (!lead.started) {
      message(lead.row, text);
    }
    return true;
  };

  /** Logs a wake that failed: an event is never lost silently. */
  const wakeQuietly = (projectId: string, event: CawEvent): void => {
    wake(projectId, event).catch((error: unknown) =>
      console.warn(
        `[caw] ${projectId}: Caw was not woken: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  /** Ends the project's Caw session and clears the lead. */
  const retire = (project: ReturnType<typeof projectOf>): void => {
    if (project.leadInstanceId) {
      unfollow(project.leadInstanceId);
      end(project.leadInstanceId);
    }
    db.setProjectCaw(project.id, { leadInstanceId: null });
  };

  const view = (projectId: string): CawView => {
    const project = projectOf(projectId);
    return {
      on: project.caw,
      harness: project.cawHarness,
      model: project.cawModel,
      leadInstanceId: project.leadInstanceId,
      problem: problemOf(project),
      spendUsd: db.leadSpendUsd(projectId),
    };
  };

  /** The thread, refused when it is not the project's. */
  const threadIn = (projectId: string, threadId: string): ThreadRow => {
    const thread = db.thread(threadId);
    return thread && thread.projectId === projectId
      ? thread
      : refuse(404, `The project has no thread ${threadId}.`);
  };

  /** What Caw reads when you write: the thread, and your words. */
  const yourWords = (thread: ThreadRow, body: string, first: boolean) =>
    `${first ? "You started a thread" : "You wrote in the thread"} “${thread.title}” (thread ${thread.id}):\n\n${body}\n\nAnswer with thread_reply({ thread: "${thread.id}", body }).`;

  /** What Caw reads when you ask for a view. */
  const viewRequest = (thread: ThreadRow, body: string) =>
    `Event view-request: you asked for a view in the thread “${thread.title}” (thread ${thread.id}):\n\n${body}\n\nDraft it with view_draft({ name, spec }), then tell the person in that thread with thread_reply.`;

  /** Refuses a message while Caw is off: nothing would read it. */
  const listening = (projectId: string) => {
    const project = projectOf(projectId);
    if (!project.caw) {
      refuse(
        409,
        `Caw is off for ${project.name}: turn it on to talk to it in a thread.`
      );
    }
    const problem = problemOf(project);
    if (problem) {
      refuse(409, problem);
    }
  };

  const bodyOf = (body: string): string =>
    body.trim() || refuse(400, "A message needs words.");

  /** A project's threads, newest first. */
  const threads = (projectId: string): ThreadSummary[] => {
    projectOf(projectId);
    return db.projectThreads(projectId).map(summaryOf);
  };

  /** A thread and its messages, oldest first. */
  const read = (projectId: string, threadId: string): ThreadRead => {
    const thread = threadIn(projectId, threadId);
    return {
      thread: summaryOf(thread),
      messages: db.threadMessages(thread.id).map(messageOf),
    };
  };

  /** Starts a thread with your first message, to every dashboard; the wake that follows publishes its row. */
  const open = (projectId: string, body: string) => {
    const made = db.createThread({
      id: crypto.randomUUID(),
      projectId,
      title: titleFrom(body),
      first: { author: "you", body },
    });
    return { row: made.thread, said: said(made.thread, made.message, false) };
  };

  /** The lead session `actor` is, when it is its project's lead. */
  const leadOf = (actor: InstanceRow | undefined) => {
    const projectId = actor?.projectId;
    const project = projectId ? db.project(projectId) : undefined;
    return actor &&
      actor.role === "lead" &&
      project &&
      project.leadInstanceId === actor.id
      ? project
      : undefined;
  };

  return {
    /**
     * The lead an attempt nobody asked for reports to (dispatch.ts): its Caw
     * session, started for that attempt when it has none.
     */
    lead: async (projectId: string): Promise<InstanceRow | undefined> =>
      (
        await leadFor(
          projectId,
          "The hub is starting an attempt at a task of the project; its report comes to you."
        )
      )?.row,
    wake,
    view,

    /**
     * What the project has spent: today and this month in the hub's zone,
     * its Caw's share, each task's attempts and each thread's wakes.
     */
    spend(projectId: string): ProjectSpend {
      const project = projectOf(projectId);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const month = new Date(today);
      month.setDate(1);
      const todayStart = today.getTime();
      const monthStart = month.getTime();
      const spent = db.projectSpend(projectId, { todayStart, monthStart });
      const byTask = new Map<string, ProjectSpend["attempts"][number]>();
      for (const item of spent.items) {
        const held = byTask.get(item.taskId);
        byTask.set(item.taskId, {
          taskId: item.taskId,
          title: item.title,
          type: item.type,
          state: item.state,
          lastAt: item.at,
          attempts: (held?.attempts ?? 0) + 1,
          usd: (held?.usd ?? 0) + item.usd,
        });
      }
      return {
        todayStart,
        monthStart,
        todayUsd: spent.todayUsd,
        monthUsd: spent.monthUsd,
        caw: spent.caw,
        budget: project.budget ?? null,
        threads: spent.threads,
        attempts: [...byTask.values()].sort((a, b) => b.lastAt - a.lastAt),
      };
    },

    /**
     * Turns Caw on or off, or moves it to another harness or model; a lead it
     * had is ended. A harness of its own takes its own default model unless
     * the change names one.
     */
    configure(
      projectId: string,
      change: { harness?: string; model?: string | null; on?: boolean }
    ): CawView {
      const project = projectOf(projectId);
      if (change.harness !== undefined) {
        try {
          cawDenied(change.harness);
        } catch (error) {
          refuse(400, (error as Error).message);
        }
      }
      const harness = (change.harness as CawHarness | undefined) ?? undefined;
      const on = change.on ?? project.caw;
      const rehomed = harness !== undefined && harness !== project.cawHarness;
      const model = modelAfter(project.cawModel, change.model, rehomed);
      const moved = rehomed || model !== project.cawModel;
      if ((!on && project.caw) || moved) {
        retire(project);
      }
      db.setProjectCaw(projectId, {
        caw: on,
        cawModel: model,
        ...(harness ? { cawHarness: harness } : {}),
      });
      return view(projectId);
    },

    threads,
    read,

    /** Every project's threads, newest first, by project: the fleet read the rail takes. */
    allThreads(): Record<string, ThreadSummary[]> {
      const byProject: Record<string, ThreadSummary[]> = {};
      for (const thread of db.allThreads()) {
        const list = byProject[thread.projectId] ?? [];
        list.push(summaryOf(thread));
        byProject[thread.projectId] = list;
      }
      return byProject;
    },

    /** Starts a thread with your first message, and wakes Caw with it. */
    async start(projectId: string, raw: string): Promise<ThreadSaid> {
      const body = bodyOf(raw);
      listening(projectId);
      const opened = open(projectId, body);
      await wake(projectId, {
        text: yourWords(opened.row, body, true),
        threadId: opened.row.id,
      });
      return { ...opened.said, thread: summaryOf(opened.row) };
    },

    /** Adds your message to a thread, and wakes Caw with it. */
    async say(
      projectId: string,
      threadId: string,
      raw: string
    ): Promise<ThreadSaid> {
      const body = bodyOf(raw);
      threadIn(projectId, threadId);
      listening(projectId);
      const added = db.addThreadMessage({ threadId, author: "you", body });
      const out = said(added.thread, added.message, false);
      await wake(projectId, {
        text: yourWords(added.thread, body, false),
        threadId,
      });
      return { ...out, thread: summaryOf(added.thread) };
    },

    /** "Ask Caw for a view": a new thread with your words, and Caw woken by `view-request`. */
    async requestView(projectId: string, raw: string): Promise<ThreadSaid> {
      const body = bodyOf(raw);
      listening(projectId);
      const opened = open(projectId, body);
      await wake(projectId, {
        text: viewRequest(opened.row, body),
        threadId: opened.row.id,
      });
      return { ...opened.said, thread: summaryOf(opened.row) };
    },

    /**
     * A task changed: one that entered a stage of kind `you` by anyone but
     * Caw or you wakes Caw (a needs-you item), noted in the thread that
     * named the task.
     */
    taskChanged(event: TaskEvent): void {
      if (
        event.kind === "changed" ||
        event.actor.mover === "lead" ||
        event.actor.mover === "you" ||
        !db.project(event.projectId)?.caw
      ) {
        return;
      }
      const { projectId, id } = event;
      task(projectId, id)
        .then((waiting) => {
          if (waiting.kind === "you") {
            wakeQuietly(projectId, {
              text: `${waiting.id} “${waiting.title}” now waits for the person in ${waiting.stage}.`,
              threadId: db.threadOfTask(projectId, waiting.id)?.id,
              note: {
                title: `Task · ${waiting.id} waits for you in ${waiting.stage}`,
                body: waiting.title,
              },
            });
          }
        })
        .catch(() => undefined);
    },

    /**
     * An attempt at a task ended. It is noted in the thread that named the
     * task. With a Caw session, the attempt's report reaches it as the lead
     * (work-items.ts `reportees`), and that thread follows the turn; with
     * none yet, Caw starts and hears it here.
     */
    itemEnded(item: WorkItemRow): void {
      const project = item.projectId ? db.project(item.projectId) : undefined;
      if (!(project?.caw && item.taskId)) {
        return;
      }
      const report =
        item.state === "done"
          ? (item.digest ?? item.result ?? "").trim()
          : (item.error ?? "").trim();
      const event: CawEvent = {
        text: `The attempt at ${item.taskId} (“${item.title}”) ended ${item.state}.${report ? `\n\n${report.slice(0, 2000)}` : ""}`,
        threadId: db.threadOfTask(project.id, item.taskId)?.id,
        note: {
          title: `Attempt · ${item.taskId} ${ENDED[item.state] ?? item.state}`,
          body: report.slice(0, 2000),
        },
      };
      if (!project.leadInstanceId) {
        wakeQuietly(project.id, event);
        return;
      }
      const threadId = noteIn(
        project.id,
        event.threadId,
        event.note ?? { title: "" },
        false
      );
      const lead = standing(project);
      if (lead) {
        follow(lead, project.id, threadId);
      } else {
        upsert(db.thread(threadId));
      }
    },

    /**
     * The thread a session's question goes to, when the session is its
     * project's lead: the one whose message woke this turn, else the
     * project's newest. Undefined for any other session.
     */
    askThread(asker: InstanceRow): string | undefined {
      const project = leadOf(asker);
      return project
        ? (turns.get(asker.id)?.threadId ?? db.newestThread(project.id)?.id)
        : undefined;
    },

    /** A question tagged to a thread was parked or settled: its status moved. */
    asksChanged(threadId: string): void {
      upsert(db.thread(threadId));
    },

    /** Your answer to the lead's question, as your message in its thread: the questions, and your choices or that you walked away. */
    answered(parked: Envelope, result: PermissionResult): void {
      const ask = parked.payload as PermissionRequestFrame;
      const thread = ask.threadId ? db.thread(ask.threadId) : undefined;
      const questions = questionsOf(ask.toolName, ask.input);
      if (!(thread && questions)) {
        return;
      }
      let answer: ThreadAnswer = { outcome: "dismissed" };
      let body = "";
      if (result.behavior === "allow") {
        const input = (result.updatedInput ?? {}) as {
          annotations?: Record<string, { notes?: string; preview?: string }>;
          answers?: UserAnswers;
        };
        const answers = input.answers ?? {};
        answer = {
          outcome: "answered",
          answers,
          ...(input.annotations ? { annotations: input.annotations } : {}),
        };
        body = Object.values(answers).flat().join(", ");
      }
      const added = db.addThreadMessage({
        threadId: thread.id,
        author: "you",
        body,
        question: { questions },
        answer,
      });
      said(added.thread, added.message);
    },

    /** A session's pulse: a lead's turn that a thread woke ends at its first idle after busy. */
    pulse(instanceId: string, busy: boolean): void {
      const turn = turns.get(instanceId);
      if (!turn) {
        return;
      }
      if (busy) {
        turn.started = true;
      } else if (turn.started) {
        unfollow(instanceId);
      }
    },

    /**
     * A lead's turn completed with the session's cumulative cost so far
     * (`total_cost_usd`, called once per completed turn): the difference
     * from what was booked before is this turn's, and goes to the thread
     * that woke it. A session whose count started over (a resumed process)
     * books what it reports. A turn no thread woke, or one that is not a
     * thread's at all (`book` off: the cache keep-alive's), is booked to
     * none, and the baseline still moves, so the next turn's cost is its own.
     */
    turnCost(instanceId: string, totalUsd: number, book = true): void {
      const project = leadOf(row(instanceId));
      if (!(project && Number.isFinite(totalUsd))) {
        return;
      }
      const seen = project.leadCostSeen;
      const spent = totalUsd >= seen ? totalUsd - seen : totalUsd;
      db.setProjectCaw(project.id, { leadCostSeen: totalUsd });
      if (!book) {
        return;
      }
      // The turn this result closes: the one in flight, else the one whose
      // idle pulse came first. Spent once booked, so a later turn no thread
      // woke is never booked to this one.
      const threadId =
        turns.get(instanceId)?.threadId ?? answered.get(instanceId);
      answered.delete(instanceId);
      if (threadId && spent > 0) {
        db.addThreadSpend(threadId, spent);
      }
    },

    /** A session's process ended: a lead's turn ends with it. */
    sessionEnded(instanceId: string): void {
      unfollow(instanceId);
    },

    /** Caw's thread and view tools, for the session `actor`; refused to any session but its project's lead. */
    tools(actor: InstanceRow | undefined) {
      const mine = (): string => {
        const project = leadOf(actor);
        if (!project) {
          throw new Error(
            "Threads and views are the project lead's: this session is not its project's Caw."
          );
        }
        return project.id;
      };
      const ok = (data: unknown) => ({
        content: [{ type: "text" as const, text: JSON.stringify(data) }],
      });
      return [
        tool(
          "thread_read",
          "Read your project's threads: your conversations with the person. Without `thread`: every thread, newest first, with its last message. With `thread`: that thread's messages, oldest first.",
          { thread: z.string().optional() },
          ({ thread }) => {
            const projectId = mine();
            return Promise.resolve(
              ok(
                thread
                  ? read(projectId, thread)
                  : db
                      .projectThreads(projectId)
                      .map((listed: ThreadListRow) => ({
                        ...summaryOf(listed),
                        last: listed.last,
                      }))
              )
            );
          }
        ),
        tool(
          "thread_reply",
          "Answer the person in a thread. This is the only way the person reads what you say: your words outside it are not shown to them.",
          {
            thread: z.string().describe("The thread's id, from its message."),
            body: z.string().trim().min(1).describe("What you say, markdown."),
            tasks: z
              .array(z.string().regex(TASK_ID))
              .optional()
              .describe("Tasks the reply is about (tsk-12): shown as cards."),
          },
          ({ thread, body, tasks }) => {
            const projectId = mine();
            threadIn(projectId, thread);
            const added = db.addThreadMessage({
              threadId: thread,
              author: "caw",
              body,
              ...(tasks?.length ? { tasks: [...new Set(tasks)] } : {}),
            });
            said(added.thread, added.message);
            return Promise.resolve(ok({ ok: true, message: added.message.id }));
          }
        ),
        tool(
          "view_draft",
          `Draft a view of the project's tasks for the person to keep or discard: an A2UI v0.9.1 message list, createSurface {surfaceId, catalogId: "cawco.dev:views/v1"} then updateComponents with a "root". Components: ${CAWCO_COMPONENT_NAMES.join(", ")}. Bind to the hub's data by path: /tasks, /stages, /counts, /project. No URLs, code or data of its own.`,
          {
            name: z
              .string()
              .describe("Lowercase words and dashes, like weekly-review."),
            spec: z
              .array(z.record(z.string(), z.unknown()))
              .describe("The view's messages, in order."),
          },
          async ({ name, spec }) => {
            const projectId = mine();
            const drafted = await views.draft(projectId, name, spec, {
              name: "Caw",
            });
            noteIn(
              projectId,
              actor ? turns.get(actor.id)?.threadId : undefined,
              { title: `View · Caw drafted “${drafted.name}”` }
            );
            return ok({ ok: true, view: drafted.name, draft: true });
          }
        ),
      ];
    },
  };
};

export type Caw = ReturnType<typeof createCaw>;

const answer = (error: unknown) => {
  if (error instanceof CawRefusal) {
    return status(error.status, error.message);
  }
  return status(502, error instanceof Error ? error.message : String(error));
};

const HARNESS = t.Union(CAW_HARNESSES.map((harness) => t.Literal(harness)));

/** The routes for a project's Caw, its threads and your asks for views. */
export const cawRoutes = (caw: Caw) =>
  new Elysia()
    .get("/api/projects/:id/caw", ({ params }) => {
      try {
        return caw.view(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .patch(
      "/api/projects/:id/caw",
      {
        body: t.Object({
          on: t.Optional(t.Boolean()),
          harness: t.Optional(HARNESS),
          model: t.Optional(t.Nullable(t.String())),
        }),
      },
      ({ params, body }) => {
        try {
          return caw.configure(params.id, body);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .get("/api/projects/:id/spend", ({ params }) => {
      try {
        return caw.spend(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .get("/api/threads", () => caw.allThreads())
    .get("/api/projects/:id/threads", ({ params }) => {
      try {
        return caw.threads(params.id);
      } catch (error) {
        return answer(error);
      }
    })
    .post(
      "/api/projects/:id/threads",
      { body: t.Object({ body: t.String() }) },
      async ({ params, body, request, server }) => {
        // Caw's session may be starting on a machine; that can take a while.
        server?.timeout(request, 0);
        try {
          return await caw.start(params.id, body.body);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .get("/api/projects/:id/threads/:threadId", ({ params }) => {
      try {
        return caw.read(params.id, params.threadId);
      } catch (error) {
        return answer(error);
      }
    })
    .post(
      "/api/projects/:id/threads/:threadId/messages",
      { body: t.Object({ body: t.String() }) },
      async ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return await caw.say(params.id, params.threadId, body.body);
        } catch (error) {
          return answer(error);
        }
      }
    )
    .post(
      "/api/projects/:id/view-requests",
      { body: t.Object({ text: t.String() }) },
      async ({ params, body, request, server }) => {
        server?.timeout(request, 0);
        try {
          return await caw.requestView(params.id, body.text);
        } catch (error) {
          return answer(error);
        }
      }
    );
