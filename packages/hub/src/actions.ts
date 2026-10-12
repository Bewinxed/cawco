/**
 * Approved actions (Projects spec §5.5, P3): "you approve one exact tool call
 * (connection, account, arguments); the hub runs it once at its time through
 * the connection (outbox, idempotency key). Never a model."
 *
 * THE INVARIANT: the hub calls exactly the approved call (the same
 * connection, tool and arguments, byte for byte) at most once, at or after
 * its time, never before your approval, and never through a model.
 *
 * - **Proposing** (`action_propose`, a session you started or a project's
 *   Caw): the call is checked (a connection its type or project lists, a
 *   tool the server lists, arguments its input schema takes) and filed
 *   `proposed`. Its arguments are serialised once into the row and never
 *   written again; the row holds their SHA-256 and an idempotency key. The
 *   session is answered at once: nothing waits on you.
 * - **Approving** is yours alone, through `/api/actions/:id/approve`, which
 *   names the hash of the arguments the card showed: a hash that is not the
 *   row's is refused. Denied and cancelled actions never run.
 * - **Running**: the scheduler claims a due approved action in ONE
 *   transaction (approved → running, db/actions.ts `claim`), then makes the
 *   one call ({@link Connections.callOnce}), with the idempotency key in the
 *   request's `_meta`, then files done, failed or unknown. Nothing is
 *   retried. A row a stopped hub left running is never called again: it
 *   becomes unknown, and Needs you says to check the service. A failed
 *   one needs you too, with the hub's or the service's reason, as a
 *   routine's second failure does; both stand until you remove them.
 * - **Stage moves**: a done action with a task and a `then_stage` moves its
 *   task there as the mover `action`; the stage engine lets no other path
 *   make an `action` move (tasks.ts `actionMove`).
 *
 * The idempotency key rides in `_meta` under `dev.cawco/idempotency-key`
 * and, for proxies that read it, `idempotency-key`. MCP itself has no such
 * field (SEP-3182 proposed one and was closed), so a server dedupes on it
 * only if it reads that key; the hub's own at-most-once does not depend on it.
 */
import { createHash } from "node:crypto";
import type { ApprovedActionView, InstanceRow, SessionRole } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import Ajv2020 from "ajv/dist/2020";
import { Elysia, status, t } from "elysia";
import { z } from "zod";
import { tool } from "./admin-tools";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { ActionRow } from "./db/actions";
import type { ActionState } from "./db/schema";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import type { Push } from "./push";
import { roleOf } from "./roles";
import { stageNamed } from "./stages";
import { actionActor, type Tasks } from "./tasks";

/** The longest the scheduler sleeps between looks. Our choice. */
const NAP_MS = 15_000;
/** The soonest it looks again. */
const MIN_GAP_MS = 250;
/** The largest arguments a proposal carries, as JSON. Our choice. */
const ARGS_MAX = 64 * 1024;
/** How much of the service's answer is kept. Our choice. */
const RESULT_MAX = 16 * 1024;
/** How far ahead a run may be set. Our choice. */
const AHEAD_MAX_MS = 366 * 24 * 60 * 60 * 1000;
/** A time this far past is a typo, not "now". Our choice. */
const PAST_GRACE_MS = 60_000;
const REASON_MAX = 300;
const LISTED = 50;

/** The roles that propose: a session you started, and a project's Caw. */
const PROPOSERS: ReadonlySet<SessionRole> = new Set(["worker", "lead"]);

/** The states that wait on you: Needs you shows these. */
const WAITING: readonly ActionState[] = ["proposed", "failed", "unknown"];

/** A refusal, with the status a route answers and the words a tool returns. */
export class ActionRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(code: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.status = code;
  }
}

const refuse = (code: 400 | 403 | 404 | 409, message: string): never => {
  throw new ActionRefusal(code, message);
};

const sha256 = (text: string): string =>
  createHash("sha256").update(text, "utf8").digest("hex");

const ms = (date: Date | null): number | null => date?.getTime() ?? null;

const wordsOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Text cut to `max` UTF-8 bytes. */
const capped = (text: string, max: number): string => {
  const bytes = Buffer.from(text, "utf8");
  return bytes.length <= max
    ? text
    : `${bytes.subarray(0, max).toString("utf8")}… [cut by the hub]`;
};

/** A tool result's text parts, joined: what a refusal from the service said. */
const resultText = (content: unknown): string =>
  Array.isArray(content)
    ? content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text: unknown }).text)
            : ""
        )
        .filter(Boolean)
        .join(" ")
    : "";

const ajv = new Ajv2020({ allErrors: true, strict: false });

/** Why `args` do not fit the tool's input schema, or nothing. */
const argsProblem = (
  found: Tool,
  args: Record<string, unknown>
): string | undefined => {
  const { $schema: _dialect, ...schema } = found.inputSchema as Record<
    string,
    unknown
  >;
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    return `${found.name}'s input schema does not compile, so its arguments cannot be checked: ${wordsOf(error)}`;
  }
  if (validate(args)) {
    return undefined;
  }
  const said = (validate.errors ?? [])
    .slice(0, 5)
    .map((one) => `${one.instancePath || "args"} ${one.message ?? "is wrong"}`)
    .join("; ");
  return `These arguments do not fit ${found.name}'s input schema: ${said}.`;
};

/** What a proposal is made of. */
export interface ActionProposal {
  args: Record<string, unknown>;
  connection: string;
  reason: string;
  /** ISO 8601 with a zone; absent: as soon as it is approved. */
  runAt?: string;
  task?: string;
  thenStage?: string;
  tool: string;
}

export interface ActionDeps {
  readonly connections: Pick<
    Connections,
    "callOnce" | "get" | "proposable" | "toolNamed"
  >;
  readonly db: Pick<DbShape, "actions" | "getInstancesByIds" | "project">;
  readonly lifetime: HubLifetimeShape;
  /** Every action waiting on you, to every dashboard. */
  readonly publish: (waiting: ApprovedActionView[]) => void;
  readonly push: Pick<Push, "action">;
  readonly tasks: Pick<Tasks, "get" | "move" | "stages">;
}

