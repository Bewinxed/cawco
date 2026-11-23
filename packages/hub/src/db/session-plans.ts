/**
 * A session's plan and its changes: its steps and the person's comments on
 * them as rows (`session_plan_steps`, `session_plan_step_comments`), put
 * together as core's `KeptStep` list for whoever reads the plan whole, and
 * queried as rows for each session's step in progress and each step's wait.
 * A step names its record; its words are read from that record (plans.ts).
 */

import type { KeptStep, OrphanedComments, PlanComment } from "@cawco/core/plan";
import { OVER_STATUSES } from "@cawco/core/protocol";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
} from "drizzle-orm";
import type { DbCore } from "./core";
import {
  instances,
  planChanges,
  sessionPlanStepComments,
  sessionPlanSteps,
  sessionPlans,
} from "./schema";
import { planLinkOwner, planWaitLinks, syncTaskLinks } from "./task-links";
import type { Tx } from "./tx";

/**
 * A session's plan as it stands: its row, its steps with the person's
 * comments on them in order, and its orphaned comments, put together from
 * their rows.
 */
export interface StoredPlan {
  instanceId: string;
  orphanedComments: OrphanedComments[];
  steps: KeptStep[];
  updatedAt: Date;
}

export type PlanChangeRow = typeof planChanges.$inferSelect;

export interface SessionPlansDb {
  /** Marks changes told (`at`, by the message `sent` to a session), or reaching no one (`undelivered`). */
  readonly closePlanChanges: (
    ids: readonly string[],
    outcome: { at: Date; sent?: string } | { undelivered: string }
  ) => void;
  /**
   * A session's steps start another's plan (`to`, the session that goes
   * on from `from`), with the person's comments on them, replacing `to`'s
   * steps. Nothing when `from` has no steps.
   */
  readonly copySessionSteps: (from: string, to: string) => void;
  /** Takes the waits `settled` off a session's steps, the rest of each step as it is. */
  readonly dropPlanWaits: (
    instanceId: string,
    settled: readonly string[]
  ) => void;
  /** A plan's latest `limit` changes, oldest first. */
  readonly planChangesOf: (
    instanceId: string,
    limit: number
  ) => PlanChangeRow[];
  /** How many plan steps not done, in sessions not over, wait on `target` (as a file keeps it): a condition checks while one does. */
  readonly planStepsWaiting: (target: string) => number;
  /** What a session's steps wait on, each once, in the list's order. */
  readonly planWaits: (instanceId: string) => string[];
  /** Keeps one change the person made to a session's plan (plan-changes.ts). */
  readonly putPlanChange: (row: PlanChangeRow) => void;
  /** Replaces a session's own steps whole; `orphanedComments` given, those too. */
  readonly putSessionSteps: (
    instanceId: string,
    steps: KeptStep[],
    orphanedComments?: OrphanedComments[]
  ) => void;
  /** The changes told to `receiver` by a message still on record (core `PlanChange`, `sent_uuid`). */
  readonly sentPlanChanges: (receiver: string) => PlanChangeRow[];
  /** What a session last wrote of its own plan through `todo_write` (plans.ts), and the person's comments on it. */
  readonly sessionPlan: (instanceId: string) => StoredPlan | undefined;
  /** The plan's own session has written its steps, or heard why a write was refused. */
  readonly settlePlanChanges: (instanceId: string) => void;
  /** A plan's changes its own session has not written its steps over since. */
  readonly unsettledPlanChanges: (instanceId: string) => PlanChangeRow[];
  /** What `receiver` is still owed, oldest first: not told, and nothing said it could not be. */
  readonly untoldPlanChanges: (receiver: string) => PlanChangeRow[];
  /** Every receiver still owed a change. */
  readonly untoldPlanReceivers: () => string[];
}

type Reader = Pick<Tx, "select">;

/** A session's steps in their order, each with the person's comments on it in theirs. */
const stepsOf = (tx: Reader, instanceId: string): KeptStep[] => {
  const comments = new Map<string, PlanComment[]>();
  for (const row of tx
    .select()
    .from(sessionPlanStepComments)
    .where(
      and(
        eq(sessionPlanStepComments.instanceId, instanceId),
        isNotNull(sessionPlanStepComments.stepId)
      )
    )
    .orderBy(asc(sessionPlanStepComments.ord))
    .all()) {
    if (row.stepId !== null) {
      comments.set(row.stepId, [
        ...(comments.get(row.stepId) ?? []),
        { at: row.at, text: row.text },
      ]);
    }
  }
  return tx
    .select()
    .from(sessionPlanSteps)
    .where(eq(sessionPlanSteps.instanceId, instanceId))
    .orderBy(asc(sessionPlanSteps.position))
    .all()
    .map((row): KeptStep => {
      const on = comments.get(row.id);
      return {
        id: row.id,
        depth: row.depth,
        status: row.status,
        ...(row.priority === null ? {} : { priority: row.priority }),
        ...(row.waitsOn === null ? {} : { waitsOn: row.waitsOn }),
        ...(on ? { comments: on } : {}),
      };
    });
};

