/**
 * The pairing sheet (Component Story Format 3, live components): the round-2
 * pairing design on the real PairingPanel, ScanSheet and CawPanel, each stop
 * at rest with the control that plays its storyboard, and the owner's two
 * choices as switches (what a scan does, how the code's letters arrive).
 * Mounted by CawCo's stage from this file. The stops' harness is in
 * ./preview and goes with this sheet once the design is built.
 */
import NeedsStop from "./preview/NeedsStop.svelte";
import PairingStop from "./preview/PairingStop.svelte";
import ScanStop from "./preview/ScanStop.svelte";

export default {
  component: PairingStop,
  args: { stop: "asking" },
};

/** The hub is asked for a code: the QR's place and the cells as skeletons. */
export const Asking = { args: {} };

/** The code waits, its countdown ticking from 9:41. */
export const Waiting = { args: { stop: "waiting" } };

/** Under a minute left: the ring and the figure in the warn hue. */
export const LastMinute = { args: { stop: "last-minute" } };

export const Approved = { args: { stop: "approved" } };

export const Denied = { args: { stop: "denied" } };

export const Expired = { args: { stop: "expired" } };

export const Failed = { args: { stop: "failed" } };

/** The app's scanner, looking. */
export const Scanner = {
  render: () => ({ Component: ScanStop, props: { stop: "idle" } }),
};

/** A scan that matched the waiting request. */
export const ScanMatched = {
  render: () => ({ Component: ScanStop, props: { stop: "matched" } }),
};

/** A scan of a code nothing on this hub waits for. */
export const ScanNoMatch = {
  render: () => ({ Component: ScanStop, props: { stop: "nomatch" } }),
};

/** Needs you's head with Scan code, over the pairing row. */
export const NeedsYou = {
  render: () => ({ Component: NeedsStop, props: {} }),
};