export const createActions = ({
  connections,
  db,
  lifetime,
  publish,
  push,
  tasks,
}: ActionDeps) => {
  const store = db.actions;
  let timer: HubTimer | undefined;
  let started = false;
  /** Task titles by `<project>/<task>`, read once each. */
  const titles = new Map<string, string>();

  const rowOf = (id: string): ActionRow =>
    store.get(id) ?? refuse(404, `There is no approved action ${id}.`);

  const view = (row: ActionRow): ApprovedActionView => {
    const [proposer] = db.getInstancesByIds([row.proposedBy]);
    return {
      id: row.id,
      projectId: row.projectId,
      projectName: db.project(row.projectId)?.name ?? null,
      taskId: row.taskId,
      taskTitle: row.taskId
        ? (titles.get(`${row.projectId}/${row.taskId}`) ?? null)
        : null,
      connection: row.connection,
      service: row.service,
      account: row.account,
      tool: row.tool,
      args: row.args,
      argsHash: row.argsHash,
      runAt: ms(row.runAt),
      reason: row.reason,
      proposedBy: row.proposedBy,
      proposerTitle:
        proposer?.title?.trim() || proposer?.derivedTitle?.trim() || null,
      state: row.state,
      approvedAt: ms(row.approvedAt),
      startedAt: ms(row.startedAt),
      endedAt: ms(row.endedAt),
      result: row.result,
      error: row.error,
      thenStage: row.thenStage,
      stageResult: row.stageResult,
      checkedAt: ms(row.checkedAt),
      createdAt: row.createdAt.getTime(),
    };
  };

  /** Every action waiting on you: proposed, or failed or unknown and not yet put away. */
  const waiting = (): ApprovedActionView[] =>
    store
      .inStates(WAITING)
      .filter((row) => row.state === "proposed" || row.checkedAt === null)
      .map(view);

  const told = (): void => publish(waiting());

  /** The phone hears of one that needs you, while it still does. */
  const pushFor = (row: ActionRow): void =>
    push.action({
      id: row.id,
      connection: row.connection,
      projectId: row.projectId,
      said: row.state === "proposed" ? row.reason : (row.error ?? row.reason),
      state:
        row.state === "proposed" || row.state === "failed"
          ? row.state
          : "unknown",
      waiting: () => {
        const now = store.get(row.id);
        return now?.state === row.state && now.checkedAt === null;
      },
    });

  // --- proposing -----------------------------------------------------------------

  /** When it runs, read from what the proposer wrote; refused when it cannot be. */
  const runAtOf = (written: string | undefined, now: number): Date | null => {
    if (written === undefined || written.trim() === "") {
      return null;
    }
    const at = Date.parse(written);
    if (Number.isNaN(at)) {
      return refuse(
        400,
        `run_at “${written}” is not a time; write ISO 8601 with a zone, like 2026-10-13T09:00:00+01:00.`
      );
    }
    if (at < now - PAST_GRACE_MS) {
      refuse(
        400,
        `run_at ${new Date(at).toISOString()} has passed; leave it out to run as soon as it is approved.`
      );
    }
    if (at > now + AHEAD_MAX_MS) {
      refuse(400, "run_at is more than a year away.");
    }
    return new Date(at);
  };

  /** The task it is for, read, and the stage it may move to; refused when either cannot be. */
  const taskOf = async (
    projectId: string,
    task: string | undefined,
    thenStage: string | undefined
  ): Promise<{ taskId: string | null; thenStage: string | null }> => {
    if (task === undefined) {
      if (thenStage !== undefined) {
        refuse(400, "then_stage moves a task: name the task too.");
      }
      return { taskId: null, thenStage: null };
    }
    let found: Awaited<ReturnType<Tasks["get"]>>;
    try {
      found = await tasks.get(projectId, task);
    } catch (error) {
      return refuse(404, wordsOf(error));
    }
    titles.set(`${projectId}/${found.id}`, found.title);
    if (thenStage === undefined) {
      return { taskId: found.id, thenStage: null };
    }
    const stages = await tasks.stages(projectId);
    const stage = stageNamed(stages, thenStage);
    if (!stage) {
      refuse(
        400,
        `${thenStage} is not a stage of this project; its stages are ${stages.stages.map((each) => each.name).join(", ")}.`
      );
    }
    const entered = stages.moves.some(
      (move) =>
        (move.to === "*" || move.to === thenStage) &&
        move.who.includes("action")
    );
    if (!(entered && (stage?.hooks.by ?? "action") === "action")) {
      refuse(
        400,
        `stages.md lets no approved action move a task to ${thenStage}; a move line naming action (like “scheduled → ${thenStage}  action”) does.`
      );
    }
    return { taskId: found.id, thenStage };
  };

  const propose = async (
    actor: InstanceRow,
    input: ActionProposal
  ): Promise<ApprovedActionView> => {
    const role = roleOf(actor);
    if (!PROPOSERS.has(role)) {
      refuse(
        403,
        "Only a session the owner started, or a project's Caw, proposes an approved action. Hand it to the session that started this one."
      );
    }
    const projectId =
      actor.projectId ??
      refuse(
        403,
        "This session is in no project, so it has no connections to propose on."
      );
    if (!connections.proposable(actor).includes(input.connection)) {
      refuse(
        403,
        `Neither this session's delegate type nor its project lists the connection ${input.connection}.`
      );
    }
    const reason = input.reason.trim();
    if (!reason || reason.length > REASON_MAX) {
      refuse(
        400,
        `reason is one sentence of up to ${REASON_MAX} characters: why this call, for the owner deciding.`
      );
    }
    const args = JSON.stringify(input.args);
    if (Buffer.byteLength(args, "utf8") > ARGS_MAX) {
      refuse(400, `args are over ${ARGS_MAX / 1024} KB as JSON.`);
    }
    const now = Date.now();
    const runAt = runAtOf(input.runAt, now);
    let found: Tool | undefined;
    try {
      found = await connections.toolNamed(input.connection, input.tool);
    } catch (error) {
      return refuse(409, wordsOf(error));
    }
    if (!found) {
      return refuse(
        404,
        `${input.connection} lists no tool ${input.tool}; give the tool's own name on its server.`
      );
    }
    const misfit = argsProblem(found, input.args);
    if (misfit) {
      refuse(400, misfit);
    }
    const linked = await taskOf(projectId, input.task, input.thenStage);
    const signedIn = connections.get(input.connection);
    const row = store.insert({
      id: crypto.randomUUID(),
      projectId,
      taskId: linked.taskId,
      connection: input.connection,
      service: signedIn.service,
      account: signedIn.account,
      tool: input.tool,
      args,
      argsHash: sha256(args),
      runAt,
      reason,
      proposedBy: actor.id,
      state: "proposed",
      idempotencyKey: `cawco-action-${crypto.randomUUID()}`,
      approvedBy: null,
      approvedAt: null,
      startedAt: null,
      endedAt: null,
      result: null,
      error: null,
      thenStage: linked.thenStage,
      stageResult: null,
      checkedAt: null,
      createdAt: new Date(now),
    });
    console.info(
      `[actions] ${row.id} proposed by ${actor.id}: ${row.connection}/${row.tool}${runAt ? ` at ${runAt.toISOString()}` : ""}`
    );
    told();
    pushFor(row);
    return view(row);
  };

  // --- deciding ------------------------------------------------------------------

  /** Refuses a call whose connection no longer signs in as the account it was proposed with. */
  const sameAccount = (row: ActionRow): string | undefined => {
    let now: ReturnType<Connections["get"]>;
    try {
      now = connections.get(row.connection);
    } catch {
      return `The connection ${row.connection} is gone.`;
    }
    return now.service === row.service && now.account === row.account
      ? undefined
      : `${row.connection} now signs in to ${now.service} as ${now.account}, not ${row.service} as ${row.account} as when it was proposed.`;
  };

  /** A move from one of `from`, or the refusal naming where it is. */
  const moved = (
    row: ActionRow,
    from: readonly ActionState[],
    patch: Parameters<typeof store.settle>[2],
    what: string
  ): ActionRow =>
    store.settle(row.id, from, patch) ??
    refuse(
      409,
      `It is ${store.get(row.id)?.state ?? "gone"}, so it cannot be ${what}.`
    );

  /** Yours: the exact call shown, named by its arguments' hash. */
  const approve = (id: string, argsHash: string): ApprovedActionView => {
    const row = rowOf(id);
    if (row.state !== "proposed") {
      refuse(409, `It is ${row.state}, not waiting for approval.`);
    }
    if (argsHash !== row.argsHash) {
      refuse(
        409,
        "These are not the arguments it was proposed with. Reload it and approve the call it shows."
      );
    }
    const drifted = sameAccount(row);
    if (drifted) {
      refuse(409, drifted);
    }
    const now = new Date();
    const approved = moved(
      row,
      ["proposed"],
      { state: "approved", approvedBy: "owner", approvedAt: now },
      "approved"
    );
    console.info(
      `[actions] ${id} approved: runs ${approved.runAt ? `at ${approved.runAt.toISOString()}` : "now"}`
    );
    told();
    schedule();
    return view(approved);
  };

  const deny = (id: string): ApprovedActionView => {
    const row = moved(
      rowOf(id),
      ["proposed"],
      { state: "denied", endedAt: new Date(), error: "You denied it." },
      "denied"
    );
    console.info(`[actions] ${id} denied`);
    told();
    return view(row);
  };

  /** Before it runs: by you, or by a session of its project. */
  const cancel = (
    id: string,
    by: "owner" | InstanceRow
  ): ApprovedActionView => {
    const row = rowOf(id);
    if (by !== "owner" && by.projectId !== row.projectId) {
      refuse(403, "That action is not one of this session's project's.");
    }
    const cancelled = moved(
      row,
      ["proposed", "approved"],
      {
        state: "cancelled",
        endedAt: new Date(),
        error: `Cancelled by ${by === "owner" ? "you" : `session ${by.id}`}.`,
      },
      "cancelled"
    );
    console.info(`[actions] ${id} cancelled`);
    told();
    schedule();
    return view(cancelled);
  };

  /** Yours: a failed or unknown one, read (and checked at the service) and put away. */
  const check = (id: string): ApprovedActionView => {
    const row = moved(
      rowOf(id),
      ["failed", "unknown"],
      { checkedAt: new Date() },
      "put away (only one that failed or whose outcome is unknown is)"
    );
    told();
    return view(row);
  };

  // --- running -------------------------------------------------------------------

  /** A done action's task, moved to its stage as the mover `action`. */
  const moveTask = async (row: ActionRow): Promise<void> => {
    if (!(row.state === "done" && row.taskId && row.thenStage)) {
      return;
    }
    let said: string;
    try {
      const task = await tasks.move(
        row.projectId,
        row.taskId,
        row.thenStage,
        actionActor(row.id, `${row.connection}/${row.tool} done`)
      );
      said = `Moved ${task.id} to ${task.stage}.`;
    } catch (error) {
      said = `${row.taskId} did not move to ${row.thenStage}: ${wordsOf(error)}`;
    }
    store.settle(row.id, ["done"], { stageResult: said });
    console.info(`[actions] ${row.id}: ${said}`);
  };

  /** What became of the call, filed; Needs you, and the phone, hear of a failed or unknown one. */
  const file = (
    row: ActionRow,
    end: {
      state: "done" | "failed" | "unknown";
      result?: string;
      error?: string;
    }
  ): ActionRow | undefined => {
    const ended = store.settle(row.id, ["running"], {
      state: end.state,
      endedAt: new Date(),
      result: end.result ?? null,
      error: end.error ?? null,
    });
    console.info(
      `[actions] ${row.id} ${row.connection}/${row.tool}: ${end.state}${end.error ? ` (${end.error})` : ""}`
    );
    if (ended?.state === "unknown" || ended?.state === "failed") {
      pushFor(ended);
    }
    told();
    return ended;
  };

  /** One claimed action's one call. */
  const call = async (row: ActionRow): Promise<void> => {
    const drifted = sameAccount(row);
    if (drifted) {
      file(row, { state: "failed", error: `Not called: ${drifted}` });
      return;
    }
    const outcome = await connections.callOnce(
      row.connection,
      row.tool,
      JSON.parse(row.args) as Record<string, unknown>,
      {
        "dev.cawco/idempotency-key": row.idempotencyKey,
        "idempotency-key": row.idempotencyKey,
      }
    );
    if (outcome.kind === "answered") {
      const result = capped(JSON.stringify(outcome.result), RESULT_MAX);
      const ended = outcome.result.isError
        ? file(row, {
            state: "failed",
            result,
            error: `${row.service} answered that it failed: ${resultText(outcome.result.content).slice(0, 500) || "no words"}`,
          })
        : file(row, { state: "done", result });
      if (ended) {
        await moveTask(ended);
      }
      return;
    }
    file(
      row,
      outcome.kind === "refused"
        ? { state: "failed", error: `Not called: ${outcome.error}` }
        : {
            state: "unknown",
            error: `This may or may not have happened: the call went to ${row.service} and no answer came back (${outcome.error}). Check ${row.service}.`,
          }
    );
  };

  /** Every due approved action, claimed one at a time and called; nothing runs twice. */
  const tick = (): void => {
    const now = new Date();
    for (const due of store.due(now)) {
      const claimed = store.claim(due.id, now);
      if (!claimed) {
        continue;
      }
      console.info(
        `[actions] ${claimed.id} claimed: calling ${claimed.connection}/${claimed.tool}`
      );
      told();
      detach(
        call(claimed).catch((error: unknown) => {
          // The call path never throws; anything here is the hub's own
          // failure after the claim, so the call may have gone.
          file(claimed, {
            state: "unknown",
            error: `The hub failed while running it (${wordsOf(error)}): it may or may not have happened. Check ${claimed.service}.`,
          });
        }),
        `approved action ${claimed.id}`
      );
    }
  };

  /** Sleeps until the soonest due action, at most {@link NAP_MS}, then looks. */
  const schedule = (): void => {
    if (!started || lifetime.closed()) {
      return;
    }
    lifetime.cancel(timer);
    const now = Date.now();
    const next = store.nextDue();
    let wake = now + NAP_MS;
    if (next === null) {
      wake = now;
    } else if (next) {
      wake = Math.min(wake, next.getTime());
    }
    timer = lifetime.after(Math.max(MIN_GAP_MS, wake - now), () => {
      try {
        tick();
      } catch (error) {
        console.error(`[actions] a look failed: ${wordsOf(error)}`);
      }
      schedule();
    });
  };

  /**
   * Hub start: a row a stopped hub left running is never called again (its
   * call may have gone): it becomes unknown and needs you. A done one whose
   * stage move never ran moves now. Then the first look.
   */
  const start = (): void => {
    for (const row of store.inStates(["running"])) {
      file(row, {
        state: "unknown",
        error: `The hub stopped while its call to ${row.service} was under way: this may or may not have happened. Check ${row.service}.`,
      });
    }
    for (const row of store.inStates(["done"])) {
      if (row.thenStage && row.stageResult === null) {
        detach(moveTask(row), `approved action ${row.id} stage move`);
      }
    }
    started = true;
    tick();
    schedule();
    detach(warmTitles(), "approved action task titles");
  };

  /** The titles of the tasks waiting actions are for, read once after a start. */
  const warmTitles = async (): Promise<void> => {
    const rows = store.inStates(WAITING).filter((row) => row.taskId !== null);
    for (const row of rows) {
      const key = `${row.projectId}/${row.taskId}`;
      if (!titles.has(key)) {
        // biome-ignore lint/performance/noAwaitInLoops: a handful of reads, once, off the boot path
        const task = await tasks
          .get(row.projectId, row.taskId ?? "")
          .catch(() => undefined);
        if (task) {
          titles.set(key, task.title);
        }
      }
    }
    if (rows.length > 0) {
      told();
    }
  };

  lifetime.onClose(() => lifetime.cancel(timer));

  /**
   * Whether `actionId` is done, for this task, names `to`, and has not moved
   * it yet: the stage engine's one door for an `action` move (tasks.ts).
   */
  const actionMove = (
    projectId: string,
    taskId: string,
    to: string,
    actionId: string
  ): boolean => {
    const row = store.get(actionId);
    return Boolean(
      row &&
        row.state === "done" &&
        row.projectId === projectId &&
        row.taskId === taskId &&
        row.thenStage === to &&
        row.stageResult === null
    );
  };

  const list = (
    projectId: string | undefined,
    state?: ActionState
  ): ApprovedActionView[] =>
    store
      .list(projectId, LISTED)
      .filter((row) => state === undefined || row.state === state)
      .map(view);

  // --- tools ---------------------------------------------------------------------

  const ok = (data: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
  });

  const run = async (work: () => unknown) => {
    try {
      return ok(await work());
    } catch (error) {
      if (error instanceof ActionRefusal) {
        throw new Error(error.message, { cause: error });
      }
      throw error;
    }
  };

  /** The action tools, bound to the calling session; with none, the same definitions for discovery. */
  const tools = (actor: InstanceRow | undefined) => {
    const me = (): InstanceRow => {
      if (!actor) {
        throw new Error("Discovery cannot execute tools");
      }
      return actor;
    };
    return [
      tool(
        "action_propose",
        "Propose one exact call of a connection's tool (a post, a send, a merge) for the owner to approve. The hub makes the call once, at run_at or as soon as it is approved, with exactly these arguments; you get its id now and go on working. Check how it went with action_list.",
        {
          connection: z
            .string()
            .describe("A connection your delegate type or project lists."),
          tool: z
            .string()
            .describe("The tool's own name on the connection's server."),
          args: z
            .record(z.string(), z.unknown())
            .describe(
              "The call's arguments, exactly as the owner approves them."
            ),
          run_at: z
            .string()
            .optional()
            .describe(
              "ISO 8601 with a zone, like 2026-10-13T09:00:00+01:00. Left out: as soon as it is approved."
            ),
          reason: z
            .string()
            .describe("One sentence for the owner deciding: why this call."),
          task: z
            .string()
            .optional()
            .describe("The task it is for, like tsk-12."),
          then_stage: z
            .string()
            .optional()
            .describe(
              "The stage the task moves to once the call is done; stages.md must let an action make that move."
            ),
        },
        (input) =>
          run(async () => {
            const filed = await propose(me(), {
              connection: input.connection,
              tool: input.tool,
              args: input.args,
              reason: input.reason,
              ...(input.run_at === undefined ? {} : { runAt: input.run_at }),
              ...(input.task === undefined ? {} : { task: input.task }),
              ...(input.then_stage === undefined
                ? {}
                : { thenStage: input.then_stage }),
            });
            return {
              id: filed.id,
              state: filed.state,
              said: "Waiting for the owner's approval.",
            };
          })
      ),
      tool(
        "action_list",
        "Your project's approved actions, newest first: each one's call, time, state (proposed, approved, denied, running, done, failed, unknown, cancelled), result or error, and stage move.",
        {
          state: z
            .enum([
              "proposed",
              "approved",
              "denied",
              "running",
              "done",
              "failed",
              "unknown",
              "cancelled",
            ])
            .optional(),
        },
        ({ state }) =>
          run(() =>
            list(
              me().projectId ?? refuse(403, "This session is in no project."),
              state
            )
          )
      ),
      tool(
        "action_cancel",
        "Cancel an approved action of your project before it runs.",
        { id: z.string().trim().min(1).describe("Its id.") },
        ({ id }) => run(() => cancel(id, me()))
      ),
    ];
  };

  return {
    actionMove,
    approve,
    cancel,
    check,
    deny,
    get: (id: string) => view(rowOf(id)),
    list,
    propose,
    start,
    tick,
    tools,
    waiting,
  };
};

