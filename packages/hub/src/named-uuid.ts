import { createHash } from "node:crypto";

/**
 * A uuid `name` alone decides (the version-5 layout, over SHA-256): a send
 * made again under it is the same send, which the hub hands over once, and
 * whoever knows the name finds its record again.
 */
export const uuidOf = (name: string): string => {
  const hex = createHash("sha256").update(name).digest("hex");
  // The RFC 4122 variant: the nibble's top two bits are `10`.
  const variant = "89ab".charAt(Number.parseInt(hex.charAt(16), 16) % 4);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
