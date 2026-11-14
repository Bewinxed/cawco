/**
 * THE REFUSED HARNESS. Whether a machine refuses every start of one of its
 * harness CLIs, and why, read off its report (HarnessReport `refused`,
 * `authReason`) and the machine's cell for the harness's tool: the one rule the machine's surfaces (dashboard
 * harness-block.svelte.ts) and the hub's refusal of a start there (hub
 * spawns.ts `placeSpawn`) say it by, so the two say the same sentence. Not
 * installed when the report says so; else the machine's own sentence
 * (Claude Code's version unsaid or too old, an OpenCode or pi at a version
 * CawCo doesn't run), else ours.
 */

import { HARNESS_TOOL, type HarnessReport } from "./harness";
import type { HarnessKind } from "./harness/kinds";
import { traitsOf } from "./harness/traits";
import { type ToolSpec, type ToolStatus, toolRuns, toolSpec } from "./tools";
import { harnessRefusedWords } from "./words/harness";

export type HarnessRefusalKind = "not-installed" | "version";

export interface HarnessRefusal {
  kind: HarnessRefusalKind;
  /** The harness's CLI, as the tool catalog holds it. */
  spec: ToolSpec;
  /** Why, in the machine's own sentence, or ours when it gave none. */
  why: string;
}

/** A harness's catalog entry; every harness has one (core `HARNESS_TOOL`). */
export const harnessSpec = (harness: HarnessKind): ToolSpec => {
  const spec = toolSpec(HARNESS_TOOL[harness]);
  if (!spec) {
    throw new Error(`The tool catalog names no ${harness}`);
  }
  return spec;
};

/**
 * Why `machine` (by its name) refuses every start of the report's harness;
 * undefined when it runs it. An install the machine's tool cell (`tool`)
 * says landed, at a version CawCo runs other than the one the report read
 * (or there, where the report found none), already counts as running: the agent reads that report again as the
 * install ends (daemon.ts `reportTools`), and the gap is not the person's
 * to wait out, nor a start's.
 *
 * The report is the read a start is admitted by, the cell only a later
 * word on it: a cell not read yet (an agent whose tools read has not
 * landed) leaves the report as it stands. Its "not installed" is no
 * unknown: the agent finds a harness's CLI with the lookup its tools row
 * makes (agent tools.ts `toolBinary`; Claude Code's, auth.ts
 * `claudeExecutable`), so the cell, once read, says the same. Unread is the
 * report's own absence (hub placement.ts `unreportedHarnessRefusal`), as a
 * model list's is (model-names.ts `ModelListing`).
 */
export const harnessRefusal = (
  report: Pick<
    HarnessReport,
    "authReason" | "harness" | "installed" | "refused" | "version"
  >,
  machine: string,
  tool?: Pick<ToolStatus, "state" | "version">
): HarnessRefusal | undefined => {
  const kind =
    report.refused ?? (report.installed ? undefined : "not-installed");
  if (!kind) {
    return;
  }
  const spec = harnessSpec(report.harness);
  // Only against a report that said what it found: one still waiting for
  // the version (none said) is no older than the cell, which keeps the
  // last version any read answered, of whatever file was there then.
  const said = kind === "not-installed" || report.version !== undefined;
  if (
    said &&
    tool?.state === "installed" &&
    toolRuns(spec, tool.version) &&
    tool.version !== report.version
  ) {
    return;
  }
  if (kind === "not-installed") {
    return {
      kind,
      spec,
      why: harnessRefusedWords.notInstalled(
        spec.name,
        machine,
        traitsOf(report.harness).requiredOnEveryMachine
      ),
    };
  }
  // The press, whatever the tool: whether the hub updates a copy CawCo
  // doesn't run with no press is the fleet's choice and whose the copy is
  // (core tool-updates.ts), which the machine's tool status says.
  const fix = harnessRefusedWords.pressFix(
    harnessRefusedWords.press(kind, spec.name, spec.exactVersion)
  );
  return {
    kind,
    spec,
    why:
      report.authReason ??
      harnessRefusedWords.notRun(spec.name, report.version, machine, fix),
  };
};
