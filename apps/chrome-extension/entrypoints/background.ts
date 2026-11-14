/**
 * Background service worker: listens for passkey QR messages from the
 * CawCo dashboard page via `chrome.runtime.onMessageExternal`, stores
 * the pending FIDO URI, and shows a badge. Clears when the QR is
 * consumed (the popup reads it) or when it expires.
 */

export default defineBackground(() => {
  /** How long a passkey QR lives, ms: the CTAP spec's 5 minutes. */
  const PASSKEY_QR_TTL_MS = 5 * 60_000;

  interface PasskeyQr {
    fidoUri: string;
    origin?: string;
    expiresAt: number;
  }

  let pending: PasskeyQr | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function setPending(qr: PasskeyQr | null) {
    pending = qr;
    clearTimeout(expiryTimer);

    if (qr) {
      // Show a badge to indicate a QR is waiting.
      chrome.action.setBadgeText({ text: "🔑" });
      chrome.action.setBadgeBackgroundColor({ color: "#E54D2E" });

      // Auto-expire.
      const left = qr.expiresAt - Date.now();
      if (left > 0) {
        expiryTimer = setTimeout(() => {
          setPending(null);
        }, left);
      } else {
        setPending(null);
      }
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  }

  // Listen for messages from the CawCo dashboard page (externally_connectable).
  chrome.runtime.onMessageExternal.addListener(
    (
      message: Record<string, unknown>,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: Record<string, unknown>) => void
    ) => {
      if (message.type === "cawco:passkey_qr") {
        setPending({
          fidoUri: message.fidoUri as string,
          origin: message.origin as string | undefined,
          expiresAt:
            typeof message.expiresAt === "number"
              ? message.expiresAt
              : Date.now() + PASSKEY_QR_TTL_MS,
        });
        sendResponse({ type: "cawco:passkey_qr_ack", displayed: true });
      } else if (message.type === "cawco:ping") {
        // The dashboard pings to detect the extension.
        sendResponse({ type: "cawco:pong", version: "1.0.0" });
      }
      return true;
    }
  );

  // The popup reads the pending QR via chrome.runtime messages.
  chrome.runtime.onMessage.addListener(
    (
      message: Record<string, unknown>,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response: Record<string, unknown>) => void
    ) => {
      if (message.type === "cawco:get_pending") {
        sendResponse({
          type: "cawco:pending",
          qr: pending,
        });
        return true;
      }
      if (message.type === "cawco:dismiss") {
        setPending(null);
        sendResponse({ type: "cawco:dismissed" });
        return true;
      }
      return false;
    }
  );
});
