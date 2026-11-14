/**
 * A MACHINE'S COPY OF A TOOL AGAINST THE VERSION CAWCO RUNS, as the screens
 * draw it: Configure › Command-line tools on each machine's row, a session's
 * harness block, and Needs you (the owner, 2026-11-14: a copy at a version
 * CawCo does not run is updated, or the person is told; never left refused
 * with nobody told). Read from what the hub holds of each machine's tool
 * (core `ToolStatus`, on the `instances` frame) and the fleet's choice
 * (`/api/tool-updates`), so every surface says the same of one copy.
 */
import {
  olderThan,
  type ToolStatus,
  type ToolUpdates,
  type ToolWants,
} from "./tools";

/**
 * `/api/tool-updates`: the fleet's choice, and every tool some machine is
 * behind on with each such machine ({@link toolsBehind}), as the hub holds
 * them when asked. After that, each machine's cell moves on the `instances`
 * frame, and {@link toolsBehind} over the machines says the same.
 */
export interface ToolUpdatesState {
  behind: ToolBehind[];
  /**
   * The newest release of each CLI CawCo keeps current (core
   * `ToolSpec.release`: Claude Code), by tool id, as the hub last read it;
   * none for one not read yet. What a copy CawCo put there is updated to
   * ({@link toolUpdateOf}'s `releases`).
   */
  releases: Record<string, string>;
  updates: ToolUpdates;
}

/**
 * Where one machine's copy of one tool stands:
 * - `runs`: at a version CawCo runs, and for a CLI CawCo keeps current
 *   either its newest release or a copy the person installed (which CawCo
 *   leaves where it is); `updatedAt` when CawCo's own install put it there
 *   (its daemon's record), absent for a copy it did not or whose install
 *   it kept no record of;
 * - `updating`: an install runs there now, from `from` to `to` when known;
 * - `failed`: the last install there left the copy at `found`, short of
 *   `wants`; `output` is what the installer said, `at` when it ran. Update
 *   tries again. `own`: the copy is the person's own;
 * - `own`: the person's own copy at `found`, which CawCo does not run: it
 *   updates only when the person presses Update;
 * - `asked`: CawCo's copy at `found`, short of `wants`, while the fleet is
 *   set to ask: it updates when the person presses Update;
 * - `due`: CawCo's copy at `found`, short of `wants`, while the fleet is
 *   set to update: the hub sends the install as soon as the machine is
 *   connected and not paused.
 *
 * `wants` is the version CawCo runs (the copy cannot run: its one version,
 * or its floor or newer), or, for a copy CawCo put there of a CLI it keeps
 * current, which still runs, the newest release (`orNewer`).
 */
export type ToolUpdateState =
  | { kind: "runs"; updatedAt?: number; version?: string }
  | { from?: string; kind: "updating"; to?: string }
  | {
      at: number;
      found?: string;
      kind: "failed";
      output: string;
      own: boolean;
      wants: ToolWants;
    }
  | { found?: string; kind: "own"; wants: ToolWants }
  | { found?: string; kind: "asked"; wants: ToolWants }
  | { found?: string; kind: "due"; wants: ToolWants };

/**
 * Where `cell` stands ({@link ToolUpdateState}) under the fleet's choice
 * `updates`, with the newest release of each CLI CawCo keeps current
 * (`releases`, by tool id); undefined for a tool that is not there, or not
 * there to run for another reason than its version (no installer here, an
 * install of a missing tool that failed): those are the row's own state.
 * The one rule for every tool: a copy CawCo put there is updated under
 * "update" and waits on the person under "ask"; a copy the person installed
 * is never updated by CawCo, and waits on the person only when CawCo can't
 * run it.
 */
export const toolUpdateOf = (
  cell: ToolStatus | undefined,
  updates: ToolUpdates,
  releases: Readonly<Record<string, string>> = {}
): ToolUpdateState | undefined => {
  if (!cell) {
    return;
  }
  if (cell.state === "installing") {
    return {
      kind: "updating",
      ...(cell.version ? { from: cell.version } : {}),
      ...(cell.to ? { to: cell.to } : {}),
    };
  }
  if (cell.wants) {
    return cannotRun(cell, cell.wants, updates);
  }
  if (cell.state !== "installed") {
    return;
  }
  return (
    behindRelease(cell, updates, releases[cell.id]) ?? {
      kind: "runs",
      ...(cell.version ? { version: cell.version } : {}),
      ...(cell.copy?.by === "cawco" && cell.copy.at !== undefined
        ? { updatedAt: cell.copy.at }
        : {}),
    }
  );
};

