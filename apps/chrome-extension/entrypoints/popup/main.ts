/**
 * Popup: when a FIDO URI is pending, renders a large scannable QR code
 * with the relying party origin. When nothing is pending, shows
 * connection status and hub URL configuration.
 */

import { encode } from "uqr";

interface PasskeyQr {
  fidoUri: string;
  origin?: string;
  expiresAt: number;
}

const app = document.getElementById("app")!;

/** A Solar key SVG inline, matching the dashboard's icon. */
const KEY_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M15.5 14.5a5.5 5.5 0 1 0-4.13-1.85L2 22h3v-3h3v-3h3l1.52-1.52c.59.2 1.24.02 1.98.02Z" fill="currentColor" opacity=".5"/><path d="M18 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" fill="currentColor"/></svg>`;

async function render() {
  // Ask the background for a pending passkey QR.
  const response = await chrome.runtime.sendMessage({
    type: "cawco:get_pending",
  });
  const qr: PasskeyQr | null = response?.qr ?? null;

  if (qr && qr.expiresAt > Date.now()) {
    renderQr(qr);
  } else {
    renderEmpty();
  }
}

function renderQr(qr: PasskeyQr) {
  const { data, size } = encode(qr.fidoUri, { ecc: "M", border: 2 });
  let path = "";
  data.forEach((row: boolean[], y: number) => {
    row.forEach((on: boolean, x: number) => {
      if (on) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    });
  });

  const rpDisplay = qr.origin ? qr.origin.replace(/^https?:\/\//, "") : null;

  app.innerHTML = `
    <div class="header">
      ${KEY_SVG}
      <span class="title">Passkey sign-in</span>
    </div>
    <div class="qr-container">
      <svg
        viewBox="0 0 ${size} ${size}"
        aria-label="Passkey QR code${rpDisplay ? ` for ${rpDisplay}` : ""}"
        role="img"
      >
        <path d="${path}" fill="black" shape-rendering="crispEdges" />
      </svg>
    </div>
    <p class="scan-line">
      Scan with your phone to sign in${rpDisplay ? ` to <span class="origin">${rpDisplay}</span>` : ""}
    </p>
    <button class="dismiss" id="dismiss">Dismiss</button>
  `;

  document.getElementById("dismiss")!.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({ type: "cawco:dismiss" });
    render();
  });
}

function renderEmpty() {
  // Check for saved hub URL.
  chrome.storage.sync.get("hubUrl", (items) => {
    const hubUrl = items.hubUrl as string | undefined;

    app.innerHTML = `
      <div class="header">
        ${KEY_SVG}
        <span class="title">CawCo Passkey Bridge</span>
      </div>
      <div class="empty">
        <div class="empty-icon">🔐</div>
        <p class="empty-line">No passkey QR pending</p>
        <p class="empty-line">When a site asks for a passkey during a browser takeover, the QR appears here.</p>
      </div>
      ${
        hubUrl
          ? `<div class="connected"><span class="dot"></span> Connected to ${new URL(hubUrl).hostname}</div>`
          : ""
      }
      <div class="setup">
        <label for="hub-url">Hub URL</label>
        <input
          id="hub-url"
          type="url"
          placeholder="https://your-hub.ts.net:3455"
          value="${hubUrl ?? ""}"
        />
        <button id="save-hub">Save</button>
      </div>
    `;

    document.getElementById("save-hub")!.addEventListener("click", () => {
      const input = document.getElementById("hub-url") as HTMLInputElement;
      const url = input.value.trim();
      if (url) {
        chrome.storage.sync.set({ hubUrl: url }, () => {
          render();
        });
      }
    });
  });
}

render();
