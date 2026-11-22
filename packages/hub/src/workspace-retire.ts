/**
 * A workspace lives exactly as long as its work item (workspaces.ts
 * `settle`). When the item ends, the hub settles its workspace: once nothing
 * runs in it (a session of its items attached, a stage serving from it,
 * which sleeps half an hour after its last use), its machine closes its
 * boundary, reads on the host what its clone holds that is nowhere else, and
 * either deletes it all (retired: its work landed, itself or through a
 * workspace cut from it, or there was none), carries it off (its items land
 * nothing, or its starter will never decide it: a routine's run, an ended
 * parent) or keeps it (held: the session that started its work is told, and
 * continues it or discards it), the owner's pick on 2026-11-15: "By itself,
 * once nothing in it is unique". A machine's disk filled on 2026-10-14
 * because nothing removed a workspace once its work was over; on 2026-10-16
 * the owner called keeping every finished workspace until someone archived it
 * "a terrible working model". What it serves holds nothing: a design or a
 * served preview opened after its workspace went cuts it again at the
 * version recorded as it retired (workspaces.ts `revive`; the owner's pick
 * on 2026-11-22, "Comes back when you open it"), after four rules that
 * guessed when the person was done with a design each closed one he was
 * using.
 *
 * A finished delegate stays continuable without its folder: a handoff or a
 * follow-up to a retired one cuts its clone again at the same path, at the
 * commit its clone's HEAD was on as its machine deleted it (never its base's
 * tip), and it goes on in the same session (workspaces.ts `recut`). Files
 * git ignores go with the clone; a delegate keeps one by handing it in as an
 * output.
 *
 * Settling follows the events that end a hold: an item's end, its session
 * asleep or ended, its stage asleep. This sweep
 * is the look that catches what no event reached (a hub restarted, a
 * machine away at the time): every {@link RETIRE_SWEEP_MS},
 * each active workspace on every online machine is settled (one whose
 * clone is gone from its machine holds nothing it serves), each host-scope
 * one among them (workspaces.ts `settleHost`);
 * each held one whose starter will never decide it is carried off,
 * and each archived one whose clone its machine still has is closed again
 * (workspaces.ts `settleOn`). The same look keeps up each stage serving the
 * person an artifact waiting on him (a preview's server, a design graph's or
 * a page's sheet), which would otherwise sleep once its idle half hour ran
 * out (artifacts service `keepWaitingUp`), and moves into the hub's
 * keeping each online machine's folder previews whose files a pin's copy
 * there still holds, then sends it the pins still to move, so it lets go
 * of every other one, and of each design whose folder went (artifacts
 * service `pinsBack`, folder-move.ts, agent stage.ts `keepPins`).
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
  /** Moves machine `machineId`'s folder previews still in pins into the hub's keeping, then sends it the pins still to move; it lets go of the rest (artifacts service `pinsBack`). */
  keepPins: (machineId: string) => void;
  /** Keeps up the stages serving the person what waits on him on `online` machines (artifacts service `keepWaitingUp`). */
  keepUp: (online: ReadonlySet<string>) => void;
  lifetime: HubLifetimeShape;
  machineName: (machineId: string) => string;
  /** The machines connected now. */
  online: () => string[];
  workItems: Pick<WorkItems, "settleOn">;
}

export const createWorkspaceRetire = (deps: WorkspaceRetireDeps) => {
  let running: Promise<RetireSweep> | undefined;

  /** `work` run; a failure logged as `what` failed, and the sweep goes on. */
  const tried = (what: string, work: () => void): void => {
    try {
      work();
    } catch (error) {
      console.warn(
        `[workspace-retire] ${what} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  /** What the sweep keeps up on the `online` machines besides their workspaces: the stages waiting on the person, and each machine's pins. */
  const keepOn = (online: readonly string[]): void => {
    tried("keeping the waiting stages up", () => deps.keepUp(new Set(online)));
    for (const machineId of online) {
      tried(`sending ${deps.machineName(machineId)} its pins`, () =>
        deps.keepPins(machineId)
      );
    }
  };

  /** One look at every online machine; `asked`, someone asked for it, so a workspace whose settle failed is tried now. */
  const sweepOnce = async (asked: boolean): Promise<RetireSweep> => {
    const done: RetireSweep = { failed: [], held: [], kept: [], retired: [] };
    const online = deps.online();
    keepOn(online);
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
