/**
 * A media query's `prefers-color-scheme` answered for a scheme, where no
 * browser setting can: a frame's preferred scheme follows its element's
 * `color-scheme` in Firefox and WebKit (CSS Color Adjustment 1, "Opting
 * Into a Preferred Color Scheme"), and the system's in Chromium. A page
 * drawn in a scheme of CawCo's choosing (the overlay's copy for a
 * thumbnail, an HTML design's frame on the design graph) has each query
 * asking it settled instead, so its own rule for that scheme holds in
 * every engine.
 */

/** A scheme a page is drawn in. */
export type MediaScheme = "light" | "dark";

/** A `prefers-color-scheme` feature in a media query. */
const PREFERS = /\(\s*prefers-color-scheme\s*:\s*(light|dark)\s*\)/giu;
/** Media features that always hold, and never do (range syntax: a width is never negative). */
const ALWAYS = "(width >= 0px)";
const NEVER = "(width < 0px)";

/** `media` with each `prefers-color-scheme` feature settled for `scheme`; null when it names none. */
export function settledMedia(
  media: string,
  scheme: MediaScheme
): string | null {
  PREFERS.lastIndex = 0;
  if (!PREFERS.test(media)) {
    return null;
  }
  return media.replace(PREFERS, (_, said: string) =>
    said.toLowerCase() === scheme ? ALWAYS : NEVER
  );
}
