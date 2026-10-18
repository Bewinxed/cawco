/**
 * The overlay's entry, in every document the preview proxy serves (core
 * `injectOverlay`, which puts it before every script of the page's). It
 * puts the page's frames and timers through the hold (hold.ts), applies the
 * proxy's address patches and sets this window's mark (boot.ts), then
 * decides whether the overlay runs here:
 *
 * - a same-origin parent carries the mark: the overlay above reaches this
 *   frame (frames.ts), so this one stands down, with no element, listener
 *   or socket of its own, and hands the overlay above the in-place
 *   navigations its history patch sees. The parent's overlay ran before any
 *   of its own scripts, so its mark stands before any frame of its exists;
 * - otherwise (the top document, a frame of another origin's page, the
 *   preview inside the dashboard's pane): the overlay runs (page.ts).
 *
 * page.ts is reached only through `import()`, which the IIFE bundle keeps
 * lazy, so a frame that stands down never evaluates it. Where it runs, it
 * starts in the microtask after this script, before the parser goes on.
 */
import { here, mark, parentMark, watchHistory } from "./boot";
import { hold, installHold } from "./hold";

// First, before any script of the page's asks for a frame or a timer.
installHold();
here.tag = document.currentScript as HTMLScriptElement | null;
watchHistory();

const above = parentMark();
if (above) {
  // A frame loaded inside a held page is held with it.
  if (above.held()) {
    hold(true);
  }
  here.navigated = () => above.frameChanged();
  mark.frameChanged = () => above.frameChanged();
} else {
  import("./page");
}
