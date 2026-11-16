/**
 * What a session's record says of the notices owed to it that ended
 * undelivered (hub owed-ends.ts `owedNoticeEnd`): each failed notice's
 * reason, and the one line its transcript keeps for every look that ended
 * some (core harness.ts `NOTICES_ENDED`).
 */

/** Why a notice owed to a session ended undelivered: the session never runs again, or it waited past the bound. */
export type UnsentWhy = "ended" | "waited";

/** "1 notice", "3 notices". */
const noticesCount = (count: number): string =>
  count === 1 ? "1 notice" : `${count} notices`;

export const unsentWords = {
  /** The kind the transcript's line is drawn under. */
  noteKind: "Notices",
  /** A failed notice's reason, on its own row. */
  reason: (why: UnsentWhy, days: number): string =>
    why === "ended"
      ? "Not delivered: this session can't run again."
      : `Not delivered: it waited more than ${days} days for this session to run.`,
  /** The session's one line for the notices one look ended: how many, and why. */
  line: (count: number, why: UnsentWhy, days: number): string =>
    why === "ended"
      ? `${noticesCount(count)} from CawCo ended undelivered: this session can't run again.`
      : `${noticesCount(count)} from CawCo ended undelivered: ${count === 1 ? "it" : "they"} waited more than ${days} days for this session to run.`,
};
