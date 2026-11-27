/**
 * What the agent says of an OpenCode server it waited on and let go: one
 * that went quiet (no line, no byte, no work for the fleet's quiet spell,
 * core bounded.ts `QUIET_MS`) or one that exited first. Read in a session's
 * start failure and in the agent's log.
 */

/** CawCo's plugin never reached a location's list as active. */
export const pluginNotLoadedSentence = (
  directory: string,
  pluginId: string,
  quietFor: number,
  exited: boolean
): string =>
  exited
    ? `OpenCode at ${directory} exited before it loaded CawCo's plugin (${pluginId}), so it takes no session: its workspace judge, credential stamp and bounded shell would not run.`
    : `OpenCode at ${directory} went quiet for ${quietFor} s without loading CawCo's plugin (${pluginId}), so it takes no session: its workspace judge, credential stamp and bounded shell would not run.`;

/** A new server never said where it listens. */
export const serverNotAnnouncedSentence = (
  procId: string,
  quietFor: number
): string =>
  `[opencode] ${procId} went quiet for ${quietFor} s without saying where it listens`;

/** A fleet report's wait on the machine's server: no apply of the config just written began. */
export const configNotAppliedSentence = (quietFor: number): string =>
  `OpenCode had not begun loading its new config ${quietFor} s after it was written.`;
