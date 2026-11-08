/** What a session's row says when its daemon or server went away under it. */

/** What the hub records on a session whose daemon restarted out from under it, with nothing to go back to. */
export const RESTART_LOST =
  "The agent restarted, and this session left nothing to resume from.";

/**
 * The error an OpenCode session's turn ends with when the server it ran in
 * stopped before finishing it, read back on reattach from the reply the
 * server kept unfinished. The turn did not end: it was cut, and the hub hands
 * it back to the session once.
 */
export const SERVER_STOPPED_MID_TURN =
  "The opencode server stopped before this turn finished; its reply is incomplete.";
