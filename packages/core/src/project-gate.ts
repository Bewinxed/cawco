/**
 * A project's landing gate as its `gate.md` declares it: the shapes the hub
 * reads the file into (hub gate-file.ts) and Settings draws
 * (`GET /api/projects/:id/gate`).
 */

/** A machine capability a step may need: `apple` a Mac, `linux` a Linux machine (hub runs-on.ts). */
export type RunsOnCapability = "apple" | "linux";

/** A step as the project declares it. */
export interface DeclaredStep {
  command: string;
  /** The paths whose change makes it run; absent: it always runs. */
  inputs?: string[];
  /** What the report calls it. */
  name: string;
  /** The capability of the machine it runs on; absent: the workspace's own. */
  needs?: RunsOnCapability;
  /** A failure leaves the steps after it unrun. */
  stopsRest: boolean;
  /** Seconds before it is killed; the gate's default when absent. */
  timeoutSec?: number;
}

/**
 * A project's gate: `none` with no gate.md; `declared`, its steps (none
 * when its block names none) and its `Caw edits:` globs when it lists them
 * (hub lead-gate.ts); `unreadable`, what is wrong with it.
 */
export type ProjectGate =
  | { kind: "none" }
  | { kind: "declared"; steps: DeclaredStep[]; cawEdits?: string[] }
  | { kind: "unreadable"; problems: string[] };
