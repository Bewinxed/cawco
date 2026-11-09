/**
 * Which claude sessions were launched with the workspace's hook, as their
 * command lines and settings show.
 */

import { accessSync, constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { commandLine as commandLineOf } from "@cawco/core/process-identity";
import { z } from "zod";
import { HOOK_TIMEOUT_S, perl } from "./hook-judge";
import type { Boundary } from "./state";

/**
 * The tools the boundary hook runs on (a JavaScript regular expression,
 * code.claude.com/docs/en/hooks#matcher-patterns: "Contains any other
 * character | JavaScript regular expression, unanchored"). The shell tools,
 * which it lets through only while the CLI runs them through the workspace's
 * shell prefix, and PowerShell, which it refuses; and every tool that names
 * a local path, which it judges by the
 * workspace's policy: the file tools, LSP, Artifact and SendUserFile (which
 * send a file out), EnterWorktree, and every MCP tool, whose arguments the
 * judge reads for paths. Claude Code runs those in the CLI, on the host. No
 * other tool takes a path (code.claude.com/docs/en/tools-reference), and the
 * hook and its judge run on none of them. A hook's deny holds in every
 * permission mode ("a hook deny applies even in bypassPermissions mode",
 * code.claude.com/docs/en/agent-sdk/permissions).
 */
const HOOKED_TOOLS =
  "^(Bash|Monitor|PowerShell|Read|Write|Edit|MultiEdit|NotebookEdit|NotebookRead|Glob|Grep|LS|LSP|Artifact|SendUserFile|EnterWorktree|mcp__.*)$";

/** The hook's arguments before its script: perl's taint mode, which the script's own `#!` line names too. */
const HOOK_ARGS = ["-T"];

/**
 * The `query()` options that bound a claude session, none for a session with
 * no boundary: flag settings with a PreToolUse hook on {@link HOOKED_TOOLS},
 * and the hook events in the stream, which is how the session hears that the
 * hook failed. The CLI runs the hook itself, so it holds while the agent that
 * started the session restarts; a local settings file cannot turn it off,
 * because flag settings outrank it. The adapter merges these settings with
 * the ones every session carries into the CLI's one `--settings`.
 *
 * The hook runs in exec form, `perl -T <hook>`: "A command hook runs as exec
 * form when `args` is set … Claude Code resolves `command` as an executable
 * on `PATH` and spawns it directly", and "exec-form hooks run without the
 * prefix" (code.claude.com/docs/en/hooks, /env-vars), so the judge never runs
 * inside the boundary it decides about. `onFailure: "block"` refuses the call
 * on any failure of the hook, a script gone ("Can't open perl script", exit
 * 2) or a perl gone (it cannot start) among them: "To block the action
 * instead, set `"onFailure": "block"`" (/hooks, "Block the action when a
 * hook fails").
 */
export const claudeBoundaryOptions = (boundary: Boundary | undefined) =>
  boundary
    ? {
        includeHookEvents: true,
        settings: {
          disableAllHooks: false,
          hooks: {
            PreToolUse: [
              {
                matcher: HOOKED_TOOLS,
                hooks: [
                  {
                    type: "command" as const,
                    command: perl(),
                    args: [...HOOK_ARGS, boundary.hook],
                    onFailure: "block" as const,
                    timeout: HOOK_TIMEOUT_S,
                  },
                ],
              },
            ],
          },
        },
      }
    : {};

/** The matchers the hook has been launched on that judge the file tools: every tool, as builds before this one wrote it, and {@link HOOKED_TOOLS}. */
const GATING_MATCHERS = new Set(["*", HOOKED_TOOLS]);

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/** A JSON string, as it stands in the `--settings` JSON. */
const JSON_STRING = String.raw`"(?:[^"\\]|\\.)*"`;

/**
 * The boundary hook's entry in the `--settings` JSON {@link claudeBoundaryOptions}
 * launches a CLI with: its matcher — {@link HOOKED_TOOLS}, `*` or `Bash|Monitor`
 * as earlier builds wrote it — its command, still JSON-quoted, and its
 * exec form's `args`, when it has them.
 */
const LAUNCHED_HOOK = new RegExp(
  `"matcher":"(${escapeRegExp(HOOKED_TOOLS)}|\\*|Bash\\|Monitor)","hooks":\\[\\{"type":"command","command":(${JSON_STRING})(?:,"args":(\\[(?:${JSON_STRING}(?:,${JSON_STRING})*)?\\]))?`,
  "u"
);

/** The shell form before the exec form: `'<hook>' || exit 2`. */
const HOOK_COMMAND = /^'([^']+\/hook)' \|\| exit 2$/u;

/** One word of a command {@link shellQuote} built: `'…'`, with `'\''` for a quote. */
const QUOTED_WORD = /'((?:[^']|'\\'')*)'/gu;

const HOOK_EVENTS_FLAG = /(^| )--include-hook-events( |$)/u;

const QUOTED_WORDS = /^(?:'(?:[^']|'\\'')*' ?)+$/u;

