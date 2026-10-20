/**
 * The person's changes to a session's plan, and who hears them when (the
 * owner's plan model, 2026-10-20; Projects spec §5.2 "The person changes a
 * plan"). A change is applied to the plan and kept in their words
 * (plans.ts `edit`); this decides where it goes:
 *
 * - **Who hears it** ({@link receiverOf}): the session whose plan it is; a
 *   delegate's plan, the session that delegated it, which decides what
 *   reaches the delegate; a task attempt's plan, the project's Caw, who
 *   dispatched the task and decides whether to tell the attempt, start a new
 *   one, or reshape the task.
 * - **When**: a receiver mid-turn hears every change at once, the one send
 *   path a person's message takes into a busy session, which folds it in at
 *   its next step. An idle one is started by a reword, an add, a removal or
 *   a comment {@link PLAN_WAKE_QUIET_MS} after the person's last such
 *   change, every change of that window in one message; a tick or a move
 *   starts nothing and goes ahead of the receiver's next turn, whoever starts
 *   it ({@link PlanChanges.foldInto}), or in its next `todo_write` answer.
 * - **An ended receiver** (finished, archived, a delegate whose item is
 *   done) is reopened by the same send, as the person's own words reopen
 *   it. One that cannot go on, its conversation or its workspace gone, is
 *   followed by a new session in the same project and place, opening on the
 *   change, the old session's plan and its records (open-items.ts): the
 *   hub's account of where it stood, since its transcript may be what is
 *   gone ({@link PlanChangesDeps.goOnFrom}).
 *
 * The person's words go into every message verbatim, step by step.
 */
import {
  type InstanceRow,
  PLAN_WAKE_QUIET_MS,
  PLAN_WAKING_EDITS,
  type PlanEdit,
  type PlanReceiver,
  type SessionPlan,
} from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { Elysia, t } from "elysia";
import type { DbShape, PlanChangeRow } from "./db";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import {
  changeLine,
  type Plans,
  receiverKey,
  receiverOfKey,
  stepLines,
  type WrittenStep,
} from "./plans";
import { FolderRefusal, refused } from "./project-folder";

/** What became of a message to a session about its plan's changes. */
export type PlanTold =
  | { kind: "taken" }
  /** It cannot go on: its conversation or its workspace is gone. */
  | { kind: "ended"; reason: string }
  | { kind: "refused"; reason: string };

export interface PlanChangesDeps {
  /** Whether a session is in a turn now, as its last pulse said. */
  busy: (instanceId: string) => boolean;
  db: Pick<
    DbShape,
    | "closePlanChanges"
    | "getInstancesByIds"
    | "project"
    | "sessionPlan"
    | "untoldPlanChanges"
    | "untoldPlanReceivers"
    | "workItem"
  >;
  /**
   * A new session in `row`'s project and place, opening on `opening` and the
   * old session's records, its plan copied: the one that goes on from a
   * session that cannot. Its id; throws why it could not start.
   */
  goOnFrom: (row: InstanceRow, opening: string) => Promise<string>;
  lifetime: HubLifetimeShape;
  plans: Plans;
  /** The person's words to a session, through the one send path (`PLAN_ORIGIN`). */
  tell: (instanceId: string, text: string) => PlanTold;
  /** The person's words to a project's Caw (caw.ts `wakeOnce`, by you): undefined once he has them, else why not. */
  wakeCaw: (projectId: string, text: string) => Promise<string | undefined>;
}

/** A session as a message names it. */
const named = (row: InstanceRow): string =>
  `“${row.title || row.derivedTitle || row.id.slice(0, 8)}” (${row.id.slice(0, 8)})`;

