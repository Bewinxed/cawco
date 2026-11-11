/**
 * The design graph's line to its stage page (core stage-graph.ts), the
 * page that holds the component on its stage's origin inside the panel's
 * frame: what the graph posts it (a reach, Compare, a reveal, the view, the
 * move's play, pause, scrub and timing, a row's ring, the dials), and what
 * it last said (its sheets, how its drawing is laid out, the reach that
 * landed, a fault, what differs, the move's clock, the dials as written, a
 * press), held as state the graph reads. One per component artifact's pane (PreviewPane), which hears the
 * page and hands each word here.
 */
import type { SheetOnPage } from "@cawco/core/stage";
import {
  STAGE_COMPARE,
  STAGE_DIALS,
  STAGE_LET_GO,
  STAGE_PAUSE,
  STAGE_PLAY,
  STAGE_REACH,
  STAGE_RETIME,
  STAGE_REVEAL,
  STAGE_RING,
  STAGE_ROOM,
  STAGE_SEEK,
  type StageCompare,
  type StageDials,
  type StageDifferences,
  type StageFault,
  type StageLaid,
  type StagePlay,
  type StageReach,
  type StageReached,
  type StageReveal,
  type StageRoom,
  type StageTime,
  type StateRef,
  storyOf,
  type Tuning,
} from "@cawco/core/stage-graph";
import { untrack } from "svelte";
import type { SheetInspector } from "#lib/cawco/preview/sheet-inspector.svelte.js";

/** The stage's view, as the view card picks it: its scheme, the width he picked (none: its own), reduced motion, and whether a width wider than the stage is scaled to fit it (`fit`) or drawn 1:1. */
export interface StageView {
  fit: boolean;
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
  /** The drawing's page last scrolled down (`cawco:stage-scrolled`): the tools over its foot step aside; a scroll up or a press brings them back. */
  scrolledDown = $state(false);
  /** Presses the page heard (`cawco:press`): each closes the graph's open layers, a press on the stage being outside them. */
  presses = $state(0);
  /** The state the graph keeps, as the page names it: the Dials card's props follow its story. Null until the graph has a state. */
  kept = $state<StateRef | null>(null);
  /** A story the person added on the Dials card (Save as new state), by its states file: the graph keeps its state, then lets it go. */
  wanted = $state<{ file: string; story: string } | null>(null);
  /** The Compare the graph last asked for; null while it doesn't compare. */
  comparing = $state<StageCompare | null>(null);
  /** What differs, as the page last read it for that Compare (`cawco:stage-differences`); null until it has. */
  differences = $state<StageDifferences | null>(null);
  /**
   * Each of the agent's dials' value as written, read off the drawing by
   * the page (`cawco:stage-dials-written`), by name; null until the page
   * has read them. The Dials face stands once it has.
   */
  dialsWritten = $state<StageDials["values"] | null>(null);
  /** The move's clock as the page last said it (`cawco:stage-time`), and when it came on this page's clock; null while no play has been said. */
  time = $state<(StageTime & { heard: number }) | null>(null);
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

