/**
 * A page's component canvases fetch their module graphs together, each
 * module asked of the network once for the whole page (Preview.svelte).
 *
 * Each canvas embed asks for its whole module graph at once (stage-host
 * host.ts `closureOf`: every module a `modulepreload`, 666 for the Needs you
 * card), and every embed of a page stands in one renderer process: the
 * hub's host is one site whatever the port. Chromium caps a process's
 * requests in flight at 2,700 (services/network/network_context.h,
 * `kMaxOutstandingRequestsPerProcess = 2700`) and fails each past it with
 * `net::ERR_INSUFFICIENT_RESOURCES`: twelve Previews of the pairing canvas
 * asked for some 7,500 modules at once, six said "Pairing didn't load" (the
 * section's import refused) and five never drew (their entry's). Five
 * canvases of the dashboard, each asking its whole graph at once, failed the
 * same way (canvas-parallel), and the stage served 1,726 modules where they
 * hold 869 between them: a module two frames ask for at once is fetched
 * twice. One at a time, a page of five drew its last 5.6 s in where one
 * alone drew at 1.3 s (the owner's dashboard, 2026-10-25).
 *
 * A module one frame of the page has fetched whole, the renderer answers to
 * every other frame from its memory cache, asking the network for none (a
 * second Preview of the Needs you card: 667 of its 667 `requestServedFromCache`,
 * the stage serving none of them). So:
 *
 * - every embed is given its address at once, and its page tells its graph
 *   before it fetches any of it (core `CANVAS_EMBED_GRAPH`);
 * - on its turn it fetches its share (`CANVAS_EMBED_GO` with the modules):
 *   the modules of its graph no embed has fetched or is fetching;
 * - once every module of its graph has arrived, in its frame or another's,
 *   it loads the rest from the cache and draws (`CANVAS_EMBED_READY`).
 *
 * The requests in flight are then the modules of the page's graphs, each
 * once: 869 for all 21 of the dashboard's states files (4,123 asked one
 * frame at a time). Turns are given while the shares fetching hold
 * {@link BUDGET} at most; a share past it alone is fetched alone.
 *
 * Turns go nearest the view first, as the page stands then (in view first,
 * top to bottom), so a page scrolled to its middle fetches what the person
 * sees before what is above or below; an embed whose graph is not told yet
 * holds those after it, so none farther goes ahead of it. The first turns
 * are given once the page's Previews have all asked (a task after the first
 * ask), so they go by place too, not to whichever asked first.
 *
 * A whole screen (a dev server's or a folder's preview) has no graph to
 * tell: its page loads its own, of a size nobody here knows, a whole app's,
 * so it takes its turn alone (`alone`), no other embed fetching beside it
 * and none starting while it loads, and holds it until it stands at its
 * shape. It tells an empty graph once its origin answers: until then it
 * holds those after it, as an untold graph does. Seven
 * dashboards on one page, loaded at once, each held the page's frames white
 * for most of a minute.
 *
 * An embed's share is held until it says its share arrived (core
 * `CANVAS_EMBED_FETCHED`), else until it says its shape, its Preview goes,
 * or {@link TURN_MS} passes; a share let go that way no longer holds the
 * embeds that wait on it, which fetch those modules themselves.
 */

/** The modules the shares fetching at once may hold in flight: Chromium's 2,700 less room for the page's own requests and each embed's entry, which loads before its turn. Our call. */
const BUDGET = 2000;

/** How long one embed holds its share at most. Our call. */
const TURN_MS = 20_000;

interface Asked {
  /** A whole screen's: its turn is the page's alone. */
  alone: boolean;
  /** Its graph, each module's address, once its page told it. */
  graph: readonly string[] | null;
  /** Where its picture stands on the page, when it stands anywhere. */
  place: () => Element | null | undefined;
  /** Its graph's modules, beyond its share, once none is still fetched by another: it loads them from the cache now. */
  ready: (rest: string[]) => void;
  /** The modules it fetches itself, once its turn came. */
  share: ReadonlySet<string>;
  /** Its turn, with its share. */
  start: (share: string[]) => void;
}

/** The embeds waiting for their turn. */
const waiting: Asked[] = [];
/** Each embed fetching its share now, and its share. */
const fetching = new Map<Asked, readonly string[]>();
/** The embeds given their turn whose graph still waits on modules another fetches. */
const unready = new Set<Asked>();
/** Every module an embed of this page has fetched whole: the renderer answers it from its cache. */
const kept = new Set<string>();
/** Every module an embed's share is fetching now. */
const flying = new Set<string>();
let pending = false;

/**
 * The nearest box `el` scrolls up and down in (a decision page scrolls its
 * cards in its own, Decisions.svelte `page-scroll`): one whose overflow-y
 * scrolls and whose content is taller than it. A well wider than its card
 * scrolls sideways (`overflow-x-auto`, Well.svelte), which computes its
 * overflow-y to auto too, yet it holds its piece at the piece's own height
 * and never scrolls up and down: taken as the scroller, every wide Preview
 * stood in its own well's view, mounted and drew at once, and was ranked
 * from its well, not the page. Null where only the window scrolls it.
 */
export function scrollerOf(el: Element): Element | null {
  for (let up = el.parentElement; up; up = up.parentElement) {
    const scrolls = getComputedStyle(up).overflowY;
    if (
      (scrolls === "auto" || scrolls === "scroll") &&
      up.scrollHeight > up.clientHeight + 1
    ) {
      return up;
    }
  }
  return null;
}

