import type { VirtualizerHandle } from "virtua/svelte";

export interface ListWholeHost {
  readonly endMoved: (shift: number) => void;
  readonly list: VirtualizerHandle | undefined;
  readonly listing: HTMLElement | undefined;
  readonly olderRoom: number;
  readonly pinNext: () => void;
  readonly pinned: () => boolean;
}

export class ListWhole {
  readonly #host: ListWholeHost;

  /**
   * The part of a pixel that makes the scroll range a whole number of pixels,
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
    const size = this.#host.list?.getScrollSize() ?? 0;
    if (size > (this.#host.list?.getViewportSize() ?? 0)) {
      return size;
    }
    const inner = this.#host.listing?.firstElementChild as
      HTMLElement | null | undefined;
    return Number.parseFloat(inner?.style.height ?? "");
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
   */
  keepWhole(): boolean {
    const height = this.listHeight();
    const viewport = this.#host.list?.getViewportSize() ?? 0;
    if (!(viewport > 0 && this.rooms.measured && Number.isFinite(height))) {
      return false;
    }
    const range = this.#host.olderRoom + height + this.rooms.foot - viewport;
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

  wholeHeight = (node: HTMLElement) => {
    const inner = node.firstElementChild;
    if (!inner) {
      return;
    }
    this.keepWhole();
    let size = this.#host.list?.getScrollSize() ?? 0;
    const watch = new MutationObserver(() => {
      const now = this.#host.list?.getScrollSize() ?? 0;
      const shrank = now < size;
      size = now;
      // A list that got shorter under a view pinned at its end is the
      // pin's: it reads where the clamp leaves the view, and tags it
      // (`pinBottom`). Read here as well, behind the pin, the scroller's
      // height was a second read of the microtask (`(anonymous)` at
      // Transcript.svelte:2417 compiled, a reply's long frames); a view the
      // reader holds is told from a clamp by the scroll that comes
      // (`readScroll`).
      if ((this.keepWhole() || shrank) && this.#host.pinned()) {
        this.#host.pinNext();
      }
    });
    watch.observe(inner, { attributes: true, attributeFilter: ["style"] });
    return () => watch.disconnect();
  };

  constructor(host: ListWholeHost) {
    this.#host = host;

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
        if (this.#host.pinned()) {
          this.#host.pinNext();
        } else if (was !== null) {
          this.#host.endMoved(this.rooms.foot - was);
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
