/**
 * The design graph's line to its stage page (core stage-graph.ts), the
 * page that holds the component on its stage's origin inside the panel's
 * frame: what the graph posts it (a reach, a reveal, the view), and what it
 * last said (its sheets, how its drawing is laid out, the reach that
 * landed, a fault, a press), held as state the graph reads. One per
 * component artifact's pane (PreviewPane), which hears the page and hands
 * each word here.
 */
import type { SheetOnPage } from "@cawco/core/stage";
import {
  STAGE_REACH,
  STAGE_REVEAL,
  type StageFault,
  type StageLaid,
  type StageReach,
  type StageReached,
  type StateRef,
} from "@cawco/core/stage-graph";

/** The stage's view, as the view card picks it: its scheme, the width he picked (none: its own), reduced motion. */
export interface StageView {
  motion: "on" | "reduce";
  scheme: "light" | "dark";
  width: number | null;
}

export class StageLink {
  /** Each states file's sheet as the page said it (`cawco:sheet`), by its file. */
  sheets = $state<Record<string, SheetOnPage>>({});
  /** How the drawing is laid out (`cawco:stage-laid`); null until it is. */
  laid = $state<StageLaid | null>(null);
  /** The reach the page answered last (`cawco:stage-reached`). */
  reached = $state<StageReached | null>(null);
  /** The component threw as it mounted (`cawco:stage-fault`); null again with the next reach. */
  fault = $state<StageFault | null>(null);
  /** Each page that said it is ready: a new one holds no drawing, so the graph reaches its state again. */
  loads = $state(0);
  /** Presses the page heard (`cawco:press`): each closes the graph's open layers, a press on the stage being outside them. */
  presses = $state(0);
  readonly #post: (message: object) => void;
  #ask = 0;

  /** `post`: to the page, on its own origin, once it said it is ready (PreviewPane `post`). */
  constructor(post: (message: object) => void) {
    this.#post = post;
  }

  /**
   * The stage brought to `to`, from `from` (null: mounted afresh at it);
   * `play`: the move into `to` its states file plays, from `from`. Answers
   * the ask its answer echoes.
   */
  reach(
    to: StateRef,
    from: StateRef | null,
    { play, still }: { play: boolean; still: boolean }
  ): number {
    this.#ask += 1;
    this.fault = null;
    const message: StageReach & { type: string } = {
      type: STAGE_REACH,
      ask: this.#ask,
      to,
      from,
      play,
      still,
    };
    this.#post(message);
    return this.#ask;
  }

  /** The region the last reach changed, brought into the stage's view. */
  reveal(): void {
    this.#post({ type: STAGE_REVEAL });
  }

  /** The stage's view: its scheme, the width he picked, motion. */
  view(view: StageView): void {
    this.#post({
      type: "cawco:canvas-view",
      view: {
        scheme: view.scheme,
        widths: view.width === null ? null : [view.width],
        motion: view.motion,
      },
    });
  }

  /** A new page said it is ready: what the last one said of its drawing is gone with it. */
  loaded(): void {
    this.laid = null;
    this.reached = null;
    this.fault = null;
    this.loads += 1;
  }

  heardSheet(sheet: SheetOnPage): void {
    this.sheets = { ...this.sheets, [sheet.file]: sheet };
  }
}
