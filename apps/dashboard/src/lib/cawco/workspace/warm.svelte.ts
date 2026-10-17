/**
 * The pane a reader is about to show, laid out before they show it.
 *
 * A pane put away is skipped (PaneLeaf `.pane-hidden`, `content-visibility:
 * hidden`): it costs nothing while its session streams, and the switch that
 * shows it styles and lays out every row it holds in that one task, 50-75ms
 * of CPU for a long transcript. So a tab the reader reaches for — the
 * pointer comes onto it or presses it, the keyboard focuses it — warms its
 * pane: laid out and not painted (PaneLeaf `.pane-settling`), so that work
 * lands in a frame of its own after the reach and the switch only paints.
 * Swipe groups need none of this: they keep both neighbours drawn (PaneLeaf
 * `shown`).
 *
 * The pane warms once the frame the reach came in has painted, never in the
 * reach's own task: that task holds the pointer's events, the rows rebuilt
 * for the tab (`rebuildScheduler.prepare`) and the hover handlers, and the
 * first of them to read the page (the strip's hover ghost hit-tests the
 * pointer) laid the whole pane out in it, 11-19ms of a 25-38ms task on a
 * busy session's tab (tab-return, 1a and 1b).
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
/** Each group's reach waiting for its frame to paint: the pane it warms, and how to call it off. */
const reaching = new Map<string, { cancel: () => void; paneId: string }>();

/** Calls off `leafId`'s reach still waiting for its frame. */
function callOff(leafId: string): void {
  reaching.get(leafId)?.cancel();
  reaching.delete(leafId);
}

export const warm = {
  /** Whether `paneId` is the pane its group holds warm. */
  holds(leafId: string, paneId: string): boolean {
    return warmPanes.get(leafId) === paneId;
  },

  /**
   * The reader reached for `paneId`'s tab in `leafId`: it warms, in place of
   * any other there, once the frame in hand has painted. A frame's callbacks
   * run before it paints; a task queued from them runs after.
   */
  reach(leafId: string, paneId: string): void {
    clearTimeout(cooling.get(leafId));
    cooling.delete(leafId);
    if (reaching.get(leafId)?.paneId === paneId) {
      return;
    }
    callOff(leafId);
    if (warmPanes.get(leafId) === paneId) {
      return;
    }
    let task: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      task = setTimeout(() => {
        reaching.delete(leafId);
        warmPanes.set(leafId, paneId);
      });
    });
    reaching.set(leafId, {
      paneId,
      cancel: () => {
        cancelAnimationFrame(frame);
        clearTimeout(task);
      },
    });
  },

  /** The reach has left `paneId`'s tab: it goes cold after `COOL_MS`, unless reached for again. */
  leave(leafId: string, paneId: string): void {
    if (reaching.get(leafId)?.paneId === paneId) {
      callOff(leafId);
      return;
    }
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
