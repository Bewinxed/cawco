import { tetherWords } from "./words/tether";

/** The tether's exit when its caller spawned it in a process group not its own: its command never ran. */
export const TETHER_UNLED = 125;

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
 * /dev/null"); at end of file, the parent gone or done ({@link untether}),
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
{ cat <&3; kill -s TERM -- "-$$"; } >/dev/null 2>&1 &
exec "$@" </dev/null 3<&-`;

/**
 * A shell's arguments that run `argv` under the tether: `sh` and these,
 * spawned `detached` (the leader of a process group of its own) with stdin
 * a pipe the parent holds and never writes. The process spawned runs
 * `argv` itself once the shell has forked the reader.
 */
export const tetherArgs = (argv: readonly string[]): string[] => [
  "-c",
  TETHER,
  "sh",
  ...argv,
];

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
