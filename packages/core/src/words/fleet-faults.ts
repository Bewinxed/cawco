/**
 * What the dashboard calls a row a machine could not apply, by the section of
 * its fleet report the row is said in (the dashboard's fleet-faults.ts). The
 * app draws none of it, so it is not written into it (scripts/words-swift.ts).
 */

import type { FleetReportSection } from "../fleet";
import type { FaultReason } from "../fleet-fault-reason";
import type { HarnessKind } from "../harness/kinds";
import { type HarnessConfigKind, harnessConfigLabel } from "../harness-config";
import { accountsWords } from "./accounts";
import { andList } from "./helpers";

const TRAILING_STOP = /\.$/u;

/** Why, after the colon: a status code or a word for the cause; the machine's own plain words where it said no more. */
const because = (reason: FaultReason): string => {
  if ("status" in reason) {
    return `its server answered ${reason.status}`;
  }
  if ("word" in reason) {
    return reason.word === "timeout"
      ? "its server didn't answer (timeout)"
      : "its server refused the connection";
  }
  return reason.text.replace(TRAILING_STOP, "");
};

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
  /** One fault in a sentence: what didn't set up, on which harnesses, and why. */
  sentence: (
    what: string,
    harnesses: readonly HarnessKind[],
    reason: FaultReason | undefined
  ): string => {
    const on =
      harnesses.length > 0
        ? ` on ${andList(harnesses.map((harness) => accountsWords.harnesses[harness]))}`
        : "";
    const why = reason ? `: ${because(reason)}` : "";
    return `${what} didn't set up${on}${why}.`;
  },
};
