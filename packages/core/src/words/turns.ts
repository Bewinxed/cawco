/**
 * What the agent's log says of a session's turn and its process when CawCo
 * would replace or take that process (agent session.ts `#turnEnded`, its
 * custody attach): a turn is never cut for a start again, and the log says
 * the start waited. Written to the machine's log only: no screen draws it,
 * so it is not written into the app (scripts/words-swift.ts).
 */
export const turnWords = {
  /** A start that replaces the process waits for the turn running in it. */
  relaunchWaits: (instanceId: string) =>
    `[session] ${instanceId}: started again once its turn ends, as a turn is never cut for a start again`,
  /** The opening of the line said once that turn has ended and the start goes. */
  turnEndedOpening: (instanceId: string) =>
    `[session] ${instanceId}: its turn ended`,
  /** That turn ended `seconds` after the start asked, and the start goes now. */
  turnEnded: (instanceId: string, seconds: number) =>
    `${turnWords.turnEndedOpening(instanceId)} ${seconds} s on; it is started again now`,
  /** A restarted agent's custody took a live process back, its turn running on. */
  attached: (instanceId: string) =>
    `[custody] ${instanceId}: attached to its live process`,
};
