/**
 * A fleet hook's script as the shell its shebang names reads it: the one
 * parse check the hub runs before it keeps a hook (hub
 * routes/fleet-hooks.ts) and every machine runs before it installs one
 * (agent fleet.ts `settleHooks`), so the hub refuses what every machine
 * would. It sits beside hooks.ts's `hookProblem` rather than in it: that
 * module is read in the browser too, and this one starts a process.
 *
 * Where the shell is missing (a hub or machine with no `bash` on its PATH)
 * the check answers that it could not run, and that answer refuses the
 * script as a parse error does: a script nobody could parse is never kept or
 * installed, and a machine without the shell could not run it anyway.
 */
import { basename } from "node:path";
import { QUIET_MS } from "./bounded";
import { runLive } from "./run-captured";
import { secondsOf } from "./time";
import { unhandled } from "./unhandled";
import {
  shellCheckEnded,
  shellCheckExited,
  shellCheckMissing,
  shellCheckTimedOut,
} from "./words/hooks";

/** The shells a script can be checked with, by `<shell> -n`. */
type HookShell = "bash" | "sh";

/** The exit a POSIX shell gives a command it cannot find (POSIX "Command Search and Execution": 127). */
const COMMAND_NOT_FOUND = 127;

const WHITESPACE = /\s+/u;

/**
 * The shell a script's shebang runs it with, when that shell is one `-n` can
 * check. No shebang is `sh`: Claude Code spawns the command through a shell,
 * and a file with no `#!` that the kernel refuses (ENOEXEC) is run by that
 * shell as an `sh` script. Any other interpreter is not checked.
 */
const shellOf = (script: string): HookShell | undefined => {
  const first = script.split("\n", 1)[0] ?? "";
  if (!first.startsWith("#!")) {
    return "sh";
  }
  const words = first.slice(2).trim().split(WHITESPACE);
  const program =
    basename(words[0] ?? "") === "env"
      ? words.slice(1).find((word) => !word.startsWith("-"))
      : words[0];
  const name = basename(program ?? "");
  return name === "bash" || name === "sh" ? name : undefined;
};

/** Why a script does not parse: the shell that read it, and its error line. */
export interface ScriptParseError {
  /** The parser's first error line, or why the parse could not finish. */
  said: string;
  shell: HookShell;
}

/**
 * Why a shell script does not parse, undefined when it does or is not a
 * shell script. A hook runs before every matching tool call on the machine,
 * so one that cannot parse locks every session out; it is never registered.
 * `env`: the environment the shell runs with, its PATH the one the shell is
 * found on.
 */
export const scriptParseError = async (
  script: string,
  env: Record<string, string | undefined>
): Promise<ScriptParseError | undefined> => {
  const shell = shellOf(script);
  if (!shell) {
    return undefined;
  }
  // A parse of a hook script is milliseconds; one that goes quiet is not
  // a script worth registering (core run-captured.ts `runLive`).
  const parsed = await runLive([shell, "-n"], { env, input: script });
  switch (parsed.kind) {
    case "answered": {
      const { code, signalCode, stderr } = parsed.value;
      if (signalCode) {
        return { shell, said: shellCheckEnded(shell, String(signalCode)) };
      }
      if (code === 0) {
        return undefined;
      }
      // The shell's own exit for a program it could not find.
      if (code === COMMAND_NOT_FOUND) {
        return { shell, said: shellCheckMissing(shell) };
      }
      return {
        shell,
        said:
          stderr
            .split("\n")
            .find((line) => line.trim() !== "")
            ?.trim() ?? shellCheckExited(shell, code),
      };
    }
    case "unanswered":
      // Not known to parse: never registered on a parse nobody finished.
      return {
        shell,
        said: shellCheckTimedOut(shell, secondsOf(QUIET_MS)),
      };
    default:
      unhandled("read", parsed);
  }
};
