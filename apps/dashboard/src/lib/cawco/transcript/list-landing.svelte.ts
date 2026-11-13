import { detach } from "@cawco/core/detach";
/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { tick, untrack } from "svelte";
import { track } from "#lib/platform/track.js";
import { type SessionState, sessionsStore } from "../stores/sessions.svelte";
import { readOlderPage } from "../stores/transcript-reads.svelte";
import { compactionMarkComing } from "./compaction-mark";
import { LANDING_HOLD_MS, type Landing } from "./kept-place.svelte";
import type { Row } from "./rows";

export interface ListLandingHost {
  readonly active: boolean;
  readonly keeper: {
    readonly anchorIndex: () => number;
    readonly holdPlace: () => void;
    holdUntil: number;
    keptPlace: { block: string; into: number } | null;
    readonly restore: () => boolean;
    resume: Landing | null;
  };
  landed: boolean;
  readonly older: {
    readonly paged: () => SessionState | null;
  };
  readonly onlanded?: () => void;
  readonly pin: {
    atBottom: boolean;
    farFromLatest: boolean;
    following: number | null;
    readonly listing: HTMLElement | undefined;
    readonly pinBottom: () => void;
    readonly scroller: HTMLElement | undefined;
  };
  readonly rowBuild: {
    readonly builtPrint: string;
    readonly pending: { rows: Row[]; settled: Row[] } | null;
    readonly printOf: () => string;
    readonly rows: Row[];
  };
  readonly rowDraw: {
    readonly renderedRows: Row[];
  };
  readonly seek: {
    readonly arrived: (docId: string) => void;
    readonly asked: number;
  };
  readonly session: SessionState;
  shown: boolean;
}

export class ListLanding {
  readonly #host: ListLandingHost;

  landingFrame: number | null = null;

  /**
   * The list drawn where its landing put it. A record asked for is said to
   * be reached (`arrived`); a place read back to stays the place while the
   * rows around it go on measuring (`holdPlace`): drawn at it, the list
   * moved off it by what the rows above measured to after the reveal.
   */
  drawAtLanding(): void {
    const sought =
      this.#host.keeper.resume && "at" in this.#host.keeper.resume
        ? this.#host.keeper.resume.at
        : null;
    const kept =
      this.#host.keeper.resume &&
      !this.#host.keeper.resume.tail &&
      "block" in this.#host.keeper.resume
        ? {
            block: this.#host.keeper.resume.block,
            into: this.#host.keeper.resume.into,
          }
        : null;
    this.#host.keeper.resume = null;
    this.#host.shown = true;
    if (sought !== null) {
      this.#host.seek.arrived(sought);
    }
    if (kept) {
      this.#host.keeper.keptPlace = kept;
      this.#host.keeper.holdUntil = performance.now() + LANDING_HOLD_MS;
      this.#host.keeper.holdPlace();
    }
  }

