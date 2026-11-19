import { flushSync, untrack } from "svelte";
import type { VirtualizerHandle } from "virtua/svelte";
import type { Row } from "./rows";

export interface ListWholeHost {
  readonly jumper: {
    readonly jumping: boolean;
  };
  readonly landed: boolean;
  readonly older: {
    readonly olderRoom: number;
  };
  readonly pin: {
    readonly atBottom: boolean;
    readonly endMoved: (shift: number) => void;
    lastWrite: number | null;
    readonly list: VirtualizerHandle | undefined;
    readonly listing: HTMLElement | undefined;
    readonly pinned: () => boolean;
    readonly pinNext: () => void;
    readonly scroller: HTMLElement | undefined;
    readonly writes: number;
  };
  readonly rowDraw: {
    readonly renderedRows: Row[];
  };
  readonly shown: boolean;
  readonly visible: boolean;
}

/**
 * The index of the row drawn at `at` (px from the list's first row) among
 * `length`: the last whose drawn top (`getItemOffset`, the `top` virtua
 * writes on it) is at or above `at`.
 *
 * Not `findItemIndex`, which reads the rows' laid-out sizes alone. On iOS
 * WebKit (virtua's `isIOSWebKit`, by the user agent) virtua does not scroll
 * for rows changed above the view while the view is scrolling: it holds the
 * change and draws every row that much higher (its store's pending jump,
 * which `getItemOffset` takes off), then writes it as one scroll when the
 * scroll comes to rest. Under a page landed in front that is thousands of
 * pixels, and `findItemIndex` named a row that far above the view, never
 * drawn: nothing was seen, and the write at rest, its fraction dropped by
 * WebKit, moved every row on screen half a pixel (WebKit at iPhone size,
 * 7 landings in 10). The reader's kept place (KeptPlace `placeAt`) read the
 * same wrong row, and put back past its end moved the view 30–396px.
 */
