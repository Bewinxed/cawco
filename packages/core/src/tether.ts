import { tetherWords } from "./words/tether";
import { systemProgram } from "./workspace-needs";

/** The tether's exit when its caller spawned it in a process group not its own: its command never ran. */
const TETHER_UNLED = 125;

/**
 * A long-lived child that must end with the CawCo process that started it,
 * however that process ends: a SIGKILL, or a SIGTERM left to the kernel
 * (the hub's, lifetime.ts), included, when no JavaScript runs to stop it.
 * The child is spawned as `sh -c TETHER sh <argv…>`, the leader of a
 * process group of its own (`detached`, which is `setsid()`), its stdin the
 * parent's end of a pipe that the parent never writes: the kernel closes it
 * as the parent goes.
 *
 * The shell is the command. It forks a reader, then `exec`s the command in
 * its own place (POSIX `exec`: "Cat the file maggie by replacing the
 * current shell with the cat utility: exec cat maggie"), so the pid the
 * caller spawned and watches runs the command itself: no process stands
 * between the two, and nothing but the command's own end ends what the
 * caller sees. Before, the shell ran the command as a child and waited on
 * it; a SIGKILL of that shell alone left the command running, reparented,
 * still holding the caller's stderr pipe, so the hub never saw its SSH
 * connection end (ssh-reach d, r417).
 *
 * The reader reads the pipe (as fd 3, because dash(1): "If the shell is not
 * interactive, the standard input of an asynchronous command is set to
 * /dev/null") with the shell's own `read`, a built-in, so it runs whatever
 * the caller's PATH holds: a `cat` looked up on the PATH was not found on
 * one without it, and the reader then signalled the group at once, ending
 * the command it guards. `read` "shall return … >1 An error occurred" or
 * end of file as non-zero (POSIX.1-2024 read), which ends its loop. At end
 * of file, the parent gone or done ({@link untether}),
 * it signals the process group the command leads (`kill -- -PGID`), never
 * a pid. The reader is a member of that group, whose lifetime "ends when
 * the last remaining process in the group leaves the group" (POSIX.1-2024
 * §3.283), and "if there exists a process group whose process group ID is
 * equal to that process ID, the process ID shall not be reused by the
 * system until the process group lifetime ends" (§4.17, Process ID Reuse,
 * pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html). So
 * while the reader waits, the command's pid is handed to no other process,
 * even once the command has ended and been reaped; its signal reaches the
 * command, what the command started in the group, and the reader itself.
 * A signal to a pid (`kill "$$"`) could reach a process that took it after
 * its own had been reaped.
 *
 * Hence the group of its own: a shell that leads no group finds no group
 * by its pid (`kill -s 0 -- -$$` fails) and refuses to start, exit
 * {@link TETHER_UNLED}, before its command runs. A command that leaves the
 * group (`setsid`) is past the reader's reach.
 *
 * Not `setpriv --pdeathsig`: PR_SET_PDEATHSIG(2const) "will be sent when
 * that thread terminates …, rather than after all of the threads in the
 * parent process terminate", the thread that forked the child, which the
 * runtime chooses and does not promise to be its main one; and macOS has
 * none.
 */
const TETHER = `kill -s 0 -- "-$$" 2>/dev/null || {
  echo '${tetherWords.unled.replaceAll("'", "'\\''")}' >&2
  exit ${TETHER_UNLED}
}
exec 3<&0
{ while read -r _; do :; done <&3; kill -s TERM -- "-$$"; } >/dev/null 2>&1 &
exec "$@" </dev/null 3<&-`;

/**
 * Spawns `argv` under the tether, the one way CawCo starts one: `sh -c
 * TETHER sh <argv…>`, always `detached` (the leader of a process group of
 * its own), its stdin a pipe the caller holds and never writes: Bun's own
 * (`"pipe"`), or the read end of one whose writer the caller keeps (a FIFO,
 * as fd). Nothing else may be set for stdin or the group, so no caller can
 * start one that the tether refuses ({@link TETHER_UNLED}). The process
 * spawned runs `argv` itself once the shell has forked the reader; once it
 * has ended, the caller lets the reader go with {@link untether}.
 *
 * POSIX only. On win32 there is no `sh` to run the tether (its path,
 * workspace-needs.ts, is `/bin/sh`), so it throws before spawning
 * anything, as `Bun.spawn` throws for a program that is missing: the
 * caller's own handling of a spawn that fails is what runs.
 */
export const spawnTethered = <
  const In extends "pipe" | number = "pipe",
  const Out extends Bun.SpawnOptions.Readable = "pipe",
  const Err extends Bun.SpawnOptions.Readable = "inherit",
>(
  argv: readonly string[],
  options: Omit<
    Bun.SpawnOptions.SpawnOptions<In, Out, Err>,
    "stdin" | "stdio" | "detached" | "env"
  > & {
    /** Named, never left to Bun: its default is the environment this process started with (oven-sh/bun#40846). */
    env: Record<string, string | undefined>;
    stdin?: In;
  }
): Bun.Subprocess<In, Out, Err> => {
  if (process.platform === "win32") {
    throw new Error(tetherWords.noShell);
  }
  return Bun.spawn([systemProgram("sh"), "-c", TETHER, "sh", ...argv], {
    ...options,
    env: options.env,
    stdin: options.stdin ?? ("pipe" as In),
    detached: true,
  });
};

/**
 * A read of a program that must end with this process, as
 * {@link spawnTethered} starts it, with `signal` ending it sooner: its
 * stdin is the tether's pipe, which the caller lets go with
 * {@link untether} once it has ended. On win32, which has no `sh` to run
 * the tether, a plain child with a pipe of its own for stdin: it ends with
 * `signal`, and outlives a process killed outright.
 */
export const spawnRead = <const Err extends "pipe" | "ignore">(
  argv: readonly string[],
  options: {
    env: Record<string, string | undefined>;
    signal?: AbortSignal;
    stderr: Err;
  }
): Bun.Subprocess<"pipe", "pipe", Err> =>
  process.platform === "win32"
    ? Bun.spawn([...argv], {
        env: options.env,
        stdin: "pipe",
        stdout: "pipe",
        stderr: options.stderr,
        ...(options.signal ? { signal: options.signal } : {}),
      })
    : spawnTethered(argv, {
        env: options.env,
        stdout: "pipe",
        stderr: options.stderr,
        ...(options.signal ? { signal: options.signal } : {}),
      });

/**
 * Lets the tether's reader go once its command has ended on its own: the
 * pipe's end, which also ends the command when it still runs. A pipe
 * already closed is nothing.
 */
export const untether = (stdin: { end: () => unknown }): void => {
  try {
    const ended = stdin.end();
    if (ended instanceof Promise) {
      ended.catch(() => undefined);
    }
  } catch {
    // Its reader is gone already: nothing holds the pipe.
  }
};
