/**
 * What the tab icon shows of Caw: his head, since his whole body cannot be
 * read at the 16 px a tab draws (owner: "his full body is unreadable in
 * there"). Each shot is one of his existing drawings (or a run of them), seen
 * through a fixed box; the box does not follow him. While sessions work the
 * icon is not Caw but the plain app icon (tab-icon-art.ts).
 *
 * Frames are the loop's own, at the 24 a second its take was shot at
 * (assets/mascot/loops/<loop>/timing.json); a drawing holds two.
 */

/** Frames a second in every loop's animation. */
export const FPS = 24;

export interface Shot {
  /** The loop's animation in the status file; a resting file has none. */
  animation?: string;
  /** The box he is seen through, in the stills' 512 box: its centre and side. */
  box: { x: number; y: number; side: number };
  /** The frame the still is. */
  frame: number;
  /** The status file it is drawn from. */
  status: "needs-you" | "sleeping" | "idle";
}

/** A still's box: his 220-unit head fills the tile. */
const HEAD = 280;

/**
 * Something needs the operator: Caw calling them over (owner: "caw 'waving'
 * at the user like hey pay attention"). It is his needs-you beat, the one
 * take needs-you.riv carries (`needs-you-point-plead`, the owner's pick for
 * that status): its whole move, drawings 0 to 42 (frames 0 to 99), without
 * the second of hold that ends the take. The take starts and ends on his
 * still, so the strip loops without a jump.
 *
 * The box holds his head as the still's box does (the 280-unit square at
 * 318, 205) and as much of the move as reads at 16 px: of every box that
 * holds that head, this one changes the most of a 16 px tile's 256 pixels a
 * drawing, 39 on average (ink changing by a quarter or more from the drawing
 * before), against 31 in the 350-unit box the hey wave was seen through and
 * 42 for that wave itself.
 */
export const NEEDS_YOU: Shot & { from: number; to: number } = {
  status: "needs-you",
  animation: "loop_needs-you-point-plead",
  box: { x: 276, y: 252, side: 380 },
  from: 0,
  to: 100,
  // Drawing 11, the one furthest from his still (111 of the tile's pixels):
  // the still under Reduced Motion.
  frame: 36,
};

/** Nothing going on: his `sleeping` rest, eyes closed and head dropped. */
export const SLEEPING: Shot = {
  status: "sleeping",
  box: { x: 330, y: 255, side: HEAD },
  frame: 0,
};
