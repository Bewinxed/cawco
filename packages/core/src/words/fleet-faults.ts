/**
 * What the dashboard calls a row a machine could not apply, by the section of
 * its fleet report the row is said in (the dashboard's fleet-faults.ts). The
 * app draws none of it, so it is not written into it (scripts/words-swift.ts).
 */
import type { FleetReportSection } from "../fleet";
import { type HarnessConfigKind, harnessConfigLabel } from "../harness-config";

export const fleetFaultWords = {
  /** Each section's row, singular, in a sentence. */
  noun: {
    mcp: "MCP server",
    marketplaces: "marketplace",
    plugins: "plugin",
    skills: "skill",
    memory: "memory",
    memoryDocs: "memory document",
    hooks: "hook",
    harnessConfig: "harness setting",
  } satisfies Record<FleetReportSection, string>,
  /** A harness config row by its kind and name: "Claude Code settings strict". */
  harnessConfigRow: (kind: HarnessConfigKind, name: string) =>
    `${harnessConfigLabel(kind)} ${name}`,
};
