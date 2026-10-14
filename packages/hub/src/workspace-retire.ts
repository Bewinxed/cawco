/**
 * Spent workspaces leave their machines on their own. A machine's disk
 * filled on 2026-10-14 (the Mac at 120 MB free, a Catalyst build dying in
 * the linker with `errno=28`) because nothing removed a workspace once its
 * work was over: 31 landed, clean clones of ~2 GB each and ~25 GB of their
 * Apple build roots stayed until the orchestrator deleted them by hand.
 *
 * The rule. A workspace is retired, its clone and everything of its own on
 * its machine deleted (agent workspace.ts `archiveWorkspace`), when all of
 * these hold:
 * - it is a delegate's workspace (a check workspace goes with its source);
 * - it has work items and none of them is live (starting, running, checks);
 * - none of its sessions is in a turn, and the last of its items' ends and
 *   its sessions' last turns and model requests was {@link RETIRE_IDLE_MS}
 *   ago or longer;
 * - its clone holds nothing that is nowhere else: no commit on HEAD or a
 *   local branch that no remote-tracking ref has, no `git status` entry
 *   (untracked files count; its items' handed-over outputs do not), no stash
 *   entry (core `CONTROL_WORKSPACE_LANDED`). Its machine reads this once
 *   before the sessions are ended and again, its boundary still up, right
 *   before it deletes anything; either read finding something keeps it.
 *
 * Why two hours idle. A finished delegate stays continuable: its parent can
 * hand off to it and its item reopens in the same session and workspace. The
 * fleet's rule is that a session is handed more work only while its prompt
 * cache is warm, its last turn under an hour ago (Anthropic's longest cache
 * TTL is one hour); past that the parent starts a fresh delegate. Two hours
 * is that hour and as long again for a parent that reads the report late.
 * Whatever is ended or idle longer is no longer a place work continues, and
 * a handoff to it is refused with words saying to delegate afresh.
 *
 * A workspace that holds unlanded work is never removed: it is kept and
 * listed (machine, workspace, what it holds, its clone's size), in
 * `delegate_list`'s `kept` and at `GET /api/workspaces/kept`, re-read every
 * sweep until it lands, is cleaned, or is archived by hand.
 */
import type { WorkspaceHolding } from "@cawco/core";
import {
  CONTROL_WORKSPACE_LANDED,
  holdingWords,
  holdsNothing,
} from "@cawco/core";
import type { DbShape, PublicInstanceRow, WorkspaceRow } from "./db";
import type { HubLifetimeShape } from "./lifetime";
import { isLive, type WorkItems } from "./work-items";

/** How long a workspace whose work is over stays continuable (see the module's words). */
export const RETIRE_IDLE_MS = 2 * 3_600_000;
/** How often the hub looks for spent workspaces on every online machine. */
const RETIRE_SWEEP_MS = 10 * 60_000;

/** A spent workspace kept for the unlanded work in it. */
export interface KeptWorkspace extends WorkspaceHolding {
  checkedAt: string;
  /** What it holds that is nowhere else, in words. */
  holds: string;
  /** The machine's name as the fleet shows it. */
  machine: string;
  machineId: string;
  path: string;
  workspaceId: string;
}

/** What one sweep did. */
export interface RetireSweep {
  /** Workspaces whose machine could not be asked, or whose archive failed, with why. */
  failed: { workspaceId: string; reason: string }[];
  kept: KeptWorkspace[];
  retired: { machine: string; path: string; workspaceId: string }[];
}

export interface WorkspaceRetireDeps {
  /** After a workspace is archived: its sessions' pending sends and asks, and the dashboards. */
  archived: (workspace: WorkspaceRow) => void;
  call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  db: Pick<DbShape, "activeWorkspacesOn" | "getInstancesByIds" | "workItemsIn">;
  /** Whether the session is in a turn now. */
  inTurn: (row: PublicInstanceRow) => boolean;
  lifetime: HubLifetimeShape;
  machineName: (machineId: string) => string;
  /** The machines connected now. */
  online: () => string[];
  workItems: Pick<WorkItems, "archive">;
}

const time = (at: Date | null | undefined): number => at?.getTime() ?? 0;

