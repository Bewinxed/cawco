/**
 * Tabs stopped on a render error (Component Story Format 3, live
 * components): the failure-state proposal (fault/) inside the
 * shell that outlives it, at every width. Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Tabs",
  component: RegionFaultFixture,
  args: { region: "tabs", again: false },
};

/** A group's tab strip on a phone, 390 wide. */
export const TabsPhone = at(390);
/** A group's tab strip on a small tablet or a narrow window, 680 wide. */
export const TabsNarrow = at(680);
/** A group's tab strip on an iPad's landscape or a small laptop, 1024 wide. */
export const TabsLaptop = at(1024);
/** A group's tab strip on a desk, 1440 wide. */
export const TabsDesk = at(1440);
/** A group's tab strip on a wide desk, 2560 wide. */
export const TabsWide = at(2560);
/** Try again threw again at once: the way on is Reload page, 1440 wide. */
export const TabsStoppedAgain = at(1440, { again: true });
/** Try again threw again at once, on a phone. */
export const TabsStoppedAgainPhone = at(390, { again: true });
/** Show details open: it stands over the pane, which stays where it is, 1440 wide. */
export const TabsDetails = at(1440, { open: true });
