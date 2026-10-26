/**
 * Where a comment's card stands as the page scrolls under it (PinFloatGoo):
 * still, until it must move, then once to its next spot (the owner: "only
 * letting it move when it reaches the spot where it will move from one spot
 * to the next, it should animate THEN, not animate WHILE i'm scrolling").
 */

/** A box's run down the well, px. */
export interface Run {
  h: number;
  y: number;
}

/** The well's room for a card `tall` px high: a top held whole inside it. */
export type InY = (y: number) => number;

/**
 * Beside its pill: it keeps `held` while the pill stays within its height;
 * once the pill has left over its top, its foot goes to the pill's foot;
 * once it has left under its foot, its top goes to the pill's top.
 */
export function besideTop(
  held: number,
  pill: Run,
  tall: number,
  inY: InY
): number {
  if (pill.y + pill.h < held) {
    return inY(pill.y + pill.h - tall);
  }
  if (pill.y > held + tall) {
    return inY(pill.y);
  }
  return held;
}

/** A card under or over what its comment is about, as it stands now. */
export interface Stacked {
  /** What the comment is about. */
  about: Run;
  /** Its distance from what it is about. */
  clear: number;
  /** The well's edge room. */
  gap: number;
  held: number;
  inY: InY;
  /** The well's height. */
  roomH: number;
  side: "top" | "bottom";
  tall: number;
}

/**
 * Under or over what it is about: it keeps `held` while that stays clear of
 * it and within its height. Come onto it, it goes to the other side where
 * there is room, so the page goes on scrolling away from it; else a whole
 * height ahead where that clears it and is a real step (half its height or
 * more); else it waits. Gone more than its height away, back beside it.
 */
export function stackedSpot(at: Stacked): {
  side: "top" | "bottom";
  top: number;
} {
  const { about, clear, gap, held, inY, roomH, side, tall } = at;
  const under = inY(about.y + about.h + clear);
  const over = inY(about.y - clear - tall);
  if (side === "bottom") {
    const foot = about.y + about.h + clear;
    if (foot > held) {
      if (about.y - clear - tall >= gap) {
        return { side: "top", top: over };
      }
      const ahead = inY(under + tall);
      const step = ahead >= foot - 0.5 && ahead - held >= tall / 2;
      return { side, top: step ? ahead : held };
    }
    return { side, top: foot < held - tall ? under : held };
  }
  const head = about.y - clear;
  if (head < held + tall) {
    if (about.y + about.h + clear + tall <= roomH - gap) {
      return { side: "bottom", top: under };
    }
    const ahead = inY(over - tall);
    const step = ahead + tall <= head + 0.5 && held - ahead >= tall / 2;
    return { side, top: step ? ahead : held };
  }
  return { side, top: head > held + 2 * tall ? over : held };
}
