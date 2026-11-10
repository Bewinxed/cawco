import { detach } from "@cawco/core/detach";
/**
 * The scrolling transcript: the folded rows, virtualized. The live tail rides
 * as rows of its own (see `buildRowsFrom`), so streaming text, an open reasoning
 * block and the tool in flight all scroll with the conversation. Announces
 * genuine arrivals — and blocked-on-you — through a dedicated live region
 * beside the log, never through the virtualized container itself.
 */
import { flushSync, onDestroy } from "svelte";
import type { VirtualizerHandle } from "virtua/svelte";
import {
  type FrameObserver,
  frameObserver,
} from "#lib/platform/frame-observer.js";
import { track } from "#lib/platform/track.js";
import { type SessionState, sessionsStore } from "../stores/sessions.svelte";
import { readOlderPage } from "../stores/transcript-reads.svelte";

export interface OlderPagesHost {
  readonly jumper: {
    readonly jumping: boolean;
  };
  readonly landed: boolean;
  readonly pin: {
    readonly atBottom: boolean;
    lastWrite: number | null;
    readonly list: VirtualizerHandle | undefined;
    readonly listing: HTMLElement | undefined;
    readonly pinBottom: () => void;
    readonly scroller: HTMLElement | undefined;
  };
  readonly rowBuild: {
    readonly rowCount: number;
  };
  readonly session: SessionState;
  readonly shown: boolean;
  readonly visible: boolean;
}

export class OlderPages {
  readonly #host: OlderPagesHost;

  // Older pages
  /**
   * The session whose older pages this view asks for: the store's own. The
   * server's stand-in for it (see `SessionPane`) is dropped the moment the
   * store's read lands, and a page put in front of it would go with it.
   */
  paged(): SessionState | null {
    const store = sessionsStore.session(this.#host.session.instanceId);
    return store === this.#host.session ? store : null;
  }

  /**
   * OLDER PAGES COME AS THE READER NEARS THEM, ONE AT A TIME.
   *
   * The view holds the newest page and whatever its reader has scrolled up
   * to. The next older page is asked for when less than ONE VIEWPORT of rows
   * stands between the top of the view and the first row held: `above`, the
   * list's own top to the view's top, as virtua has the rows sized. A row it
   * has not measured counts at `ROW_ESTIMATE`, the smallest a row can be, so
   * the rows really there are never fewer than counted and the ask is early,
   * never late; a wheel notch, a key or a flick moves the view by less than
   * the viewport it is asked across. A list shorter than its viewport is
   * inside that distance by definition, so it fills, a page at a time, until
   * it can scroll or the conversation's start is in hand.
   *
   * Asked from the reader's scrolling and again once a page has landed (the
   * rows in front may still be too few), never before the list is drawn,
   * never for a pane off screen, and not again for a page that failed: that
   * one is asked for by its own Try again (the strip above the list).
   */
  askOlder(above: number): void {
    const store = this.paged();
    if (
      !(
        this.#host.pin.list &&
        this.#host.shown &&
        this.#host.visible &&
        store?.cursor
      ) ||
      store.hydrating ||
      store.loading ||
      store.olderFault
    ) {
      return;
    }
    // A front shift virtua is holding until a touch scroll comes to rest is
    // not in the scroll offset yet: it stands in the first row's own offset.
    if (
      above - this.#host.pin.list.getItemOffset(0) <
      this.#host.pin.list.getViewportSize()
    ) {
      detach(readOlderPage(store.instanceId), "readOlderPage");
    }
  }

  /**
   * The list's place in the view, heard in the shared size observer's
   * delivery (frame-observer.ts): the listing is observed again in the
   * frame's callbacks, so it reports in that frame's delivery, and is read
   * there, on the layout the frame has just done (as motion/rows' `heard`
   * reads its containers). Read in the frame's callbacks, its boxes laid out
   * what the update had just written (`askOlder`, 15.6ms of style in a
   * reply's 51ms frame).
   */
  nearStart: FrameObserver | null = null;

  /** Asked for in the frame's callbacks: the listing reports in that frame's delivery. */
  nearFrame = 0;

  askOlderInFrame(): () => void {
    cancelAnimationFrame(this.nearFrame);
    this.nearFrame = requestAnimationFrame(() => {
      this.nearFrame = 0;
      const node = this.#host.pin.listing;
      if (!node) {
        return;
      }
      this.nearStart ??= frameObserver(null, {
        read: (entries) => {
          const target = entries.at(-1)?.target;
          this.nearStart?.unobserve(target as Element);
          if (target && this.#host.pin.scroller) {
            this.askOlder(
              this.#host.pin.scroller.getBoundingClientRect().top -
                target.getBoundingClientRect().top
            );
          }
        },
      });
      this.nearStart.observe(node);
    });
    return () => {
      cancelAnimationFrame(this.nearFrame);
      this.nearFrame = 0;
    };
  }

  /**
   * How tall the strip before the list stands (see the markup): the page
   * being read, or the one that could not be. The list starts under it, and
   * virtua is told so (`startMargin`).
   */
  olderRoom = $state(0);

  /**
   * THE STRIP BEFORE THE LIST MOVES NOTHING. It comes and goes with the
   * cursor, and grows when a read fails — above every row, where a change of
   * height would push the whole conversation by as much. So the view moves
   * with it, in the resize itself, after the frame's layout and before its
   * paint: the rows on screen stand where they stood. At the tail the pin
   * does the same from the other end.
   */
  keepPlace = (node: HTMLElement) => {
    // biome-ignore lint/style/noRestrictedGlobals: THE STRIP BEFORE THE LIST MOVES NOTHING: the view moves by the strip's growth after the frame's layout and before its paint, so the rows on screen never jump; deferred, a frame paints them pushed down
    const watch = new ResizeObserver(() => {
      const grew = node.offsetHeight - this.olderRoom;
      if (grew === 0) {
        return;
      }
      this.olderRoom = node.offsetHeight;
      flushSync();
      if (
        !(this.#host.landed && this.#host.pin.scroller) ||
        this.#host.jumper.jumping
      ) {
        return;
      }
      if (this.#host.pin.atBottom) {
        this.#host.pin.pinBottom();
        return;
      }
      this.#host.pin.scroller.scrollTop += grew;
      this.#host.pin.lastWrite = this.#host.pin.scroller.scrollTop;
    });
    watch.observe(node);
    return () => watch.disconnect();
  };

  constructor(host: OlderPagesHost) {
    this.#host = host;

    onDestroy(() => this.nearStart?.disconnect());

    // What can bring the first rows near without a scroll: the list drawn, a
    // page landed with few rows in it, the pane coming on screen. Read in the
    // next frame, once virtua has moved the view by what the page added.
    $effect(() => {
      const store = this.paged();
      if (
        !(this.#host.shown && this.#host.visible && store?.cursor) ||
        store.hydrating ||
        store.loading ||
        store.olderFault
      ) {
        return;
      }
      track(this.#host.rowBuild.rowCount);
      return this.askOlderInFrame();
    });
  }
}