/** A boundary hook a claude CLI was launched with ({@link launchedHook}). */
export interface LaunchedHook {
  /**
   * Whether the CLI reports its hooks in its stream (`--include-hook-events`).
   * One launched before cawco asked for that says a hook failed only in its
   * transcript, as a `hook_non_blocking_error` record.
   */
  readonly events: boolean;
  /**
   * Whether the hook judges the CLI's file tools and MCP calls
   * ({@link GATING_MATCHERS}). One launched on `Bash|Monitor` alone leaves
   * them unjudged: such a CLI is relaunched onto the hook that judges them
   * ({@link hookFailsOpen}).
   */
  readonly gatesFiles: boolean;
  /** What names the hook when it fails: in its own words, or the shell's when what it runs is gone. */
  readonly names: readonly string[];
  /**
   * What the hook runs, each checked as the CLI would use it, when its
   * failing lets a command through. The workspace's {@link hookScript}
   * refuses on any failure and needs none. The form before it — cawco's own
   * binary, by the version that launched the CLI, then `boundary-hook` —
   * fails open with whatever it names gone.
   */
  readonly needs: readonly { readonly path: string; readonly mode: number }[];
  /**
   * Whether the CLI runs its shell commands through the workspace's shell
   * prefix ({@link claudePrefixScript}): one launched with the exec-form hook
   * was launched with the prefix too (claude.ts `sessionEnv`). One launched
   * before either has its shell calls rewritten through the executor as its
   * build did (the judge tells it by its environment naming no prefix), and
   * is relaunched as its turn ends ({@link hookFailsOpen}).
   */
  readonly prefixed: boolean;
}

/**
 * The boundary hook the claude CLI `pid` was launched with, read off its
 * command line (the `--settings` JSON {@link claudeBoundaryOptions} wrote);
 * nothing for a CLI launched without one, and `unknown` for one whose hook
 * is in no form cawco has written.
 */
export const launchedHook = async (
  pid: number
): Promise<LaunchedHook | "unknown" | undefined> => {
  const commandLine =
    process.platform === "linux"
      ? (await readFile(`/proc/${pid}/cmdline`, "utf8")).replaceAll("\0", " ")
      : ((await commandLineOf(pid)) ?? "");
  const [, matcher, quoted, quotedArgs] = LAUNCHED_HOOK.exec(commandLine) ?? [];
  if (!quoted) {
    return;
  }
  const events = HOOK_EVENTS_FLAG.test(commandLine);
  const gatesFiles = GATING_MATCHERS.has(matcher as string);
  const command = z.string().parse(JSON.parse(quoted));
  if (quotedArgs) {
    const args = z.array(z.string()).parse(JSON.parse(quotedArgs));
    const hook = args.at(-1);
    return command === perl() &&
      args.length === HOOK_ARGS.length + 1 &&
      HOOK_ARGS.every((arg, at) => args[at] === arg) &&
      hook?.endsWith("/hook")
      ? { events, gatesFiles, names: [hook], needs: [], prefixed: true }
      : "unknown";
  }
  const hook = HOOK_COMMAND.exec(command)?.[1];
  if (hook) {
    return { events, gatesFiles, names: [hook], needs: [], prefixed: false };
  }
  const words = QUOTED_WORDS.test(command)
    ? [...command.matchAll(QUOTED_WORD)].map(([, word]) =>
        (word as string).replaceAll("'\\''", "'")
      )
    : [];
  const [binary, verb] = words;
  if (
    !binary ||
    words.length !== 4 ||
    !(verb === "boundary-hook" || verb?.endsWith("/boundary-hook.ts"))
  ) {
    return "unknown";
  }
  return {
    events,
    gatesFiles,
    names: [binary, verb],
    needs: [
      { path: binary, mode: constants.X_OK },
      ...(verb === "boundary-hook"
        ? []
        : [{ path: verb, mode: constants.R_OK }]),
    ],
    prefixed: false,
  };
};

/** The hook a session launched with a workspace boundary runs: its script, which needs nothing, beside the workspace's shell prefix. */
export const workspaceHook = (
  boundary: Boundary | undefined
): LaunchedHook | undefined =>
  boundary
    ? {
        events: true,
        gatesFiles: true,
        names: [boundary.hook],
        needs: [],
        prefixed: true,
      }
    : undefined;

/**
 * Whether a CLI running `hook` lets a call outside the workspace's policy or
 * its rules: its hook runs what can go missing ({@link LaunchedHook.needs}),
 * it runs on shell tools alone ({@link LaunchedHook.gatesFiles}), or the CLI
 * runs its shell commands through no shell prefix of the workspace's
 * ({@link LaunchedHook.prefixed}), so its shell calls meet its permission
 * rules as the judge rewrote them, not as the model wrote them. Such a CLI
 * is relaunched onto the workspace's hook and prefix between turns.
 */
export const hookFailsOpen = (hook: LaunchedHook): boolean =>
  hook.needs.length > 0 || !hook.gatesFiles || !hook.prefixed;

/** The first thing `hook` needs that is no longer there to run, if any. */
export const hookMissing = (hook: LaunchedHook): string | undefined =>
  hook.needs.find(({ path, mode }) => {
    try {
      accessSync(path, mode);
      return false;
    } catch {
      return true;
    }
  })?.path;
