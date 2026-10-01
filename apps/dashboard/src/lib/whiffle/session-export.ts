/**
 * Every session in the fleet as a CSV file: the live ones with what this
 * browser knows of their turns, context and state, then the transcripts
 * stored on the machines that are not running. The ledger the fleet board
 * used to export, moved to Usage with the board's table gone.
 */
import { isFailed, whiffle } from "./client.svelte";
import { instanceTitle, lastAt } from "./home/home.svelte";
import { sessionTitle } from "./links";
import { machineLabel } from "./machine";

const HARNESS: Record<string, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  pi: "pi",
};

const machineName = (machineId: string): string => {
  const machine = whiffle.machines.find((m) => m.machineId === machineId);
  return machine ? machineLabel(machine.hostname) : machineId;
};

function stateOf(id: string, failed: boolean): string {
  if (failed) {
    return "Failed";
  }
  switch (whiffle.activityOf(id)) {
    case "blocked":
      return "Needs you";
    case "working":
      return "Working";
    default:
      return "Idle";
  }
}

export function exportSessionsCsv(): void {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const head = [
    "Session",
    "Machine",
    "Harness",
    "Turns",
    "Context",
    "Last activity",
    "State",
  ];
  const live = whiffle.runningInstances.map((row) => {
    const stats = whiffle.statsOf(row.id);
    const at = lastAt(row);
    const harness = row.harness ?? "claude";
    return [
      instanceTitle(row),
      machineName(row.machineId),
      HARNESS[harness] ?? harness,
      stats.turns === null ? "" : String(stats.turns),
      stats.contextPct === null ? "" : `${Math.round(stats.contextPct)}%`,
      at ? new Date(at).toISOString() : "",
      stateOf(row.id, isFailed(row)),
    ];
  });
  const running = new Set(
    whiffle.runningInstances.map((row) => row.sessionId).filter(Boolean)
  );
  const stored = whiffle.machines.flatMap((machine) =>
    whiffle
      .catalogOf(machine.machineId)
      .filter((info) => !running.has(info.sessionId))
      .map((info) => [
        sessionTitle(info),
        machineLabel(machine.hostname),
        HARNESS[info.harness] ?? info.harness,
        "",
        "",
        new Date(info.lastModified).toISOString(),
        "Idle",
      ])
  );
  const body = [head, ...live, ...stored].map((row) => row.map(cell).join(","));
  const blob = new Blob([body.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fleet-sessions.csv";
  link.click();
  URL.revokeObjectURL(url);
}
