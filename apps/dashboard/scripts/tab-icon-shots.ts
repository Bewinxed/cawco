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
 * here than asleep.
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
 * Caw smiling back at the operator's pointer on his head in the top bar
 * (owner: "show the smiling ^^ caw's face/animation on hover and on click").
 * His ^^ face, both eyes closed upward arcs, is the contented hold of
 * `idle-preen`, drawings 18 to 32. The loop's tail runs from that face back
 * to his open-eyed rest: drawings 31, 32 (^^), 33, 34 (eyes shut, ◡◡) and 0
 * (open). The strip is that run backward, so it reads from rest into the
 * smile, and the bar plays it forward on a pointer's arrival and back on its
 * leaving. Each is the frame the drawing starts on (timing.json): 0, 94, 92,
 * 90 and 88.
 *
 * The box is his whole still box: these drawings are all of him, not a
 * head, and a box round his head cut his body off on a straight line. The
 * bar sizes it so his head is the size its rest face's head is.
 */
export const SMILE: Shot & { frames: number[] } = {
  status: "idle",
  animation: "loop_idle-preen",
  box: { x: 256, y: 256, side: 512 },
  frames: [0, 94, 92, 90, 88],
  // Drawing 31, the ^^ face: what Reduced Motion cross-fades to.
  frame: 88,
};

/** Nothing going on: his `sleeping` rest, eyes closed and head dropped. */
export const SLEEPING: Shot = {
  status: "sleeping",
  box: { x: 330, y: 255, side: HEAD },
  frame: 0,
};