export function drawnAt(
  list: VirtualizerHandle,
  at: number,
  length: number
): number {
  let low = 0;
  let high = length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (list.getItemOffset(middle) <= at) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/**
 * The row the reader sees at the top of a view whose top is `at` (px from
 * the list's first row): the first at or below the row drawn there
 * (`drawnAt`) that virtua draws measured, looked for down to the view's foot
 * (virtua's viewport); its index among `rows` and its element. Null when the
 * view shows none.
 *
 * A row virtua has not measured is mounted at its estimate and drawn hidden
 * (its item's `visibility: hidden`, virtua's `hide`) until its size comes,
 * which is a frame later when its ResizeObserver delivery is put off (rows
 * mounted inside a delivery, "ResizeObserver loop completed with
 * undelivered notifications"). No reader sees it, and measured it grows
 * from its top while virtua keeps the rows below it where they stand. Taken
 * for the row at the top, it was what the view held: the reader's kept place
 * put it back and moved every row they saw by its growth (KeptPlace
 * `scrollToRow` 203px down, WebKit at 1440, a wheel up just after a page
 * landed). And looked for only eight rows past
 * the top, under a wheel that brought the view a screen's worth of rows
 * virtua mounts in the flush behind it, nothing was seen and nothing held:
 * virtua's `scrollBy(381.5)` for the rows measured above, its fraction
 * dropped by WebKit, moved every row on screen half a pixel (2 runs in 12).
 */
export function seenAt(
  list: VirtualizerHandle,
  listing: HTMLElement,
  rows: readonly Row[],
  at: number
): { index: number; row: HTMLElement } | null {
  const shown = new Map<string, HTMLElement>();
  for (const item of listing.firstElementChild?.children ?? []) {
    if (item instanceof HTMLElement && item.style.visibility !== "hidden") {
      const row = item.querySelector<HTMLElement>(":scope > [data-row]");
      if (row?.dataset.row !== undefined) {
        shown.set(row.dataset.row, row);
      }
    }
  }
  const foot = at + list.getViewportSize();
  for (
    let index = drawnAt(list, at, rows.length);
    index < rows.length && list.getItemOffset(index) < foot;
    index += 1
  ) {
    const row = shown.get(rows[index].key);
    if (row) {
      return { index, row };
    }
  }
  return null;
}

export class ListWhole {
  readonly #host: ListWholeHost;

  /**
   * The part of a pixel laid above the list's first row. At the tail it is
   * the part that makes the scroll range a whole number of pixels
   * (`keepWhole`); away from the tail it is the part that keeps the rows on
   * screen where they stood (`holdView`).
   *
   * At the tail: the part of a pixel that makes the scroll range whole,
   * laid above the list's first row. A scroll offset is whole (at a device
   * pixel ratio of 1, in Chromium and WebKit alike), and the range it moves
   * over — the content's height less the scroller's own box — rarely is: the
   * list is the sum of its rows' measured heights, and the box is whatever
   * the pane's layout left it (733.359375px in WebKit, 732.859375px in
   * Chromium, where `clientHeight` says 733 for both). Pinned at the largest
   * whole offset, the last row stood off the foot by what was left over: a row
   * arriving moved the tail 0.56px, and in WebKit the tail rested 0.359px
   * above the foot, where virtua took the growing row for one above the view
   * and held its top (its store's `shouldKeep`), a write of its own on every
   * frame of a reply. Taken up at the top, where no reader sees a sub-pixel,
   * it puts the tail on the foot exactly, every time.
   */
  spare = $state(0);

  /** The room under the list that clears the composer (the markup). */
  foot = $state<HTMLElement>();

  /**
   * The list's own height. virtua's `getScrollSize` is its store's, exact,
   * where the height it writes to its container's style reads back in
   * Chromium cut to six significant digits (2129.05 for 2129.046875), but it
   * is never less than the viewport (virtua 0.53.4: `getScrollSize` is
   * `max($getTotalSize(), $getViewportSize())`). A list shorter than its
   * view read as tall as the view, so it never fitted: the spare was the
   * rooms' part of a pixel (0.96875px under a 144.03125px foot), put on or
   * not by whether a resize came while the view was pinned. A list shorter
   * than its view is the height virtua wrote on its container
   * (`height: totalSize + "px"`), whose six digits are exact to a
   * thousandth at that size.
   */
  listHeight(): number {
    const size = this.#host.pin.list?.getScrollSize() ?? 0;
    if (size > (this.#host.pin.list?.getViewportSize() ?? 0)) {
      return size;
    }
    const inner = this.#host.pin.listing?.firstElementChild;
    return Number.parseFloat(
      inner instanceof HTMLElement ? inner.style.height : ""
    );
  }

  /**
   * Puts `spare` on the tail's range as it stands; says whether it moved.
   * Its padding goes on the page with the flush it is set in, which the pin
   * reads behind (`pinNext`), so a list that grew is whole in the frame it
   * grew.
   *
   * The range is where the tail stands (`tailTop`): virtua's viewport (the
   * box's content height, `getViewportSize`) against the strip before the
   * list, the list (`listHeight`) and the foot. The parked room past the
   * foot is not the tail's, so it is not counted. None of them is read off
   * the layout: this runs in whatever task virtua's write landed in. The
   * foot is the size its observer last delivered (`rooms`): read here as its
   * computed style, its resolved block size laid the page out in the
   * microtask behind every height virtua wrote, a whole layout per row a
   * streamed reply grew.
   *
   * A list that fits its view has no range to make whole, and no spare.
   *
   * Only while the view holds the tail. Away from it the spare stands above
   * the rows the reader is reading, and a spare chosen for the range moved
   * every one of them by its change: a page landing in front moved the row
   * at the view's top a pixel, its part of a pixel down and virtua's
   * rounded jump the rest (older.mjs, every run). There it is `holdView`'s.
   */
  keepWhole(): boolean {
    if (!this.#host.pin.atBottom) {
      return false;
    }
    const height = this.listHeight();
    const viewport = this.#host.pin.list?.getViewportSize() ?? 0;
    if (!(viewport > 0 && this.rooms.measured && Number.isFinite(height))) {
      return false;
    }
    const range =
      this.#host.older.olderRoom + height + this.rooms.foot - viewport;
    const over = range <= 0 ? 0 : ((-range % 1) + 1) % 1;
    const next = over < 0.001 || over > 0.999 ? 0 : over;
    if (Math.abs(next - this.spare) <= 0.001) {
      return false;
    }
    this.spare = next;
    return true;
  }

  /**
   * Keeps `spare` on the list's height whatever changed it, and the tail on
   * the foot when the pin did not see the change: a row taken out at the end
   * (a parked ask's call) moves no row's size, only the list's, and virtua
   * says nothing of it. The height is heard through a MutationObserver on
   * virtua's container's style, as the microtask behind virtua's write,
   * before the frame is painted. virtua writes it from inside its own
   * ResizeObserver callback, so the container is never observed for size
   * (THE PIN, below). A change the pin saw is already whole by then.
   *
   * A LIST THAT GOT SHORTER UNDER A VIEW AT ITS END IS NOT THE READER. The
   * browser clamps the offset to the new end, and the scroll event that
   * makes is dispatched a frame later, by when the list can have grown again
   * (a row in at its estimate). So the clamp is tagged here, where the
   * shrink is heard: read with the layout it clamped in, a view standing on
   * the end is the clamp's, and its event is this component's own
   * (`lastWrite`). Nothing is written. Left to `onscroll`'s own clamp test
   * against the height at dispatch, that event read as the reader scrolling
   * up, 21px short of an end that had moved on, and the tail was let go for
   * good: after a continuation in place (its list shrinks by 1,350px at the
   * tail as the next rows come in), the open pane stood a turn short of the
   * reply after it and no longer followed the tail (the page's CPU
   * throttled 4x or 6x, 3 runs of 6).
   */
  /**
   * The foot's height, as its observer last delivered it: after a layout,
   * never by asking for one. It comes as the foot is first laid out and
   * whenever it resizes (the composer's clearance changing: a tray chip
   * arriving or leaving), and the list is made whole again for it and a
   * pinned tail follows it. The parked room is not observed: it moves
   * neither the tail nor the view.
   */
  readonly rooms: { foot: number; measured: boolean } = {
    foot: 0,
    measured: false,
  };

  /**
   * THE ROWS ON SCREEN STAND WHERE THE READER LEFT THEM.
   *
   * Away from the tail, whatever changes above the view (a page put in
   * front, rows above measured, the strip before the list coming, growing
   * or going with the page that ends the conversation) moves the rows on
   * screen by nothing at all. virtua keeps them for its own rows (`shift`,
   * and its correction for a row measured above the view), but it scrolls by
   * its sizes' change, a fraction of a pixel among them (`scrollBy(426.5)`),
   * and the engine puts a scroll offset on a whole pixel (Chromium rounds it,
   * WebKit drops the fraction): the row at the view's top moved by what was
   * dropped. Nor does it scroll for the room before the list (its
   * `startMargin`), and its `shift` holds the distance from the list's end,
   * so a row measured below the view moved the rows on it.
   *
   * So once virtua has written, this puts back the row the reader last saw
   * at the view's top (`seen`), where it stood: the view moves by the whole
   * pixels of the change, and the spare above the list takes up its part of
   * a pixel, so the row stands at the very same place, not the nearest
   * pixel to it. One write, read off the layout virtua's own write has just
   * laid out. Heard where the list's height is written (`wholeHeight`), as
   * the strip before the list resizes (OlderPages `keepPlace`), never at the
   * tail, which is the pin's, nor under a jump to the latest, which is its
   * own. On iOS WebKit virtua's write for rows changed above the view comes
   * when the scroll comes to rest (`drawnAt`), and changes no height; it is
   * heard on the same style all the same, which loses its
   * `pointer-events: none` in that write (virtua's `isScrolling` ends with
   * the held change).
   */
  holdView(): void {
    const { seen } = this;
    const { scroller } = this.#host.pin;
    if (
      !(
        seen &&
        scroller &&
        seen.row.isConnected &&
        this.#host.landed &&
        this.#host.shown &&
        this.#host.visible
      ) ||
      this.#host.pin.atBottom ||
      this.#host.jumper.jumping ||
      seen.writes !== this.#host.pin.writes
    ) {
      return;
    }
    const stands =
      seen.row.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top;
    const now = scroller.scrollTop;
    if (stands !== seen.top) {
      // Where the view would stand with no spare, on the layout's own
      // 1/64px steps; the whole pixel at or past it, and the spare the rest.
      // Above the scroller's top the spare takes all of it: on iOS WebKit
      // the view can stand at 0 with a page's worth of rows drawn above it,
      // virtua's scroll for them held until rest (`drawnAt`), and the strip
      // before the list leaving with the last page moved every row 54px up,
      // then down again at rest. virtua's write at rest gives the room back,
      // and the spare is a part of a pixel again.
      const bare = Math.round((now - this.spare + stands - seen.top) * 64) / 64;
      const offset = Math.max(0, Math.ceil(bare));
      if (offset - bare !== this.spare) {
        this.spare = offset - bare;
        flushSync();
      }
      if (offset !== now) {
        scroller.scrollTop = offset;
      }
    }
    // The view moved, by virtua's write or this one: its scroll is told from
    // the reader's as this component's own (ScrollPin `whoseScroll`), and
    // what the reader saw stays seen.
    if (scroller.scrollTop !== seen.offset) {
      this.#host.pin.lastWrite = scroller.scrollTop;
      seen.offset = scroller.scrollTop;
      seen.writes = this.#host.pin.writes;
    }
  }

  /**
   * The row at the view's top as the reader's own scroll, or a write of this
   * component's, last left it: its element, how far below the scroller's
   * top it stood (`holdView`), the scroll offset then, and the count of
   * this component's writes then (ScrollPin `writes`): another write since
   * (a place put back, the end followed) moved it as meant, and it is seen
   * again at the scroll that write makes.
   */
  seen: {
    offset: number;
    row: HTMLElement;
    top: number;
    writes: number;
  } | null = null;

  /** Takes the row the reader sees at the view's top at `offset` (`seenAt`) as seen (`seen`), or nothing at none. Read in the scroll event, on the layout virtua's read of it has just laid out. */
  see(offset: number | null): void {
    const { list, listing, scroller } = this.#host.pin;
    // A scroll can bring the view to rows virtua mounts only in the flush
    // behind it, or draws hidden until they are measured: the first row
    // under them that the reader sees.
    const row =
      list && listing && offset !== null
        ? seenAt(
            list,
            listing,
            this.#host.rowDraw.renderedRows,
            offset - this.#host.older.olderRoom - this.spare
          )?.row
        : null;
    this.seen =
      row && scroller && offset !== null
        ? {
            offset,
            row,
            top:
              row.getBoundingClientRect().top -
              scroller.getBoundingClientRect().top,
            writes: this.#host.pin.writes,
          }
        : null;
  }

  wholeHeight = (node: HTMLElement) => {
    const inner = node.firstElementChild;
    if (!inner) {
      return;
    }
    this.keepWhole();
    let size = this.#host.pin.list?.getScrollSize() ?? 0;
    const watch = new MutationObserver(() => {
      const now = this.#host.pin.list?.getScrollSize() ?? 0;
      const shrank = now < size;
      size = now;
      if (!this.#host.pin.atBottom) {
        this.holdView();
        return;
      }
      // A list that got shorter under a view pinned at its end is the
      // pin's: it reads where the clamp leaves the view, and tags it
      // (`pinBottom`). Read here as well, behind the pin, the scroller's
      // height was a second read of the microtask (`(anonymous)` at
      // Transcript.svelte:2417 compiled, a reply's long frames); a view the
      // reader holds is told from a clamp by the scroll that comes
      // (`readScroll`).
      if ((this.keepWhole() || shrank) && this.#host.pin.pinned()) {
        this.#host.pin.pinNext();
      }
    });
    watch.observe(inner, { attributes: true, attributeFilter: ["style"] });
    return () => watch.disconnect();
  };

  constructor(host: ListWholeHost) {
    this.#host = host;

    // The view comes back to the tail: the spare is the tail's again.
    $effect(() => {
      if (this.#host.pin.atBottom) {
        untrack(() => this.keepWhole());
      }
    });

    $effect(() => {
      const footNode = this.foot;
      if (!footNode) {
        return;
      }
      // biome-ignore lint/style/noRestrictedGlobals: the foot is read in the delivery, after the layout that sized it, and a pinned tail made whole there, so no frame paints it off the end
      const sizes = new ResizeObserver((entries) => {
        const was = this.rooms.measured ? this.rooms.foot : null;
        for (const entry of entries) {
          this.rooms.foot = entry.borderBoxSize[0]?.blockSize ?? 0;
        }
        this.rooms.measured = true;
        // The foot resizing moves the tail by its whole change, not only the
        // spare's part of a pixel: a tray chip arriving grows it a tray row,
        // and a pinned tail gated on the spare stayed where it was, its last
        // row under the chip.
        this.keepWhole();
        if (this.#host.pin.pinned()) {
          this.#host.pin.pinNext();
        } else if (was !== null) {
          this.#host.pin.endMoved(this.rooms.foot - was);
        }
      });
      sizes.observe(footNode);
      return () => {
        sizes.disconnect();
        this.rooms.measured = false;
      };
    });
  }
}
