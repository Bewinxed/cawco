/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { flushSync, onDestroy, untrack } from "svelte";
import type { VirtualizerHandle } from "virtua/svelte";
import {
  type FrameObserver,
  frameObserver,
  frameSize,
} from "#lib/platform/frame-observer.js";
import { carry } from "#lib/platform/motion/share.svelte.js";
import { devNote } from "../dev-debug";
import { noteChange } from "../repeated-keys";
import type { SessionState } from "../stores/sessions.svelte";
import type { Ticket } from "./arrivals.svelte";
import type { Row } from "./rows";

/** How many screens from the tail the reader goes before "Jump to latest"
      shows; our own call, no source sets it. */
export const FAR_FROM_LATEST = 0.75;

/** How long a scroll is still the reader's once their input ends, ms: a fling's momentum. Our own call. */
const FLING_MS = 1000;

/** Keys that move the view: the scroll keys, and Tab bringing what it focuses into view. */
const movesView = (key: string): boolean =>
  SCROLL_KEYS.has(key) || key === "Tab";

/** How far off the bottom still counts as the tail: a pixel's rounding. */
const TAIL_SLACK = 1;

/** A thinking row opening or closing on the kit's reveal. */
const isThinking = (target: Element): boolean =>
  !!target.closest('[data-slot="thinking-steps-content"]');

/** Keys that scroll the transcript: pressed during a jump, they are the reader's. */
export const SCROLL_KEYS = new Set([
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  " ",
]);
export interface ScrollPinHost {
  readonly active: boolean;
  readonly arrivals: {
    readonly tickets: Map<string, Ticket>;
  };
  readonly jumper: {
    readonly jumping: boolean;
    readonly jumpScrolled: (node: HTMLElement) => void;
  };
  readonly keeper: {
    holdUntil: number;
    keptPlace: { block: string; into: number } | null;
    readonly placeAt: (top: number) => { block: string; into: number } | null;
    readerMoved: number;
  };
  readonly landed: boolean;
  readonly landing: {
    readonly followBottom: () => void;
    readonly landingFrame: number | null;
  };
  readonly mounted: {
    readonly aside: ReadonlyMap<string, number>;
    awayScroll: number;
    readonly catchUpRest: () => void;
    readonly landFar: (was: number) => void;
    readonly liftInView: (top: number) => void;
    readonly narrow: boolean;
    readonly stagedReady: boolean;
    readonly stageFar: () => void;
  };
  readonly older: {
    readonly askOlder: (above: number) => void;
  };
  readonly parkedHeight: number;
  readonly rowDraw: {
    readonly renderedRows: Row[];
  };
  readonly seek: {
    readonly letGo: () => void;
    readonly marked: { key: string; state: "on" | "off" } | null;
    readonly unfound: "gone" | "unread" | null;
  };
  readonly session: SessionState;
  readonly shown: boolean;
  readonly slides: {
    readonly carrySlides: (scrolled: number) => void;
  };
  readonly visible: boolean;
  readonly whole: {
    readonly keepWhole: () => boolean;
  };
}

export class ScrollPin {
  readonly #host: ScrollPinHost;

  scroller = $state<HTMLElement | undefined>();

  /**
   * The scroller's height: what sets how far past the view virtua mounts
   * rows (its `bufferSize`, `BUFFER_SCREENS` of it), so a row is measured
   * well before the reader reaches it.
   * virtua takes up a row's change of size for the reader only while the row
   * is wholly above the view; scrolling up, a row it had only estimated
   * (`ROW_ESTIMATE`) that came into view unmeasured — any page put in front,
   * met by a wheel longer than its default 200px — grew there and pushed
   * the rows under it down by the difference. Read as the scroller mounts,
   * and a change in the next frame (frameSize): the rows it mounts lay the
   * list out again.
   */
  viewHeight = $state(0);

  readonly measureView = frameSize(
    (node: HTMLElement) => node.clientHeight,
    (value) => {
      this.viewHeight = value;
    }
  );

