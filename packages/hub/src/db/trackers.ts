import { isOneOf } from "@cawco/core/one-of";
import {
  type GithubProject,
  type GithubStatusesAdded,
  type GithubStatusStages,
  type IssueTracker,
  TRACKERS,
  type TrackerDirection,
  type TrackerSyncState,
} from "@cawco/core/trackers";
import { withoutUndefined } from "@cawco/core/without-undefined";
import { itemOfUrl } from "@cawco/providers/registry";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  type ItemRevision,
  type ItemRow,
  mirrorRefOf,
  writeItem,
  writeItemById,
} from "./external-items";
import {
  externalItems,
  projects,
  taskLinks,
  trackerLinkSyncedLabels,
  trackerLinks,
  watchCursors,
  watches,
} from "./schema";
import type { WatchCursor, WatchSettings } from "./stored-types";
import {
  GITHUB_HOST,
  SYNC_STREAMS,
  settingsWith,
  stopSyncing,
  unboundConnection,
  type WatchRow,
} from "./watches";

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

/**
 * A project's tracker (Projects spec D2, §5.2; tracker.ts) as tracker.ts
 * reads and writes it: the connection it signs in with, the repository or
 * team its tasks' issues are in, and where its poll stands. One per
 * project; none while the project keeps its tasks in CawCo's files alone.
 * Kept as the project's watch that syncs (schema `watches`, `sync` its
 * direction), its poll's marks the watch's `sync:` streams.
 */
export interface TrackerBindingRow {
  /** Issues opened after it become tasks; nothing older is copied. */
  boundAt: Date;
  /** The connection's name (connections.ts). */
  connection: string;
  cursor: TrackerCursor;
  /** Which way it syncs: `both`, or `inbound`, which writes nothing to the tracker (tracker.ts `outboundOf`). */
  direction: TrackerDirection;
  /**
   * When its direction last changed on a binding kept as it stood; null
   * while it is as bound. Turned to `both`, only tasks filed and comments
   * written since go to the tracker.
   */
  directionAt: Date | null;
  /** GitHub: the Project its stages show on through Status (tracker-github-project.ts); null when none. */
  githubProject: GithubProject | null;
  /** GitHub: why stages do not show on a Project, in GitHub's words; set, that part of the sync does not run. */
  githubProjectReason: string | null;
  /** GitHub: the Status options the hub last added to the Project, and when; null before it added any. */
  githubStatusesAdded: GithubStatusesAdded | null;
  /** GitHub: its words when it refused adding a stage's Status option; null when nothing did. */
  githubStatusesRefused: string | null;
  /** GitHub: the stages the hub has made sure of a Status option for on the Project; null before the first sync that did. */
  githubStatusStages: GithubStatusStages | null;
  polledAt: Date | null;
  projectId: string;
  provider: IssueTracker;
  /** Why it is refused, or why its last poll stopped short; null when all went through. */
  reason: string | null;
  /** The tracker's rate limit holds polls back until then. */
  resumeAt: Date | null;
  state: TrackerSyncState;
  /** GitHub: `owner/repo`; Linear: the team's id. */
  target: string;
  targetName: string;
  targetUrl: string;
}

/** A time kept in a watch's settings, ms, as a date. */
const dateOf = (ms: number | null | undefined): Date | null =>
  ms === null || ms === undefined ? null : new Date(ms);

/** A binding as its watch and the watch's two `sync:` streams hold it. */
const bindingOf = (
  watch: WatchRow,
  issues: WatchCursor | undefined,
  comments: WatchCursor | undefined
): TrackerBindingRow => {
  const { settings } = watch;
  const since = (watch.syncSince ?? watch.createdAt).getTime();
  return {
    projectId: watch.projectId,
    provider: watch.provider === "linear" ? "linear" : "github",
    connection: watch.connection,
    target: watch.container,
    targetName: watch.containerName,
    targetUrl: watch.containerUrl,
    boundAt: watch.syncSince ?? watch.createdAt,
    direction: watch.sync === "inbound" ? "inbound" : "both",
    directionAt: watch.syncDirectionAt,
    state: watch.state ?? "syncing",
    reason: settings.syncReason ?? null,
    polledAt: dateOf(settings.syncPolledAt),
    resumeAt: dateOf(settings.syncResumeAt),
    githubProject: settings.githubProject ?? null,
    githubProjectReason: settings.githubProjectReason ?? null,
    githubStatusStages: settings.githubStatusStages ?? null,
    githubStatusesRefused: settings.githubStatusesRefused ?? null,
    githubStatusesAdded: settings.githubStatusesAdded ?? null,
    cursor: {
      since: issues?.since ?? since,
      etag: issues?.etag ?? null,
      commentsSince: comments?.since ?? since,
      commentsEtag: comments?.etag ?? null,
    },
  };
};

