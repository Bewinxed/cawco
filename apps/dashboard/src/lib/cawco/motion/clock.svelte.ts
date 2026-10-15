/**
 * A clock nobody can see does not run.
 *
 * An elapsed label is a clock: while a run goes on it re-reads the time on a
 * timer and writes plain tabular figures, so a second ticking over changes
 * digits in place and never the label's width, and nothing animates on a
 * tick. A clock never morphs (TextMorph is for words that change meaning).
 *
 * One rule, here: a clock does not run while the element it writes into is
 * not on show — scrolled out of the viewport or inside a subtree nothing
 * renders (`watchRendered`), the tab hidden, or the phone's navigation sheet
 * over the page. It comes back reading the time now.
 */
import type { Attachment } from "svelte/attachments";
import { watchRendered } from "#lib/utils/rendered.js";

/**
 * The phone's navigation sheet, open over the page.
 *
 * Shell owns it — `railOpen && !railed`, the state its own `Sheet.Root`
 * binding carries — and publishes it here, so a clock under the sheet reads
 * the flag the sheet already has rather than one of its own.
 */
export const navSheet = $state({ open: false });

/** The tab hidden, kept current by the one listener the first clock installs. */
let tabHidden = $state(false);

let hearing = false;
function hear() {
  if (hearing) {
    return;
  }
  hearing = true;
  const sync = () => {
    tabHidden = document.hidden;
  };
  sync();
  document.addEventListener("visibilitychange", sync);
}

/* One second for every clock in the app, as the rail and the home keep one for
   their ages: a row that ticked for itself would put a timer per session on a
   card of thirty, and they all read the same second. It runs while at least
   one clock is wanted and on show; each of them reads the second it takes. */
const held = new Set<() => void>();
let ticker: ReturnType<typeof setInterval> | undefined;

function second() {
  for (const step of held) {
    step();
  }
}

/** Holds the shared second for as long as the clock that took it wants it. */
function hold(step: () => void): () => void {
  held.add(step);
  if (ticker === undefined) {
    ticker = setInterval(second, 1000);
  }
  return () => {
    held.delete(step);
    if (held.size === 0) {
      clearInterval(ticker);
      ticker = undefined;
    }
  };
}

export interface Clock {
  /** The time this clock reads. It moves only while the clock is on show. */
  readonly now: number;
  /** The element whose view the clock answers to. */
  watch: Attachment<Element>;
}

/**
 * A clock that runs while `running()` holds and its element is on show, and
 * that stands still otherwise. `watch` says which element: the label's own.
 */
export function tickingClock(running: () => boolean): Clock {
  let now = $state(Date.now());
  let drawn = $state(false);
  let inView = $state(false);
  const onShow = $derived(drawn && inView && !tabHidden && !navSheet.open);

  $effect(() => {
    if (!(running() && onShow)) {
      return;
    }
    // Catch up at once: the reading is the time now.
    now = Date.now();
    return hold(() => {
      now = Date.now();
    });
  });

  return {
    get now() {
      return now;
    },
    watch: (node: Element) => {
      hear();
      // Rendered and on screen are two questions, and a clock asks both.
      // `watchRendered` answers only the first: content an ancestor skips has
      // no layout, and one merely scrolled past the fold is still laid out
      // (utils/rendered). So the viewport is watched here as well — a clock
      // scrolled out of view is nobody's clock, laid out or not.
      const watching = watchRendered(node, (rendered) => {
        drawn = rendered;
      });
      const box = node.getBoundingClientRect();
      inView =
        box.bottom > 0 &&
        box.top < innerHeight &&
        box.right > 0 &&
        box.left < innerWidth;
      const seen = new IntersectionObserver(([entry]) => {
        inView = entry.isIntersecting;
      });
      seen.observe(node);
      drawn = watching.rendered;
      return () => {
        drawn = false;
        inView = false;
        watching.stop();
        seen.disconnect();
      };
    },
  };
}
