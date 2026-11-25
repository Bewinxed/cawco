/**
 * Which outside items each task names, and every comment carried between a
 * task and a source (core external-items.ts): one row per task and URL,
 * each pointing at its item's mirror row (db external-items.ts, schema
 * `external_items`), the one record of what the source holds of it. The
 * tracker sync (tracker.ts) and the GitHub poller's reads and events
 * (links.ts) find a task here ({@link TaskLinksDb.byItem}).
 *
 * A task's rows follow its file: every time the file is indexed, its
 * `issue:` and `links:` URLs, and the pull requests and Actions runs its
 * `waits_on:` names, are the task's rows ({@link syncTaskLinks}), each new
 * one's item made from the URL alone (read from the source later), gone
 * ones taken out. So the file is the truth and the mirror is what the
 * source holds of each item. A plan step's wait on a pull request or run
 * is a row of its session's plan ({@link planLinkOwner}), kept with the
 * steps' rows the same way (db session-plans.ts `syncPlanLinks`), so the
 * item is read, and its wait settles, as a task's does.
 */
import type {
  ExternalComment,
  ExternalRef,
  ExternalState,
  LinkMode,
  TaskLinkSummary,
} from "@cawco/core/external-items";
import { isOneOf } from "@cawco/core/one-of";
import { waitTarget } from "@cawco/core/wait-targets";
import {
  LINK_KINDS,
  type LinkKind,
  PROVIDER_IDS,
  type ProviderId,
} from "@cawco/providers/provider";
import { itemOfUrl } from "@cawco/providers/registry";
import { and, asc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  type ItemPatch,
  type ItemRow,
  mirrorRefOf,
  writeItem,
  writeItemById,
} from "./external-items";
import {
  externalComments,
  externalItems,
  projectTasks,
  taskLinks,
} from "./schema";

type TaskLinkColumns = typeof taskLinks.$inferSelect;
export type ExternalCommentRow = typeof externalComments.$inferSelect;

/** A task's link with the item it names, as its mirror holds it. */
export interface LinkedItem {
  item: ItemRow;
  link: TaskLinkColumns;
}

/** A URL a task file names, and whether it is the file's `issue:`. */
export interface FileLink {
  record: boolean;
  url: string;
}

/** Whose rows a plan step's waits on pull requests and runs are: its session's plan, in the task's place. */
export const planLinkOwner = (instanceId: string): string =>
  `plan:${instanceId}`;

/** The pull requests and Actions runs of what a task or a plan's steps wait on, as the links their rows keep. */
export const waitLinks = (waits: readonly string[]): FileLink[] =>
  waits
    .filter((wait) => {
      const kind = waitTarget(wait)?.kind;
      return kind === "pr" || kind === "run";
    })
    .map((url) => ({ url, record: false }));

/** What an inbound thing names: an item by its number (GitHub), or by the source's own id (Linear). */
export type ItemKey =
  | {
      /** `owner/repo` on GitHub: a project may link items of more than one repository. */
      container?: string;
      kind?: LinkKind | "run";
      number: number;
      source: ProviderId;
    }
  | { externalId: string; source: ProviderId }
  /** Its mirror row (schema `external_items`), as the door names it. */
  | { itemId: string };

const DIGITS = /^\d+$/u;

/** An item a task links and the board draws (an issue, pull request or discussion), its source and kind narrowed. */
const linkOf = (
  item: ItemRow
): (ItemRow & { kind: LinkKind; provider: ProviderId }) | undefined =>
  isOneOf(LINK_KINDS, item.kind) && isOneOf(PROVIDER_IDS, item.provider)
    ? { ...item, kind: item.kind, provider: item.provider }
    : undefined;

/** A mirrored state as a link's: an Actions run's is none. */
const linkState = (state: ItemRow["state"]): ExternalState | null =>
  state === null || state === "running" || state === "green" || state === "red"
    ? null
    : state;

