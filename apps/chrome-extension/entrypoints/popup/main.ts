/**
 * Popup: the bridge's status (dashboard link, BLE scan) and the pending
 * passkey QR as a visual reference. It has nothing to set: it asks the
 * background worker for its state and redraws when it changes.
 */
import { encode } from "uqr";
import { bleAvailability, FLAG_INSTRUCTION } from "../../lib/ble";
import {
  type BridgeMessage,
  type BridgeState,
  IDLE_STATE,
} from "../../lib/state";

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

/** The status line: this page checks Bluetooth itself, so it speaks before any QR arrives. */
const statusLine = (
  state: BridgeState
): { text: string; tone: "ok" | "warn" | "plain" } => {
  switch (state.ble) {
    case "no_bluetooth": {
      return { text: "No Bluetooth on this device", tone: "warn" };
    }
    case "no_scan_api": {
      return { text: `Enable ${FLAG_INSTRUCTION}`, tone: "warn" };
    }
    case "permission_denied": {
      return { text: "Bluetooth permission denied", tone: "warn" };
    }
    case "error": {
      return {
        text: `Scan failed: ${state.bleDetail ?? "unknown error"}`,
        tone: "warn",
      };
    }
    case "scanning": {
      return { text: "Scanning for passkey...", tone: "plain" };
    }
    case "captured": {
      return { text: "Captured! Relaying to hub...", tone: "ok" };
    }
    default: {
      const ready = bleAvailability();
      if (ready === "no_bluetooth") {
        return { text: "No Bluetooth on this device", tone: "warn" };
      }
      if (ready === "no_scan_api") {
        return { text: `Enable ${FLAG_INSTRUCTION}`, tone: "warn" };
      }
      return { text: "Ready: no passkey sign-in waiting", tone: "plain" };
    }
  }
};

const dashboardLine = (dashboards: number): string =>
  dashboards === 0 ? "No dashboard detected" : "Connected to dashboard";

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

function render(state: BridgeState, dashboards: number) {
  const { qr } = state;
  const rp = qr?.rpOrigin?.replace(/^https?:\/\//u, "");

  const status = statusLine(state);
  app.innerHTML = `
    <div class="header">${KEY_SVG}<span class="title">CawCo Passkey Bridge</span></div>
    <p class="scan-line status status-${status.tone}" role="status">${escape(status.text)}</p>
    <p class="scan-line">${dashboardLine(dashboards)}</p>
    ${
      qr
        ? `<div class="qr-container">${qrSvg(qr.fidoUri, `Passkey QR code${rp ? ` for ${rp}` : ""}`)}</div>
           <p class="scan-line">${rp ? `Passkey for <span class="origin">${escape(rp)}</span>` : "Passkey sign-in"}</p>`
        : `<div class="empty"><p class="empty-line">No passkey sign-in waiting</p></div>`
    }
    ${qr ? `<button class="dismiss" id="dismiss">Dismiss</button>` : ""}
  `;

  document.getElementById("dismiss")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "dismiss" } satisfies BridgeMessage);
  });
}

/** How many open tabs have the content script on a CawCo dashboard: each answers a ping, any other tab does not. */
const countDashboards = async (): Promise<number> => {
  const tabs = await chrome.tabs.query({});
  const answers = await Promise.all(
    tabs.map((tab) =>
      tab.id === undefined
        ? undefined
        : chrome.tabs
            .sendMessage(tab.id, { type: "ping" } satisfies BridgeMessage)
            .catch(() => undefined)
    )
  );
  return answers.filter(Boolean).length;
};

const read = async (): Promise<BridgeState> =>
  (await chrome.runtime
    .sendMessage({ type: "state:get" } satisfies BridgeMessage)
    .catch(() => undefined)) ?? IDLE_STATE;

let dashboards = 0;
chrome.runtime.onMessage.addListener((message: BridgeMessage) => {
  if (message.type === "state") {
    render(message.state, dashboards);
  }
});

Promise.all([read(), countDashboards()]).then(([state, count]) => {
  dashboards = count;
  render(state, dashboards);
});