export type Actions = ReturnType<typeof createActions>;

/** Every action tool, by name. */
export const ACTION_TOOLS: ReadonlySet<string> = new Set([
  "action_propose",
  "action_list",
  "action_cancel",
]);

const answer = (error: unknown) => {
  if (error instanceof ActionRefusal) {
    return status(error.status, error.message);
  }
  throw error;
};

const attempt = <T>(work: () => T) => {
  try {
    return work();
  } catch (error) {
    return answer(error);
  }
};

const STATE = t.Union([
  t.Literal("proposed"),
  t.Literal("approved"),
  t.Literal("denied"),
  t.Literal("running"),
  t.Literal("done"),
  t.Literal("failed"),
  t.Literal("unknown"),
  t.Literal("cancelled"),
]);

/**
 * `/api/actions`: what waits on you, a project's list, one action, and your
 * decisions on it. No route proposes or calls: a session proposes, and the
 * hub's scheduler calls.
 */
export const actionRoutes = (actions: Actions) =>
  new Elysia()
    .get(
      "/api/actions",
      {
        query: t.Object({
          /** A project's actions; every project's when left out. */
          projectId: t.Optional(t.String()),
          state: t.Optional(STATE),
        }),
      },
      ({ query }) => ({ actions: actions.list(query.projectId, query.state) })
    )
    .get("/api/actions/waiting", () => ({ actions: actions.waiting() }))
    .get("/api/actions/:id", ({ params }) =>
      attempt(() => actions.get(params.id))
    )
    .post(
      "/api/actions/:id/approve",
      {
        body: t.Object({
          /** SHA-256 hex of the arguments the card showed. */
          argsHash: t.String({ minLength: 64, maxLength: 64 }),
        }),
      },
      ({ params, body }) =>
        attempt(() => actions.approve(params.id, body.argsHash))
    )
    .post("/api/actions/:id/deny", ({ params }) =>
      attempt(() => actions.deny(params.id))
    )
    .post("/api/actions/:id/cancel", ({ params }) =>
      attempt(() => actions.cancel(params.id, "owner"))
    )
    .post("/api/actions/:id/checked", ({ params }) =>
      attempt(() => actions.check(params.id))
    );
