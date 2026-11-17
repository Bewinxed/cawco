/**
 * What a project deleted for good leaves outside its own rows (project-delete.ts):
 * the sessions started from it and the workspaces its work items and its
 * places' stages were cut in, read so each can be removed on its machine,
 * then the work items and workspace rows themselves dropped once their
 * clones are gone. Its own rows go as a forget takes them (forget.ts).
 */

import type { MachinePath } from "@cawco/core/machine-path";
import type { WaitWitness } from "@cawco/core/task-views";
import type { WorkspaceCut } from "@cawco/core/workspace/controls";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { DbCore } from "./core";
import {
  instances,
  queuedTaskStarts,
  queuedWorkItemGlobs,
  queuedWorkItems,
  workItemGlobs,
  workItemOutputs,
  workItems,
  workItemWaits,
  workspaceCreates,
  workspaces,
} from "./schema";
import type {
  ItemBlock,
  QueuedRequest,
  WorkLanding,
  WorkspaceState,
} from "./stored-types";

/** A session of the project, as its removal needs it. */
export interface HeldSession {
  /** Whether it was asked to end already (a stop, a delete), and how. */
  endIntent: string | null;
  id: string;
  machineId: string;
}

/** A workspace of the project, as its removal needs it. */
export interface HeldWorkspace {
  carry: string | null;
  /** A host-scope delegate's: no clone of its own. */
  host: boolean;
  id: string;
  machineId: string;
  path: string;
  state: WorkspaceState;
}

export interface ProjectWorkDb {
  /** The project's work items, and each of `workspaceIds` no other work item names, gone. */
  readonly drop: (projectId: string, workspaceIds: readonly string[]) => void;
  /**
   * The sessions whose `project_id` is the project's, with `formerly`
   * (sessions a forget unlinked, still unlinked), and the workspaces its
   * work items or its places' stages (`placeIds`) were cut in.
   */
  readonly held: (
    projectId: string,
    placeIds: readonly string[],
    formerly: readonly string[]
  ) => { sessions: HeldSession[]; workspaces: HeldWorkspace[] };
}

export const projectWorkDb = (db: BunSQLiteDatabase): ProjectWorkDb => ({
  held: (projectId, placeIds, formerly) => {
    const sessions = db
      .select({
        id: instances.id,
        machineId: instances.machineId,
        endIntent: instances.endIntent,
      })
      .from(instances)
      .where(
        or(
          eq(instances.projectId, projectId),
          formerly.length > 0
            ? and(
                inArray(instances.id, [...formerly]),
                isNull(instances.projectId)
              )
            : undefined
        )
      )
      .all();
    const items = db
      .select({ id: workItems.workspaceId })
      .from(workItems)
      .where(eq(workItems.projectId, projectId));
    const rows = db
      .select()
      .from(workspaces)
      .where(
        or(
          inArray(workspaces.id, items),
          placeIds.length > 0
            ? inArray(workspaces.stageFor, [...placeIds])
            : undefined
        )
      )
      .all();
    return {
      sessions,
      workspaces: rows.map((row) => ({
        carry: row.carry,
        host: row.host,
        id: row.id,
        machineId: row.machineId,
        path: row.path,
        state: row.state,
      })),
    };
  },
  drop: (projectId, workspaceIds) => {
    db.transaction((tx) => {
      tx.delete(workItems).where(eq(workItems.projectId, projectId)).run();
      if (workspaceIds.length > 0) {
        tx.delete(workspaces)
          .where(
            and(
              inArray(workspaces.id, [...workspaceIds]),
              notExists(
                tx
                  .select({ one: sql`1` })
                  .from(workItems)
                  .where(eq(workItems.workspaceId, workspaces.id))
              )
            )
          )
          .run();
      }
    });
  },
});

export type WorkItemRow = typeof workItems.$inferSelect;

/**
 * Whether an item is blocked ({@link itemBlockOf}): by a block that reads,
 * or by one that did not read as blocks became columns (schema.ts
 * `workItems.blockedUnread`), which holds it blocked all the same.
 */
export const isBlocked = (
  item: Pick<WorkItemRow, "blockedKind" | "blockedUnread">
): boolean => item.blockedKind !== null || item.blockedUnread !== null;

