/**
 * `delegate_list` (Projects spec §5.2, "Visibility for agents"): a session's
 * own delegation tree, read once per call from what the hub already keeps —
 * the work items, their sessions' rows, the sends still unread, the plan, and
 * the same prompt-cache test `handoff`'s cold check makes. A project's lead
 * sees every attempt in its project beside its own delegates, as co-parent
 * (§5.3 lead authority).
 */
import type { InstanceRow } from "@cawco/core";
import type { DbShape, WorkItemRow } from "./db";
import type { KeepAliveRow } from "./keep-alive";
import { roleOf } from "./roles";

/** `live`: items not ended, and ended in the last hour; `all`: every one. */
export type DelegateListInclude = "live" | "all";

/** How long an ended item stays in a `live` read. */
const ENDED_LIVE_MS = 3_600_000;

export interface DelegateNode {
  cacheWarm: boolean;
  children: DelegateNode[];
  instanceId: string;
  lastActivityAt: string;
  machine: string;
  /** The session's directory name, as `list_sessions` shows it. */
  name: string;
  plan?: { done: number; total: number };
  /** Messages handed to it that it has not read yet. */
  queued: number;
  /** The first line of its last report, or of why it failed. */
  report?: string;
  state: "starting" | "running" | "waiting" | "done" | "failed" | "cancelled";
  title: string;
  waitingOn?: { reason: string; until?: string };
  workspaceId: string;
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
  /** A machine's name as the fleet shows it. */
  machineName: (machineId: string) => string;
  /** The session's plan progress, when it has steps (plans.ts). */
  plan: (
    instanceId: string
  ) => Promise<{ done: number; total: number } | undefined>;
}

const leafOf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

const firstLine = (text: string | null): string | undefined =>
  (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

/** One item per session: the newest, since a follow-up continues the same session. */
const newestPerSession = (items: WorkItemRow[]): WorkItemRow[] => {
  const seen = new Map<string, WorkItemRow>();
  for (const item of items) {
    const known = seen.get(item.instanceId);
    if (!known || item.createdAt > known.createdAt) {
      seen.set(item.instanceId, item);
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
};

const isLive = (item: WorkItemRow, now: number): boolean =>
  !item.endedAt ||
  item.state === "starting" ||
  item.state === "running" ||
  now - item.endedAt.getTime() < ENDED_LIVE_MS;

export const createDelegationTree = (deps: DelegationTreeDeps) => {
  const { db } = deps;

  /** The project `row` leads, if it is that project's Caw. */
  const ledProject = (row: InstanceRow): string | undefined =>
    roleOf(row) === "lead" &&
    row.projectId &&
    db.project(row.projectId)?.leadInstanceId === row.id
      ? row.projectId
      : undefined;

  const nodeOf = async (
    item: WorkItemRow,
    row: KeepAliveRow | undefined,
    children: DelegateNode[]
  ): Promise<DelegateNode> => {
    const waiting = item.waitUntil && item.waitReason;
    const report = firstLine(item.result) ?? firstLine(item.error);
    const plan = await deps.plan(item.instanceId).catch(() => undefined);
    const activity = row
      ? deps.activity(row)
      : { lastActivityAt: item.endedAt ?? item.createdAt, cacheWarm: false };
    return {
      instanceId: item.instanceId,
      name: row ? leafOf(row.cwd) : item.instanceId.slice(0, 8),
      title: item.title,
      state: waiting ? "waiting" : item.state,
      machine: row ? deps.machineName(row.machineId) : "",
      workspaceId: item.workspaceId,
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
      ...(plan && plan.total > 0 ? { plan } : {}),
      ...(report ? { report } : {}),
      children,
    };
  };

  /**
   * The caller's delegation tree. Children are read one level at a time;
   * `seen` keeps a session from appearing twice, however the parents run.
   */
  const read = async (
    caller: InstanceRow,
    include: DelegateListInclude = "live",
    now = Date.now()
  ): Promise<DelegateNode[]> => {
    const seen = new Set<string>([caller.id]);
    const build = async (items: WorkItemRow[]): Promise<DelegateNode[]> => {
      const level = newestPerSession(items).filter(
        (item) => !seen.has(item.instanceId)
      );
      for (const item of level) {
        seen.add(item.instanceId);
      }
      if (level.length === 0) {
        return [];
      }
      const ids = level.map((item) => item.instanceId);
      const rows = new Map(
        db.getInstancesByIds(ids).map((row) => [row.id, row])
      );
      const below = db.workItemsOfParents(ids);
      const nodes = await Promise.all(
        level.map(async (item) => {
          const children = await build(
            below.filter((child) => child.parentInstanceId === item.instanceId)
          );
          if (
            include === "live" &&
            children.length === 0 &&
            !isLive(item, now)
          ) {
            return;
          }
          return nodeOf(item, rows.get(item.instanceId), children);
        })
      );
      return nodes.filter((node): node is DelegateNode => !!node);
    };
    const mine = await build(db.workItemsOfParents([caller.id]));
    const project = ledProject(caller);
    if (!project) {
      return mine;
    }
    // The lead's co-parented attempts: each one not already in its own tree,
    // at the root unless another attempt started it (it nests there).
    const attempts = db.projectAttempts(project);
    const attemptIds = new Set(attempts.map((item) => item.instanceId));
    const rest = await build(
      attempts.filter((item) => !attemptIds.has(item.parentInstanceId))
    );
    return [...mine, ...rest];
  };

  return { read };
};

export type DelegationTree = ReturnType<typeof createDelegationTree>;
