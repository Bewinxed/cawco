/**
 * "Make this a project" (Projects §2, "Caw suggests, you escalate"). A plain
 * session (no project, started by you) that outgrows itself is offered,
 * once, to become a project; nothing here ever makes one on its own.
 *
 * What counts as outgrowing is code, never a model, and each is cheap enough
 * to ask at every turn's end and every delegate's spawn:
 * - `delegates`: it started a delegate;
 * - `days`: it has been going for more than a day, so it was active on two;
 * - `plan`: its plan still has {@link PLAN_ITEMS} or more open items as a turn
 *   ends (TodoWrite's list as the transcript carries it, or Claude Code's
 *   task ledger, read only after a turn that wrote it);
 * - `repo`: its folder belongs to no project, and another session is working
 *   in the same repository (normalised `origin`, projects.ts) on any machine.
 *
 * A session that was offered, whatever it answered, is never offered again:
 * the `project_offers` row says so. Accepting makes or joins the project
 * through the same path the dashboard's "New project" takes, moves the
 * session and its delegates into it, and files the plan's open items as
 * proposed tasks in the project's first to-do stage.
 */

import type {
  CommandResult,
  InstanceRow,
  ProjectOfferReason,
  ProjectOfferSummary,
  ThreadSummary,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import { z } from "zod";
import { tool } from "./admin-tools";
import type { DbShape, ProjectOfferRow, ProjectRow } from "./db";
import { readClaudeLedger } from "./harness-plans";
import { FolderRefusal, refused } from "./project-folder";
import { normaliseRemote, placePath } from "./projects";
import type { TaskActor, Tasks } from "./tasks";

/** Open plan items at a turn's end that make a plan worth a project. */
export const PLAN_ITEMS = 5;
const DAY_MS = 86_400_000;
/** The label a task filed from a session's plan carries until someone takes it up. */
export const PROPOSED_LABEL = "proposed";
/** Task titles are one line of at most 200 characters (tasks.ts). */
const TITLE_MAX = 200;
/** A git read is local; past this the machine is not going to answer it. */
const READ_MS = 10_000;
/** The tools that write Claude Code's task ledger: a turn using one moved the plan. */
const LEDGER_TOOLS = new Set(["TaskCreate", "TaskUpdate"]);
/** TodoWrite (Claude Code) and todowrite (OpenCode) carry the whole list in their input. */
const TODO_TOOLS = new Set(["todowrite"]);

/** One open item of a session's plan. */
export interface PlanItem {
  description?: string;
  subject: string;
}

export interface AcceptResult {
  /** True when the session's folder joined a project that already had its repository. */
  joined: boolean;
  project: { id: string; name: string };
  /** The sessions moved into it: this one, then its delegates. */
  sessions: string[];
  /** A new project's Setup thread, where its Caw sets it up; none when the folder joined one. */
  setupThread?: ThreadSummary;
  /** Plan items filed as proposed tasks, and the ones the project refused. */
  tasks: { id: string; title: string }[];
  unfiled: { title: string; why: string }[];
}

type InstanceShape = ReturnType<DbShape["listInstances"]>[number];

export interface ProjectOffersDeps {
  /** Makes the project with Caw, or joins the one that has the folder's remote (server.ts, POST /api/projects). */
  createProject: (asked: {
    name: string;
    checkout: { machineId: string; cwd: string };
    caw: true;
  }) => Promise<{ project: ProjectRow; placeAdded: boolean; joined: boolean }>;
  db: DbShape;
  /** Sessions moved into a project: their machines' rails are published again. */
  moved: (machineIds: string[]) => void;
  online: (machineId: string) => boolean;
  /** To every dashboard: the session's standing offer, or null once answered. */
  publish: (row: InstanceShape, offer: ProjectOfferSummary | null) => void;
  run: (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number
  ) => Promise<CommandResult>;
  /** Opens a new project's Setup thread with a note and wakes its Caw to set it up (caw.ts `setup`). */
  setup: (
    projectId: string,
    note: { body?: string; title: string }
  ) => ThreadSummary;
  tasks: Tasks;
}

const summaryOf = (row: ProjectOfferRow): ProjectOfferSummary => ({
  instanceId: row.instanceId,
  reason: row.reason,
  line: row.line,
  offeredAt: row.offeredAt.getTime(),
});

const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

const leaf = (path: string): string =>
  path.split("/").filter(Boolean).at(-1) ?? path;

/** A plan item's subject as a task title: one line, within the limit. */
const titleOf = (subject: string): string => {
  const line = subject.replace(/\s+/g, " ").trim();
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
};

export const createProjectOffers = (deps: ProjectOffersDeps) => {
  const { db } = deps;
  /** The latest TodoWrite list each session's transcript carried. */
  const todos = new Map<string, PlanItem[]>();
  /** Sessions whose turn wrote the task ledger: read it at the turn's end. */
  const ledgerMoved = new Set<string>();
  /** `machine:folder` → its normalised remote (null: none). Read once per folder. */
  const remotes = new Map<string, Promise<string | null>>();
  /** Sessions being looked at now, so a burst of ends asks once. */
  const looking = new Set<string>();

  const rowOf = (id: string): InstanceShape | undefined =>
    db.getInstancesByIds([id])[0];

  /** A session you started and nothing put in a project: the only kind offered. */
  const plain = (row: InstanceShape | undefined): row is InstanceShape =>
    !!row &&
    !row.projectId &&
    !row.parentInstanceId &&
    !row.workItemId &&
    !row.workflowStepId &&
    row.kind === "mainline" &&
    row.status !== "discarded";

  const descendants = (id: string, rows: InstanceShape[]): InstanceShape[] => {
    const found: InstanceShape[] = [];
    const queue = [id];
    while (queue.length > 0) {
      const parent = queue.shift();
      for (const row of rows) {
        if (row.parentInstanceId === parent && !found.includes(row)) {
          found.push(row);
          queue.push(row.id);
        }
      }
    }
    return found;
  };

  const remoteOf = (
    machineId: string,
    cwd: string
  ): Promise<string | null | undefined> => {
    const key = `${machineId}:${placePath(cwd)}`;
    const known = remotes.get(key);
    if (known) {
      return known;
    }
    if (!deps.online(machineId)) {
      // Not known, which is not "no remote": asked again when it is back.
      return Promise.resolve(undefined);
    }
    const reading = deps
      .run(machineId, placePath(cwd), "git remote get-url origin", READ_MS)
      .then((result) =>
        result.exitCode === 0 ? normaliseRemote(result.stdout) : null
      )
      // A folder that is gone answers nothing, now or later.
      .catch(() => null);
    remotes.set(key, reading);
    return reading;
  };

  /** Claude Code's ledger for the session, open items only, in id order. */
  const readLedger = async (row: InstanceShape): Promise<PlanItem[]> =>
    (await readClaudeLedger(deps, row))
      .filter((task) => task.status !== "completed")
      .map(({ subject, description }) => ({
        subject,
        ...(description ? { description } : {}),
      }));

  /** The session's open plan: its ledger, else the TodoWrite list it last wrote. */
  const planOf = async (row: InstanceShape): Promise<PlanItem[]> => {
    const ledger = await readLedger(row);
    return ledger.length > 0 ? ledger : (todos.get(row.id) ?? []);
  };

  /** Files a plan's items as proposed tasks, in plan order; the ones the project refused, with why. */
  const filePlan = async (
    projectId: string,
    plan: PlanItem[],
    actor: TaskActor
  ): Promise<{
    filed: AcceptResult["tasks"];
    unfiled: AcceptResult["unfiled"];
  }> => {
    const filed: AcceptResult["tasks"] = [];
    const unfiled: AcceptResult["unfiled"] = [];
    for (const item of plan) {
      const title = titleOf(item.subject);
      if (!title) {
        continue;
      }
      try {
        // biome-ignore lint/performance/noAwaitInLoops: task numbers are handed out in plan order
        const task = await deps.tasks.create(
          projectId,
          {
            title,
            labels: [PROPOSED_LABEL],
            ...(item.description ? { description: item.description } : {}),
          },
          actor
        );
        filed.push({ id: task.id, title: task.title });
      } catch (error) {
        unfiled.push({
          title,
          why: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { filed, unfiled };
  };

  const offer = (
    row: InstanceShape,
    reason: ProjectOfferReason,
    line: string
  ): void => {
    if (!db.offerProject({ instanceId: row.id, reason, line })) {
      return;
    }
    const filed = db.projectOffer(row.id);
    if (filed) {
      deps.publish(row, summaryOf(filed));
    }
  };

  /** The `repo` signal: another session in this folder's repository, which no project has. */
  const sharedRepository = async (
    row: InstanceShape,
    rows: InstanceShape[]
  ): Promise<string | undefined> => {
    const cwd = placePath(row.cwd);
    if (
      db
        .listProjects()
        .some((project) =>
          project.places.some(
            (place) => place.machineId === row.machineId && place.path === cwd
          )
        )
    ) {
      return;
    }
    const remote = await remoteOf(row.machineId, cwd);
    if (!remote || db.projectByRemote(remote)) {
      return;
    }
    const mine = new Set([
      row.id,
      ...descendants(row.id, rows).map((r) => r.id),
    ]);
    const others = rows.filter(
      (other) =>
        !(
          mine.has(other.id) ||
          other.parentInstanceId ||
          other.workflowStepId
        ) &&
        other.kind === "mainline" &&
        ["running", "starting", "sleeping"].includes(other.status)
    );
    for (const other of others) {
      // biome-ignore lint/performance/noAwaitInLoops: one git read per folder, cached; stops at the first match
      if ((await remoteOf(other.machineId, other.cwd)) === remote) {
        const where =
          other.machineId === row.machineId ? "" : ` on ${other.machineId}`;
        return `Another session is working in ${remote}${where}. Make this one a project?`;
      }
    }
  };

  /** Asks every signal, cheapest first, and offers on the first that holds. */
  const consider = async (id: string, at: "turn" | "spawn"): Promise<void> => {
    const row = rowOf(id);
    if (!plain(row) || db.projectOffer(id) || looking.has(id)) {
      return;
    }
    looking.add(id);
    try {
      const rows = db.listInstances();
      const delegates = rows.filter((r) => r.parentInstanceId === id).length;
      if (delegates > 0) {
        offer(
          row,
          "delegates",
          `This session started ${plural(delegates, "delegate", "delegates")}. Make it a project?`
        );
        return;
      }
      if (at === "spawn") {
        return;
      }
      const age = Date.now() - row.createdAt.getTime();
      if (age > DAY_MS) {
        const days = Math.floor(age / DAY_MS);
        offer(
          row,
          "days",
          `This session has been going for ${days === 1 ? "over a day" : `${days} days`}. Make it a project?`
        );
        return;
      }
      const moved = ledgerMoved.delete(id);
      const open = moved
        ? (await readLedger(row)).length
        : (todos.get(id)?.length ?? 0);
      if (open >= PLAN_ITEMS) {
        offer(
          row,
          "plan",
          `This session's plan has ${open} open items. Make it a project?`
        );
        return;
      }
      const shared = await sharedRepository(row, rows);
      if (shared) {
        offer(row, "repo", shared);
      }
    } finally {
      looking.delete(id);
    }
  };

  const quietly = (work: Promise<void>, id: string): void => {
    work.catch((error: unknown) =>
      console.warn(
        `[project-offers] ${id}: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  };

  const answerable = (id: string): InstanceShape => {
    const row = rowOf(id);
    if (!row) {
      throw new FolderRefusal(404, "No session with that id on this hub.");
    }
    return row;
  };

  return {
    /** Reads a transcript frame for the plan: TodoWrite's list, or a ledger write. */
    observe(instanceId: string, message: unknown): void {
      const frame = message as {
        type?: string;
        message?: { content?: unknown };
      };
      if (
        frame.type !== "assistant" ||
        !Array.isArray(frame.message?.content)
      ) {
        return;
      }
      for (const block of frame.message.content as {
        type?: string;
        name?: string;
        input?: { todos?: { content?: unknown; status?: unknown }[] };
      }[]) {
        if (block.type !== "tool_use" || typeof block.name !== "string") {
          continue;
        }
        if (LEDGER_TOOLS.has(block.name)) {
          ledgerMoved.add(instanceId);
        } else if (
          TODO_TOOLS.has(block.name.toLowerCase()) &&
          Array.isArray(block.input?.todos)
        ) {
          todos.set(
            instanceId,
            block.input.todos
              .filter(
                (todo) =>
                  typeof todo.content === "string" &&
                  todo.status !== "completed" &&
                  todo.status !== "cancelled"
              )
              .map((todo) => ({ subject: todo.content as string }))
          );
        }
      }
    },

    /** A turn ended: is the session past plain? */
    turnEnded(instanceId: string): void {
      quietly(consider(instanceId, "turn"), instanceId);
    },

    /** A session started a delegate: offer it, if it is plain. */
    delegateSpawned(parentInstanceId: string): void {
      quietly(consider(parentInstanceId, "spawn"), parentInstanceId);
    },

    /** The offers standing now, for a dashboard that just opened. */
    open(): ProjectOfferSummary[] {
      return db
        .openProjectOffers()
        .filter((row) => plain(rowOf(row.instanceId)))
        .map(summaryOf);
    },

    /** "Not now": recorded, so it is never offered again. */
    dismiss(instanceId: string): void {
      const row = answerable(instanceId);
      db.answerProjectOffer(instanceId, "dismissed");
      deps.publish(row, null);
    },

    /**
     * "Make project": the project from the session's machine and folder (or
     * the one that already has its repository), the session and its
     * delegates in it, and its open plan items as proposed tasks.
     */
    async accept(instanceId: string, actor: TaskActor): Promise<AcceptResult> {
      const row = answerable(instanceId);
      if (row.projectId) {
        throw new FolderRefusal(
          409,
          "This session is already in a project; there is nothing to make."
        );
      }
      if (row.parentInstanceId || row.workItemId || row.workflowStepId) {
        throw new FolderRefusal(
          409,
          "A delegate or a workflow step belongs to the session that started it. Make that session the project."
        );
      }
      const { project, joined } = await deps.createProject({
        name: leaf(placePath(row.cwd)),
        checkout: { machineId: row.machineId, cwd: row.cwd },
        caw: true,
      });
      const moving = [row, ...descendants(row.id, db.listInstances())];
      db.setInstancesProject(
        moving.map((r) => r.id),
        project.id
      );
      deps.moved([...new Set(moving.map((r) => r.machineId))]);
      db.answerProjectOffer(row.id, "accepted", project.id);
      deps.publish(row, null);

      const { filed, unfiled } = await filePlan(
        project.id,
        await planOf(row),
        actor
      );
      todos.delete(row.id);
      // A new project is set up with Caw once its plan is on the board.
      const setupThread = joined
        ? undefined
        : deps.setup(project.id, {
            title: `Project · made from ${row.title || leaf(row.cwd)}`,
            body: filed.length
              ? `Its plan is on the board as ${plural(filed.length, "proposed task", "proposed tasks")}: ${filed.map((task) => task.id).join(", ")}.`
              : "",
          });
      return {
        joined,
        project: { id: project.id, name: project.name },
        sessions: moving.map((r) => r.id),
        tasks: filed,
        unfiled,
        ...(setupThread ? { setupThread } : {}),
      };
    },
  };
};

export type ProjectOffers = ReturnType<typeof createProjectOffers>;

/** The dashboard's routes: the standing offers, and their two answers. */
export const projectOfferRoutes = (offers: ProjectOffers, you: TaskActor) =>
  new Elysia()
    .get("/api/project-offers", () => offers.open())
    .post(
      "/api/project-offers/:instanceId/dismiss",
      { params: t.Object({ instanceId: t.String() }) },
      ({ params }) => {
        try {
          offers.dismiss(params.instanceId);
          return { ok: true };
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/project-offers/:instanceId/accept",
      { params: t.Object({ instanceId: t.String() }) },
      async ({ params }) => {
        try {
          return await offers.accept(params.instanceId, you);
        } catch (error) {
          return refused(error);
        }
      }
    );

/** The MCP tool's name: Caw proposes it in conversation, and you say yes. */
export const PROJECT_FROM_SESSION = "project_from_session";

/**
 * `project_from_session`, for a session you started: the same accept as the
 * dashboard's "Make project", on the calling session. Without `accept` it is
 * the listing's copy, which runs nothing.
 */
export const projectFromSessionTool = (accept?: () => Promise<AcceptResult>) =>
  tool(
    PROJECT_FROM_SESSION,
    "Make this session a project: its machine and folder become the project's place (or it joins the project that already has this repository), this session and its delegates move into it, and its open plan items are filed as tasks labelled `proposed`. Offer it in conversation when the work has outgrown one session (it runs for days, starts delegates, leaves follow-ups), and call it only after the operator says yes.",
    {
      confirm: z
        .literal(true)
        .describe("True: the operator said yes to making it a project."),
    },
    async () => {
      if (!accept) {
        throw new Error("Discovery cannot execute tools");
      }
      const result = await accept();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
      };
    }
  );

/** Whether a session may make itself a project: one you started, and in none yet. */
export const mayMakeProject = (actor: InstanceRow): boolean =>
  !(
    actor.parentInstanceId ||
    actor.workItemId ||
    actor.workflowStepId ||
    actor.projectId
  );