/** An item's block as its columns hold it; null when it has none that reads. */
export const itemBlockOf = (
  item: Pick<WorkItemRow, "blockedKind" | "blockedName" | "blockedSince">
): ItemBlock | null =>
  item.blockedKind !== null &&
  item.blockedName !== null &&
  item.blockedSince !== null
    ? {
        kind: item.blockedKind,
        name: item.blockedName,
        since: item.blockedSince.getTime(),
      }
    : null;

/**
 * Where a retired workspace's clone was as it went, as its columns hold it
 * (core `WorkspaceCut`); null when it has none that reads: never said, or
 * kept as not read (`headUnread`).
 */
export const headOf = (
  workspace: Pick<WorkspaceRow, "headBranch" | "headCarry" | "headCommit">
): WorkspaceCut | null =>
  workspace.headBranch !== null && workspace.headCommit !== null
    ? {
        branch: workspace.headBranch,
        commit: workspace.headCommit,
        ...(workspace.headCarry === null ? {} : { carry: workspace.headCarry }),
      }
    : null;

/** A workspace's head as its columns hold it ({@link headOf}), a head kept as not read replaced. */
export const headColumns = (head: WorkspaceCut | null) => ({
  headBranch: head?.branch ?? null,
  headCommit: head?.commit ?? null,
  headCarry: head?.carry ?? null,
  headUnread: null,
});

/**
 * The last wait an item declared: its live one ({@link workItems.waitUntil},
 * `waitReason`), else the one it last declared that is over
 * (`waitLastUntil`, `waitLastReason`); null when neither is there.
 */
export const lastWaitOf = (
  item: Pick<
    WorkItemRow,
    "waitLastReason" | "waitLastUntil" | "waitReason" | "waitUntil"
  >
): { reason: string; until: Date } | null => {
  if (item.waitUntil !== null && item.waitReason !== null) {
    return { until: item.waitUntil, reason: item.waitReason };
  }
  return item.waitLastUntil !== null && item.waitLastReason !== null
    ? { until: item.waitLastUntil, reason: item.waitLastReason }
    : null;
};

/**
 * Whether any of an item's work landed: its landing recorded the commit
 * pushed, or its landing is there and did not read as landings became
 * columns (schema.ts `workItems.landedUnread`), which holds it landed so it
 * is never landed again.
 */
export const landedWork = (
  item: Pick<WorkItemRow, "landedSha" | "landedUnread">
): boolean => item.landedSha !== null || item.landedUnread !== null;

/**
 * A change to a work item: its columns; and `landed`, what a landing that
 * pushed something put where, written to its landing's columns, the record
 * it replaces cleared.
 */
export type WorkItemChange = Partial<
  Pick<
    WorkItemRow,
    | "state"
    | "result"
    | "summary"
    | "headline"
    | "error"
    | "endedBlocked"
    | "endedAt"
    | "dismissedAt"
    | "dismissReason"
    | "replacedBy"
    | "landingSince"
    | "landingPhase"
    | "blockedKind"
    | "blockedName"
    | "blockedSince"
    | "blockedUnread"
    | "lastTurnAt"
    | "submission"
    | "waitUntil"
    | "waitReason"
    | "waitResumeBy"
    | "waitCount"
    | "waitLastReason"
    | "waitLastUntil"
    | "waitHistoryUnread"
    | "heldAt"
    | "heldAsleepAt"
    | "stoppingAt"
    | "prUrl"
    | "groupReportedAt"
    | "digest"
    | "turns"
    | "instanceId"
    | "origin"
    | "stoppedBy"
    | "taskResult"
  >
> & { landed?: WorkLanding };

/**
 * The last wait's columns a change moves with its live wait: a wait that
 * clears (`waitUntil: null`) leaves its end and reason as the last wait, and
 * a wait declared holds them itself, so the last ones clear. Read off the row
 * as it stood before the change, in the same statement.
 */
const lastWaitColumns = (waitUntil: Date | null | undefined) => {
  if (waitUntil === undefined) {
    return {};
  }
  if (waitUntil !== null) {
    return { waitLastUntil: null, waitLastReason: null };
  }
  return {
    waitLastUntil: sql`coalesce(${workItems.waitUntil}, ${workItems.waitLastUntil})`,
    waitLastReason: sql`CASE WHEN ${workItems.waitUntil} IS NULL THEN ${workItems.waitLastReason} ELSE ${workItems.waitReason} END`,
  };
};