/** A row as the board draws it; undefined for a wait on an Actions run, which the board draws as a wait alone. */
export const refOf = ({ link, item }: LinkedItem): ExternalRef | undefined => {
  const shown = linkOf(item);
  return (
    shown && {
      source: shown.provider,
      kind: shown.kind,
      id: item.externalId,
      number: DIGITS.test(item.key) ? Number(item.key) : null,
      ref: item.ref,
      url: link.url,
      title: item.title,
      state: linkState(item.state),
      stateName: item.stateName,
      author: item.author,
      labels: item.labels,
      mode: link.mode,
      updatedAt:
        item.version !== null && DIGITS.test(item.version)
          ? Number(item.version)
          : null,
      syncedAt: item.readAt?.getTime() ?? null,
      problem: item.problem,
    }
  );
};

/** A row as a task's line on the board carries it; undefined for a wait on an Actions run. */
export const summaryOf = ({
  link,
  item,
}: LinkedItem): TaskLinkSummary | undefined => {
  const shown = linkOf(item);
  return (
    shown && {
      source: shown.provider,
      kind: shown.kind,
      ref: item.ref,
      state: linkState(item.state),
      url: link.url,
      mode: link.mode,
    }
  );
};

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

type Tx = Pick<BunSQLiteDatabase, "delete" | "insert" | "select" | "update">;

/**
 * The mode a task's link to `itemId` takes: `record` for its file's
 * `issue:` unless another task holds the item as its record, else the
 * mode it held, `related` for a new one or a record no longer named so.
 */
const modeOf = (
  tx: Pick<BunSQLiteDatabase, "select">,
  taskId: string,
  itemId: string,
  record: boolean,
  held: LinkMode | undefined
): LinkMode => {
  const holder =
    record &&
    tx
      .select({ taskId: taskLinks.taskId })
      .from(taskLinks)
      .where(and(eq(taskLinks.itemId, itemId), eq(taskLinks.mode, "record")))
      .get()?.taskId;
  if (record && (!holder || holder === taskId)) {
    return "record";
  }
  return held && held !== "record" ? held : "related";
};

/**
 * Makes a task's rows the URLs its file names: one made for each new URL,
 * its item's mirror row made from the URL alone (read from its source
 * later), the record's mode set on the file's `issue:` and taken off a URL
 * that is no longer it, and each URL the file no longer names taken out.
 * An item another task holds as its record stays this task's `related`
 * link. Runs inside the index's transaction (db `putTaskIndex`).
 */
export const syncTaskLinks = (
  tx: Tx,
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
  const named = new Map<string, boolean>();
  for (const { url, record } of wanted) {
    named.set(url, record || (named.get(url) ?? false));
  }
  const gone = [...held.keys()].filter((url) => !named.has(url));
  if (gone.length > 0) {
    tx.delete(taskLinks)
      .where(and(ofTask, inArray(taskLinks.url, gone)))
      .run();
  }
  for (const [url, record] of named) {
    const item = itemOfUrl(url);
    if (!item) {
      continue;
    }
    const row = held.get(url);
    const itemId =
      row?.itemId ?? writeItem(tx, projectId, mirrorRefOf(item)).item.id;
    const mode = modeOf(tx, taskId, itemId, record, row?.mode);
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
      .values({ projectId, taskId, url, mode, itemId })
      .onConflictDoNothing()
      .run();
  }
};

