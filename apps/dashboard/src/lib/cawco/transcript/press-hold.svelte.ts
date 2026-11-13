/**
 * A held press or a swipe up on a touch screen. With the keyboard down the
 * composer is a control you can hold: a finger resting on it
 * --dur-press-hold brings the wheel up under it, and so does one that
 * swipes up off it; dragging while still down rolls it. A swipe's own
 * rise is the opening's: the roll starts where the finger turns back
 * down, so a swipe lifted while still rising leaves the newest message
 * on the line. Lifting leaves it up: a tap on a row takes it, a tap
 * outside puts it away. Moving any other way first is a scroll or a
 * selection; while the field is being typed in (keyboard up) every touch
 * is the field's: scrolling it, selecting, pasting. The pill takes no pan
 * while the keyboard is down (`touch-action`), so a swipe on it never
 * scrolls the page, and a swipe anywhere else is the page's.
 */

import { felt } from "#lib/platform/feel.svelte.js";
import { dur } from "#lib/platform/motion/curves.svelte.js";
import type { ComposerDraft } from "./composer-draft.svelte";
import type { ComposerFleet } from "./composer-fleet";

const SLOP = 8;

interface Press {
  flick: number;
  from: number;
  id: number;
  lastAt: number;
  lastY: number;
  live: boolean;
  /** A swipe that brought the wheel up and is still rising. */
  rising: boolean;
  timer: ReturnType<typeof setTimeout>;
  x: number;
  y: number;
}

export interface PressHoldParts {
  /** An ask holds the composer. */
  askOpen: () => boolean;
  /** The canvas stands over the field. */
  canvasUp: () => boolean;
  draft: () => ComposerDraft;
  field: () => HTMLDivElement | null;
  /** The canvas grows out of the pill: a pen's swipe up. */
  openCanvas: () => void;
  /** The wheel brings itself up under the finger. */
  openRecall: (keys: boolean) => void;
  /** The wheel, while it is up: whether keys reach it from the field. */
  recall: () => { keys: boolean } | null;
  recallOf: () => string | undefined;
  /** The wheel the held press rolls. */
  wheel: () => ReturnType<ComposerFleet["RecallWheel"]> | undefined;
}

export class PressHold {
  hold = $state.raw<Press | null>(null);
  readonly #parts: PressHoldParts;
  #swallowClick: boolean;
  /**
   * A pen on the pill (The pen's swipe): a swipe up with it, by the wheel's
   * own test (past the slop, more up than across), grows the pill into the
   * canvas. A pen never holds the wheel up; that press is a finger's.
   */
  #pen: { id: number; x: number; y: number } | null = null;

  constructor(parts: PressHoldParts) {
    this.#parts = parts;
    this.#swallowClick = false;

    $effect(() => {
      const moved = (event: PointerEvent) => {
        if (this.#penMoved(event)) {
          return;
        }
        const press = this.hold;
        if (!press || event.pointerId !== press.id) {
          return;
        }
        const now = performance.now();
        if (press.live) {
          this.#rolling(press, event, now);
        } else {
          this.#undecided(press, event, now);
        }
      };
      const lifted = (event: PointerEvent) => {
        if (this.#pen?.id === event.pointerId) {
          this.#pen = null;
        }
        const press = this.hold;
        if (!press || event.pointerId !== press.id) {
          return;
        }
        clearTimeout(press.timer);
        this.hold = null;
        if (!press.live) {
          return;
        }
        // The press is spent: no click on what it lifted from, no focus in
        // the field.
        this.#swallowClick = true;
        setTimeout(() => {
          this.#swallowClick = false;
        }, dur("--dur-press-hold"));
        parts.wheel()?.release(press.flick);
      };
      document.addEventListener("pointermove", moved, { passive: false });
      document.addEventListener("pointerup", lifted);
      document.addEventListener("pointercancel", lifted);
      return () => {
        document.removeEventListener("pointermove", moved);
        document.removeEventListener("pointerup", lifted);
        document.removeEventListener("pointercancel", lifted);
      };
    });

    /*
     * While a press is held on the composer, and while the wheel it brought
     * up is up, nothing on the page selects: iOS would otherwise turn the hold
     * into a text selection and drag it across the page. Only for a hold: the
     * switch restyles the whole page, which a key or a click has no need of.
     */
    $effect(() => {
      const recall = parts.recall();
      if (!(this.hold || (recall && !recall.keys))) {
        return;
      }
      const root = document.documentElement;
      root.dataset.composerHolding = "";
      getSelection()?.removeAllRanges();
      const refuse = (event: Event) => event.preventDefault();
      document.addEventListener("selectstart", refuse);
      return () => {
        delete root.dataset.composerHolding;
        document.removeEventListener("selectstart", refuse);
      };
    });
  }

