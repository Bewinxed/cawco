/**
 * What occupies the preview well: one state at a time, so two covers never
 * stand together or say contradicting things. PreviewPane draws the well
 * from it alone.
 */
import type { PreviewDown } from "@cawco/core/preview/protocol";
import type { StageState } from "@cawco/core/stage";
import type { CoverWaiting } from "./CoverState.svelte";

export type WellState =
  /** An unrecorded port preview's server stopped: only its session making it again brings it back. */
  | { kind: "unrecorded" }
  /** A hop that keeps the page from being shown: the hub's word, or the proxy's page in the frame. */
  | { kind: "down"; down: PreviewDown }
  /** The stage or the server didn't start, or failed its restarts. */
  | { kind: "stage-error"; staged: StageState }
  /** On its way past the time its stage is given. */
  | { kind: "never-drawn" }
  /** The hub opened no origin for it: no frame stands. */
  | { kind: "unopened"; said: string }
  /** This tab can't reach the preview's origin: no frame stands. */
  | { kind: "unreached" }
  /** The frame loaded and its page never said a word: the browser drew its own error page. */
  | { kind: "not-loaded" }
  /** The cover stands over the frame while the page is on its way; `waiting` is what it says. */
  | { kind: "loading"; waiting: CoverWaiting | null }
  /** The page stands drawn, or the frame it replaces bridges for it with no cover drawn. */
  | { kind: "ready" };

export interface WellFacts {
  readonly down: PreviewDown | null;
  /** The current frame's page stands drawn, or the frame it replaces still stands for it. */
  readonly drawn: boolean;
  /** The pane draws a page frame of its own (no canvas stage, no browser stream). */
  readonly framed: boolean;
  readonly hubHeld: boolean;
  readonly neverDrawn: boolean;
  readonly notLoaded: boolean;
  readonly staged: StageState | null;
  readonly unopened: string | null;
  readonly unreached: boolean;
  readonly unrecordedDown: boolean;
  readonly waiting: CoverWaiting | null;
}

/**
 * The well's state, first match wins:
 * 1. `unrecorded` refines a stopped server (the hub's or the proxy's `server`,
 *    or a frame that loaded nothing): its cover takes the place of the down
 *    page's Try again, which can start nothing.
 * 2. `down` the hub said: no frame is asked for, so nothing the stage or the
 *    frame says stands above it.
 * 3. `stage-error`, then 4. `never-drawn`: the stage's own word.
 * 5. `unopened`, then 6. `unreached`: no frame stands, so nothing a frame
 *    said (the proxy's down page, a silent load) applies.
 * 7. `down` the proxy's page said, then 8. `not-loaded`.
 * 9. `loading` until the page is drawn, with nothing to wait on; else 10. `ready`.
 */
export const wellState = (facts: WellFacts): WellState => {
  if (facts.unrecordedDown) {
    return { kind: "unrecorded" };
  }
  if (facts.hubHeld && facts.down) {
    return { kind: "down", down: facts.down };
  }
  if (facts.staged?.status === "error") {
    return { kind: "stage-error", staged: facts.staged };
  }
  if (facts.neverDrawn) {
    return { kind: "never-drawn" };
  }
  if (facts.framed && facts.unopened) {
    return { kind: "unopened", said: facts.unopened };
  }
  if (facts.framed && facts.unreached) {
    return { kind: "unreached" };
  }
  if (facts.down) {
    return { kind: "down", down: facts.down };
  }
  if (facts.notLoaded) {
    return { kind: "not-loaded" };
  }
  if (facts.framed && (facts.waiting || !facts.drawn)) {
    return { kind: "loading", waiting: facts.waiting };
  }
  return { kind: "ready" };
};
