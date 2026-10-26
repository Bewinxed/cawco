/**
 * `delegate_list` (Projects spec §5.2, "Visibility for agents"): a session's
 * own delegation tree, read once per call from what the hub already keeps —
 * the work items, their sessions' rows, the sends still unread, the plan, and
 * the same prompt-cache test `handoff`'s cold check makes. A project's lead
 * sees every attempt in its project beside its own delegates, as co-parent
 * (§5.3 lead authority).
 */
import type { InstanceRow, WorkItemState } from "@cawco/core";
import { HOUR_MS } from "@cawco/core/time";
import type { DbShape, WorkItemRow } from "./db";
import type { KeepAliveRow } from "./keep-alive";
import { sessionLabel } from "./labels";
import { roleOf } from "./roles";
import { type HeldWork, isHubParent, type QueuedDelegate } from "./work-items";

/** `live`: items not dismissed that are not ended or ended in the last hour; `all`: every one. */
export type DelegateListInclude = "live" | "all";

/**
 * One `delegate_list` read. With `since` or `before`, only what that window
 * holds: delegates whose lifetime touches it (started before `before`, and
 * ended after `since` or still live), workspaces held inside it, and queued
 * delegates queued before its end.
 */
export interface DelegateListQuery {
  before?: Date;
  include: DelegateListInclude;
  since?: Date;
}

/** How long an ended item stays in a `live` read. */
const ENDED_LIVE_MS = HOUR_MS;

export interface DelegateNode {
  cacheWarm: boolean;
  children: DelegateNode[];
  /** When its newest item ended; null while it is live. */
  endedAt: string | null;
  instanceId: string;
  /** While its landing waits (the Mac's build slot, its turn to land): "queued for the Mac's build slot behind …", since when. */
  landingWait?: { words: string; since: string };
  lastActivityAt: string;
  machine: string;
  /** The session's directory name, as `list_sessions` shows it. */
  name: string;
  /** While its machine is paused: "Omars-MacBook-Pro is paused until 00:57"; it runs no turn until then. */
  paused?: string;
  plan?: { done: number; total: number };
  /** Messages handed to it that it has not read yet. */
  queued: number;
  /** The first line of its last report, or of why it failed. */
  report?: string;
  /**
   * While its account's limit (or a refused sign-in) has stopped it: "Stopped
   * at A's limit; continues on B", or "…; continues at 15:40" with `until`
   * that moment. It runs no turn until then; what is sent to it meanwhile
   * waits at the hub and goes once it runs.
   */
  stalled?: { words: string; until?: string };
  /** When its session's first item started. */
  startedAt: string;
  /** `stalled` while {@link stalled} says so: never `running` at its limit. */
  state: WorkItemState | "stalled" | "waiting";
  title: string;
  waitingOn?: { reason: string; until?: string };
  workspaceId: string;
}

/** What one `delegate_list` read answers. */
export interface DelegateList {
  delegates: DelegateNode[];
  /** The held workspaces of the tree's delegates (work-items `heldWorkspaces`). */
  held: HeldWork[];
  /** The delegates the caller may withdraw, still queued for owned files (work-items `queuedOf`). */
  queued: QueuedDelegate[];
}

export interface DelegationTreeDeps {
  /** A session's last activity and whether its prompt cache is still warm (server.ts `followupState`). */
  activity: (row: KeepAliveRow) => {
    lastActivityAt: Date;
    cacheWarm: boolean;
  };
  db: Pick<
    DbShape,
    | "getInstancesByIds"
    | "project"
    | "projectAttempts"
    | "sendsIn"
    | "workItemsOfParents"
  >;
  /** Every held workspace on the fleet (work-items `heldWorkspaces`). */
  held: () => HeldWork[];
  /** While the item's landing waits (work-items `landingWaitOf`). */
  landingWait: (itemId: string) => { words: string; since: number } | null;
  /** A machine's name as the fleet shows it. */
  machineName: (machineId: string) => string;
  /** A paused machine's pause in words (machine-pause.ts); undefined when it is not paused. */
  machinePaused: (machineId: string) => string | undefined;
  /** The session's plan progress, when it has steps (plans.ts). */
  plan: (
    instanceId: string
  ) => Promise<{ done: number; total: number } | undefined>;
  /** The delegates `caller` may withdraw, still queued (work-items `queuedOf`). */
  queued: (caller: string) => QueuedDelegate[];
  /** The session stopped at its account's limit, in words (at-limit.ts `stall`); undefined while it runs. */
  stalled: (
    instanceId: string
  ) => { words: string; until?: number } | undefined;
}

const firstLine = (text: string | null): string | undefined =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

