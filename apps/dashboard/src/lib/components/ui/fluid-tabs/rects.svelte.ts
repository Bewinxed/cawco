/**
 * The tabs in their track: in what order they stand, and where each one is
 * laid out, for the overlays the track places from measurements — the
 * chosen segment, a gesture carrying it part-way to another tab, the focus
 * ring, the hover ghost, and the scroll that keeps the chosen tab in view.
 *
 * Rects are layout values (`offset*`), accumulated up to the track, so they
 * are in the track's own coordinate space — the space an absolutely
 * positioned overlay lives in — and unaffected by transforms: a tab a FLIP
 * is still carrying from where it stood is measured where it lands.
 *
 * They are re-measured whenever a tab can have moved, not only resized: a
 * tab or the track resizing, a tab arriving or leaving, the tabs being
 * reordered, or a box that holds a tab restyled (a closing tab taken out
 * of the flow, which slides every tab after it over without resizing any).
 */

import { untrack } from "svelte";
import {
  type FrameObserver,
  frameObserver,
} from "#lib/cawco/frame-observer.js";

/**
 * The custom properties in an inline style. On a box holding a tab they
 * draw it and never place it: the track's stack and seams on the switch's
 * clock (TabsList's `rank` and `placeSeams`, every frame of a switch), and a
 * host's tones, rims and ranks (PaneTabs, on every switch). A tab that
 * changes size is heard by its own observer (`#sizes`). Each such write had
 * the tabs measured again, their offsets laying the page out in the frame's
 * callbacks, ahead of the frame's own layout.
 */
const DRAWN = /--[\w-]+\s*:[^;]*;?/g;

/** An inline style less what draws a tab: what can place one. */
const placedBy = (style: string | null): string =>
  (style ?? "").replace(DRAWN, "").trim();

