/**
 * The continuations the hub is carrying, as the board and its deltas hand
 * them on, and the ids sessions had before the hub folded them.
 */
import type { ContinuationJob } from "@cawco/core/protocol";
import type { BoardFrame } from "../hub/frames";
import { equal } from "./same";

const continuationsState = $state({
  /**
   * The continuations the hub is carrying, as it publishes them: what the
   * Continue dialog follows, and what opens the new session of one this tab
   * started after its dialog was dismissed.
   */
  continuations: [] as ContinuationJob[],
  /**
   * The ids sessions had before the hub folded each one's continuations at
   * its account's limit into it: former id → its id now. A tab on a former
   * id is that session's.
   */
  formerIds: {} as Record<string, string>,
});

/** Who hears the continuation table each time it moves (see {@link followContinuations}). */
let continuationFollower: ((table: ContinuationJob[]) => void) | null = null;

/**
 * Hands `follower` the continuation table every time the hub's word on it
 * lands — a publish, or the read on connect. One follower: the parked
 * starts' (spawn/parked.svelte.ts), which follow every continuation this tab
 * started.
 */
export function followContinuations(
  follower: (table: ContinuationJob[]) => void
): void {
  continuationFollower = follower;
}

function adoptContinuations(table: ContinuationJob[]): void {
  if (equal(continuationsState.continuations, table)) {
    return;
  }
  continuationsState.continuations = table;
  continuationFollower?.(table);
}

/** The continuations the hub carries, and the ids its folds left behind. */
export function takeBoardContinuations(frame: BoardFrame): void {
  if (frame.continuations) {
    adoptContinuations(frame.continuations);
  }
  // Whole whenever it moved: a session folded into its continuation
  // leaves its tab on the session it is now (SessionSurface).
  if (
    frame.formerIds &&
    !equal(continuationsState.formerIds, frame.formerIds)
  ) {
    continuationsState.formerIds = frame.formerIds;
  }
}

/** The continuations the hub carries, and the ids its folds left behind. */
export const continuationsStore = {
  /** The continuations the hub is carrying, settled ones for a few minutes after. */
  get continuations(): ContinuationJob[] {
    return continuationsState.continuations;
  },
  /** Former id → the id its session has now (the hub's fold of older continuations). */
  get formerIds(): Record<string, string> {
    return continuationsState.formerIds;
  },
};