  /** A press that is not yet a hold moved: a swipe up brings the wheel up under the finger, any other way first is a scroll or a selection. */
  #undecided(press: Press, event: PointerEvent, now: number): void {
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (dy < -SLOP && -dy > Math.abs(dx)) {
      // A swipe up: the wheel comes up under the finger.
      clearTimeout(press.timer);
      press.live = true;
      press.rising = true;
      press.from = event.clientY;
      press.lastY = event.clientY;
      press.lastAt = now;
      felt("hold");
      this.#parts.openRecall(false);
    } else if (Math.hypot(dx, dy) > SLOP) {
      clearTimeout(press.timer);
      this.hold = null;
    } else {
      press.lastY = event.clientY;
    }
  }

  /** A hold moved: it rolls the wheel. */
  #rolling(press: Press, event: PointerEvent, now: number): void {
    event.preventDefault();
    if (press.rising) {
      if (event.clientY <= press.from) {
        press.from = event.clientY;
        press.lastY = event.clientY;
        press.lastAt = now;
        return;
      }
      press.rising = false;
    }
    press.flick =
      (event.clientY - press.lastY) / Math.max(1, now - press.lastAt);
    press.lastY = event.clientY;
    press.lastAt = now;
    this.#parts.wheel()?.follow(event.clientY - press.from);
  }

  /** The pen on the pill moved: true when the move was the pen's. */
  #penMoved(event: PointerEvent): boolean {
    const pen = this.#pen;
    if (!pen || event.pointerId !== pen.id) {
      return false;
    }
    const dx = event.clientX - pen.x;
    const dy = event.clientY - pen.y;
    if (dy < -SLOP && -dy > Math.abs(dx)) {
      this.#pen = null;
      event.preventDefault();
      this.#parts.openCanvas();
    } else if (Math.hypot(dx, dy) > SLOP) {
      this.#pen = null;
    }
    return true;
  }

  onholddown = (event: PointerEvent): void => {
    const parts = this.#parts;
    const draft = parts.draft();
    const { target } = event;
    if (event.pointerType === "pen") {
      this.#pen =
        parts.recallOf() &&
        !(
          parts.recall() ||
          draft.lifted ||
          parts.askOpen() ||
          parts.canvasUp()
        ) &&
        !(target instanceof Element && target.closest("button, a, input"))
          ? { id: event.pointerId, x: event.clientX, y: event.clientY }
          : null;
      return;
    }
    if (
      event.pointerType !== "touch" ||
      !parts.recallOf() ||
      parts.recall() ||
      draft.lifted ||
      parts.askOpen() ||
      document.activeElement === parts.field()
    ) {
      return;
    }
    // Its own controls answer a press themselves.
    if (target instanceof Element && target.closest("button, a, input")) {
      return;
    }
    const press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      from: event.clientY,
      live: false,
      rising: false,
      lastY: event.clientY,
      lastAt: 0,
      flick: 0,
      timer: setTimeout(() => {
        if (this.hold?.id !== press.id) {
          return;
        }
        this.hold.live = true;
        this.hold.from = this.hold.lastY;
        this.hold.lastAt = performance.now();
        felt("hold");
        parts.openRecall(false);
      }, dur("--dur-press-hold")),
    };
    this.hold = press;
  };

  /** iOS still starts its own press gestures under a live hold: the callout, the focus on lift. */
  onholdnative = (event: Event): void => {
    if (this.hold?.live || this.#swallowClick) {
      event.preventDefault();
    }
  };

  onholdclick = (event: MouseEvent): void => {
    if (this.#swallowClick) {
      event.stopPropagation();
      event.preventDefault();
      this.#swallowClick = false;
    }
  };
}