/** A plan's orphaned comments: a group wherever the words they were written on change, in their order. */
const orphansOf = (tx: Reader, instanceId: string): OrphanedComments[] => {
  const groups: OrphanedComments[] = [];
  for (const row of tx
    .select()
    .from(sessionPlanStepComments)
    .where(
      and(
        eq(sessionPlanStepComments.instanceId, instanceId),
        isNull(sessionPlanStepComments.stepId)
      )
    )
    .orderBy(asc(sessionPlanStepComments.ord))
    .all()) {
    const step = row.orphanStep ?? "";
    const comment = { at: row.at, text: row.text };
    const last = groups.at(-1);
    if (last?.step === step) {
      last.comments.push(comment);
    } else {
      groups.push({ step, comments: [comment] });
    }
  }
  return groups;
};

/** What a session's steps wait on, each once, in the list's order. */
const waitsOf = (tx: Reader, instanceId: string): string[] => [
  ...new Set(
    tx
      .select({ waitsOn: sessionPlanSteps.waitsOn })
      .from(sessionPlanSteps)
      .where(
        and(
          eq(sessionPlanSteps.instanceId, instanceId),
          isNotNull(sessionPlanSteps.waitsOn)
        )
      )
      .orderBy(asc(sessionPlanSteps.position))
      .all()
      .flatMap((row) => (row.waitsOn === null ? [] : [row.waitsOn]))
  ),
];

/** Its waits on pull requests are its plan's link rows, as a task's are its file's. */
const syncPlanLinks = (tx: Tx, instanceId: string): void => {
  const projectId = tx
    .select({ projectId: instances.projectId })
    .from(instances)
    .where(eq(instances.id, instanceId))
    .get()?.projectId;
  if (projectId) {
    syncTaskLinks(
      tx,
      projectId,
      planLinkOwner(instanceId),
      planWaitLinks(waitsOf(tx, instanceId))
    );
  }
};

/**
 * Replaces a session's steps whole with `steps` and the person's comments
 * on them, its orphaned comments with `orphaned` (kept as they are when
 * not given), and its link rows with what the steps wait on. Its plan's
 * row is made when it has none.
 */
const writeSteps = (
  tx: Tx,
  instanceId: string,
  steps: readonly KeptStep[],
  orphaned?: readonly OrphanedComments[]
): void => {
  const updatedAt = new Date();
  tx.insert(sessionPlans)
    .values({ instanceId, updatedAt })
    .onConflictDoUpdate({
      target: sessionPlans.instanceId,
      set: { updatedAt },
    })
    .run();
  const orphans = orphaned ?? orphansOf(tx, instanceId);
  tx.delete(sessionPlanStepComments)
    .where(eq(sessionPlanStepComments.instanceId, instanceId))
    .run();
  tx.delete(sessionPlanSteps)
    .where(eq(sessionPlanSteps.instanceId, instanceId))
    .run();
  if (steps.length > 0) {
    tx.insert(sessionPlanSteps)
      .values(
        steps.map((step, position) => ({
          instanceId,
          position,
          id: step.id,
          depth: step.depth,
          status: step.status,
          priority: step.priority ?? null,
          waitsOn: step.waitsOn ?? null,
        }))
      )
      .run();
  }
  const comments = [
    ...steps.flatMap((step) =>
      (step.comments ?? []).map((comment) => ({
        stepId: step.id,
        orphanStep: null,
        ...comment,
      }))
    ),
    ...orphans.flatMap((group) =>
      group.comments.map((comment) => ({
        stepId: null,
        orphanStep: group.step,
        ...comment,
      }))
    ),
  ];
  if (comments.length > 0) {
    tx.insert(sessionPlanStepComments)
      .values(
        comments.map((comment, ord) => ({
          instanceId,
          ord,
          stepId: comment.stepId,
          orphanStep: comment.orphanStep,
          at: comment.at,
          text: comment.text,
        }))
      )
      .run();
  }
  syncPlanLinks(tx, instanceId);
};

