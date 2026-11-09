/**
 * `delegate_list` (Projects spec §5.2, "Visibility for agents"): a session's
 * own delegation tree, read once per call from what the hub already keeps —
 * the work items, their sessions' rows, the sends still unread, the plan, and
 * the same prompt-cache test `handoff`'s cold check makes. A project's conversation
 * sees every attempt in its project beside its own delegates, as co-parent
 * (§5.3 conversation authority).
 */

import type { FilingStage } from "@cawco/core/context-filing";
import type { InstanceRow } from "@cawco/core/protocol";
import { HOUR_MS } from "@cawco/core/time";
import type { TranscriptPage } from "@cawco/core/transcript-types";
import type { WorkItemState } from "@cawco/core/work-items";
import type { DbShape } from "./db";
import type { WorkItemRow } from "./db/project-work";
import { byHandle } from "./handles";
import type { KeepAliveRow } from "./keep-alive";
import { sessionLabel } from "./labels";
import { type Step, stepsEnough, stepsOf } from "./transcript-steps";
import { isHubParent } from "./work-item-state";
import type { QueuedDelegate } from "./work-items";
import type { HeldWork, Unlanded } from "./workspaces";

/** `live`: items not dismissed that are not ended or ended in the last hour; `all`: every one. */
type DelegateListInclude = "live" | "all";

/**
 * One `delegate_list` read. With `since` or `before`, only what that window
 * holds: delegates whose lifetime touches it (started before `before`, and
 * ended after `since` or still live), workspaces held inside it, and queued
 * delegates queued before its end. With `target`, that one delegate of the
 * caller's tree in full ({@link DelegatePeek}): its steps' `page`, of
 * {@link STEPS_PAGE}, when `steps` is `all`; its last {@link STEPS_RECENT}
 * when `recent`.
 */
export interface DelegateListQuery {
  before?: Date;
  include: DelegateListInclude;
  since?: Date;
  target?: { asked: string; page: number; steps: "recent" | "all" };
}

/** How many of its newest steps a concise look at one delegate names. */
const STEPS_RECENT = 8;
/** How many steps one page of a detailed look holds. */
const STEPS_PAGE = 50;
/** The fewest transcript pages read back for a look; past it the steps say they were cut. */
export const PAGES_READ_MOST = 40;

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
   * waits at the hub and goes once it runs. Held past the cutoff, its state
   * is `stale`: nothing carries it on until its parent or a person writes.
   */
  stalled?: { words: string; until?: string };
  /** When its session's first item started. */
  startedAt: string;
  /** While its start is held at the hub: "Omars-MacBook-Pro is installing an update"; it starts once that is over. */
  startHeld?: string;
  /**
   * `stalled` while {@link stalled} says so: never `running` at its limit;
   * `stale` once its hold is past the cutoff (at-limit.ts `goneStale`).
   */
  state: WorkItemState | "stalled" | "stale" | "waiting";
  title: string;
  waitingOn?: { reason: string; until?: string };
  workspaceId: string;
}

/** Its context window now, as its harness last reported the request it sent. */
export type PeekContext =
  | {
      /**
       * Its filing at its context threshold since its harness last compacted
       * it (compaction.ts `fileAtThreshold`): where it stands, and where its
       * harness compacts it. Absent when none came.
       */
      filing?: { compactsAt: number; stage: FilingStage };
      /** Tokens its last request sent. */
      tokens: number;
      /** Its model's window; null when the fleet does not know it, with why. */
      window: number | null;
      windowWhy?: string;
    }
  /** Its harness reported no figure yet. */
  | { tokens: null };

/** What its workspace holds so far, or why it could not be read. */
export type PeekMade =
  | (Omit<Unlanded, "live" | "workspaceId"> & {
      /** The artifacts it handed its parent (`to: "parent"`), by title. */
      handed: { id: string; title: string }[];
    })
  | { handed: { id: string; title: string }[]; unread: string };

