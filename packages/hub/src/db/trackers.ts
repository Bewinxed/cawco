import type { IssueTracker } from "@cawco/core/trackers";
import { and, count, eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  projects,
  taskLinks,
  trackerBindings,
  trackerLinkSyncedLabels,
  trackerLinks,
} from "./schema";
import type { TaskLinkRow } from "./task-links";

type TrackerBindingColumns = typeof trackerBindings.$inferSelect;

/**
 * Where a tracker binding's poll stands (tracker.ts): the newest change it
 * took in, of issues and of their comments, and GitHub's ETag for each list
 * as it last asked it.
 */
export interface TrackerCursor {
  commentsEtag: string | null;
  /** The newest comment taken in, ms. */
  commentsSince: number;
  etag: string | null;
  /** The newest issue change taken in, ms. */
  since: number;
}

/** A project's binding as tracker.ts reads and writes it: its poll's cursor whole. */
export type TrackerBindingRow = Omit<
  TrackerBindingColumns,
  | "commentsEtag"
  | "commentsSince"
  | "cursorUnread"
  | "issuesEtag"
  | "issuesSince"
> & { cursor: TrackerCursor };

/** A binding as its row holds it. */
const bindingOf = ({
  issuesSince,
  issuesEtag,
  commentsSince,
  commentsEtag,
  cursorUnread: _unread,
  ...row
}: TrackerBindingColumns): TrackerBindingRow => ({
  ...row,
  cursor: {
    since: issuesSince,
    etag: issuesEtag,
    commentsSince,
    commentsEtag,
  },
});

/** A cursor's columns, as every writer writes them whole: what migration 0431 kept as not read goes with it. */
const cursorColumns = (cursor: TrackerCursor) => ({
  issuesSince: cursor.since,
  issuesEtag: cursor.etag,
  commentsSince: cursor.commentsSince,
  commentsEtag: cursor.commentsEtag,
  cursorUnread: null,
});

/** A binding's columns, its cursor's among them. */
const bindingColumns = ({ cursor, ...row }: TrackerBindingRow) => ({
  ...row,
  ...cursorColumns(cursor),
});

/**
 * What a task and its issue last agreed on (tracker.ts), the baseline of
 * their three-way merge: each field the tracker is the record of, and the
 * stage that agreed with the issue's state. A side whose value moved off it
 * changed that field.
 */
export interface TrackerSynced {
  description: string;
  /** A set, sorted as tracker-adapter.ts `labelSet` sorts it. */
  labels: string[];
  /** The stage the task stood in when they agreed. */
  stage: string;
  /** The issue's state, as tracker.ts names it (`open`, `closed:completed`, a Linear state's id). */
  state: string;
  /** GitHub: the Status option its Project item stood in; null when not on the Project, no Status, or no Project. */
  status: string | null;
  title: string;
}

/**
 * A link's baseline: what they agreed on, or held, when the one stored
 * does not read whole (migration 0407's `synced_unread`, or a field
 * missing): nothing is pulled or pushed on it, and it is never read as
 * no baseline.
 */
export type TrackerBaseline =
  { held: false; synced: TrackerSynced } | { held: true };

/** A task linked to its issue, as tracker.ts writes it: what they agree on from now, when, and who opened the issue. */
export interface TrackerAgreement {
  linkedAt: Date;
  projectId: string;
  synced: TrackerSynced;
  taskId: string;
  unvouched: string | null;
}

/** A task the sync links to its issue: its baseline, and the issue as its record link holds it. */
export interface TrackerLinkRow
  extends
    Omit<TrackerAgreement, "synced">,
    Pick<TaskLinkRow, "problem" | "ref" | "syncedAt" | "url"> {
  baseline: TrackerBaseline;
  /** The issue's key to its tracker: GitHub's number, Linear's id. */
  issueKey: string;
  provider: IssueTracker;
}

/** What a sync changes of a link: what they agreed on, and what its issue holds. */
export type TrackerLinkPatch = Partial<
  Pick<TrackerAgreement, "synced"> &
    Omit<TaskLinkRow, "mode" | "projectId" | "taskId" | "url">
>;

type TrackerLinkColumns = typeof trackerLinks.$inferSelect;

/** A row's baseline: held while 0407 kept it unread, or a field it needs is missing. */
const baselineOf = (
  row: TrackerLinkColumns,
  labels: string[]
): TrackerBaseline => {
  const {
    syncedTitle: title,
    syncedDescription: description,
    syncedStage: stage,
    syncedState: state,
  } = row;
  if (
    row.syncedUnread !== null ||
    title === null ||
    description === null ||
    stage === null ||
    state === null
  ) {
    return { held: true };
  }
  return {
    held: false,
    synced: {
      title,
      description,
      labels: [...labels].sort(),
      stage,
      state,
      status: row.syncedStatus,
    },
  };
};

