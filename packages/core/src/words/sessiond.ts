/** What the session daemon says when a process is gone or can't start. */

/**
 * The `reason` a `write`, `signal` or `stdin_end` naming a child the keeper
 * holds no live process for is refused with: `<verb>: <procId> is not
 * alive`. A keeper already running answers in these same words.
 */
export const notAliveReason = (verb: string, procId: string): string =>
  `${verb}: ${procId} is not alive`;

/** What a person reads for a session the keeper refused at the process limit. */
export const processLimitSentence = (
  machine: string,
  session: string
): string =>
  `${machine} can't start another process right now (its process limit is reached), so ${session} didn't start.`;
