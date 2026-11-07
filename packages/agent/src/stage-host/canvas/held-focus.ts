/**
 * A canvas page in a frame never takes the window's focus on its own.
 *
 * A script's `focus()` in a document whose frame does not have the
 * window's focus moves the window's focus into that frame (Chromium's
 * focusing steps; the HTML standard's "focus update steps" run across
 * navigables): the host's field blurs, and every key the person types next
 * lands in the frame. The page focuses its own elements in the background:
 * the rig mounts each story and plays each move off screen (runtime.ts
 * `readSection`, `playAll`), a reach runs its story's play on the drawing
 * (stage.ts `act`), each through `userEventIn`'s click and type (core
 * stage-play.ts), and a component focuses its field as it mounts. A
 * person typing in the design graph's room lost the keyboard to the stage
 * mid-word.
 *
 * Taking the focus back from the host is no answer: the frame's document
 * then loses its focused element (its `activeElement` goes back to the
 * body, its field blurs), so a play that focused a field would no longer
 * see it focused. So a focus the page asks for while its frame does not
 * have the window's focus, outside the person's own press or key in it,
 * is held in the page: the element is its document's `activeElement`, it
 * hears `blur`, `focusout`, `focus` and `focusin` as a real focus moves,
 * and it is drawn focused by the classes the pseudo-state rewrite gives
 * `:focus`, `:focus-visible` and `:focus-within` (pseudo.ts), as a play's
 * hover is drawn by `.cawco-hover`. The page as a person's press or key
 * focuses it (the frame then has the window's focus) is the browser's own,
 * and a held focus lets go there.
 *
 * What it does not hold: a focus the browser moves without `focus()` (a
 * label's click, a modal `<dialog>`'s `showModal()`), and a held field
 * takes no keys, which only the window's focus brings.
 */
import { stateClass } from "./pseudo";

/** What a real `focus()` reaches: the elements that take the focus. */
const FOCUSABLE =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';

/** A field that draws its focus ring however it was focused (`:focus-visible` on a text field). */
const TEXT_FIELD =
  'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"])';

/** The person's own presses and keys: a focus during one is theirs, and the browser's to move. */
const PERSON_ACTS = new Set([
  "pointerdown",
  "pointerup",
  "mousedown",
  "mouseup",
  "click",
  "auxclick",
  "dblclick",
  "contextmenu",
  "touchstart",
  "touchend",
  "keydown",
  "keypress",
  "keyup",
]);

type Focusable = HTMLElement | SVGElement;

/** Holds every focus the page asks for while its frame lacks the window's focus. Once per page, in a frame alone. */
export function holdFocusInFrame(): void {
  if (window.parent === window) {
    return;
  }
  const html = HTMLElement.prototype;
  const svg = SVGElement.prototype;
  const nativeFocus = { html: html.focus, svg: svg.focus };
  const nativeBlur = { html: html.blur, svg: svg.blur };
  const active = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "activeElement"
  )?.get;
  if (!active) {
    return;
  }
  /** The element the page focused while the frame lacked the window's focus; null for none. */
  let held: Focusable | null = null;
  /** The elements carrying a focus class of the held focus. */
  const marked = new Map<Element, string[]>();
  /** The person's last input here: a press draws no ring on a control focused after it. */
  let lastInput: "key" | "pointer" | null = null;
  addEventListener(
    "pointerdown",
    (event) => {
      if (event.isTrusted) {
        lastInput = "pointer";
      }
    },
    true
  );
  addEventListener(
    "keydown",
    (event) => {
      if (event.isTrusted) {
        lastInput = "key";
      }
    },
    true
  );

  /** Whether a focus asked for now moves the window's focus: the frame has it, or the person is pressing or typing here. */
  const real = (): boolean => {
    if (document.hasFocus()) {
      return true;
    }
    const now = window.event;
    return !!now?.isTrusted && PERSON_ACTS.has(now.type);
  };

  const unmark = () => {
    for (const [el, classes] of marked) {
      el.classList.remove(...classes);
    }
    marked.clear();
  };
  const mark = (el: Element, ...classes: string[]) => {
    el.classList.add(...classes);
    marked.set(el, [...(marked.get(el) ?? []), ...classes]);
  };
  const markHeld = (el: Focusable) => {
    const visible = el.matches(TEXT_FIELD) || lastInput !== "pointer";
    mark(
      el,
      stateClass("focus"),
      ...(visible ? [stateClass("focus-visible")] : [])
    );
    let at: Element | null = el;
    while (at) {
      mark(at, stateClass("focus-within"));
      const root = at.getRootNode();
      at = at.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
  };
  const tell = (
    el: Element,
    type: "blur" | "focus" | "focusin" | "focusout",
    related: Element | null
  ) =>
    el.dispatchEvent(
      new FocusEvent(type, {
        bubbles: type === "focusin" || type === "focusout",
        composed: true,
        relatedTarget: related,
      })
    );

  /** The held focus moved to `next` (null: none), its events said as a real move says them. */
  const move = (next: Focusable | null) => {
    const was = held?.isConnected ? held : null;
    held = next;
    unmark();
    if (was) {
      tell(was, "blur", next);
      tell(was, "focusout", next);
    }
    if (next && held === next) {
      markHeld(next);
      tell(next, "focus", was);
      tell(next, "focusin", was);
    }
  };

  const takes = (el: Focusable) =>
    el.isConnected &&
    el.matches(FOCUSABLE) &&
    !el.matches(":disabled") &&
    !el.closest("[inert]") &&
    el.checkVisibility();

  function focus(this: Focusable, options?: FocusOptions) {
    const own =
      this instanceof HTMLElement ? nativeFocus.html : nativeFocus.svg;
    if (real()) {
      if (held) {
        move(null);
      }
      own.call(this, options);
      return;
    }
    if (held !== this && takes(this)) {
      move(this);
    }
  }
  function blur(this: Focusable) {
    if (this === held) {
      move(null);
      return;
    }
    (this instanceof HTMLElement ? nativeBlur.html : nativeBlur.svg).call(this);
  }
  html.focus = focus;
  svg.focus = focus;
  html.blur = blur;
  svg.blur = blur;
  Object.defineProperty(Document.prototype, "activeElement", {
    configurable: true,
    enumerable: true,
    get(this: Document) {
      return held?.isConnected && held.ownerDocument === this
        ? held
        : active.call(this);
    },
  });
  // The window's focus came to the frame (his press, Tab into it): the browser's focus is the page's now.
  addEventListener(
    "focus",
    (event) => {
      if (event.target === window && held) {
        move(null);
      }
    },
    true
  );
}
