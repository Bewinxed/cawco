/**
 * What both options lay over today's inline chip (ui/chip `inline`, merged
 * after it on the element): its ground named as `--chip-ground` (the
 * chip's own `surface-recess`, `surface-hover` under a pointer), so a pin
 * pill's ring is cut in it and reads as the chip, not a pale band.
 */
export const CHIP_GROUND =
  "[--chip-ground:var(--surface-recess)] can-hover:enabled:hover:[--chip-ground:var(--surface-hover)]";
