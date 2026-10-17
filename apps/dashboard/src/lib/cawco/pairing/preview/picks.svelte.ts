/**
 * The pairing sheet's two open choices (round-2 design §5), shared by every
 * stop that plays them: what a scan does, and how a code's letters arrive.
 * Preview only; the build takes the owner's pick and this goes with the
 * sheet's harness.
 */
import type { OtpArrival } from "../OtpCells.svelte";

export const picks = $state<{ arrive: OtpArrival; scan: "approve" | "ask" }>({
  arrive: "pop",
  scan: "approve",
});

/** The fixture: the hub, the code its waiting browser shows, and another fleet's. */
export const FIXTURE = {
  hub: "7c1e9a52-4b3d-4f08-9d2e-61a0c8b5e3f4",
  otherHub: "e2b0d4c7-91fa-4c36-8a5d-3f7b19c0a6e2",
  code: "JWK-HDQ",
  /** The code a Start pairing pressed again is given. */
  nextCode: "PLN-RVT",
  otherCode: "QXT-PLM",
  device: "CawCo on iPad",
  address: "192.168.3.12",
} as const;

/**
 * A fixture pairing's `verificationUriComplete`, made as the hub makes it
 * (hub hub-auth.ts): Configure › Devices, the code and the hub in its query.
 */
export function verification(hub: string, code: string): string {
  const complete = new URL("/config/devices", "https://cawco.local");
  complete.searchParams.set("code", code);
  complete.searchParams.set("hub", hub);
  return complete.href;
}

/** One storyboard at a time on a stop: each step after the last, all cancelled together. */
export function timeline() {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  return {
    after(ms: number, step: () => void): void {
      const timer = setTimeout(() => {
        timers.delete(timer);
        step();
      }, ms);
      timers.add(timer);
    },
    stop(): void {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
    },
  };
}