/**
 * A work item at a task as dispatch and the task reads take it: its row and
 * the cards and pins it was dispatched on ({@link workItemWaits}), in the
 * order kept; what of them did not read is its `waitsUnread`.
 */
export type WorkItemAttempt = WorkItemRow & { waitedOn: WaitWitness[] };

/** A landing's columns on its work item, the record it replaces cleared. */
const landedColumns = (landed: WorkLanding) => ({
  landedSha: landed.sha,
  landedOnto: landed.onto,
  landedAt: landed.at === undefined ? null : new Date(landed.at),
  landedUnread: null,
});

type QueuedTaskStartRow = typeof queuedTaskStarts.$inferSelect;

/**
 * What a queued delegate's row holds of its request in its own columns and
 * rows: the globs it owns, the task it starts, and the ids it stands under
 * (the row's own id, and a session id minted as it was queued).
 */
export interface QueuedPlace {
  owns?: string[];
  queuedAs: { id: string; instanceId: string };
  task?: { id: string; projectId: string };
}

/** A queued delegate's request whole: the call as kept, and what its columns and rows hold of it. */
export type QueuedCall = QueuedRequest & QueuedPlace;

/**
 * A queued delegate as the queue hands it out: its request whole again,
 * the task, session id and globs it stands under put back in it from their
 * columns and rows. Held, `requestUnread` is its request as it was stored,
 * which did not read when the column gained its schema (migration 0405),
 * and `request` is what its columns and rows hold alone: it never starts.
 */
export type QueuedWorkItemRow = Pick<
  typeof queuedWorkItems.$inferSelect,
  "id" | "parentInstanceId" | "queuedAt" | "title"
> &
  (
    | { request: QueuedCall; requestUnread: null }
    | {
        request: QueuedPlace;
        requestUnread: string;
        /** When its parent was told it is held; null: not yet. */
        heldToldAt: Date | null;
      }
  );

/** Its paths named as {@link MachinePath}, which the API's schema reads as the string it is on the wire. */
export type WorkspaceRow = Omit<
  typeof workspaces.$inferSelect,
  "path" | "repoRoot"
> & { path: MachinePath; repoRoot: MachinePath };

