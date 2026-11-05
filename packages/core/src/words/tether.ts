/** What the tether (core tether.ts) says when it refuses to run its command. */
export const tetherWords = {
  /** Its caller spawned it in a process group not its own (not `detached`): its reader could signal no group of its own. */
  unled: "the tether leads no process group of its own: spawn it detached",
  /** win32: no `sh` to run the tether's shell. */
  noShell: "the tether runs under sh, which Windows does not have",
};
