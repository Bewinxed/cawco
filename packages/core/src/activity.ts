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
 *   the parent hands it up (the hub's `unroute` takes the routing off).
 *   Given `parentOf`, an ask a delegate parks for the person is under every
 *   session above it too, up to the one the person talks to: its card is
 *   drawn there (the dashboard's SessionPane), however deep it was asked;
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
  /** The session that started a session, when one did: an ask's chain up its tree. */
  parentOf?: (instanceId: string) => string | null | undefined;
}): Set<string> => new Set(waitsOnYou(sources).keys());

/**
 * {@link waitingOnYou}'s rule, with what each session waits on the person
 * for: the asks and the Needs you artifacts that put it there, each as the
 * caller gave it. What a work item's session waits on reads this (hub
 * work-items.ts, delegation-tree.ts), so an ask and a card hold it alike.
 */
export const waitsOnYou = <
  A extends { instanceId?: string | null; routedTo?: unknown },
  N extends Pick<ArtifactNeed, "instanceId" | "parked">,
>(sources: {
  artifacts: Iterable<N>;
  asks: Iterable<A>;
  /** The session that started a session, when one did: an ask's chain up its tree. */
  parentOf?: (instanceId: string) => string | null | undefined;
}): Map<string, { artifacts: N[]; asks: A[] }> => {
  const waiting = new Map<string, { artifacts: N[]; asks: A[] }>();
  const of = (id: string) => {
    let one = waiting.get(id);
    if (!one) {
      one = { artifacts: [], asks: [] };
      waiting.set(id, one);
    }
    return one;
  };
  for (const ask of sources.asks) {
    if (ask.instanceId && ask.routedTo !== "parent") {
      for (const id of sessionChain(ask.instanceId, sources.parentOf)) {
        of(id).asks.push(ask);
      }
    }
  }
  for (const need of sources.artifacts) {
    if (!need.parked) {
      of(need.instanceId).artifacts.push(need);
    }
  }
  return waiting;
};

/**
 * `instanceId` and every session above it, nearest first, by `parentOf`;
 * `instanceId` alone without one. A chain that comes back on itself (a
 * row that names a descendant as its parent) ends where it would repeat.
 */
export const sessionChain = (
  instanceId: string,
  parentOf?: (instanceId: string) => string | null | undefined
): string[] => {
  const chain = [instanceId];
  let parent = parentOf?.(instanceId);
  while (parent && !chain.includes(parent)) {
    chain.push(parent);
    parent = parentOf?.(parent);
  }
  return chain;
};
