/**
 * Preview sheet stopped on a render error (Component Story Format 3, live
 * components): the failure-state proposal (fault/) inside the
 * shell that outlives it, at every width. Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Preview sheet",
  component: RegionFaultFixture,
  args: { region: "sheet", again: false },
};

/** The preview sheet on a phone, 390 wide: its head and its Close outlive the failure (press it). */
export const SheetPhone = at(390);
/** The preview sheet in a narrow pane on a small tablet or a narrow window, 680 wide. */
export const SheetNarrow = at(680);
/** The preview sheet in a narrow pane on an iPad's landscape or a small laptop, 1024 wide. */
export const SheetLaptop = at(1024);
/** The preview sheet in a narrow pane in a desk's second column, 1440 wide. */
export const SheetDesk = at(1440, { columns: 2 });
/** The preview sheet in a narrow pane in a wide desk's third column, 2560 wide. */
export const SheetWide = at(2560, { columns: 3 });
/** Try again threw again at once: the way on is Reload page, in a desk's narrow column. */
export const SheetStoppedAgain = at(1440, { again: true, columns: 2 });
/** Try again threw again at once, on a phone. */
export const SheetStoppedAgainPhone = at(390, { again: true });
