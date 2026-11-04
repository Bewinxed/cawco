/**
 * THE REFUSED HARNESS. Whether a machine refuses every start of one of its
 * harness CLIs, and why, read off its report alone (HarnessReport
 * `refused`, `authReason`): the one rule the machine's surfaces (dashboard
 * harness-block.svelte.ts) and the hub's refusal of a start there (hub
 * server.ts `placeSpawn`) say it by, so the two say the same sentence. Not
 * installed when the report says so; else the machine's own sentence
 * (Claude Code's version unsaid or too old, an OpenCode or pi at a version
 * CawCo doesn't run), else ours.
 */

import { HARNESS_TOOL, type HarnessKind, type HarnessReport } from "./harness";
import { type ToolSpec, toolSpec } from "./tools";
import { harnessRefusedWords } from "./words/harness";
import { toolWords } from "./words/tools";

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
 * undefined when it runs it.
 */
export const harnessRefusal = (
  report: Pick<
    HarnessReport,
    "authReason" | "harness" | "installed" | "refused" | "version"
  >,
  machine: string
): HarnessRefusal | undefined => {
  const kind =
    report.refused ?? (report.installed ? undefined : "not-installed");
  if (!kind) {
    return;
  }
  const spec = harnessSpec(report.harness);
  if (kind === "not-installed") {
    return {
      kind,
      spec,
      why: harnessRefusedWords.notInstalled(
        spec.name,
        machine,
        report.harness === "claude"
      ),
    };
  }
  // A CLI CawCo keeps at its newest release (core `ToolSpec.release`) is
  // updated with no press.
  const fix = spec.release
    ? `${toolWords.updatesItself(spec.name)}.`
    : harnessRefusedWords.pressFix(
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
