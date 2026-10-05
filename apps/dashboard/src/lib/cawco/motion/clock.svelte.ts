/**
 * A clock nobody can see does not run.
 *
 * An elapsed label is a clock: while a run goes on it re-reads the time on a
 * timer, and the write morphs the figures into the next ones letter by letter
 * (`torph`: two `Element.animate()` calls per character). On a phone with the
 * navigation sheet open over a session page none of those labels is in view,
 * and none of them idles: measured on the page under an open sheet, 50 to 100
 * `animate()` calls a second, and long frames inside the sheet's own tree
 * toggles.
 *
 * So one rule, here: a clock does not run and does not morph while the element
 * it writes into is not on show — scrolled out of the viewport or inside a
 * subtree nothing renders (`watchRendered`), the tab hidden, or the phone's
 * navigation sheet over the page. The reading it comes back with is written as
 * text: a catch-up has no old words anyone watched, and morphing the seconds
 * that went unseen is the work this rule is about. What a clock that is on
 * show looks like does not change.
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
  /** Whether the next write may morph. A catch-up is written as text. */
  readonly morph: boolean;
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
  let caught = $state(true);
  let drawn = $state(false);
  let inView = $state(false);
  const onShow = $derived(drawn && inView && !tabHidden && !navSheet.open);

  $effect(() => {
    if (!(running() && onShow)) {
      return;
    }
    // Catch up at once: the reading is the time now, and nobody saw the words
    // it stands in for, so it is written as text and not morphed into them.
    now = Date.now();
    caught = true;
    return hold(() => {
      now = Date.now();
      caught = false;
    });
  });

  // Only a catch-up is written plain. Every other change of words — a clock
  // settling onto the time its run reported, a figure moving to a new count —
  // is a real change, and it morphs as it always did.
  $effect(() => {
    if (!running()) {
      caught = false;
    }
  });

  return {
    get now() {
      return now;
    },
    get morph() {
      return onShow && !caught;
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