/** What a binding's patch keeps in its watch's settings; a key it leaves out stays as it was. */
const settingsPatch = (patch: Partial<TrackerBindingRow>): WatchSettings => ({
  githubProject: patch.githubProject,
  githubProjectReason: patch.githubProjectReason,
  githubStatusStages: patch.githubStatusStages,
  githubStatusesRefused: patch.githubStatusesRefused,
  githubStatusesAdded: patch.githubStatusesAdded,
  syncReason: patch.reason,
  syncPolledAt:
    patch.polledAt === undefined
      ? undefined
      : (patch.polledAt?.getTime() ?? null),
  syncResumeAt:
    patch.resumeAt === undefined
      ? undefined
      : (patch.resumeAt?.getTime() ?? null),
});

/** A transaction or the database. */
type Writer = Pick<
  BunSQLiteDatabase,
  "delete" | "insert" | "select" | "update"
>;

/** Each `sync:` stream's cursor written whole: what migration 0431 kept as not read goes with it. */
const putCursor = (tx: Writer, watchId: string, cursor: TrackerCursor) => {
  const now = new Date();
  for (const [stream, value] of [
    [SYNC_STREAMS.issues, { etag: cursor.etag, since: cursor.since }],
    [
      SYNC_STREAMS.comments,
      { etag: cursor.commentsEtag, since: cursor.commentsSince },
    ],
  ] as const) {
    tx.insert(watchCursors)
      .values({ watchId, stream, cursor: value, updatedAt: now })
      .onConflictDoUpdate({
        target: [watchCursors.watchId, watchCursors.stream],
        set: {
          cursor: value,
          polls: sql`${watchCursors.polls} + 1`,
          updatedAt: now,
        },
      })
      .run();
  }
};

/** The project's watch that syncs, or none. */
const syncingOf = (tx: Writer, projectId: string): WatchRow | undefined =>
  tx
    .select()
    .from(watches)
    .where(and(eq(watches.projectId, projectId), ne(watches.sync, "off")))
    .get();

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

/** A task the sync links to its issue: its baseline, and the issue as its mirror holds it. */
export interface TrackerLinkRow extends Omit<TrackerAgreement, "synced"> {
  baseline: TrackerBaseline;
  /** The issue's key to its tracker: GitHub's number, Linear's id. */
  issueKey: string;
  /** Why the last read or sync of the issue stopped short. */
  problem: string | null;
  provider: IssueTracker;
  /** `#12`, `ENG-123`. */
  ref: string;
  /** When the hub last read the issue; null before it did. */
  syncedAt: Date | null;
  /** The task file's `issue:`, as written. */
  url: string;
}

/** The task's record link, by the URL its file writes, and what the issue holds now. */
export interface TrackerRecord {
  revision: ItemRevision;
  url: string;
}

/** What a sync changes of a link: what they agreed on, and what its issue holds (its mirror, db external-items.ts). */
export type TrackerLinkPatch = Partial<Pick<TrackerAgreement, "synced">> &
  ItemRevision;

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
  /** Links a task to its issue: what they agree on, its record link, and the issue's mirror as it holds now, in one transaction. */
  readonly putLink: (agreed: TrackerAgreement, record: TrackerRecord) => void;
  /** Back to CawCo's files alone: the binding and what its links agreed on go. */
  readonly unbind: (projectId: string) => void;
  readonly updateBinding: (
    projectId: string,
    patch: Partial<Omit<TrackerBindingRow, "projectId">>
  ) => void;
  /** Changes what a task and its issue agreed on, and what its issue's mirror holds. */
  readonly updateLink: (
    projectId: string,
    taskId: string,
    patch: TrackerLinkPatch
  ) => void;
}

/** The agreement, its labels, its record link's URL and its issue, as one row; none when the record is no tracker's issue. */
const joined = (
  agreed: TrackerLinkColumns,
  labels: string[],
  url: string,
  item: ItemRow
): TrackerLinkRow[] => {
  const { provider } = item;
  return isOneOf(TRACKERS, provider)
    ? [
        {
          projectId: agreed.projectId,
          taskId: agreed.taskId,
          linkedAt: agreed.linkedAt,
          unvouched: agreed.unvouched,
          baseline: baselineOf(agreed, labels),
          provider,
          issueKey: provider === "github" ? item.key : item.externalId,
          ref: item.ref,
          url,
          problem: item.problem,
          syncedAt: item.readAt,
        },
      ]
    : [];
};

