/**
 * The pane's keys: V, C and D, ⇧C, J and K, Enter, `/` and Esc.
 */

import type { PaneKey } from "@cawco/core/shell-shortcuts";
import { landKey } from "#lib/platform/motion/keyed.svelte.js";
import type CommentRail from "./CommentRail.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneLayout } from "./pane-layout.svelte";
import type { PaneMode } from "./pane-mode.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PinComposer } from "./pin-composer.svelte";
import type { PinThread } from "./pin-thread.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";
import { previewKey } from "./wire";

/** What holds the focus as a control: a key it takes is its own. */
const PANE_CONTROL =
  'button, a[href], summary, [role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], [role="checkbox"], [role="radio"], [role="switch"]';
/** A key's mode: V Interact, C Comment, D Draw (Figma's V and C). */
const MODE_KEYS = { v: "interact", c: "comment", d: "draw" } as const;
export interface PaneKeysDeps {
  readonly paneDoc: PaneDoc;
  readonly paneLayout: PaneLayout;
  readonly paneMode: PaneMode;
  readonly paneSubject: PaneSubject;
  readonly pinComposer: PinComposer;
  readonly pinThread: PinThread;
  readonly previewFrame: PreviewFrame;
  readonly rail: () => ReturnType<typeof CommentRail> | undefined;
}
export class PaneKeys {
  readonly #deps: PaneKeysDeps;
  constructor(deps: PaneKeysDeps) {
    this.#deps = deps;
  }

  /**
   * The pane's keys: V, C and D its modes, ⇧C every pin hidden or shown, J
   * and K a step through the pins, Enter opens one, `/` the rail's search;
   * Esc unwinds one at a time: the composer, then the thread, then Comment
   * or Draw back to Interact (`parentEscape`).
   */
  pressKey(name: PaneKey) {
    if (
      (name === "v" || name === "c" || name === "d") &&
      !this.#deps.paneSubject.isCanvas
    ) {
      this.#deps.paneMode.setMode(MODE_KEYS[name]);
    } else if (name === "C" && !this.#deps.paneSubject.isCanvas) {
      this.#deps.paneMode.showPins(!this.#deps.paneMode.pinsShown);
    } else if (name === "j") {
      this.#deps.pinThread.step(1);
    } else if (name === "k") {
      this.#deps.pinThread.step(-1);
    } else if (
      name === "Enter" &&
      this.#deps.pinThread.focusedPin &&
      this.#deps.paneDoc.pins.some(
        (pin) => pin.id === this.#deps.pinThread.focusedPin
      )
    ) {
      // Only a pin of this page: one J and K stood on elsewhere opens nothing.
      this.#deps.pinThread.openCard(this.#deps.pinThread.focusedPin, "key");
    } else if (name === "/" && this.#deps.paneMode.listOpen) {
      this.#deps.rail()?.focusSearch();
    } else if (name === "Escape") {
      if (this.#deps.pinComposer.composing) {
        this.#deps.pinComposer.cancelComposer();
      } else if (this.#deps.pinThread.openPin) {
        this.#deps.pinThread.closeCard();
      } else {
        this.#deps.paneMode.setMode("interact");
      }
    }
  }

  /**
   * A key pressed inside the pane, outside a field: the page's are heard as
   * `cawco:key`. Enter on a focused control is the control's own (a rail's
   * row opens its own thread, a button presses): the pane's Enter, the pin
   * J and K stand on, is for where no control has the focus.
   */
  paneKey(event: KeyboardEvent) {
    // A browser has no modes, pins or rail: its keys are the browser's own.
    if (this.#deps.paneSubject.isBrowser) {
      return;
    }
    const { target } = event;
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      // The pane's own: its rail stands in its card.
      !(
        target instanceof Node &&
        this.#deps.paneLayout.section?.contains(target)
      ) ||
      (target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) ||
      (event.key === "Enter" &&
        target instanceof Element &&
        !!target.closest(PANE_CONTROL))
    ) {
      return;
    }
    const letter = event.key.length === 1 ? event.key.toLowerCase() : null;
    const name = previewKey(
      letter === "c" && event.shiftKey ? "C" : (letter ?? event.key)
    );
    if (name && name !== "Escape") {
      event.preventDefault();
      this.pressKey(name);
    }
  }

  /**
   * Esc pressed in the page and left to the host (overlay page.ts
   * `escapeToHost`): the focus in the frame keeps every key from this
   * document, so it is pressed here at the frame, where this document's
   * own Esc lands while the frame has the focus, and every Esc rule of the
   * host answers it in its own order: the topmost open layer first
   * (bits-ui's escape layer, on the document: a design graph's popover over
   * its stage, the preview's sheet), then the pane's unwinding
   * (`parentEscape`), the split's expansion (Split `escapeExpanded`) and
   * Full size (Shell).
   */
  escapeFromPage() {
    this.#deps.previewFrame.iframe?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        bubbles: true,
        cancelable: true,
        composed: true,
      })
    );
  }

  parentEscape(event: KeyboardEvent) {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      (event.target instanceof Element && event.target.closest("dialog[open]"))
    ) {
      return;
    }
    if (
      this.#deps.pinComposer.composing ||
      this.#deps.pinThread.openPin ||
      this.#deps.paneMode.mode !== "interact"
    ) {
      this.pressKey("Escape");
      event.preventDefault();
    }
  }

  /** A key the page's window heard (`cawco:key`). */
  heardKey(message: Record<string, unknown>) {
    const name = previewKey(message.key);
    if (name) {
      // A key the page's window heard: what it starts here lands at once
      // (motion/keyed), as for this window's own keys.
      landKey();
      if (name === "Escape") {
        this.escapeFromPage();
      } else {
        this.pressKey(name);
      }
    }
  }
}
