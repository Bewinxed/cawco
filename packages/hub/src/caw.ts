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
 *   kind `you`, an ask routed to the lead (server.ts). Each wake is one
 *   message to its session through the one send path, which revives a
 *   session at rest.
 * - **Off**: the lead is cleared and its session ended, so nothing for the
 *   project wakes a model. Reports go to the parent alone, asks with no
 *   session to take them and failed attempts to you (push.ts), and the
 *   dispatcher starts nothing on its own.
 * - **Threads**: conversations with Caw, kept here; Caw answers with
 *   `thread_reply`. Each lead shows its spend: what every Caw session of the
 *   project has cost, from the usage buckets budgets already read.
 */
import {
  CAW_DENIED_TOOLS,
  type CawHarness,
  type Envelope,
  type InstanceRow,
  type SendPayload,
  type SpawnPayload,
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

/** A project's Caw, as its routes answer it. */
export interface CawView {
  harness: CawHarness;
  /** Caw's session, once the hub has started one. */
  leadInstanceId: string | null;
  on: boolean;
  /** Why Caw could not start now, while it is on; null when it could. */
  problem: string | null;
  /** Dollars every Caw session of the project has cost. */
  spendUsd: number;
}

/** What a thread's list and reads answer. */
const threadOf = (row: ThreadRow | ThreadListRow) => ({
  id: row.id,
  title: row.title,
  ...("last" in row ? { last: row.last } : {}),
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});

const messageOf = (row: ThreadMessageRow) => ({
  id: row.id,
  author: row.author,
  body: row.body,
  createdAt: row.createdAt.getTime(),
});

/** How long a thread's title runs: the first line of its first message, cut. */
const TITLE_MAX = 60;
const FIRST_LINE = /\r?\n/;

const titleFrom = (body: string): string => {
  const line = body.trim().split(FIRST_LINE)[0]?.trim() ?? "";
  return line.length > TITLE_MAX
    ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…`
    : line;
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
    "You have the project's board (task_read, task_create, task_update, task_link, task_start, task_retry, todo_write), its threads (thread_read, thread_reply), delegate with the tools that steer the project's work (handoff, answer_delegate, stop_delegate, interrupt_delegate, set_item_checks), and send_to_user. You have no edit or shell tools: work that changes files becomes a task or a delegate.",
    "You are woken only by events, each one a message: the person writing in a thread, an attempt at a task landing or failing, a task waiting for the person, a delegate's ask routed to you. Handle the event, then end your turn. Nothing wakes you on a timer.",
    "When the person writes in a thread, answer in that thread with thread_reply; the person does not see what you say outside it. Code coordinates, models judge, the person decides: permissions, merges, configuration and public actions are theirs, so ask in the thread.",
  ].join("\n\n");

export interface CawDeps {
  readonly db: Pick<
    DbShape,
    | "addThreadMessage"
    | "createThread"
    | "getInstancesByIds"
    | "leadSpendUsd"
    | "project"
    | "projectThreads"
    | "setProjectCaw"
    | "thread"
    | "threadMessages"
  >;
  /** Ends a session (the lead, when Caw is turned off or moves harness). */
  readonly end: (instanceId: string) => void;
  /** Whether a machine is connected now. */
  readonly online: (machineId: string) => boolean;
  /** Delivers one message to a session through the hub's one send path. */
  readonly send: (envelope: Envelope<SendPayload>) => void;
  /** Starts a session, resolved once its machine says it is in place. */
  readonly spawn: (machineId: string, payload: SpawnPayload) => Promise<void>;
  /** A task as its project's files have it. */
  readonly task: (projectId: string, id: string) => Promise<TaskView>;
}

export const createCaw = ({ db, end, online, send, spawn, task }: CawDeps) => {
  /** Lead sessions being started now, by project: one start per project at a time. */
  const starting = new Map<string, Promise<InstanceRow>>();

  const projectOf = (projectId: string) =>
    db.project(projectId) ??
    refuse(404, `The hub keeps no project ${projectId}.`);

  const row = (id: string): InstanceRow | undefined =>
    db.getInstancesByIds([id])[0] as InstanceRow | undefined;

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
   * an attempt landing or failing, a needs-you item; routines, GitHub events
   * and check results call it the same way). One message to its session,
   * starting the session when it has none. Nothing while Caw is off; there
   * is no timer behind it. Answers whether a model was woken.
   */
  const wake = async (projectId: string, event: string): Promise<boolean> => {
    const lead = await leadFor(projectId, event);
    if (!lead) {
      return false;
    }
    if (!lead.started) {
      message(lead.row, event);
    }
    return true;
  };

  /** Logs a wake that failed: an event is never lost silently. */
  const wakeQuietly = (projectId: string, event: string): void => {
    wake(projectId, event).catch((error: unknown) =>
      console.warn(
        `[caw] ${projectId}: Caw was not woken: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  /** Ends the project's Caw session and clears the lead. */
  const retire = (project: ReturnType<typeof projectOf>): void => {
    if (project.leadInstanceId) {
      end(project.leadInstanceId);
    }
    db.setProjectCaw(project.id, { leadInstanceId: null });
  };

  const view = (projectId: string): CawView => {
    const project = projectOf(projectId);
    return {
      on: project.caw,
      harness: project.cawHarness,
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

  /** A project's threads, newest first, each with its last message. */
  const threads = (projectId: string) => {
    projectOf(projectId);
    return { threads: db.projectThreads(projectId).map(threadOf) };
  };

  /** A thread and its messages, oldest first. */
  const read = (projectId: string, threadId: string) => {
    const thread = threadIn(projectId, threadId);
    return {
      thread: threadOf(thread),
      messages: db.threadMessages(thread.id).map(messageOf),
    };
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

    /** Turns Caw on or off, or moves it to another harness; a lead it had is ended. */
    configure(
      projectId: string,
      change: { harness?: string; on?: boolean }
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
      const moved = harness !== undefined && harness !== project.cawHarness;
      if ((!on && project.caw) || moved) {
        retire(project);
      }
      db.setProjectCaw(projectId, {
        caw: on,
        ...(harness ? { cawHarness: harness } : {}),
      });
      return view(projectId);
    },

    threads,
    read,

    /** Starts a thread with your first message, and wakes Caw with it. */
    async start(projectId: string, raw: string) {
      const body = bodyOf(raw);
      listening(projectId);
      const { thread, message: first } = db.createThread({
        id: crypto.randomUUID(),
        projectId,
        title: titleFrom(body),
        body,
      });
      await wake(projectId, yourWords(thread, body, true));
      return { thread: threadOf(thread), message: messageOf(first) };
    },

    /** Adds your message to a thread, and wakes Caw with it. */
    async say(projectId: string, threadId: string, raw: string) {
      const body = bodyOf(raw);
      threadIn(projectId, threadId);
      listening(projectId);
      const { thread, message: said } = db.addThreadMessage({
        threadId,
        author: "you",
        body,
      });
      await wake(projectId, yourWords(thread, body, false));
      return { thread: threadOf(thread), message: messageOf(said) };
    },

    /**
     * A task changed: one that entered a stage of kind `you` by anyone but
     * Caw or you wakes Caw (a needs-you item).
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
            wakeQuietly(
              projectId,
              `${waiting.id} “${waiting.title}” now waits for the person in ${waiting.stage}.`
            );
          }
        })
        .catch(() => undefined);
    },

    /**
     * An attempt at a task ended while the project has no Caw session yet:
     * Caw starts and hears it. With a session, the attempt's report reaches it
     * as the lead (work-items.ts `reportees`).
     */
    itemEnded(item: WorkItemRow): void {
      const project = item.projectId ? db.project(item.projectId) : undefined;
      if (!(project?.caw && item.taskId) || project.leadInstanceId) {
        return;
      }
      const said =
        item.state === "done"
          ? (item.digest ?? item.result ?? "").trim()
          : (item.error ?? "").trim();
      wakeQuietly(
        project.id,
        `The attempt at ${item.taskId} (“${item.title}”) ended ${item.state}.${said ? `\n\n${said.slice(0, 2000)}` : ""}`
      );
    },

    /** Caw's thread tools, for the session `actor`; refused to any session but its project's lead. */
    tools(actor: InstanceRow | undefined) {
      const mine = (): string => {
        const projectId = actor?.projectId;
        const project = projectId ? db.project(projectId) : undefined;
        if (!(actor && project && project.leadInstanceId === actor.id)) {
          throw new Error(
            "Threads are the project lead's: this session is not its project's Caw."
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
              ok(thread ? read(projectId, thread) : threads(projectId))
            );
          }
        ),
        tool(
          "thread_reply",
          "Answer the person in a thread. This is the only way the person reads what you say: your words outside it are not shown to them.",
          {
            thread: z.string().describe("The thread's id, from its message."),
            body: z.string().trim().min(1).describe("What you say, markdown."),
          },
          ({ thread, body }) => {
            const projectId = mine();
            threadIn(projectId, thread);
            const { message: said } = db.addThreadMessage({
              threadId: thread,
              author: "caw",
              body,
            });
            return Promise.resolve(ok({ ok: true, message: said.id }));
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

/** The routes for a project's Caw and its threads. */
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
    );