export const sessionPlansDb = (core: DbCore): SessionPlansDb => {
  const { db } = core;

  const sessionPlan = (tx: Reader, instanceId: string) => {
    const row = tx
      .select()
      .from(sessionPlans)
      .where(eq(sessionPlans.instanceId, instanceId))
      .get();
    if (!row) {
      return;
    }
    const plan: StoredPlan = {
      ...row,
      steps: stepsOf(tx, instanceId),
      orphanedComments: orphansOf(tx, instanceId),
    };
    return plan;
  };

  return {
    // One synchronous read, so no write lands between its queries.
    sessionPlan: (instanceId) => sessionPlan(db, instanceId),
    copySessionSteps: (from, to) => {
      db.transaction((tx) => {
        const plan = sessionPlan(tx, from);
        if (!plan || plan.steps.length === 0) {
          return;
        }
        writeSteps(tx, to, plan.steps);
      });
    },
    dropPlanWaits: (instanceId, settled) => {
      if (settled.length === 0) {
        return;
      }
      db.transaction((tx) => {
        tx.update(sessionPlanSteps)
          .set({ waitsOn: null })
          .where(
            and(
              eq(sessionPlanSteps.instanceId, instanceId),
              inArray(sessionPlanSteps.waitsOn, [...settled])
            )
          )
          .run();
        tx.update(sessionPlans)
          .set({ updatedAt: new Date() })
          .where(eq(sessionPlans.instanceId, instanceId))
          .run();
        syncPlanLinks(tx, instanceId);
      });
    },
    planWaits: (instanceId) => waitsOf(db, instanceId),
    planStepsWaiting: (target) =>
      db
        .select({ steps: count() })
        .from(sessionPlanSteps)
        .innerJoin(instances, eq(instances.id, sessionPlanSteps.instanceId))
        .where(
          and(
            eq(sessionPlanSteps.waitsOn, target),
            ne(sessionPlanSteps.status, "completed"),
            notInArray(instances.status, [...OVER_STATUSES])
          )
        )
        .get()?.steps ?? 0,
    putPlanChange: (row) => {
      db.insert(planChanges).values(row).run();
    },
    planChangesOf: (instanceId, limit) =>
      db
        .select()
        .from(planChanges)
        .where(eq(planChanges.instanceId, instanceId))
        .orderBy(desc(planChanges.at), desc(planChanges.id))
        .limit(limit)
        .all()
        .reverse(),
    untoldPlanChanges: (receiver) =>
      db
        .select()
        .from(planChanges)
        .where(
          and(
            eq(planChanges.receiver, receiver),
            isNull(planChanges.toldAt),
            isNull(planChanges.undelivered)
          )
        )
        .orderBy(asc(planChanges.at), asc(planChanges.id))
        .all(),
    untoldPlanReceivers: () =>
      db
        .selectDistinct({ receiver: planChanges.receiver })
        .from(planChanges)
        .where(and(isNull(planChanges.toldAt), isNull(planChanges.undelivered)))
        .all()
        .map((row) => row.receiver),
    closePlanChanges: (ids, outcome) => {
      if (ids.length === 0) {
        return;
      }
      db.update(planChanges)
        .set(
          "at" in outcome
            ? {
                toldAt: outcome.at,
                sentUuid: outcome.sent ?? null,
                undelivered: null,
              }
            : {
                undelivered: outcome.undelivered,
                toldAt: null,
                sentUuid: null,
              }
        )
        .where(inArray(planChanges.id, [...ids]))
        .run();
    },
    sentPlanChanges: (receiver) =>
      db
        .select()
        .from(planChanges)
        .where(
          and(
            eq(planChanges.receiver, receiver),
            isNotNull(planChanges.sentUuid)
          )
        )
        .orderBy(asc(planChanges.at), asc(planChanges.id))
        .all(),
    unsettledPlanChanges: (instanceId) =>
      db
        .select()
        .from(planChanges)
        .where(
          and(
            eq(planChanges.instanceId, instanceId),
            eq(planChanges.settled, false)
          )
        )
        .orderBy(asc(planChanges.at), asc(planChanges.id))
        .all(),
    settlePlanChanges: (instanceId) => {
      db.update(planChanges)
        .set({ settled: true })
        .where(
          and(
            eq(planChanges.instanceId, instanceId),
            eq(planChanges.settled, false)
          )
        )
        .run();
    },
    putSessionSteps: (instanceId, steps, orphanedComments) => {
      db.transaction((tx) => {
        writeSteps(tx, instanceId, steps, orphanedComments);
      });
    },
  };
};
