/**
 * What moved of a session's records while the person was away, drawn in its
 * transcript as they come back (hub return-recap.ts, core `RETURN_RECAP`):
 * built by the hub from its own records, never from a session's words, and
 * no session is woken for it. Links and counts only.
 */

/** A return's recap for one session, as its transcript line keeps it (JSON). */
export interface ReturnRecap {
  /** When they came back, ms epoch on the hub's clock. */
  back: number;
  /** Work the session started that landed meanwhile: the work's link, its commit, its headline. */
  landed: { commit: string | null; headline: string | null; work: string }[];
  /** Tasks it plans or started work on whose stage moved meanwhile: the task's link, the stage it left first, the one it stands in. */
  moved: { from: string; task: string; to: string }[];
  /** When they went away, ms epoch on the hub's clock. */
  since: number;
  /** What of the session's waits on them now, Needs you's items and its open asks, each by its link. */
  waiting: string[];
}
