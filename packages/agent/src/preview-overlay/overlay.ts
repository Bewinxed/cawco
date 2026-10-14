/// <reference lib="dom" />

/**
 * The overlay's entry, in every document the preview proxy serves (core
 * `injectOverlay`). It applies the proxy's address patches and sets this
 * window's mark (boot.ts), then decides whether the overlay runs here:
 *
 * - a same-origin parent carries the mark: the overlay above reaches this
 *   frame (frames.ts), so this one stands down, with no element, listener
 *   or socket of its own, and hands the overlay above the in-place
 *   navigations its history patch sees;
 * - a same-origin parent still parsing, without the mark yet (a page with
 *   no head has the overlay injected at its body's end, after the frames
 *   before it): it decides again on the parent's DOMContentLoaded, by which
 *   time the parent's overlay, if it has one, has set its mark;
 * - otherwise (the top document, a frame of another origin's page, the
 *   preview inside the dashboard's pane): the overlay runs (page.ts).
 *
 * page.ts is reached only through `import()`, which the IIFE bundle keeps
 * lazy, so a frame that stands down never evaluates it. Where it runs, it
 * starts in the microtask after this script, before the parser goes on.
 */
import { here, mark, parentMark, parentParsing, watchHistory } from "./boot";

here.tag = document.currentScript as HTMLScriptElement | null;
watchHistory();

function decide() {
  const above = parentMark();
  if (above) {
    here.navigated = () => above.frameChanged();
    mark.frameChanged = () => above.frameChanged();
    return;
  }
  const parsing = parentParsing();
  if (parsing) {
    parsing.addEventListener("DOMContentLoaded", decide, { once: true });
    return;
  }
  import("./page");
}

decide();