/** A baseline's columns, as every writer writes them whole: any hold goes with it. */
const columnsOf = (synced: TrackerSynced) => ({
  syncedTitle: synced.title,
  syncedDescription: synced.description,
  syncedStage: synced.stage,
  syncedState: synced.state,
  syncedStatus: synced.status,
  syncedUnread: null,
});

/** The rows tracker.ts keeps: a project's binding, and what its tasks and their issues agreed on. */
export interface TrackersDb {
  /**
   * Binds a project, its `projects.tracker` with it, in one transaction:
   * a binding to another target lets go of what the old one's links agreed
   * on; each task's record link follows its file (`issue:`).
   */
  readonly bind: (row: TrackerBindingRow) => void;
  /** A project's binding, or none while its tasks live in CawCo's files alone. */
  readonly binding: (projectId: string) => TrackerBindingRow | undefined;
  /** Every project's binding: what the poller walks. */
  readonly bindings: () => TrackerBindingRow[];
  /** Lets go of what a task and its issue agreed on (it is linked again). */
  readonly dropLink: (projectId: string, taskId: string) => void;
  /** Lets go of the Status every link agreed on: the binding's GitHub Project changed. */
  readonly forgetStatus: (projectId: string) => void;
  /** Whether a task's link has its merge held: its baseline does not read whole. */
  readonly held: (projectId: string, taskId: string) => boolean;
  readonly link: (
    projectId: string,
    taskId: string
  ) => TrackerLinkRow | undefined;
  readonly linkedCount: (projectId: string) => number;
  readonly links: (projectId: string) => TrackerLinkRow[];
  /** Links a task to its issue: what they agree on, and its record link as the issue holds it, in one transaction. */
  readonly putLink: (agreed: TrackerAgreement, record: TaskLinkRow) => void;
  /** Back to CawCo's files alone: the binding and what its links agreed on go. */
  readonly unbind: (projectId: string) => void;
  readonly updateBinding: (
    projectId: string,
    patch: Partial<Omit<TrackerBindingRow, "projectId">>
  ) => void;
  /** Changes what a task and its issue agreed on, and what its record link holds. */
  readonly updateLink: (
    projectId: string,
    taskId: string,
    patch: TrackerLinkPatch
  ) => void;
}

/** The agreement, its labels and its record link, as one row. */
const joined = (
  agreed: TrackerLinkColumns,
  labels: string[],
  record: TaskLinkRow
): TrackerLinkRow => ({
  projectId: agreed.projectId,
  taskId: agreed.taskId,
  linkedAt: agreed.linkedAt,
  unvouched: agreed.unvouched,
  baseline: baselineOf(agreed, labels),
  provider: record.source,
  issueKey:
    record.source === "github" ? String(record.number) : record.externalId,
  ref: record.ref,
  url: record.url,
  problem: record.problem,
  syncedAt: record.syncedAt,
});

