/**
 * The hub's mirror of every external item a task links, and every comment
 * carried between a task and a source (core external-items.ts): the one
 * store the tracker sync (tracker.ts) and the GitHub poller's events
 * (external-items.ts) both write, and the one lookup either finds a task by
 * ({@link TaskLinksDb.byItem}).
 *
 * A task's rows follow its file: every time the file is indexed, its
 * `issue:` and `links:` URLs are the task's rows ({@link syncTaskLinks}),
 * new ones made from the URL alone and read from the source later, gone
 * ones taken out. So the file is the truth and this is what the source
 * holds of each URL.
 */
import {
  type ExternalComment,
  type ExternalKind,
  type ExternalRef,
  type ExternalSource,
  type LinkMode,
  refOfUrl,
  type TaskLinkSummary,
} from "@cawco/core";
import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { externalComments, projectTasks, taskLinks } from "./schema";

export type TaskLinkRow = typeof taskLinks.$inferSelect;
export type ExternalCommentRow = typeof externalComments.$inferSelect;

/** A URL a task file names, and whether it is the file's `issue:`. */
export interface FileLink {
  record: boolean;
  url: string;
}

/** What an inbound thing names: an item by its number (GitHub), or by the source's own id (Linear). */
export type ItemKey =
  | {
      /** `owner/repo` on GitHub: a project may link items of more than one repository. */
      container?: string;
      kind?: ExternalKind;
      number: number;
      source: ExternalSource;
    }
  | { externalId: string; source: ExternalSource };

/** A row as the board draws it: the record first, then the file's order. */
export const refOf = (row: TaskLinkRow): ExternalRef => ({
  source: row.source,
  kind: row.kind,
  id: row.externalId,
  number: row.number,
  ref: row.ref,
  url: row.url,
  title: row.title,
  state: row.state,
  stateName: row.stateName,
  author: row.author,
  labels: row.labels,
  mode: row.mode,
  updatedAt: row.remoteUpdatedAt,
  syncedAt: row.syncedAt?.getTime() ?? null,
  problem: row.problem,
});

/** A row as a task's line on the board carries it. */
export const summaryOf = (row: TaskLinkRow): TaskLinkSummary => ({
  source: row.source,
  kind: row.kind,
  ref: row.ref,
  state: row.state,
  url: row.url,
  mode: row.mode,
});

/** A comment row as a task's entry carries it. */
export const viaOf = (row: ExternalCommentRow): ExternalComment => ({
  source: row.source,
  externalId: row.externalId,
  url: row.url,
  author: row.author,
  at: row.at,
  editedAt: row.editedAt,
  direction: row.direction,
});

/** The record first, then the order the rows were made in. */
const recordFirst = sql`CASE WHEN ${taskLinks.mode} = 'record' THEN 0 ELSE 1 END`;

/**
 * Makes a task's rows the URLs its file names: one made for each new URL
 * from the URL alone (read from its source later), the record's mode set
 * on the file's `issue:` and taken off a URL that is no longer it, and
 * each URL the file no longer names taken out. A URL another task holds as
 * its record stays this task's `related` link. Runs inside the index's
 * transaction (db `putTaskIndex`).
 */
export const syncTaskLinks = (
  tx: Pick<BunSQLiteDatabase, "delete" | "insert" | "select" | "update">,
  projectId: string,
  taskId: string,
  wanted: FileLink[]
): void => {
  const ofTask = and(
    eq(taskLinks.projectId, projectId),
    eq(taskLinks.taskId, taskId)
  );
  const held = new Map(
    tx
      .select()
      .from(taskLinks)
      .where(ofTask)
      .all()
      .map((row) => [row.url, row])
  );
  const named = new Set(wanted.map((link) => link.url));
  const gone = [...held.keys()].filter((url) => !named.has(url));
  if (gone.length > 0) {
    tx.delete(taskLinks)
      .where(and(ofTask, inArray(taskLinks.url, gone)))
      .run();
  }
  for (const { url, record } of wanted) {
    const item = refOfUrl(url);
    if (!item) {
      continue;
    }
    const row = held.get(url);
    const taken =
      record &&
      tx
        .select({ taskId: taskLinks.taskId })
        .from(taskLinks)
        .where(
          and(
            eq(taskLinks.projectId, projectId),
            eq(taskLinks.url, url),
            eq(taskLinks.mode, "record")
          )
        )
        .get();
    const recordHere = record && (!taken || taken.taskId === taskId);
    let mode: LinkMode;
    if (recordHere) {
      mode = "record";
    } else {
      mode = row && row.mode !== "record" ? row.mode : "related";
    }
    if (row) {
      if (row.mode !== mode) {
        tx.update(taskLinks)
          .set({ mode })
          .where(and(ofTask, eq(taskLinks.url, url)))
          .run();
      }
      continue;
    }
    tx.insert(taskLinks)
      .values({
        projectId,
        taskId,
        url,
        source: item.source,
        kind: item.kind,
        number: item.number,
        ref: item.ref,
        mode,
      })
      .onConflictDoNothing()
      .run();
  }
};

