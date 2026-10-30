/**
 * Page stopped on a render error (Component Story Format 3, live
 * components): the failure-state proposal (fault/) inside the
 * shell that outlives it, at every width. Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Page",
  component: RegionFaultFixture,
  args: { region: "page", again: false },
};

/** The Routines page on a phone, 390 wide. */
export const PagePhone = at(390);
/** The Routines page on a small tablet or a narrow window, 680 wide. */
export const PageNarrow = at(680);
/** The Routines page on an iPad's landscape or a small laptop, 1024 wide. */
export const PageLaptop = at(1024);
/** The Routines page on a desk, 1440 wide. */
export const PageDesk = at(1440);
/** The Routines page on a wide desk, 2560 wide. */
export const PageWide = at(2560);
/** Try again threw again at once: the way on is Reload page, 1440 wide. */
export const PageStoppedAgain = at(1440, { again: true });
/** Try again threw again at once, on a phone. */
export const PageStoppedAgainPhone = at(390, { again: true });
