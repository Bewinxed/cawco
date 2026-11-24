/**
 * Nothing the canvas page does in the background takes the person's focus.
 *
 * A script's `focus()` moves the document's focus, and in a document whose
 * frame does not have the window's focus it moves the window's focus into
 * that frame too (Chromium's focusing steps; the HTML standard's "focus
 * update steps" run across navigables): the field the person is in blurs,
 * and every key they type next lands elsewhere. The page focuses its own
 * elements in the background: a reach runs its story's play on the drawing
 * (stage.ts `act`) through `userEventIn`'s click and type (core
 * stage-play.ts), and a component focuses its field as it mounts. A person
 * typing in the design graph's room lost the keyboard to the stage
 * mid-word.
 *
 * Taking the focus back afterwards is no answer: the element the story
 * focused then reads as unfocused, so a play that focused a field would no
 * longer see it focused. So, in a frame, a focus asked for while the frame
 * lacks the window's focus, outside the person's own press or key in it,
 * is held in the page instead: the element is its document's
 * `activeElement`, it hears `blur`, `focusout`, `focus` and `focusin` as a
 * real focus moves, and it is drawn focused by the classes the
 * pseudo-state rewrite gives `:focus`, `:focus-visible` and
 * `:focus-within` (pseudo.ts), as a play's hover is drawn by
 * `.cawco-hover`. The page as the person's press or key focuses it (the
 * frame then has the window's focus) is the browser's own, and that focus
 * lets go. A held field takes no keys, which only the real focus brings.
 *
 * The page reads nothing for the report in the background: that is the
 * stage's own page's, in the daemon's headless browser (rig.ts).
 *
 * On every page, framed or not, a focus asked for while the stage mounts
 * or plays a story is taken with `preventScroll` (held-scroll.ts
 * `pageStill`): it never scrolls the page under the person.
 */
import { pageStill, personActing } from "./held-scroll";
import { stateClass } from "./pseudo";

/** What a real `focus()` reaches: the elements that take the focus. */
const FOCUSABLE =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';

/** A field that draws its focus ring however it was focused (`:focus-visible` on a text field). */
const TEXT_FIELD =
  'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="button"], [type="submit"], [type="reset"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="image"])';

type Focusable = HTMLElement | SVGElement;

/** The person's own focus: the page's held one, else the browser's. Set by {@link holdFocus}. */
let pageFocus: () => Element | null = () => document.activeElement;

/** The focus the person's page has: what the stage's own code puts back after a play on the drawing (stage.ts `giveBack`). */
export const focusOfPage = (): Element | null => pageFocus();

/** A focus held in the page: its element, its classes and its events. */
interface Hold {
  /** The held focus moved to `next` (null: none), its events said as a real move says them. */
  move: (next: Focusable | null) => void;
  /** The element held now, while it stands; null for none. */
  now: () => Focusable | null;
}

/**
 * Every focus the page asks for: held while its frame lacks the window's
 * focus (in a frame alone), and taken with `preventScroll` while the stage
 * mounts or plays a story. Once per page.
 */
export function holdFocus(): void {
  const framed = window.parent !== window;
  const html = HTMLElement.prototype;
  const svg = SVGElement.prototype;
  const nativeFocus = { html: html.focus, svg: svg.focus };
  const nativeBlur = { html: html.blur, svg: svg.blur };
  const realFocus = (el: Focusable, options?: FocusOptions) =>
    (el instanceof HTMLElement ? nativeFocus.html : nativeFocus.svg).call(
      el,
      options
    );
  const realBlur = (el: Focusable) =>
    (el instanceof HTMLElement ? nativeBlur.html : nativeBlur.svg).call(el);
  const active = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "activeElement"
  )?.get;
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

  /** A focus held in the page, with its own focus classes. */
  const hold = (): Hold => {
    let held: Focusable | null = null;
    const marked = new Map<Element, string[]>();
    const mark = (el: Element, ...classes: string[]) => {
      el.classList.add(...classes);
      marked.set(el, [...(marked.get(el) ?? []), ...classes]);
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
    const now = () => (held?.isConnected ? held : null);
    /** `el` drawn focused: its own classes, and `:focus-within` on it and each element round it. */
    const markHeld = (el: Focusable) => {
      const visible = el.matches(TEXT_FIELD) || lastInput !== "pointer";
      mark(
        el,
        stateClass("focus"),
        ...(visible ? [stateClass("focus-visible")] : [])
      );
      for (let at: Element | null = el; at;) {
        mark(at, stateClass("focus-within"));
        const root = at.getRootNode();
        at =
          at.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      }
    };
    const move = (next: Focusable | null) => {
      const was = now();
      held = next;
      for (const [el, classes] of marked) {
        el.classList.remove(...classes);
      }
      marked.clear();
      if (was) {
        tell(was, "blur", next);
        tell(was, "focusout", next);
      }
      // A handler of the blur moved it on: that move has said its own.
      if (next && held === next) {
        markHeld(next);
        tell(next, "focus", was);
        tell(next, "focusin", was);
      }
    };
    return { move, now };
  };
  const pageHold = hold();
  pageFocus = () => pageHold.now() ?? active?.call(document) ?? null;

  const takes = (el: Focusable) =>
    el.isConnected &&
    el.matches(FOCUSABLE) &&
    !el.matches(":disabled") &&
    !el.closest("[inert]") &&
    el.checkVisibility();

  /** Whether the page's focus is held: in a frame that lacks the window's focus, outside the person's own press or key. */
  const holdsPage = () => framed && !document.hasFocus() && !personActing();

  function focus(this: Focusable, options?: FocusOptions) {
    if (holdsPage()) {
      if (pageHold.now() !== this && takes(this)) {
        pageHold.move(this);
      }
      return;
    }
    if (pageHold.now()) {
      pageHold.move(null);
    }
    realFocus(
      this,
      pageStill() ? { ...options, preventScroll: true } : options
    );
  }
  html.focus = focus;
  svg.focus = focus;
  function blur(this: Focusable) {
    if (pageHold.now() === this) {
      pageHold.move(null);
      return;
    }
    realBlur(this);
  }
  html.blur = blur;
  svg.blur = blur;
  // Code reading `activeElement` sees the page's held focus while one is held, else the browser's.
  if (active) {
    Object.defineProperty(Document.prototype, "activeElement", {
      configurable: true,
      enumerable: true,
      get(this: Document) {
        const held = pageHold.now();
        return held && held.ownerDocument === this ? held : active.call(this);
      },
    });
  }
  // The window's focus came to the frame (their press, Tab into it): the browser's focus is the page's now.
  addEventListener(
    "focus",
    (event) => {
      if (event.target === window && pageHold.now()) {
        pageHold.move(null);
      }
    },
    true
  );
}
