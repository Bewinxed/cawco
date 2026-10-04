/**
 * What the tab icon shows in each of its states: Caw's head only, since his
 * whole body cannot be read at the 16 px a tab draws (owner: "his full body
 * is unreadable in there"). Each state is one of his existing drawings (or a
 * run of them), seen through a fixed box around his head; the box does not
 * follow him, so his head moves inside the tile. Every box has the same side,
 * so his head is the same size in every state.
 *
 * Frames are the loop's own, at the 24 a second its take was shot at
 * (assets/mascot/loops/<loop>/timing.json); a drawing holds two.
 */

/** The side of the head box, in units of the stills' 512 box: his 220-unit head and its bob. */
export const HEAD = 280;

/** Frames a second in every loop's animation. */
export const FPS = 24;

export interface Shot {
  /** The loop's animation in the status file; a resting file has none. */
  animation?: string;
  /** The head box's centre, in the stills' 512 box. */
  at: { x: number; y: number };
  /** The frame the still is. */
  frame: number;
  /** The status file it is drawn from. */
  status: "needs-you" | "working" | "sleeping";
  /** The token the tile is filled with. */
  tile: "spark" | "vermilion";
}

/**
 * Something needs the operator: the pleading bob of `needs-you-point-plead`,
 * drawings 16 to 35 (frames 46 to 85). His head faces the tab, eyes wide and
 * a tear at one, bouncing every three drawings while it stays in place: the
 * part of his needs-you acting that is carried by his head. His other loops
 * are carried by his wings, and his head leaves any box its size (`hey` jumps
 * and crouches 170 units, `knock` swings 100 sideways).
 */
export const NEEDS_YOU: Shot & { from: number; to: number } = {
  status: "needs-you",
  animation: "loop_needs-you-point-plead",
  at: { x: 240, y: 172 },
  from: 46,
  to: 86,
  // Drawing 17, mid-bob with his eyes widest: the still under Reduced Motion.
  frame: 48,
  tile: "vermilion",
};

/**
 * Something is working and nothing needs the operator: drawing 7 of
 * `working-idea` (frame 20), his head up and his eyes open on a thought. The
 * working still itself has his head down by his feet, where a head box holds
 * mostly beak.
 */
export const WORKING: Shot = {
  status: "working",
  animation: "loop_working-idea",
  at: { x: 245, y: 150 },
  frame: 20,
  tile: "spark",
};

/** Nothing going on: his `sleeping` rest, eyes closed and head dropped. */
export const SLEEPING: Shot = {
  status: "sleeping",
  at: { x: 330, y: 255 },
  frame: 0,
  tile: "spark",
};
