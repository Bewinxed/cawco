/** The project moves the hub is carrying, whole on every snapshot and `moves` frame. */
import type { MoveJob } from "@cawco/core/move";
import type { BoardFrame, FrameOf } from "../hub/frames";

const movesState = $state<{
  /**
   * The project moves the hub is carrying (core move.ts), whole: handed on
   * connect in the `instances` frame, then replaced by each `moves` frame.
   */
  moves: MoveJob[];
}>({
  moves: [],
});

/**
 * A move as the hub just answered a Cancel or a Retry: it stands in the table
 * at once, so no screen reads an older stage than that answer while the
 * `moves` frame carrying it is still on its way. The frame replaces it.
 */
export function heardMove(job: MoveJob): void {
  const at = movesState.moves.findIndex((one) => one.id === job.id);
  const held = movesState.moves[at];
  if (held && Date.parse(held.updatedAt) > Date.parse(job.updatedAt)) {
    return;
  }
  movesState.moves =
    at === -1 ? [...movesState.moves, job] : movesState.moves.with(at, job);
}

/** The project moves, handed whole with every snapshot. */
export function takeBoardMoves(frame: BoardFrame): void {
  if (frame.kind === "instances") {
    movesState.moves = frame.moves;
  }
}

/** Every project move, whole, on each change (and `heardMove` between). */
export function takeMoves(frame: FrameOf<"moves">): void {
  movesState.moves = frame.moves;
}

/** The project moves the hub is carrying. */
export const movesStore = {
  /** The project moves the hub is carrying, settled ones for a few minutes after (move.svelte.ts). */
  get moves(): MoveJob[] {
    return movesState.moves;
  },
};