/** The rows tracker.ts and links.ts keep: links with their items, and comments carried. */
export interface TaskLinksDb {
  /**
   * THE matcher: the links naming an item, each task's record first and
   * then by task number. Nothing reads a text field. `held`: `board` (the
   * default) only tasks the board holds, so an archived or deleted task
   * takes nothing; `any` every row, a plan's included: what the tracker
   * sync asks before it files a task for an issue, and what a wait reads.
   */
  readonly byItem: (
    projectId: string,
    item: ItemKey,
    held?: "any" | "board"
  ) => LinkedItem[];
  /** One carried comment by the source's id; undefined while it was never carried. */
  readonly comment: (
    projectId: string,
    source: ProviderId,
    externalId: string
  ) => ExternalCommentRow | undefined;
  /** A task's carried comments, either way. */
  readonly comments: (
    projectId: string,
    taskId: string
  ) => ExternalCommentRow[];
  /** Every link of the project's tasks and plans, each task's record first: what the board's index and the poll's reads read. */
  readonly ofProject: (projectId: string) => LinkedItem[];
  /** A task's links, its record first. */
  readonly ofTask: (projectId: string, taskId: string) => LinkedItem[];
  /** Keeps a comment carried, once: a second of the same id writes nothing. */
  readonly putComment: (row: ExternalCommentRow) => void;
  /** Links a task to the item its URL names, its mirror written with `revision`: a task file's link as the source holds it. */
  readonly putRef: (
    link: Omit<TaskLinkColumns, "itemId">,
    revision: ItemPatch
  ) => void;
  /** A task's record link; undefined while it has none. */
  readonly record: (
    projectId: string,
    taskId: string
  ) => LinkedItem | undefined;
  /** THE writer over an item a link names (db external-items.ts `writeItemById`); answers whether its state or title moved. */
  readonly revise: (itemId: string, revision: ItemPatch) => boolean;
  readonly updateComment: (
    projectId: string,
    source: ProviderId,
    externalId: string,
    patch: Partial<Pick<ExternalCommentRow, "author" | "editedAt" | "url">>
  ) => void;
}

/** What `item` names among the mirror's rows. */
const itemNamed = (item: ItemKey): SQL | undefined => {
  if ("itemId" in item) {
    return eq(externalItems.id, item.itemId);
  }
  return "externalId" in item
    ? and(
        eq(externalItems.provider, item.source),
        eq(externalItems.externalId, item.externalId)
      )
    : and(
        eq(externalItems.provider, item.source),
        eq(externalItems.key, String(item.number)),
        item.kind
          ? eq(externalItems.kind, item.kind)
          : inArray(externalItems.kind, LINK_KINDS),
        item.container
          ? eq(externalItems.container, item.container.toLowerCase())
          : undefined
      );
};

export const taskLinksDb = (db: BunSQLiteDatabase): TaskLinksDb => {
  const linked = () =>
    db
      .select({ link: taskLinks, item: externalItems })
      .from(taskLinks)
      .innerJoin(externalItems, eq(externalItems.id, taskLinks.itemId));
  return {
    byItem: (projectId, item, held = "board") => {
      const where = and(eq(taskLinks.projectId, projectId), itemNamed(item));
      return held === "any"
        ? linked()
            .where(where)
            .orderBy(recordFirst, sql`${taskLinks}.rowid`)
            .all()
        : linked()
            .innerJoin(
              projectTasks,
              and(
                eq(projectTasks.projectId, taskLinks.projectId),
                eq(projectTasks.id, taskLinks.taskId)
              )
            )
            .where(where)
            .orderBy(recordFirst, asc(projectTasks.number))
            .all();
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
      linked()
        .where(
          and(eq(taskLinks.projectId, projectId), eq(taskLinks.taskId, taskId))
        )
        .orderBy(recordFirst, sql`${taskLinks}.rowid`)
        .all(),
    ofProject: (projectId) =>
      linked()
        .where(eq(taskLinks.projectId, projectId))
        .orderBy(recordFirst, sql`${taskLinks}.rowid`)
        .all(),
    putComment: (row) => {
      db.insert(externalComments).values(row).onConflictDoNothing().run();
    },
    putRef: (link, revision) => {
      const named = itemOfUrl(link.url);
      if (!named) {
        return;
      }
      db.transaction((tx) => {
        const { item } = writeItem(
          tx,
          link.projectId,
          mirrorRefOf(named),
          revision
        );
        tx.insert(taskLinks)
          .values({ ...link, itemId: item.id })
          .onConflictDoUpdate({
            target: [taskLinks.projectId, taskLinks.taskId, taskLinks.url],
            set: { mode: link.mode, itemId: item.id },
          })
          .run();
      });
    },
    revise: (itemId, revision) =>
      db.transaction(
        (tx) => writeItemById(tx, itemId, revision)?.moved ?? false
      ),
    record: (projectId, taskId) =>
      linked()
        .where(
          and(
            eq(taskLinks.projectId, projectId),
            eq(taskLinks.taskId, taskId),
            eq(taskLinks.mode, "record")
          )
        )
        .get(),
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
  };
};
