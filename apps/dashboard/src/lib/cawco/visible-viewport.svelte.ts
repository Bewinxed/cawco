/**
 * The part of the page the reader can see, and the field they are typing in
 * kept inside it. A software keyboard takes the bottom of the screen, and
 * the browsers a phone runs disagree about what that does to the page:
 * Safari shrinks only the visual viewport and pans it to the focused field;
 * Brave and Firefox for iOS shrink the layout viewport too
 * (brave/brave-browser#54999), while WebKit still reports a pan in
 * `visualViewport.offsetTop` that no longer fits inside it (WebKit bug
 * 311821). Each of their events moved a sheet and scrolled a field on its
 * own, so one keyboard opening moved the layout three or four times, and a
 * page whose scroller only became scrollable after the layout viewport
 * shrank left the field under the keyboard.
 *
 * So the page is measured in one place, once per frame. Every event that can
 * move the visible area (the visual viewport's resize and scroll, the
 * window's resize, focus arriving in a field, a scroller around the focused
 * field changing size) asks for the next frame; that frame reads the layout
 * viewport and the visual viewport together, keeps the visual viewport's top
 * inside the layout viewport, and publishes `visible`: where the visible
 * area starts and how tall it is. An open bottom sheet carries the two on
 * itself (ui/drawer/drawer-content), and app.css rests it on the keyboard
 * from them. On the root, every change restyled the whole page: 18ms a write
 * on a small page, 7ms on the sheet.
 *
 * The app's shell is as tall as the visible area reaches (`floor`), so what
 * stands on its foot (the composer, a page's footer) stands on a keyboard in
 * every browser: Brave's resized web view already put it there, and Safari,
 * which keeps the layout viewport whole, left the composer under the
 * keyboard. Then, once the shell and the sheet are laid out at that size,
 * the focused field is scrolled into the visible area inside the boxes that
 * scroll it. The window itself is never scrolled here.
 *
 * Nor does WebKit scroll it. Focus that a tap gives a field lets WebKit pan
 * the window to it as the keyboard comes up, and in Brave that pan landed on
 * a layout the keyboard had already shrunk: the page jumped 290px and
 * snapped back a frame later. So a tap on a field focuses it first, with
 * `preventScroll`; the tap itself goes on, so iOS still places the caret,
 * the loupe and Paste where the finger was. Only a tap: a touch that
 * moved or scrolled focuses nothing, as iOS does.
 *
 * `preventScroll` alone still left a pan in 2 of 15 composer taps, and on
 * every first keyboard a freshly launched browser raised: WebKit decides
 * before focus whether the field is where the keyboard will cover it
 * (WebKit bug 311821), and a script scrolling the window back the same frame
 * changed nothing on screen. So the keyboard is foreseen. Just before that
 * focus the visible area is set to where the keyboard will leave it, from
 * the keyboard's last height in this orientation, and the shell, the sheets
 * and the field take their keyboard-up places, so WebKit finds nothing to
 * reveal. "This fix pre-lifts the input bar before focus … By the time
 * Safari's pre-focus visibility check runs, the textarea is already where it
 * would be after the keyboard opens, so Safari has no reason to scroll the
 * document." (github.com/Crscristi28/ios-pwa-keyboard-fix) "On field
 * `mousedown`, apply last-known keyboard height to the composer before focus
 * (defeats Safari's pre-focus visibility scroll)" (github.com/cameronapak/
 * polyfill-virtual-keyboard-api, docs/ios-composer.md). It is foreseen at
 * the tap's touchend, which iOS fires before the tap's mousedown and where a
 * touch that travelled is already known not to be a tap, so a scroll never
 * lifts anything. When the field moves from under the finger the tap goes
 * on, and its mousedown, mouseup and click are swallowed (the sources'
 * `preventDefault` on mousedown): they would land on what stands there now
 * and take the focus back. The caret then goes after the text instead of
 * under the finger. A
 * field already focused, its keyboard put away, is not foreseen: only the
 * tap itself brings that keyboard back. The height is the one a keyboard
 * opens at, read from the visible area once it has stopped
 * drifting for 80ms ("the hook waits 80 ms for the value to stay constant
 * before committing", ios-pwa-keyboard-fix), kept in localStorage per
 * orientation and per keyboard (keyboardKey), so the first keyboard after a
 * launch is foreseen too (the
 * polyfill's stated limit: "first focus may still jump once until
 * `geometrychange` fills the cache"). The foreseen area stands until the
 * real one reaches it; a keyboard that settles elsewhere moves it once, and
 * one that never comes (a hardware keyboard) gives it back.
 */
