/**
 * FNV-1a, 32 bits: a tiny, stable hash with a good spread on short strings,
 * the same in the hub, the agent and a page. Not for anything an adversary
 * picks.
 */
export const fnv1a = (text: string): number => {
  let hash = 0x81_1c_9d_c5;
  for (let i = 0; i < text.length; i += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: FNV-1a is defined on bits
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: the unsigned 32-bit value
  return hash >>> 0;
};
