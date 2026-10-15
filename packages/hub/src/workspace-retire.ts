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
 * - no artifact of any session shows what it serves: a port preview naming
 *   it, or a folder preview inside its clone (db artifacts.ts `previewing`;
 *   every panel's shown preview is such a row). On 2026-10-15 a workspace
 *   whose commits had been pushed to a branch of their own counted as
 *   landed and was retired while it served the owner's two open previews,
 *   and the preview harness it kept in git-ignored files went with it. A
 *   previewed workspace is retired by the first sweep after its last such
 *   artifact goes (its session deleted), or archived by hand;
 * - its clone holds nothing that is nowhere else: no commit on HEAD or a
 *   local branch that no remote-tracking ref has, no `git status` entry
 *   (untracked files count; its items' handed-over outputs do not), no stash
 *   entry, no more than core `IGNORED_CARRY_LIMIT` of files git ignores that
 *   its work wrote (core `CONTROL_WORKSPACE_LANDED`; those are saved to a
 *   carry as it goes). Its machine reads this once before the sessions are
 *   ended and again, its boundary still up, right before it deletes
 *   anything; either read finding something keeps it.
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
import type { DbShape, PublicInstanceRow, WorkspaceRow } from "./db";
import type { HubLifetimeShape } from "./lifetime";
import {
  type HeldWork,
  isLive,
  type WorkItems,
  WorkspaceHoldsWork,
} from "./work-items";

/** How long a workspace whose work is over stays continuable (see the module's words). */
export const RETIRE_IDLE_MS = 2 * 3_600_000;
/** How often the hub looks for spent workspaces on every online machine. */
const RETIRE_SWEEP_MS = 10 * 60_000;

/** A spent workspace kept for the unlanded work in it. */
export interface KeptWorkspace extends HeldWork {
  checkedAt: string;
}

/** What one sweep did. */
export interface RetireSweep {
  /** Workspaces whose machine could not be asked, or whose archive failed, with why. */
  failed: { workspaceId: string; reason: string }[];
  kept: KeptWorkspace[];
  /** Spent workspaces left because an artifact shows what they serve, with those artifacts' names. */
  previewed: { artifacts: string[]; machine: string; workspaceId: string }[];
  retired: {
    /** The carry its machine saved first (files git ignores that its work wrote), when it wrote one. */
    carry: string | null;
    machine: string;
    path: string;
    workspaceId: string;
  }[];
}

export interface WorkspaceRetireDeps {
  /** After a workspace is archived: its sessions' pending sends and asks, and the dashboards. */
  archived: (workspace: WorkspaceRow) => void;
  db: Pick<
    DbShape,
    "activeWorkspacesOn" | "artifacts" | "getInstancesByIds" | "workItemsIn"
  >;
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
  /** The spent workspaces the last sweep left for an artifact showing them: each is logged once. */
  let previewed = new Set<string>();
  let running: Promise<RetireSweep> | undefined;

  /** Whether the workspace is spent: a delegate's, its items all ended, its sessions idle {@link RETIRE_IDLE_MS}. */
  const spent = (workspace: WorkspaceRow, now: number): boolean => {
    if (workspace.checksFor) {
      return false;
    }
    const items = db.workItemsIn(workspace.id);
    if (items.length === 0 || items.some((item) => isLive(item.state))) {
      return false;
    }
    const rows = db.getInstancesByIds([
      ...new Set(items.map((item) => item.instanceId)),
    ]);
    if (rows.some(deps.inTurn)) {
      return false;
    }
    const last = Math.max(
      ...items.map((item) => time(item.endedAt) || now),
      ...rows.map((row) =>
        Math.max(time(row.turnEndedAt), time(row.lastRequestAt))
      )
    );
    return now - last >= RETIRE_IDLE_MS;
  };

  /**
   * One spent workspace, archived as any archive is (work-items.ts
   * `archive`, never with `discard`): its machine reads what it holds before
   * its sessions end and again before it deletes anything, and a refusal
   * naming unlanded work keeps it and lists it.
   */
  const retireOne = async (
    machineId: string,
    workspace: WorkspaceRow,
    now: number,
    done: RetireSweep
  ): Promise<void> => {
    const machine = deps.machineName(machineId);
    try {
      const { workspace: archived, carry } = await deps.workItems.archive(
        workspace.id
      );
      kept.delete(workspace.id);
      deps.archived(archived);
      done.retired.push({
        workspaceId: workspace.id,
        machine,
        path: workspace.path,
        carry,
      });
      console.log(
        `[workspace-retire] ${workspace.id} on ${machine}: retired, its work over and landed and no artifact showing it; ${workspace.path} and what it owned there are gone${carry ? `, the files git ignores that its work wrote saved to the carry ${carry}` : ""}`
      );
    } catch (error) {
      if (error instanceof WorkspaceHoldsWork) {
        const entry: KeptWorkspace = {
          ...error.held,
          checkedAt: new Date(now).toISOString(),
        };
        if (kept.get(workspace.id)?.holds !== entry.holds) {
          console.log(
            `[workspace-retire] ${workspace.id} on ${machine}: kept, ${entry.holds} (${entry.size} at ${workspace.path})`
          );
        }
        kept.set(workspace.id, entry);
        return;
      }
      const reason = error instanceof Error ? error.message : String(error);
      done.failed.push({ workspaceId: workspace.id, reason });
      console.warn(
        `[workspace-retire] ${workspace.id} on ${machine}: not retired: ${reason}`
      );
    }
  };

  /**
   * Whether an artifact shows what the spent workspace serves (db
   * artifacts.ts `previewing`): then it is listed in the sweep's `previewed`,
   * logged the first sweep it is, and left.
   */
  const shown = (
    machineId: string,
    workspace: WorkspaceRow,
    done: RetireSweep,
    shownNow: Set<string>
  ): boolean => {
    const names = db.artifacts
      .previewing(workspace)
      .map((artifact) => artifact.name);
    if (names.length === 0) {
      return false;
    }
    const machine = deps.machineName(machineId);
    shownNow.add(workspace.id);
    done.previewed.push({
      workspaceId: workspace.id,
      machine,
      artifacts: names,
    });
    if (!previewed.has(workspace.id)) {
      console.log(
        `[workspace-retire] ${workspace.id} on ${machine}: left, its work over but shown in the artifact${names.length === 1 ? "" : "s"} ${names.join(", ")}; it is retired once ${names.length === 1 ? "that goes" : "those go"}`
      );
    }
    return true;
  };

  const sweepOnce = async (now: number): Promise<RetireSweep> => {
    const done: RetireSweep = {
      kept: [],
      failed: [],
      previewed: [],
      retired: [],
    };
    const shownNow = new Set<string>();
    for (const machineId of deps.online()) {
      const ready = db
        .activeWorkspacesOn(machineId)
        .filter(
          (one) => spent(one, now) && !shown(machineId, one, done, shownNow)
        );
      // A kept one archived by hand, no longer spent, or shown now leaves the list.
      for (const [id, entry] of kept) {
        if (
          entry.machineId === machineId &&
          !ready.some((workspace) => workspace.id === id)
        ) {
          kept.delete(id);
        }
      }
      for (const workspace of ready) {
        // biome-ignore lint/performance/noAwaitInLoops: one workspace at a time, so a sweep never loads a machine with many git reads at once
        await retireOne(machineId, workspace, now, done);
      }
    }
    previewed = shownNow;
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
