import { detach } from "@cawco/core/detach";
/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { untrack } from "svelte";
import { dur } from "#lib/platform/motion/curves.svelte.js";
import { track } from "#lib/platform/track.js";
import type { ConversationFind } from "../find/conversation-find.svelte";
import type { SessionState } from "../stores/sessions.svelte";
import { readOlderPage } from "../stores/transcript-reads.svelte";
import type { Ticket } from "./arrivals.svelte";
import type { Landing } from "./kept-place.svelte";
import { type OpenAsk, openAt, rowAt } from "./open-at.svelte";
import type { Row } from "./rows";
import { FAR_FROM_LATEST } from "./scroll-pin.svelte";

/** The most frames a seek re-centres for while rows around it measure: our own call. */
const SEEK_FRAMES = 30;
export interface RecordSeekHost {
  readonly arrivals: {
    readonly tickets: Map<string, Ticket>;
  };
  readonly finder: {
    readonly findHere: ConversationFind;
  };
  readonly keeper: {
    readonly anchorIndex: () => number;
    holdUntil: number;
    keepFrame: number;
    keptPlace: { block: string; into: number } | null;
    readonly placeAt: (top: number) => { block: string; into: number } | null;
    readonly restore: () => boolean;
    resume: Landing | null;
    standsAtTail: boolean;
    readonly wordsAwaited: boolean;
  };
  readonly older: {
    readonly paged: () => SessionState | null;
  };
  readonly pin: {
    atBottom: boolean;
    farFromLatest: boolean;
    readonly lastTop: number;
    readonly pinBottom: () => void;
    readonly scroller: HTMLElement | undefined;
    readonly stopFollow: () => void;
    readonly tailTop: (node: HTMLElement) => number;
  };
  readonly region: {
    announcement: string;
  };
  readonly rowBuild: {
    readonly builtPrint: string;
    readonly printOf: () => string;
    readonly rowCount: number;
  };
  readonly rowDraw: {
    readonly renderedRows: Row[];
  };
  readonly session: SessionState;
  readonly shown: boolean;
  readonly visible: boolean;
}

export class RecordSeek {
  readonly #host: RecordSeekHost;

  // Opened at a record
  /**
   * THE RECORD ASKED FOR IS READ BACK TO, ITS WORDS IN VIEW, AND MARKED.
   *
   * `?at=` names a record of this conversation, or a time in it: the first
   * record stored at or after it (open-at.svelte.ts `rowAt`), and the words
   * it matched on, if any (`&match=`). It is a landing like a kept place
   * (`resume`), at those words or the record rather than at the view's top
   * (`seekInto`): before the list is drawn, the reveal reads the pages
   * before the rows held, one at a time, until one holds it, and draws the
   * list there; once drawn, `seeking` does the same in place. Either way the
   * view then stands off the tail, so nothing that arrives there moves it,
   * until the reader scrolls. A record the whole conversation does not hold opens at
   * the latest row, and the dock says so.
   */
  /** Bumped by each ask: what re-runs a reveal under way to read back to it. */
  asked = $state(0);

  /** The record sought in a list already drawn. */
  seeking = $state<string | null>(null);

  /** The row opened at, by key: `on` until the reader moves on, then fading. */
  marked = $state<{ key: string; state: "on" | "off" } | null>(null);

  /** The record asked for is not here (`gone`), or the pages before could not be read (`unread`). */
  unfound = $state<"gone" | "unread" | null>(null);

  /** What the dock says, and the live region says once, of a record not reached. */
  readonly unfoundWords = $derived.by(() =>
    this.unfound === "unread"
      ? "That moment couldn't be reached: the turns before these couldn't be read."
      : "That moment isn't in this session any more."
  );

