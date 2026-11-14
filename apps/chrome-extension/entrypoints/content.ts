/**
 * Content script injected on CawCo dashboard pages: sets a marker the
 * dashboard reads to detect the extension, and relays passkey QR
 * messages from the page to the background worker.
 */

export default defineContentScript({
  matches: ["*://*.localhost/*", "*://*.ts.net:*/*"],
  runAt: "document_start",
  main() {
    // Mark the page so the dashboard knows the extension is present.
    Object.defineProperty(window, "__cawco_extension", {
      value: true,
      writable: false,
      configurable: false,
    });

    // Listen for passkey QR messages from the dashboard page.
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (
        typeof data === "object" &&
        data !== null &&
        data.type === "cawco:passkey_qr"
      ) {
        // Forward to the background worker.
        chrome.runtime.sendMessage(data).catch(() => {
          // Extension context invalidated; ignore.
        });
      }
    });
  },
});
