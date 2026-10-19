import { and, count, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  projects,
  trackerBindings,
  trackerComments,
  trackerLinks,
} from "./schema";

export type TrackerBindingRow = typeof trackerBindings.$inferSelect;
export type TrackerLinkRow = typeof trackerLinks.$inferSelect;

/** The rows tracker.ts keeps: a project's binding, its tasks' links, and the comments carried. */
export interface TrackersDb {
  /**
   * Binds a project, its `projects.tracker` with it, in one transaction:
   * a binding to another target lets go of the links and carried comments
   * the old one had, so no task names an issue the project no longer reads.
   */
  readonly bind: (row: TrackerBindingRow) => void;
  /** A project's binding, or none while its tasks live in CawCo's files alone. */
  readonly binding: (projectId: string) => TrackerBindingRow | undefined;
  /** Every project's binding: what the poller walks. */
  readonly bindings: () => TrackerBindingRow[];
  /** Whether a comment was carried already, by the issue's comment id. */
  readonly carried: (projectId: string, remoteId: string) => boolean;
  /** The task comments (their heading times, ms) a task carried either way. */
  readonly carriedAt: (projectId: string, taskId: string) => Set<number>;
  readonly carry: (row: typeof trackerComments.$inferSelect) => void;
  /** Lets a task's link go (its issue is gone, or the task is). */
  readonly dropLink: (projectId: string, taskId: string) => void;
  readonly link: (
    projectId: string,
    taskId: string
  ) => TrackerLinkRow | undefined;
  readonly linkByIssue: (
    projectId: string,
    issueKey: string
  ) => TrackerLinkRow | undefined;
  readonly linkedCount: (projectId: string) => number;
  readonly links: (projectId: string) => TrackerLinkRow[];
  readonly putLink: (row: TrackerLinkRow) => void;
  /** Back to CawCo's files alone: the binding, its links and carried comments go. */
  readonly unbind: (projectId: string) => void;
  readonly updateBinding: (
    projectId: string,
    patch: Partial<Omit<TrackerBindingRow, "projectId">>
  ) => void;
  readonly updateLink: (
    projectId: string,
    taskId: string,
    patch: Partial<Omit<TrackerLinkRow, "projectId" | "taskId">>
  ) => void;
}

export const trackersDb = (db: BunSQLiteDatabase): TrackersDb => {
  const forget = (
    tx: Pick<BunSQLiteDatabase, "delete">,
    projectId: string
  ): void => {
    tx.delete(trackerLinks).where(eq(trackerLinks.projectId, projectId)).run();
    tx.delete(trackerComments)
      .where(eq(trackerComments.projectId, projectId))
      .run();
  };
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
    carried: (projectId, remoteId) =>
      db
        .select({ at: trackerComments.at })
        .from(trackerComments)
        .where(
          and(
            eq(trackerComments.projectId, projectId),
            eq(trackerComments.remoteId, remoteId)
          )
        )
        .get() !== undefined,
    carriedAt: (projectId, taskId) =>
      new Set(
        db
          .select({ at: trackerComments.at })
          .from(trackerComments)
          .where(
            and(
              eq(trackerComments.projectId, projectId),
              eq(trackerComments.taskId, taskId)
            )
          )
          .all()
          .map((row) => row.at)
      ),
    carry: (row) => {
      db.insert(trackerComments).values(row).onConflictDoNothing().run();
    },
    link: (projectId, taskId) =>
      db
        .select()
        .from(trackerLinks)
        .where(
          and(
            eq(trackerLinks.projectId, projectId),
            eq(trackerLinks.taskId, taskId)
          )
        )
        .get(),
    linkByIssue: (projectId, issueKey) =>
      db
        .select()
        .from(trackerLinks)
        .where(
          and(
            eq(trackerLinks.projectId, projectId),
            eq(trackerLinks.issueKey, issueKey)
          )
        )
        .get(),
    links: (projectId) =>
      db
        .select()
        .from(trackerLinks)
        .where(eq(trackerLinks.projectId, projectId))
        .all(),
    linkedCount: (projectId) =>
      db
        .select({ n: count() })
        .from(trackerLinks)
        .where(eq(trackerLinks.projectId, projectId))
        .get()?.n ?? 0,
    putLink: (row) => {
      db.insert(trackerLinks)
        .values(row)
        .onConflictDoUpdate({
          target: [trackerLinks.projectId, trackerLinks.taskId],
          set: row,
        })
        .run();
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
      db.update(trackerLinks)
        .set(patch)
        .where(
          and(
            eq(trackerLinks.projectId, projectId),
            eq(trackerLinks.taskId, taskId)
          )
        )
        .run();
    },
  };
};
