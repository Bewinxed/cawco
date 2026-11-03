/**
 * Bytes as base64 and back, in a browser or Bun alike (`btoa`, `atob`):
 * a Yjs update a Send carries (core `SendBody.writes`), from the page's
 * overlay and the dashboard's Sends.
 */

/** Bytes one `String.fromCharCode` spreads at most: well under any engine's argument limit. Our call. */
const CHUNK = 32_768;

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let at = 0; at < bytes.length; at += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(at, at + CHUNK));
  }
  return btoa(binary);
};

/** The bytes `text` holds; null when it is no base64. */
export const base64ToBytes = (text: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};