  /** virtua's imperative handle: its sizes, its cache, and `scrollToIndex` for
      a row that is not the tail (the tray's reveal). */
  list = $state<VirtualizerHandle | undefined>();

  /** The box around the list; its first child is virtua's container. */
  listing = $state<HTMLElement>();

  /** The strip before the list: its top padding is the head's room (`headRoom`). */
  headStrip = $state<HTMLElement>();

  /** The room past the end for what rises past the composer (the markup). */
  parkedRoom = $state<HTMLElement>();

  atBottom = $state(true);

  /** Past FAR_FROM_LATEST screens from the tail, and not back at it since. */
  farFromLatest = $state(false);

  /**
   * Where the reader was, as the scroll handler last saw it. A pane hides
   * inside whatever task hid it — a finger lifting off a swipe between tabs
   * — and reading the scroller there forced a layout into that task; what the
   * landing keeps is already known without asking.
   */
  lastTop = 0;

  /** Where the list begins in the scroller, as the scroll handler last saw it. */
  listStart = 0;

  /** The scroll height the last scroll event saw — what tells a clamp from a reader. */
  lastHeight = 0;

  /**
   * THE READER'S SCROLL FOLLOWS THE READER'S INPUT. A scroll is theirs only
   * while their own input is under way — a wheel, a finger, a key that moves
   * the view, a mouse press (the scrollbar's, a selection dragged past an
   * edge) — and for `FLING_MS` after it ends, so a
   * fling's momentum and a key's smooth scroll are still theirs; each scroll
   * of theirs in that time holds it on. Any other scroll is the list's own
   * (virtua keeping the rows on screen where they stand while rows above
   * them measure), and moves nothing of the reader's. Told by where the rows
   * stand instead, an iPhone's landing let go of its place: virtua 0.53.4
   * there holds back its correction for rows measured above the view while
   * the view counts as scrolling, which the landing's own writes start
   * (`p() && 0 !== I ? b += t : S += t`), and writes it with `scrollBy` when
   * its 150ms scroll-end timer fires; while it is pending `getItemOffset`
   * subtracts it and `findItemIndex` does not, so the row read at the view's
   * top stood hundreds of pixels above it, and the correction's own scroll,
   * 172–252ms after the landing's last write, read as the reader's in 14 of
   * 20 landings (transcript-cold-load demo, WebKit at 390).
   */
  inputOn: boolean;

  /** The timer that ends `inputOn` once the input has ended. */
  inputOff: ReturnType<typeof setTimeout> | undefined;

  inputBegins(): void {
    clearTimeout(this.inputOff);
    this.inputOff = undefined;
    this.inputOn = true;
  }

  /** The input ended: what it scrolls is the reader's for `FLING_MS` more. */
  inputEnds(): void {
    clearTimeout(this.inputOff);
    this.inputOff = setTimeout(() => {
      this.inputOn = false;
      this.inputOff = undefined;
    }, FLING_MS);
  }

