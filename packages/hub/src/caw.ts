/**
 * Caw as a project's lead (Projects spec §5.3, §5.6). A per-project setting:
 *
 * - **On**: a lead session on the project's chosen harness (`caw_harness`,
 *   claude or opencode; pi cannot deny tools), in the `lead` role
 *   (roles.ts): board, task and thread tools, its harness spawned with edit
 *   and shell tools denied. It is started on the project's first event, not
 *   when Caw is turned on, and it becomes the project's lead
 *   (`projects.lead_instance_id`), so the reports and asks that already go
 *   to a lead (work-items.ts `reportees`) reach it.
 * - **Woken only by events**: your message in a thread, an attempt at a task
 *   landing or failing, a task entering a stage that waits on you, and an
 *   ask routed to the lead. Never by a timer: nothing here schedules.
 * - **Off**: nothing for the project wakes a model. Turning it off stops the
 *   lead session and clears the project's lead, so reports and asks go to
 *   the parent and to you, as they did before there was a lead.
 *
 * Each lead shows its spend: the usage buckets its machine reports, as
 * work-item budgets read them, summed over every lead session the project
 * has had.
 */
import type {
  InstanceRow,
  InstanceStatus,
  NeutralOrigin,
  SpawnPayload,
} from "@cawco/core";
import { Elysia, status, t } from "elysia";
import type { DbShape, ProjectRow, WorkItemRow } from "./db";
import type { TaskEvent, Tasks } from "./tasks";

/** What wakes Caw. */
export type CawEvent =
  | { kind: "thread"; threadId: string; title: string; body: string }
  | {
      kind: "attempt";
      taskId: string;
      title: string;
      state: WorkItemRow["state"];
      error: string | null;
      prUrl: string | null;
    }
  | { kind: "needs-you"; taskId: string; title: string; stage: string };

/** Whether an event reached Caw: off (nothing woke), or sent to its lead session. */
export type CawWake = "off" | "sent";

/** The harnesses a lead can run on: each can deny edit and shell tools. */
export const CAW_HARNESSES = ["claude", "opencode"] as const;
export type CawHarness = (typeof CAW_HARNESSES)[number];

/** A project's Caw, as the dashboard reads it. */
export interface CawView {
  harness: CawHarness;
  /** The lead session Caw runs now; null before its first event, and while off. */
  instanceId: string | null;
  model: string | null;
  on: boolean;
  /** Dollars every lead session of the project has spent, from its machines' usage reports. */
  spentUsd: number;
  /** The lead session's status; null without one. */
  status: InstanceStatus | null;
}

/** A change to a project's Caw; what is left out stays. */
export interface CawChange {
  harness?: CawHarness;
  /** Null leaves the model to the harness. */
  model?: string | null;
  on?: boolean;
}

/** What Caw needs of the hub. */
export interface CawDeps {
  readonly db: Pick<
    DbShape,
    | "cawSpendUsd"
    | "getInstancesByIds"
    | "project"
    | "setProjectCaw"
    | "setProjectDispatch"
  >;
  /** Whether a machine is connected now. */
  readonly online: (machineId: string) => boolean;
  /** One message into a session; answers why it did not go, or undefined when it did. */
  readonly send: (
    row: InstanceRow,
    content: string,
    origin: NeutralOrigin
  ) => string | undefined;
  /** Starts the lead session in the `lead` role; resolves once its machine has it in place. */
  readonly start: (machineId: string, payload: SpawnPayload) => Promise<void>;
  /** Stops a session. */
  readonly stop: (instanceId: string) => void;
  readonly tasks: Pick<Tasks, "get">;
}

/** Why Caw could not take an event, as the route's answer. */
export class CawRefusal extends Error {
  readonly code: 400 | 404 | 409;
  constructor(code: 400 | 404 | 409, message: string) {
    super(message);
    this.code = code;
  }
}

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A lead session that has ended for good: its conversation cannot be woken again. */
const gone = (row: InstanceRow): boolean =>
  row.status === "discarded" ||
  (!row.sessionId && (row.status === "stopped" || row.status === "error"));

/** What the lead reads first, once, before its first event. */
const brief = (project: ProjectRow): string =>
  [
    `You are Caw, the lead of the project “${project.name}” in CawCo.`,
    "You are woken only by events: the operator's message in one of the project's threads, an attempt at a task landing or failing, a task waiting on the operator, or a delegate's ask. Each arrives as a message here. Nothing wakes you on a timer, so act on the event in front of you and end your turn.",
    "You have no edit or shell tools. You work through the cawco tools: task_read, task_create, task_update and task_link for the board; task_start and task_retry to start work, which runs as delegates and reports to you; handoff, answer_delegate, interrupt_delegate and stop_delegate to steer the project's work items; thread_list, thread_read and thread_reply for threads.",
    "The operator reads threads, not this transcript: answer a thread message with thread_reply in that thread. Keep replies short and plain. When an event needs nothing from you, end your turn without a reply.",
  ].join("\n\n");