  /**
   * Compare: `against` drawn hidden under the kept state at its width, what
   * differs read and ringed (`show`: the compared state in the kept one's
   * place); null ends it. The same Compare again posts nothing.
   */
  compare(against: StateRef | null, show: StageCompare["show"]): void {
    const now = this.comparing;
    const same =
      JSON.stringify(now?.against ?? null) === JSON.stringify(against);
    if (same && (against === null || now?.show === show)) {
      return;
    }
    this.#ask += 1;
    const asking: StageCompare = { ask: this.#ask, against, show };
    if (!same) {
      // Another state, or none: what differed from the last one is gone.
      this.differences = null;
    }
    this.comparing = against ? asking : null;
    this.#post({ type: STAGE_COMPARE, ...asking });
  }

  /** What differs, heard: kept only for the Compare the graph asked for last. */
  heardDifferences(said: StageDifferences): void {
    if (this.comparing && said.ask === this.comparing.ask) {
      this.differences = said;
    }
  }

  /** The room the stage's floating head takes over the page's top, px. */
  room(px: number): void {
    const message: StageRoom & { type: string } = { type: STAGE_ROOM, px };
    this.#post(message);
  }

  /** The dials as set on the drawing, the whole set by name. */
  turn(values: StageDials["values"]): void {
    const message: StageDials & { type: string } = {
      type: STAGE_DIALS,
      values,
    };
    this.#post(message);
  }

  /** The move the page last read, played from `from` ms as `tuning` times it (`written`: as the agent wrote it); round again from `loopFrom` on `repeat`. */
  play(asking: Omit<StagePlay, "ask">): void {
    this.#ask += 1;
    this.#post({ type: STAGE_PLAY, ask: this.#ask, ...asking });
  }

  /** Every replay paused where it stands. */
  pause(): void {
    this.#ask += 1;
    this.#post({ type: STAGE_PAUSE, ask: this.#ask });
  }

  /** The move stood at `t` ms and held there, as `tuning` times it: a scrub's frame. */
  seek(t: number, tuning: Tuning[]): void {
    this.#ask += 1;
    this.#post({ type: STAGE_SEEK, ask: this.#ask, t, tuning });
  }

  /** A scrub let go at `t`: on the move's end the drawing is let go, the kept state as it stands. */
  letGo(t: number): void {
    this.#ask += 1;
    this.#post({ type: STAGE_LET_GO, ask: this.#ask, t });
  }

  /** The move's timing changed: a hold drawn again on it, or (`replayFrom`) played from there once. */
  retime(tuning: Tuning[], replayFrom: number | null): void {
    this.#ask += 1;
    this.#post({ type: STAGE_RETIME, ask: this.#ask, tuning, replayFrom });
  }

  /** The thing a rested row names ringed on the stage (null: none), at `at` ms into the move. */
  ring(thing: string | null, at: number): void {
    this.#post({ type: STAGE_RING, thing, at });
  }

  /** The move's clock said: held with the moment it came, so the readout runs from it. */
  heardTime(said: StageTime): void {
    this.time = { ...said, heard: performance.now() };
  }

  /** A region of the drawing brought into the stage's view: what the last reach changed, or a difference's ring. */
  reveal(what: StageReveal["what"]): void {
    this.#post({ type: STAGE_REVEAL, what });
  }

  /** The stage's view: its scheme, the width he picked, motion. */
  view(view: StageView): void {
    this.#post({
      type: "cawco:canvas-view",
      view: {
        scheme: view.scheme,
        widths: view.width === null ? null : [view.width],
        motion: view.motion,
        fit: view.fit,
      },
    });
  }

  /** The person added story `story` of `file` on the Dials card: the graph keeps its state. */
  want(file: string, story: string): void {
    this.wanted = { file, story };
  }

  /** A new page said it is ready: what the last one said of its drawing is gone with it. */
  loaded(): void {
    this.laid = null;
    this.reached = null;
    this.fault = null;
    // The new page compares with nothing until the graph asks it again.
    this.comparing = null;
    this.differences = null;
    this.time = null;
    this.loads += 1;
  }

  heardSheet(sheet: SheetOnPage): void {
    this.sheets = { ...this.sheets, [sheet.file]: sheet };
  }
}

/**
 * The Dials card's props are for the story the stage stands at: the
 * graph's kept state, in its states file's sheet as the page says it,
 * whichever way the state came to be kept. Called as a component sets up
 * (PreviewPane), so the effect lives as long as it does.
 */
export function inspectKept(
  link: () => StageLink | null,
  inspector: () => SheetInspector | null
): void {
  $effect(() => {
    const held = inspector();
    const at = link();
    const kept = at?.kept;
    const said = kept ? at?.sheets[kept.file] : undefined;
    if (held && kept && said) {
      untrack(() => held.follow(said, storyOf(kept)));
    }
  });
}
