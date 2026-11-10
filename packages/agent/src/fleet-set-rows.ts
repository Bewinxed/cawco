/**
 * The rows both fleet set files hold: a hook and a harness config as a
 * session loads them. fleet-harness-set.ts (the fleet's own) and
 * fleet-place-set.ts (a project's placed copies) both read these from here,
 * so neither imports the other's file for them.
 */
import type { HarnessConfigKind } from "@cawco/core/harness-config";
import type { HookEvent, HookHandler, HookMatchTest } from "@cawco/core/hooks";

/** One hook as a session runs it: a command hook's `command` is its script's path on this machine. */
export interface SetHook {
  event: HookEvent;
  handler: HookHandler;
  /** The fleet row's id; a placed copy's is `<id>@<place id>`. */
  id: string;
  matcher?: string;
  name: string;
  /** Its matcher as Claude Code reads it (core `hookMatchTest`), for the harnesses that run it themselves. */
  test: HookMatchTest;
}

/**
 * One Claude Code settings row, OpenCode plugin or pi extension as a
 * session loads it (core harness-config.ts, agent fleet-harness-config.ts).
 */
export interface SetHarnessConfig {
  /** The folder of a project's copy (in its place's file, fleet-place-set.ts); none for the fleet's own. */
  cwd?: string;
  /** An OpenCode plugin's module file; a pi extension's file or package dir. */
  entry?: string;
  kind: HarnessConfigKind;
  name: string;
  /** Claude Code settings. */
  settings?: Record<string, unknown>;
}
