/**
 * Sidebar stopped on a render error (Component Story Format 3, live
 * components): the failure-state proposal (fault/RegionFault) inside the
 * shell that outlives it, at every width. The face, Stopped again and Ask
 * Caw are the canvas's switches; Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Sidebar",
  component: RegionFaultFixture,
  args: { region: "sidebar", face: "region", again: false, askCaw: false },
};

/** The project tree in the sidebar on a phone, 390 wide. */
export const SidebarPhone = at(390);
/** The project tree in the sidebar on a small tablet or a narrow window, 680 wide. */
export const SidebarNarrow = at(680);
/** The project tree in the sidebar on an iPad's landscape or a small laptop, 1024 wide. */
export const SidebarLaptop = at(1024);
/** The project tree in the sidebar on a desk, 1440 wide. */
export const SidebarDesk = at(1440);
/** The project tree in the sidebar on a wide desk, 2560 wide. */
export const SidebarWide = at(2560);
/** Try again threw again at once: the way on is Reload page, 1440 wide. */
export const SidebarStoppedAgain = at(1440, { again: true });
/** Try again threw again at once, on a phone. */
export const SidebarStoppedAgainPhone = at(390, { again: true });
