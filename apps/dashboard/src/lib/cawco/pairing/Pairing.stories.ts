/**
 * The pairing sheet (Component Story Format 3, live components): one idea,
 * the code is the key and Caw minds the door, on the real PairingPanel,
 * ScanSheet and CawPanel. Each stop at rest with the control that plays its
 * moment; each take on its own stop with its Pick. Mounted by CawCo's stage
 * from this file; the stops' harness is in ./preview and goes with this
 * sheet once the design is built.
 */
import NeedsStop from "./preview/NeedsStop.svelte";
import PairingStop from "./preview/PairingStop.svelte";
import ScanStop from "./preview/ScanStop.svelte";

export default {
  component: PairingStop,
  args: { stop: "asking" },
};

/** The hub is asked for a key: its card and boxes stand as skeletons. */
export const Asking = { args: {} };

/** The key waits: a light sweeps its edge and the dots glint under it. */
export const Waiting = {
  args: {
    stop: "waiting",
    wait: "sweep",
    pick: {
      choice: "waiting",
      option: "sweep",
      label: "a light sweeps the edge",
    },
  },
};

/** The same wait, my bolder take: rings ripple out from Caw's head. */
export const WaitingRipple = {
  args: {
    stop: "waiting",
    wait: "ripple",
    pick: {
      choice: "waiting",
      option: "ripple",
      label: "rings ripple from Caw",
    },
  },
};

/** The last minute: the countdown appears and the light warms. */
export const LastMinute = { args: { stop: "last-minute" } };

/** A phone scanned it: the key steps back, the letters pulse to be compared. */
export const Checking = { args: { stop: "checking" } };

/** Approved: the key pours into Caw's head, Caw is done, the dashboard opens. */
export const Approved = {
  args: {
    stop: "approved",
    approved: "swallow",
    pick: {
      choice: "approved",
      option: "swallow",
      label: "Caw swallows the key",
    },
  },
};

/** Approved, my other bolder take: the whole key flies up to Caw. */
export const ApprovedFly = {
  args: {
    stop: "approved",
    approved: "fly",
    pick: {
      choice: "approved",
      option: "fly",
      label: "the key flies up to Caw",
    },
  },
};

/** Denied: the dots burst and fall, the head shakes, the key closes up. */
export const Denied = { args: { stop: "denied" } };

/** Expired (A): it drains away and a fresh key shuffles straight back in. */
export const Expired = {
  args: {
    stop: "expired",
    expired: "refresh",
    pick: {
      choice: "expired",
      option: "refresh",
      label: "a fresh code at once",
    },
  },
};

/** Expired (B): it drains away and waits on New code. */
export const ExpiredParked = {
  args: {
    stop: "expired",
    expired: "park",
    pick: { choice: "expired", option: "park", label: "wait for New code" },
  },
};

/** The hub refused: no key, Caw, why, Try again, and the hub's own words. */
export const Failed = { args: { stop: "failed" } };

/** The phone's scanner, looking. */
export const Scanner = {
  render: () => ({ Component: ScanStop, props: { stop: "idle" } }),
};

/** A scan that matched: the brackets snap onto the key, the boxes fill. */
export const ScanMatched = {
  render: () => ({ Component: ScanStop, props: { stop: "matched" } }),
};

/** A scan of a key nothing on this hub waits for: it bursts, as Denied does. */
export const ScanNoMatch = {
  render: () => ({ Component: ScanStop, props: { stop: "nomatch" } }),
};

/** Needs you's head with Scan code, over the pairing row. */
export const NeedsYou = {
  render: () => ({ Component: NeedsStop, props: {} }),
};
