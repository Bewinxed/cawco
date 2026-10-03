/**
 * Every session in the fleet as CSV rows: the live ones with what this
 * browser knows of their turns, context and state, then the transcripts
 * stored on the machines that are not running — the ledger the fleet board
 * used to export, now Usage's Sessions export. Each row carries the spend
 * the page's range read for it; a session that spent in the range but is in
 * neither list (its transcript gone) is still a row, named as the hub names
 * it. Claude's figure (the API price of work the plan covers) and opencode's
 * (real money) stay in their own columns, never one.
 */
import { machineLabel, type UsageSummaryRow } from "@cawco/core";
import { cawco, isFailed } from "./client.svelte";
import { instanceTitle, lastAt } from "./home/home-state.svelte";
import { catalogTitle } from "./links";

const HARNESS: Record<string, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  pi: "pi",
};

const machineName = (machineId: string): string => {
  const machine = cawco.machines.find((m) => m.machineId === machineId);
  return machine ? machineLabel(machine.hostname) : machineId;
};

function stateOf(id: string, failed: boolean): string {
  if (failed) {
    return "Failed";
  }
  switch (cawco.activityOf(id)) {
    case "blocked":
      return "Needs you";
    case "working":
      return "Working";
    default:
      return "Idle";
  }
}

/** A session's spend in the range, by the harness session id the hub keys it by. */
export type SessionSpend = Map<
  string,
  { harness: string; row: UsageSummaryRow }
>;

const HEAD = [
  "Session",
  "Machine",
  "Harness",
  "Turns",
  "Context",
  "Last activity",
  "State",
  "API price (USD)",
  "Spend (USD)",
  "Input",
  "Output",
  "Cache write",
  "Cache read",
  "Messages",
];

/** The spend columns: Claude's under API price, opencode's under Spend. */
function spendCells(
  spend: { harness: string; row: UsageSummaryRow } | undefined
): string[] {
  if (!spend) {
    return ["", "", "", "", "", "", ""];
  }
  const { harness, row } = spend;
  const cost = row.costUsd.toFixed(2);
  return [
    harness === "claude" ? cost : "",
    harness === "claude" ? "" : cost,
    String(row.input),
    String(row.output),
    String(row.cacheCreation),
    String(row.cacheRead),
    String(row.messages),
  ];
}

/** The sessions file: a header line, then one row per session. */
export function sessionsCsv(spend: SessionSpend): string {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const seen = new Set<string>();
  const live = cawco.runningInstances.map((row) => {
    const stats = cawco.statsOf(row.id);
    const at = lastAt(row);
    const harness = row.harness ?? "claude";
    if (row.sessionId) {
      seen.add(row.sessionId);
    }
    return [
      instanceTitle(row),
      machineName(row.machineId),
      HARNESS[harness] ?? harness,
      stats.turns === null ? "" : String(stats.turns),
      stats.contextPct === null ? "" : `${Math.round(stats.contextPct)}%`,
      at ? new Date(at).toISOString() : "",
      stateOf(row.id, isFailed(row)),
      ...spendCells(row.sessionId ? spend.get(row.sessionId) : undefined),
    ];
  });
  const stored = cawco.machines.flatMap((machine) =>
    cawco
      .catalogOf(machine.machineId)
      .filter((info) => !seen.has(info.sessionId))
      .map((info) => {
        seen.add(info.sessionId);
        return [
          catalogTitle(info, cawco.instanceIndex, machine.machineId),
          machineLabel(machine.hostname),
          HARNESS[info.harness] ?? info.harness,
          "",
          "",
          new Date(info.lastModified).toISOString(),
          "Idle",
          ...spendCells(spend.get(info.sessionId)),
        ];
      })
  );
  const spentOnly = [...spend]
    .filter(([sessionId]) => !seen.has(sessionId))
    .map(([, entry]) => [
      entry.row.label,
      entry.row.machine ? machineLabel(entry.row.machine.hostname) : "",
      HARNESS[entry.harness] ?? entry.harness,
      "",
      "",
      "",
      "",
      ...spendCells(entry),
    ]);
  return [HEAD, ...live, ...stored, ...spentOnly]
    .map((row) => row.map(cell).join(","))
    .join("\n");
}