/** The rows tracker.ts and external-items.ts keep: links, and comments carried. */
export interface TaskLinksDb {
  /**
   * THE matcher: the rows naming an item, each task's record first and then
   * by task number. Nothing reads a text field. `held`: `board` (the
   * default) only tasks the board holds, so an archived or deleted task
   * takes nothing; `any` every row, what the tracker sync asks before it
   * files a task for an issue.
   */
  readonly byItem: (
    projectId: string,
    item: ItemKey,
    held?: "any" | "board"
  ) => TaskLinkRow[];
  /** One carried comment by the source's id; undefined while it was never carried. */
  readonly comment: (
    projectId: string,
    source: ExternalSource,
    externalId: string
  ) => ExternalCommentRow | undefined;
  /** A task's carried comments, either way. */
  readonly comments: (
    projectId: string,
    taskId: string
  ) => ExternalCommentRow[];
  /** Every link of the project's tasks, each task's record first: what the board's index reads. */
  readonly ofProject: (projectId: string) => TaskLinkRow[];
  /** A task's links, its record first. */
  readonly ofTask: (projectId: string, taskId: string) => TaskLinkRow[];
  /** Keeps a comment carried, once: a second of the same id writes nothing. */
  readonly putComment: (row: ExternalCommentRow) => void;
  /** Writes a link whole, as the source holds it now: the tracker sync's record, a read of a URL. */
  readonly putRef: (row: TaskLinkRow) => void;
  /** A task's record link; undefined while it has none. */
  readonly record: (
    projectId: string,
    taskId: string
  ) => TaskLinkRow | undefined;
  /** The links of a source the hub has not read yet, or whose last read stopped short. */
  readonly unread: (projectId: string, source: ExternalSource) => TaskLinkRow[];
  readonly updateComment: (
    projectId: string,
    source: ExternalSource,
    externalId: string,
    patch: Partial<Pick<ExternalCommentRow, "author" | "editedAt" | "url">>
  ) => void;
  /** Changes what one link holds of its source. */
  readonly updateRef: (
    projectId: string,
    taskId: string,
    url: string,
    patch: Partial<Omit<TaskLinkRow, "mode" | "projectId" | "taskId" | "url">>
  ) => void;
}

export const taskLinksDb = (db: BunSQLiteDatabase): TaskLinksDb => {
  const one = (projectId: string, taskId: string, url: string) =>
    and(
      eq(taskLinks.projectId, projectId),
      eq(taskLinks.taskId, taskId),
      eq(taskLinks.url, url)
    );
  return {
    byItem: (projectId, item, held = "board") => {
      const named =
        "externalId" in item
          ? eq(taskLinks.externalId, item.externalId)
          : and(
              eq(taskLinks.number, item.number),
              item.kind ? eq(taskLinks.kind, item.kind) : undefined
            );
      const where = and(
        eq(taskLinks.projectId, projectId),
        eq(taskLinks.source, item.source),
        named
      );
      const rows =
        held === "any"
          ? db.select().from(taskLinks).where(where).orderBy(recordFirst).all()
          : db
              .select({ link: taskLinks })
              .from(taskLinks)
              .innerJoin(
                projectTasks,
                and(
                  eq(projectTasks.projectId, taskLinks.projectId),
                  eq(projectTasks.id, taskLinks.taskId)
                )
              )
              .where(where)
              .orderBy(recordFirst, asc(projectTasks.number))
              .all()
              .map((row) => row.link);
      const container = "container" in item ? item.container : undefined;
      return container
        ? rows.filter(
            (row) => refOfUrl(row.url)?.container === container.toLowerCase()
          )
        : rows;
    },
    comment: (projectId, source, externalId) =>
      db
        .select()
        .from(externalComments)
        .where(
          and(
            eq(externalComments.projectId, projectId),
            eq(externalComments.source, source),
            eq(externalComments.externalId, externalId)
          )
        )
        .get(),
    comments: (projectId, taskId) =>
      db
        .select()
        .from(externalComments)
        .where(
          and(
            eq(externalComments.projectId, projectId),
            eq(externalComments.taskId, taskId)
          )
        )
        .all(),
    ofTask: (projectId, taskId) =>
      db
        .select()
        .from(taskLinks)
        .where(
          and(eq(taskLinks.projectId, projectId), eq(taskLinks.taskId, taskId))
        )
        .orderBy(recordFirst, sql`rowid`)
        .all(),
    ofProject: (projectId) =>
      db
        .select()
        .from(taskLinks)
        .where(eq(taskLinks.projectId, projectId))
        .orderBy(recordFirst, sql`rowid`)
        .all(),
    putComment: (row) => {
      db.insert(externalComments).values(row).onConflictDoNothing().run();
    },
    putRef: (row) => {
      const { projectId, taskId, url, ...set } = row;
      db.insert(taskLinks)
        .values(row)
        .onConflictDoUpdate({
          target: [taskLinks.projectId, taskLinks.taskId, taskLinks.url],
          set,
        })
        .run();
    },
    record: (projectId, taskId) =>
      db
        .select()
        .from(taskLinks)
        .where(
          and(
            eq(taskLinks.projectId, projectId),
            eq(taskLinks.taskId, taskId),
            eq(taskLinks.mode, "record")
          )
        )
        .get(),
    unread: (projectId, source) =>
      db
        .select()
        .from(taskLinks)
        .where(
          and(
            eq(taskLinks.projectId, projectId),
            eq(taskLinks.source, source),
            or(isNull(taskLinks.syncedAt), isNotNull(taskLinks.problem))
          )
        )
        .all(),
    updateComment: (projectId, source, externalId, patch) => {
      db.update(externalComments)
        .set(patch)
        .where(
          and(
            eq(externalComments.projectId, projectId),
            eq(externalComments.source, source),
            eq(externalComments.externalId, externalId)
          )
        )
        .run();
    },
    updateRef: (projectId, taskId, url, patch) => {
      db.update(taskLinks)
        .set(patch)
        .where(one(projectId, taskId, url))
        .run();
    },
  };
};
