/**
 * The sidebar rail's width is this browser's preference, not the fleet's. It
 * is read from a cookie so the server renders the resolved width into the
 * first paint — before this, the width lived only in localStorage, so SSR
 * drew the default and the rail visibly jumped once the client read the real
 * value on mount. The Shell's handle and the server's first paint hold it to
 * these bounds alike. No cookie is null: the shell then draws the
 * `c-sidebar-w` token, the default's one source.
 */
export const RAIL_MIN = 216;
export const RAIL_MAX = 520;

/** A rail width held to the bounds, in whole pixels. */
export const clampRail = (px: number): number =>
  Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(px)));
