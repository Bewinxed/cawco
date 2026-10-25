import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";

/**
 * A ResizeObserver whose answer comes in the next frame's callbacks
 * (`requestAnimationFrame`): once, however many deliveries came before it,
 * with every target that changed since. The dashboard's one way to hear a
 * size change (lint: `new ResizeObserver` stands nowhere else unexempted).
 *
 * What an observer writes from its answer (state a template lays out, a
 * style) changes the layout. Written inside the delivery, it resized boxes
 * at a depth the delivery had already passed, and Chromium held their
 * notifications back and reported "ResizeObserver loop completed with
 * undelivered notifications" (the hub's dashboard errors). Written in the
 * next frame's callbacks, it lands before that frame's layout, and that
 * layout reports what it changed, once.
 *
 * A box's size as it mounts is read by its own code, synchronously, so the
 * first frame painted is laid out from it: only the changes after that wait
 * for the frame.
 *
 * `read`, when given, runs inside the delivery itself and only reads: the
 * layout there is the one the frame has just done, so a measure taken
 * there costs no layout of its own (fluid-tabs `rects`: measured in the next
 * frame instead, a streamed reply laid the page out again for each). What
 * it measured is written by `answer`, in the next frame.
 *
 * `request()` asks for the answer in the next frame with nothing resized:
 * the other things a site hears (a scroll, rows arriving, the window) share
 * its one frame.
 *
 * `readNext()` asks for `read` in the next delivery with nothing resized,
 * then the answer: a change no box's size reports (a tab moved, not
 * resized) is measured on the layout that frame does. Measured in a frame
 * callback instead, it laid the page out ahead of that layout, under what
 * the frame had just changed (decision-pages (o): fluid-tabs `rects`'
 * `offsetParent`, a reply arriving on the phone at 4x). The page's root is
 * observed again for it, so a delivery comes.
 *
 * `first`, when given, takes a target's first report inside the delivery
 * itself, for a box mounting: the frame it mounts in has laid it out and not
 * painted, so what it reads there costs no layout of its own, and what it
 * writes is in that frame's paint. Read as it mounted instead, in the effect
 * that mounted it, every measure laid the page out again between the writes
 * of the same flush (a turn's Working tab arriving in the rail: its folder
 * tabs, its list's pill, a dozen layouts in one frame). It writes only what
 * resizes no box an observer watches (an overlay drawn inside the box, an
 * absolute layer under its rows), so the delivery has nothing left to report.
 * Every first report of one delivery comes in one call, so a site that
 * observes many boxes with one observer reads them all before it writes
 * any. A target it took is not answered again for that report. It reads,
 * and answers what it writes: every site's `read` and `first` run before
 * any of those writes (the shared observer, below).
 */
export interface FrameObserver {
  disconnect: () => void;
  observe: (target: Element, options?: ResizeObserverOptions) => void;
  /** `read` in the next delivery, on that frame's layout, then the answer in the frame after, with nothing resized. */
  readNext: () => void;
  /** The answer in the next frame, with nothing resized (`changed` empty unless something also was). */
  request: () => void;
  unobserve: (target: Element) => void;
}

/**
 * An element's size, as a Svelte attachment: `take` reads it as the element
 * mounts, so the first frame painted is laid out from it, and again in the
 * next frame after each resize (frameObserver). The dashboard's one way to
 * hold a box's size in state: Svelte's dimension bindings (`bind:clientWidth`
 * and its kin, lint: none stands unexempted) are ResizeObservers that write
 * inside the delivery, and WebKit reported "ResizeObserver loop completed
 * with undelivered notifications" when what they wrote laid the page out
 * again (PaneTabs' card height, c4313c3d8).
 *
 * `take` only reads the element and writes state: its first read is
 * untracked, so nothing it reads re-runs the attachment.
 */
export function frameSize<T extends Element>(
  take: (node: T) => void
): Attachment<T> {
  return (node) => {
    untrack(() => take(node));
    const sized = frameObserver(() => take(node));
    sized.observe(node);
    return () => sized.disconnect();
  };
}

/** A site's options: what it does inside a delivery. */
interface Inside {
  /**
   * Targets' first reports, inside the delivery, all of one delivery
   * together: their mounts' measures and what they draw from them. What it
   * answers runs after every site's `first` has: a site that reads here
   * answers its writes, so no site's write lays the page out under another
   * site's read.
   */
  first?: (entries: readonly ResizeObserverEntry[]) => (() => void) | undefined;
  /**
   * Every report of the delivery, first or not, alongside the sites'
   * `first`: what it reads on the layout the frame has just done, and the
   * writes it answers, run with theirs. A site that writes boxes other
   * observers watch asks the root to report in the same delivery
   * (`deliverWithRoot`), so what its writes resize is delivered again in
   * that frame rather than held back.
   */
  inside?: (
    entries: readonly ResizeObserverEntry[]
  ) => (() => void) | undefined;
  /** Inside the delivery, reading only: what `answer` writes in the next frame. */
  read?: (entries: readonly ResizeObserverEntry[]) => void;
}