export const createPlanChanges = (deps: PlanChangesDeps) => {
  const { db, plans } = deps;
  /** One quiet window per receiver: its timer, re-armed by each waking change. */
  const quiet = new Map<string, HubTimer>();
  /** Each receiver's deliveries, one at a time and in order. */
  const queues = new Map<string, Promise<unknown>>();

  const rowOf = (instanceId: string): InstanceRow => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      throw new FolderRefusal(404, "No session with that id on this hub.");
    }
    return row;
  };

  /**
   * Who hears a change to `row`'s plan: a task attempt's, the project's Caw;
   * a delegate's, the session that delegated it; any other, the session.
   */
  const receiverOf = (row: InstanceRow): PlanReceiver => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    if (item?.taskId && item.projectId) {
      return { kind: "caw", projectId: item.projectId };
    }
    if (item && row.parentInstanceId) {
      return { kind: "session", instanceId: row.parentInstanceId };
    }
    return { kind: "session", instanceId: row.id };
  };

  /** The session that runs a receiver now: the session, or the project's Caw's. */
  const sessionOfReceiver = (to: PlanReceiver): string | undefined =>
    to.kind === "session"
      ? to.instanceId
      : (db.project(to.projectId)?.leadInstanceId ?? undefined);

  /**
   * The message that tells `to` of `rows`, each plan's changes under the
   * words naming whose plan it is, then that plan as it stands.
   */
  const message = (to: PlanReceiver, rows: PlanChangeRow[]): string => {
    const byPlan = new Map<string, PlanChangeRow[]>();
    for (const row of rows) {
      byPlan.set(row.instanceId, [...(byPlan.get(row.instanceId) ?? []), row]);
    }
    const parts = [...byPlan].map(([instanceId, changes]) => {
      const steps = db.sessionPlan(instanceId)?.steps ?? [];
      const own = to.kind === "session" && to.instanceId === instanceId;
      const { whose, next } = own
        ? {
            whose: "your plan",
            next: "Work from it as it stands now; todo_write writes it.",
          }
        : othersPlan(to, instanceId);
      return [
        `The person changed ${whose}:`,
        ...changes.map((change) => `- ${changeLine(change)}`),
        "",
        `${own ? "Your plan" : "That plan"} now:`,
        stepLines(steps),
        "",
        next,
      ].join("\n");
    });
    return parts.join("\n\n---\n\n");
  };

  /** Whose plan another's is, as the message to its receiver names it, and what is the receiver's to decide. */
  const othersPlan = (
    to: PlanReceiver,
    instanceId: string
  ): { next: string; whose: string } => {
    const [owner] = db.getInstancesByIds([instanceId]);
    const who = owner ? named(owner) : `session ${instanceId.slice(0, 8)}`;
    if (to.kind === "caw") {
      const item = owner?.workItemId ? db.workItem(owner.workItemId) : undefined;
      return {
        whose: `the plan of ${who}, an attempt at task ${item?.taskId ?? "of this project"}`,
        next: "The attempt has not heard this. Decide whether to tell it (handoff), start a new attempt, or reshape the task.",
      };
    }
    return {
      whose: `the plan of ${who}, your delegate`,
      next: "Your delegate has not heard this. Decide what reaches it (handoff).",
    };
  };

  /**
   * The session that goes on from `ended`, which cannot (its conversation or
   * workspace gone), told `text`: the changes closed as told, or as reaching
   * no one with why.
   */
  const goOn = async (
    ended: InstanceRow,
    reason: string,
    text: string,
    ids: string[]
  ): Promise<void> => {
    try {
      const next = await deps.goOnFrom(
        ended,
        `${named(ended)} cannot go on (${reason}), so this session goes on from it.\n\n${text}`
      );
      console.info(
        `[plan-changes] ${ended.id.slice(0, 8)} cannot go on (${reason}): the person's plan changes went to the new session ${next.slice(0, 8)}`
      );
      db.closePlanChanges(ids, { at: new Date() });
    } catch (error) {
      db.closePlanChanges(ids, {
        undelivered: `${reason}, and no new session started: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  /** Each plan whose changes moved: its followers hear their new state. */
  const plansMoved = (rows: PlanChangeRow[]): void => {
    for (const instanceId of new Set(rows.map((row) => row.instanceId))) {
      plans.changed(instanceId);
    }
  };

  /** Runs `work` for `key` after whatever runs for it already. */
  const inOrder = (key: string, work: () => Promise<void>): Promise<void> => {
    const next = (queues.get(key) ?? Promise.resolve()).then(work, work);
    const tail = next.catch((error: unknown) =>
      console.warn(
        `[plan-changes] ${key}: ${error instanceof Error ? error.message : String(error)}`
      )
    );
    queues.set(key, tail);
    detach(
      tail.then(() => {
        if (queues.get(key) === tail) {
          queues.delete(key);
        }
      }),
      "plan changes queue cleanup"
    );
    return tail;
  };

  /**
   * Tells `key`'s receiver every change it is owed, in one message: a
   * session through the one send path, Caw by his wake. A session that
   * cannot go on is followed by a new one ({@link PlanChangesDeps.goOnFrom});
   * a refusal is kept on each change, in its words.
   */
  const deliver = (key: string): Promise<void> =>
    inOrder(key, async () => {
      deps.lifetime.cancel(quiet.get(key));
      quiet.delete(key);
      const rows = db.untoldPlanChanges(key);
      if (rows.length === 0) {
        return;
      }
      const to = receiverOfKey(key);
      const ids = rows.map((row) => row.id);
      const text = message(to, rows);
      if (to.kind === "caw") {
        // Told before the wake goes, so the wake's own send folds none of
        // them in again (server.ts `tellPlanFirst`); undone if it is refused.
        db.closePlanChanges(ids, { at: new Date() });
        const why = await deps.wakeCaw(to.projectId, text);
        if (why !== undefined) {
          db.closePlanChanges(ids, { undelivered: why });
        }
        plansMoved(rows);
        return;
      }
      const told = deps.tell(to.instanceId, text);
      switch (told.kind) {
        case "taken":
          db.closePlanChanges(ids, { at: new Date() });
          break;
        case "refused":
          db.closePlanChanges(ids, { undelivered: told.reason });
          break;
        case "ended":
          await goOn(rowOf(to.instanceId), told.reason, text, ids);
          break;
        default: {
          const unhandled: never = told;
          throw new Error(`unhandled outcome: ${JSON.stringify(unhandled)}`);
        }
      }
      plansMoved(rows);
    });

  /** Starts (again) `key`'s quiet window: its changes go once the person has been quiet that long. */
  const arm = (key: string): void => {
    deps.lifetime.cancel(quiet.get(key));
    quiet.set(
      key,
      deps.lifetime.after(PLAN_WAKE_QUIET_MS, () => {
        quiet.delete(key);
        detach(deliver(key), "plan changes delivery");
      })
    );
  };

  /**
   * What `instanceId` is owed of its plans' changes, as words a note ahead
   * of its next turn carries, the changes then told: a session's own, and,
   * when it is a project's Caw, his project's. Undefined when it is owed
   * nothing.
   */
const foldInto = (instanceId: string): string | undefined => {
    const [row] = db.getInstancesByIds([instanceId]);
    const keys = [
      receiverKey({ kind: "session", instanceId }),
      ...(row?.projectId &&
      db.project(row.projectId)?.leadInstanceId === instanceId
        ? [receiverKey({ kind: "caw", projectId: row.projectId })]
        : []),
    ];
    const words: string[] = [];
    for (const key of keys) {
      const rows = db.untoldPlanChanges(key);
      if (rows.length === 0) {
        continue;
      }
      deps.lifetime.cancel(quiet.get(key));
      quiet.delete(key);
      words.push(message(receiverOfKey(key), rows));
      db.closePlanChanges(
        rows.map((one) => one.id),
        { at: new Date() }
      );
      plansMoved(rows);
    }
    return words.length > 0 ? words.join("\n\n---\n\n") : undefined;
  };

  return {
    receiverOf,
    foldInto,

    /**
     * The person's change to `instanceId`'s plan: applied and kept, then
     * told by the rules above. Answers the plan as it now stands.
     */
    async edit(instanceId: string, edit: PlanEdit): Promise<SessionPlan> {
      const row = rowOf(instanceId);
      const to = receiverOf(row);
      const own = to.kind === "session" && to.instanceId === row.id;
      await plans.edit(row, edit, to, !own);
      const key = receiverKey(to);
      const running = sessionOfReceiver(to);
      if (running && deps.busy(running)) {
        await deliver(key);
      } else if (PLAN_WAKING_EDITS.has(edit.kind)) {
        arm(key);
      }
      return plans.read(instanceId);
    },

    /**
     * `todo_write`'s session scope (plans.ts `write`), its answer carrying
     * what the session is owed of its plans' changes, those then told.
     */
    async written(
      row: InstanceRow,
      written: { steps?: WrittenStep[]; spec?: string }
    ): Promise<SessionPlan & { personChanged?: string }> {
      const plan = await plans.write(row, written);
      const heard = foldInto(row.id);
      return heard ? { ...plan, personChanged: heard } : plan;
    },

    /**
     * At the hub's start: a quiet window the last process left open goes on,
     * for each receiver still owed a change that starts it.
     */
    resume(): void {
      for (const key of db.untoldPlanReceivers()) {
        if (
          db.untoldPlanChanges(key).some((row) => PLAN_WAKING_EDITS.has(row.kind))
        ) {
          arm(key);
        }
      }
    },
  };
};

export type PlanChanges = ReturnType<typeof createPlanChanges>;

const stepId = () => t.String({ minLength: 1 });
const words = () => t.String({ minLength: 1, maxLength: 4000 });

/** The person's change, as the route takes it. */
const PLAN_EDIT_SCHEMA = t.Union([
  t.Object({ kind: t.Literal("reword"), step: stepId(), content: words() }),
  t.Object({
    kind: t.Literal("add"),
    content: words(),
    after: t.Optional(stepId()),
  }),
  t.Object({ kind: t.Literal("remove"), step: stepId() }),
  t.Object({ kind: t.Literal("comment"), step: stepId(), text: words() }),
  t.Object({ kind: t.Literal("tick"), step: stepId(), done: t.Boolean() }),
  t.Object({
    kind: t.Literal("move"),
    step: stepId(),
    by: t.Union([t.Literal(-1), t.Literal(1)]),
  }),
]);

/**
 * `POST /api/instances/:id/plan/edits`: the person's change to a session's
 * plan, answered with the plan as it now stands. The owner's alone (hub-auth
 * lists it for no session), so no agent's edit ever comes this way.
 */
export const planChangeRoutes = (changes: PlanChanges) =>
  new Elysia().post(
    "/api/instances/:id/plan/edits",
    { params: t.Object({ id: t.String() }), body: PLAN_EDIT_SCHEMA },
    async ({ params, body }) => {
      try {
        return await changes.edit(params.id, body as PlanEdit);
      } catch (error) {
        return refused(error);
      }
    }
  );
