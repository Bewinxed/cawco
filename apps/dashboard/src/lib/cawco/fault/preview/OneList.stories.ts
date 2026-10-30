/**
 * One list in the side panel stopped on a render error (Component Story Format 3, live
 * components): the failure-state proposal (fault/) inside the
 * shell that outlives it, at every width. Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/One list in the side panel",
  component: RegionFaultFixture,
  args: { region: "list", again: false },
};

/** The Comments list inside the preview on a phone, 390 wide. */
export const ListPhone = at(390);
/** The Comments list inside the preview on a small tablet or a narrow window, 680 wide. */
export const ListNarrow = at(680);
/** The Comments list inside the preview on an iPad's landscape or a small laptop, 1024 wide. */
export const ListLaptop = at(1024);
/** The Comments list inside the preview on a desk, 1440 wide. */
export const ListDesk = at(1440);
/** The Comments list inside the preview on a wide desk, 2560 wide. */
export const ListWide = at(2560);
/** Try again threw again at once: the way on is Reload page, 1440 wide. */
export const ListStoppedAgain = at(1440, { again: true });
/** Try again threw again at once, on a phone. */
export const ListStoppedAgainPhone = at(390, { again: true });
/** Show details open in the rail, 1440 wide. */
export const ListDetails = at(1440, { open: true });