/** One site: a frameObserver's own state, or another observer's (`ForeignResizeObserver`). */
interface Site {
  /** Asks for its answer in the next frame (`request`): after a read it asked for (`readNext`). */
  ask?: () => void;
  /** Its targets in this delivery, from the shared observer. */
  delivered: ResizeObserverEntry[];
  /** Another ResizeObserver's callback (a library's): called with its entries once the sites have read, before their writes. */
  foreign?: (entries: ResizeObserverEntry[]) => void;
  options: Inside;
  /** Targets whose first report has come (`first`). */
  reported: WeakSet<Element>;
  /** Takes its targets' entries of a delivery that are not first reports (`changed`, then the next frame's answer). */
  take: (entry: ResizeObserverEntry) => void;
}

/** A site's hold on a target: the box it observes, and the size it last heard. */
interface Hold {
  box: ResizeObserverBoxOptions;
  heard: string | null;
}

/** Every target observed, and each site's hold on it. */
const holds = new Map<Element, Map<Site, Hold>>();

/** The sites that asked to read in the next delivery (`readNext`). */
const wanting = new Set<Site>();

/** The size of `box` an entry reports, as one string. */
const sizeOf = (entry: ResizeObserverEntry, box: ResizeObserverBoxOptions) => {
  const [size] =
    box === "border-box" ? entry.borderBoxSize : entry.contentBoxSize;
  return `${size?.inlineSize ?? 0}x${size?.blockSize ?? 0}`;
};

/**
 * The one ResizeObserver every site shares. A delivery is read whole before
 * anything is written: every site's `read`, then every site's `first` and
 * `inside`, then every other observer's callback (`ForeignResizeObserver`),
 * then the writes the sites answered; Svelte's flush, a microtask, comes
 * after the delivery. A ResizeObserver of each site's own was its own
 * callback, and the microtask checkpoint after each ran Svelte's flush
 * there: one site's `first` (a session row's trail, a pill) laid the page out
 * under the next site's `read`, inside the same delivery (fluid-tabs `rects`,
 * 2x 121ms of style in a reply's frame at 4x, decision-pages (o)), and under
 * virtua's own observer's `offsetParent` (20–31ms of style the same frame).
 *
 * A target several sites observe is observed once, on the border box if any
 * of them asked for it: each site hears an entry only when its own box's
 * size differs from the one it heard last (a new hold has heard none).
 */
// biome-ignore lint/style/noRestrictedGlobals: the type of the one ResizeObserver the rule allows
type Shared = ResizeObserver;
let shared: Shared | null = null;
/** The platform's ResizeObserver constructor's type. */
type NativeClass = typeof globalThis.ResizeObserver;
/** The page's own ResizeObserver, as the browser made it: the shared observer's (`ForeignResizeObserver` stands in its place on the window). */
const Native: NativeClass | undefined = globalThis.ResizeObserver;

/** The sites a delivery reports to, each with its own entries (`delivered`): those whose own box's size changed. */
const sitesOf = (entries: ResizeObserverEntry[]): Set<Site> => {
  const sites = new Set<Site>();
  for (const entry of entries) {
    for (const [site, hold] of holds.get(entry.target) ?? []) {
      const heard = sizeOf(entry, hold.box);
      if (heard !== hold.heard) {
        hold.heard = heard;
        site.delivered.push(entry);
        sites.add(site);
      }
    }
  }
  return sites;
};

/** A site's first reports of a delivery; the rest go to its next frame's answer. */
const firstsOf = (site: Site): ResizeObserverEntry[] => {
  const firsts: ResizeObserverEntry[] = [];
  for (const entry of site.delivered) {
    if (site.options.first && !site.reported.has(entry.target)) {
      firsts.push(entry);
    } else {
      site.take(entry);
    }
    site.reported.add(entry.target);
  }
  return firsts;
};

/** A site's reads in the delivery's second step (`first`, `inside`), and the writes they answered. */
const readInside = (site: Site, writes: (() => void)[]) => {
  const all = site.delivered;
  const firsts = firstsOf(site);
  for (const write of [
    firsts.length > 0 ? site.options.first?.(firsts) : undefined,
    site.options.inside?.(all),
  ]) {
    if (write) {
      writes.push(write);
    }
  }
};

