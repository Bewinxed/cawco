import {
  and,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  artifactChanges,
  artifacts,
  instanceConversations,
  instances,
  projectTaskLabels,
  projectTasks,
  routineRuns,
  routines,
  sessionPlans,
  threadMessages,
  workItems,
  workspaces,
} from "./schema";

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
  /** Its `finish_item` said something outside its control stopped it. */
  blocked: boolean;
  brief: string;
  createdAt: Date;
  endedAt: Date | null;
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
  /** The thread its runs are noted in; null before its first note. */
  threadId: string | null;
}

export interface FindDb {
  /** Every artifact: what it is, whose, and whether the person changed any of its keys. */
  readonly artifacts: () => FindArtifactRow[];
  /** The ids of the sessions find holds whose id starts with `prefix` (hex and dashes only). */
  readonly idsByPrefix: (prefix: string) => string[];
  /** The conversations find reads ({@link findColumns}): every one, or these ids'. */
  readonly instances: (ids?: string[]) => FindInstanceRow[];
  /**
   * When the person last looked at each session they have looked at (its
   * tab in front after it ended, or archived off Finished, on any device:
   * `instances.seen_at`, the one record of it), by session id.
   */
  readonly lookedAt: () => Map<string, number>;
  /** Each session's plan step under way, by session. */
  readonly planSteps: () => Map<string, string>;
  /** Every work item's result, for those ended after `after` (ms epoch): the commits and diffstat its report names. */
  readonly results: (
    after: number
  ) => { endedAt: Date; id: string; result: string | null }[];
  /** Every routine, with its newest ended run's outcome. */
  readonly routines: () => FindRoutineRow[];
  /** Every project's indexed tasks, each with its labels. */
  readonly tasks: () => (typeof projectTasks.$inferSelect & {
    labels: string[];
  })[];
  /** Every thread message of yours or Caw's: the words a thread is found by. */
  readonly threadWords: () => {
    at: Date;
    author: "you" | "caw";
    body: string;
    id: string;
    threadId: string;
  }[];
  /** Every work item: what it was for and how it ended ({@link BRIEF_OPENING}). */
  readonly workItems: () => FindWorkItemRow[];
  /** Each workspace's branch, by its id. */
  readonly workspaceBranches: () => Map<string, string>;
}

const findable = () =>
  and(
    eq(instances.machineRemoved, false),
    ne(instances.status, "discarded"),
    ne(instances.kind, "summariser"),
    or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
  );

/** What a session id's prefix may hold: hex and dashes. */
const ID_PREFIX = /^[0-9a-f-]+$/;

export const findDb = (db: BunSQLiteDatabase): FindDb => ({
  artifacts: () =>
    db
      .select({
        ...getTableColumns(artifacts),
        personChanged:
          sql<boolean>`exists (select 1 from ${artifactChanges} where ${artifactChanges.artifactId} = ${artifacts.id} and ${artifactChanges.by} = 'person')`.mapWith(
            Boolean
          ),
      })
      .from(artifacts)
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
  lookedAt: () =>
    new Map(
      db
        .select({
          id: instances.id,
          at: sql<number>`${instances.seenAt}`,
        })
        .from(instances)
        .where(isNotNull(instances.seenAt))
        .all()
        .map((row) => [row.id, row.at])
    ),
  planSteps: () => {
    const steps = new Map<string, string>();
    for (const row of db
      .select({ id: sessionPlans.instanceId, steps: sessionPlans.steps })
      .from(sessionPlans)
      .all()) {
      const step = row.steps.find((each) => each.status === "in_progress");
      if (step) {
        steps.set(row.id, step.content);
      }
    }
    return steps;
  },
  results: (after) =>
    db
      .select({
        id: workItems.id,
        endedAt: sql<number>`${workItems.endedAt}`,
        result: workItems.result,
      })
      .from(workItems)
      .where(sql`${workItems.endedAt} > ${after}`)
      .all()
      .map((row) => ({ ...row, endedAt: new Date(row.endedAt) })),
  routines: () => {
    const last = db
      .select({
        routineId: routineRuns.routineId,
        outcome: routineRuns.outcome,
        endedAt: sql<number | null>`max(${routineRuns.endedAt})`,
      })
      .from(routineRuns)
      .where(sql`${routineRuns.endedAt} IS NOT NULL`)
      .groupBy(routineRuns.routineId)
      .all();
    const byRoutine = new Map(last.map((row) => [row.routineId, row]));
    return db
      .select()
      .from(routines)
      .all()
      .map((row) => {
        const run = byRoutine.get(row.id);
        return {
          id: row.id,
          name: row.name,
          prompt: row.prompt,
          projectId: row.projectId,
          threadId: row.threadId,
          enabled: row.enabled,
          nextSlot: row.nextSlot,
          lastOutcome: run?.outcome ?? null,
          lastRunAt: run?.endedAt ? new Date(run.endedAt) : null,
        };
      });
  },
  tasks: () => {
    const labels = new Map<string, string[]>();
    for (const { projectId, path, label } of db
      .select()
      .from(projectTaskLabels)
      .orderBy(sql`rowid`)
      .all()) {
      const key = `${projectId}\0${path}`;
      labels.set(key, [...(labels.get(key) ?? []), label]);
    }
    return db
      .select()
      .from(projectTasks)
      .all()
      .map((row) => ({
        ...row,
        labels: labels.get(`${row.projectId}\0${row.path}`) ?? [],
      }));
  },
  threadWords: () =>
    db
      .select({
        id: threadMessages.id,
        threadId: threadMessages.threadId,
        author: threadMessages.author,
        body: threadMessages.body,
        at: threadMessages.createdAt,
      })
      .from(threadMessages)
      .where(inArray(threadMessages.author, ["you", "caw"]))
      .all() as {
      at: Date;
      author: "you" | "caw";
      body: string;
      id: string;
      threadId: string;
    }[],
  workItems: () =>
    db
      .select({
        id: workItems.id,
        instanceId: workItems.instanceId,
        parentInstanceId: workItems.parentInstanceId,
        title: workItems.title,
        brief: sql<string>`substr(${workItems.brief}, 1, ${BRIEF_OPENING})`,
        blocked:
          sql<boolean>`json_extract(${workItems.submission}, '$.blocked') IS NOT NULL`.mapWith(
            Boolean
          ),
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
      .all(),
  workspaceBranches: () =>
    new Map(
      db
        .select({ id: workspaces.id, branch: workspaces.branch })
        .from(workspaces)
        .all()
        .map((row) => [row.id, row.branch])
    ),
});