/** A project's binding: its watch that syncs, with its `sync:` streams. */
const readBinding = (
  tx: Writer,
  projectId: string
): TrackerBindingRow | undefined => {
  const watch = syncingOf(tx, projectId);
  if (!watch) {
    return undefined;
  }
  const cursors = new Map(
    tx
      .select()
      .from(watchCursors)
      .where(
        and(
          eq(watchCursors.watchId, watch.id),
          inArray(watchCursors.stream, Object.values(SYNC_STREAMS))
        )
      )
      .all()
      .map((row) => [row.stream, row.cursor])
  );
  return bindingOf(
    watch,
    cursors.get(SYNC_STREAMS.issues),
    cursors.get(SYNC_STREAMS.comments)
  );
};

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
      .select({ agreed: trackerLinks, url: taskLinks.url, item: externalItems })
      .from(trackerLinks)
      .innerJoin(
        taskLinks,
        and(
          eq(taskLinks.projectId, trackerLinks.projectId),
          eq(taskLinks.taskId, trackerLinks.taskId),
          eq(taskLinks.mode, "record")
        )
      )
      .innerJoin(externalItems, eq(externalItems.id, taskLinks.itemId))
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
    return rows.flatMap((row) =>
      joined(row.agreed, labels.get(row.agreed.taskId) ?? [], row.url, row.item)
    );
  };
  return {
    binding: (projectId) => readBinding(db, projectId),
    bindings: () =>
      db
        .select({ projectId: watches.projectId })
        .from(watches)
        .where(ne(watches.sync, "off"))
        .all()
        .flatMap(({ projectId }) => readBinding(db, projectId) ?? []),
    bind: (row) => {
      db.transaction((tx) => {
        const was = syncingOf(tx, row.projectId);
        const host = row.provider === "github" ? GITHUB_HOST : "linear.app";
        const target = tx
          .select()
          .from(watches)
          .where(
            and(
              eq(watches.projectId, row.projectId),
              eq(watches.provider, row.provider),
              eq(watches.host, host),
              sql`lower(${watches.container}) = lower(${row.target})`
            )
          )
          .get();
        if (was && was.id !== target?.id) {
          forget(tx, row.projectId);
          stopSyncing(tx, was, unboundConnection(tx, was));
        }
        const columns = {
          container: row.target,
          containerName: row.targetName,
          containerUrl: row.targetUrl,
          connection: row.connection,
          sync: row.direction,
          syncSince: row.boundAt,
          syncDirectionAt: row.directionAt,
          state: row.state,
        };
        // A repository the poller follows keeps the connection it followed
        // it by, to read with again once the binding goes.
        const followed =
          target?.enabled &&
          target.sync === "off" &&
          target.connection !== row.connection
            ? { pollerConnection: target.connection }
            : {};
        const settings = settingsWith(target?.settings ?? {}, {
          ...settingsPatch(row),
          ...followed,
        });
        let watchId = target?.id;
        if (watchId) {
          tx.update(watches)
            .set({ ...columns, settings })
            .where(eq(watches.id, watchId))
            .run();
        } else {
          watchId = crypto.randomUUID();
          tx.insert(watches)
            .values({
              id: watchId,
              projectId: row.projectId,
              provider: row.provider,
              host,
              ...columns,
              settings,
              // The GitHub poller reads it once the project follows it.
              enabled: false,
              createdBy: "owner",
              createdAt: new Date(),
            })
            .run();
        }
        putCursor(tx, watchId, row.cursor);
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
        const named = itemOfUrl(record.url);
        if (!named) {
          return;
        }
        const { item } = writeItem(
          tx,
          agreed.projectId,
          mirrorRefOf(named),
          record.revision
        );
        tx.insert(taskLinks)
          .values({
            projectId: agreed.projectId,
            taskId: agreed.taskId,
            url: record.url,
            mode: "record",
            itemId: item.id,
          })
          .onConflictDoUpdate({
            target: [taskLinks.projectId, taskLinks.taskId, taskLinks.url],
            set: { mode: "record", itemId: item.id },
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
        const was = syncingOf(tx, projectId);
        if (was) {
          stopSyncing(tx, was, unboundConnection(tx, was));
        }
        forget(tx, projectId);
        tx.update(projects)
          .set({ tracker: "cawco" })
          .where(eq(projects.id, projectId))
          .run();
      });
    },
    updateBinding: (projectId, { cursor, ...patch }) => {
      db.transaction((tx) => {
        const watch = syncingOf(tx, projectId);
        if (!watch) {
          return;
        }
        tx.update(watches)
          .set({
            ...withoutUndefined({
              connection: patch.connection,
              container: patch.target,
              containerName: patch.targetName,
              containerUrl: patch.targetUrl,
              sync: patch.direction,
              syncSince: patch.boundAt,
              syncDirectionAt: patch.directionAt,
              state: patch.state,
            }),
            settings: settingsWith(watch.settings, settingsPatch(patch)),
          })
          .where(eq(watches.id, watch.id))
          .run();
        if (cursor) {
          putCursor(tx, watch.id, cursor);
        }
      });
    },
    updateLink: (projectId, taskId, patch) => {
      const { synced, ...held } = patch;
      db.transaction((tx) => {
        if (synced) {
          putBaseline(tx, projectId, taskId, synced);
        }
        const record = tx
          .select({ itemId: taskLinks.itemId })
          .from(taskLinks)
          .where(
            and(
              eq(taskLinks.projectId, projectId),
              eq(taskLinks.taskId, taskId),
              eq(taskLinks.mode, "record")
            )
          )
          .get();
        if (record && Object.keys(held).length > 0) {
          writeItemById(tx, record.itemId, held);
        }
      });
    },
  };
};
