/**
 * Long-press opens the context menu, the way iOS does it.
 *
 * Every right-click menu in the app is unreachable on a phone: touch never
 * fires `contextmenu` in the browsers that matter, so the menus simply do not
 * exist there. A stationary press held for {@link HOLD_MS} synthesises the
 * `contextmenu` event at the finger's coordinates, and bits-ui takes it from
 * there exactly as if a mouse had right-clicked.
 *
 * Document-level and installed once: every menu — machines, sessions, stored
 * sessions, whatever is added later — gets the behaviour without wiring.
 *
 * While the finger holds, the row under it is marked `data-holding`, which
 * draws it pressed (app.css), so the hold reads as a press that is going
 * somewhere; the mark goes when the menu opens or the press is let go.
 */
const HOLD_MS = 500;
/** A finger that travels further than this is scrolling, not pressing. */
const SLOP_PX = 10;

export function enableLongPressMenus(): () => void {
  // Probe-visible marker: tells "not installed" apart from "not firing".
  (globalThis as Record<string, unknown>).__longPressInstalled = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;
  /** Swallow the click that follows a press which already opened a menu. */
  let fired = false;
  /** The row drawn pressed while the hold runs. */
  let held: Element | null = null;

  const release = () => {
    held?.removeAttribute("data-holding");
    held = null;
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = null;
    release();
  };

  const onTouchStart = (event: TouchEvent) => {
    if (event.touches.length !== 1) {
      return cancel();
    }
    const [touch] = event.touches;
    const target = event.target as HTMLElement;
    // Only where a menu actually is — a long press on a paragraph should keep
    // meaning what the platform says it means (text selection).
    // The trigger is `display: contents`; the row is its child the finger is on.
    const row = target.closest('[data-slot="context-menu-trigger"] > *');
    if (!row) {
      return;
    }
    startX = touch.clientX;
    startY = touch.clientY;
    fired = false;
    cancel();
    held = row;
    row.setAttribute("data-holding", "");
    timer = setTimeout(() => {
      fired = true;
      release();
      target.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: startX,
          clientY: startY,
        })
      );
    }, HOLD_MS);
  };

  const onTouchMove = (event: TouchEvent) => {
    const [touch] = event.touches;
    if (!touch) {
      return cancel();
    }
    if (Math.hypot(touch.clientX - startX, touch.clientY - startY) > SLOP_PX) {
      cancel();
    }
  };

  const onTouchEnd = (event: TouchEvent) => {
    cancel();
    // The lift after a successful press must not also be a tap: without this
    // the row under the finger opens right through the menu it just summoned.
    if (fired) {
      event.preventDefault();
      fired = false;
    }
  };

  // Capture phase, deliberately: the drag library stops touch events from
  // propagating once it has claimed an item, so a bubble listener on document
  // never hears a press that starts on a draggable row — which is every row
  // with a menu. Capture runs first and cannot be silenced from below.
  document.addEventListener("touchstart", onTouchStart, {
    passive: true,
    capture: true,
  });
  document.addEventListener("touchmove", onTouchMove, {
    passive: true,
    capture: true,
  });
  document.addEventListener("touchend", onTouchEnd, { capture: true });
  document.addEventListener("touchcancel", cancel, {
    passive: true,
    capture: true,
  });

  return () => {
    cancel();
    document.removeEventListener("touchstart", onTouchStart, { capture: true });
    document.removeEventListener("touchmove", onTouchMove, { capture: true });
    document.removeEventListener("touchend", onTouchEnd, { capture: true });
    document.removeEventListener("touchcancel", cancel, { capture: true });
  };
}
