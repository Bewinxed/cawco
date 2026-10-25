/**
 * A page's component canvases load one at a time (Preview.svelte), the one
 * in view, or nearest to it, first.
 *
 * Each canvas embed asks for its whole module graph at once (stage-host
 * host.ts `closureOf`: every module a `modulepreload`, 626 for the pairing
 * canvas), and every embed of a page stands in one renderer process: the
 * hub's host is one site whatever the port. Chromium caps a process's
 * requests in flight at 2,700 (services/network/network_context.h,
 * `kMaxOutstandingRequestsPerProcess = 2700`) and fails each past it with
 * `net::ERR_INSUFFICIENT_RESOURCES`: twelve Previews of the pairing canvas
 * asked for some 7,500 modules at once, six said "Pairing didn't load" (the
 * section's import refused) and five never drew (their entry's). One at a
 * time, every embed after the first of a canvas reads the modules the first
 * kept (host.ts `KEPT`, `immutable`).
 *
 * Each next turn goes to the waiting embed whose place is nearest the view
 * as the page stands then (in view first, top to bottom), so a page scrolled
 * to its middle draws what the person sees before what is above or below,
 * and a scroll while they wait moves the next turn with it. The first turn
 * is given once the page's Previews have all asked (a task after the first
 * ask), so it goes by place too, not to whichever asked first.
 *
 * A turn ends when its embed says its whole graph arrived (core
 * `CANVAS_EMBED_FETCHED`: one graph in flight at a time, the next fetching
 * while this one evaluates on the page's one main thread), else when it says
 * its shape (it drew, or says why it didn't), when its Preview goes, or
 * after {@link TURN_MS}, so a canvas that never answers holds the rest no
 * longer than that.
 */

/** How long one embed holds the page's turn at most. Our call. */
const TURN_MS = 20_000;

interface Waiting {
  /** Where its picture stands on the page, when it stands anywhere. */
  place: () => Element | null | undefined;
  start: () => void;
}

/** The embeds waiting for their turn. */
const waiting: Waiting[] = [];
let loading = false;
let pending = false;

/** The part of the window `el` is seen through, top and bottom: its nearest scroller's box (a decision page scrolls its cards in its own, Decisions.svelte `page-scroll`), inside the window's. */
function viewOf(el: Element): { bottom: number; top: number } {
  let top = 0;
  let bottom = window.innerHeight;
  for (let up = el.parentElement; up; up = up.parentElement) {
    const scrolls = getComputedStyle(up).overflowY;
    if (scrolls === "auto" || scrolls === "scroll") {
      const box = up.getBoundingClientRect();
      top = Math.max(top, box.top);
      bottom = Math.min(bottom, box.bottom);
      break;
    }
  }
  return { top, bottom };
}

/** How far a place stands from the view, px (0 inside it), then how far down: the nearest first, top to bottom. */
function rank(one: Waiting): [number, number] {
  const el = one.place();
  if (!el) {
    return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  }
  const box = el.getBoundingClientRect();
  const view = viewOf(el);
  let away = 0;
  if (box.bottom < view.top) {
    away = view.top - box.bottom;
  } else if (box.top > view.bottom) {
    away = box.top - view.bottom;
  }
  return [away, box.top];
}

const nearest = (): Waiting | undefined => {
  let best: Waiting | undefined;
  let bestRank: [number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
  ];
  for (const one of waiting) {
    const [away, top] = rank(one);
    if (
      best === undefined ||
      away < bestRank[0] ||
      (away === bestRank[0] && top < bestRank[1])
    ) {
      best = one;
      bestRank = [away, top];
    }
  }
  return best;
};

const next = () => {
  if (loading) {
    return;
  }
  const one = nearest();
  if (one) {
    waiting.splice(waiting.indexOf(one), 1);
    loading = true;
    one.start();
  }
};

/** The next turn given a task later: once every Preview mounting now has asked, or once the page has laid out what the last turn drew. */
const soon = () => {
  if (pending) {
    return;
  }
  pending = true;
  setTimeout(() => {
    pending = false;
    next();
  });
};

export interface EmbedTurn {
  /** Ends the turn, or takes it out of the queue before it came: once, later calls do nothing. */
  done: () => void;
  /** Settles when it is this embed's turn to load. */
  granted: Promise<void>;
}

/** A place in the page's queue of canvas embeds, for the picture standing at `place`. */
export function embedTurn(place: () => Element | null | undefined): EmbedTurn {
  let state: "waiting" | "loading" | "done" = "waiting";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const asked: Waiting = { place, start: () => undefined };
  const done = () => {
    if (state === "loading") {
      clearTimeout(timer);
      loading = false;
      state = "done";
      // A task later: the shape just said has laid the page out again by then, so the nearest is judged where the pictures now stand.
      soon();
    } else if (state === "waiting") {
      state = "done";
      const at = waiting.indexOf(asked);
      if (at >= 0) {
        waiting.splice(at, 1);
      }
    }
  };
  const granted = new Promise<void>((resolve) => {
    asked.start = () => {
      state = "loading";
      timer = setTimeout(done, TURN_MS);
      resolve();
    };
  });
  waiting.push(asked);
  soon();
  return { done, granted };
}
