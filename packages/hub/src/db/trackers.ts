import type { IssueTracker } from "@cawco/core";
import { and, count, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { projects, taskLinks, trackerBindings, trackerLinks } from "./schema";
import type { TaskLinkRow } from "./task-links";

export type TrackerBindingRow = typeof trackerBindings.$inferSelect;
/** What a task and its issue last agreed on (`tracker_links`). */
export type TrackerAgreementRow = typeof trackerLinks.$inferSelect;

/** A task the sync links to its issue: what they agreed on, and the issue as its record link holds it. */
export interface TrackerLinkRow
  extends
    TrackerAgreementRow,
    Pick<TaskLinkRow, "problem" | "ref" | "syncedAt" | "url"> {
  /** The issue's key to its tracker: GitHub's number, Linear's id. */
  issueKey: string;
  provider: IssueTracker;
}

/** What a sync changes of a link: what they agreed on, and what its issue holds. */
export type TrackerLinkPatch = Partial<
  Pick<TrackerAgreementRow, "synced"> &
    Omit<TaskLinkRow, "mode" | "projectId" | "taskId" | "url">
>;

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
  readonly link: (
    projectId: string,
    taskId: string
  ) => TrackerLinkRow | undefined;
  readonly linkedCount: (projectId: string) => number;
  readonly links: (projectId: string) => TrackerLinkRow[];
  /** Links a task to its issue: what they agree on, and its record link as the issue holds it, in one transaction. */
  readonly putLink: (agreed: TrackerAgreementRow, record: TaskLinkRow) => void;
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

/** The agreement and its record link, as one row. */
const joined = (
  agreed: TrackerAgreementRow,
  record: TaskLinkRow
): TrackerLinkRow => ({
  ...agreed,
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
  /** The agreements of a project (or one task) with their record links. */
  const linked = (projectId: string, taskId?: string): TrackerLinkRow[] =>
    db
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
      .all()
      .map((row) => joined(row.agreed, row.record));
  return {
    binding: (projectId) =>
      db
        .select()
        .from(trackerBindings)
        .where(eq(trackerBindings.projectId, projectId))
        .get(),
    bindings: () => db.select().from(trackerBindings).all(),
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
        tx.insert(trackerBindings)
          .values(row)
          .onConflictDoUpdate({ target: trackerBindings.projectId, set: row })
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
      db.transaction((tx) => {
        tx.insert(trackerLinks)
          .values(agreed)
          .onConflictDoUpdate({
            target: [trackerLinks.projectId, trackerLinks.taskId],
            set: agreed,
          })
          .run();
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
      db.transaction((tx) => {
        const rows = tx
          .select({ taskId: trackerLinks.taskId, synced: trackerLinks.synced })
          .from(trackerLinks)
          .where(eq(trackerLinks.projectId, projectId))
          .all();
        for (const row of rows) {
          const { status: _was, ...synced } = row.synced;
          tx.update(trackerLinks)
            .set({ synced })
            .where(
              and(
                eq(trackerLinks.projectId, projectId),
                eq(trackerLinks.taskId, row.taskId)
              )
            )
            .run();
        }
      });
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
    updateBinding: (projectId, patch) => {
      db.update(trackerBindings)
        .set(patch)
        .where(eq(trackerBindings.projectId, projectId))
        .run();
    },
    updateLink: (projectId, taskId, patch) => {
      const { synced, ...held } = patch;
      db.transaction((tx) => {
        if (synced) {
          tx.update(trackerLinks)
            .set({ synced })
            .where(
              and(
                eq(trackerLinks.projectId, projectId),
                eq(trackerLinks.taskId, taskId)
              )
            )
            .run();
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