/** A session's items: a follow-up continues the same session in a newer one. */
interface Session {
  /** Its newest item, the one the node shows. */
  item: WorkItemRow;
  items: WorkItemRow[];
  startedAt: Date;
}

/** One entry per session, in the order they started. */
const sessionsOf = (items: WorkItemRow[]): Session[] => {
  const seen = new Map<string, Session>();
  for (const item of items) {
    const known = seen.get(item.instanceId);
    if (!known) {
      seen.set(item.instanceId, {
        item,
        items: [item],
        startedAt: item.createdAt,
      });
      continue;
    }
    known.items.push(item);
    if (item.createdAt > known.item.createdAt) {
      known.item = item;
    }
    if (item.createdAt < known.startedAt) {
      known.startedAt = item.createdAt;
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.startedAt.getTime() - b.startedAt.getTime()
  );
};

/** When the session's first item started, and when its newest ended (null while live). */
const spanOf = ({
  item,
  startedAt,
}: Session): Pick<DelegateNode, "startedAt" | "endedAt"> => ({
  startedAt: startedAt.toISOString(),
  endedAt: item.endedAt ? item.endedAt.toISOString() : null,
});

/** Whether any of the session's items was live inside the query's window; with no window, true. */
const touches = (session: Session, query: DelegateListQuery): boolean =>
  session.items.some(
    (item) =>
      (!query.before || item.createdAt < query.before) &&
      (!(query.since && item.endedAt) || item.endedAt > query.since)
  );

/** Whether a moment falls inside the query's window: at or after `since`, before `before`. */
const within = (at: Date, query: DelegateListQuery): boolean =>
  (!query.since || at >= query.since) && (!query.before || at < query.before);

/** In a `live` read: not dismissed (work-items `dismiss`), and not ended, or ended within the hour. */
const isLive = (item: WorkItemRow, now: number): boolean =>
  item.dismissedAt === null &&
  (!item.endedAt ||
    item.state === "starting" ||
    item.state === "running" ||
    now - item.endedAt.getTime() < ENDED_LIVE_MS);

/**
 * Every session of `caller`'s delegation tree, `caller` included: its
 * session row's `parentInstanceId` walked up to the top (a session with no
 * parent, or one a routine or a design check started, which reports to no
 * session), then every child under that top, one level at a time: by the
 * same work items `delegate_list` reads (their sessions alone), and by the
 * children's own `parentInstanceId`, so a child started with no work item (a
 * harness's subagent, OpenCode's `delegate`) is in the tree as it is from
 * its own side.
 */
export const treeSessions = (
  db: Pick<
    DbShape,
    "childIdsOfParents" | "getInstancesByIds" | "itemSessionsOfParents"
  >,
  caller: InstanceRow
): Set<string> => {
  let top = caller;
  const above = new Set<string>([caller.id]);
  while (top.parentInstanceId && !isHubParent(top.parentInstanceId)) {
    const [parent] = db.getInstancesByIds([top.parentInstanceId]);
    if (!parent || above.has(parent.id)) {
      break;
    }
    above.add(parent.id);
    top = parent;
  }
  const tree = new Set<string>([top.id, ...above]);
  let level = [top.id];
  while (level.length > 0) {
    const below = [
      ...db.itemSessionsOfParents(level),
      ...db.childIdsOfParents(level),
    ];
    level = [...new Set(below)].filter((id) => !tree.has(id));
    for (const id of level) {
      tree.add(id);
    }
  }
  return tree;
};

export const createDelegationTree = (deps: DelegationTreeDeps) => {
  const { db } = deps;

  /** The project `row` leads, if it is that project's Caw. */
  const ledProject = (row: InstanceRow): string | undefined =>
    roleOf(row) === "lead" &&
    row.projectId &&
    db.project(row.projectId)?.leadInstanceId === row.id
      ? row.projectId
      : undefined;

  /** A live item's machine pause, in words; nothing when it is not paused or the item is over. */
  const pausedOf = (
    item: WorkItemRow,
    row: KeepAliveRow | undefined
  ): Pick<DelegateNode, "paused"> => {
    const paused =
      row && (item.state === "starting" || item.state === "running")
        ? deps.machinePaused(row.machineId)
        : undefined;
    return paused ? { paused } : {};
  };

  /**
   * A live item whose session its account's limit stopped: `stalled` its
   * state, with the words; nothing when it runs or the item is over.
   */
  const stalledOf = (
    item: WorkItemRow
  ): Partial<Pick<DelegateNode, "state" | "stalled">> => {
    const stall =
      item.state === "starting" || item.state === "running"
        ? deps.stalled(item.instanceId)
        : undefined;
    if (!stall) {
      return {};
    }
    return {
      state: "stalled",
      stalled: {
        words: stall.words,
        ...(stall.until === undefined
          ? {}
          : { until: new Date(stall.until).toISOString() }),
      },
    };
  };

  const nodeOf = async (
    session: Session,
    row: KeepAliveRow | undefined,
    children: DelegateNode[]
  ): Promise<DelegateNode> => {
    const { item } = session;
    const waiting = item.waitUntil && item.waitReason;
    // A finished item's headline is its report at a glance; else its
    // report's first line, or why it failed.
    const report =
      item.headline ?? firstLine(item.result) ?? firstLine(item.error);
    const landingWait = deps.landingWait(item.id);
    const plan = await deps.plan(item.instanceId).catch(() => undefined);
    const activity = row
      ? deps.activity(row)
      : { lastActivityAt: item.endedAt ?? item.createdAt, cacheWarm: false };
    return {
      instanceId: item.instanceId,
      name: row ? sessionLabel(row).name : item.instanceId.slice(0, 8),
      title: item.title,
      state: waiting ? "waiting" : item.state,
      machine: row ? deps.machineName(row.machineId) : "",
      workspaceId: item.workspaceId,
      ...spanOf(session),
      lastActivityAt: activity.lastActivityAt.toISOString(),
      cacheWarm: activity.cacheWarm,
      queued: db.sendsIn(item.instanceId, ["pending"]).length,
      ...(waiting
        ? {
            waitingOn: {
              reason: item.waitReason as string,
              until: (item.waitUntil as Date).toISOString(),
            },
          }
        : {}),
      ...(landingWait
        ? {
            landingWait: {
              words: landingWait.words,
              since: new Date(landingWait.since).toISOString(),
            },
          }
        : {}),
      // Stopped at its limit is what it is, whatever wait it declared.
      ...stalledOf(item),
      ...pausedOf(item, row),
      ...(plan && plan.total > 0 ? { plan } : {}),
      ...(report ? { report } : {}),
      children,
    };
  };

  /**
   * The caller's delegation tree, in start order, with the held workspaces
   * of every delegate the walk reaches and the caller's queued delegates.
   * Children are read one level at a time; `seen` keeps a session from
   * appearing twice, however the parents run. A session the query leaves out
   * still stands while a child it keeps hangs under it, and its workspaces
   * still count toward `held`: held work is owed whatever the include.
   */
  const read = async (
    caller: InstanceRow,
    query: DelegateListQuery,
    now = Date.now()
  ): Promise<DelegateList> => {
    const seen = new Set<string>([caller.id]);
    const workspaces = new Set<string>();
    const kept = (session: Session): boolean =>
      (query.include === "all" || isLive(session.item, now)) &&
      touches(session, query);
    const build = async (items: WorkItemRow[]): Promise<DelegateNode[]> => {
      const level = sessionsOf(items).filter(
        (session) => !seen.has(session.item.instanceId)
      );
      for (const session of level) {
        seen.add(session.item.instanceId);
        for (const item of session.items) {
          workspaces.add(item.workspaceId);
        }
      }
      if (level.length === 0) {
        return [];
      }
      const ids = level.map((session) => session.item.instanceId);
      const rows = new Map(
        db.getInstancesByIds(ids).map((row) => [row.id, row])
      );
      const below = db.workItemsOfParents(ids);
      const nodes = await Promise.all(
        level.map(async (session) => {
          const id = session.item.instanceId;
          const children = await build(
            below.filter((child) => child.parentInstanceId === id)
          );
          if (children.length === 0 && !kept(session)) {
            return;
          }
          return nodeOf(session, rows.get(id), children);
        })
      );
      return nodes.filter((node): node is DelegateNode => !!node);
    };
    const delegates = await build(db.workItemsOfParents([caller.id]));
    const project = ledProject(caller);
    if (project) {
      // The lead's co-parented attempts: each one not already in its own
      // tree, at the root unless another attempt started it (it nests there).
      const attempts = db.projectAttempts(project);
      const attemptIds = new Set(attempts.map((item) => item.instanceId));
      delegates.push(
        ...(await build(
          attempts.filter((item) => !attemptIds.has(item.parentInstanceId))
        ))
      );
      delegates.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    }
    return {
      delegates,
      held: deps
        .held()
        .filter(
          (work) =>
            workspaces.has(work.workspaceId) &&
            within(new Date(work.heldAt), query)
        ),
      // Still queued, so live: inside the window once queued before its end.
      queued: deps
        .queued(caller.id)
        .filter(
          (one) => !query.before || new Date(one.queuedAt) < query.before
        ),
    };
  };

  return { read };
};

export type DelegationTree = ReturnType<typeof createDelegationTree>;
