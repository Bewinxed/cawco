/**
 * One card of a decision page stopped on a render error (Component Story
 * Format 3, live components): a page the owner really answered, caw-off-calls,
 * its other cards and Send standing. Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Decision card",
  component: RegionFaultFixture,
  args: { region: "decision", again: false },
};

/** A decision card that stopped, on a phone, 390 wide. */
export const DecisionPhone = at(390);
/** A decision card that stopped, in a small tablet or the panel, 680 wide. */
export const DecisionNarrow = at(680);
/** A decision card that stopped, on an iPad's landscape or a small laptop, 1024 wide. */
export const DecisionLaptop = at(1024);
/** A decision card that stopped, on a desk, 1440 wide. */
export const DecisionDesk = at(1440);
/** A decision card that stopped, on a wide desk, 2560 wide. */
export const DecisionWide = at(2560);
/** Try again threw again at once: the way on is Reload page, 1440 wide. */
export const DecisionStoppedAgain = at(1440, { again: true });
/** Try again threw again at once, on a phone. */
export const DecisionStoppedAgainPhone = at(390, { again: true });
/** Show details open, on a phone. */
export const DecisionDetailsPhone = at(390, { open: true });
