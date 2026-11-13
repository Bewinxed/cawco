/**
 * How the sidebar's lists are grouped, folded, pinned and unfolded, as the
 * first paint draws them. Each is a localStorage document, its source, whose
 * every write sends a copy to the server (prefs.ts `KEPT`, storage.ts
 * `writeJson`); the layout's load hands those copies to the page as `kept`.
 * While the first paint holds (first-render.svelte.ts), a store draws the
 * server's copy, so the server's HTML and the hydrated page group the same
 * rows the same way; then its own.
 */
import { page } from "$app/state";
import { firstRender } from "../platform/first-render.svelte";
import { asPref, KEPT, keepPrefs, type Pref } from "../platform/prefs";
import { stored } from "../platform/storage";

/** The server's copy of localStorage's `key`, as this page was rendered with it; null for none. */
function servedRaw(key: string): string | null {
  const pref = KEPT[key];
  const { kept } = page.data;
  return (pref && kept?.[pref]) ?? null;
}

/**
 * What a store draws for its document `key`: `own` (its localStorage
 * answer), or while the first paint holds, the server's copy read by
 * `parse` (which takes null for none).
 */
export function drawnFrom<T>(
  key: string,
  own: T,
  parse: (raw: string | null) => T
): T {
  return firstRender.held ? parse(servedRaw(key)) : own;
}

/**
 * Sends the server every copy that is behind this browser's own document
 * (written by another window, or before the copies were kept): once the
 * first paint has let go, so the next render draws what this page does.
 */
export function sendKept(): void {
  const behind: Partial<Record<Pref, string | null>> = {};
  for (const [key, pref] of Object.entries(KEPT)) {
    const own = stored("local", key);
    const copy = own === null ? null : asPref(own);
    if (copy !== servedRaw(key)) {
      behind[pref] = copy;
    }
  }
  if (Object.keys(behind).length > 0) {
    keepPrefs(behind);
  }
}