export interface WorkRowsDb {
  /** A machine's active workspaces with a clone: an item there is live, or the hub has not settled it since. Never a host-scope row (schema.ts `workspaces.host`). */
  readonly activeWorkspacesOn: (machineId: string) => WorkspaceRow[];
  /** A machine's archived workspaces at any of `paths`: each one whose clone its machine still has. Never a host-scope row. */
  readonly archivedWorkspacesAt: (
    machineId: string,
    paths: readonly MachinePath[]
  ) => WorkspaceRow[];
  /** Records ownership before sending a create; a restart discards anything still unfiled. */
  readonly beginWorkspaceCreate: (id: string, machineId: string) => void;
  /** The live work items that are blocked ({@link isBlocked}), oldest first. */
  readonly blockedWorkItems: () => WorkItemRow[];
  /**
   * Work item `itemId` moves from session `from` to session `to`, a
   * continuation of it: the item and `to`'s row name each other, and
   * `from`'s row no longer names it.
   */
  readonly carryWorkItem: (itemId: string, from: string, to: string) => void;
  /**
   * The ids of every session any of these started with itself as its
   * `parentInstanceId`, a work item or none (a harness's subagent, OpenCode's
   * `delegate`): delegation-tree.ts `treeSessions`.
   */
  readonly childIdsOfParents: (parentInstanceIds: string[]) => string[];
  /** Files a work item as the hub accepted it, the globs it owns, the outputs it declares and the cards and pins it was dispatched on with it in one transaction. */
  readonly createWorkItem: (
    item: typeof workItems.$inferInsert & {
      outputs?: string[] | null;
      owns?: string[] | null;
      waitedOn?: readonly WaitWitness[] | null;
    }
  ) => WorkItemRow;
  /** Files a workspace whose checkout its machine has just made. */
  readonly createWorkspace: (
    workspace: typeof workspaces.$inferInsert
  ) => WorkspaceRow;
  /** Forgets a task's queued start, if it had one. */
  readonly dropQueuedTaskStart: (projectId: string, taskId: string) => void;
  readonly dropQueuedWorkItem: (id: string) => void;
  readonly finishWorkspaceCreate: (id: string) => void;
  /**
   * The landing gate's clones on `machineId` not archived yet: workspaces a
   * hub before 2026-11-17 cut to run a gate step for another (`checks_for`
   * set), which workspaces.ts `closeGateClones` lets go of.
   */
  readonly gateClonesOn: (machineId: string) => WorkspaceRow[];
  /** A parent's items in one group that no combined report has carried yet, oldest first. */
  readonly groupWorkItems: (
    parentInstanceId: string,
    group: string
  ) => WorkItemRow[];
  /** Marks when a held queued delegate's parent was told it is held: it is told once. */
  readonly heldToldQueued: (id: string, at: Date) => void;
  /** Every machine's held workspaces (schema.ts `WorkspaceState`), newest first. */
  readonly heldWorkspaces: () => WorkspaceRow[];
  /**
   * The sessions of the work items `parentInstanceIds` delegated, each once:
   * their ids alone, never the items' briefs and reports, which a delegation
   * tree's walk has no use for (3,134 items read whole took 200 ms a walk).
   */
  readonly itemSessionsOfParents: (parentInstanceIds: string[]) => string[];
  /** The work items, live or ended, whose session's `finish_item` turn has not been heard to end (`last_turn_at`). */
  readonly lastTurnWorkItems: () => WorkItemRow[];
  /** The live work items (starting or running) that own files, each with its globs: one join on `work_item_globs`. */
  readonly liveOwningWorkItems: () => {
    globs: string[];
    item: WorkItemRow;
  }[];
  /** Every work item still `starting`/`running`, fleet-wide. */
  readonly liveWorkItems: () => WorkItemRow[];
  /** The work items a session delegated that are still `starting`/`running`. */
  readonly liveWorkItemsOf: (parentInstanceId: string) => WorkItemRow[];
  /** The ids of a machine's workspaces with a clone and a live work item (starting or running). */
  readonly liveWorkspacesOn: (machineId: string) => string[];
  /** Stamps a task's attempt as sent back unmet (work_items `unmetAt`): Jev did not show its acceptance criteria met. */
  readonly markAttemptUnmet: (itemId: string) => void;
  /**
   * Every work item that is an attempt at one of the project's tasks, newest
   * first (dispatch.ts).
   */
  readonly projectAttempts: (projectId: string) => WorkItemAttempt[];
  /** Every work item of the project, newest first (handed-inputs.ts names one by its handle). */
  readonly projectWorkItems: (projectId: string) => WorkItemRow[];
  /** Every hook start waiting for a slot in the project, oldest first (dispatch.ts). */
  readonly queuedTaskStarts: (projectId: string) => QueuedTaskStartRow[];
  /** `delegate` calls waiting for files a live item owns, oldest first. */
  readonly queuedWorkItems: () => QueuedWorkItemRow[];
  /** Queues a hook's start, or replaces the one its task already had, a held one included. */
  readonly queueTaskStart: (
    row: Omit<
      QueuedTaskStartRow,
      "asked" | "askedUnread" | "queuedAt" | "retry" | "why"
    > & {
      asked?: QueuedTaskStartRow["asked"];
      retry?: boolean;
      why?: QueuedTaskStartRow["why"];
    }
  ) => QueuedTaskStartRow;
  readonly queueWorkItem: (row: {
    id: string;
    parentInstanceId: string;
    request: QueuedCall;
    title: string;
  }) => QueuedWorkItemRow;
  readonly runningDelegateCounts: () => Map<string, number>;
  /**
   * What a session's delegate tray can still show, oldest first: of the
   * items it delegated, the live and undismissed failed ones, and any other
   * that ended at or after `endedSince`.
   */
  readonly trayItemsOf: (sessionId: string, endedSince: Date) => WorkItemRow[];
  /** Moves a work item; the hub is its only writer. */
  readonly updateWorkItem: (
    id: string,
    change: WorkItemChange
  ) => WorkItemRow | undefined;
  /** Records what the workspace's machine says of its boundary, its archive, what it holds, or where its clone's HEAD was when it retired. */
  readonly updateWorkspace: (
    id: string,
    change: Partial<
      Pick<
        WorkspaceRow,
        | "base"
        | "boundaryPid"
        | "branch"
        | "carry"
        | "cutFromCommit"
        | "cutFromLanded"
        | "cutFromWorkspace"
        | "headBranch"
        | "headCarry"
        | "headCommit"
        | "headUnread"
        | "heldAt"
        | "holding"
        | "movedUntold"
        | "state"
        | "tmp"
      >
    >
  ) => WorkspaceRow | undefined;
  /** Stored waits, including any that elapsed while the hub was stopped. */
  readonly waitingWorkItems: () => WorkItemRow[];
  readonly workItem: (id: string) => WorkItemRow | undefined;
  /** The newest work item whose landing opened or found the pull request at `url`. */
  readonly workItemByPrUrl: (url: string) => WorkItemRow | undefined;
  /** The globs a work item owns; none when it claims nothing. */
  readonly workItemGlobs: (itemId: string) => string[];
  /** The outputs a work item declared, in the order it declared them; none when it declared none. */
  readonly workItemOutputs: (itemId: string) => string[];
  /** A workspace's items, newest first. */
  readonly workItemsIn: (workspaceId: string) => WorkItemRow[];
  /** Every work item any of these sessions delegated, newest first (delegation-tree.ts). */
  readonly workItemsOfParents: (parentInstanceIds: string[]) => WorkItemRow[];
  /** The cards and pins a work item was dispatched on, in the order kept; none when it waited on none. */
  readonly workItemWaits: (itemId: string) => WaitWitness[];
  /** Unfiled creates to discard when this machine next registers. */
  readonly workspaceCreatesOn: (
    machineId: string
  ) => (typeof workspaceCreates.$inferSelect)[];
  /** The outputs every item of a workspace declared, each once. */
  readonly workspaceOutputs: (workspaceId: string) => string[];
  /** The workspaces cut `from` workspace `workspaceId` (schema.ts `workspaces.cutFromWorkspace`), in any state. */
  readonly workspacesCutFrom: (workspaceId: string) => WorkspaceRow[];
  /** The workspaces an id names: itself exactly, else every one it prefixes. */
  readonly workspacesNamed: (idOrPrefix: string) => WorkspaceRow[];
}

