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
 *
 * A reach also wakes what its pane holds still, in the reach's own task
 * ({@link warm.reached}): a preview held off screen is let go (PreviewPane),
 * so the page has its release before the switch's frame. Posted from the
 * switch, it raced that frame on WebKit, which runs the preview's origin on
 * an event loop of its own ("the ordering of messages from the same-origin
 * & cross-origin iframes is no longer guaranteed",
 * https://trac.webkit.org/changeset/259907/webkit): the page heard it after
 * the switch's frame had begun, and its first frame waited for the next one,
 * 112-134ms after the press (tab-return, 2c and 2e on WebKit).
 *
 * The keyboard's reach comes ahead of its key, as a pointer's hover comes
 * ahead of its press ({@link warm.besides}): while the focus rests on a tab,
 * the tabs an arrow key lands on next are reached for, so the arrow, which
 * chooses in its own task (TabsList), finds their previews already let go.
 */
import { SvelteMap, SvelteSet } from "svelte/reactivity";

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
/**
 * The panes whose tab is reached for, from the reach until it has left the
 * tab for `COOL_MS`, by pane: unlike the warm, any number at once, and set
 * in the reach's own task.
 */
const reachedPanes = new SvelteSet<string>();
/** Each reached pane's wait to be let go once its reach has left it. */
const unreaching = new Map<string, ReturnType<typeof setTimeout>>();
/** The tabs an arrow key lands on from the tab the focus rests on (`besides`), never warmed. */
const besidePanes = new SvelteSet<string>();
/** The keyboard's reach's wait to end once the focus has left the strip. */
let unbesiding: ReturnType<typeof setTimeout> | undefined;

/**
 * Runs `then` once the frame in hand has painted, never in its task: a
 * frame's callbacks run before it paints, a task queued from them runs
 * after. Answers how to call it off.
 */
export function afterPaint(then: () => void): () => void {
  let task: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    task = setTimeout(then);
  });
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(task);
  };
}

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

  /** The panes held warm, one a group at most. Tracked whole: a reader learns of any pane warming. */
  panes(): string[] {
    return [...warmPanes.values()];
  },

  /**
   * Whether `paneId`'s tab is reached for: from the reach, in its own task,
   * until the reach has left the tab for `COOL_MS`. A press that ends with
   * the tab still off screen (a drag, a press slid off) leaves it so.
   */
  reached(paneId: string): boolean {
    return reachedPanes.has(paneId) || besidePanes.has(paneId);
  },

  /**
   * The keyboard's reach: the tabs an arrow key lands on from the tab the
   * focus rests on, the one before it and the one after (`paneIds`), are
   * reached for in place of the last ones, at once; never warmed, as a
   * warm is laid out again on every word its session streams. None (the
   * focus has left the strip) ends the reach after `COOL_MS`, as a
   * pointer's ends; a focus coming back meanwhile takes it over.
   */
  besides(paneIds: string[]): void {
    clearTimeout(unbesiding);
    unbesiding = undefined;
    if (paneIds.length === 0) {
      unbesiding = setTimeout(() => {
        unbesiding = undefined;
        besidePanes.clear();
      }, COOL_MS);
      return;
    }
    for (const id of [...besidePanes]) {
      if (!paneIds.includes(id)) {
        besidePanes.delete(id);
      }
    }
    for (const id of paneIds) {
      besidePanes.add(id);
    }
  },

  /**
   * The reader reached for `paneId`'s tab in `leafId`: it is reached for at
   * once ({@link warm.reached}), and it warms, in place of any other there,
   * once the frame in hand has painted ({@link afterPaint}).
   */
  reach(leafId: string, paneId: string): void {
    clearTimeout(unreaching.get(paneId));
    unreaching.delete(paneId);
    reachedPanes.add(paneId);
    clearTimeout(cooling.get(leafId));
    cooling.delete(leafId);
    if (reaching.get(leafId)?.paneId === paneId) {
      return;
    }
    callOff(leafId);
    if (warmPanes.get(leafId) === paneId) {
      return;
    }
    reaching.set(leafId, {
      paneId,
      cancel: afterPaint(() => {
        reaching.delete(leafId);
        warmPanes.set(leafId, paneId);
      }),
    });
  },

  /**
   * `paneId`'s tab is chosen: its reach and its warm are over at once. Left
   * to cool, a reach outlived the choice it led to: a switch away within
   * `COOL_MS` found the pane still reached for and let its preview run off
   * screen, and one whose reach never left (the focus kept on its tab) put
   * the pane away still warm, laid out with its loops running (tab-return,
   * 2e and leg 3 on WebKit). Ended once the switch has painted, never in
   * its task: the pane is shown, so nothing on screen changes, and ending
   * it there woke every pane's warm and every preview's reach in the press,
   * a millisecond more of its script (tab-return, 1c).
   */
  chosen(paneId: string): void {
    afterPaint(() => {
      clearTimeout(unreaching.get(paneId));
      unreaching.delete(paneId);
      reachedPanes.delete(paneId);
      for (const [leafId, reach] of reaching) {
        if (reach.paneId === paneId) {
          callOff(leafId);
        }
      }
      for (const [leafId, pane] of warmPanes) {
        if (pane === paneId) {
          clearTimeout(cooling.get(leafId));
          cooling.delete(leafId);
          warmPanes.delete(leafId);
        }
      }
    });
  },

  /** The reach has left `paneId`'s tab: it goes cold, and is no longer reached for, after `COOL_MS`, unless reached for again. */
  leave(leafId: string, paneId: string): void {
    if (reachedPanes.has(paneId)) {
      clearTimeout(unreaching.get(paneId));
      unreaching.set(
        paneId,
        setTimeout(() => {
          unreaching.delete(paneId);
          reachedPanes.delete(paneId);
        }, COOL_MS)
      );
    }
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