import { flushSync } from "svelte";

/**
 * The visible area, in CSS pixels from the layout viewport's top; a height
 * of 0 until it is measured.
 */
export const visible = $state({ top: 0, height: 0 });

/**
 * Where the app's shell ends, in CSS pixels from the layout viewport's top:
 * the visible area's bottom. 0 leaves the shell its own height: before the
 * first measure, and while a pinch zoom, not a keyboard, shrinks the visual
 * viewport.
 */
export const floor = $state({ bottom: 0 });

/** Room kept between a revealed field and the visible area's edges. */
const MARGIN = 12;
/** How far a touch may travel and still be a tap, in CSS pixels. */
const TAP_SLOP = 10;
/** How long the visible area holds still before its height is the keyboard's. */
const STABLE_MS = 80;
/** What a tap sends after its touchend. */
const SWALLOWED = ["mousedown", "mouseup", "click"] as const;
/** How long a moved field's tap may take to send them. */
const SWALLOW_MS = 1000;
/** The least of the screen a keyboard covers; less is a toolbar. */
const COVERS = 100;
/** How long a foreseen keyboard is waited for before the area is given back. */
const AWAIT_MS = 2000;
/** The keyboards' opening heights, kept across launches (keyboardKey). */
const KEYBOARD_KEY = "cawco:keyboard:";
/** What a tap can land in that edits text. */
const EDITABLE = "input, textarea, [contenteditable]";
/** Inputs that raise no keyboard. */
const KEYLESS =
  /^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/;
const SCROLLS = /(auto|scroll)/;
/** Inputs whose caret a script may place. */
const SELECTS = /^(password|search|tel|text|url)$/;

const isField = (node: Element | null): node is HTMLElement =>
  node instanceof HTMLElement &&
  (node.isContentEditable ||
    node instanceof HTMLTextAreaElement ||
    (node instanceof HTMLInputElement && !KEYLESS.test(node.type)));

/** A field a tap brings the software keyboard up for. */
const raisesKeyboard = (node: HTMLElement): boolean =>
  node.inputMode !== "none" &&
  !(
    (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) &&
    (node.readOnly || node.disabled)
  );

const orientation = (): string =>
  screen.orientation.type.startsWith("landscape") ? "landscape" : "portrait";

/**
 * Where the height of the keyboard a field raises is kept: per orientation
 * and per keyboard, the field's kind and whether it suggests words above the
 * keys. A search field's keyboard stood 27px shorter than the composer's, and
 * one height for both was foreseen wrong for one of them every time.
 */
const keyboardKey = (field: HTMLElement): string => {
  const kind = field instanceof HTMLInputElement ? field.type : field.localName;
  const suggests =
    field.spellcheck && field.getAttribute("autocorrect") !== "off";
  return `${KEYBOARD_KEY}${orientation()}:${kind}:${field.inputMode}:${suggests ? "suggests" : "plain"}`;
};

/** The boxes that scroll `node`, innermost first, the document's own left out. */
function scrollers(node: HTMLElement): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (
    let parent = node.parentElement;
    parent && parent !== document.body && parent !== document.documentElement;
    parent = parent.parentElement
  ) {
    if (SCROLLS.test(getComputedStyle(parent).overflowY)) {
      found.push(parent);
    }
  }
  return found;
}

/**
 * Attachment for a footer stuck to the bottom of its scroller (`position:
 * sticky; bottom: 0`: a step's Back and Continue, an editor's Save): it
 * stays above a keyboard and keeps the field being typed in clear of itself.
 * Safari leaves the scroller's bottom under the keyboard, so the footer's
 * sticky offset becomes as much of the scroller as the keyboard covers;
 * Brave shrinks the layout, and there the offset stays 0. Only the scroller
 * is measured: the footer's own box, read the frame the layout changed,
 * still stood where it was stuck before, and a lift taken from it threw the
 * footer to the top.
 *
 * The fields scroll in `covers` (by default the footer's own scroller, which
 * it stands in), and that box's scroll-padding-bottom is how much of it the
 * footer stands over, so the browser's own focus scrolling, and `reveal`
 * here, stop above the footer. A footer below its fields' box (an editor's
 * commit row) stands over none of it until a keyboard lifts it.
 */
