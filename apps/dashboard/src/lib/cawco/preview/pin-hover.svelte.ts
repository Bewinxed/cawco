/**
 * The pill the pointer rests on: its thread, uncommitted, beside it.
 */
import { dur } from "#lib/platform/motion/curves.svelte.js";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PinComposer } from "./pin-composer.svelte";
import { previewBox, previewPinId, type ViewBox } from "./wire";

/** A rested-on pin: its pill and the box of what it stands on, in the page's viewport, px (the box, once the page says it). */
export interface PinHoverAt {
  box: ViewBox | null;
  id: string;
  mark: ViewBox;
}

export interface PinHoverDeps {
  /** The pointer left an uncommitted thread: it goes back into its pill, as a closed one does (PinThread `hoverLeft`). */
  readonly leaving: (id: string) => void;
  readonly openPin: () => string | null;
  readonly paneDoc: PaneDoc;
  readonly paneLayout: PaneLayout;
  readonly pinComposer: PinComposer;
}
export class PinHover {
  readonly #deps: PinHoverDeps;

  /**
   * The pill the pointer rests on, its thread beside it, uncommitted: the
   * thread's own card, whole, where a press would open it (PinThread
   * `drawnPin`), after `--duration-peek` the first time, at once while one
   * is up or just went; never under a finger, nor where a thread is a foot
   * sheet. The pointer may leave the pill for the card: it goes
   * `--duration-peek` after the pointer left them both. A press on the pill
   * or in the card commits it (PinThread `openCard`), the same card.
   */
  hoverAt = $state<PinHoverAt | null>(null);

  hoverTimer: ReturnType<typeof setTimeout> | undefined;

  /** When the last hover went: the next within `--duration-peek` comes at once. */
  hoverWent = 0;

  /** The pointer rests on the card itself. */
  onCard = false;

  /** The pointer came onto the card (it stays) or left it (it goes after `--duration-peek`, unless the pointer is back on its pill). */
  restOn = (on: boolean) => {
    this.onCard = on;
    clearTimeout(this.hoverTimer);
    if (!on) {
      this.hoverTimer = setTimeout(this.leave, dur("--duration-peek"));
    }
  };

  /** The hover goes at once: a thread opened (it is that thread now), or a composer did. */
  drop = () => {
    clearTimeout(this.hoverTimer);
    if (this.hoverAt) {
      this.hoverWent = performance.now();
    }
    this.hoverAt = null;
    this.onCard = false;
  };

  /** The pointer has left the pill and the card: the uncommitted thread closes as a thread does. */
  leave = () => {
    const id = this.hoverPin?.id;
    if (id) {
      this.#deps.leaving(id);
    }
    this.drop();
  };

  /** No hover while a thread or a composer stands, nor where a thread is a foot sheet. */
  readonly hoverPin = $derived.by(() =>
    this.hoverAt &&
    !this.#deps.openPin() &&
    !this.#deps.pinComposer.composing &&
    !this.#deps.paneLayout.floatSheet &&
    this.#deps.paneDoc.pins.some((pin) => pin.id === this.hoverAt?.id)
      ? this.hoverAt
      : null
  );
  constructor(deps: PinHoverDeps) {
    this.#deps = deps;
  }

  /** The page's `cawco:peek`: the pointer came onto a pill (its id, its pill and what it stands on) or left it (no id). */
  heard(message: Record<string, unknown>) {
    clearTimeout(this.hoverTimer);
    const id = previewPinId(message.id);
    const mark = previewBox(message.mark);
    // None under a finger, where a thread is a foot sheet, and none while a thread or a composer stands.
    if (
      this.#deps.paneLayout.coarse.current ||
      this.#deps.paneLayout.floatSheet ||
      this.#deps.openPin() ||
      this.#deps.pinComposer.composing
    ) {
      this.drop();
      return;
    }
    if (!(id && mark)) {
      // Off its pill: onto the card, which stays, or away.
      if (this.hoverAt && !this.onCard) {
        this.hoverTimer = setTimeout(this.leave, dur("--duration-peek"));
      }
      return;
    }
    const at: PinHoverAt = { id, mark, box: previewBox(message.box) };
    const wait = dur("--duration-peek");
    if (this.hoverAt || performance.now() - this.hoverWent < wait) {
      this.hoverAt = at;
      return;
    }
    this.hoverTimer = setTimeout(() => {
      this.hoverAt = at;
    }, wait);
  }
}
