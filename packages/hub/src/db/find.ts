import {
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DbCore } from "./core";
import { findable } from "./instances";
import {
  artifactChanges,
  artifacts,
  FIND_SETTINGS_ID,
  findSettings,
  instanceConversations,
  instances,
  projectTaskLabels,
  projectTasks,
  purgedSessions,
  sessionPlanSteps,
  taskRuns,
  taskTriggers,
  workItems,
  workItemTexts,
  workspaces,
} from "./schema";
import { ITS_TASK, ROUTINE_NAME } from "./task-triggers";

/** An artifact as the find engine reads it: its row, and whether the person changed any of its keys. */
export type FindArtifactRow = typeof artifacts.$inferSelect & {
  personChanged: boolean;
};

/**
 * A conversation as the find engine reads it (find.ts): what names it, what
 * it was for, where it runs and how it stands. Every session but a
 * summariser, a discarded one, one deleted or on a removed machine: an asleep
 * one from weeks ago is as findable as one running now.
 */
const findColumns = {
  id: instances.id,
  machineId: instances.machineId,
  projectId: instances.projectId,
  sessionId: instances.sessionId,
  harness: instances.harness,
  parentInstanceId: instances.parentInstanceId,
  cwd: instances.cwd,
  launchDir: instances.launchDir,
  title: instances.title,
  derivedTitle: instances.derivedTitle,
  kind: instances.kind,
  role: instances.role,
  status: instances.status,
  turnOpenAt: instances.turnOpenAt,
  updatedAt: instances.updatedAt,
  workItemId: instances.workItemId,
  /** When the person last looked at it (`instances.seen_at`): Jump's unread reports read it. */
  seenAt: instances.seenAt,
};

export type FindInstanceRow = {
  [Key in keyof typeof findColumns]: (typeof instances.$inferSelect)[Key];
} & {
  /** The harness session ids of the conversations it went on from (`instance_conversations`). */
  priorSessionIds: string[];
};

/** How much of a work item's brief names what it was for: its opening, not the whole spec. */
const BRIEF_OPENING = 400;

export interface FindWorkItemRow {
  brief: string;
  createdAt: Date;
  endedAt: Date | null;
  /** Its last end was a blocked `finish_item` (work_items `ended_blocked`). */
  endedBlocked: boolean;
  headline: string | null;
  id: string;
  instanceId: string;
  lands: string;
  parentInstanceId: string;
  projectId: string | null;
  state: string;
  taskId: string | null;
  title: string;
  workspaceId: string;
}

export interface FindRoutineRow {
  enabled: boolean;
  id: string;
  lastOutcome: string | null;
  lastRunAt: Date | null;
  name: string;
  nextSlot: Date;
  projectId: string | null;
  prompt: string;
}

/**
 * What the views thread reads for find (views/find-index.ts): each reader
 * reads every row, or with keys only those keys' rows, so a change is read
 * again by key and never as the whole table.
 */
export interface FindDb {
  /** Every artifact, or these ids': what it is, whose, and whether the person changed any of its keys. */
  readonly artifacts: (ids?: string[]) => FindArtifactRow[];
  /**
   * The conversations the hub made for its own use that hold no one's own
   * words, by the session that made them, each as `machineId:sessionId`
   * (find.ts `purgedKey`): a continuation's summariser (kind `summariser`),
   * its prompt the hub's and its answer a model's summary of a session found
   * by its own words. By each harness session id it went by. Every one, or
   * those among these ids.
   */
  readonly hubMade: (ids?: string[]) => Map<string, string[]>;
  /** The ids of the sessions find holds whose id starts with `prefix` (hex and dashes only). */
  readonly idsByPrefix: (prefix: string) => string[];
  /** The conversations find reads ({@link findColumns}): every one, or these ids'. */
  readonly instances: (ids?: string[]) => FindInstanceRow[];
  /** Each session's plan step under way, by session: the first in its list in progress, found by its rows. Every session's, or these ids'. */
  readonly planSteps: (ids?: string[]) => Map<string, string>;
  /** The person purged these sessions of `machineId` (their harness session ids) now. */
  readonly purge: (machineId: string, sessionIds: string[]) => void;
  /** Every purged session, or those of these machines, as `machineId:sessionId` (find.ts `purgedKey`). */
  readonly purged: (machineIds?: string[]) => Set<string>;
  /** Each ended work item's result, or these ids': the commits and diffstat its report names. */
  readonly results: (ids?: string[]) => { id: string; result: string | null }[];
  /** Every routine, or these ids', with its newest ended run's outcome. */
  readonly routines: (ids?: string[]) => FindRoutineRow[];
  /** Every project's indexed tasks, or these projects', each with its labels. */
  readonly tasks: (
    projectIds?: string[]
  ) => (typeof projectTasks.$inferSelect & {
    labels: string[];
  })[];
  /** Every work item, or these ids': what it was for and how it ended ({@link BRIEF_OPENING}). */
  readonly workItems: (ids?: string[]) => FindWorkItemRow[];
  /** Each workspace's branch, by its id: every one, or these ids'. */
  readonly workspaceBranches: (ids?: string[]) => Map<string, string>;
}