/** A copy its machine says CawCo can't run ({@link toolUpdateOf}): failed, the person's own, or CawCo's under the fleet's choice. */
const cannotRun = (
  cell: ToolStatus,
  wants: ToolWants,
  updates: ToolUpdates
): ToolUpdateState => {
  const found = cell.version ? { found: cell.version } : {};
  const ours = cell.copy?.by === "cawco";
  if (cell.triedAt !== undefined) {
    return {
      kind: "failed",
      ...found,
      wants,
      output: cell.detail ?? "",
      at: cell.triedAt,
      own: !ours,
    };
  }
  if (!ours) {
    return { kind: "own", ...found, wants };
  }
  return { kind: updates === "update" ? "due" : "asked", ...found, wants };
};

/**
 * A copy CawCo put there of a CLI it keeps current, which runs but is older
 * than the newest release (`newest`); nothing for any other copy, a
 * person's own above all, which CawCo leaves where it is.
 */
const behindRelease = (
  cell: ToolStatus,
  updates: ToolUpdates,
  newest: string | undefined
): ToolUpdateState | undefined => {
  const ours = cell.copy?.by === "cawco";
  if (!(ours && newest && cell.version && olderThan(cell.version, newest))) {
    return;
  }
  const behind = {
    found: cell.version,
    wants: { version: newest, orNewer: true },
  };
  // An update that left the copy older says why on the installed copy
  // (core `ToolStatus.detail`), and is not sent again for that release.
  if (cell.detail !== undefined) {
    return {
      kind: "failed",
      ...behind,
      output: cell.detail,
      at: cell.at,
      own: false,
    };
  }
  return { kind: updates === "update" ? "due" : "asked", ...behind };
};

/** Whether a machine's copy in this state waits on the person: Needs you lists it. */
const waitsOnPerson = (state: ToolUpdateState): boolean =>
  state.kind === "failed" || state.kind === "own" || state.kind === "asked";

/** One machine whose copy of a tool is short of what CawCo wants of it, or is updating. */
interface ToolBehindMachine {
  machineId: string;
  /**
   * The copy waits on the person (`failed`, `own`, `asked`): Needs you
   * lists it, with Update. The rest CawCo is updating, or will once the
   * machine is connected (`due`).
   */
  needsYou: boolean;
  /** Its agent is connected: an Update can be sent to it now. */
  online: boolean;
  state: Exclude<ToolUpdateState, { kind: "runs" }>;
}

/**
 * One tool some machines are behind on: the version CawCo runs, and each
 * such machine with where it stands, so Needs you draws one entry per tool
 * with a line per machine, or one per machine and tool, from the same data.
 */
export interface ToolBehind {
  machines: ToolBehindMachine[];
  toolId: string;
  /** What CawCo wants of it, as the first machine listed with one says it ({@link ToolUpdateState}'s `wants`). */
  wants?: ToolWants;
}

/** The parts of a machine row {@link toolsBehind} reads (core `MachineRow`). */
interface MachineTools {
  machineId: string;
  status: string;
  tools?: Record<string, ToolStatus>;
}

/**
 * Every tool some machine is behind on, or updating a copy of, in the order
 * the machines' cells name them: what Needs you and an "Update all" read
 * (`/api/tool-updates`'s `behind`).
 */
export const toolsBehind = (
  machines: readonly MachineTools[],
  updates: ToolUpdates,
  releases: Readonly<Record<string, string>> = {}
): ToolBehind[] => {
  const byTool = new Map<string, ToolBehind>();
  for (const machine of machines) {
    for (const [toolId, cell] of Object.entries(machine.tools ?? {})) {
      const state = toolUpdateOf(cell, updates, releases);
      // An install of a tool that was not there is no copy behind.
      if (
        !state ||
        state.kind === "runs" ||
        (state.kind === "updating" && state.from === undefined)
      ) {
        continue;
      }
      const entry = byTool.get(toolId) ?? { toolId, machines: [] };
      if (!entry.wants && "wants" in state) {
        entry.wants = state.wants;
      }
      entry.machines.push({
        machineId: machine.machineId,
        needsYou: waitsOnPerson(state),
        online: machine.status === "online",
        state,
      });
      byTool.set(toolId, entry);
    }
  }
  return [...byTool.values()];
};
