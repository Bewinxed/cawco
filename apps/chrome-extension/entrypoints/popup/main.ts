/**
 * Popup: the bridge's status (hub link, BLE scan, relay), the pending
 * passkey QR as a visual reference, and the hub URL setting. It reads the
 * state the background worker keeps and redraws when it changes.
 */
import { encode } from "uqr";
import { FLAG_INSTRUCTION } from "../../lib/ble";
import { type BridgeState, IDLE_STATE, STATE_KEY } from "../../lib/state";

const app = document.getElementById("app") as HTMLElement;

const KEY_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M15.5 14.5a5.5 5.5 0 1 0-4.13-1.85L2 22h3v-3h3v-3h3l1.52-1.52c.59.2 1.24.02 1.98.02Z" fill="currentColor" opacity=".5"/><path d="M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/></svg>`;

const escape = (text: string): string =>
  text.replace(
    /[&<>"']/gu,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c
  );

const HUB_WORDS: Record<BridgeState["hub"], string> = {
  idle: "No hub set",
  connecting: "Connecting to the hub…",
  connected: "Connected to the hub",
  closed: "Hub unreachable, retrying",
};

const RELAY_WORDS: Record<NonNullable<BridgeState["relay"]>, string> = {
  scanning: "Hub: scanning",
  captured: "Hub: advert received",
  injected: "Hub: advert injected into the browser",
  authenticated: "Hub: signed in",
  timeout: "Hub: timed out",
  no_ble: "Hub: no Bluetooth on the agent machine",
};

const scanLine = (state: BridgeState): string => {
  switch (state.scan) {
    case "scanning": {
      return "Scanning for passkey...";
    }
    case "captured": {
      return "Captured!";
    }
    case "needs-flag": {
      return FLAG_INSTRUCTION;
    }
    case "failed": {
      return `Scan failed: ${state.scanDetail ?? "unknown error"}`;
    }
    default: {
      return "";
    }
  }
};

const qrSvg = (fidoUri: string, label: string): string => {
  const { data, size } = encode(fidoUri, { ecc: "M", border: 2 });
  let path = "";
  for (const [y, row] of data.entries()) {
    for (const [x, on] of row.entries()) {
      if (on) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" aria-label="${escape(label)}" role="img"><path d="${path}" fill="black" shape-rendering="crispEdges" /></svg>`;
};

async function render(state: BridgeState) {
  const { hubUrl } = await chrome.storage.sync.get("hubUrl");
  const hubValue = typeof hubUrl === "string" ? hubUrl : "";
  const { hubToken } = await chrome.storage.sync.get("hubToken");
  const tokenValue = typeof hubToken === "string" ? hubToken : "";
  const { qr } = state;
  const rp = qr?.rpOrigin?.replace(/^https?:\/\//u, "");
  const lines = [
    scanLine(state),
    state.relay ? RELAY_WORDS[state.relay] : "",
  ].filter(Boolean);

  app.innerHTML = `
    <div class="header">${KEY_SVG}<span class="title">CawCo Passkey Bridge</span></div>
    ${
      qr
        ? `<div class="qr-container">${qrSvg(qr.fidoUri, `Passkey QR code${rp ? ` for ${rp}` : ""}`)}</div>
           <p class="scan-line">${rp ? `Passkey for <span class="origin">${escape(rp)}</span>` : "Passkey sign-in"}</p>`
        : `<div class="empty"><p class="empty-line">No passkey sign-in waiting</p></div>`
    }
    ${lines.map((line) => `<p class="scan-line" role="status">${escape(line)}</p>`).join("")}
    <div class="connected"><span class="dot"></span> ${HUB_WORDS[state.hub]}</div>
    ${qr ? `<button class="dismiss" id="dismiss">Dismiss</button>` : ""}
    <div class="setup">
      <label for="hub-url">Hub URL</label>
      <input id="hub-url" type="url" placeholder="https://your-hub.ts.net:3455" value="${escape(hubValue)}" />
      <label for="hub-token">Owner token</label>
      <input id="hub-token" type="password" autocomplete="off" value="${escape(tokenValue)}" />
      <button id="save-hub">Save</button>
    </div>
  `;

  document.getElementById("dismiss")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "dismiss" });
  });
  document.getElementById("save-hub")?.addEventListener("click", () => {
    const input = document.getElementById("hub-url") as HTMLInputElement;
    const url = input.value.trim();
    const token = (
      document.getElementById("hub-token") as HTMLInputElement
    ).value.trim();
    if (url) {
      chrome.storage.sync.set({ hubUrl: url, hubToken: token });
    }
  });
}

const read = async (): Promise<BridgeState> => {
  const kept = await chrome.storage.session.get(STATE_KEY);
  return (kept[STATE_KEY] as BridgeState | undefined) ?? IDLE_STATE;
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "session" && changes[STATE_KEY]) {
    render(changes[STATE_KEY].newValue as BridgeState);
  } else if (area === "sync" && (changes.hubUrl || changes.hubToken)) {
    read().then(render);
  }
});

read().then(render);
