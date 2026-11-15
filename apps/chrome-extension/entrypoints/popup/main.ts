/**
 * Popup: the bridge's status (dashboard link, BLE scan) and the pending
 * passkey QR as a visual reference. It has nothing to set: it asks the
 * background worker for its state and redraws when it changes.
 */
import { encode } from "uqr";
import { FLAG_INSTRUCTION } from "../../lib/ble";
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

const scanLine = (state: BridgeState, dashboards: number): string => {
  if (dashboards === 0) {
    return "No dashboard";
  }
  switch (state.scan) {
    case "scanning": {
      return "Scanning...";
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
      return "Connected";
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

function render(state: BridgeState, dashboards: number) {
  const { qr } = state;
  const rp = qr?.rpOrigin?.replace(/^https?:\/\//u, "");

  app.innerHTML = `
    <div class="header">${KEY_SVG}<span class="title">CawCo Passkey Bridge</span></div>
    ${
      qr
        ? `<div class="qr-container">${qrSvg(qr.fidoUri, `Passkey QR code${rp ? ` for ${rp}` : ""}`)}</div>
           <p class="scan-line">${rp ? `Passkey for <span class="origin">${escape(rp)}</span>` : "Passkey sign-in"}</p>`
        : `<div class="empty"><p class="empty-line">No passkey sign-in waiting</p></div>`
    }
    <p class="scan-line" role="status">${escape(scanLine(state, dashboards))}</p>
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