export function aboveKeyboard(covers?: () => HTMLElement | null | undefined) {
  return (node: HTMLElement): (() => void) => {
    const [box] = scrollers(node);
    // Where its CSS does not stick it (a wide screen), it is in the flow.
    if (
      !box ||
      visible.height === 0 ||
      getComputedStyle(node).position !== "sticky"
    ) {
      return () => undefined;
    }
    const fields = covers?.() ?? box;
    const inside = fields.contains(node);
    const bottom = visible.top + visible.height;
    const place = () => {
      const area = box.getBoundingClientRect();
      // Brave shrinks the layout viewport before the boxes in it are laid
      // out again: a scroller still reaching past it has not taken the
      // keyboard yet, and a lift taken from it threw the footer to the top.
      // The observer below places it once it has its new size.
      if (area.bottom > document.documentElement.clientHeight + 1) {
        return;
      }
      const lift = Math.max(0, Math.round(area.bottom - bottom));
      node.style.bottom = lift > 0 ? `${lift}px` : "";
      const over = standsOver(lift);
      fields.style.scrollPaddingBottom = over > 0 ? `${over}px` : "";
    };
    /** How much of the fields' box the footer stands over at this lift. */
    const standsOver = (lift: number): number => {
      if (inside) {
        return node.offsetHeight + lift;
      }
      if (lift === 0) {
        return 0;
      }
      // Lifted, its top is the visible area's bottom less its height.
      return Math.max(
        0,
        Math.round(
          fields.getBoundingClientRect().bottom - (bottom - node.offsetHeight)
        )
      );
    };
    // Placed a frame later, and again whenever the scroller takes a new size.
    // Safari's layout never moves, and there the lift comes a frame into the
    // keyboard's rise.
    const resized = new ResizeObserver(place);
    resized.observe(box);
    const frame = requestAnimationFrame(place);
    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      node.style.bottom = "";
      fields.style.scrollPaddingBottom = "";
    };
  };
}

