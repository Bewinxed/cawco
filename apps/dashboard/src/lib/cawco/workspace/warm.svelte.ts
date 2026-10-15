/**
 * The pane a reader is about to show, laid out before they show it.
 *
 * A pane put away is skipped (PaneLeaf `.pane-hidden`, `content-visibility:
 * hidden`): it costs nothing while its session streams, and the switch that
 * shows it styles and lays out every row it holds in that one task, 50-75ms
 * of CPU for a long transcript. So a tab the reader reaches for — the
 * pointer comes onto it or presses it, the keyboard focuses it — warms its
 * pane: laid out and not painted (PaneLeaf `.pane-settling`), so that work
 * lands in the frame after the reach and the switch only paints. And its
 * conversation is told it is on screen (PaneLeaf's `slot`, SessionPane
 * `visible`): its transcript follows its tail and draws the rows its session
 * streamed while it was put away. Held back until the switch, a whole view
 * of them was mounted in the click. Swipe groups need none of this: they
 * keep both neighbours drawn (PaneLeaf `shown`).
 *
 * One pane a group at most, and only while the reach lasts: a warm pane is
 * laid out again as its session streams, the cost a pane put away is spared.
 */
import { SvelteMap } from "svelte/reactivity";

/**
 * How long a pane stays warm once the reach has left its tab (the pointer
 * gone, the focus moved on). Our own call: long enough for a pointer that
 * slides off a tab and back, or a hand that rests a moment before pressing,
 * to find the pane still laid out; short enough that a pane nobody chose is
 * not laid out on every streamed word for long.
 */
const COOL_MS = 1500;

/** Each group's warm pane, by group id. */
const warmPanes = new SvelteMap<string, string>();
const cooling = new Map<string, ReturnType<typeof setTimeout>>();

export const warm = {
  /** Whether `paneId` is the pane its group holds warm. */
  holds(leafId: string, paneId: string): boolean {
    return warmPanes.get(leafId) === paneId;
  },

  /** The reader reached for `paneId`'s tab in `leafId`: it warms, in place of any other there. */
  reach(leafId: string, paneId: string): void {
    clearTimeout(cooling.get(leafId));
    cooling.delete(leafId);
    if (warmPanes.get(leafId) !== paneId) {
      warmPanes.set(leafId, paneId);
    }
  },

  /** The reach has left `paneId`'s tab: it goes cold after `COOL_MS`, unless reached for again. */
  leave(leafId: string, paneId: string): void {
    if (warmPanes.get(leafId) !== paneId) {
      return;
    }
    clearTimeout(cooling.get(leafId));
    cooling.set(
      leafId,
      setTimeout(() => {
        cooling.delete(leafId);
        if (warmPanes.get(leafId) === paneId) {
          warmPanes.delete(leafId);
        }
      }, COOL_MS)
    );
  },
};
