/**
 * What the popup shows, kept in memory by the background worker, and the
 * messages between the extension's pages. The scan's status is also kept in
 * `chrome.storage.session` (cleared when the browser closes), nothing on disk.
 */
/** The hub's passkey relay phases (core `PasskeyRelayStatus`). */
export interface BridgeState {
  qr: { expiresAt: number; fidoUri: string; rpOrigin?: string } | null;
  ble: BleStatus;
  /** The error's message when `ble` is `error`. */
  bleDetail?: string;
}

/** Where the Bluetooth scan stands: kept in `chrome.storage.session` under `BLE_STATUS_KEY`. */
type BleStatus =
  | "idle"
  | "no_bluetooth"
  | "no_scan_api"
  | "permission_denied"
  | "scanning"
  | "captured"
  | "error";

export const BLE_STATUS_KEY = "ble_status";

/** The stored value: the status and, for `error`, its message. */
export interface StoredBleStatus {
  status: BleStatus;
  detail?: string;
}

export const IDLE_STATE: BridgeState = { qr: null, ble: "idle" };

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
  | {
      type: "scan:failed";
      reason: Exclude<BleStatus, "idle" | "scanning" | "captured">;
      detail?: string;
    }
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
