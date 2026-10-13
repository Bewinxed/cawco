/**
 * A version 4 UUID from `crypto.getRandomValues`. The page runs on the
 * dashboard's origin, which a tailnet or LAN address serves over plain http,
 * where `crypto.randomUUID` (secure contexts only) is absent.
 */
export function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // Version 4, variant 1: the two fields a v4 UUID pins (RFC 9562 §5.4).
  // biome-ignore lint/suspicious/noBitwiseOperators: setting the version's bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  // biome-ignore lint/suspicious/noBitwiseOperators: setting the variant's bits
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