/** The part of the window `el` is seen through, top and bottom: its scroller's box ({@link scrollerOf}), inside the window's. */
function viewOf(el: Element): { bottom: number; top: number } {
  let top = 0;
  let bottom = window.innerHeight;
  const scroller = scrollerOf(el);
  if (scroller) {
    const box = scroller.getBoundingClientRect();
    top = Math.max(top, box.top);
    bottom = Math.min(bottom, box.bottom);
  }
  return { top, bottom };
}

/** How far a place stands from the view, px (0 inside it), then how far down: the nearest first, top to bottom. */
function rank(one: Asked): [number, number] {
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

const nearest = (): Asked | undefined => {
  let best: Asked | undefined;
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

/** Each embed given its turn whose graph no share fetches any more is told to load the rest of it. */
const readyNow = () => {
  for (const one of unready) {
    const share = fetching.get(one);
    if (share || (one.graph ?? []).some((url) => flying.has(url))) {
      continue;
    }
    unready.delete(one);
    one.ready((one.graph ?? []).filter((url) => !one.share.has(url)));
  }
};

/**
 * Turns to the nearest waiting embeds while the budget holds what they ask
 * between them; one whose graph is not told yet holds the rest, and a whole
 * screen's turn is taken alone. Those given
 * their turn together take their shares smallest graph first, so a small
 * graph is its own embed's to fetch, arrives first and draws while the
 * larger ones still fetch, the page's one main thread busy meanwhile.
 */
const next = () => {
  const asking = new Set(flying);
  const batch: Asked[] = [];
  const screenLoading = [...fetching.keys()].some((one) => one.alone);
  for (let one = nearest(); !screenLoading && one?.graph; one = nearest()) {
    if (one.alone) {
      if (fetching.size + batch.length === 0) {
        waiting.splice(waiting.indexOf(one), 1);
        batch.push(one);
      }
      break;
    }
    const fresh = one.graph.filter(
      (url) => !(kept.has(url) || asking.has(url))
    );
    if (
      fetching.size + batch.length > 0 &&
      asking.size + fresh.length > BUDGET
    ) {
      break;
    }
    waiting.splice(waiting.indexOf(one), 1);
    for (const url of fresh) {
      asking.add(url);
    }
    batch.push(one);
  }
  batch.sort((a, b) => (a.graph?.length ?? 0) - (b.graph?.length ?? 0));
  for (const one of batch) {
    const share = (one.graph ?? []).filter(
      (url) => !(kept.has(url) || flying.has(url))
    );
    fetching.set(one, share);
    unready.add(one);
    for (const url of share) {
      flying.add(url);
    }
    one.share = new Set(share);
    one.start(share);
  }
  readyNow();
};

/** The next turns given a task later: once every Preview mounting now has asked, or once the page has laid out what the last turn drew. */
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
  /** Its share arrived whole (core `CANVAS_EMBED_FETCHED`): those modules are the page's, and the budget they held is free. */
  fetched: () => void;
  /** Settles on its turn, with its share: the modules it fetches (core `CANVAS_EMBED_GO`). */
  granted: Promise<string[]>;
  /** Its graph as its page told it (core `CANVAS_EMBED_GRAPH`), each module's address; the first told counts, and a page that tells none answers `[]`. */
  graph: (urls: readonly string[]) => void;
  /** Settles once no module of its graph is fetched by another, with the rest of its graph: it loads them and draws (core `CANVAS_EMBED_READY`). */
  ready: Promise<string[]>;
}

/** A place in the page's queue of embeds, for the picture standing at `place`; `alone` for a whole screen, which tells no graph and takes its turn alone. */
export function embedTurn(
  place: () => Element | null | undefined,
  alone = false
): EmbedTurn {
  let state: "waiting" | "fetching" | "done" = "waiting";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tellReady: (rest: string[]) => void = () => undefined;
  const ready = new Promise<string[]>((resolve) => {
    tellReady = resolve;
  });
  const asked: Asked = {
    alone,
    graph: null,
    place,
    share: new Set(),
    ready: (rest) => tellReady(rest),
    start: () => undefined,
  };
  /** Its share no longer held: arrived (`kept`), or let go for whoever needs it to fetch itself. */
  const letGo = (arrived: boolean) => {
    clearTimeout(timer);
    for (const url of fetching.get(asked) ?? []) {
      flying.delete(url);
      if (arrived) {
        kept.add(url);
      }
    }
    fetching.delete(asked);
    readyNow();
    // A task later: the page laid out again by then, the nearest is judged where the pictures now stand.
    soon();
  };
  const done = () => {
    if (state === "fetching" && fetching.has(asked)) {
      letGo(false);
    } else if (state === "waiting") {
      const at = waiting.indexOf(asked);
      if (at >= 0) {
        waiting.splice(at, 1);
      }
      // It may have held those after it, its graph untold.
      soon();
    }
    unready.delete(asked);
    state = "done";
  };
  const fetched = () => {
    if (state === "fetching" && fetching.has(asked)) {
      letGo(true);
    }
  };
  const graph = (urls: readonly string[]) => {
    if (asked.graph !== null) {
      return;
    }
    asked.graph = urls;
    if (state === "waiting") {
      soon();
    }
  };
  const granted = new Promise<string[]>((resolve) => {
    asked.start = (share) => {
      state = "fetching";
      timer = setTimeout(() => {
        if (fetching.has(asked)) {
          letGo(false);
        }
      }, TURN_MS);
      resolve(share);
    };
  });
  waiting.push(asked);
  soon();
  return { done, fetched, graph, granted, ready };
}
