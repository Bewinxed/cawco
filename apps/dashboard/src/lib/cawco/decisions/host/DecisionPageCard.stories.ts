/**
 * A decision page's card on its page (Component Story Format 3, live
 * components; tsk-521): Other is its last option, his own words kept as his
 * answer with no pick. The card and its options are the product's; the
 * page's overlay is page-card-live.svelte's stand-in.
 */
import { DECISION_CARD } from "../../transcript/parked-fixtures";
import PageCardLive from "./page-card-live.svelte";

export default {
  title: "Decisions/A card on its page",
  component: PageCardLive,
  args: { card: DECISION_CARD.card, again: 0 },
  parameters: { viewport: "desk" },
};

/** Where a minimized pick stands: two options, the recommended one first, and Other last. */
export const OnPage = {};
