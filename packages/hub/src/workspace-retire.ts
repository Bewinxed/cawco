/**
 * A workspace lives exactly as long as its work item (workspaces.ts
 * `settle`). When the item ends, the hub settles its workspace: once nothing
 * runs in it (a session of its items attached, a stage serving from it,
 * which sleeps half an hour after its last use) and nothing it serves is
 * still owed to the person (not acted on since a session put it before
 * them: artifacts service `owedToPerson`), its machine closes its boundary,
 * reads on the host what its clone holds that is nowhere else, and either
 * deletes it all (retired: its work landed, itself or through a workspace
 * cut from it, or there was none), carries it off (its items land nothing,
 * or its starter will never decide it: a routine's run, an ended parent) or
 * keeps it (held: the session that started its work is told, and continues
 * it or discards it). An artifact's row alone holds nothing (the owner's
 * pick on 2026-11-15: "By itself, once nothing in it is unique"). A machine's disk filled on
 * 2026-10-14 because nothing removed a workspace once its work was over; on
 * 2026-10-16 the owner called keeping every finished workspace until someone
 * archived it "a terrible working model". What the person has not acted on
 * holds its workspace whoever made it and whatever ended since: on
 * 2026-11-20 he opened previews handed up to his panel and found their
 * workspaces gone, and on 2026-11-21 a design graph a view had only
 * acknowledged.
 *
 * A finished delegate stays continuable without its folder: a handoff or a
 * follow-up to a retired one cuts its clone again at the same path, at the
 * commit its clone's HEAD was on as its machine deleted it (never its base's
 * tip), and it goes on in the same session (workspaces.ts `recut`). Files
 * git ignores go with the clone; a delegate keeps one by handing it in as an
 * output.
 *
 * Settling follows the events that end a hold: an item's end, its session
 * asleep or ended, an artifact removed or its source moved off. This sweep
 * is the look that catches what no event reached (a hub restarted, a
 * machine away at the time, the person acting on what a workspace serves): every {@link RETIRE_SWEEP_MS},
 * each active workspace on every online machine is settled (one whose
 * clone is gone from its machine holds nothing it serves), and so is each
 * host-scope one whose scratch dir a hold kept (workspaces.ts `hostKept`);
 * each held one whose starter will never decide it is carried off,
 * and each archived one whose clone its machine still has is closed again
 * (workspaces.ts `settleOn`). The same look keeps up the server
 * of each preview waiting on the person, which would otherwise sleep once its
 * idle half hour ran out (artifacts service `keepWaitingUp`).
 */
import type { HubLifetimeShape } from "./lifetime";
import type { WorkItems } from "./work-items";
import type { HeldWork } from "./workspaces";

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
  /** Keeps up the servers of the previews waiting on the person on `online` machines (artifacts service `keepWaitingUp`). */
  keepUp: (online: ReadonlySet<string>) => void;
  lifetime: HubLifetimeShape;
  machineName: (machineId: string) => string;
  /** The machines connected now. */
  online: () => string[];
  workItems: Pick<WorkItems, "settleOn">;
}

export const createWorkspaceRetire = (deps: WorkspaceRetireDeps) => {
  let running: Promise<RetireSweep> | undefined;

  /** One look at every online machine; `asked`, someone asked for it, so a workspace whose settle failed is tried now. */
  const sweepOnce = async (asked: boolean): Promise<RetireSweep> => {
    const done: RetireSweep = { failed: [], held: [], kept: [], retired: [] };
    const online = deps.online();
    try {
      deps.keepUp(new Set(online));
    } catch (error) {
      console.warn(
        `[workspace-retire] keeping the waiting previews up failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    for (const machineId of online) {
      const settled = await deps.workItems.settleOn(machineId, asked);
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
          case "none":
            break;
        }
      }
    }
    return done;
  };

  /** One sweep now; a sweep already running is that one's answer. */
  const sweep = (asked: boolean): Promise<RetireSweep> => {
    running ??= sweepOnce(asked).finally(() => {
      running = undefined;
    });
    return running;
  };

  deps.lifetime.every("workspaces retired", RETIRE_SWEEP_MS, () => {
    sweep(false).catch((error: unknown) =>
      console.warn(
        `[workspace-retire] the sweep failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  });

  /** A sweep someone asked for (`POST /api/workspaces/retire`): every workspace tried now. */
  return { sweep: () => sweep(true) };
};