export interface ItemRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export class TabRects {
  /** The tabs, in the order they stand in the track. */
  items = $state.raw<HTMLElement[]>([]);
  /** Where each tab is laid out. */
  rects = $state.raw<ReadonlyMap<HTMLElement, ItemRect>>(new Map());
  /** The track's own inner size, re-read with the items: a track that
      narrows moves what is in view even when no item moved. */
  viewport = $state({ width: 0, height: 0 });
  /**
   * The order and the boxes of one measure, together: what `at` reads. The
   * order changes the moment a tab arrives, leaves or moves (`#sort`), the
   * boxes only when they are measured; read apart, a place in the new order
   * met the box measured for another tab that stood there before (the
   * segment at Working's place with Finished's width).
   */
  #measured = $state.raw<{
    items: HTMLElement[];
    rects: ReadonlyMap<HTMLElement, ItemRect>;
  }>({ items: [], rects: new Map() });

  readonly #values = new Map<HTMLElement, string>();
  readonly #onOrder: (values: string[]) => void;
  #container: HTMLElement | null = null;
  #frame: number | null = null;
  #sizes: FrameObserver | null = null;
  /** What the last measure in a delivery read, written in the next frame. */
  #pending: (() => void) | null = null;
  /**
   * The track and the tabs observed whose first report has not come: a
   * measure asked for meanwhile is taken in that report (`#schedule`).
   */
  readonly #unreported = new Set<Element>();
  #moves: MutationObserver | null = null;

  /** `onOrder` hears the tabs' values in the order they stand. */
  constructor(onOrder: (values: string[]) => void) {
    this.#onOrder = onOrder;
  }

  /** The box of the tab at a place in the order, both from the same measure. */
  at(index: number | null): ItemRect | undefined {
    if (index === null) {
      return;
    }
    const { items, rects } = this.#measured;
    return rects.get(items[index]);
  }

  /** Svelte action for the track. */
  container = (node: HTMLElement) => {
    this.#container = node;
    // Read inside the delivery, on its layout; written in the next frame
    // (frameObserver), so the tabs' new places resize nothing it has passed.
    // A box's first report (the track mounting, a tab arriving) writes there
    // and then (`first`): the frame it mounts in paints its tabs' places,
    // which only the track's overlays draw from.
    const write = () => {
      const read = this.#pending;
      this.#pending = null;
      read?.();
    };
    this.#sizes = frameObserver(write, {
      read: () => this.#measureLaidOut(),
      first: (entries) => {
        for (const entry of entries) {
          this.#unreported.delete(entry.target);
        }
        return write;
      },
    });
    this.#watch(node);
    for (const el of this.#values.keys()) {
      this.#watch(el);
    }
    this.#moves = new MutationObserver((records) => {
      if (records.some((record) => this.#canMove(record))) {
        this.#sort();
        this.#schedule();
      }
    });
    this.#moves.observe(node, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["style", "class", "inert"],
    });
    return {
      destroy: () => {
        this.#sizes?.disconnect();
        this.#sizes = null;
        this.#unreported.clear();
        this.#moves?.disconnect();
        this.#moves = null;
        this.#container = null;
        if (this.#frame !== null) {
          cancelAnimationFrame(this.#frame);
        }
      },
    };
  };

  /**
   * Registers a tab and its value for as long as it is mounted. Called from
   * the item's effect, so the order it reads and rewrites is untracked: the
   * effect depends on the tab and its value, not on the order it changes.
   */
  register(element: HTMLElement, value: string): () => void {
    untrack(() => {
      this.#values.set(element, value);
      this.#watch(element);
      this.#sort();
      this.#schedule();
    });
    return () =>
      untrack(() => {
        this.#values.delete(element);
        this.#sizes?.unobserve(element);
        this.#unreported.delete(element);
        this.#sort();
        this.#schedule();
      });
  }

  /**
   * Whether a change in the track can have moved a tab: a node carrying one
   * added, removed or moved (a reorder), or a box holding one restyled. A
   * tab's own style is the kit's — a gesture's `--ride`, every frame — and
   * moves nothing; nor do the overlays, which hold no tab.
   */
  #canMove(record: MutationRecord): boolean {
    const holds = (node: Node) => {
      for (const item of this.#values.keys()) {
        if (node !== item && node.contains(item)) {
          return true;
        }
      }
      return false;
    };
    if (record.type === "childList") {
      return [...record.addedNodes, ...record.removedNodes].some(
        (node) => this.#values.has(node as HTMLElement) || holds(node)
      );
    }
    if (
      record.attributeName === "style" &&
      placedBy(record.oldValue) ===
        placedBy((record.target as Element).getAttribute("style"))
    ) {
      return false;
    }
    return holds(record.target);
  }

  /**
   * Whether a tab is on its way out: Svelte makes an element inert for the
   * length of its exit. A leaving tab is still drawn, but it is no longer
   * in the order — arrow keys must not land on it and choose it again, and
   * the tabs after it are already a place further along.
   */
  #leaving(element: HTMLElement): boolean {
    for (
      let node: HTMLElement | null = element;
      node && node !== this.#container;
      node = node.parentElement
    ) {
      if (node.inert) {
        return true;
      }
    }
    return false;
  }

  /** The tabs in document order, and their values handed to the root. */
  #sort(): void {
    const next = [...this.#values.keys()]
      .filter((el) => el.isConnected && !this.#leaving(el))
      // Tabs never hold one another, so `b` is either after `a` or before it.
      .sort((a, b) =>
        a.compareDocumentPosition(b) === Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1
      );
    const prev = this.items;
    if (next.length === prev.length && next.every((el, i) => el === prev[i])) {
      return;
    }
    this.items = next;
    this.#onOrder(next.map((el) => this.#values.get(el) as string));
    // The new order is read with its own boxes once they are measured.
    this.#schedule();
  }

  /** Observes a box, its first report still to come (`#unreported`). */
  #watch(element: Element): void {
    if (this.#sizes) {
      this.#unreported.add(element);
      this.#sizes.observe(element);
    }
  }

  /**
   * One measure per frame, at the frame's own time, however many changes
   * ask for it. A pending frame is kept, never cancelled and asked for
   * again: a gesture restyles the tabs from a frame callback queued ahead
   * of this one, so cancelling on every change put the measure off in the
   * very frame it was due, every frame, for as long as the gesture ran.
   *
   * With a box's first report due (a tab arriving), that frame's measure is
   * that report's (`first`), on the layout the frame has done: taken in its
   * callbacks, ahead of that layout, it laid out the page the arrival had
   * just changed (a turn's Working tab arriving in the rail: up to 60ms of
   * layout at 4x on the phone). The frame after it measures if no report
   * came: a box laid out at no size is reported by no ResizeObserver.
   */
  #schedule(): void {
    this.#frame ??= requestAnimationFrame(() => {
      this.#frame = null;
      if (this.#unreported.size > 0) {
        this.#unreported.clear();
        this.#schedule();
        return;
      }
      this.#measure();
    });
  }

  /**
   * A tab or the track resized, heard where the frame has just laid them
   * out (the observer's own call): measured there, on layout already done.
   * Measured in the next frame's callbacks instead, after a streamed reply
   * had changed the page again, every resize of a tab laid the page out
   * there (two-pane-perf's stream, 83–135ms of `offsetParent`). A measure
   * still due that frame is the same one, taken now. What it read is
   * written in the next frame (`#pending`).
   */
  #measureLaidOut(): void {
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
    }
    this.#pending = this.#read();
  }

  #measure(): void {
    this.#read()?.();
  }

  /** Reads the tabs' boxes; answers the write that keeps them, or null with no track. */
  #read(): (() => void) | null {
    const container = this.#container;
    if (!container) {
      return null;
    }
    const rects = new Map<HTMLElement, ItemRect>();
    for (const element of this.items) {
      if (element.offsetParent === null) {
        continue;
      }
      let top = element.offsetTop;
      let left = element.offsetLeft;
      let ancestor = element.offsetParent as HTMLElement | null;
      while (
        ancestor &&
        ancestor !== container &&
        container.contains(ancestor)
      ) {
        top += ancestor.offsetTop + ancestor.clientTop;
        left += ancestor.offsetLeft + ancestor.clientLeft;
        ancestor = ancestor.offsetParent as HTMLElement | null;
      }
      rects.set(element, {
        top,
        left,
        width: element.offsetWidth,
        height: element.offsetHeight,
      });
    }
    const prev = this.rects;
    let changed = prev.size !== rects.size;
    for (const [element, r] of rects) {
      if (changed) {
        break;
      }
      const p = prev.get(element);
      changed =
        !p ||
        p.top !== r.top ||
        p.left !== r.left ||
        p.width !== r.width ||
        p.height !== r.height;
    }
    const { items } = this;
    const width = container.clientWidth;
    const height = container.clientHeight;
    return () => {
      if (changed) {
        this.rects = rects;
      }
      if (changed || this.#measured.items !== items) {
        this.#measured = { items, rects: this.rects };
      }
      if (width !== this.viewport.width || height !== this.viewport.height) {
        this.viewport = { width, height };
      }
    };
  }
}
