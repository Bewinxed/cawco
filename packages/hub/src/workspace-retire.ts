/**
 * A workspace lives exactly as long as its work item (work-items.ts
 * `settle`). When the item ends, the hub settles its workspace: once nothing
 * holds it (a session of its items attached, an artifact showing what it
 * serves), its machine closes its boundary, reads on the host what its clone
 * holds that is nowhere else, and either deletes it all (retired: its work
 * landed, or there was none) or keeps it (held: the person continues it or
 * discards it, and nothing else ends it). A machine's disk filled on
 * 2026-10-14 because nothing removed a workspace once its work was over; on
 * 2026-10-16 the owner called keeping every finished workspace until someone
 * archived it "a terrible working model".
 *
 * A finished delegate stays continuable without its folder: a handoff or a
 * follow-up to a retired one cuts its clone again at the same path, at the
 * commit its clone's HEAD was on as its machine deleted it (never its base's
 * tip), and it goes on in the same session (work-items.ts `recut`). Files
 * git ignores go with the clone; a delegate keeps one by handing it in as an
 * output.
 *
 * Settling follows the events that end a hold: an item's end, its session
 * asleep or ended, an artifact removed. This sweep is the look that catches
 * what no event reached (a hub restarted, a machine away at the time): every
 * {@link RETIRE_SWEEP_MS}, each active workspace on every online machine is
 * settled.
 */
import type { HubLifetimeShape } from "./lifetime";
import type { HeldWork, WorkItems } from "./work-items";

/** How often the hub settles the workspaces on every online machine. Ours: a minute, against events that settle at once. */
const RETIRE_SWEEP_MS = 60_000;

/** What one sweep did. */
export interface RetireSweep {
  /** Workspaces whose machine could not be asked, or whose archive failed, with why. */
  failed: { workspaceId: string; reason: string }[];
  /** Workspaces held this sweep: their clones hold work that is nowhere else. */
  held: HeldWork[];
  /** Workspaces left as they are for what holds them, in words. */
  kept: { workspaceId: string; hold: string }[];
  retired: {
    machine: string;
    path: string;
    workspaceId: string;
  }[];
}

export interface WorkspaceRetireDeps {
  lifetime: HubLifetimeShape;
  machineName: (machineId: string) => string;
  /** The machines connected now. */
  online: () => string[];
  workItems: Pick<WorkItems, "settleOn">;
}

export const createWorkspaceRetire = (deps: WorkspaceRetireDeps) => {
  let running: Promise<RetireSweep> | undefined;

  const sweepOnce = async (): Promise<RetireSweep> => {
    const done: RetireSweep = { failed: [], held: [], kept: [], retired: [] };
    for (const machineId of deps.online()) {
      // biome-ignore lint/performance/noAwaitInLoops: one machine at a time, each one workspace at a time
      const settled = await deps.workItems.settleOn(machineId);
      for (const { workspace, outcome } of settled) {
        switch (outcome.kind) {
          case "retired":
            done.retired.push({
              workspaceId: workspace.id,
              machine: deps.machineName(machineId),
              path: workspace.path,
            });
            break;
          case "held":
            done.held.push(outcome.held);
            break;
          case "deferred":
            done.kept.push({ workspaceId: workspace.id, hold: outcome.hold });
            break;
          case "failed":
            done.failed.push({
              workspaceId: workspace.id,
              reason: outcome.reason,
            });
            break;
          default:
            break;
        }
      }
    }
    return done;
  };

  /** One sweep now; a sweep already running is that one's answer. */
  const sweep = (): Promise<RetireSweep> => {
    running ??= sweepOnce().finally(() => {
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

  return { sweep };
};

export type WorkspaceRetire = ReturnType<typeof createWorkspaceRetire>;
