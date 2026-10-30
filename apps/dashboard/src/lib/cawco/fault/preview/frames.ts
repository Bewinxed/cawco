/**
 * The window widths every failure-state frame stands at (the brief's 390,
 * 680, 1024, 1440 and 2560, and 1280, a desk that a pick page's card holds
 * whole), each with a window height of its own
 * shape, for the states files beside RegionFaultFixture.
 */
const HEIGHT = {
  390: 780,
  680: 760,
  1024: 720,
  1280: 800,
  1440: 840,
  2560: 1180,
} as const;

export type Width = keyof typeof HEIGHT;

/** A story at one width: the window's size as args and as the frame's viewport. */
export const at = (width: Width, args: Record<string, unknown> = {}) => ({
  args: { width, height: HEIGHT[width], ...args },
  parameters: { viewport: width },
});
