/**
 * The window events the canvas page shares with the preview overlay, which
 * stands in the same window and carries them to and from the pane (core
 * page-wire.ts): the pane's asks reach the page as a window event of the
 * message's name with its body as `detail`, and the page answers the same
 * way. Declared on `WindowEventMap`, so `addEventListener` hears each with
 * its detail typed. A module that listens imports this one.
 */

import type {
  CanvasView,
  FrameBody,
  FrameSaysBodies,
  PageBody,
  PageSaysBodies,
} from "@cawco/core/page-wire";
import type {
  STAGE_COMPARE,
  STAGE_DIALS,
  STAGE_DIALS_WRITTEN,
  STAGE_DIFFERENCES,
  STAGE_FAULT,
  STAGE_LAID,
  STAGE_LET_GO,
  STAGE_PAUSE,
  STAGE_PLAY,
  STAGE_REACH,
  STAGE_REACHED,
  STAGE_RETIME,
  STAGE_REVEAL,
  STAGE_RING,
  STAGE_ROOM,
  STAGE_SCROLLED,
  STAGE_SEEK,
  STAGE_TIME,
} from "@cawco/core/stage-graph";

/** The pane's asks of the stage (core page-wire `FrameSaysBodies`). */
type StageAsk =
  | typeof STAGE_COMPARE
  | typeof STAGE_DIALS
  | typeof STAGE_LET_GO
  | typeof STAGE_PAUSE
  | typeof STAGE_PLAY
  | typeof STAGE_REACH
  | typeof STAGE_RETIME
  | typeof STAGE_REVEAL
  | typeof STAGE_RING
  | typeof STAGE_ROOM
  | typeof STAGE_SEEK
  | "cawco:story-args"
  | "cawco:story-select";

/** The stage's answers (core page-wire `PageSaysBodies`). */
export type StageAnswer =
  | typeof STAGE_DIALS_WRITTEN
  | typeof STAGE_DIFFERENCES
  | typeof STAGE_FAULT
  | typeof STAGE_LAID
  | typeof STAGE_REACHED
  | typeof STAGE_SCROLLED
  | typeof STAGE_TIME;

declare global {
  interface WindowEventMap
    extends
      Readonly<{ [Type in StageAsk]: CustomEvent<FrameSaysBodies[Type]> }>,
      Readonly<{ [Type in StageAnswer]: CustomEvent<PageSaysBodies[Type]> }> {
    /** The pane's view, as the overlay checked it: what it set. */
    "cawco:canvas-view": CustomEvent<Partial<CanvasView>>;
    /** The pane's mode, as the overlay hears it. */
    "cawco:mode": CustomEvent<Pick<FrameBody<"cawco:mode">, "mode">>;
    /** A section's sheet, told the pane. */
    "cawco:sheet": CustomEvent<PageBody<"cawco:sheet">["sheet"]>;
  }
}
