/** A session's plan and its changes. */

import type { OrphanedComments, PlanStep } from "@cawco/core/plan";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type { DbCore } from "./core";
import { instances, planChanges, sessionPlans } from "./schema";
import { planLinkOwner, planWaitLinks, syncTaskLinks } from "./task-links";

type SessionPlanRow = typeof sessionPlans.$inferSelect;

export type PlanChangeRow = typeof planChanges.$inferSelect;

export interface SessionPlansDb {
  /** Marks changes told (`at`, by the message `sent` to a session), or reaching no one (`undelivered`). */
  readonly closePlanChanges: (
    ids: readonly string[],
    outcome: { at: Date; sent?: string } | { undelivered: string }
  ) => void;
  /** A plan's latest `limit` changes, oldest first. */
  readonly planChangesOf: (
    instanceId: string,
    limit: number
  ) => PlanChangeRow[];
  /**
   * The sessions whose plan's spec may hold away notes (a `## Since`
   * heading; core injected.ts `awayNotesOf` reads whether it does), by id:
   * those that may hold news for the person on their return.
   */
  readonly plansWithAwayNotes: () => string[];
  /** The person saw the session's away notes as `notes` read (`session_plans.away_seen`). A session with no plan row has none to see. */
  readonly putAwaySeen: (instanceId: string, notes: string) => void;
  /** Keeps one change the person made to a session's plan (plan-changes.ts). */
  readonly putPlanChange: (row: PlanChangeRow) => void;
  /** Replaces a session's spec whole, its steps kept. */
  readonly putSessionSpec: (instanceId: string, spec: string) => void;
  /**
   * Replaces a session's own steps whole, its spec kept;
   * `orphanedComments` given, those too.
   */
  readonly putSessionSteps: (
    instanceId: string,
    steps: PlanStep[],
    orphanedComments?: OrphanedComments[]
  ) => void;
  /** The changes told to `receiver` by a message still on record (core `PlanChange`, `sent_uuid`). */
  readonly sentPlanChanges: (receiver: string) => PlanChangeRow[];
  /** What a session last wrote of its own plan through `todo_write` (plans.ts). */
  readonly sessionPlan: (instanceId: string) => SessionPlanRow | undefined;
  /** The plan's own session has written its steps, or heard why a write was refused. */
  readonly settlePlanChanges: (instanceId: string) => void;
  /** A plan's changes its own session has not written its steps over since. */
  readonly unsettledPlanChanges: (instanceId: string) => PlanChangeRow[];
  /** What `receiver` is still owed, oldest first: not told, and nothing said it could not be. */
  readonly untoldPlanChanges: (receiver: string) => PlanChangeRow[];
  /** Every receiver still owed a change. */
  readonly untoldPlanReceivers: () => string[];
}

export const sessionPlansDb = (core: DbCore): SessionPlansDb => {
  const { db } = core;

  return {
    sessionPlan: (instanceId) =>
      db
        .select()
        .from(sessionPlans)
        .where(eq(sessionPlans.instanceId, instanceId))
        .get(),
    plansWithAwayNotes: () =>
      db
        .select({ instanceId: sessionPlans.instanceId })
        .from(sessionPlans)
        .where(sql`${sessionPlans.spec} LIKE '%## Since %'`)
        .all()
        .map((one) => one.instanceId),
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
      const updatedAt = new Date();
      const kept = orphanedComments ? { orphanedComments } : {};
      db.transaction((tx) => {
        tx.insert(sessionPlans)
          .values({ instanceId, steps, updatedAt, ...kept })
          .onConflictDoUpdate({
            target: sessionPlans.instanceId,
            set: { steps, updatedAt, ...kept },
          })
          .run();
        // Its waits on pull requests are its plan's link rows, as a task's are its file's.
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
            planWaitLinks(steps)
          );
        }
      });
    },
    putAwaySeen: (instanceId, notes) => {
      db.update(sessionPlans)
        .set({ awaySeen: notes })
        .where(eq(sessionPlans.instanceId, instanceId))
        .run();
    },
    putSessionSpec: (instanceId, spec) => {
      const updatedAt = new Date();
      db.insert(sessionPlans)
        .values({ instanceId, steps: [], spec, specAt: updatedAt, updatedAt })
        .onConflictDoUpdate({
          target: sessionPlans.instanceId,
          set: { spec, specAt: updatedAt, updatedAt },
        })
        .run();
    },
  };
};