const deliver = (entries: ResizeObserverEntry[]) => {
  const reported = sitesOf(entries);
  const asked = [...wanting];
  wanting.clear();
  const sites = [...new Set([...reported, ...asked])];
  const own = sites.filter((site) => !site.foreign);
  for (const site of own) {
    site.options.read?.(site.delivered);
  }
  for (const site of asked) {
    site.ask?.();
  }
  const writes: (() => void)[] = [];
  for (const site of own) {
    readInside(site, writes);
    site.delivered = [];
  }
  for (const site of sites) {
    if (site.foreign) {
      const mine = site.delivered;
      site.delivered = [];
      site.foreign(mine);
    }
  }
  for (const write of writes) {
    write();
  }
};

const sharedObserver = (): Shared => {
  shared ??= new (Native as NativeClass)(deliver);
  return shared;
};

/** Observes `target` for its holds, on the border box if any asks for it: a new hold's first report comes in the next delivery. */
const observeFor = (target: Element) => {
  const boxes = [...(holds.get(target)?.values() ?? [])].map(
    (hold) => hold.box
  );
  const observer = sharedObserver();
  observer.unobserve(target);
  observer.observe(target, {
    box: boxes.includes("border-box") ? "border-box" : "content-box",
  });
};

/** A site's holds: observe, let go, let go of all. */
const holdsOf = (site: Site) => {
  const mine = new Set<Element>();
  const release = (target: Element) => {
    const held = holds.get(target);
    held?.delete(site);
    if (held?.size === 0) {
      holds.delete(target);
      shared?.unobserve(target);
    }
    mine.delete(target);
  };
  return {
    observe: (target: Element, how?: ResizeObserverOptions) => {
      let held = holds.get(target);
      if (!held) {
        held = new Map();
        holds.set(target, held);
      }
      held.set(site, { box: how?.box ?? "content-box", heard: null });
      mine.add(target);
      observeFor(target);
    },
    release,
    releaseAll: () => {
      for (const target of [...mine]) {
        release(target);
      }
    },
  };
};

/** The root's hold (`deliverWithRoot`): heard by no site. */
const rootSite: Site = {
  delivered: [],
  options: {},
  reported: new WeakSet(),
  take: () => undefined,
};
const rootHold = holdsOf(rootSite);

/**
 * The page's root reports in the next delivery. A frame's ResizeObservers
 * deliver only boxes deeper than the shallowest one they have delivered, and
 * a box resized after its depth was delivered is held back ("ResizeObserver
 * loop completed with undelivered notifications"). With the root delivered,
 * every box a site's writes resize there (motion/rows' edges, under a virtua
 * row that holds them) is deeper, and is delivered again in the same frame.
 */
export function deliverWithRoot(): void {
  rootHold.observe(document.documentElement);
}

/**
 * Every other ResizeObserver on the page (a library's: virtua's lists),
 * delivered by the shared one: its callback runs once every site has read
 * and before any site writes, so what it reads (virtua's `offsetParent`, on
 * each row it hears) is the layout the frame has just done. Its own
 * observer, a callback of its own after the shared one's, read it after the
 * sites' writes, and laid the page out again for it.
 */
class ForeignResizeObserver {
  readonly #holds: ReturnType<typeof holdsOf>;

  constructor(callback: ResizeObserverCallback) {
    const site: Site = {
      delivered: [],
      foreign: (entries) => callback(entries, this as unknown as Shared),
      options: {},
      reported: new WeakSet(),
      take: () => undefined,
    };
    this.#holds = holdsOf(site);
  }

  observe(target: Element, options?: ResizeObserverOptions): void {
    this.#holds.observe(target, options);
  }

  unobserve(target: Element): void {
    this.#holds.release(target);
  }

  disconnect(): void {
    this.#holds.releaseAll();
  }
}

if (Native && typeof window !== "undefined") {
  window.ResizeObserver = ForeignResizeObserver as unknown as NativeClass;
}

export function frameObserver(
  answer: (changed: Element[]) => void,
  options: Inside = {}
): FrameObserver {
  let frame = 0;
  const changed = new Set<Element>();
  const request = () => {
    if (frame === 0) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        const targets = [...changed];
        changed.clear();
        answer(targets);
      });
    }
  };
  const site: Site = {
    ask: request,
    delivered: [],
    options,
    reported: new WeakSet(),
    take: (entry) => {
      changed.add(entry.target);
      request();
    },
  };
  const held = holdsOf(site);
  return {
    observe: held.observe,
    readNext: () => {
      wanting.add(site);
      deliverWithRoot();
    },
    request,
    unobserve: (target) => {
      held.release(target);
      changed.delete(target);
    },
    disconnect: () => {
      cancelAnimationFrame(frame);
      frame = 0;
      wanting.delete(site);
      held.releaseAll();
      changed.clear();
    },
  };
}
