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
import { readWithin } from "./bounded";
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

/** How long one `<shell> -n` gets. Our choice: a parse of a hook script is
 * milliseconds, and one that hangs is not a script worth registering. */
const PARSE_TIMEOUT_MS = 5000;

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
  const parsed = await readWithin(PARSE_TIMEOUT_MS, async (signal) => {
    // Bun throws as it spawns a program that is not on the PATH.
    const spawn = () => {
      try {
        return Bun.spawn([shell, "-n"], {
          env,
          stdin: new TextEncoder().encode(script),
          stdout: "ignore",
          stderr: "pipe",
          signal,
        });
      } catch (error) {
        return error instanceof Error ? error : new Error(String(error));
      }
    };
    const child = spawn();
    if (child instanceof Error) {
      return shellCheckMissing(shell);
    }
    const stderr = await new Response(child.stderr).text();
    const code = await child.exited;
    if (child.signalCode) {
      return shellCheckEnded(shell, String(child.signalCode));
    }
    if (code === 0) {
      return;
    }
    return (
      stderr
        .split("\n")
        .find((line) => line.trim() !== "")
        ?.trim() ?? shellCheckExited(shell, code)
    );
  });
  switch (parsed.kind) {
    case "answered":
      return parsed.value === undefined
        ? undefined
        : { shell, said: parsed.value };
    case "unanswered":
      // Not known to parse: never registered on a parse nobody finished.
      return {
        shell,
        said: shellCheckTimedOut(shell, secondsOf(PARSE_TIMEOUT_MS)),
      };
    default:
      unhandled("read", parsed);
  }
};
