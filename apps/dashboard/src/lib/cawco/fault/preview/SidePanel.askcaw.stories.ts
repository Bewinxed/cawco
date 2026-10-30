/**
 * The side panel stopped on a render error, with Ask Caw to fix it (Component Story Format 3,
 * live components): one option of the failure-states pick page, at every
 * width, on the night he saw it (RegionFaultFixture).
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/Side panel, with Ask Caw to fix it",
  component: RegionFaultFixture,
  args: { region: "side", again: false, face: "region", askCaw: true },
};

/** The failure in the body with Ask Caw to fix it beside Try again on a phone, 390 wide. */
export const AskPhone = at(390);
/** The failure in the body with Ask Caw to fix it beside Try again on a small tablet or a narrow window, 680 wide. */
export const AskNarrow = at(680);
/** The failure in the body with Ask Caw to fix it beside Try again on an iPad's landscape or a small laptop, 1024 wide. */
export const AskLaptop = at(1024);
/** The failure in the body with Ask Caw to fix it beside Try again on a desk, 1440 wide. */
export const AskDesk = at(1440);
/** The failure in the body with Ask Caw to fix it beside Try again on a wide desk, 2560 wide. */
export const AskWide = at(2560);
