/**
 * Extract FIDO:/ URIs from the current page of a browser's CDP connection.
 *
 * The passkey QR code is usually rendered in Chromium's WebAuthn dialog,
 * which puts a `FIDO:/` URI into the page (in a canvas, an img, text
 * content, or a data attribute). The simplest and most reliable method is
 * DOM inspection via CDP `Runtime.evaluate`: it needs no image decoding
 * library, and the URI is the only thing the dashboard and the iOS app
 * need in order to render a clear, scannable QR locally.
 */

import type { CdpLink } from "./cdp-takeover";

/** The expression evaluated in the page context to find a FIDO URI. */
const FIND_FIDO_EXPR = `(() => {
  // Method 1: text nodes anywhere in the body.
  const walker = document.createTreeWalker(
    document.body || document.documentElement,
    NodeFilter.SHOW_TEXT
  );
  while (walker.nextNode()) {
    const m = walker.currentNode.textContent?.match(/FIDO:\\/\\S+/);
    if (m) return m[0];
  }
  // Method 2: data attributes that carry the URI.
  const el = document.querySelector('[data-fido-uri], [data-cable-uri]');
  if (el) {
    const v = el.getAttribute('data-fido-uri') || el.getAttribute('data-cable-uri');
    if (v) return v;
  }
  // Method 3: JSON script blocks (e.g. JSON-LD or app-embedded state).
  for (const s of document.querySelectorAll('script[type="application/json"]')) {
    const m = s.textContent?.match(/FIDO:\\/\\S+/);
    if (m) return m[0];
  }
  return null;
})()`;

/**
 * Extract a FIDO:/ URI from the current page of a browser's CDP connection.
 *
 * Searches the page DOM for FIDO:/ URIs via three progressively broader
 * methods (text nodes, data attributes, JSON script blocks). Returns the
 * first URI found, or `null`.
 *
 * @param cdp   An open browser-level CDP connection.
 * @param session  A flat CDP session on the page's target (from `cdp.attach`).
 */
export async function extractFidoUri(
  cdp: CdpLink,
  session?: string
): Promise<string | null> {
  try {
    const result = await cdp.call(
      "Runtime.evaluate",
      {
        expression: FIND_FIDO_EXPR,
        returnByValue: true,
      },
      session
    );
    const value = (result.result as { value?: unknown } | undefined)?.value;
    if (typeof value === "string" && value.startsWith("FIDO:/")) {
      return value;
    }
    return null;
  } catch {
    // The page or session may have gone away; that is not an error the
    // caller cares about — just no URI found.
    return null;
  }
}
