/**
 * A decision page that can't draw two of its parts (Component Story Format 3,
 * live components): a card fails as its card, a diagram as a line in its
 * place, every element through the one fault boundary (OpenUiRenderer,
 * FaultBoundary), the page's other cards working (FailedDecision).
 */
import FailedDecision from "./FailedDecision.svelte";
import { desk, phone } from "./windows";

export default {
  title: "Failure states/Decision page",
  component: FailedDecision,
};

/** A decision card that can't be drawn stands as its card; a diagram that can't, as a line in its card. On a desk. */
export const DecisionCard = desk();
/** A decision card and a diagram that can't be drawn, on a phone. */
export const DecisionCardPhone = phone();
