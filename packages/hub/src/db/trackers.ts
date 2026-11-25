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
import type { ItemRow } from "./external-items";
import { itemFor } from "./intake";
import {
  externalItems,
  projects,
  taskLinks,
  trackerLinkSyncedLabels,
  trackerLinks,
  watches,
} from "./schema";
import type { GithubBoard, WatchSettings } from "./stored-types";
import {
  GITHUB_HOST,
  settingsWith,
  stopSyncing,
  unboundConnection,
  type WatchRow,
} from "./watches";

/**
 * A project's tracker (Projects spec D2, §5.2; sync.ts) as sync.ts reads
 * and writes it: the connection it signs in with, the repository or team
 * its tasks' issues are in, and where it stands. One per project; none
 * while the project keeps its tasks in CawCo's files alone. Kept as the
 * project's watch that syncs (schema `watches`, `sync` its direction),
 * which the one poll reads (clock.ts): the poll's reason, time and rate
 * limit are the watch's.
 */
export interface TrackerBindingRow {
  /** Issues opened after it become tasks; nothing older is copied. */
  boundAt: Date;
  /** The connection's name (connections.ts). */
  connection: string;
  /** Which way it syncs: `both`, or `inbound`, which writes nothing to the tracker (sync.ts `outboundOf`). */
  direction: TrackerDirection;
  /**
   * When its direction last changed on a binding kept as it stood; null
   * while it is as bound. Turned to `both`, only tasks filed and comments
   * written since go to the tracker.
   */
  directionAt: Date | null;
  /** GitHub: the Project's issues and their Status as its board stream last read them; null before it did. */
  githubBoard: GithubBoard | null;
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
  /** When the poll last read it. */
  polledAt: Date | null;
  /** Why the sync's last run stopped short (its own refusal, or a task's problem); null when it all went through. */
  problem: string | null;
  projectId: string;
  provider: IssueTracker;
  /** Why its poll stopped short; null when it went through. */
  reason: string | null;
  /** The service's rate limit holds its poll back until then. */
  resumeAt: Date | null;
  state: TrackerSyncState;
  /** GitHub: `owner/repo`; Linear: the team's id. */
  target: string;
  targetName: string;
  targetUrl: string;
  /** Its watch's id. */
  watchId: string;
}

/** A binding as its watch holds it. */
const bindingOf = (watch: WatchRow): TrackerBindingRow => {
  const { settings } = watch;
  return {
    watchId: watch.id,
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
    reason: watch.reason,
    problem: settings.syncProblem ?? null,
    polledAt: watch.polledAt,
    resumeAt: watch.resumeAt,
    githubBoard: settings.githubBoard ?? null,
    githubProject: settings.githubProject ?? null,
    githubProjectReason: settings.githubProjectReason ?? null,
    githubStatusStages: settings.githubStatusStages ?? null,
    githubStatusesRefused: settings.githubStatusesRefused ?? null,
    githubStatusesAdded: settings.githubStatusesAdded ?? null,
  };
};

/** What a binding's patch keeps in its watch's settings; a key it leaves out stays as it was. */
const settingsPatch = (patch: Partial<TrackerBindingRow>): WatchSettings => ({
  githubBoard: patch.githubBoard,
  githubProject: patch.githubProject,
  githubProjectReason: patch.githubProjectReason,
  githubStatusStages: patch.githubStatusStages,
  githubStatusesRefused: patch.githubStatusesRefused,
  githubStatusesAdded: patch.githubStatusesAdded,
  syncProblem: patch.problem,
});

/** A transaction or the database. */
type Writer = Pick<
  BunSQLiteDatabase,
  "delete" | "insert" | "select" | "update"
>;

/** The project's watch that syncs, or none. */
const syncingOf = (tx: Writer, projectId: string): WatchRow | undefined =>
  tx
    .select()
    .from(watches)
    .where(and(eq(watches.projectId, projectId), ne(watches.sync, "off")))
    .get();

/**
 * What a task and its issue last agreed on (sync.ts), the baseline of
 * their three-way merge: each field the tracker is the record of, and the
 * stage that agreed with the issue's state. A side whose value moved off it
 * changed that field.
 */
export interface TrackerSynced {
  description: string;
  /** A set, sorted as sync.ts `labelSet` sorts it. */
  labels: string[];
  /** The stage the task stood in when they agreed. */
  stage: string;
  /** The issue's state, as sync.ts names it (`open`, `closed:completed`, a Linear state's id). */
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

/** A task linked to its issue, as sync.ts writes it: what they agree on from now, when, and who opened the issue. */
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
  /** The issue's mirror row. */
  itemId: string;
  /** Why the sync's last round of the task and its issue stopped short (tracker_links `problem`); the issue's read problems stay on its mirror row. */
  problem: string | null;
  provider: IssueTracker;
  /** `#12`, `ENG-123`. */
  ref: string;
  /** When the hub last read the issue; null before it did. */
  syncedAt: Date | null;
  /** The task file's `issue:`, as written. */
  url: string;
}

