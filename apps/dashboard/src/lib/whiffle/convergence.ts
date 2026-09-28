/**
 * What a machine's own frame data already says about whether it has converged
 * with the rest of the fleet — the board's answer to the Mac's 21-day silence
 * (see `.unlazy-liveness/gates/c2.md`): a build nobody can place, a sync stuck
 * on a decision nobody was asked to make, and a deploy clone that either
 * caught up or refused to. Every reader here is pure: given the frame data a
 * machine already carries, no reach into the network.
 */
import type {
  AgentRow,
  BuildInfo,
  DeployInfo,
  FleetSyncReport,
} from "@whiffle/core";
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
 * Where a deployment clone stands against the branch it deploys from. The type
 * now comes from `@whiffle/core` — leaf Y2 carried C1's `DeployTick` onto the
 * wire (flattened to `{ kind, detail?, updated?, failure? }`, which is the
 * shape this file already read), so `AgentRow.deploy` is a real field and the
 * structural read below is tolerance rather than a workaround. It stays
 * tolerant: a daemon that predates the deployment channel, or one whose watcher
 * has never ticked, sends no field at all, and every reader here must answer
 * `undefined` for it exactly as `hubBuild` does on an older hub.
 */
export type { DeployKind } from "@whiffle/core";

export type MachineDeployInfo = DeployInfo;

/** A `diverged` clone refuses to deploy at all — the one state that must never read as merely stale. */
export const isDeployDiverged = (
  deploy: MachineDeployInfo | undefined
): boolean => deploy?.kind === "diverged";

/** Whether a deploy state is worth a badge at all — `unmarked` is an ordinary dev tree, not a fact to flag. */
export const isDeployNoteworthy = (
  deploy: MachineDeployInfo | undefined
): boolean =>
  deploy !== undefined &&
  deploy.kind !== "unmarked" &&
  deploy.kind !== "current";

/** The kinds a machine may claim; anything else is not one, and badges nothing. */
const DEPLOY_KINDS: readonly string[] = [
  "unmarked",
  "unreachable",
  "current",
  "behind",
  "ahead",
  "diverged",
];

/**
 * Structural, and deliberately still so. `AgentRow.deploy` is typed now, but
 * this is the boundary where an *older or newer* machine's word arrives, and a
 * kind this build cannot render must read as nothing to report rather than as a
 * badge with no meaning. Callers may pass `machine.deploy` directly.
 */
export function deployInfoOf(deploy: unknown): MachineDeployInfo | undefined {
  if (!deploy || typeof deploy !== "object" || !("kind" in deploy)) {
    return undefined;
  }
  if (!DEPLOY_KINDS.includes((deploy as { kind: unknown }).kind as string)) {
    return undefined;
  }
  return deploy as MachineDeployInfo;
}

/**
 * Whether the board must say something about a machine beyond the Machines
 * tile's "N of M online" (JOURNEY §1 block 4, the roster as a grouped
 * reading): it is not online, its build cannot be placed level with the
 * hub's (behind, or unknown — the Mac's `commit: None`), a fleet-sync row
 * failed on it, or its deploy clone refuses to deploy. A machine with none
 * of these is fine and gets no row of its own.
 */
export function machineNeedsNotice(
  machine: AgentRow,
  hubBuild: BuildInfo | undefined
): boolean {
  return (
    machine.status !== "online" ||
    buildConvergence(machine.build, hubBuild) !== "current" ||
    machineFaults(machine.machineId, machine.fleet).length > 0 ||
    isDeployDiverged(deployInfoOf(machine.deploy))
  );
}
