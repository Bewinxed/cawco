/**
 * What a session is doing now: a turn, something waiting on the owner, or
 * nothing. The fleet view's whole vocabulary, what the daemon folds its
 * frames into (index.ts `SessionPulse`), and what decides whether a
 * session may be archived (archive.ts).
 */
import type { ArtifactNeed } from "./artifact-needs";

export const ACTIVITIES = ["working", "blocked", "idle"] as const;
export type Activity = (typeof ACTIVITIES)[number];

/**
 * The sessions waiting on the person: each one Needs you lists something
 * of. Every mark that says a session needs you reads this one rule (a tab's
 * glyph, a row's mark, Caw's seat, Find's state, fleet watch's stall sweep,
 * an account's admission), and such a session is `blocked` whatever its
 * turn is doing. Something of a session waits on the person while:
 *
 * - an ask is parked under it for the person: a permission, a question
 *   `ask` put, a post held for them. One routed to the session's parent
 *   (`routedTo: "parent"`) waits on that agent, not on the person, until
 *   the parent hands it up (the hub's `unroute` takes the routing off);
 * - an artifact it holds is in Needs you (artifact-needs.ts): a decision
 *   page with a card not picked, a canvas to judge never opened, picks
 *   written and not sent, a pin whose reply asks. One put away with Not now
 *   (`parked`) is out of Needs you, and out of here.
 *
 * The daemon's pulse sees only the first: an artifact is the hub's.
 */
export const waitingOnYou = (sources: {
  artifacts: Iterable<Pick<ArtifactNeed, "instanceId" | "parked">>;
  asks: Iterable<{ instanceId?: string | null; routedTo?: unknown }>;
}): Set<string> => {
  const waiting = new Set<string>();
  for (const ask of sources.asks) {
    if (ask.instanceId && ask.routedTo !== "parent") {
      waiting.add(ask.instanceId);
    }
  }
  for (const need of sources.artifacts) {
    if (!need.parked) {
      waiting.add(need.instanceId);
    }
  }
  return waiting;
};
