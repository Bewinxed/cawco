/**
 * What the tab icon shows in each of its states: Caw's head, since his whole
 * body cannot be read at the 16 px a tab draws (owner: "his full body is
 * unreadable in there"). Each state is one of his existing drawings (or a run
 * of them), seen through a fixed box; the box does not follow him.
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
  status: "needs-you" | "working" | "sleeping";
}

/** A still's box: his 220-unit head fills the tile. */
const HEAD = 280;

/**
 * Something needs the operator: Caw waving at them (owner: "caw 'waving' at
 * the user like hey pay attention"). It is the wing-beat of `needs-you-hey`,
 * drawings 21 to 36 (frames 54 to 85), seen through a box that holds his
 * head and his right wing and nothing else of him, so the beat reads as one
 * wing raised beside his head and dropped again, four times in the loop.
 *
 * His head does not move in those drawings (his eyes' centre is the same
 * pixel of the tile in all 16), so the box needs no steadying. The run starts
 * and ends with the wing down, so the loop joins without a jump. Of his other
 * takes, `point-plead` raises a wing that barely moves (9 of a 16 px tile's
 * 256 pixels change a drawing, against 45 here) and `knock` keeps both wings
 * folded.
 *
 * The box is wider than a still's, for the wing: his head is a fifth smaller
 * here than in the other states.
 */
export const NEEDS_YOU: Shot & { from: number; to: number } = {
  status: "needs-you",
  animation: "loop_needs-you-hey",
  box: { x: 318, y: 205, side: 350 },
  from: 54,
  to: 86,
  // Drawing 27, his wing at its highest: the still under Reduced Motion.
  frame: 66,
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
  box: { x: 245, y: 150, side: HEAD },
  frame: 20,
};

/** Nothing going on: his `sleeping` rest, eyes closed and head dropped. */
export const SLEEPING: Shot = {
  status: "sleeping",
  box: { x: 330, y: 255, side: HEAD },
  frame: 0,
};
