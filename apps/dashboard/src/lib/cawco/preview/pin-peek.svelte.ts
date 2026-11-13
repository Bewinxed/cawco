/**
 * The pill the pointer rests on, its peek beside it.
 */
import { dur } from "#lib/platform/motion/curves.svelte.js";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PinComposer } from "./pin-composer.svelte";
import { type PreviewPinAt, previewBox, previewPinId } from "./wire";

export interface PinPeekDeps {
  readonly openPin: () => string | null;
  readonly paneDoc: PaneDoc;
  readonly paneLayout: PaneLayout;
  readonly pinComposer: PinComposer;
}
export class PinPeek {
  readonly #deps: PinPeekDeps;

  /**
   * The pill the pointer rests on, its peek beside it: its thread's card
   * holding his words and the latest reply (PinCard `peek`), after
   * `--duration-peek` the first time, at once while one is up or just went;
   * never under a finger. The pointer may leave the pill for the peek: it
   * goes `--duration-peek` after the pointer left them both.
   */
  peekAt = $state<{ id: string; mark: PreviewPinAt["mark"] } | null>(null);

  peekTimer: ReturnType<typeof setTimeout> | undefined;

  /** When the last peek went: the next within `--duration-peek` comes at once. */
  peekWent = 0;

  /** The pointer rests on the peek itself. */
  onPeek = false;

  /** The pointer came onto the peek (it stays) or left it (it goes after `--duration-peek`, unless the pointer is back on its pill). */
  restOnPeek = (on: boolean) => {
    this.onPeek = on;
    clearTimeout(this.peekTimer);
    if (!on) {
      this.peekTimer = setTimeout(this.dropPeek, dur("--duration-peek"));
    }
  };

  /** Every peek goes as a thread or a composer opens: one left up would stand over what it opens on. */
  dropPeek = () => {
    clearTimeout(this.peekTimer);
    if (this.peekAt) {
      this.peekWent = performance.now();
    }
    this.peekAt = null;
    this.onPeek = false;
  };

  /** No peek while a thread or a composer stands: the card is what the person reads then. */
  readonly peekPin = $derived.by(() =>
    this.peekAt && !this.#deps.openPin() && !this.#deps.pinComposer.composing
      ? (this.#deps.paneDoc.pins.find((pin) => pin.id === this.peekAt?.id) ??
        null)
      : null
  );
  constructor(deps: PinPeekDeps) {
    this.#deps = deps;
  }

  heardPeek(message: Record<string, unknown>) {
    clearTimeout(this.peekTimer);
    const id = previewPinId(message.id);
    const mark = previewBox(message.mark);
    // None under a finger, and none while a thread or a composer stands.
    if (
      this.#deps.paneLayout.coarse.current ||
      this.#deps.openPin() ||
      this.#deps.pinComposer.composing
    ) {
      this.dropPeek();
      return;
    }
    if (!(id && mark)) {
      // Off its pill: onto the peek, which stays, or away.
      if (this.peekAt && !this.onPeek) {
        this.peekTimer = setTimeout(this.dropPeek, dur("--duration-peek"));
      }
      return;
    }
    const wait = dur("--duration-peek");
    if (this.peekAt || performance.now() - this.peekWent < wait) {
      this.peekAt = { id, mark };
      return;
    }
    this.peekTimer = setTimeout(() => {
      this.peekAt = { id, mark };
    }, wait);
  }
}
