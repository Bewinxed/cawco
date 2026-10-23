/**
 * "Open CawCo at cawco", the alternative design's sheet (Component Story
 * Format 3, live components): the status card of the address design
 * (2026-10-22, section 3), a domain-detail row with no step list, on the
 * owner's own machine. Each state at the desk (1440) and on a phone (390),
 * as Needs you's row. The meta's args are every story's; a story's own
 * args are what it changes.
 */
import AddressStatus from "./AddressStatus.svelte";

export default {
  title: "Onboarding/Open CawCo at cawco (status card)",
  component: AddressStatus,
  args: {
    view: "entry",
    net: "tailscale",
    host: "obelisk-of-light",
    http: "http://cawco",
    signIn: "https://login.tailscale.com/a/4f1c9e2b7a3d",
  },
};

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

/** Entry: Not yet, one sign-in to press. */
export const Entry = { args: {}, parameters: desk };
/** Entry, on a phone. */
export const EntryPhone = { args: {}, parameters: phone };

/** Pending: Joining…, the link still there. */
export const Pending = { args: { view: "pending" }, parameters: desk };
/** Pending, on a phone. */
export const PendingPhone = { args: { view: "pending" }, parameters: phone };

/** Ready: the row's tick, Live, Copy and Open. */
export const Ready = { args: { view: "ready" }, parameters: desk };
/** Ready, on a phone. */
export const ReadyPhone = { args: { view: "ready" }, parameters: phone };

/** Ready's second row: Keep cawco signed in, a row of its own. */
export const KeepSignedIn = { args: { view: "expiry" }, parameters: desk };
/** The second row, on a phone. */
export const KeepSignedInPhone = {
  args: { view: "expiry" },
  parameters: phone,
};

/** Failure: Not answering, the failure form in the row's place. */
export const Failure = {
  args: { view: "failure", failure: "no-answer" },
  parameters: desk,
};
/** Failure, on a phone. */
export const FailurePhone = {
  args: { view: "failure", failure: "no-answer" },
  parameters: phone,
};
