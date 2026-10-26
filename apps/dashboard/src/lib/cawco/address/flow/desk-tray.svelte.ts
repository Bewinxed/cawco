/**
 * A desk surface's tray (Needs you's row, Settings' button): it opens from
 * the box that was pressed once it has mounted (motion.ts `openFrom`), and
 * goes back into it (`closeTo`) on ×, Esc, or a press elsewhere in its
 * frame. Made as its component starts; the component binds `frame` and
 * `tray`.
 */
import { untrack } from "svelte";
import { closeTo, openFrom, type Source } from "../motion";
import type { AddressFlow, Surface } from "./flow.svelte";

export class DeskTray {
  /** The surface's frame: a press in it, off the tray, puts the tray back. */
  frame = $state<HTMLElement | null>(null);
  tray = $state<HTMLElement | null>(null);
  #from: Source | null = null;
  readonly #flow: () => AddressFlow;
  readonly #surface: Surface;
  readonly #back: (tray: DOMRect) => Source | null;

  /** `back`: the box the tray closes into, given the tray's own. */
  constructor(
    flow: () => AddressFlow,
    surface: Surface,
    back: (tray: DOMRect) => Source | null
  ) {
    this.#flow = flow;
    this.#surface = surface;
    this.#back = back;
    $effect(() => {
      const el = this.#open ? this.tray : null;
      if (el) {
        untrack(() => {
          if (this.#from) {
            openFrom(el, this.#from);
          }
          this.#from = null;
        });
      }
    });
  }

  get #open(): boolean {
    return this.#flow().open[this.#surface];
  }

  /** Shows the tray, opening from `source` when there is one. */
  show(source: Source | null): void {
    this.#from = source;
    this.#flow().show(this.#surface);
  }

  park = (): void => {
    const el = this.tray;
    if (!(el && this.#open)) {
      return;
    }
    closeTo(el, this.#back(el.getBoundingClientRect()), () =>
      this.#flow().park(this.#surface)
    );
  };

  onpointerdown = (event: PointerEvent): void => {
    const target = event.target as Node;
    if (
      this.#open &&
      this.tray &&
      this.frame?.contains(target) &&
      !this.tray.contains(target)
    ) {
      this.park();
    }
  };
}