/** Keeps `visible` current and the focused field in it. Returns the cleanup. */
export function trackVisibleViewport(): () => void {
  const viewport = window.visualViewport;
  if (!viewport) {
    return () => undefined;
  }
  const root = document.documentElement;
  let frame = 0;
  /** The focused field's scrollers, watched while it has focus. */
  const resized = new ResizeObserver(() => request());
  let watched: HTMLElement | null = null;

  /**
   * The visible height with no field focused (the keyboard down), and the
   * orientation it was measured in.
   */
  let rest = { height: 0, orientation: "" };
  /**
   * A keyboard foreseen at a tap: the visible height it will leave, and the
   * real height last measured while it is awaited, since when.
   */
  let ahead: {
    height: number;
    until: number;
    seen: number;
    since: number;
  } | null = null;
  /** The keyboard-up height waiting to hold still, and its timer. */
  let settling = { height: 0, timer: 0 };
  /** Whether this keyboard's opening height is kept already. */
  let opened = false;
  /** The tallest the visible area has stood in this orientation. */
  let tallest = { height: 0, orientation: "" };

  /** The area takes its new place now, so the field is revealed in it. */
  const publish = (top: number, height: number) => {
    const turned = orientation();
    if (tallest.orientation !== turned || height > tallest.height) {
      tallest = { height, orientation: turned };
    }
    const bottom = viewport.scale > 1.01 ? 0 : top + height;
    // A keyboard over the screen's bottom takes the home indicator's room
    // with it (app.css --safe-bottom); Brave's resized web view drops it on
    // its own, Safari keeps it, and a foreseen keyboard stands before both.
    const covered = bottom > 0 && tallest.height - bottom >= COVERS;
    if (covered !== root.hasAttribute("data-keyboard")) {
      root.toggleAttribute("data-keyboard", covered);
    }
    if (
      top !== visible.top ||
      height !== visible.height ||
      bottom !== floor.bottom
    ) {
      flushSync(() => {
        visible.top = top;
        visible.height = height;
        floor.bottom = bottom;
      });
    }
  };

  /** The visible height to show while a foreseen keyboard is awaited. */
  const awaited = (height: number, focused: boolean): number => {
    if (!ahead) {
      return height;
    }
    const now = performance.now();
    if (height !== ahead.seen) {
      ahead.seen = height;
      ahead.since = now;
    }
    const up = rest.height - height >= COVERS;
    // No keyboard came (a hardware keyboard): the next tap foresees none.
    const field = document.activeElement;
    if (isField(field) && !up && now > ahead.until) {
      localStorage.removeItem(keyboardKey(field));
    }
    // Arrived where foreseen; focus gone; or no keyboard came.
    const done =
      Math.abs(height - ahead.height) <= 2 || !focused || now > ahead.until;
    // Or it settled at another height: one correction.
    const elsewhere = up && now - ahead.since >= STABLE_MS;
    if (done || elsewhere) {
      ahead = null;
      return height;
    }
    window.setTimeout(request, STABLE_MS);
    return ahead.height;
  };

  /** Keeps the keyboard's height once the area has held still with it up. */
  const learn = () => {
    settling.timer = 0;
    const keyboard = rest.height - settling.height;
    const field = document.activeElement;
    // Only the height a keyboard opens at, which is what a tap foresees: the
    // simulator's keyboard dropped its suggestion row half a second after
    // opening, and the next opening, with the row, was foreseen 68px short.
    if (
      opened ||
      ahead ||
      !isField(field) ||
      visible.height !== settling.height ||
      rest.orientation !== orientation() ||
      keyboard < COVERS
    ) {
      return;
    }
    opened = true;
    localStorage.setItem(keyboardKey(field), String(keyboard));
  };

  const measure = () => {
    frame = 0;
    const layout = root.clientHeight;
    const focused = isField(document.activeElement);
    const height = awaited(Math.min(viewport.height, layout), focused);
    const top = Math.min(Math.max(viewport.offsetTop, 0), layout - height);
    publish(top, height);
    if (!focused) {
      rest = { height, orientation: orientation() };
      opened = false;
      window.clearTimeout(settling.timer);
      settling = { height: 0, timer: 0 };
    } else if (!(opened || ahead) && height !== settling.height) {
      window.clearTimeout(settling.timer);
      settling = { height, timer: window.setTimeout(learn, STABLE_MS) };
    }
    // A field's box is measured from where the window has scrolled to; iOS
    // counts its pan to a field as that scroll, so the visible area starts
    // at the visual viewport's page offset less the window's.
    const from = Math.min(
      Math.max(viewport.pageTop - window.scrollY, 0),
      layout - height
    );
    const field = document.activeElement;
    if (isField(field)) {
      reveal(field, from, from + height);
    }
  };

  /**
   * At a tap on a field with the keyboard down: the visible area as the
   * keyboard will leave it, and the field in it, before focus.
   */
  const foresee = (field: HTMLElement): boolean => {
    const keyboard = Number(localStorage.getItem(keyboardKey(field)));
    if (
      ahead ||
      !raisesKeyboard(field) ||
      visible.height < rest.height ||
      rest.orientation !== orientation() ||
      !(keyboard > 0 && keyboard < rest.height)
    ) {
      return false;
    }
    const height = rest.height - keyboard;
    const now = performance.now();
    ahead = { height, until: now + AWAIT_MS, seen: rest.height, since: now };
    publish(0, height);
    reveal(field, 0, height);
    return true;
  };

  /**
   * Scrolls `field` into [from, to] inside the boxes that scroll it, clear
   * of each box's scroll-padding (a sticky footer's room).
   */
  const reveal = (field: HTMLElement, from: number, to: number) => {
    for (const box of scrollers(field)) {
      const area = box.getBoundingClientRect();
      const style = getComputedStyle(box);
      const upper =
        Math.max(
          area.top + (Number.parseFloat(style.scrollPaddingTop) || 0),
          from
        ) + MARGIN;
      const lower =
        Math.min(
          area.bottom - (Number.parseFloat(style.scrollPaddingBottom) || 0),
          to
        ) - MARGIN;
      const place = field.getBoundingClientRect();
      if (place.bottom > lower) {
        // A field taller than the area shows its top.
        box.scrollTop += Math.min(place.bottom - lower, place.top - upper);
      } else if (place.top < upper) {
        box.scrollTop -= upper - place.top;
      }
    }
  };

  const request = () => {
    frame ||= requestAnimationFrame(measure);
  };

  /** Focus moved: watch the new field's scrollers for size changes. */
  const follow = () => {
    const field = document.activeElement;
    const next = isField(field) ? field : null;
    if (next === watched) {
      return;
    }
    resized.disconnect();
    watched = next;
    if (next) {
      for (const box of scrollers(next)) {
        resized.observe(box);
      }
      request();
    }
  };

  /**
   * The mouse events a tap sends after its touchend, swallowed while armed:
   * the field the tap focused has moved from under the finger, and they
   * would land on whatever stands there now and take the focus back.
   */
  let swallowing = 0;
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "click") {
      stopSwallowing();
    }
  };
  const startSwallowing = () => {
    for (const type of SWALLOWED) {
      window.addEventListener(type, swallow, { capture: true });
    }
    // A tap whose content changed sends no click; the next touch is its own.
    swallowing = window.setTimeout(stopSwallowing, SWALLOW_MS);
  };
  const stopSwallowing = () => {
    window.clearTimeout(swallowing);
    swallowing = 0;
    for (const type of SWALLOWED) {
      window.removeEventListener(type, swallow, { capture: true });
    }
  };

  /** Where the one finger on the screen came down; null for none or several. */
  let press: { x: number; y: number } | null = null;
  const touchStart = (event: TouchEvent) => {
    if (swallowing) {
      stopSwallowing();
    }
    const [touch] = event.touches;
    press =
      event.touches.length === 1 && touch
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };
  /** A tap on a field that is not focused yet focuses it without a pan. */
  const touchEnd = (event: TouchEvent) => {
    const [touch] = event.changedTouches;
    const start = press;
    press = null;
    // A touch that travelled was a scroll or a drag, not a tap.
    if (!(start && touch)) {
      return;
    }
    if (
      Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP
    ) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const field =
      target?.closest(EDITABLE) ?? target?.closest("label")?.control ?? null;
    // A focused field whose keyboard was put away raises it again on the
    // tap itself, which a field moved from under the finger would miss.
    if (!(target && isField(field)) || field === document.activeElement) {
      return;
    }
    const foreseen = foresee(field);
    field.focus({ preventScroll: true });
    // Foreseen, the field may have left the finger: the tap goes on (a
    // freshly launched web view raised no keyboard for a tap ended at its
    // touchend), its mouse events are swallowed (the sources'
    // `preventDefault` on mousedown), and the caret goes after the text.
    if (
      foreseen &&
      !target.contains(document.elementFromPoint(touch.clientX, touch.clientY))
    ) {
      startSwallowing();
      if (
        field instanceof HTMLTextAreaElement ||
        (field instanceof HTMLInputElement && SELECTS.test(field.type))
      ) {
        const end = field.value.length;
        field.setSelectionRange(end, end);
      }
    }
  };

  measure();
  viewport.addEventListener("resize", request);
  viewport.addEventListener("scroll", request);
  window.addEventListener("resize", request);
  document.addEventListener("focusin", follow);
  document.addEventListener("focusout", follow);
  document.addEventListener("touchstart", touchStart, {
    capture: true,
    passive: true,
  });
  document.addEventListener("touchend", touchEnd, {
    capture: true,
    passive: true,
  });
  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(settling.timer);
    stopSwallowing();
    root.removeAttribute("data-keyboard");
    resized.disconnect();
    viewport.removeEventListener("resize", request);
    viewport.removeEventListener("scroll", request);
    window.removeEventListener("resize", request);
    document.removeEventListener("focusin", follow);
    document.removeEventListener("focusout", follow);
    document.removeEventListener("touchstart", touchStart, { capture: true });
    document.removeEventListener("touchend", touchEnd, { capture: true });
  };
}
