/**
 * What a session is doing now: a turn, an ask waiting on the owner, or
 * nothing. The fleet view's whole vocabulary, what the daemon folds its
 * frames into (index.ts `SessionPulse`), and what decides whether a
 * session may be archived (archive.ts).
 */
export const ACTIVITIES = ["working", "blocked", "idle"] as const;
export type Activity = (typeof ACTIVITIES)[number];
