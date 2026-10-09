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

  readonly #values = new Map<HTMLElement, string>();
  readonly #onOrder: (values: string[]) => void;
  #container: HTMLElement | null = null;
  #frame: number | null = null;
  #sizes: ResizeObserver | null = null;
  #moves: MutationObserver | null = null;

  /** `onOrder` hears the tabs' values in the order they stand. */
  constructor(onOrder: (values: string[]) => void) {
    this.#onOrder = onOrder;
  }

  /** The box of the tab at a place in the order. */
  at(index: number | null): ItemRect | undefined {
    return index === null ? undefined : this.rects.get(this.items[index]);
  }

  /** Svelte action for the track. */
  container = (node: HTMLElement) => {
    this.#container = node;
    this.#sizes = new ResizeObserver(() => this.#schedule());
    this.#sizes.observe(node);
    for (const el of this.#values.keys()) {
      this.#sizes.observe(el);
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
      attributeFilter: ["style", "class", "inert"],
    });
    this.#schedule();
    return {
      destroy: () => {
        this.#sizes?.disconnect();
        this.#sizes = null;
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
      this.#sizes?.observe(element);
      this.#sort();
      this.#schedule();
    });
    return () =>
      untrack(() => {
        this.#values.delete(element);
        this.#sizes?.unobserve(element);
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
  }

  /**
   * One measure per frame, at the frame's own time, however many changes
   * ask for it. A pending frame is kept, never cancelled and asked for
   * again: a gesture restyles the tabs from a frame callback queued ahead
   * of this one, so cancelling on every change put the measure off in the
   * very frame it was due, every frame, for as long as the gesture ran.
   */
  #schedule(): void {
    this.#frame ??= requestAnimationFrame(() => {
      this.#frame = null;
      this.#measure();
    });
  }

  #measure(): void {
    const container = this.#container;
    if (!container) {
      return;
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
    if (changed) {
      this.rects = rects;
    }
    if (
      container.clientWidth !== this.viewport.width ||
      container.clientHeight !== this.viewport.height
    ) {
      this.viewport = {
        width: container.clientWidth,
        height: container.clientHeight,
      };
    }
  }
}
