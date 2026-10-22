/**
 * The hub's own session tools as an agent reads them (hub-tools.ts): what a
 * build check found and each machine's install, what a design write did,
 * what a verdict recorded.
 */
import type { UpdateReport } from "@cawco/core";
import type { DesignWritten } from "../design-system";
import { lines, listed } from "./words";

/** `update_machines`: the build found, then each machine's install. */
export const machinesUpdatedWords = (updated: {
  found: { channel?: string; notes?: string; version: string };
  updates?: (
    { machine: string; report: unknown } | { error: string; machine: string }
  )[];
}): string =>
  lines(
    `The newest build is ${updated.found.version}${updated.found.channel ? ` on ${updated.found.channel}` : ""}.`,
    updated.updates === undefined
      ? "Every machine was told; nothing was installed."
      : updated.updates.map((one) => {
          if ("error" in one) {
            return `- ${one.machine}: not installed, ${one.error}`;
          }
          const report = one.report as UpdateReport;
          return `- ${one.machine}: ${report.installed ? "installed" : "not installed"}${report.restarted.length > 0 ? `, restarted ${listed(report.restarted)}` : ""}${report.skipped ? `; ${report.skipped}` : ""}`;
        })
  );

/** `design_write`: what it wrote, kept and still misses, or the proposal it parked. */
export const designWrittenWords = (
  written:
    DesignWritten | { files: string[]; proposal: string; waiting: string }
): string =>
  "proposal" in written
    ? `Proposed ${listed(written.files)}: ${written.waiting}`
    : lines(
        `Wrote ${listed(written.written) || "nothing"} in ${written.where}.`,
        written.kept.map(
          (one) => `Kept ${one.path} as the person has it: ${one.why}`
        ),
        written.missing.length > 0
          ? `Still missing: ${listed(written.missing)}.`
          : "Nothing the contract asks for is missing."
      );

/** `design_verdict`: what was recorded, and the item it finished. */
export const designVerdictWords = (recorded: {
  finished: string;
  recorded: string;
}): string =>
  `Recorded ${recorded.recorded === "passed" ? "a pass" : "your findings"}. ${recorded.finished}`;
