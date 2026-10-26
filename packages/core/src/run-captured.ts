/**
 * One command run to its end with both of its output streams read whole:
 * the shape every short call (git, systemctl, launchctl, ps, a harness's
 * own CLI) takes before its caller reads the answer its way.
 */

import type { Subprocess } from "bun";
import { hostEnvironment } from "./session-env";

/** A command that ran to its end: its exit code, what it wrote, and the signal that ended it, if one did. */
export interface Ran {
  code: number;
  signalCode: Subprocess["signalCode"];
  stderr: string;
  stdout: string;
}

/** Runs `argv` with no stdin and reads both streams to their end. A `signal` abort kills it with `killSignal`. */
export const runCaptured = async (
  argv: readonly string[],
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    killSignal?: NodeJS.Signals;
    signal?: AbortSignal;
  } = {}
): Promise<Ran> => {
  const child = Bun.spawn([...argv], {
    ...options,
    stdin: "ignore",
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

/** Runs a system tool in the host's environment and the C locale, so the words it prints parse the same on every machine. */
export const runInC = (argv: readonly string[]): Promise<Ran> =>
  runCaptured(argv, { env: { ...hostEnvironment(), LC_ALL: "C" } });
