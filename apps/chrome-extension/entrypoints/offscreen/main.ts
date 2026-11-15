/**
 * Offscreen document: the page context Web Bluetooth needs, alive after the
 * popup closes. Scans for the phone's caBLE advert while the background
 * worker says a passkey QR is active, and hands each advert back to it.
 */
import { type BridgeMessage } from "../../lib/state";
import { startScan } from "../../lib/ble";

let running: { stop: () => void } | undefined;
let starting = false;

const tell = (message: BridgeMessage) => {
  chrome.runtime.sendMessage(message).catch(() => undefined);
};

chrome.runtime.onMessage.addListener((message: BridgeMessage) => {
  if (message.type === "scan:stop") {
    running?.stop();
    running = undefined;
    return;
  }
  if (message.type !== "scan:start" || running || starting) {
    return;
  }
  starting = true;
  startScan((advert) => tell({ type: "advert", ...advert }))
    .then((result) => {
      if (result.ok) {
        running = result;
        tell({ type: "scan:running" });
      } else {
        tell({
          type: "scan:failed",
          reason: result.reason,
          detail: result.detail,
        });
      }
    })
    .finally(() => {
      starting = false;
    });
});
