/**
 * What a machine's own frame data already says about whether it has converged
 * with the rest of the fleet — the board's answer to the Mac's 21-day silence
 * (see `.unlazy-liveness/gates/c2.md`): a build nobody can place and a sync stuck
 * on a decision nobody was asked to make. Every reader here is pure: given the frame data a
 * machine already carries, no reach into the network.
 */
import type { AgentRow, BuildInfo, FleetSyncReport } from "@cawco/core";
import { machineFaults } from "./fleet-faults";

/** Whether a machine's own reported build is level with the hub's. */
export type BuildConvergence = "unknown" | "current" | "behind";

/**
 * `unknown` whenever either side has nothing to compare — most importantly a
 * machine that never reported a commit at all, which must never read as
 * "current" just because it also never read as "behind". That is the exact
 * shape of the incident this leaf exists to catch: 21 days of `commit: None`
 * rendering as nothing, rather than as the absence it is.
 */
export function buildConvergence(
  build: BuildInfo | undefined,
  hubBuild: BuildInfo | undefined
): BuildConvergence {
  if (!(build?.commit && hubBuild?.commit)) {
    return "unknown";
  }
  return build.commit === hubBuild.commit ? "current" : "behind";
}

/**
 * The fleet-sync failure readers that used to live here — `SyncFailure`,
 * `fleetSyncFailures` and `SYNC_FAILURE_ANCHOR` — now live in `fleet-faults.ts`
 * as `Fault`, `machineFaults` and `SCOPE_ANCHOR`. They were the same concept
 * twice: this file could say a row failed, and nothing anywhere could say WHY
 * or what to do about it. One vocabulary answers both, so this one is gone
 * rather than kept as its poorer half.
 */

/**
 * How long ago a machine's fleet report was taken, in ms — `undefined` for a
 * machine that has never synced at all. "11 days" is the number that would
 * have made the Mac's drift visible on day one; this is where it comes from.
 */
export function fleetSyncAgeMs(
  fleet: FleetSyncReport | undefined,
  now: number = Date.now()
): number | undefined {
  return fleet ? Math.max(0, now - fleet.at) : undefined;
}

/**
 * Whether the board must say something about a machine beyond the Machines
 * tile's "N of M online" (JOURNEY §1 block 4, the roster as a grouped
 * reading): it is not online, its build cannot be placed level with the
 * hub's (behind, or unknown — the Mac's `commit: None`), or a fleet-sync row
 * failed on it. A machine with none
 * of these is fine and gets no row of its own.
 */
export function machineNeedsNotice(
  machine: AgentRow,
  hubBuild: BuildInfo | undefined
): boolean {
  return (
    machine.status !== "online" ||
    buildConvergence(machine.build, hubBuild) !== "current" ||
    machineFaults(machine.machineId, machine.fleet).length > 0
  );
}