export const workRowsDb = (core: DbCore): WorkRowsDb => {
  const { db } = core;

  return {
    carryWorkItem: (itemId, from, to) =>
      db.transaction((tx) => {
        tx.update(workItems)
          .set({ instanceId: to })
          .where(eq(workItems.id, itemId))
          .run();
        tx.update(instances)
          .set({ workItemId: itemId })
          .where(eq(instances.id, to))
          .run();
        tx.update(instances)
          .set({ workItemId: null })
          .where(and(eq(instances.id, from), eq(instances.workItemId, itemId)))
          .run();
      }),
    projectAttempts: (projectId) => {
      const items = db
        .select()
        .from(workItems)
        .where(
          and(eq(workItems.projectId, projectId), isNotNull(workItems.taskId))
        )
        .orderBy(desc(workItems.createdAt), desc(workItems.id))
        .all();
      const witnesses = new Map<string, WaitWitness[]>();
      for (const { itemId, target, value } of db
        .select({
          itemId: workItemWaits.itemId,
          target: workItemWaits.target,
          value: workItemWaits.value,
        })
        .from(workItemWaits)
        .innerJoin(workItems, eq(workItems.id, workItemWaits.itemId))
        .where(
          and(eq(workItems.projectId, projectId), isNotNull(workItems.taskId))
        )
        .orderBy(sql`${workItemWaits}.rowid`)
        .all()) {
        witnesses.set(itemId, [
          ...(witnesses.get(itemId) ?? []),
          { target, value },
        ]);
      }
      return items.map((item) => ({
        ...item,
        waitedOn: witnesses.get(item.id) ?? [],
      }));
    },
    projectWorkItems: (projectId) =>
      db
        .select()
        .from(workItems)
        .where(eq(workItems.projectId, projectId))
        .orderBy(desc(workItems.createdAt), desc(workItems.id))
        .all(),
    queuedTaskStarts: (projectId) =>
      db
        .select()
        .from(queuedTaskStarts)
        .where(eq(queuedTaskStarts.projectId, projectId))
        .orderBy(asc(queuedTaskStarts.queuedAt), asc(queuedTaskStarts.taskId))
        .all(),
    queueTaskStart: (row) =>
      db
        .insert(queuedTaskStarts)
        .values(row)
        .onConflictDoUpdate({
          target: [queuedTaskStarts.projectId, queuedTaskStarts.taskId],
          set: {
            stage: row.stage,
            parentInstanceId: row.parentInstanceId,
            why: row.why ?? "cap",
            retry: row.retry ?? false,
            origin: row.origin,
            asked: row.asked ?? null,
            askedUnread: null,
            queuedAt: new Date(),
          },
        })
        .returning()
        .get(),
    dropQueuedTaskStart: (projectId, taskId) => {
      db.delete(queuedTaskStarts)
        .where(
          and(
            eq(queuedTaskStarts.projectId, projectId),
            eq(queuedTaskStarts.taskId, taskId)
          )
        )
        .run();
    },
    workItemByPrUrl: (url) =>
      db
        .select()
        .from(workItems)
        .where(eq(workItems.prUrl, url))
        .orderBy(desc(workItems.createdAt))
        .limit(1)
        .get(),
    markAttemptUnmet: (itemId) => {
      db.update(workItems)
        .set({ unmetAt: new Date() })
        .where(eq(workItems.id, itemId))
        .run();
    },
    beginWorkspaceCreate: (id, machineId) => {
      db.insert(workspaceCreates).values({ id, machineId }).run();
    },
    finishWorkspaceCreate: (id) => {
      db.delete(workspaceCreates).where(eq(workspaceCreates.id, id)).run();
    },
    workspaceCreatesOn: (machineId) =>
      db
        .select()
        .from(workspaceCreates)
        .where(eq(workspaceCreates.machineId, machineId))
        .all(),
    createWorkspace: (workspace) =>
      db.transaction((tx) => {
        const row = tx.insert(workspaces).values(workspace).returning().get();
        tx.delete(workspaceCreates)
          .where(eq(workspaceCreates.id, workspace.id))
          .run();
        return row;
      }),
    workspacesNamed: (idOrPrefix) => {
      const exact = db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, idOrPrefix))
        .all();
      return exact.length
        ? exact
        : db
            .select()
            .from(workspaces)
            .where(sql`${workspaces.id} LIKE ${`${idOrPrefix}%`}`)
            .all();
    },
    createWorkItem: ({ outputs, owns, waitedOn, ...item }) =>
      db.transaction((tx) => {
        const row = tx.insert(workItems).values(item).returning().get();
        const owned = [...new Set(owns ?? [])];
        if (owned.length > 0) {
          tx.insert(workItemGlobs)
            .values(owned.map((glob) => ({ itemId: row.id, glob })))
            .run();
        }
        const declared = [...new Set(outputs ?? [])];
        if (declared.length > 0) {
          tx.insert(workItemOutputs)
            .values(declared.map((path) => ({ itemId: row.id, path })))
            .run();
        }
        if (waitedOn?.length) {
          tx.insert(workItemWaits)
            .values(
              waitedOn.map(({ target, value }) => ({
                itemId: row.id,
                target,
                value,
              }))
            )
            .onConflictDoNothing()
            .run();
        }
        return row;
      }),
    workItem: (id) =>
      db.select().from(workItems).where(eq(workItems.id, id)).get(),
    workItemGlobs: (itemId) =>
      db
        .select({ glob: workItemGlobs.glob })
        .from(workItemGlobs)
        .where(eq(workItemGlobs.itemId, itemId))
        .orderBy(sql`rowid`)
        .all()
        .map(({ glob }) => glob),
    workItemOutputs: (itemId) =>
      db
        .select({ path: workItemOutputs.path })
        .from(workItemOutputs)
        .where(eq(workItemOutputs.itemId, itemId))
        .orderBy(sql`rowid`)
        .all()
        .map(({ path }) => path),
    workItemWaits: (itemId) =>
      db
        .select({ target: workItemWaits.target, value: workItemWaits.value })
        .from(workItemWaits)
        .where(eq(workItemWaits.itemId, itemId))
        .orderBy(sql`rowid`)
        .all(),
    workspaceOutputs: (workspaceId) => [
      ...new Set(
        db
          .select({ path: workItemOutputs.path })
          .from(workItemOutputs)
          .innerJoin(workItems, eq(workItems.id, workItemOutputs.itemId))
          .where(eq(workItems.workspaceId, workspaceId))
          .orderBy(sql`${workItemOutputs}.rowid`)
          .all()
          .map(({ path }) => path)
      ),
    ],
    liveOwningWorkItems: () => {
      const owning = new Map<string, { globs: string[]; item: WorkItemRow }>();
      for (const { item, glob } of db
        .select({ item: workItems, glob: workItemGlobs.glob })
        .from(workItemGlobs)
        .innerJoin(workItems, eq(workItems.id, workItemGlobs.itemId))
        .where(inArray(workItems.state, ["starting", "running"]))
        .orderBy(asc(workItems.createdAt), sql`${workItemGlobs}.rowid`)
        .all()) {
        const known = owning.get(item.id);
        if (known) {
          known.globs.push(glob);
        } else {
          owning.set(item.id, { item, globs: [glob] });
        }
      }
      return [...owning.values()];
    },
    waitingWorkItems: () =>
      db
        .select()
        .from(workItems)
        .where(
          or(isNotNull(workItems.waitUntil), isNotNull(workItems.waitResumeBy))
        )
        .all(),
    workItemsIn: (workspaceId) =>
      db
        .select()
        .from(workItems)
        .where(eq(workItems.workspaceId, workspaceId))
        .orderBy(desc(workItems.createdAt))
        .all(),
    runningDelegateCounts: () => {
      const parents = new Map(
        db
          .select({ id: instances.id, parent: instances.parentInstanceId })
          .from(instances)
          .all()
          .map((row) => [row.id, row.parent])
      );
      const live = db
        .select({ parent: workItems.parentInstanceId })
        .from(workItems)
        .where(inArray(workItems.state, ["starting", "running"]))
        .all();
      const counts = new Map<string, number>();
      for (const item of live) {
        const visited = new Set<string>();
        let parent: string | null | undefined = item.parent;
        while (parent && !visited.has(parent)) {
          visited.add(parent);
          counts.set(parent, (counts.get(parent) ?? 0) + 1);
          parent = parents.get(parent);
        }
      }
      return counts;
    },
    liveWorkItems: () =>
      db
        .select()
        .from(workItems)
        .where(inArray(workItems.state, ["starting", "running"]))
        .orderBy(workItems.createdAt)
        .all(),
    blockedWorkItems: () =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            or(
              isNotNull(workItems.blockedKind),
              isNotNull(workItems.blockedUnread)
            ),
            inArray(workItems.state, ["starting", "running"])
          )
        )
        .orderBy(workItems.createdAt)
        .all(),
    groupWorkItems: (parentInstanceId, group) =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.parentInstanceId, parentInstanceId),
            eq(workItems.group, group),
            isNull(workItems.groupReportedAt)
          )
        )
        .orderBy(workItems.createdAt)
        .all(),
    // A queued request's `owns` is its globs' rows, put back as it reads.
    queuedWorkItems: () => {
      const globs = new Map<string, string[]>();
      for (const { queuedId, glob } of db
        .select()
        .from(queuedWorkItemGlobs)
        .orderBy(sql`rowid`)
        .all()) {
        globs.set(queuedId, [...(globs.get(queuedId) ?? []), glob]);
      }
      return db
        .select()
        .from(queuedWorkItems)
        .orderBy(asc(queuedWorkItems.queuedAt), asc(queuedWorkItems.id))
        .all()
        .map(
          ({
            projectId,
            taskId,
            queuedInstanceId,
            request,
            requestUnread,
            heldToldAt,
            ...row
          }): QueuedWorkItemRow => {
            const owned = globs.get(row.id);
            const place: QueuedPlace = {
              ...(owned ? { owns: owned } : {}),
              ...(projectId && taskId
                ? { task: { id: taskId, projectId } }
                : {}),
              queuedAs: { id: row.id, instanceId: queuedInstanceId },
            };
            // The table's check keeps exactly one of the two set.
            return request === null
              ? {
                  ...row,
                  request: place,
                  requestUnread: requestUnread ?? "",
                  heldToldAt,
                }
              : {
                  ...row,
                  request: { ...request, ...place },
                  requestUnread: null,
                };
          }
        );
    },
    // What the queue reads of a request is columns and rows; the rest of it
    // is kept as `delegate` made it.
    queueWorkItem: ({ request, ...row }) =>
      db.transaction((tx) => {
        const { owns, task, queuedAs, ...rest } = request;
        const queued = tx
          .insert(queuedWorkItems)
          .values({
            ...row,
            request: rest,
            projectId: task?.projectId ?? null,
            taskId: task?.id ?? null,
            queuedInstanceId: queuedAs.instanceId,
          })
          .returning()
          .get();
        const owned = [...new Set(owns ?? [])];
        if (owned.length > 0) {
          tx.insert(queuedWorkItemGlobs)
            .values(owned.map((glob) => ({ queuedId: queued.id, glob })))
            .run();
        }
        return {
          id: queued.id,
          parentInstanceId: queued.parentInstanceId,
          title: queued.title,
          queuedAt: queued.queuedAt,
          request,
          requestUnread: null,
        };
      }),
    heldToldQueued: (id, at) => {
      db.update(queuedWorkItems)
        .set({ heldToldAt: at })
        .where(eq(queuedWorkItems.id, id))
        .run();
    },
    dropQueuedWorkItem: (id) => {
      db.delete(queuedWorkItems).where(eq(queuedWorkItems.id, id)).run();
    },
    liveWorkItemsOf: (parentInstanceId) =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.parentInstanceId, parentInstanceId),
            inArray(workItems.state, ["starting", "running"])
          )
        )
        .all(),
    lastTurnWorkItems: () =>
      db.select().from(workItems).where(isNotNull(workItems.lastTurnAt)).all(),
    workItemsOfParents: (parentInstanceIds) =>
      parentInstanceIds.length === 0
        ? []
        : db
            .select()
            .from(workItems)
            .where(inArray(workItems.parentInstanceId, parentInstanceIds))
            .orderBy(desc(workItems.createdAt))
            .all(),
    itemSessionsOfParents: (parentInstanceIds) =>
      parentInstanceIds.length === 0
        ? []
        : db
            .selectDistinct({ id: workItems.instanceId })
            .from(workItems)
            .where(inArray(workItems.parentInstanceId, parentInstanceIds))
            .all()
            .map((row) => row.id),
    childIdsOfParents: (parentInstanceIds) =>
      parentInstanceIds.length === 0
        ? []
        : db
            .select({ id: instances.id })
            .from(instances)
            .where(inArray(instances.parentInstanceId, parentInstanceIds))
            .all()
            .map((row) => row.id),
    trayItemsOf: (sessionId, endedSince) =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.parentInstanceId, sessionId),
            isNull(workItems.dismissedAt),
            or(
              inArray(workItems.state, ["starting", "running", "failed"]),
              gte(workItems.endedAt, endedSince)
            )
          )
        )
        .orderBy(workItems.createdAt)
        .all(),
    updateWorkItem: (id, { landed, ...change }) =>
      db
        .update(workItems)
        .set({
          ...change,
          ...lastWaitColumns(change.waitUntil),
          ...(landed ? landedColumns(landed) : {}),
        })
        .where(eq(workItems.id, id))
        .returning()
        .get(),
    activeWorkspacesOn: (machineId) =>
      db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.machineId, machineId),
            eq(workspaces.state, "active"),
            eq(workspaces.host, false)
          )
        )
        .all(),
    archivedWorkspacesAt: (machineId, paths) =>
      paths.length === 0
        ? []
        : db
            .select()
            .from(workspaces)
            .where(
              and(
                eq(workspaces.machineId, machineId),
                eq(workspaces.state, "archived"),
                eq(workspaces.host, false),
                inArray(workspaces.path, [...paths])
              )
            )
            .all(),
    heldWorkspaces: () =>
      db
        .select()
        .from(workspaces)
        .where(eq(workspaces.state, "held"))
        .orderBy(desc(workspaces.createdAt))
        .all(),
    liveWorkspacesOn: (machineId) =>
      db
        .selectDistinct({ id: workspaces.id })
        .from(workItems)
        .innerJoin(workspaces, eq(workspaces.id, workItems.workspaceId))
        .where(
          and(
            eq(workspaces.machineId, machineId),
            eq(workspaces.host, false),
            inArray(workItems.state, ["starting", "running"])
          )
        )
        .all()
        .map((row) => row.id),
    gateClonesOn: (machineId) =>
      db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.machineId, machineId),
            isNotNull(workspaces.checksFor),
            ne(workspaces.state, "archived")
          )
        )
        .all(),
    workspacesCutFrom: (workspaceId) =>
      db
        .select()
        .from(workspaces)
        .where(eq(workspaces.cutFromWorkspace, workspaceId))
        .all(),
    updateWorkspace: (id, change) =>
      db
        .update(workspaces)
        .set(change)
        .where(eq(workspaces.id, id))
        .returning()
        .get(),
  };
};
