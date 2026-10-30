/**
 * The side panel stopped on a render error, a line in place (Component Story Format 3,
 * live components): one option of the failure-states pick page, at every
 * width, on the night he saw it (RegionFaultFixture).
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Side panel, a line in place",
  component: RegionFaultFixture,
  args: { region: "side", again: false, face: "line", askCaw: false },
};

/** The failure as one line at the top of the preview's body on a phone, 390 wide. */
export const LinePhone = at(390);
/** The failure as one line at the top of the preview's body on a small tablet or a narrow window, 680 wide. */
export const LineNarrow = at(680);
/** The failure as one line at the top of the preview's body on an iPad's landscape or a small laptop, 1024 wide. */
export const LineLaptop = at(1024);
/** The failure as one line at the top of the preview's body on a desk, 1440 wide. */
export const LineDesk = at(1440);
/** The failure as one line at the top of the preview's body on a wide desk, 2560 wide. */
export const LineWide = at(2560);