/** `delegate_list` with a `target`: one delegate in full. */
export interface DelegatePeek {
  /** A turn is in flight, as its transcript's tail says. */
  busy: boolean;
  context: PeekContext;
  /** The same node the list shows, its children aside. */
  delegate: DelegateNode;
  /** Its latest assistant text, whole; the presenter cuts it. */
  lastWords?: { at?: string; text: string };
  made: PeekMade;
  steps:
    | {
        /** This page's steps, newest first. */
        list: Step[];
        /** Steps older than this page exist: the next page holds them. */
        more: boolean;
        page: number;
        /** The read stopped at {@link PAGES_READ_MOST} pages: older steps went unread. */
        cut: boolean;
      }
    | { unread: string };
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
  /**
   * The session's context as its harness last reported it (the row's
   * `contextTokens`), against its model's window (server.ts
   * `contextWindowOf`).
   */
  context: (row: KeepAliveRow) => Promise<PeekContext>;
  db: Pick<
    DbShape,
    | "artifacts"
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
  /**
   * The session's transcript pages, newest first, read back from its newest
   * until `enough` holds, the conversation's start, or `most` pages
   * (server.ts `pagesUntil`); or why it could not be read.
   */
  pages: (
    instanceId: string,
    enough: (pages: readonly TranscriptPage[]) => boolean,
    most: number
  ) => Promise<{ pages: TranscriptPage[] } | { fault: string }>;
  /** The session's plan progress, when it has steps (plans.ts). */
  plan: (
    instanceId: string
  ) => Promise<{ done: number; total: number } | undefined>;
  /** The delegates `caller` may withdraw, still queued (work-items `queuedOf`). */
  queued: (caller: string) => QueuedDelegate[];
  /** The session stopped at its account's limit, in words (at-limit.ts `stall`); undefined while it runs. */
  stalled: (
    instanceId: string
  ) => { stale?: true; words: string; until?: number } | undefined;
  /** Why the session's start is held at the hub (start-holds.ts `startHold`); undefined once it went. */
  startHeld: (instanceId: string) => string | undefined;
  /** What session's workspace holds on no remote (work-items `unlanded`); throws the machine's words. */
  unlanded: (instanceId: string) => Promise<Unlanded | undefined>;
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
  // The walk down keeps its own set: seeded with the sessions above, it
  // skipped each of them as it reached it, and everything under them, so
  // a session with a parent never had its own delegates in its tree
  // (2026-10-31: an orchestrator's page refused its delegate's preview).
  const walked = new Set<string>([top.id]);
  let level = [top.id];
  while (level.length > 0) {
    const below = [
      ...db.itemSessionsOfParents(level),
      ...db.childIdsOfParents(level),
    ];
    level = [...new Set(below)].filter((id) => !walked.has(id));
    for (const id of level) {
      walked.add(id);
    }
  }
  return new Set([...walked, ...above]);
};

