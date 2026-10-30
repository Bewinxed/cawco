/**
 * The side panel stopped on a render error, in the body (Component Story Format 3,
 * live components): one option of the failure-states pick page, at every
 * width, on the night he saw it (RegionFaultFixture).
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Side panel, in the body",
  component: RegionFaultFixture,
  args: { region: "side", again: false, face: "region", askCaw: false },
};

/** The failure in the preview's body on a phone, 390 wide. */
export const BodyPhone = at(390);
/** The failure in the preview's body on a small tablet or a narrow window, 680 wide. */
export const BodyNarrow = at(680);
/** The failure in the preview's body on an iPad's landscape or a small laptop, 1024 wide. */
export const BodyLaptop = at(1024);
/** The failure in the preview's body on a desk, 1440 wide. */
export const BodyDesk = at(1440);
/** The failure in the preview's body on a wide desk, 2560 wide. */
export const BodyWide = at(2560);
