/**
 * The recording tags of house/limit-has-a-reason (limit-has-a-reason.ts):
 * `@limit recording: <metric> until <YYYY-MM-DD>` stands for a bound whose
 * value waits on readings the code is taking now. It stands only while its
 * metric is passed, as a string literal, to `recordLimitReading` (core
 * limit-readings.ts) somewhere in the repository, and only until its date.
 *
 * Read by the rule, for the metrics recorded and today's date, and by
 * scripts/check.ts, which lints every file whose recording tag no longer
 * stands however little the change reached, so a date that passed fails the
 * check on the day it passes.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A recording tag: its metric and its date. */
export const RECORDING =
  /@limit\s+recording:\s*(\S+)\s+until\s+(\d{4}-\d{2}-\d{2})\b/u;
/** A call that records a metric, its name a string literal. */
const RECORDED = /\brecordLimitReading\(\s*(["'`])([^"'`\s]+)\1/gu;
/** Where the rule reads: the folders golar.config.ts lints. */
const ROOTS = ["packages", "apps", "scripts"];

/** Today, as a tag's date reads: the UTC day. */
const today = (): string => new Date().toISOString().slice(0, 10);

/** The paths under {@link ROOTS} whose text holds `needle`, tracked or not yet. */
const filesHolding = (root: string, needle: string): string[] => {
  try {
    return execFileSync(
      "git",
      ["grep", "-l", "-I", "-F", "--untracked", needle, "--", ...ROOTS],
      { cwd: root, encoding: "utf8" }
    )
      .split("\n")
      .filter(Boolean);
  } catch {
    // git grep exits 1 when nothing holds it.
    return [];
  }
};

/** Every metric a `recordLimitReading("…", …)` call in the repository names. */
export const recordedMetrics = (root: string): Set<string> =>
  new Set(
    filesHolding(root, "recordLimitReading(").flatMap((path) =>
      [...readFileSync(join(root, path), "utf8").matchAll(RECORDED)].map(
        (match) => match[2] ?? ""
      )
    )
  );

/** Why a recording tag no longer stands, or undefined while it does. */
export const recordingFails = (
  metric: string,
  until: string,
  recorded: ReadonlySet<string>,
  on: string = today()
): string | undefined => {
  if (!recorded.has(metric)) {
    return `its metric ${metric} is recorded nowhere: no recordLimitReading("${metric}", …) call names it`;
  }
  return until < on
    ? `its recording ended on ${until}; set the value from the readings (GET /api/limit-readings)`
    : undefined;
};

/** The files holding a recording tag that no longer stands: the check lints each of them. */
export const failingRecordings = (root: string): string[] => {
  const recorded = recordedMetrics(root);
  const on = today();
  return filesHolding(root, "@limit recording:").filter((path) =>
    readFileSync(join(root, path), "utf8")
      .split("\n")
      .some((line) => {
        const match = RECORDING.exec(line);
        return (
          match !== null &&
          recordingFails(match[1] ?? "", match[2] ?? "", recorded, on) !==
            undefined
        );
      })
  );
};
