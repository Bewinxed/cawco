/**
 * The hub's own session tools as an agent reads them (hub-tools.ts): what a
 * build check found and each machine's install, what a design write did,
 * what a verdict recorded.
 */
import type { UpdateReport } from "@cawco/core";
import type { CapabilityCallsReport } from "../capability-calls";
import type { DesignWritten } from "../design-system";
import { ago, count, lines, listed } from "./words";

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

/** `calls_by_role`: the window and what was counted, a line per role and name, then what no session called. */
export const capabilityCallsWords = (
  report: CapabilityCallsReport,
  now = Date.now()
): string => {
  const harnesses = Object.entries(report.sessions).map(
    ([harness, n]) => `${harness} ${n}`
  );
  const counted = harnesses.length
    ? `sessions that called any: ${listed(harnesses)}`
    : "no session called a skill or server";
  return lines(
    `Skills and MCP servers called in ${report.project ? `project ${report.project.name}` : "every project"}, the last ${count(report.days, "day")} (since ${new Date(report.since).toISOString().slice(0, 10)}); ${counted}.`,
    report.rows.length > 0 && "role | kind | name | sessions | last call",
    report.rows.map(
      (row) =>
        `${row.role} | ${row.kind} | ${row.name} | ${row.sessions} | ${ago(row.lastAt, now)}`
    ),
    report.uncalled !== undefined &&
      (report.uncalled.length === 0
        ? "Every skill and server the window's sessions listed was called."
        : lines(
            `Listed by the window's sessions and called by none (${report.uncalled.length}), with the machines that list it, of ${report.machines.length}:`,
            report.uncalled.map(
              (item) =>
                `${item.kind} | ${item.name} | ${item.machines.length === report.machines.length ? "every machine" : listed(item.machines)}`
            )
          ))
  );
};
