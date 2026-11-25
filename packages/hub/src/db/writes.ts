/**
 * The write ledger (schema `external_writes`, writes.ts): what CawCo wrote
 * to an outside service, and the one reading of it the door makes, whether
 * an event is CawCo's own ({@link originOf}).
 *
 * An event is `ours` when:
 * - it is a comment CawCo posted: its own id is a `comment` row's;
 * - it opened an item CawCo made for a task: an `issue` or `pr` row of the
 *   item with a task. An item CawCo made with no task behind it (usability
 *   feedback) opens as anyone's would: on a synced repository it becomes a
 *   task, and its opening follows the project's trigger settings;
 * - it is any other move of an item (a close, a reopen, a label, a merge)
 *   within {@link SAME_WRITE_MS} of a version a write of CawCo's left the
 *   item at: the close or label CawCo's own update made.
 */
import type {
  MirroredRef,
  ProviderId,
  SourceEvent,
} from "@cawco/providers/provider";
import { and, eq, isNotNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { externalWrites } from "./schema";
import type { InboundOrigin } from "./stored-types";

export type ExternalWriteRow = typeof externalWrites.$inferSelect;
export type ExternalWriteDraft = Omit<typeof externalWrites.$inferInsert, "id">;

/** How near an item's move is to a version CawCo's write left it at to be that write's: a service's timestamps of one change differ by less. Our choice. */
const SAME_WRITE_MS = 5000;

/** The events that are a comment written on their item. */
const COMMENT_KINDS: ReadonlySet<string> = new Set([
  "comment.created",
  "discussion_comment.created",
]);

type Reader = Pick<BunSQLiteDatabase, "select">;

/** An item as the ledger names it. */
type WrittenItem = Pick<MirroredRef, "host" | "container" | "key"> & {
  provider: ProviderId;
};

/** The ledger's rows of one item: what CawCo made, changed or commented on it. */
const rowsOf = (db: Reader, item: WrittenItem): ExternalWriteRow[] =>
  db
    .select()
    .from(externalWrites)
    .where(
      and(
        eq(externalWrites.provider, item.provider),
        eq(externalWrites.host, item.host),
        eq(externalWrites.container, item.container.toLowerCase()),
        eq(externalWrites.key, item.key)
      )
    )
    .all();

/** The row of a comment CawCo posted, by its service and own id. */
const postedComment = (
  db: Reader,
  provider: ProviderId,
  commentId: string
): ExternalWriteRow | undefined =>
  db
    .select()
    .from(externalWrites)
    .where(
      and(
        eq(externalWrites.provider, provider),
        eq(externalWrites.commentId, commentId)
      )
    )
    .get();

/** The row of the item CawCo made (an issue or a pull request), newest first; undefined when CawCo made none. */
const madeItem = (
  db: Reader,
  item: WrittenItem
): ExternalWriteRow | undefined =>
  rowsOf(db, item)
    .filter((row) => row.kind === "issue" || row.kind === "pr")
    .sort((a, b) => b.at.getTime() - a.at.getTime())[0];

/** What an event is read for: what it happened to, when, what kind it is, and a comment's own id. */
export type OriginOf = Pick<SourceEvent, "at" | "comment" | "kind"> & {
  item: Pick<MirroredRef, "container" | "host" | "key" | "provider"> | null;
};

/** Who caused `event`: CawCo's own write, as the ledger names it, or someone outside. */
export const originOf = (db: Reader, event: OriginOf): InboundOrigin => {
  const { item } = event;
  if (!item || item.provider === "connection") {
    return "outside";
  }
  const written: WrittenItem = { ...item, provider: item.provider };
  if (COMMENT_KINDS.has(event.kind)) {
    return event.comment &&
      postedComment(db, written.provider, event.comment.id)
      ? "ours"
      : "outside";
  }
  const rows = rowsOf(db, written);
  if (event.kind.endsWith(".opened")) {
    return rows.some(
      (row) => (row.kind === "issue" || row.kind === "pr") && row.taskId
    )
      ? "ours"
      : "outside";
  }
  return rows.some(
    (row) =>
      row.kind !== "comment" &&
      row.version !== null &&
      Math.abs(Number(row.version) - event.at) <= SAME_WRITE_MS
  )
    ? "ours"
    : "outside";
};

/** The ledger's rows the door reads and the sync writes. */
export interface WritesDb {
  /** The task entries the sync carried out as comments: each entry's heading time, ms. */
  readonly carried: (projectId: string, taskId: string) => number[];
  /** The row of a comment CawCo posted, by its service and own id. */
  readonly comment: (
    provider: ProviderId,
    commentId: string
  ) => ExternalWriteRow | undefined;
  /** The item CawCo made, newest first; undefined when it made none. */
  readonly made: (item: WrittenItem) => ExternalWriteRow | undefined;
  /** Who caused an event, as the ledger says now. */
  readonly origin: (event: OriginOf) => InboundOrigin;
  /** One write recorded; a comment recorded already (one write answered twice) stays as it was. */
  readonly record: (row: ExternalWriteDraft) => void;
}

export const writesDb = (db: BunSQLiteDatabase): WritesDb => ({
  carried: (projectId, taskId) =>
    db
      .select({ entryAt: externalWrites.entryAt })
      .from(externalWrites)
      .where(
        and(
          eq(externalWrites.projectId, projectId),
          eq(externalWrites.taskId, taskId),
          eq(externalWrites.kind, "comment"),
          isNotNull(externalWrites.entryAt)
        )
      )
      .all()
      .flatMap((row) => (row.entryAt === null ? [] : [row.entryAt])),
  comment: (provider, commentId) => postedComment(db, provider, commentId),
  made: (item) => madeItem(db, item),
  origin: (event) => originOf(db, event),
  record: (row) => {
    db.insert(externalWrites)
      .values({ ...row, id: crypto.randomUUID() })
      .onConflictDoNothing()
      .run();
  },
});
