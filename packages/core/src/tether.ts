/**
 * A long-lived child that must end with the CawCo process that started it,
 * however that process ends: a SIGKILL, or a SIGTERM left to the kernel
 * (the hub's, lifetime.ts), included, when no JavaScript runs to stop it.
 * The child runs under a shell, `sh -c TETHER sh <argv…>`, whose stdin is
 * the parent's end of a pipe that the parent never writes: the kernel
 * closes it as the parent goes, and the shell then ends the child.
 *
 * The shell starts the command in the background (its stdin /dev/null)
 * and hands it its stdout and stderr alone (`exec … >/dev/null 2>&1`), so
 * a pipe the parent reads from them closes when the command exits. A
 * background reader (`cat`) reads the shell's stdin, as fd 3 because
 * dash(1): "If the shell is not interactive, the standard input of an
 * asynchronous command is set to /dev/null"; at end of file it signals the
 * shell (`$$`, POSIX: "In a subshell, $$ shall expand to the same value as
 * that of the current shell"), whose trap ends the command. The shell
 * waits on the command, so the tether exits with the command's own status
 * when the command ends first; the parent then ends the pipe
 * ({@link untether}) so the reader goes too. A signal to the shell ends the
 * command at once: POSIX `wait`: "When the shell is waiting, by means of
 * the wait utility, for asynchronous commands to complete, the reception of
 * a signal for which a trap has been set shall cause the wait utility to
 * return immediately with an exit status >128, immediately after which the
 * trap associated with that signal shall be taken"
 * (pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html §2.12).
 *
 * Not `setpriv --pdeathsig`: PR_SET_PDEATHSIG(2const) "will be sent when
 * that thread terminates …, rather than after all of the threads in the
 * parent process terminate", the thread that forked the child, which the
 * runtime chooses and does not promise to be its main one; and macOS has
 * none.
 */
const TETHER = `trap 'kill "$command" "$reader" 2>/dev/null; exit 143' HUP INT TERM
"$@" </dev/null & command=$!
exec 3<&0 </dev/null >/dev/null 2>&1
{ cat <&3; kill "$$"; } & reader=$!
exec 3<&-
wait "$command"; code=$?
kill "$reader" 2>/dev/null
exit "$code"`;

/**
 * A shell's arguments that run `argv` under the tether: `sh` and these,
 * spawned with stdin a pipe the parent holds and never writes.
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
