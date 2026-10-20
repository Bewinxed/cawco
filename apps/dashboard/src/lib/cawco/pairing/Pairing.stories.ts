/**
 * The pairing sheet (Component Story Format 3, live components): one idea,
 * the code is the key and Caw minds the door, on the real PairingPanel,
 * ScanSheet and CawPanel. Each stop at rest with the control that plays its
 * moment. The takes still open are picked on the decision page, whose
 * options each embed this sheet's stories of that take.
 * Mounted by CawCo's stage from this file; the stops' harness is in
 * ./preview and goes with this sheet once the design is built.
 */
import FaceStop from "./preview/FaceStop.svelte";
import Moments from "./preview/Moments.svelte";
import NeedsStop from "./preview/NeedsStop.svelte";
import PairingStop from "./preview/PairingStop.svelte";
import ScanStop from "./preview/ScanStop.svelte";

export default {
  title: "Pairing",
  component: PairingStop,
  args: { stop: "asking" },
  // The pairing screen's column (PairingStop, 34rem) at its own width: where
  // a decision page's embed is narrower, the column is drawn scaled to fit.
  parameters: { viewport: 544 },
};

/** Asking the hub for a code: a cloud of dots drifts in the card while the code is made, over empty boxes. */
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

/** Expired: it drains away and a fresh code shuffles straight back in, where it rests. Drawn on a narrow screen, so a page draws it whole. */
export const Expired = {
  args: { stop: "expired", expired: "refresh" },
  parameters: { viewport: 350 },
};

/** Expired, the other take: it drains away and waits on New code. Drawn on a narrow screen, so a page draws it whole. */
export const ExpiredParked = {
  args: { stop: "expired", expired: "park" },
  parameters: { viewport: 350 },
};

/** The hub refused: no code, Caw, why, Try again, and the hub's own words. */
export const Failed = { args: { stop: "failed" } };

/** Denied on the whole screen, as the browser shows it: Caw and the words stay put while the code folds away. */
export const DeniedOnScreen = {
  args: { stop: "denied", screen: true },
  parameters: { viewport: "desk" },
};

/*
 * A decision page's frames: each take of a moment held still where the
 * takes differ (Moments), and the denied faces in the key (FaceStop). A row
 * of frames has no words, so a page draws it scaled to its width.
 */

/** The card pings: one breath held at 100, 300 and 600ms, as the ring leaves the edge and fades. */
export const PingFrames = {
  parameters: { viewport: 920 },
  render: () => ({
    Component: Moments,
    props: { act: "wait", wait: "ping", at: [100, 300, 600] },
  }),
};

/** Rings ripple from Caw: the same three moments of a breath. */
export const RippleFrames = {
  parameters: { viewport: 920 },
  render: () => ({
    Component: Moments,
    props: { act: "wait", wait: "ripple", at: [100, 300, 600] },
  }),
};

/** A light circles the edge: the same three moments of a breath. */
export const SweepFrames = {
  parameters: { viewport: 920 },
  render: () => ({
    Component: Moments,
    props: { act: "wait", wait: "sweep", at: [100, 300, 600] },
  }),
};

/** Caw swallows the code: 100, 200 and 320ms in, Caw turning done at dur-panel (280ms). */
export const SwallowFrames = {
  parameters: { viewport: 920 },
  render: () => ({
    Component: Moments,
    props: {
      act: "swallow",
      at: [100, 200, 320],
      caw: ["needs-you", "needs-you", "done"],
    },
  }),
};

/** The code flies up to Caw: the same moments, so the two takes are compared at one time. */
export const FlyFrames = {
  parameters: { viewport: 920 },
  render: () => ({
    Component: Moments,
    props: {
      act: "fly",
      at: [100, 200, 320],
      caw: ["needs-you", "needs-you", "done"],
    },
  }),
};

/** Denied, squeezed shut: the face in the code at its size, and enlarged. */
export const FaceSqueeze = {
  parameters: { viewport: 300 },
  render: () => ({ Component: FaceStop, props: { face: "squeeze" } }),
};

/** Denied, a wince: the face in the code at its size, and enlarged. */
export const FaceWince = {
  parameters: { viewport: 300 },
  render: () => ({ Component: FaceStop, props: { face: "wince" } }),
};

/** The phone's scanner, looking. */
export const Scanner = {
  parameters: { viewport: "phone" },
  render: () => ({ Component: ScanStop, props: { stop: "idle" } }),
};

/** A scan that matched approves at once: the brackets snap on, the boxes fill. On a small phone's width, so a page draws it whole. */
export const ScanMatched = {
  parameters: { viewport: 350 },
  render: () => ({ Component: ScanStop, props: { stop: "matched" } }),
};

/** A scan that matched, the other take: the code shows, then Deny or Approve. On a small phone's width, so a page draws it whole. */
export const ScanMatchedAsk = {
  parameters: { viewport: 350 },
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
