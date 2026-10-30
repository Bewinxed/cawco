/**
 * Side panel stopped on a render error (Component Story Format 3, live
 * components): the failure-state proposal (fault/RegionFault) inside the
 * shell that outlives it, at every width. The face, Stopped again and Ask
 * Caw are the canvas's switches; Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Side panel",
  component: RegionFaultFixture,
  args: { region: "side", face: "region", again: false, askCaw: false },
};

/** The preview beside a conversation on a phone, 390 wide: the sheet's head and its Close outlive the failure (press it). */
export const SidePhone = at(390);
/** The preview beside a conversation on a small tablet or a narrow window, 680 wide. */
export const SideNarrow = at(680);
/** The preview beside a conversation on an iPad's landscape or a small laptop, 1024 wide. */
export const SideLaptop = at(1024);
/** The preview beside a conversation on a desk, 1440 wide. */
export const SideDesk = at(1440);
/** The preview beside a conversation on a wide desk, 2560 wide. */
export const SideWide = at(2560);
/** Try again threw again at once: the way on is Reload page, 1440 wide. */
export const SideStoppedAgain = at(1440, { again: true });
/** Try again threw again at once, on a phone. */
export const SideStoppedAgainPhone = at(390, { again: true });
