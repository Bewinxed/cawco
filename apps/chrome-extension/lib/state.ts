/**
 * What the popup shows, written by the background worker to
 * `chrome.storage.session` (so a worker that sleeps loses nothing) and
 * messages between the extension's pages.
 */
/** The hub's passkey relay phases (core `PasskeyRelayStatus`). */
type PasskeyRelayStatus =
  "scanning" | "captured" | "injected" | "authenticated" | "timeout" | "no_ble";

export interface BridgeState {
  hub: "idle" | "connecting" | "connected" | "closed";
  qr: { expiresAt: number; fidoUri: string; rpOrigin?: string } | null;
  /** The relay phase the hub last reported for the QR's take-over. */
  relay: PasskeyRelayStatus | null;
  scan: "idle" | "scanning" | "captured" | "needs-flag" | "failed";
  /** Why a scan did not start, for the person. */
  scanDetail?: string;
}

export const STATE_KEY = "bridgeState";

export const IDLE_STATE: BridgeState = {
  hub: "idle",
  qr: null,
  relay: null,
  scan: "idle",
};

/** Messages between the background worker, the offscreen document and the popup. */
export type BridgeMessage =
  | { type: "scan:start" }
  | { type: "scan:stop" }
  | { type: "scan:failed"; reason: "flag" | "failed"; detail: string }
  | { type: "scan:running" }
  | {
      type: "advert";
      serviceData: string;
      rssi: number;
      capturedAt: number;
    }
  | { type: "dismiss" };
