/**
 * What the hub holds in memory about each session, not in any column: one place
 * for the stores and for forgetting them when a session's row goes
 * ({@link createSessionRuntime}).
 */
import type { SessionPulse } from "@cawco/core/protocol";

export const createSessionRuntime = () => {
  /**
   * What each session is doing right now, as its own daemon last said: memory
   * only, and never a column.
   *
   * A pulse is the daemon's first-hand reading of a live process — working,
   * blocked, idle — and it is worth exactly as long as the process it describes.
   * Persisting it would recreate the defect this whole build exists to close in
   * a second column, so it lives here, keyed by instance, and is dropped the
   * moment the row it belongs to settles or is discarded. A dashboard opening
   * cold gets the map in its first `instances` frame, which is the difference
   * between a rail that knows what is working on connect and one that has to
   * wait for the next pulse to arrive.
   */
  const pulses = new Map<string, SessionPulse>();
  const heldSessions = new Map<
    string,
    { machineId: string; since: number; reason: string }
  >();

  /**
   * When each session's activity was last written down, so the column that says
   * it is not rewritten on every pulse. The pulse itself is throttled to one a
   * second per session on the daemon side; a row does not need a write that
   * often, and a rail cannot see the difference.
   */
  const touched = new Map<string, number>();
  /**
   * The tokens each Claude session's latest top-level request sent (its
   * uncached input plus cache reads and writes), by session: its context as
   * it stood, taken at its turn's result (keep-alive.ts `keepAliveResult`).
   */
  const lastRequestContext = new Map<string, number>();
  /**
   * Sessions whose turn in flight died on their account's credential and
   * whose end is the at-limit controller's to answer, not a failed turn to
   * hand back (`takeCredentialTurn`): a refusal it moves the session
   * off.
   */
  const credentialTurns = new Set<string>();

  /**
   * Sessions this hub started fresh, with no title, and has not yet heard a
   * word from. A title derived from a live turn is only the session's *first*
   * message while this holds the id — a resumed session's next turn is somewhere in the middle of
   * a conversation, and naming the row after it would be a wrong name that then
   * outranks the transcript's own. Those get named from the transcript instead,
   * where the first message is unambiguous.
   */
  const awaitingFirstTurn = new Set<string>();

  /** What the hub forgets of a session's row when it goes away (`forgetInstances`). */
  const forget = (instanceId: string): void => {
    pulses.delete(instanceId);
    touched.delete(instanceId);
  };

  return {
    forget,
    pulses,
    heldSessions,
    touched,
    lastRequestContext,
    credentialTurns,
    awaitingFirstTurn,
  };
};
