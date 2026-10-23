/**
 * The cawco address's journey as the preview draws it: what the hub would
 * hold (the address design, 2026-10-22), shaped as RelayJourney's journey
 * is (core stream-relay.ts), each step with where it stands. Nothing here
 * talks to a hub: the preview's states files hand it in.
 */
export type { AddressFailure, AddressNet, NoWordNet } from "./words";

export type AddressStep =
  /** Tailscale: one press on the sign-in link; with device approval on, an admin approves it. */
  | { step: "sign-in"; state: "needs" | "waiting" | "approval" | "done" }
  /** NetBird: a setup key pasted. */
  | { step: "setup-key"; state: "needs" | "done" }
  /** Headscale: its own server's sign-in, and the register command when it needs one. */
  | { step: "headscale"; state: "needs" | "done"; command?: string }
  /** The hub fetches the address from its own machine. */
  | { step: "answers"; state: "waiting" | "checking" | "done" }
  /** Optional: HTTPS Certificates on the tailnet (MagicDNS first when it is off). */
  | {
      step: "https";
      state: "waiting" | "needs" | "checking" | "done" | "skipped";
      magicDns?: boolean;
    }
  /** Optional: key expiry off on the Machines page. */
  | { step: "expiry"; state: "waiting" | "needs" | "done" | "skipped" };

/** What the person pressed: the hub's to act on. */
export type AddressAct =
  | "sign-in"
  | "add-cawco"
  | "skip-https"
  | "skip-expiry"
  | "later"
  | "new-link"
  | "use-suffix"
  | "check-again"
  | "sign-in-again"
  | "remove";

/** Settings' summary, once it is done. */
export interface AddressSummary {
  /** Who signed it in. */
  account: string;
  /** How long ago the hub last fetched the address. */
  ago: string;
  expiry: "off" | "skipped";
  https: "on" | "skipped";
  state: "live" | "signed-out" | "lapsing" | "not-answering";
}

export interface AddressPlace {
  /** The address it answers at, and the https one once certificates are on. */
  http: string;
  https: string | null;
}
