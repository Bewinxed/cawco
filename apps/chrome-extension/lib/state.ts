/**
 * What the popup shows, kept in memory by the background worker, and the
 * messages between the extension's pages. The bridge keeps nothing on disk
 * and asks for no storage permission.
 */
/** The hub's passkey relay phases (core `PasskeyRelayStatus`). */
export interface BridgeState {
  qr: { expiresAt: number; fidoUri: string; rpOrigin?: string } | null;
  scan: "idle" | "scanning" | "captured" | "needs-flag" | "failed";
  /** Why a scan did not start, for the person. */
  scanDetail?: string;
}

export const IDLE_STATE: BridgeState = { qr: null, scan: "idle" };

/** A passkey QR as the dashboard page posts it. */
export interface PageQr {
  fidoUri: string;
  raisedAt: number;
  rpOrigin?: string;
}

/** Messages between the content script, the background worker, the offscreen document and the popup. */
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
  | ({ type: "qr" } & PageQr)
  | { type: "dismiss" }
  | { type: "state:get" }
  | { type: "state"; state: BridgeState }
  | { type: "ping" };
