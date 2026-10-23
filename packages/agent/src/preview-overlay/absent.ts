/**
 * When a mark whose element the page no longer holds is gone (pins.ts,
 * ink.ts): only once it has stood missing for {@link GONE_AFTER_MS}. A page
 * that draws a part of itself again (its panels rebuilt from a template, a
 * list re-rendered, a node a framework swapped) has the element back within
 * it, and a mark read in between is never moved aside for it.
 */

/** How long a mark's element may stand missing before the mark is gone. Our call. */
export const GONE_AFTER_MS = 2000;

export interface Absences {
  /** The marks a draw missed, `ids`, keep their time: every other (found, or not drawn now) starts over. */
  keep: (ids: Iterable<string>) => void;
  /** Mark `id` is missing in this draw: whether it has been for {@link GONE_AFTER_MS}. */
  missed: (id: string) => boolean;
}

/**
 * Each mark a draw misses, timed from its first miss; `again` draws once
 * more when the soonest comes due, so a mark that stays missing is moved
 * aside then, whatever else the page does.
 */
export function absences(again: () => void): Absences {
  const since = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let due = Number.POSITIVE_INFINITY;
  const wake = (at: number, now: number) => {
    if (at >= due) {
      return;
    }
    clearTimeout(timer);
    due = at;
    timer = setTimeout(() => {
      timer = undefined;
      due = Number.POSITIVE_INFINITY;
      again();
    }, at - now);
  };
  return {
    keep: (ids) => {
      const kept = new Set(ids);
      for (const id of since.keys()) {
        if (!kept.has(id)) {
          since.delete(id);
        }
      }
    },
    missed: (id) => {
      const now = performance.now();
      const first = since.get(id) ?? now;
      since.set(id, first);
      const at = first + GONE_AFTER_MS;
      if (now >= at) {
        since.delete(id);
        return true;
      }
      wake(at, now);
      return false;
    },
  };
}
