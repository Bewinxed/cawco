/**
 * The pairing sheet (Component Story Format 3, live components): one idea,
 * the code is the key and Caw minds the door, on the real PairingPanel,
 * ScanSheet and CawPanel. Each stop at rest with the control that plays its
 * moment. The takes still open are picked on the decision page, whose
 * options each embed this sheet's stories of that take.
 * Mounted by CawCo's stage from this file; the stops' harness is in
 * ./preview and goes with this sheet once the design is built.
 */
import NeedsStop from "./preview/NeedsStop.svelte";
import PairingStop from "./preview/PairingStop.svelte";
import ScanStop from "./preview/ScanStop.svelte";

export default {
  title: "Pairing",
  component: PairingStop,
  args: { stop: "asking" },
  // The pairing screen's column (PairingStop, 34rem), held to the page's
  // width where a decision page embeds it on a phone.
  parameters: { viewport: 544 },
};

/** Asking the hub for a code: the card and the six boxes stand as skeletons. */
export const Asking = { args: {} };

/** The code waits: once a breath, a ring leaves the card's edge. */
export const Waiting = { args: { stop: "waiting", wait: "ping" } };

/** The code waits, the other take: rings ripple out from Caw's head. */
export const WaitingRipple = { args: { stop: "waiting", wait: "ripple" } };

/** The code waits, the third take: a light rides the card's edge. */
export const WaitingSweep = { args: { stop: "waiting", wait: "sweep" } };

/** The last minute: the countdown appears and the ring warms. */
export const LastMinute = { args: { stop: "last-minute" } };

/** A phone scanned it: a spinner runs the card's edge, the letters pulse to be compared. */
export const Checking = { args: { stop: "checking" } };

/** Approved: the code pours into Caw's head, Caw is done, the dashboard opens. */
export const Approved = { args: { stop: "approved", approved: "swallow" } };

/** Approved, the other take: the whole card flies up to Caw. */
export const ApprovedFly = { args: { stop: "approved", approved: "fly" } };

/** Denied: the dots burst and fall, the head shakes, the space closes up. */
export const Denied = { args: { stop: "denied" } };

/** Expired: it drains away and a fresh code shuffles straight back in. */
export const Expired = { args: { stop: "expired", expired: "refresh" } };

/** Expired, the other take: it drains away and waits on New code. */
export const ExpiredParked = { args: { stop: "expired", expired: "park" } };

/** The hub refused: no code, Caw, why, Try again, and the hub's own words. */
export const Failed = { args: { stop: "failed" } };

/** Denied on the whole screen, as the browser shows it: Caw and the words stay put while the code folds away. */
export const DeniedOnScreen = {
  args: { stop: "denied", screen: true },
  parameters: { viewport: "desk" },
};

/** The phone's scanner, looking. */
export const Scanner = {
  parameters: { viewport: "phone" },
  render: () => ({ Component: ScanStop, props: { stop: "idle" } }),
};

/** A scan that matched approves at once: the brackets snap on, the boxes fill. */
export const ScanMatched = {
  parameters: { viewport: "phone" },
  render: () => ({ Component: ScanStop, props: { stop: "matched" } }),
};

/** A scan that matched, the other take: the code shows, then Deny or Approve. */
export const ScanMatchedAsk = {
  parameters: { viewport: "phone" },
  render: () => ({
    Component: ScanStop,
    props: { stop: "matched", scan: "ask" },
  }),
};

/** A scan of a code nothing on this hub waits for: it bursts, as Denied does. */
export const ScanNoMatch = {
  parameters: { viewport: "phone" },
  render: () => ({ Component: ScanStop, props: { stop: "nomatch" } }),
};

/** Needs you's head with Scan code, over the pairing row. */
export const NeedsYou = {
  parameters: { viewport: "phone" },
  render: () => ({ Component: NeedsStop, props: {} }),
};
