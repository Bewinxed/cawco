import { MediaQuery } from "svelte/reactivity";

const DEFAULT_MOBILE_BREAKPOINT = 768;

export class IsMobile extends MediaQuery {
  constructor(breakpoint: number = DEFAULT_MOBILE_BREAKPOINT) {
    super(`max-width: ${breakpoint - 1}px`);
  }
}

/**
 * A finger rather than a cursor.
 *
 * Width does not answer this. An iPad in landscape is 1024–1366 CSS px, the
 * same range as a laptop, and the interactions that differ between them are
 * not about how much room there is — a swipe exists or it does not. So the
 * question asked is the one that is actually meant.
 */
export class IsCoarsePointer extends MediaQuery {
  constructor() {
    super("pointer: coarse");
  }
}

/**
 * A touch device being held upright.
 *
 * This is how the tablet picks its layout, and it is asked as orientation
 * rather than as a width because width cannot tell the two apart: a 12.9"
 * iPad is 1024 px wide in portrait, and a 9.7" is 1024 px wide in landscape.
 * Any width line drawn between them puts one of the two on the wrong side.
 * A phone is covered by the width breakpoint it already had, in either
 * orientation, so this only ever adds the tablet held upright.
 */
export class IsTouchPortrait extends MediaQuery {
  constructor() {
    super("(pointer: coarse) and (orientation: portrait)");
  }
}

/**
 * The app's one narrow line: under 900px wide, or a touch device held
 * upright. The Shell, the session deck and `/config` all ask this, and the
 * Shell mirrors the answer into the `cawco-narrow` cookie the server reads.
 */
export const NARROW_QUERY =
  "(max-width: 899px), ((pointer: coarse) and (orientation: portrait))";