  /** The reader's input on the scroller, and on the page for keys and a press let go anywhere. */
  readerInput = (node: HTMLElement): (() => void) => {
    const options = { passive: true } as const;
    const wheel = (): void => {
      this.inputBegins();
      this.inputEnds();
    };
    const touch = (): void => this.inputBegins();
    const lift = (event: TouchEvent): void => {
      if (event.touches.length === 0) {
        this.inputEnds();
      }
    };
    // A finger is read by its touch events: its pointer is cancelled as the
    // scroll takes it over, ahead of the scroll it makes.
    const press = (event: PointerEvent): void => {
      if (event.pointerType === "mouse") {
        this.inputBegins();
      }
    };
    const release = (event: PointerEvent): void => {
      if (event.pointerType === "mouse" && this.inputOn) {
        this.inputEnds();
      }
    };
    const key = (event: KeyboardEvent): void => {
      const target = event.target instanceof Node ? event.target : null;
      if (
        movesView(event.key) &&
        (target === document.body || node.contains(target))
      ) {
        this.inputBegins();
      }
    };
    const keyUp = (event: KeyboardEvent): void => {
      if (movesView(event.key) && this.inputOn) {
        this.inputEnds();
      }
    };
    node.addEventListener("wheel", wheel, options);
    node.addEventListener("touchstart", touch, options);
    node.addEventListener("touchmove", touch, options);
    node.addEventListener("touchend", lift, options);
    node.addEventListener("touchcancel", lift, options);
    node.addEventListener("pointerdown", press, options);
    addEventListener("pointerup", release, options);
    addEventListener("pointercancel", release, options);
    addEventListener("keydown", key, options);
    addEventListener("keyup", keyUp, options);
    return () => {
      clearTimeout(this.inputOff);
      node.removeEventListener("wheel", wheel);
      node.removeEventListener("touchstart", touch);
      node.removeEventListener("touchmove", touch);
      node.removeEventListener("touchend", lift);
      node.removeEventListener("touchcancel", lift);
      node.removeEventListener("pointerdown", press);
      removeEventListener("pointerup", release);
      removeEventListener("pointercancel", release);
      removeEventListener("keydown", key);
      removeEventListener("keyup", keyUp);
    };
  };

  /**
   * The frame a pane is shown in, from `visible` rising to the task after
   * that frame's rendering. The scroll event its scroller fires there (the
   * offset it was put away at, taken back as it is drawn) is read after the
   * frame, in that task (`onscroll`): read in the event, its offset, height
   * and boxes forced a style pass of their own ahead of the frame's (two
   * panes, a focus switch: "style 365 by" the handler before the frame's
   * 1089), and a switch restyled past what it shows. Nobody is scrolling a
   * pane in the frame it appears in, so every other scroll is read in its
   * event, where the reader's own scroll is told from this component's
   * writes before the next frame's follow can land over it.
   */
  showing: boolean;

  /** The frame and the task a scroll held in a pane's showing frame is read in. */
  heldFrame = 0;

  heldTask: ReturnType<typeof setTimeout> | undefined;

  /**
   * A scroll, as virtua's own scroll handler hands it on (its `onscroll`):
   * the offset it has just read off the scroller. That read is virtua's,
   * and it lays out whatever the tasks before the event wrote; read here
   * behind it, the scroller's height and boxes are that same layout, read
   * again for nothing. Read as the event's own listener instead, ahead of
   * virtua's, they were the read that laid it out (`readScroll`, Layout
   * 17.1ms in a 107ms task: a reply's long frames).
   */
  onListScroll = (offset: number): void => {
    noteChange("transcript scroll");
    this.#host.mounted.awayScroll = 0;
    if (this.#host.mounted.aside.size > 0) {
      this.#host.mounted.liftInView(offset);
    }
    if (!this.showing) {
      this.readScroll(offset);
      return;
    }
    if (this.heldFrame === 0) {
      this.heldFrame = requestAnimationFrame(() => {
        this.heldTask = setTimeout(() => {
          this.heldFrame = 0;
          this.readScroll(this.list?.getScrollOffset() ?? offset);
        });
      });
    }
  };

