/**
 * Which previews keep their page while their conversation's tab is off
 * screen. A pane put away keeps its page loaded, held (the overlay's
 * hold.ts: no frames, timers or animations run), so the tab's return shows
 * it as it was, with no reload; past the bound, the one hidden longest
 * unloads, and loads again once its tab is back. A held page still keeps
 * its memory (a sheet's ~90 MB), and on WebKit every preview shares the
 * dashboard's process: the bound is the owner's, "2 on desktop, 1 on
 * phone".
 *
 * A pane that mounts off screen (a tab restored behind another) holds no
 * page until its tab is first shown.
 *
 * A switch puts one pane away and shows another, and each pane says so from
 * its own effect, in whatever order the tree runs them: the arriving pane
 * may still count as hidden, the one hidden longest, when the leaving one
 * says it went. So the bound is applied once the switch has settled (the
 * microtask after it), and only to panes whose tab is off screen then, as
 * each pane's own `onScreen` says: a pane being shown is never let go by the
 * switch that shows it.
 */
import { layoutPolicy } from "../workspace/layout-policy.svelte";

/** How many panes off screen keep their page: the owner's bound. */
const loadedHidden = (): number => (layoutPolicy.phone ? 1 : 2);

interface Entry {
  /** When its tab went off screen; null while on screen. */
  hiddenAt: number | null;
  /** Whether it holds its page. */
  loaded: boolean;
  /** Whether its tab is in view now, as the pane's own prop says. */
  onScreen: () => boolean;
  /** Lets its page go: the pane's frame goes, and loads again once shown. */
  unload: () => void;
}

const panes = new Map<string, Entry>();
let settling = false;

/** Past the bound, the panes off screen hidden longest let their page go. */
function settle() {
  settling = false;
  const kept = [...panes.values()]
    .filter((one) => one.loaded && one.hiddenAt !== null && !one.onScreen())
    .sort((a, b) => (a.hiddenAt ?? 0) - (b.hiddenAt ?? 0));
  for (const one of kept.slice(0, Math.max(0, kept.length - loadedHidden()))) {
    one.loaded = false;
    one.unload();
  }
}

export const loadedPanes = {
  /** A pane mounted: it holds its page from the start only on screen. */
  enter(pane: {
    id: string;
    onScreen: () => boolean;
    unload: () => void;
  }): void {
    const onScreen = pane.onScreen();
    panes.set(pane.id, {
      hiddenAt: onScreen ? null : performance.now(),
      loaded: onScreen,
      onScreen: pane.onScreen,
      unload: () => pane.unload(),
    });
  },

  /** Pane `id`'s tab is in view: it holds its page (loading it again if it had let it go). */
  shown(id: string): void {
    const entry = panes.get(id);
    if (entry) {
      entry.hiddenAt = null;
      entry.loaded = true;
    }
  },

  /** Pane `id`'s tab went off screen: once the switch has settled, the bound is applied. */
  hidden(id: string): void {
    const entry = panes.get(id);
    if (!entry || entry.hiddenAt !== null) {
      return;
    }
    entry.hiddenAt = performance.now();
    if (!settling) {
      settling = true;
      queueMicrotask(settle);
    }
  },

  /** Pane `id` unmounted. */
  leave(id: string): void {
    panes.delete(id);
  },
};
