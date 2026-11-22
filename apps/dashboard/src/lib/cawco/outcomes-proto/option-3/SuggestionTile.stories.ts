/**
 * Caw's suggested outcome on option 3's first view: a proposal until he
 * adds it or drops it.
 */
import { COCKPIT_SUGGESTIONS } from "./outcomes.fixture";
import SuggestionTile from "./SuggestionTile.svelte";

export default {
  title: "Outcomes/One line each, suggestion",
  component: SuggestionTile,
  args: {
    suggestion: COCKPIT_SUGGESTIONS[0],
    offline: null,
    ontake: () => undefined,
    ondismiss: () => undefined,
    onopen: () => undefined,
  },
  parameters: { viewport: "desk" },
};

/** Caw suggests every release has notes a user can read. */
export const Offered = {};

/** The hub is unreachable, so adding or dropping it waits. */
export const Unreachable = {
  args: { offline: "You can answer once the hub is reachable." },
};
