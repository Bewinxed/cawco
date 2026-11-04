/**
 * One command run to its end with both of its output streams read whole:
 * the shape every short call (git, systemctl, launchctl, ps, a harness's
 * own CLI) takes before its caller reads the answer its way.
 */

import type { Subprocess } from "bun";
import { readWithin } from "./bounded";
import { hostEnvironment } from "./session-env";
import { unhandled } from "./unhandled";
import { updatesWords } from "./words/updates";

/** A command that ran to its end: its exit code, what it wrote, and the signal that ended it, if one did. */
export interface Ran {
  code: number;
  signalCode: Subprocess["signalCode"];
  stderr: string;
  stdout: string;
}

/**
 * Runs `argv` with `env`, `input` its stdin, and reads both streams to their
 * end. A `signal` abort kills it with `killSignal`. `env` is the caller's to
 * name: a Bun spawn without one gets the environment its process started
 * with (scripts/lint/spawn-names-env.grit).
 */
export const runCaptured = async (
  argv: readonly string[],
  options: {
    cwd?: string;
    env: Record<string, string | undefined>;
    /** What it reads on stdin; none, it reads nothing. */
    input?: string;
    killSignal?: NodeJS.Signals;
    signal?: AbortSignal;
  }
): Promise<Ran> => {
  const { input, env, ...spawned } = options;
  const child = Bun.spawn([...argv], {
    ...spawned,
    env,
    stdin: input === undefined ? "ignore" : Buffer.from(input),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, signalCode: child.signalCode, stdout, stderr };
};

/**
 * How long a system tool is given to end: 120 s. The longest one waits by
 * design is a `systemctl --user start|stop` on its job, which systemd ends
 * at the unit's start or stop timeout (SIGKILL on a stop); no CawCo unit
 * sets one, so it is the user manager's default, 90 s
 * (https://www.freedesktop.org/software/systemd/man/latest/systemd-system.conf.html:
 * "DefaultTimeoutStartSec= and DefaultTimeoutStopSec= default to 90 s in the
 * system manager and 90 s in the user manager"). Every other call (launchctl
 * bootstrap, bootout, kickstart, list; systemd-run; lsof; a 3 s sample)
 * answers well inside it. The update helper's own service calls take the
 * same bound (cli binary-apply.ts `SERVICE_TIMEOUT_MS`).
 */
const SYSTEM_TOOL_MS = 120_000;

/**
 * A command as a failure names it: every argument but those that set a value
 * (`--setenv=KEY=value`, `--unit=…`), so what it was handed (an environment's
 * secrets among it) never reaches a log or a machine's row.
 */
const named = (argv: readonly string[]): string =>
  argv.filter((arg) => !arg.includes("=")).join(" ");

/**
 * Runs a system tool in the host's environment and the C locale, so the words
 * it prints parse the same on every machine, given {@link SYSTEM_TOOL_MS} to
 * end. One that has not is stopped, and the call throws naming it: a service
 * manager that does not answer never holds its caller (an update helper's
 * launch, a keeper's handover) for good.
 */
export const runInC = async (argv: readonly string[]): Promise<Ran> => {
  const ran = await readWithin(SYSTEM_TOOL_MS, (signal) =>
    runCaptured(argv, { env: { ...hostEnvironment(), LC_ALL: "C" }, signal })
  );
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      throw new Error(
        updatesWords.didNotEnd(named(argv), Math.round(ran.after / 1000))
      );
    default:
      unhandled("read", ran);
  }
};