  /**
   * Put the view at the tail in the next frame, before it paints: the
   * reader's own scroll came to rest there (`onscrollend`). Nothing is read
   * in the task that called it; the frame's callbacks read the scroller
   * anyway, before its layout.
   */
  followBottom(): void {
    if (!this.#host.pin.scroller || this.#host.pin.following !== null) {
      return;
    }
    this.#host.pin.following = requestAnimationFrame(() => {
      this.#host.pin.following = null;
      if (this.#host.pin.atBottom) {
        this.#host.pin.pinBottom();
      }
    });
  }

  land(): void {
    if (!this.#host.landed) {
      // A place the rows do not hold yet — a reload's first rows are the
      // newest page — is read back to before the list is drawn (the reveal).
      // The tail is the pin's: put there now, at the rows' estimated sizes,
      // and put back on every measurement that follows (`onresize`) until the
      // list is drawn, focused or not (`pinned`).
      this.#host.landed = true;
      if (this.#host.keeper.anchorIndex() >= 0) {
        this.#host.keeper.restore();
      } else {
        this.#host.pin.atBottom = true;
        this.#host.pin.pinBottom();
      }
      this.settle();
      return;
    }
    // Measured in the next frame's callbacks, never in the task that called
    // for the land: that can be a finger lifting off a switch between
    // groups, and reading the scroller there forced a layout into it. The
    // callbacks run before that frame's layout, so what they write is what
    // the frame paints.
    if (this.landingFrame !== null) {
      cancelAnimationFrame(this.landingFrame);
    }
    this.landingFrame = requestAnimationFrame(this.landInFrame);
    this.#host.pin.atBottom = true;
    this.#host.pin.farFromLatest = false;
  }

  /** The already-landed half of `land`, in the frame after it was called for. */
  landInFrame = (): void => {
    this.landingFrame = null;
    // A tail far off — a tab back from a long absence, the jump back from far
    // up — lands at the rows' estimated sizes; the rows it lands among are
    // measured in that frame's layout, and the pin puts the view back on the
    // true end before the frame is painted (`onresize`).
    if (!(
      this.#host.pin.scroller &&
      this.#host.active &&
      this.#host.pin.atBottom
    )) {
      return;
    }
    this.#host.pin.pinBottom();
    this.settle();
  };

  /** Fire `onlanded` once, the first time the transcript has content. */
  landingTold: boolean;

  settle(): void {
    if (this.landingTold) {
      return;
    }
    this.landingTold = true;
    this.#host.onlanded?.();
  }

  /**
   * The reader's place is a row the rows held do not hold yet, and the
   * pages before them are still to be read (or the rows are not the
   * store's yet): the list is not drawn.
   */
  waitsForPlace(store: SessionState | null, own: SessionState | null): boolean {
    if (
      this.#host.keeper.resume &&
      !this.#host.keeper.resume.tail &&
      this.#host.keeper.anchorIndex() < 0
    ) {
      // The place is looked for only among rows built from the store's
      // session as it stands: not while a build's second step is still to
      // come (`pending`) or the rows lag what the store holds, and not among
      // the server's stand-in rows once the store has rows to take their
      // place (`SessionPane`). Concluded not found there, the list was drawn
      // at another row with the place a moment from arriving above it
      // (transcript-holds, its reload legs).
      if (
        this.#host.rowBuild.pending !== null ||
        untrack(this.#host.rowBuild.printOf) !==
          this.#host.rowBuild.builtPrint ||
        (store !== null &&
          store !== this.#host.session &&
          store.messages.length > 0)
      ) {
        return true;
      }
      if (own?.cursor && !own.olderFault) {
        if (!own.hydrating) {
          detach(
            untrack(() => readOlderPage(own.instanceId)),
            "untrack"
          );
        }
        return true;
      }
    }
    return false;
  }

  constructor(host: ListLandingHost) {
    this.#host = host;
    this.landingTold = false;

    /**
     * THE REVEAL. A transcript opening draws its rows once, where they stay.
     *
     * virtua renders a row it has not measured yet under `visibility: hidden`,
     * at an estimated offset, and shows it the moment it is measured — at its
     * real offset, in the same frame as the landing's scroll. Chrome counts a
     * hidden box that moves and appears in one frame as a layout shift, from
     * wherever it was laid out while hidden: on a cold load that was the whole
     * tail jumping from the top of the list to its place (CLS 0.62 at 1440).
     *
     * So the list's own box stays unpainted until the transcript has landed
     * and every row in the viewport is drawn and measured, and is drawn a
     * frame later — any change to the rows in between starts the wait again —
     * so the frame that shows the rows is never the frame that moved them.
     * Meanwhile a cold load's rows stand on screen as the server drew them
     * (`servedRows`), and go in that frame. It waits for the newest page and for
     * nothing older — with one exception, the reader's own place (below).
     * What arrives after the reveal — a read again, an older page in front —
     * keeps the rows on screen measured and in place: see `frontOnly` and the
     * two steps in `build`.
     */
    $effect(() => {
      const node = this.#host.pin.scroller;
      const container = this.#host.pin.listing?.firstElementChild;
      // The newest page under way replaces these rows when they are the
      // server's stand-in for it (see `SessionPane`): the store's session takes
      // their place the moment its read is in, with the turn in flight on the
      // end. Drawn first, they would be moved under the reader.
      const store = sessionsStore.session(this.#host.session.instanceId);

      const reading =
        this.#host.session.loading ||
        (store !== null && store !== this.#host.session && store.loading);
      track(this.#host.seek.asked);

      if (
        this.#host.shown ||
        reading ||
        !(this.#host.landed && node && container)
      ) {
        return;
      }
      // THE READER'S PLACE IS READ BACK TO. A place kept at a row older than
      // the rows held (a reload far up: the first rows are the newest page) is
      // not given up for the tail: the pages before them are read, one at a
      // time, until one holds that row or the conversation's start is in hand,
      // and the list is drawn there. A page that cannot be read ends the
      // search: the list is drawn with what it holds, the failure said at its
      // top. Each page is asked for once the last one is in the rows searched:
      // a pane off screen builds its rows on its scheduler turn, and asking on
      // the page's landing alone read on past the place before it was looked for.
      const own = this.#host.older.paged();
      if (this.waitsForPlace(store, own)) {
        return;
      }
      let frame: number | null = null;
      /** This reveal is still the one being waited for. */
      let live = true;
      /**
       * Every row in the viewport is drawn and measured: virtua has rendered
       * the rows the scroll offset covers — they abut, with no gap, from the
       * top of the viewport down — and none of them is still hidden awaiting
       * its size.
       */
      const measured = (): boolean => {
        const view = node.getBoundingClientRect();
        const boxes: DOMRect[] = [];
        for (const item of container.children) {
          const box = item.getBoundingClientRect();
          if (box.bottom > view.top && box.top < view.bottom) {
            if ((item as HTMLElement).style.visibility === "hidden") {
              return false;
            }
            boxes.push(box);
          }
        }
        boxes.sort((a, b) => a.top - b.top);
        if (
          node.scrollTop > 0 &&
          (boxes[0]?.top ?? view.bottom) > view.top + 1
        ) {
          return false;
        }
        return boxes.every(
          (box, i) => i === 0 || box.top <= boxes[i - 1].bottom + 1
        );
      };
      // Measured in the next frame's callbacks, never in the task that
      // changed the rows (a tab switch landing a pane among them): reading
      // the rows there lays the page out mid-task. The callbacks run before
      // that frame's layout, so the rows are shown in the frame they are
      // found measured, as before.
      const wait = (): void => {
        if (frame !== null) {
          cancelAnimationFrame(frame);
        }
        frame = requestAnimationFrame(() => {
          frame = null;
          if (this.#host.keeper.restore()) {
            wait();
            return;
          }
          if (!measured()) {
            return;
          }
          // A list that opens on a compaction is shown with Caw beside the
          // word, not a frame or two before him: it waits for his picture
          // (bounded, see `compactionMarkComing`), then measures again.
          const caw = this.#host.rowDraw.renderedRows.some(
            (row) => row.kind === "compaction"
          )
            ? compactionMarkComing()
            : null;
          if (caw) {
            caw.then(() => {
              if (live) {
                wait();
              }
            });
            return;
          }
          this.drawAtLanding();
        });
      };
      const changes = new MutationObserver(wait);
      changes.observe(container, {
        attributes: true,
        attributeFilter: ["style"],
        childList: true,
        subtree: true,
      });
      wait();
      return () => {
        live = false;
        changes.disconnect();
        if (frame !== null) {
          cancelAnimationFrame(frame);
        }
      };
    });

    // A conversation with nothing in it never lands — `land` needs a row to
    // scroll to — so the handshake would never be answered and a pane waiting on
    // it would hold an invisible transcript for good. An empty read that has
    // finished IS settled; say so.
    $effect(() => {
      if (this.#host.session.loading || this.#host.rowBuild.rows.length > 0) {
        return;
      }
      this.#host.landed = true;
      this.settle();
    });

    // The landings: the first, once there are rows, and the pane coming back to
    // be worked in at the tail, once, as `active` rises — the rows it caught up
    // on while it was not were measured with no pin running (`pinned`), so it
    // is put on their end. Nothing else lands here: what grows the tail while
    // the reader is at it — a row, a streamed word, the composer column's
    // clearance — is the pin's, in the frame it grew (`onresize`). This effect
    // used to re-land on every row and every streamed frame, a frame behind
    // the pin, a second writer of the same offset.
    //
    // A landed pane depends on `active` alone, never on its rows or its
    // stream: an off-screen pane re-runs nothing as its session streams.
    $effect(() => {
      if (this.#host.landed) {
        if (this.#host.active && untrack(() => this.#host.pin.atBottom)) {
          detach(
            tick().then(() => {
              if (this.#host.active && this.#host.pin.atBottom) {
                this.land();
              }
            }),
            "tick"
          );
        }
        return;
      }
      if (this.#host.rowBuild.rows.length > 0) {
        detach(
          tick().then(() => {
            if (!this.#host.landed) {
              this.land();
            }
          }),
          "tick"
        );
      }
    });
  }
}
