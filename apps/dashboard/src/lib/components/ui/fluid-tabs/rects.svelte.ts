/**
 * Where each tab sits in its track, for the overlays the track places from
 * measurements: the chosen segment, a gesture carrying it part-way to
 * another tab, the focus ring, and the scroll that keeps the chosen tab in
 * view. The hover layer is not one of them: it is the kit's highlight.
 *
 * Rects are layout values (`offset*`), accumulated up to the track, so they
 * are in the track's own coordinate space — the space an absolutely
 * positioned overlay lives in — and unaffected by transforms on ancestors.
 */

export interface ItemRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

export class TabRects {
  rects = $state<ItemRect[]>([]);
  /** The track's own inner size, re-read with the items: a track that
      narrows moves what is in view even when no item moved. */
  viewport = $state({ width: 0, height: 0 });

  #container: HTMLElement | null = null;
  readonly #items = new Map<number, HTMLElement>();
  #frame: number | null = null;
  #observer: ResizeObserver | null = null;

  /** Svelte action for the track. */
  container = (node: HTMLElement) => {
    this.#container = node;
    this.#observer = new ResizeObserver(() => this.#schedule());
    this.#observer.observe(node);
    for (const el of this.#items.values()) {
      this.#observer.observe(el);
    }
    this.#schedule();
    return {
      destroy: () => {
        this.#observer?.disconnect();
        this.#observer = null;
        this.#container = null;
        if (this.#frame !== null) {
          cancelAnimationFrame(this.#frame);
        }
      },
    };
  };

  /** Registers an item at an index for as long as it is mounted. */
  register(index: number, element: HTMLElement): () => void {
    this.#items.set(index, element);
    this.#observer?.observe(element);
    this.#schedule();
    return () => {
      if (this.#items.get(index) === element) {
        this.#items.delete(index);
      }
      this.#observer?.unobserve(element);
      this.#schedule();
    };
  }

  #schedule(): void {
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
    }
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#measure();
    });
  }

  #measure(): void {
    const container = this.#container;
    if (!container) {
      return;
    }
    const rects: ItemRect[] = [];
    for (const [index, element] of this.#items) {
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
      rects[index] = {
        top,
        left,
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
    }
    const prev = this.rects;
    let changed = prev.length !== rects.length;
    for (let i = 0; !changed && i < rects.length; i += 1) {
      const p = prev[i];
      const r = rects[i];
      if (p === r) {
        continue;
      }
      changed =
        !(p && r) ||
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