export const createDelegationTree = (deps: DelegationTreeDeps) => {
  const { db } = deps;

  /** The project whose conversation `row` is, if it is one. */
  const ledProject = (row: InstanceRow): string | undefined =>
    row.projectId &&
    db.project(row.projectId)?.conversationInstanceId === row.id
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

  /** A starting item's start held at the hub, in words; nothing once it went. */
  const startHeldOf = (item: WorkItemRow): Pick<DelegateNode, "startHeld"> => {
    const startHeld =
      item.state === "starting" ? deps.startHeld(item.instanceId) : undefined;
    return startHeld ? { startHeld } : {};
  };

  /**
   * A live item whose session its account's limit stopped: `stalled` its
   * state (`stale` past the cutoff), with the words; nothing when it runs or
   * the item is over.
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
      state: stall.stale ? "stale" : "stalled",
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
      ...startHeldOf(item),
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
  const list = async (
    caller: InstanceRow,
    query: DelegateListQuery,
    now: number
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
      // The conversation's co-parented attempts: each one not already in its own
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

  /**
   * Every session under `caller`, one entry each: the work items the list
   * walks (and, for a project's conversation, its project's attempts), level
   * by level, each session once.
   */
  const descendants = (caller: InstanceRow): Session[] => {
    const seen = new Set<string>([caller.id]);
    const items: WorkItemRow[] = [];
    const project = ledProject(caller);
    let level = [
      ...db.workItemsOfParents([caller.id]),
      ...(project ? db.projectAttempts(project) : []),
    ];
    while (level.length > 0) {
      const fresh = level.filter((item) => !seen.has(item.instanceId));
      items.push(...fresh);
      const ids = [...new Set(fresh.map((item) => item.instanceId))];
      for (const id of ids) {
        seen.add(id);
      }
      level = ids.length > 0 ? db.workItemsOfParents(ids) : [];
    }
    return sessionsOf(items);
  };

  /** The artifacts `instanceId` made that stand in its parent's panel: handed up with `to: "parent"`. */
  const handedUp = (item: WorkItemRow): { id: string; title: string }[] =>
    db.artifacts
      .ofInstance(item.parentInstanceId)
      .filter((artifact) => artifact.madeBy === item.instanceId)
      .map((artifact) => ({ id: artifact.id, title: artifact.title }));

  /** What the session's workspace holds so far, or the machine's words on why it could not be read. */
  const madeOf = async (item: WorkItemRow): Promise<PeekMade> => {
    const handed = handedUp(item);
    try {
      const read = await deps.unlanded(item.instanceId);
      if (!read) {
        return { handed, unread: "it has no workspace of its own" };
      }
      const { live: _live, workspaceId: _workspace, ...made } = read;
      return { ...made, handed };
    } catch (error) {
      return {
        handed,
        unread: error instanceof Error ? error.message : String(error),
      };
    }
  };

  /** Its steps for the query's page, read back from its transcript as far as the page needs. */
  const stepsFor = async (
    instanceId: string,
    target: NonNullable<DelegateListQuery["target"]>
  ): Promise<{
    busy: boolean;
    lastWords?: DelegatePeek["lastWords"];
    steps: DelegatePeek["steps"];
  }> => {
    const [from, size] =
      target.steps === "all"
        ? [(target.page - 1) * STEPS_PAGE, STEPS_PAGE]
        : [0, STEPS_RECENT];
    const read = await deps.pages(
      instanceId,
      stepsEnough(from + size),
      PAGES_READ_MOST
    );
    if ("fault" in read) {
      return { busy: false, steps: { unread: read.fault } };
    }
    const said = stepsOf(read.pages);
    const reached = said.steps.length > from + size;
    return {
      busy: said.busy,
      ...(said.lastWords ? { lastWords: said.lastWords } : {}),
      steps: {
        list: said.steps.slice(from, from + size),
        more: reached || !said.whole,
        cut: !(said.whole || reached),
        page: target.page,
      },
    };
  };

  /** `delegate_list` with a `target`: the one delegate of `caller`'s tree it names, in full. */
  const peek = async (
    caller: InstanceRow,
    target: NonNullable<DelegateListQuery["target"]>
  ): Promise<DelegatePeek> => {
    const sessions = descendants(caller);
    const rows = new Map(
      db
        .getInstancesByIds(sessions.map((one) => one.item.instanceId))
        .map((each) => [each.id, each])
    );
    const session = byHandle(
      target.asked,
      sessions,
      {
        id: (one) => one.item.instanceId,
        names: (one) => {
          const row = rows.get(one.item.instanceId);
          const label = row ? sessionLabel(row) : undefined;
          return [one.item.title, label?.name, label?.tag, row?.cwd];
        },
        said: (one) => `${handleOf(one.item.instanceId)} “${one.item.title}”`,
      },
      "delegate of yours"
    );
    const row = rows.get(session.item.instanceId);
    const [delegate, context, made, steps] = await Promise.all([
      nodeOf(session, row, []),
      row ? deps.context(row) : Promise.resolve({ tokens: null }),
      madeOf(session.item),
      stepsFor(session.item.instanceId, target),
    ]);
    return { delegate, context, made, ...steps };
  };

  const read = (
    caller: InstanceRow,
    query: DelegateListQuery,
    now = Date.now()
  ): Promise<DelegateList | DelegatePeek> =>
    query.target ? peek(caller, query.target) : list(caller, query, now);

  return { read };
};

const handleOf = (id: string): string => id.slice(0, 8);
