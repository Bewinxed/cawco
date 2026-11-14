/**
 * The machine and tool pairs whose copy refuses sessions (core
 * tool-updates.ts `toolsBehind`, kept to copies CawCo can't run): what the
 * Out of date group lists and what Needs you asks about. A copy CawCo put
 * there that runs while a newer release is out (`wants.orNewer` at the
 * newest release, on a cell with no `wants` of its own) needs nobody: its
 * tool's ledger row says it, and nothing else does.
 */
import {
  type ToolBehind,
  type ToolUpdateState,
  toolsBehind,
} from "@cawco/core/tool-updates";
import { type ToolUpdates, toolRuns, toolSpec } from "@cawco/core/tools";
import type { Machine } from "./stores/board.svelte";

export function blockingBehind(
  machines: readonly Machine[],
  updates: ToolUpdates,
  releases: Readonly<Record<string, string>>
): ToolBehind[] {
  return toolsBehind(machines, updates, releases).flatMap((entry) => {
    const spec = toolSpec(entry.toolId);
    const blocked = entry.machines.filter((behind) => {
      if (behind.state.kind === "updating") {
        return spec !== undefined && !toolRuns(spec, behind.state.from);
      }
      const cell = machines.find((one) => one.machineId === behind.machineId)
        ?.tools?.[entry.toolId];
      return cell?.wants !== undefined;
    });
    return blocked.length > 0 ? [{ ...entry, machines: blocked }] : [];
  });
}

/**
 * Whether Update all sends this machine's copy its Update: by the hub's own
 * rule (hub tool-installs.ts `updateAll`), so every count of the press says
 * what it does. A copy CawCo put there, on a connected machine that isn't
 * paused, with no install under way. A copy the person installed is never
 * in it (the owner, 2026-11-14: "Never touched; notice and button only"):
 * only its own row's press updates it.
 */
export const updateAllTakes = (
  state: ToolUpdateState,
  machine: Pick<Machine, "pausedUntil" | "status">
): boolean =>
  machine.status === "online" &&
  machine.pausedUntil === null &&
  state.kind !== "updating" &&
  state.kind !== "runs" &&
  state.kind !== "own" &&
  !(state.kind === "failed" && state.own);
