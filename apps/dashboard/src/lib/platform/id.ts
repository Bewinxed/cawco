/**
 * A request id that works wherever the dashboard is opened.
 *
 * `crypto.randomUUID` is restricted to secure contexts: https on any host, or
 * http on localhost. The moment this UI is served to another machine over plain
 * http — a tailnet address, a LAN ip — the function is simply absent, and every
 * call site that reaches for it throws. Those call sites are the socket's
 * request ids, so the failure is total rather than cosmetic: nothing can be
 * asked of the hub at all.
 *
 * `crypto.getRandomValues` has no such restriction, so the fallback is a real
 * version 4 UUID from the same entropy source, not a weaker stand-in.
 *
 * `source` defaults to the real global so every existing call site is
 * unchanged; it exists so a test can hand in a stub `Crypto` with no
 * `randomUUID` and exercise the fallback branch without a browser.
 */
export function newId(source: Crypto = globalThis.crypto): string {
  if (
    typeof source !== "undefined" &&
    typeof source.randomUUID === "function"
  ) {
    return source.randomUUID();
  }

  const bytes = new Uint8Array(16);
  source.getRandomValues(bytes);
  // Version 4, variant 1 — the two fields a v4 UUID pins rather than randomises.
  // biome-ignore lint/suspicious/noBitwiseOperators: masking and setting specific bits per RFC 4122, not booleans
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // biome-ignore lint/suspicious/noBitwiseOperators: masking and setting specific bits per RFC 4122, not booleans
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (const byte of bytes) {
    hex.push(byte.toString(16).padStart(2, "0"));
  }
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

/** Words a send carried, and the id it went under. */
export interface SentWords {
  id: string;
  text: string;
}

/**
 * The id words go to the hub under: the one the same words went under last
 * time when that send did not go through (the hub may have kept them, and
 * takes the same id again as the same message, comment or ask), else
 * `fresh`. `kept` is the caller's own slot: it holds what this send carries
 * and is cleared by the caller once the send went.
 */
export const idForWords = (
  kept: SentWords | null,
  text: string,
  fresh: string = newId()
): SentWords => (kept?.text === text ? kept : { text, id: fresh });