export const trackersDb = (db: BunSQLiteDatabase): TrackersDb => {
  const forget = (
    tx: Pick<BunSQLiteDatabase, "delete">,
    projectId: string
  ): void => {
    tx.delete(trackerLinks).where(eq(trackerLinks.projectId, projectId)).run();
  };
  /** Writes a link's baseline whole, its labels' rows replaced: any hold goes. */
  const putBaseline = (
    tx: Pick<BunSQLiteDatabase, "delete" | "insert" | "update">,
    projectId: string,
    taskId: string,
    synced: TrackerSynced
  ): void => {
    const one = and(
      eq(trackerLinks.projectId, projectId),
      eq(trackerLinks.taskId, taskId)
    );
    tx.update(trackerLinks).set(columnsOf(synced)).where(one).run();
    tx.delete(trackerLinkSyncedLabels)
      .where(
        and(
          eq(trackerLinkSyncedLabels.projectId, projectId),
          eq(trackerLinkSyncedLabels.taskId, taskId)
        )
      )
      .run();
    if (synced.labels.length > 0) {
      tx.insert(trackerLinkSyncedLabels)
        .values(synced.labels.map((label) => ({ projectId, taskId, label })))
        .onConflictDoNothing()
        .run();
    }
  };
  /** The labels each link of a project (or one task) agreed on, by task. */
  const labelsOf = (
    projectId: string,
    taskIds: string[]
  ): Map<string, string[]> => {
    const by = new Map<string, string[]>();
    if (taskIds.length === 0) {
      return by;
    }
    const rows = db
      .select()
      .from(trackerLinkSyncedLabels)
      .where(
        and(
          eq(trackerLinkSyncedLabels.projectId, projectId),
          inArray(trackerLinkSyncedLabels.taskId, taskIds)
        )
      )
      .all();
    for (const row of rows) {
      by.set(row.taskId, [...(by.get(row.taskId) ?? []), row.label]);
    }
    return by;
  };
  /** The agreements of a project (or one task) with their labels and record links. */
  const linked = (projectId: string, taskId?: string): TrackerLinkRow[] => {
    const rows = db
      .select({ agreed: trackerLinks, record: taskLinks })
      .from(trackerLinks)
      .innerJoin(
        taskLinks,
        and(
          eq(taskLinks.projectId, trackerLinks.projectId),
          eq(taskLinks.taskId, trackerLinks.taskId),
          eq(taskLinks.mode, "record")
        )
      )
      .where(
        and(
          eq(trackerLinks.projectId, projectId),
          taskId === undefined ? undefined : eq(trackerLinks.taskId, taskId)
        )
      )
      .all();
    const labels = labelsOf(
      projectId,
      rows.map((row) => row.agreed.taskId)
    );
    return rows.map((row) =>
      joined(row.agreed, labels.get(row.agreed.taskId) ?? [], row.record)
    );
  };
  return {
    binding: (projectId) => {
      const row = db
        .select()
        .from(trackerBindings)
        .where(eq(trackerBindings.projectId, projectId))
        .get();
      return row ? bindingOf(row) : undefined;
    },
    bindings: () => db.select().from(trackerBindings).all().map(bindingOf),
    bind: (row) => {
      db.transaction((tx) => {
        const was = tx
          .select()
          .from(trackerBindings)
          .where(eq(trackerBindings.projectId, row.projectId))
          .get();
        if (
          was &&
          (was.provider !== row.provider || was.target !== row.target)
        ) {
          forget(tx, row.projectId);
        }
        const values = bindingColumns(row);
        tx.insert(trackerBindings)
          .values(values)
          .onConflictDoUpdate({
            target: trackerBindings.projectId,
            set: values,
          })
          .run();
        tx.update(projects)
          .set({ tracker: row.provider })
          .where(eq(projects.id, row.projectId))
          .run();
      });
    },
    link: (projectId, taskId) => linked(projectId, taskId)[0],
    links: (projectId) => linked(projectId),
    linkedCount: (projectId) =>
      db
        .select({ n: count() })
        .from(trackerLinks)
        .where(eq(trackerLinks.projectId, projectId))
        .get()?.n ?? 0,
    putLink: (agreed, record) => {
      const { synced, ...link } = agreed;
      db.transaction((tx) => {
        tx.insert(trackerLinks)
          .values(link)
          .onConflictDoUpdate({
            target: [trackerLinks.projectId, trackerLinks.taskId],
            set: link,
          })
          .run();
        putBaseline(tx, agreed.projectId, agreed.taskId, synced);
        const { projectId, taskId, url, ...set } = record;
        tx.insert(taskLinks)
          .values(record)
          .onConflictDoUpdate({
            target: [taskLinks.projectId, taskLinks.taskId, taskLinks.url],
            set,
          })
          .run();
      });
    },
    dropLink: (projectId, taskId) => {
      db.delete(trackerLinks)
        .where(
          and(
            eq(trackerLinks.projectId, projectId),
            eq(trackerLinks.taskId, taskId)
          )
        )
        .run();
    },
    forgetStatus: (projectId) => {
      db.update(trackerLinks)
        .set({ syncedStatus: null })
        .where(eq(trackerLinks.projectId, projectId))
        .run();
    },
    held: (projectId, taskId) => {
      const row = db
        .select()
        .from(trackerLinks)
        .where(
          and(
            eq(trackerLinks.projectId, projectId),
            eq(trackerLinks.taskId, taskId)
          )
        )
        .get();
      return row !== undefined && baselineOf(row, []).held;
    },
    unbind: (projectId) => {
      db.transaction((tx) => {
        tx.delete(trackerBindings)
          .where(eq(trackerBindings.projectId, projectId))
          .run();
        forget(tx, projectId);
        tx.update(projects)
          .set({ tracker: "cawco" })
          .where(eq(projects.id, projectId))
          .run();
      });
    },
    updateBinding: (projectId, { cursor, ...patch }) => {
      db.update(trackerBindings)
        .set({ ...patch, ...(cursor ? cursorColumns(cursor) : {}) })
        .where(eq(trackerBindings.projectId, projectId))
        .run();
    },
    updateLink: (projectId, taskId, patch) => {
      const { synced, ...held } = patch;
      db.transaction((tx) => {
        if (synced) {
          putBaseline(tx, projectId, taskId, synced);
        }
        if (Object.keys(held).length > 0) {
          tx.update(taskLinks)
            .set(held)
            .where(
              and(
                eq(taskLinks.projectId, projectId),
                eq(taskLinks.taskId, taskId),
                eq(taskLinks.mode, "record")
              )
            )
            .run();
        }
      });
    },
  };
};