export const createWorkspaceRetire = (deps: WorkspaceRetireDeps) => {
  const { db } = deps;
  /** The last sweep's kept workspaces, by id; a machine's are read again each sweep it is online. */
  const kept = new Map<string, KeptWorkspace>();
  let running: Promise<RetireSweep> | undefined;

  /** Its items' outputs, which `git status` passes over, when the workspace is spent; else undefined. */
  const spent = (
    workspace: WorkspaceRow,
    now: number
  ): { skip: string[] } | undefined => {
    if (workspace.checksFor) {
      return;
    }
    const items = db.workItemsIn(workspace.id);
    if (items.length === 0 || items.some((item) => isLive(item.state))) {
      return;
    }
    const rows = db.getInstancesByIds([
      ...new Set(items.map((item) => item.instanceId)),
    ]);
    if (rows.some(deps.inTurn)) {
      return;
    }
    const last = Math.max(
      ...items.map((item) => time(item.endedAt) || now),
      ...rows.map((row) =>
        Math.max(time(row.turnEndedAt), time(row.lastRequestAt))
      )
    );
    if (now - last < RETIRE_IDLE_MS) {
      return;
    }
    return { skip: [...new Set(items.flatMap((item) => item.outputs ?? []))] };
  };

  /**
   * One spent workspace: kept and listed when its machine reads anything
   * unlanded in it, else archived (its machine reading it again first).
   */
  const retireOne = async (
    machineId: string,
    workspace: WorkspaceRow,
    guard: { skip: string[] },
    now: number,
    done: RetireSweep
  ): Promise<void> => {
    const machine = deps.machineName(machineId);
    try {
      const holding = (await deps.call(machineId, CONTROL_WORKSPACE_LANDED, [
        { id: workspace.id, path: workspace.path },
        guard.skip,
      ])) as WorkspaceHolding;
      if (!holdsNothing(holding)) {
        const entry: KeptWorkspace = {
          ...holding,
          workspaceId: workspace.id,
          machine,
          machineId,
          path: workspace.path,
          holds: holdingWords(holding),
          checkedAt: new Date(now).toISOString(),
        };
        if (kept.get(workspace.id)?.holds !== entry.holds) {
          console.log(
            `[workspace-retire] ${workspace.id} on ${machine}: kept, ${entry.holds} (${(entry.bytes / 1e9).toFixed(1)} GB at ${workspace.path})`
          );
        }
        kept.set(workspace.id, entry);
        return;
      }
      kept.delete(workspace.id);
      deps.archived(await deps.workItems.archive(workspace.id, guard));
      done.retired.push({
        workspaceId: workspace.id,
        machine,
        path: workspace.path,
      });
      console.log(
        `[workspace-retire] ${workspace.id} on ${machine}: retired, its work over and landed; ${workspace.path} and what it owned there are gone`
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      done.failed.push({ workspaceId: workspace.id, reason });
      console.warn(
        `[workspace-retire] ${workspace.id} on ${machine}: not retired: ${reason}`
      );
    }
  };

  const sweepOnce = async (now: number): Promise<RetireSweep> => {
    const done: RetireSweep = { kept: [], failed: [], retired: [] };
    for (const machineId of deps.online()) {
      const active = db.activeWorkspacesOn(machineId);
      // A kept one archived by hand, or no longer spent, leaves the list.
      for (const [id, entry] of kept) {
        if (
          entry.machineId === machineId &&
          !active.some(
            (workspace) => workspace.id === id && spent(workspace, now)
          )
        ) {
          kept.delete(id);
        }
      }
      for (const workspace of active) {
        const guard = spent(workspace, now);
        if (guard) {
          // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, so a sweep never loads a machine with many git reads at once
          await retireOne(machineId, workspace, guard, now, done);
        }
      }
    }
    done.kept = [...kept.values()];
    return done;
  };

  /** One sweep now; a sweep already running is that one's answer. */
  const sweep = (now = Date.now()): Promise<RetireSweep> => {
    running ??= sweepOnce(now).finally(() => {
      running = undefined;
    });
    return running;
  };

  deps.lifetime.every(RETIRE_SWEEP_MS, () => {
    sweep().catch((error: unknown) =>
      console.warn(
        `[workspace-retire] the sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  });

  return {
    sweep,
    /** The spent workspaces kept for unlanded work, as the last sweep read them. */
    kept: (): KeptWorkspace[] => [...kept.values()],
  };
};

export type WorkspaceRetire = ReturnType<typeof createWorkspaceRetire>;
