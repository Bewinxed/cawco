/**
 * A passkey QR from a browser's page during a take-over: the hub broadcasts
 * it, the dashboard renders a QR in the take-over view for the person to
 * scan with their phone. The QR expires after {@link PASSKEY_QR_TTL_MS}.
 */

import type { BrowserKey, PasskeyQrFrame } from "@cawco/core/browser";
import { PASSKEY_QR_TTL_MS } from "@cawco/core/browser";
import type { FrameOf } from "../hub/frames";

interface PasskeyQrState {
  /** The active passkey QR for each browser, by key; gone once expired or dismissed. */
  active: Map<BrowserKey, PasskeyQrFrame>;
}

const state = $state<PasskeyQrState>({ active: new Map() });

/** A passkey QR frame arrived from the hub: keep it, expiring the old one for that browser. */
export function takePasskeyQr(frame: FrameOf<"passkey_qr">): void {
  const { key, raisedAt } = frame;
  state.active.set(key, frame);
  // Auto-expire it.
  const left = raisedAt + PASSKEY_QR_TTL_MS - Date.now();
  if (left <= 0) {
    state.active.delete(key);
    return;
  }
  setTimeout(() => {
    const held = state.active.get(key);
    if (held?.raisedAt === raisedAt) {
      state.active.delete(key);
    }
  }, left);
}

/** Dismiss the passkey QR for a browser (the person scanned it, or handed back). */
export function dismissPasskeyQr(key: BrowserKey): void {
  state.active.delete(key);
}

/** The active passkey QR for a browser, if any and not expired. */
export function activePasskeyQr(
  key: BrowserKey | undefined
): PasskeyQrFrame | null {
  if (!key) {
    return null;
  }
  const held = state.active.get(key);
  if (!held) {
    return null;
  }
  if (Date.now() > held.raisedAt + PASSKEY_QR_TTL_MS) {
    state.active.delete(key);
    return null;
  }
  return held;
}