/** What a session id's prefix may hold: hex and dashes. */
const ID_PREFIX = /^[0-9a-f-]+$/u;

export const findDb = (db: BunSQLiteDatabase): FindDb => ({
  purge: (machineId, sessionIds) => {
    if (sessionIds.length === 0) {
      return;
    }
    const purgedAt = new Date();
    db.insert(purgedSessions)
      .values(
        sessionIds.map((sessionId) => ({ machineId, sessionId, purgedAt }))
      )
      .onConflictDoNothing()
      .run();
  },
  purged: (machineIds) =>
    new Set(
      db
        .select()
        .from(purgedSessions)
        .where(
          machineIds ? inArray(purgedSessions.machineId, machineIds) : undefined
        )
        .all()
        .map((row) => `${row.machineId}:${row.sessionId}`)
    ),
  hubMade: (ids) => {
    const made = db
      .select({
        id: instances.id,
        machineId: instances.machineId,
        sessionId: instances.sessionId,
      })
      .from(instances)
      .where(
        and(
          eq(instances.kind, "summariser"),
          ids ? inArray(instances.id, ids) : undefined
        )
      )
      .all();
    const keys = new Map(
      made.map((row) => [
        row.id,
        row.sessionId ? [`${row.machineId}:${row.sessionId}`] : [],
      ])
    );
    const machineOf = new Map(made.map((row) => [row.id, row.machineId]));
    if (made.length > 0) {
      for (const { instanceId, sessionId } of db
        .select({
          instanceId: instanceConversations.instanceId,
          sessionId: instanceConversations.sessionId,
        })
        .from(instanceConversations)
        .where(inArray(instanceConversations.instanceId, [...machineOf.keys()]))
        .all()) {
        keys.get(instanceId)?.push(`${machineOf.get(instanceId)}:${sessionId}`);
      }
    }
    return keys;
  },
  artifacts: (ids) =>
    db
      .select({
        ...getTableColumns(artifacts),
        personChanged:
          sql<boolean>`exists (select 1 from ${artifactChanges} where ${artifactChanges.artifactId} = ${artifacts.id} and ${artifactChanges.by} = 'person')`.mapWith(
            Boolean
          ),
      })
      .from(artifacts)
      // A held next version is its artifact's, unseen until its parent opens it.
      .where(
        and(
          isNull(artifacts.heldFor),
          ids ? inArray(artifacts.id, ids) : undefined
        )
      )
      .all(),
  idsByPrefix: (prefix) =>
    ID_PREFIX.test(prefix)
      ? db
          .select({ id: instances.id })
          .from(instances)
          .where(and(findable(), sql`${instances.id} LIKE ${`${prefix}%`}`))
          .all()
          .map((row) => row.id)
      : [],
  instances: (ids) => {
    const prior = new Map<string, string[]>();
    for (const { instanceId, sessionId } of db
      .select({
        instanceId: instanceConversations.instanceId,
        sessionId: instanceConversations.sessionId,
      })
      .from(instanceConversations)
      .where(ids ? inArray(instanceConversations.instanceId, ids) : undefined)
      .orderBy(instanceConversations.instanceId, instanceConversations.ord)
      .all()) {
      prior.set(instanceId, [...(prior.get(instanceId) ?? []), sessionId]);
    }
    return db
      .select(findColumns)
      .from(instances)
      .where(ids ? and(findable(), inArray(instances.id, ids)) : findable())
      .all()
      .map((row) => ({ ...row, priorSessionIds: prior.get(row.id) ?? [] }));
  },
  planSteps: (ids) => {
    const steps = new Map<string, string>();
    for (const row of db
      .select({
        id: sessionPlanSteps.instanceId,
        content: sessionPlanSteps.content,
      })
      .from(sessionPlanSteps)
      .where(
        and(
          eq(sessionPlanSteps.status, "in_progress"),
          ids ? inArray(sessionPlanSteps.instanceId, ids) : undefined
        )
      )
      .orderBy(asc(sessionPlanSteps.instanceId), asc(sessionPlanSteps.position))
      .all()) {
      if (!steps.has(row.id)) {
        steps.set(row.id, row.content);
      }
    }
    return steps;
  },
  results: (ids) =>
    db
      .select({ id: workItems.id, result: workItemTexts.result })
      .from(workItems)
      .leftJoin(workItemTexts, eq(workItemTexts.workItemId, workItems.id))
      .where(
        and(
          isNotNull(workItems.endedAt),
          ids ? inArray(workItems.id, ids) : undefined
        )
      )
      .all(),
  routines: (ids) => {
    const last = db
      .select({
        triggerId: taskRuns.triggerId,
        outcome: taskRuns.outcome,
        endedAt: sql<number | null>`max(${taskRuns.endedAt})`,
      })
      .from(taskRuns)
      .where(
        and(
          sql`${taskRuns.endedAt} IS NOT NULL`,
          ids ? inArray(taskRuns.triggerId, ids) : undefined
        )
      )
      .groupBy(taskRuns.triggerId)
      .all();
    const byRoutine = new Map(last.map((row) => [row.triggerId, row]));
    // A routine is its task (§5.5): named by its title, said by its stop.
    return db
      .select({
        id: taskTriggers.id,
        projectId: taskTriggers.projectId,
        enabled: taskTriggers.enabled,
        nextSlot: taskTriggers.nextSlot,
        stop: taskTriggers.stop,
        name: ROUTINE_NAME,
      })
      .from(taskTriggers)
      .leftJoin(projectTasks, ITS_TASK)
      .where(
        and(
          isNotNull(taskTriggers.target),
          ids ? inArray(taskTriggers.id, ids) : undefined
        )
      )
      .all()
      .map((row) => {
        const run = byRoutine.get(row.id);
        return {
          id: row.id,
          name: row.name,
          prompt: row.stop ?? "",
          projectId: row.projectId,
          enabled: row.enabled,
          nextSlot: row.nextSlot ?? new Date(0),
          lastOutcome: run?.outcome ?? null,
          lastRunAt: run?.endedAt ? new Date(run.endedAt) : null,
        };
      });
  },
  tasks: (projectIds) => {
    const labels = new Map<string, string[]>();
    for (const { projectId, path, label } of db
      .select()
      .from(projectTaskLabels)
      .where(
        projectIds
          ? inArray(projectTaskLabels.projectId, projectIds)
          : undefined
      )
      .orderBy(sql`rowid`)
      .all()) {
      const key = `${projectId}\0${path}`;
      labels.set(key, [...(labels.get(key) ?? []), label]);
    }
    return db
      .select()
      .from(projectTasks)
      .where(
        projectIds ? inArray(projectTasks.projectId, projectIds) : undefined
      )
      .all()
      .map((row) => ({
        ...row,
        labels: labels.get(`${row.projectId}\0${row.path}`) ?? [],
      }));
  },
  workItems: (ids) =>
    db
      .select({
        id: workItems.id,
        instanceId: workItems.instanceId,
        parentInstanceId: workItems.parentInstanceId,
        title: workItems.title,
        brief: sql<string>`coalesce(substr(${workItemTexts.brief}, 1, ${BRIEF_OPENING}), '')`,
        endedBlocked: workItems.endedBlocked,
        headline: workItems.headline,
        state: workItems.state,
        lands: workItems.lands,
        taskId: workItems.taskId,
        projectId: workItems.projectId,
        workspaceId: workItems.workspaceId,
        createdAt: workItems.createdAt,
        endedAt: workItems.endedAt,
      })
      .from(workItems)
      .leftJoin(workItemTexts, eq(workItemTexts.workItemId, workItems.id))
      .where(ids ? inArray(workItems.id, ids) : undefined)
      .all(),
  workspaceBranches: (ids) =>
    new Map(
      db
        .select({ id: workspaces.id, branch: workspaces.branch })
        .from(workspaces)
        .where(ids ? inArray(workspaces.id, ids) : undefined)
        .all()
        .map((row) => [row.id, row.branch])
    ),
});

export interface FindSettingsDb {
  /** The person's Find settings (find-secrets.ts): "Hide secrets in Find", on until they turn it off. */
  readonly findSettings: {
    readonly hideSecrets: () => boolean;
    readonly setHideSecrets: (on: boolean, at: Date) => void;
  };
}

export const findSettingsDb = (core: DbCore): FindSettingsDb => {
  const { db } = core;

  return {
    findSettings: {
      hideSecrets: () =>
        db
          .select({ value: findSettings.hideSecrets })
          .from(findSettings)
          .where(eq(findSettings.id, FIND_SETTINGS_ID))
          .get()?.value ?? true,
      setHideSecrets: (on, at) => {
        const set = { hideSecrets: on, changedAt: at };
        db.insert(findSettings)
          .values({ id: FIND_SETTINGS_ID, ...set })
          .onConflictDoUpdate({ target: findSettings.id, set })
          .run();
      },
    },
  };
};