  /** What a scroll to `offset` did (`onListScroll`). */
  readScroll(offset: number): void {
    if (!(this.scroller && this.list && this.#host.landed)) {
      return;
    }
    this.lastTop = offset;
    this.giveRoomBack(this.scroller, offset);
    // A far landing's scroll: what it left and the screen above follow.
    if (this.#host.mounted.narrow) {
      this.#host.mounted.catchUpRest();
    }
    const height = this.scroller.scrollHeight;
    const shrank = height < this.lastHeight;
    this.lastHeight = height;
    this.listStart =
      (this.listing?.getBoundingClientRect().top ?? 0) -
      this.scroller.getBoundingClientRect().top +
      offset;
    // Until the reveal the list is laid out but not painted: nothing on it
    // is the reader's to have scrolled. virtua's own writes land here while
    // it measures the rows the store's read brings in — untagged, and at a
    // cold load on a phone one of them left 5,400px of tail under the
    // landing, read as the reader scrolling up, and the transcript opened
    // stranded there with the follow let go.
    if (!this.#host.shown) {
      return;
    }
    // Wherever the view now is, and whoever moved it: near the first rows
    // held, the page before them is asked for.
    this.#host.older.askOlder(this.lastTop - this.listStart);
    if (this.#host.jumper.jumping) {
      this.#host.jumper.jumpScrolled(this.scroller);
      return;
    }
    // Every write this component makes is tagged with the position it wrote.
    // An event that matches the tag is our OWN motion — the paced follow, or
    // the pin holding the bottom while a row opens — and says nothing about
    // where the reader is looking, even under their finger. Neither does the
    // browser clamping the offset because the content under it got shorter
    // (a tail row folding shut): that event comes with a smaller scroll
    // height and leaves the offset at its end. Nor does any scroll that
    // follows none of the reader's input (`inputOn`): virtua keeping the rows
    // on screen where they are while rows above them change size, measured
    // as they mount under a ride to the tail or a landing, a history chunk
    // put in front. Taken for the reader, one of those let go of the tail in
    // the middle of a returning pane's catch-up and left it 2,800px short for
    // good. A scroll their input makes is the READER: wheel, scrollbar drag,
    // keyboard, a finger, its momentum and its bounce.
    const clamped = shrank && offset >= height - this.scroller.clientHeight - 1;

    if (
      (this.lastWrite !== null && Math.abs(offset - this.lastWrite) <= 1) ||
      clamped ||
      !this.inputOn
    ) {
      return;
    }
    // A fling goes on after the finger lifts: each scroll of it holds on.
    if (this.inputOff !== undefined) {
      this.inputEnds();
    }
    // Each scroll taken for the reader's, for a probe to count (dev only).
    if (import.meta.env.DEV) {
      devNote("readerScrolls", {
        view: this.#host.session.instanceId,
        top: offset,
      });
    }
    this.#host.keeper.readerMoved += 1;
    this.#host.keeper.holdUntil = 0;
    this.#host.keeper.keptPlace = this.#host.keeper.placeAt(this.lastTop);
    this.stopFollow();
    // A row the reader scrolls to is not arriving, whenever it came in: what
    // is still waiting to mount is theirs to read, not ours to play.
    this.#host.arrivals.tickets.clear();
    if (this.#host.seek.marked?.state === "on" || this.#host.seek.unfound) {
      this.#host.seek.letGo();
    }
    // The reader's scroll has the screen until it comes to rest: nothing
    // writes the scroll offset under a finger, its momentum or its bounce,
    // however near the tail it moves. The tail is taken back at rest, and
    // only there (`onscrollend`).
    this.atBottom = false;
    const tail = this.tailTop(this.scroller);
    const distance = tail - offset;
    // Reaching the end marks where it stood; the reader is at the tail for
    // as long as they stay at or past that mark (into the parked room
    // included). Rows arriving while the scroll bounces off the end move the
    // end on, and the bounce settles short of it, at the end the reader
    // reached.
    if (distance <= TAIL_SLACK) {
      this.tailMark = tail;
    } else if (this.tailMark !== null && offset < this.tailMark - TAIL_SLACK) {
      this.tailMark = null;
    }
    this.restsAtTail = this.tailMark !== null;
    // Hysteresis: up past the far mark, and it stays until back at the tail.
    this.farFromLatest =
      !this.restsAtTail &&
      (this.farFromLatest ||
        distance > FAR_FROM_LATEST * this.scroller.clientHeight);
  }

  /**
   * Where the reader's own scrolling last left the view, until it comes to
   * rest: at the tail, or away from it. Null once a rest has read it, and
   * while nothing of the reader's has moved the view since.
   */
  restsAtTail: boolean | null = null;

  /** The offset of the end as it stood when the reader's scroll last reached it. */
  tailMark: number | null = null;

  /**
   * The scroll has come to rest. virtua says so 150ms after the last scroll
   * event, and never while a finger is on the screen, so a drag, the
   * momentum after it and the bounce at the end are one scroll. A reader
   * who comes to rest at the tail is following it again; anywhere else,
   * they stay where they are.
   */
  onscrollend = (): void => {
    if (this.restsAtTail === null || this.#host.jumper.jumping) {
      return;
    }
    const tail = this.restsAtTail;
    this.restsAtTail = null;
    this.tailMark = null;
    if (tail) {
      this.atBottom = true;
      this.farFromLatest = false;
      this.#host.landing.followBottom();
    }
  };

  /**
   * The tail is the scroller's own maximum, past the padding band under the
   * list, which is exactly the height of the composer column: the last row
   * fully in view, above the floating composer stack. (`scrollToIndex(…,
   * 'end')` seats the last row's foot on the VIEWPORT's foot, behind the
   * composer: virtua's box math stops at the list.)
   */
  /** The frame the next write to the tail is waiting for, and this
   *  component's LAST WRITE — the tag that tells its own scroll events from
   *  the reader's while their input is under way (`inputOn`). */
  following: number | null = null;

  // Null until the first write: a number here (it was -1) is within a pixel
  // of the top, and the reader's scroll to 0 read as our own write.
  lastWrite: number | null = null;

  stopFollow(): void {
    if (this.following !== null) {
      cancelAnimationFrame(this.following);
    }
    this.following = null;
  }

  /**
   * A PINNED TRANSCRIPT STAYS PINNED. While the reader is at the tail, the
   * tail is where the view is, every frame: what arrives there moves by its
   * own entrance (a row's reserve and cascade), not by the scroll. The
   * follow used to ride to a new tail over --dur-panel, which left every
   * landing up to 24px short for a quarter of a second — on 450 streamed
   * frames, 16 of them more than a pixel off. It yields to the reader in
   * `onscroll`: any scroll that moves what is on screen lets go.
   */
  /**
   * WHILE A ROW OPENS, ITS EDGE IS THE SCROLL.
   *
   * A tool call opens its own height (`Row`'s `open`), a reasoning block
   * folds, a failed send's reason unfolds: the bottom of the list moves on
   * every frame of the motion. virtua measures the row on every one of those
   * frames, so the pin (`onresize`, below) puts the view back in the frame
   * the row grew: the row's growth is what moves it. One motion, at the row's
   * own curve.
   */

  /**
   * THE TAIL IS THE LIST'S END, NOT THE SCROLLER'S. The parked room past the
   * end (an ask the composer grows into, an offer on its tray row) is room
   * the reader may scroll into, never a place the view is taken: at the
   * tail the last row stands on the foot whether a card is parked over it
   * or not, so a card parking or leaving moves no row (owner, a7443251: "it
   * shouldn't push the transcript up"; the composer's surface brief, The Composer Layer Rule).
   * Read after the layout the scroll height has just forced, as laid out.
   */
  tailTop(node: HTMLElement): number {
    const parked = this.parkedRoom?.getBoundingClientRect().height ?? 0;
    return node.scrollHeight - node.clientHeight - parked;
  }

  /**
   * A CARD THAT LEAVES TAKES NO ROOM FROM UNDER THE READER. The reader who
   * scrolled into the parked room (to read the last row over the card)
   * stands that far into it; the card going shrinks the room, and the
   * browser would clamp the view back up by the difference, moving every
   * row. So the room is held at where they stand (`heldRoom`) as the card
   * leaves, and given back only as they scroll out of it (`readScroll`): the
   * end moves with them, and nothing clamps.
   */
  heldRoom = $state(0);

  readonly roomHeight = $derived.by(() =>
    Math.max(this.#host.parkedHeight, this.heldRoom)
  );

  /** A room held open under a reader gives itself back as they scroll out of it (to `offset`), never under them. */
  giveRoomBack(node: HTMLElement, offset: number): void {
    if (this.heldRoom > 0) {
      const into = offset - this.tailTop(node);
      this.heldRoom = into > this.#host.parkedHeight ? into : 0;
    }
  }

  /**
   * Pin the viewport to the bottom. Called from the list's own resize (see the
   * pin below), after virtua has laid the list out and before the frame is
   * painted, so the viewport and the opening row move on the same frame.
   */
  pinBottom(): void {
    if (!this.scroller) {
      return;
    }
    const bottom = this.tailTop(this.scroller);
    // At the tail already, or past it in the parked room: where the view
    // stands is the pin's, and its scroll (the browser clamping a list that
    // got shorter under it) is told from the reader's by it (`lastWrite`).
    if (bottom - this.scroller.scrollTop <= 0.5) {
      this.lastWrite = this.scroller.scrollTop;
      return;
    }
    // Short of the tail, it is put there.
    const was = this.scroller.scrollTop;
    if (bottom - was > this.scroller.clientHeight) {
      // Drawn already: its rows are built first (`stageFar`), and the
      // pin lands once they are.
      if (
        this.list &&
        this.#host.shown &&
        this.#host.rowDraw.renderedRows.length > 0 &&
        !this.#host.mounted.stagedReady
      ) {
        this.#host.mounted.stageFar();
        return;
      }
      this.#host.mounted.landFar(was);
    }
    this.scroller.scrollTop = bottom;
    this.lastWrite = this.scroller.scrollTop;
    // A send landing at the tail is carried through the pin. The pin runs
    // once the list has measured the row it drew, a frame after that row
    // was first drawn and its flight begun; lifted with the list in that
    // one frame, the flight lost most of its way on a phone, where the tail
    // sits right over the composer (33px of flight, 114px of jump on iOS).
    if (this.listing) {
      carry(this.listing, was - this.scroller.scrollTop);
      this.#host.slides.carrySlides(this.scroller.scrollTop - was);
    }
  }

  /**
   * A disclosure the READER opens — a tool's body, a branch, a note — holds
   * its header where they clicked it and opens downward. Riding the bottom
   * through it scrolled the header they had just clicked off the top of the
   * view; so the transcript lets go of the tail instead, exactly as if they
   * had scrolled. A reasoning block folding shut is the transcript's own
   * motion, and keeps the pin.
   */
  onrevealstart = (event: Event): void => {
    const { target } = event;
    if (
      target instanceof Element &&
      !isThinking(target) &&
      target.getAttribute("data-state") === "open"
    ) {
      this.stopFollow();
      this.#host.arrivals.tickets.clear();
      this.atBottom = false;
    }
  };

  /**
   * Whether the tail is this transcript's to hold: landed at it, the reader
   * still there, no jump gliding to it. A pane being worked in holds it for
   * as long as the reader stays; a pane beside it (the grid) holds it only
   * until its list is first drawn — its landing, which no scroll of virtua's
   * chases for it any more — and from then on keeps where it stands while
   * its rows come in on the scheduler's turns, as it always has.
   */
  readonly pinned = (): boolean =>
    this.#host.landed &&
    this.atBottom &&
    !this.#host.jumper.jumping &&
    (this.#host.active || !this.#host.shown);

  /**
   * A PANE PUT AWAY AT ITS TAIL IS LAID OUT AT ITS TAIL.
   *
   * Put away, a pane is skipped (PaneLeaf `.pane-hidden`): its rows are built
   * on the scheduler's turns but never measured, so nothing moves its view,
   * and minutes of a busy session leave the view it was put away at screens
   * above its end (2,400px after 3 min, tab-return 1b). Started by the
   * press, the far landing that distance makes (`stageFar`, `landFar`) ran
   * in front of the reader: each step's measurement pinned again in virtua's
   * observer, a layout forced behind the rows it had just flushed, 20ms a
   * frame for 300ms, and the landing's own frame 35ms. The reach lays the
   * pane out unseen first (warm.svelte.ts), and virtua measures its rows
   * there: the landing starts then, its steps out of sight, so the press
   * finds a pane at its tail holding the rows of that view. Only from
   * virtua's observer,
   * which a skipped pane never hears (Chromium delivers no ResizeObserver
   * entry inside `content-visibility: hidden`, and a scroll write there lays
   * the subtree out to land): a read of the page in a pane put away would lay
   * it out. And in a task of its own behind the frame that measured: that
   * frame already styles every element the pane holds.
   */
  readonly awayAtTail = (): boolean =>
    this.#host.landed &&
    this.atBottom &&
    !this.#host.jumper.jumping &&
    !this.#host.visible;

  landingAway: ReturnType<typeof setTimeout> | undefined;

  landAway(): void {
    this.landingAway ??= setTimeout(() => {
      this.landingAway = undefined;
      if (this.awayAtTail()) {
        const was = this.scroller?.scrollTop;
        if (this.#host.whole.keepWhole()) {
          flushSync();
        }
        this.pinBottom();
        if (this.scroller && this.scroller.scrollTop !== was) {
          this.#host.mounted.awayScroll = 2;
        }
      }
    });
  }

  /**
   * THE PIN. While the reader is at the tail, the list getting taller is
   * followed, by this and nothing else: one writer of the tail's offset, in
   * the frame the list grew.
   *
   * A row growing (an answer streaming in, a row arriving, a row opening or
   * settling taller) and the scroller's own box changing (the window, the
   * composer column's clearance) are all measured by virtua's one
   * ResizeObserver, and virtua says so through `onresize` (virtua 0.53.2,
   * made for "stay at the bottom": inokawa/virtua#301, #408). That call comes
   * inside virtua's observer, after the frame's layout and before its paint.
   * The list's new height is still Svelte state there: the pin keeps the
   * list whole (`keepWhole`) and asks for the delivery after the layout
   * that state is written to (`pinNext`), where it reads the height the
   * frame will paint off that layout and writes the tail before the paint.
   * It used to flush the state into virtua's container in the call and read
   * the height there, which laid the page out under that flush's writes:
   * the rows it mounted styled inside the pin (`tailTop`, 10.1ms of style
   * in one reply frame at 4x CPU throttle). A row that flush mounts (the
   * range grown with the view) is observed at the next frame, not inside
   * the delivery (virtua 0.54.0, inokawa/virtua#952): observed there, WebKit
   * reported "ResizeObserver loop completed with undelivered notifications"
   * as an ask left under a reader at the tail (composer-layers).
   *
   * It pins in the frame virtua measured in. It used to wait two microtasks: the landing
   * asked virtua to `scrollToIndex` the last row, and virtua aims such a
   * scroll again at every measurement, in a microtask it queues behind this
   * call, at the row that was last when it was asked, for as long as rows
   * measure under 150ms apart — the whole of a streamed reply. Pinned in the
   * call, that aim wrote after it every frame (the reply grew 1,500px under
   * the composer in 3 of 5 runs); pinned two microtasks later, the two wrote
   * every frame and the pin won by ordering. The landing is the pin's now
   * (`land`), so no scroll of virtua's is left aiming at the tail, and the
   * pin is the last write of the frame by being the only one.
   *
   * Nothing else writes the tail while it streams. A row taken out at the end
   * (a parked ask's call, a tail row that went) is the browser's: the list
   * gets shorter, and the offset is clamped to the new end. What that leaves
   * of a pixel is `keepWhole`'s (`wholeHeight`). The strip above the list is
   * `keepPlace`'s.
   */
  onresize = (): void => {
    const view = this.list?.getViewportSize() ?? 0;
    const shrank = this.viewSeen > 0 ? this.viewSeen - view : 0;
    this.viewSeen = view;
    if (!this.pinned()) {
      if (this.awayAtTail()) {
        this.landAway();
      } else {
        this.endMoved(shrank);
      }
      return;
    }
    this.#host.whole.keepWhole();
    this.pinNext();
  };

  /** The scroller's own height as `onresize` last read it. */
  viewSeen = 0;

  /**
   * THE COMPOSER'S ROOM MOVES THE END, NOT THE ROWS. The room a pane keeps
   * for its composer changes as a tray chip comes or goes (SessionPane
   * `trayStands`): a tab's foot grows or shrinks by the tray row, a docked
   * pane's scroller by as much. A view standing at the end before that
   * change stays at the end after it, in the delivery that saw it, before
   * the frame paints: its last row stays clear of the chip. This holds for
   * a pane that is not the one worked in too (Caw's column beside the work
   * at 1440), which follows no row of its own (`pinned`): its rows coming
   * in are content, the composer's room is not. A view anywhere else keeps
   * its offset, so no row it reads moves.
   */
  endMoved(shift: number): void {
    if (
      !(this.scroller && this.#host.landed) ||
      this.#host.jumper.jumping ||
      Math.abs(shift) < 0.5
    ) {
      return;
    }
    const tail = this.tailTop(this.scroller);
    if (Math.abs(tail - shift - this.scroller.scrollTop) > TAIL_SLACK) {
      return;
    }
    this.scroller.scrollTop = tail;
    this.lastWrite = this.scroller.scrollTop;
  }

  /**
   * THE PIN READS ON THE FRAME'S OWN LAYOUT. What the pin has to follow is
   * written by the flush behind the delivery that asked for it (virtua's
   * sizes, the spare), and the frame lays it out before it delivers again,
   * to every box deeper than the shallowest it has delivered. The pin's
   * mark (the markup, under the foot) is deeper than any row of the list, so
   * observed again here it is delivered in the frame's next round, on that
   * layout: the pin reads the tail there, with nothing to lay out, and its
   * write lands before the paint. Asked for outside a delivery (a flush in a
   * task), it is delivered in the next frame's first round.
   */
  pinMark = $state<HTMLElement>();

  pinSizes: FrameObserver | null = null;

  pinAsked: boolean;

  pinNext(): void {
    const mark = this.pinMark;
    if (!mark) {
      return;
    }
    this.pinAsked = true;
    this.pinSizes ??= frameObserver(null, {
      read: () => {
        if (!this.pinAsked) {
          return;
        }
        this.pinAsked = false;
        if (this.pinMark) {
          this.pinSizes?.unobserve(this.pinMark);
        }
        if (this.pinned()) {
          this.#host.whole.keepWhole();
          this.pinBottom();
        }
      },
    });
    this.pinSizes.observe(mark);
  }

  constructor(host: ScrollPinHost) {
    this.#host = host;
    this.inputOn = false;
    this.showing = false;
    this.pinAsked = false;

    $effect(() => {
      if (!this.#host.visible) {
        return;
      }
      this.showing = true;
      let task: ReturnType<typeof setTimeout> | undefined;
      const frame = requestAnimationFrame(() => {
        task = setTimeout(() => {
          this.showing = false;
        });
      });
      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(task);
        this.showing = false;
      };
    });

    $effect(() => () => {
      cancelAnimationFrame(this.heldFrame);
      clearTimeout(this.heldTask);
    });

    $effect.pre(() => {
      const next = this.#host.parkedHeight;
      untrack(() => {
        if (!(this.scroller && this.parkedRoom)) {
          return;
        }
        if (next >= this.parkedRoom.getBoundingClientRect().height) {
          return;
        }
        const into = this.scroller.scrollTop - this.tailTop(this.scroller);
        this.heldRoom = into > next ? into : 0;
      });
    });

    $effect(() => {
      const node = this.scroller;
      if (!node) {
        return;
      }
      node.addEventListener("revealstart", this.onrevealstart);
      return () => {
        node.removeEventListener("revealstart", this.onrevealstart);
        if (this.#host.landing.landingFrame !== null) {
          cancelAnimationFrame(this.#host.landing.landingFrame);
        }
        clearTimeout(this.landingAway);
        this.landingAway = undefined;
        this.stopFollow();
      };
    });

    onDestroy(() => this.pinSizes?.disconnect());
  }
}
