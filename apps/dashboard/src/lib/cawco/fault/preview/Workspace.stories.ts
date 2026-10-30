/**
 * Workspace stopped on a render error (Component Story Format 3, live
 * components): the failure-state proposal (fault/RegionFault) inside the
 * shell that outlives it, at every width. The face, Stopped again and Ask
 * Caw are the canvas's switches; Try again on any frame throws again on the
 * same data, as a duplicate key does.
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Workspace",
  component: RegionFaultFixture,
  args: { region: "workspace", face: "region", again: false, askCaw: false },
};

/** The sessions' surface on a phone, 390 wide. */
export const WorkspacePhone = at(390);
/** The sessions' surface on a small tablet or a narrow window, 680 wide. */
export const WorkspaceNarrow = at(680);
/** The sessions' surface on an iPad's landscape or a small laptop, 1024 wide. */
export const WorkspaceLaptop = at(1024);
/** The sessions' surface on a desk, 1440 wide. */
export const WorkspaceDesk = at(1440);
/** The sessions' surface on a wide desk, 2560 wide. */
export const WorkspaceWide = at(2560);
/** Try again threw again at once: the way on is Reload page, 1440 wide. */
export const WorkspaceStoppedAgain = at(1440, { again: true });
/** Try again threw again at once, on a phone. */
export const WorkspaceStoppedAgainPhone = at(390, { again: true });
