/**
 * What a decision page's own cards say (the hub's decision host,
 * apps/dashboard decisions/host): words the page draws, which the native
 * app draws too, since it shows the same page. A module of its own so the
 * host's bundle takes these and nothing else of core.
 */
export const decisionHostWords = {
  /** A card's Clear, beside Continue: its pick let go (the owner: "i have no way to deselect"). */
  clearPick: (several: boolean) => (several ? "Clear picks" : "Clear pick"),
};