/** What a sync changes of a link: what they agreed on, and why its last round stopped short (null: it went through). */
export type TrackerLinkPatch = Partial<
  Pick<TrackerAgreement, "synced"> & Pick<TrackerLinkRow, "problem">
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

/** The rows sync.ts keeps: a project's binding, and what its tasks and their issues agreed on. */
export interface TrackersDb {
  /**
   * Binds a project, its `projects.tracker` with it, in one transaction:
   * a binding to another target lets go of what the old one's links agreed
   * on; each task's record link follows its file (`issue:`).
   */
  readonly bind: (row: TrackerBindingRow) => void;
  /** A project's binding, or none while its tasks live in CawCo's files alone. */
  readonly binding: (projectId: string) => TrackerBindingRow | undefined;
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
  /** Why the sync's last round of a task and its issue stopped short; null when it went through, or it has no link. */
  readonly problem: (projectId: string, taskId: string) => string | null;
  /**
   * Links a task to its issue: what they agree on, and its record link to
   * the issue's mirror row (made, empty, through the door's store when the
   * door has not stored it yet), in one transaction. The issue's content
   * reaches the mirror through the door alone.
   */
  readonly putLink: (agreed: TrackerAgreement, url: string) => void;
  /** Back to CawCo's files alone: the binding and what its links agreed on go. */
  readonly unbind: (projectId: string) => void;
  readonly updateBinding: (
    projectId: string,
    patch: Partial<
      Omit<
        TrackerBindingRow,
        "polledAt" | "projectId" | "reason" | "resumeAt" | "watchId"
      >
    >
  ) => void;
  /** Changes what a task and its issue agreed on, and the problem of its last round. */
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
          itemId: item.id,
          ref: item.ref,
          url,
          problem: agreed.problem,
          syncedAt: item.readAt,
        },
      ]
    : [];
};

export const trackersDb = (db: BunSQLiteDatabase): TrackersDb => {
  const forget = (
    tx: Pick<BunSQLiteDatabase, "delete">,
    projectId: string
  ): void => {
    tx.delete(trackerLinks).where(eq(trackerLinks.projectId, projectId)).run();
  };
  const oneLink = (projectId: string, taskId: string) =>
    and(eq(trackerLinks.projectId, projectId), eq(trackerLinks.taskId, taskId));
  /** Writes a link's baseline whole, its labels' rows replaced: any hold goes. */
  const putBaseline = (
    tx: Pick<BunSQLiteDatabase, "delete" | "insert" | "update">,
    projectId: string,
    taskId: string,
    synced: TrackerSynced
  ): void => {
    tx.update(trackerLinks)
      .set(columnsOf(synced))
      .where(oneLink(projectId, taskId))
      .run();
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
    binding: (projectId) => {
      const watch = syncingOf(db, projectId);
      return watch && bindingOf(watch);
    },
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
          // The poll reads every watch that syncs.
          enabled: true,
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
        if (target) {
          tx.update(watches)
            .set({ ...columns, settings })
            .where(eq(watches.id, target.id))
            .run();
        } else {
          tx.insert(watches)
            .values({
              id: row.watchId,
              projectId: row.projectId,
              provider: row.provider,
              host,
              ...columns,
              settings,
              createdBy: "owner",
              createdAt: new Date(),
            })
            .run();
        }
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
    problem: (projectId, taskId) =>
      db
        .select({ problem: trackerLinks.problem })
        .from(trackerLinks)
        .where(oneLink(projectId, taskId))
        .get()?.problem ?? null,
    putLink: (agreed, url) => {
      const { synced, ...link } = agreed;
      db.transaction((tx) => {
        tx.insert(trackerLinks)
          .values({ ...link, problem: null })
          .onConflictDoUpdate({
            target: [trackerLinks.projectId, trackerLinks.taskId],
            set: { ...link, problem: null },
          })
          .run();
        putBaseline(tx, agreed.projectId, agreed.taskId, synced);
        const named = itemOfUrl(url);
        if (!named) {
          return;
        }
        const item = itemFor(tx, agreed.projectId, named);
        tx.insert(taskLinks)
          .values({
            projectId: agreed.projectId,
            taskId: agreed.taskId,
            url,
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
      db.delete(trackerLinks).where(oneLink(projectId, taskId)).run();
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
        .where(oneLink(projectId, taskId))
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
    updateBinding: (projectId, patch) => {
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
      });
    },
    updateLink: (projectId, taskId, { synced, problem }) => {
      db.transaction((tx) => {
        if (synced) {
          putBaseline(tx, projectId, taskId, synced);
        }
        if (problem !== undefined) {
          tx.update(trackerLinks)
            .set({ problem })
            .where(oneLink(projectId, taskId))
            .run();
        }
      });
    },
  };
};
