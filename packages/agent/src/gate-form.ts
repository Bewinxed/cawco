/**
 * The form of a harness host's file-tool gate: what a pi host or an OpenCode
 * server judges a workspace session's file tools and path arguments with,
 * fixed when it starts. A pi host runs the judge it imported at start, and
 * an OpenCode server keeps the judge module its bridge plugin first imported
 * (Bun caches it by path until the server ends). So a host started by
 * another build answers to that build's gate until it is relaunched.
 *
 * The form is the boundary's own scheme (an anchor's form, `boundary.ts`):
 * the first 16 hex of a sha256 over what the thing runs. Here that is the
 * judge's source, which carries each harness's table of file tools and path
 * arguments (`workspace-judge.ts`), and for OpenCode the bridge plugin's
 * source as well. Each host records the form it started with; one whose form
 * is not the agent's current one is relaunched onto the current gate the
 * first moment it is idle: a pi host between its session's turns
 * (`BOUNDARY_RELAUNCH`, as a Claude CLI on a hook that fails open is), an
 * OpenCode server through its replacement at rest (its launch carries the
 * form, `GATE_FORM_ENV`).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { embeddedFile, standalone } from "@cawco/core/runtime";

/** The judge's source as this build runs it: from the checkout, or as the binary embedded it (scripts/build-binary.ts). */
const judgeSource = (): string =>
  readFileSync(
    standalone
      ? embeddedFile("boundary/workspace-judge.ts")
      : join(import.meta.dir, "..", "..", "core", "src", "workspace-judge.ts"),
    "utf8"
  );

/**
 * The gate form a host of `harness` started by this build runs. For OpenCode,
 * `plugin` is the bridge plugin's source this agent writes.
 */
export const gateForm = (harness: "opencode" | "pi", plugin = ""): string =>
  createHash("sha256")
    .update([harness, judgeSource(), plugin].join("\0"))
    .digest("hex")
    .slice(0, 16);

/** The environment variable an OpenCode server's launch names its gate form in, so a server of another form fails its launch check. */
export const GATE_FORM_ENV = "CAWCO_GATE_FORM";

/** The gate form an OpenCode server was launched on, read off its launch flags (`launchOf`); "none" for one launched before servers carried it. */
export const launchGateForm = (launch: string | undefined): string => {
  try {
    const entries = JSON.parse(launch ?? "[]") as [string, string][];
    return entries.find(([name]) => name === GATE_FORM_ENV)?.[1] ?? "none";
  } catch {
    return "none";
  }
};
