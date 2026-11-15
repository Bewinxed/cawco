/**
 * Content script: runs on every page and exits at once unless the page is a
 * CawCo dashboard (its body carries `data-cawco`). On the dashboard it
 * carries two messages between the page and the extension: the passkey QR
 * the dashboard posts goes to the background worker, and the advert the
 * worker captures goes back to the page, which sends it to the hub over its
 * own authenticated socket. The extension holds no hub address and no token.
 */
import { defineContentScript } from "wxt/utils/define-content-script";
import type { BridgeMessage } from "../lib/state";

export default defineContentScript({
  matches: ["*://*/*"],
  runAt: "document_end",
  main() {
    if (!document.body.hasAttribute("data-cawco")) {
      return;
    }

    window.addEventListener("message", (event) => {
      if (event.source !== window || event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as Record<string, unknown> | null;
      if (
        data?.type !== "cawco:passkey_qr" ||
        typeof data.fidoUri !== "string" ||
        typeof data.raisedAt !== "number"
      ) {
        return;
      }
      chrome.runtime
        .sendMessage({
          type: "qr",
          fidoUri: data.fidoUri,
          raisedAt: data.raisedAt,
          rpOrigin:
            typeof data.rpOrigin === "string" ? data.rpOrigin : undefined,
        } satisfies BridgeMessage)
        .catch(() => undefined);
    });

    chrome.runtime.onMessage.addListener(
      (message: BridgeMessage, _sender, respond) => {
        if (message.type === "ping") {
          respond(true);
        } else if (message.type === "advert") {
          window.postMessage(
            {
              type: "cawco:passkey_advert",
              serviceData: message.serviceData,
              rssi: message.rssi,
              capturedAt: message.capturedAt,
            },
            window.location.origin
          );
        }
      }
    );
  },
});
