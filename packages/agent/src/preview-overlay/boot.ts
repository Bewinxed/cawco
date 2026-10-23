/**
 * What every document the preview proxy serves runs first, the overlay's
 * own or not: its history watch, and this window's mark.
 *
 * The overlay runs once per preview, in the outermost previewed document,
 * and reaches every same-origin frame inside it (frames.ts). The proxy
 * injects the script into every HTML page, and cannot tell a page from a
 * frame inside one by its request (the preview is itself a frame in the
 * dashboard, and the top document in the app's web view), so each document
 * decides at load (overlay.ts): one whose same-origin parent carries the
 * mark stands down. The mark is set here, synchronously, before the
 * document holds any frame, so a frame never misses its parent's.
 */
import { hold, isHeld } from "./hold";

/** What a document's overlay answers its frames' overlays, under {@link MARK}. */
export interface OverlayMark {
  /** A frame inside navigated in place (history): the marks in it are placed again. */
  frameChanged: () => void;
  /** Whether this document is held: a frame loading inside a held one starts held. */
  held: () => boolean;
  /** This document held or let go (hold.ts), by the overlay that runs above it. */
  hold: (on: boolean) => void;
}

const MARK = "__cawcoOverlay";
type Marked = Window & { [MARK]?: OverlayMark };

/** This window's mark: an overlay runs here, or runs above and reaches here. */
export const mark: OverlayMark = {
  frameChanged: () => undefined,
  held: isHeld,
  hold,
};
Object.defineProperty(window, MARK, { value: mark });

/** A same-origin window's mark; null for another origin's, or one no overlay loaded in. */
export function markOf(view: Window): OverlayMark | null {
  try {
    return (view as Marked)[MARK] ?? null;
  } catch {
    return null;
  }
}

/** This document's own: the tag that loaded the script, and what an in-place navigation tells. */
export const here: {
  navigated: () => void;
  tag: HTMLScriptElement | null;
} = { navigated: () => undefined, tag: null };

/** The same-origin parent's mark; null at the top, under another origin, or where no overlay was loaded. */
export function parentMark(): OverlayMark | null {
  if (window.parent === window) {
    return null;
  }
  // Another origin's parent is never reached into: WebKit reports the reach
  // as the page's error, caught or not. Its origin is said without touching
  // it (`ancestorOrigins`, where the engine keeps it).
  const above = location.ancestorOrigins?.[0];
  if (above && above !== location.origin) {
    return null;
  }
  return markOf(window.parent);
}

/**
 * Every in-place navigation of this document's history is told
 * (`here.navigated`), so the overlay places its marks again and the pane
 * reads the page's path. The page is served at the root of its own origin,
 * so nothing of its addresses is changed.
 */
export function watchHistory(): void {
  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];
    history[method] = function (...args: Parameters<History[typeof method]>) {
      original.apply(this, args);
      here.navigated();
    };
  }
}