/** An event as the lead reads it. */
const eventText = (event: CawEvent): string => {
  switch (event.kind) {
    case "thread":
      return `In the thread “${event.title}” (${event.threadId}), the operator wrote:\n\n${event.body}\n\nReply with thread_reply({ thread: "${event.threadId}", body: … }).`;
    case "attempt": {
      if (event.state === "done") {
        return event.prUrl
          ? `${event.taskId} “${event.title}”: its attempt opened ${event.prUrl}, which waits for review.`
          : `${event.taskId} “${event.title}”: its attempt landed.`;
      }
      const why = event.error ? `\n\n${event.error}\n\n` : " ";
      return `${event.taskId} “${event.title}”: its attempt ${event.state === "cancelled" ? "was cancelled" : "failed"}.${why}The task is back in its todo stage, marked failed; task_retry starts a fresh attempt.`;
    }
    default:
      return `${event.taskId} “${event.title}” entered ${event.stage}, which waits on the operator.`;
  }
};

export const createCaw = (deps: CawDeps) => {
  const { db, tasks } = deps;
  /** Lead sessions being started, by project: one start, however many events arrive meanwhile. */
  const starting = new Map<string, Promise<InstanceRow>>();

  const projectOf = (projectId: string): ProjectRow => {
    const project = db.project(projectId);
    if (!project) {
      throw new CawRefusal(404, `No project ${projectId}.`);
    }
    return project;
  };

  /** The project's lead when it is Caw's session and can still be woken. */
  const leadOf = (project: ProjectRow): InstanceRow | undefined => {
    const [row] = project.leadInstanceId
      ? db.getInstancesByIds([project.leadInstanceId])
      : [];
    return row &&
      row.role === "lead" &&
      row.projectId === project.id &&
      !gone(row)
      ? row
      : undefined;
  };

  /** Where a new lead runs: the primary checkout when its machine is online, else another online checkout. */
  const placeFor = (
    project: ProjectRow
  ): { machineId: string; cwd: string } => {
    if (deps.online(project.machineId)) {
      return { machineId: project.machineId, cwd: project.cwd };
    }
    const place = project.places.find(
      (each) => each.kind === "checkout" && deps.online(each.machineId)
    );
    if (!place) {
      throw new CawRefusal(
        409,
        "No machine with one of the project's checkouts is online, so Caw cannot start."
      );
    }
    return { machineId: place.machineId, cwd: place.path };
  };

  /** Starts a lead session and makes it the project's lead; it reads its brief and `first`. */
  const startLead = async (
    project: ProjectRow,
    first: string,
    origin: NeutralOrigin
  ): Promise<InstanceRow> => {
    const { machineId, cwd } = placeFor(project);
    const instanceId = crypto.randomUUID();
    await deps.start(machineId, {
      instanceId,
      cwd,
      harness: project.cawHarness,
      projectId: project.id,
      title: "Caw",
      ...(project.cawModel ? { model: project.cawModel } : {}),
    });
    db.setProjectDispatch(project.id, { leadInstanceId: instanceId });
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      throw new Error("Caw's lead session was not filed.");
    }
    const refused = deps.send(
      row,
      `${brief(project)}\n\n---\n\n${first}`,
      origin
    );
    if (refused) {
      throw new Error(refused);
    }
    return row;
  };

  /**
   * Hands an event to the project's lead, starting it on the first one.
   * Off: nothing happens, and that is the answer.
   */
  const wake = async (projectId: string, event: CawEvent): Promise<CawWake> => {
    const project = projectOf(projectId);
    if (!project.caw) {
      return "off";
    }
    const text = eventText(event);
    const origin: NeutralOrigin =
      event.kind === "thread"
        ? { kind: "human" }
        : { kind: "system", name: "caw" };
    const pending = starting.get(projectId);
    if (pending) {
      const row = await pending;
      const refused = deps.send(row, text, origin);
      if (refused) {
        throw new Error(refused);
      }
      return "sent";
    }
    const lead = leadOf(project);
    if (lead && deps.online(lead.machineId)) {
      const refused = deps.send(lead, text, origin);
      if (refused) {
        throw new Error(refused);
      }
      return "sent";
    }
    const started = startLead(project, text, origin);
    starting.set(projectId, started);
    try {
      await started;
    } finally {
      starting.delete(projectId);
    }
    return "sent";
  };

  /** Wakes Caw for an event the hub noticed itself; a failure is said in the log, not thrown. */
  const noticed = (projectId: string, event: CawEvent): void => {
    wake(projectId, event).catch((error: unknown) =>
      console.warn(
        `[caw] ${projectId}: ${event.kind} did not reach Caw: ${said(error)}`
      )
    );
  };

  const view = (projectId: string): CawView => {
    const project = projectOf(projectId);
    const lead = leadOf(project);
    return {
      on: project.caw,
      harness: project.cawHarness,
      model: project.cawModel,
      instanceId: lead?.id ?? null,
      status: lead?.status ?? null,
      spentUsd: db.cawSpendUsd(projectId),
    };
  };

  /**
   * Clears the project's lead and stops `lead`, Caw's session. The setting
   * stands even when the stop does not go through (its machine is away or
   * behind): nothing routes to the session any more, and the log says so.
   */
  const retire = (project: ProjectRow, lead: InstanceRow): void => {
    db.setProjectDispatch(project.id, { leadInstanceId: null });
    if (lead.status === "stopped") {
      return;
    }
    try {
      deps.stop(lead.id);
    } catch (error) {
      console.warn(
        `[caw] ${project.id}: Caw's lead session ${lead.id} did not stop: ${said(error)}`
      );
    }
  };

  return {
    wake,
    view,

    /** Whether the project's lead is Caw, so naming another lead is refused while it is on. */
    isOn(projectId: string): boolean {
      return db.project(projectId)?.caw ?? false;
    },

    /**
     * Turns Caw on or off, or changes what it runs on. Off stops its lead
     * session and clears the project's lead; a new harness or model stops it
     * too, so the next event starts it on what was chosen.
     */
    configure(projectId: string, change: CawChange): CawView {
      const project = projectOf(projectId);
      const { on, harness, model } = change;
      if (harness !== undefined && !CAW_HARNESSES.includes(harness)) {
        throw new CawRefusal(
          400,
          `Caw runs on ${CAW_HARNESSES.join(" or ")}, which can deny it edit and shell tools; not “${harness}”.`
        );
      }
      const moved =
        (harness !== undefined && harness !== project.cawHarness) ||
        (model !== undefined && (model || null) !== project.cawModel);
      const lead =
        on === false || (moved && project.caw) ? leadOf(project) : undefined;
      db.setProjectCaw(projectId, {
        ...(on === undefined ? {} : { caw: on }),
        ...(harness === undefined ? {} : { cawHarness: harness }),
        ...(model === undefined ? {} : { cawModel: model || null }),
      });
      if (lead) {
        retire(project, lead);
      }
      return view(projectId);
    },

    /**
     * An attempt at a task ended. A lead that is already Caw heard its
     * report (work-items.ts `reportees`); otherwise Caw is woken, and starts.
     */
    itemEnded(item: WorkItemRow): void {
      const { projectId, taskId } = item;
      if (!(projectId && taskId)) {
        return;
      }
      const project = db.project(projectId);
      if (!project?.caw || leadOf(project)) {
        return;
      }
      if (!["done", "failed", "cancelled"].includes(item.state)) {
        return;
      }
      noticed(projectId, {
        kind: "attempt",
        taskId,
        // An attempt is titled after its task: `tsk-3 Fix the toggle`.
        title: item.title.startsWith(`${taskId} `)
          ? item.title.slice(taskId.length + 1)
          : item.title,
        state: item.state,
        error: item.error ?? null,
        prUrl: item.prUrl ?? null,
      });
    },

    /**
     * A task entered a stage that waits on you: Caw hears it. Your own moves,
     * Caw's and the hub's (an attempt's result, told as the attempt) do not
     * wake it.
     */
    taskChanged(event: TaskEvent): void {
      if (
        event.kind === "changed" ||
        event.actor.mover === "you" ||
        event.actor.mover === "lead" ||
        event.actor.mover === "hub"
      ) {
        return;
      }
      const { projectId, id } = event;
      if (!db.project(projectId)?.caw) {
        return;
      }
      tasks
        .get(projectId, id)
        .then((task) => {
          if (task.kind === "you") {
            noticed(projectId, {
              kind: "needs-you",
              taskId: task.id,
              title: task.title,
              stage: task.stage,
            });
          }
        })
        .catch((error: unknown) =>
          console.warn(
            `[caw] ${projectId}: ${id} could not be read: ${said(error)}`
          )
        );
    },
  };
};

export type Caw = ReturnType<typeof createCaw>;

const answer = (error: unknown) =>
  error instanceof CawRefusal
    ? status(error.code, error.message)
    : status(500, said(error));

/** The dashboard's routes for a project's Caw. */
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
          harness: t.Optional(t.Union(CAW_HARNESSES.map((h) => t.Literal(h)))),
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
    );
