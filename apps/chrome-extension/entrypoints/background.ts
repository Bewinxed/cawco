/**
 * Background service worker: holds a socket to the hub's dashboard
 * endpoint, hears `passkey_qr` and `passkey_status` frames, keeps the
 * offscreen document scanning for the phone's caBLE advert while a QR is
 * active, and sends each captured advert to the hub as `passkey_advert`.
 * Web Bluetooth is not in a service worker, so the scan runs offscreen.
 */
import { defineBackground } from "wxt/utils/define-background";
import {
  type BridgeMessage,
  type BridgeState,
  IDLE_STATE,
  STATE_KEY,
} from "../lib/state";

/** How long a passkey QR lives, ms (core `PASSKEY_QR_TTL_MS`: the CTAP spec's 5 minutes). */
const PASSKEY_QR_TTL_MS = 5 * 60_000;
/** The wire a dashboard socket names, so the hub sends frames and not just the snapshot (core `WIRE_PROTOCOL`). */
const WIRE_PROTOCOL = 64;
const OFFSCREEN_PATH = "offscreen.html";
/** Wait before the socket reopens after it drops, ms. */
const RECONNECT_MS = 3000;
/** The relay phases after which scanning is over. */
const RELAY_DONE = new Set(["injected", "authenticated", "timeout", "no_ble"]);

export default defineBackground(() => {
  let state: BridgeState = IDLE_STATE;
  let socket: WebSocket | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;

  const setState = (next: Partial<BridgeState>) => {
    state = { ...state, ...next };
    chrome.storage.session.set({ [STATE_KEY]: state });
    chrome.action.setBadgeText({ text: state.qr ? "🔑" : "" });
    chrome.action.setBadgeBackgroundColor({ color: "#E54D2E" });
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
    setState({ qr: null, relay: null, scan: "idle", scanDetail: undefined });
    stopScan();
  };

  const takeQr = (frame: {
    fidoUri: string;
    raisedAt: number;
    rpOrigin?: string;
  }) => {
    const expiresAt = frame.raisedAt + PASSKEY_QR_TTL_MS;
    if (expiresAt <= Date.now()) {
      return;
    }
    clearTimeout(expiry);
    expiry = setTimeout(clearQr, expiresAt - Date.now());
    setState({
      qr: { fidoUri: frame.fidoUri, expiresAt, rpOrigin: frame.rpOrigin },
      relay: null,
      scan: "scanning",
      scanDetail: undefined,
    });
    toOffscreen({ type: "scan:start" });
  };

  const takeFrame = (payload: Record<string, unknown>) => {
    if (payload.kind === "passkey_qr") {
      takeQr(payload as unknown as Parameters<typeof takeQr>[0]);
    } else if (payload.kind === "passkey_status") {
      const relay = payload.status as BridgeState["relay"];
      setState({ relay });
      if (relay && RELAY_DONE.has(relay)) {
        stopScan();
      }
    }
  };

  const hubSocketUrl = (hubUrl: string, token: string): string => {
    const url = new URL(hubUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/ws/dashboard";
    // A browser socket sets no headers: the owner's token rides the query.
    url.search = new URLSearchParams({
      protocol: String(WIRE_PROTOCOL),
      ...(token ? { token } : {}),
    }).toString();
    return url.toString();
  };

  const connect = async () => {
    clearTimeout(reconnect);
    socket?.close();
    socket = undefined;
    const { hubUrl, hubToken } = await chrome.storage.sync.get([
      "hubUrl",
      "hubToken",
    ]);
    if (typeof hubUrl !== "string" || !hubUrl) {
      setState({ hub: "idle" });
      return;
    }
    setState({ hub: "connecting" });
    let ws: WebSocket;
    try {
      ws = new WebSocket(
        hubSocketUrl(hubUrl, typeof hubToken === "string" ? hubToken : "")
      );
    } catch {
      setState({ hub: "closed" });
      return;
    }
    socket = ws;
    ws.onopen = () => setState({ hub: "connected" });
    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(String(event.data));
        if (frame?.verb === "frames" && frame.payload) {
          takeFrame(frame.payload);
        }
      } catch {
        // Not JSON: nothing this extension reads.
      }
    };
    ws.onclose = () => {
      if (socket !== ws) {
        return;
      }
      setState({ hub: "closed" });
      reconnect = setTimeout(connect, RECONNECT_MS);
    };
  };

  const sendAdvert = (advert: {
    capturedAt: number;
    rssi: number;
    serviceData: string;
  }) => {
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(
      JSON.stringify({
        verb: "frames",
        machineId: "",
        payload: { kind: "passkey_advert", ...advert },
      })
    );
    setState({ scan: "captured" });
  };

  chrome.runtime.onMessage.addListener((message: BridgeMessage) => {
    switch (message.type) {
      case "advert": {
        sendAdvert(message);
        break;
      }
      case "scan:running": {
        setState({ scan: "scanning", scanDetail: undefined });
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
      default:
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && (changes.hubUrl || changes.hubToken)) {
      connect();
    }
  });

  // A worker that woke again keeps what the last one knew.
  chrome.storage.session.get(STATE_KEY).then((kept) => {
    const known = kept[STATE_KEY] as BridgeState | undefined;
    if (known?.qr && known.qr.expiresAt > Date.now()) {
      state = known;
      expiry = setTimeout(clearQr, known.qr.expiresAt - Date.now());
    }
    connect();
  });
});
