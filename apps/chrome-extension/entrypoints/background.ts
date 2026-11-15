/**
 * Background service worker: hears the passkey QR from the dashboard page's
 * content script, keeps the offscreen document scanning for the phone's
 * caBLE advert while the QR lives, and sends each captured advert back to
 * the page it came from. It opens no socket of its own: the dashboard's
 * authenticated one carries the advert to the hub. Web Bluetooth is not in
 * a service worker, so the scan runs offscreen.
 */
import { defineBackground } from "wxt/utils/define-background";
import {
  type BridgeMessage,
  type BridgeState,
  IDLE_STATE,
  type PageQr,
} from "../lib/state";

/** How long a passkey QR lives, ms (core `PASSKEY_QR_TTL_MS`: the CTAP spec's 5 minutes). */
const PASSKEY_QR_TTL_MS = 5 * 60_000;
const OFFSCREEN_PATH = "offscreen.html";

export default defineBackground(() => {
  let state: BridgeState = IDLE_STATE;
  /** The dashboard tab that raised the QR: adverts go back to it. */
  let dashboardTab: number | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;

  const setState = (next: Partial<BridgeState>) => {
    state = { ...state, ...next };
    chrome.action.setBadgeText({ text: state.qr ? "🔑" : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#E54D2E" });
    chrome.runtime
      .sendMessage({ type: "state", state } satisfies BridgeMessage)
      .catch(() => undefined);
  };

  const toOffscreen = async (message: BridgeMessage) => {
    if (message.type === "scan:start") {
      const open = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
      });
      if (open.length === 0) {
        await chrome.offscreen.createDocument({
          url: OFFSCREEN_PATH,
          reasons: ["WORKERS"],
          justification: "Scan for the phone's passkey Bluetooth advert",
        });
      }
    }
    await chrome.runtime.sendMessage(message).catch(() => undefined);
  };

  const stopScan = async () => {
    await toOffscreen({ type: "scan:stop" });
    await chrome.offscreen.closeDocument().catch(() => undefined);
  };

  const clearQr = () => {
    clearTimeout(expiry);
    dashboardTab = undefined;
    setState({ qr: null, scan: "idle", scanDetail: undefined });
    stopScan();
  };

  const takeQr = (frame: PageQr, tabId: number | undefined) => {
    const expiresAt = frame.raisedAt + PASSKEY_QR_TTL_MS;
    if (expiresAt <= Date.now()) {
      return;
    }
    dashboardTab = tabId;
    clearTimeout(expiry);
    expiry = setTimeout(clearQr, expiresAt - Date.now());
    const same = state.qr?.fidoUri === frame.fidoUri;
    setState({
      qr: { fidoUri: frame.fidoUri, expiresAt, rpOrigin: frame.rpOrigin },
      ...(same ? {} : { scan: "scanning", scanDetail: undefined }),
    });
    // The dashboard posts the same QR again whenever it redraws: one scan serves them all.
    if (!same) {
      toOffscreen({ type: "scan:start" });
    }
  };

  chrome.runtime.onMessage.addListener(
    (message: BridgeMessage, sender, respond) => {
      switch (message.type) {
        case "qr": {
          takeQr(message, sender.tab?.id);
          break;
        }
        case "advert": {
          // Only the offscreen document sends these: a tab's message never reaches the page.
          if (sender.tab || dashboardTab === undefined) {
            break;
          }
          chrome.tabs.sendMessage(dashboardTab, message).catch(() => undefined);
          setState({ scan: "captured" });
          break;
        }
        case "scan:running": {
          if (state.scan !== "captured") {
            setState({ scan: "scanning", scanDetail: undefined });
          }
          break;
        }
        case "scan:failed": {
          setState({
            scan: message.reason === "flag" ? "needs-flag" : "failed",
            scanDetail: message.detail,
          });
          break;
        }
        case "dismiss": {
          clearQr();
          break;
        }
        case "state:get": {
          respond(state);
          break;
        }
        default:
      }
    }
  );
});
