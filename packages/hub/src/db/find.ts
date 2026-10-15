import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  artifacts,
  instances,
  projectTasks,
  routineRuns,
  routines,
  seenMarks,
  sessionPlans,
  threadMessages,
  workItems,
  workspaces,
} from "./schema";

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
  conversations: instances.conversations,
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
}

export interface FindDb {
  /** Every artifact, newest first: what it is, whose, and the keys the person changed. */
  readonly artifacts: () => (typeof artifacts.$inferSelect)[];
  /** The ids of the sessions find holds whose id starts with `prefix` (hex and dashes only). */
  readonly idsByPrefix: (prefix: string) => string[];
  /** The conversations find reads ({@link findColumns}): every one, or these ids'. */
  readonly instances: (ids?: string[]) => FindInstanceRow[];
  /** Records that the person opened `objectId` (at `revision`), now. */
  readonly markSeen: (
    person: string,
    kind: "artifact" | "report",
    objectId: string,
    revision: number
  ) => void;
  /** Each session's plan step under way, by session. */
  readonly planSteps: () => Map<string, string>;
  /** Every work item's result, for those ended after `after` (ms epoch): the commits and diffstat its report names. */
  readonly results: (
    after: number
  ) => { endedAt: Date; id: string; result: string | null }[];
  /** Every routine, with its newest ended run's outcome. */
  readonly routines: () => FindRoutineRow[];
  /** What one person has opened, by `kind:objectId`: the revision and when. */
  readonly seen: (
    person: string
  ) => Map<string, { revision: number; seenAt: Date }>;
  /** Every project's task index. */
  readonly tasks: () => (typeof projectTasks.$inferSelect)[];
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
  artifacts: () => db.select().from(artifacts).all(),
  idsByPrefix: (prefix) =>
    ID_PREFIX.test(prefix)
      ? db
          .select({ id: instances.id })
          .from(instances)
          .where(and(findable(), sql`${instances.id} LIKE ${`${prefix}%`}`))
          .all()
          .map((row) => row.id)
      : [],
  instances: (ids) =>
    db
      .select(findColumns)
      .from(instances)
      .where(ids ? and(findable(), inArray(instances.id, ids)) : findable())
      .all(),
  markSeen: (person, kind, objectId, revision) => {
    const row = { person, kind, objectId, revision, seenAt: new Date() };
    db.insert(seenMarks)
      .values(row)
      .onConflictDoUpdate({
        target: [seenMarks.person, seenMarks.kind, seenMarks.objectId],
        set: { revision, seenAt: row.seenAt },
      })
      .run();
  },
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
          enabled: row.enabled,
          nextSlot: row.nextSlot,
          lastOutcome: run?.outcome ?? null,
          lastRunAt: run?.endedAt ? new Date(run.endedAt) : null,
        };
      });
  },
  seen: (person) =>
    new Map(
      db
        .select()
        .from(seenMarks)
        .where(eq(seenMarks.person, person))
        .all()
        .map((row) => [
          `${row.kind}:${row.objectId}`,
          { revision: row.revision, seenAt: row.seenAt },
        ])
    ),
  tasks: () => db.select().from(projectTasks).all(),
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