  seek({ at, terms }: OpenAsk): void {
    this.marked = null;
    this.unfound = null;
    // A landing's place still held (`holdPlace`) is let go, as the reader's
    // own scroll lets it go: put back each frame, it undid the seek's writes
    // until the hold ran out (seek-words, its stored-uuid leg).
    this.#host.keeper.holdUntil = 0;
    cancelAnimationFrame(this.#host.keeper.keepFrame);
    this.#host.keeper.keepFrame = 0;
    this.#host.keeper.resume = { tail: false, at, terms };
    this.#host.keeper.standsAtTail = false;
    if (this.#host.shown) {
      this.seeking = at;
    } else {
      this.asked += 1;
    }
  }

  /** The ask this transcript is seeking, until it has arrived. */
  taking: string | null = null;

  /** The seek is over: the record is in view and marked, or it is said not to be. */
  arrived(docId: string): void {
    this.taking = null;
    if (openAt.get(this.#host.session.instanceId)?.at === docId) {
      openAt.delete(this.#host.session.instanceId);
    }
    // Said once, here, where the seek ends: a landing is a state change and
    // a record not held is a refusal (PRODUCT.md, screen readers), and
    // nothing after it (a scroll, a live row) says it again.
    const index = rowAt(
      this.#host.rowDraw.renderedRows,
      docId,
      this.#host.older.paged()?.cursor === null
    );
    if (index < 0) {
      this.marked = null;
      this.unfound = this.#host.older.paged()?.olderFault ? "unread" : "gone";
      this.#host.region.announcement = this.unfoundWords;
      return;
    }
    // Find's own seek marks the words, not the row, and its place is said
    // by its count (find/FindLine).
    const found = this.#host.finder.findHere.sought?.docId === docId;
    if (found) {
      const { back } = this.#host.finder.findHere.sought ?? { back: false };
      this.#host.finder.findHere.sought = null;
      if (!back) {
        this.#host.finder.findHere.arrived();
      }
    }
    this.marked = found
      ? null
      : { key: this.#host.rowDraw.renderedRows[index].key, state: "on" };
    // The record opened at is the place now, as a reader's scroll to it is.
    this.#host.keeper.keptPlace = this.#host.keeper.placeAt(
      this.#host.pin.lastTop
    );
    // The finder's own words for the key that brought the reader here
    // ("↵ open at that line", docs/tom/find-and-mention-chosen.md).
    if (!found) {
      this.#host.region.announcement = "Opened at that line.";
    }
    if (this.#host.pin.scroller) {
      const distance =
        this.#host.pin.tailTop(this.#host.pin.scroller) -
        this.#host.pin.scroller.scrollTop;
      this.#host.pin.farFromLatest =
        distance > FAR_FROM_LATEST * this.#host.pin.scroller.clientHeight;
    }
  }

  /** The reader has moved on: the mark fades where it stands, and the note goes. */
  letGo = (): void => {
    this.unfound = null;
    if (this.marked?.state !== "on") {
      return;
    }
    const { key } = this.marked;
    this.marked = { key, state: "off" };
    setTimeout(() => {
      if (this.marked?.key === key && this.marked.state === "off") {
        this.marked = null;
      }
    }, dur("--duration-panel"));
  };

  constructor(host: RecordSeekHost) {
    this.#host = host;

    // An ask is the view's until a transcript of it has arrived at it: one
    // unmounted mid-seek (its pane's state changing under it while the newest
    // page is read) leaves it to the next.
    $effect(() => {
      const ask = openAt.get(this.#host.session.instanceId);
      if (ask === undefined || ask.at === this.taking) {
        return;
      }
      this.taking = ask.at;
      untrack(() => this.seek(ask));
    });

    // In a list already drawn: the pages before are read until one holds the
    // record, then the view is put at it (`seekInto`) over the frames the rows
    // around it take to measure (`restore`, as the reveal does).
    $effect(() => {
      const docId = this.seeking;
      if (!(docId && this.#host.shown && this.#host.visible)) {
        return;
      }
      track(this.#host.rowBuild.rowCount);
      const own = this.#host.older.paged();
      if (this.#host.session.loading || own?.loading) {
        return;
      }
      if (untrack(this.#host.keeper.anchorIndex) < 0) {
        if (own?.cursor && !own.olderFault) {
          if (
            !own.hydrating &&
            untrack(this.#host.rowBuild.printOf) ===
              this.#host.rowBuild.builtPrint
          ) {
            detach(
              untrack(() => readOlderPage(own.instanceId)),
              "untrack"
            );
          }
          return;
        }
        // The conversation's start is in hand, or a page would not read: the
        // latest row, and why not the one asked for.
        untrack(() => {
          this.#host.keeper.resume = null;
          this.seeking = null;
          this.#host.pin.atBottom = true;
          this.#host.pin.farFromLatest = false;
          this.#host.pin.pinBottom();
          this.arrived(docId);
        });
        return;
      }
      let frame: number | null = null;
      let frames = 0;
      const step = (): void => {
        frame = requestAnimationFrame(() => {
          frame = null;
          // Moved, or its words are not drawn yet (their fold opening): it
          // reads them again next frame.
          if (
            (this.#host.keeper.restore() || this.#host.keeper.wordsAwaited) &&
            frames < SEEK_FRAMES
          ) {
            frames += 1;
            step();
            return;
          }
          this.#host.keeper.resume = null;
          this.seeking = null;
          this.arrived(docId);
        });
      };
      untrack(() => {
        this.#host.pin.stopFollow();
        this.#host.arrivals.tickets.clear();
        step();
      });
      return () => {
        if (frame !== null) {
          cancelAnimationFrame(frame);
        }
      };
    });

    // A press or a key in the transcript is the reader's, as their scroll is
    // (`onscroll`).
    $effect(() => {
      const node = this.#host.pin.scroller;
      if (!(node && (this.marked?.state === "on" || this.unfound))) {
        return;
      }
      node.addEventListener("pointerdown", this.letGo);
      node.addEventListener("keydown", this.letGo);
      return () => {
        node.removeEventListener("pointerdown", this.letGo);
        node.removeEventListener("keydown", this.letGo);
      };
    });
  }
}
