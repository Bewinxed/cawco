/**
 * The side panel stopped on a render error, in the BitePal composition (Caw stands whole over the words):
 * one option of the failure-face pick page, on the night he saw it
 * (RegionFaultFixture).
 */
import { at } from "./frames";
import RegionFaultFixture from "./RegionFaultFixture.svelte";

export default {
  title: "Failure states/BitePal",
  component: RegionFaultFixture,
  args: { region: "side", composition: "bitepal", again: false },
};

/** The preview beside a conversation on a desk, 1280 wide. */
export const Desk = at(1280);
/** The preview sheet on a phone, 390 wide. */
export const Phone = at(390);
/** Try again threw again at once: the way on is Reload page, on a phone. */
export const StoppedAgain = at(390, { again: true });
