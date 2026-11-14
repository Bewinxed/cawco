/**
 * Passkey relay status as the hub broadcasts it: each browser that needs
 * a passkey has a {@link PasskeyStatusFrame} while the relay is in flight.
 */
import type { BrowserKey, PasskeyStatusFrame } from "@cawco/core/browser";
import type { FrameOf } from "../hub/frames";

const statusByKey = $state<Map<BrowserKey, PasskeyStatusFrame>>(new Map());

/** Take a `passkey_status` frame from the hub's socket. */
export function takePasskeyStatus(frame: FrameOf<"passkey_status">): void {
  if (
    frame.status === "authenticated" ||
    frame.status === "timeout" ||
    frame.status === "no_ble"
  ) {
    // Terminal states: keep them briefly so the UI can show them,
    // then clear after a short delay.
    statusByKey.set(frame.key, frame);
    setTimeout(() => {
      const current = statusByKey.get(frame.key);
      if (current === frame) {
        statusByKey.delete(frame.key);
      }
    }, 10_000);
  } else {
    statusByKey.set(frame.key, frame);
  }
}

/** The passkey relay status for `key`, or undefined while none is in flight. */
export function passkeyStatus(key: BrowserKey): PasskeyStatusFrame | undefined {
  return statusByKey.get(key);
}
