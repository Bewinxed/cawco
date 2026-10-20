/**
 * What the person reads when a read of a machine got no answer in time: the
 * fleet store's (client.svelte.ts `didntAnswer`) and an artifact tab's, one
 * sentence for both.
 *
 * A machine the hub holds a live link to is online, and a read it was slow
 * to answer says what didn't answer and when it is asked again (WORDS.md's
 * error formula: what happened, what happens next). "It may be offline" is
 * said only of a machine the hub has lost.
 */
export interface MissedRead {
  /** The milliseconds the read waited before it let go. */
  after: number;
  /** When it is asked again, as a sentence: "Try again.", "It's asked again when its turn ends." */
  again: string;
  /** The machine's name, as the person reads it. */
  machine: string;
  /**
   * What didn't answer, as its clause up to "within": "this session didn't
   * report its context". Absent when it is the machine itself.
   */
  missed?: string;
  /** Whether the hub says the machine is online right now: it holds its link. */
  online: boolean;
  /** What is not known because of it: "whether it stopped is not known". */
  outcome?: string;
}

/** {@link MissedRead} said. */
export function unansweredWords(read: MissedRead): string {
  const within = `within ${Math.round(read.after / 1000)} s${read.outcome ? `, so ${read.outcome}` : ""}`;
  if (!read.online) {
    return `${read.machine} didn't answer ${within}. It may be offline.`;
  }
  return read.missed
    ? `${read.machine} is online, but ${read.missed} ${within}. ${read.again}`
    : `${read.machine} is online but didn't answer ${within}. ${read.again}`;
}

/** The {@link MissedRead.again} of a read the person started: it is theirs to ask again. */
export const TRY_AGAIN = "Try again.";
