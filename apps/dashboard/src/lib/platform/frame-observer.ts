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
 * `readInFrame()` asks for them in the delivery of the frame about to be
 * drawn instead (from its callbacks, or a task before it): a run that
 * moves each frame (a hang's glide or growth) draws from the layout that
 * frame does, and paints in it. Measured in the callback itself, before
 * that layout, each frame laid the page out ahead of it under everything
 * else animating (a tab switch's hang card: ~48 forced passes a switch,
 * 60ms at 29 tabs). Once that delivery has passed (inside it, or in the
 * microtasks after it), it says so and asks for nothing: the frame's
 * layout is done there, and what is drawn then is read then.
 *
 * `readNext()` asks for `read` and `inside` in the next frame's delivery
 * with nothing resized, then the answer in the frame after: a change no
 * box's size reports (a tab moved, not resized; a row's `top` written, a
 * style turned) is measured on the layout that frame does. Measured in a
 * frame callback instead, it laid the page out ahead of that layout, under
 * what the frame had just changed (decision-pages (o): fluid-tabs `rects`'
 * `offsetParent`, a reply arriving on the phone at 4x; the highlight's
 * realign, ten 10ms layouts in twenty seconds of a page at rest). The
 * page's root is observed again for it, so a delivery comes.
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
 *
 * A target that leaves the page is let go of (`unobserve`, or
 * `observeChildren`'s own) in the task that takes it out. Held, it reports
 * its new size, nothing, at the depth of a box with no parent: shallower
 * than every box a delivery reaches. Taken out in the flush after a
 * delivery (Svelte's, a microtask), that report came after the delivery
 * had passed every depth, and both engines held it back as "ResizeObserver
 * loop completed with undelivered notifications"; and `holds` kept the box,
 * with all it holds, for as long as the site lived (fade-runs' scroller
 * parts, for the page's life).
 */
export interface FrameObserver {
  disconnect: () => void;
  /**
   * A target observed, held or not, reports its size in the next delivery
   * as a first report, changed or not (what `deliverWithRoot` and a row
   * observed again to be read rely on). So an answer that observes a target
   * it already holds asks for its own next answer, every frame: a target is
   * observed as it comes (PreviewTools' groups, observed again from its
   * answer: a frame loop at rest, nightly 8296).
   */
  observe: (target: Element, options?: ResizeObserverOptions) => void;
  /**
   * `parent`'s element children observed: those it holds now and each one
   * put in later, each let go of in the mutation that takes it out (a
   * MutationObserver's callback, in the microtask checkpoint that took it
   * out, before the next delivery is gathered). Hands back its stop, which
   * lets go of the children it holds then; `disconnect` stops it too.
   */
  observeChildren: (
    parent: Element,
    options?: ResizeObserverOptions
  ) => () => void;
  /**
   * `read` and `inside` in the delivery of the frame about to be drawn, on
   * its layout, with nothing resized: true when asked before it (the frame's
   * callbacks, or a task between frames), as the root reports in that
   * delivery. False, asking nothing, once the frame's delivery has passed
   * (inside it, or the microtasks after): the root's report would come at a
   * depth the frame had already passed, and be held back as a loop.
   */
  readInFrame: () => boolean;
  /** `read` and `inside` in the next frame's delivery, on that frame's layout, then the answer in the frame after, with nothing resized. */
  readNext: () => void;
  /** The answer in the next frame, with nothing resized (`changed` empty unless something also was). */
  request: () => void;
  unobserve: (target: Element) => void;
}

/**
 * An element's size, as a Svelte attachment: `measure` reads it and `take`
 * writes what it read into state. Both run as the element mounts, so the
 * first frame painted is laid out from it. After each resize `measure`
 * reads inside the delivery, on the layout the frame has just done, which
 * costs no layout of its own, and `take` writes in the next frame
 * (frameObserver `read`). The dashboard's one way to hold a box's size in
 * state: Svelte's dimension bindings (`bind:clientWidth` and its kin, lint:
 * none stands unexempted) are ResizeObservers that write inside the
 * delivery, and WebKit reported "ResizeObserver loop completed with
 * undelivered notifications" when what they wrote laid the page out again
 * (PaneTabs' card height, c4313c3d8). Read in the next frame's callbacks
 * instead, beside the other sites' writes, a pane's width laid the page out
 * on every frame of a rail drag (conversation-frames: 80 forced style
 * passes, 950ms at 4x).
 *
 * `measure` only reads the element; `take` only writes state. Both are
 * untracked as the element mounts, so nothing they read re-runs the
 * attachment.
 *
 * An element mounted where nobody sees it (under `data-offscreen`: a pane
 * not shown, a kept sheet at rest) is not measured
 * as it mounts: no frame of it is painted, and the read laid the page out in
 * the task that mounted it, 15-31ms at 4x CPU for each conversation the
 * background built in its first seconds (Split's width, the transcript's
 * dock room: sidebar-lab settle). Its first size comes with the next
 * delivery, as every later one does.
 */
export function frameSize<T extends Element, V>(
  measure: (node: T) => V,
  take: (value: V) => void
): Attachment<T> {
  return (node) => {
    if (!node.closest("[data-offscreen]")) {
      untrack(() => take(measure(node)));
    }
    let measured: { value: V } | null = null;
    const sized = frameObserver(
      () => {
        if (measured) {
          const { value } = measured;
          measured = null;
          take(value);
        }
      },
      {
        read: () => {
          measured = { value: measure(node) };
        },
      }
    );
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

/** The sites that asked to read in the next delivery whatever resized (`readNext`). */
const askedToRead = new Set<Site>();
/** A frame callback is asked for that has the root report in that frame's delivery (`readNext`). */
let rootAsked = false;

/**
 * `site` reads in the next delivery the root reports in. The root is asked
 * to report from the next frame's callbacks, so that frame has a delivery
 * even with nothing resized: asked from inside a delivery, or from the
 * microtask after one, the root's report would come at a depth the frame
 * had already passed, and be held back as a loop. Only a delivery with the
 * root in it takes the site: there every box is deeper than what was
 * delivered, so what the site writes or starts observing is delivered again
 * in the same frame.
 */
const readInNextDelivery = (site: Site) => {
  askedToRead.add(site);
  if (rootAsked) {
    return;
  }
  rootAsked = true;
  requestAnimationFrame(() => {
    rootAsked = false;
    if (askedToRead.size > 0) {
      deliverWithRoot();
    }
  });
};

/**
 * Whether a delivery has come in this frame's rendering, whose later rounds
 * reach only boxes deeper than it reached: from the delivery until the
 * frame is drawn. A frame is drawn in one task, and its timeline's time is
 * set as it starts and holds until the next starts (Web Animations, "update
 * animations and send events"), so a call made with the time the delivery
 * came at (the delivery's own callbacks, the microtasks after it) is in its
 * rendering; a new frame's callbacks see a new time. A task after the frame
 * ends it too: the platform scheduler's at its highest priority
 * (`user-blocking`), so it runs ahead of a timer a frame callback queued
 * (PaneTabs' move of the session card, `moveTask`); with no scheduler
 * (Safari), a message, which a timer can come before, and that timer reads
 * as still in the rendering.
 */
let deliveredAt: number | null = null;
const frameTime = () => Number(document.timeline.currentTime ?? 0);
const rendering = () => deliveredAt !== null && frameTime() === deliveredAt;
let frameDone: MessageChannel | null = null;
const frameDrawn = () => {
  deliveredAt = null;
};
/** A delivery came: in its frame's rendering until the frame is drawn. */
const delivered = () => {
  const already = deliveredAt !== null;
  deliveredAt = frameTime();
  if (already) {
    return;
  }
  // The DOM's types say every window has a scheduler; Safari's has none.
  if (typeof scheduler !== "undefined") {
    scheduler
      .postTask(frameDrawn, { priority: "user-blocking" })
      .catch(frameDrawn);
    return;
  }
  if (!frameDone) {
    frameDone = new MessageChannel();
    frameDone.port1.onmessage = frameDrawn;
  }
  frameDone.port2.postMessage(null);
};

const deliver = (entries: ResizeObserverEntry[]) => {
  delivered();
  const sites = [...sitesOf(entries)];
  const asked: Site[] = [];
  if (entries.some((entry) => entry.target === document.documentElement)) {
    for (const site of askedToRead) {
      asked.push(site);
      if (!sites.includes(site)) {
        sites.push(site);
      }
    }
    askedToRead.clear();
  }
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
  if (!Native) {
    throw new TypeError("ResizeObserver is not available");
  }
  shared ??= new Native(deliver);
  return shared;
};

/**
 * Subtrees the engine skips (`content-visibility: hidden`: a pane put away,
 * a kept sheet at rest), whose targets the shared observer lets go of while
 * they are skipped ({@link skipObserved}).
 */
const skipped = new Set<Element>();

/** Whether `target` stands in a skipped subtree. */
const isSkipped = (target: Element) => {
  if (skipped.size === 0) {
    return false;
  }
  for (let at: Element | null = target; at; at = at.parentElement) {
    if (skipped.has(at)) {
      return true;
    }
  }
  return false;
};

/** Observes `target` for its holds, on the border box if any asks for it: a new hold's first report comes in the next delivery. Skipped, its holds wait for it to be shown. */
const observeFor = (target: Element) => {
  const boxes = [...(holds.get(target)?.values() ?? [])].map(
    (hold) => hold.box
  );
  const observer = sharedObserver();
  observer.unobserve(target);
  if (isSkipped(target)) {
    return;
  }
  observer.observe(target, {
    box: boxes.includes("border-box") ? "border-box" : "content-box",
  });
};

/**
 * `root`'s subtree is skipped (`content-visibility: hidden`) until the
 * returned function is called: the shared observer lets go of every target
 * in it, and of any observed there meanwhile, and observes them again as it
 * is shown. Each site keeps its holds and the size it last heard, so it
 * hears a target again only if the size it is shown at differs.
 *
 * Chromium reports nothing from a skipped subtree, but still visits each of
 * its observations every frame, and one whose size differs from the last it
 * reported (a row mounted in a pane put away, never laid out) is held back
 * without that size being kept: "Skip resize observations on locked
 * elements", `IsInLockedSubtreeCrossingFrames` returning false before the
 * size is taken (resize_observation.cc `ObservationSizeOutOfSync`), an
 * ancestor walk for each such target, every frame. A 29-tab layout's panes put away held 773 of the observer's 1,236
 * targets: `NotifyResizeObservers` took 37ms of a switch window's main
 * thread against 3ms with two tabs, and 9ms once they were let go.
 */
export function skipObserved(root: Element): () => void {
  skipped.add(root);
  for (const target of holds.keys()) {
    if (root.contains(target)) {
      shared?.unobserve(target);
    }
  }
  return () => {
    skipped.delete(root);
    for (const target of holds.keys()) {
      if (root.contains(target)) {
        observeFor(target);
      }
    }
  };
}

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
    has: (target: Element) => mine.has(target),
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

/** The scrollers that take their rows' height (`sizesToContent`). */
const growing = new WeakSet<Element>();

/**
 * Attachment for a virtual list's scroller that is as tall as its rows, up
 * to its cap (find's places, the composer's layer: the layer and the
 * composer grow with it). Every box it stands in that an observer watches
 * is shallower than its rows, and a row's report resizes them: virtua writes
 * a row's measured height inside the delivery, the list grows in the flush
 * after it, and so do they. A ResizeObserver delivers only boxes deeper than
 * the shallowest one its last round delivered, so they were held back as
 * "ResizeObserver loop completed with undelivered notifications": at every
 * load of find, the rows mounting in the flush after the delivery that
 * measured the list's viewport, their first report a round later.
 *
 * So each row a library's observer (`ForeignResizeObserver`) starts
 * observing inside it is observed with the page's root, whose report comes
 * in the same round (`deliverWithRoot`): every box is deeper than the root,
 * so what the row's report resizes is delivered in that frame. A row
 * observed after a delivery, while the frame's rounds go on, waits for the
 * next frame's callbacks: the root asked for there reports in the frame's
 * first round (`readInNextDelivery`), where asked now it would come in a
 * round already past its depth. That row is measured, and drawn, a frame
 * later. It is virtua's own rule for a row observed inside its callback
 * (driver.ts `createResizeObserver`: one the delivery's targets do not hold
 * waits for the next frame, after the spec's depth rule, w3.org/TR/
 * resize-observer/#deliver-resize-error), taken to the flush after the
 * delivery, where Svelte mounts the rows, and to what the rows resize.
 *
 * A list whose scroller is as tall as its box (the transcript's) is not one
 * of these: its rows resize nothing shallower, and are measured in the
 * frame they mount. Deferred for every list, the transcript's rows landed
 * elsewhere at load, and a touch scroll painted a 3px strip with no rows
 * for two frames.
 */
export const sizesToContent: Attachment<HTMLElement> = (node) => {
  growing.add(node);
  return () => {
    growing.delete(node);
  };
};

/** Whether `target` stands inside a scroller that takes its rows' height (`sizesToContent`). */
const insideGrowing = (target: Element): boolean => {
  for (let box = target.parentElement; box; box = box.parentElement) {
    if (growing.has(box)) {
      return true;
    }
  }
  return false;
};

/**
 * Every other ResizeObserver on the page (a library's: virtua's lists),
 * delivered by the shared one: its callback runs once every site has read
 * and before any site writes, so what it reads (virtua's `offsetParent`, on
 * each row it hears) is the layout the frame has just done. Its own
 * observer, a callback of its own after the shared one's, read it after the
 * sites' writes, and laid the page out again for it.
 *
 * A target inside a scroller that takes its rows' height is observed with
 * the root (`sizesToContent`).
 */
class ForeignResizeObserver {
  readonly #holds: ReturnType<typeof holdsOf>;
  /** Rows observed after a delivery in this frame, observed in the next frame's callbacks. */
  readonly #later = new Map<Element, ResizeObserverOptions | undefined>();
  #frame = 0;

  constructor(callback: ResizeObserverCallback) {
    const site: Site = {
      delivered: [],
      foreign: (entries) => callback(entries, this),
      options: {},
      reported: new WeakSet(),
      take: () => undefined,
    };
    this.#holds = holdsOf(site);
  }

  observe(target: Element, options?: ResizeObserverOptions): void {
    if (!insideGrowing(target)) {
      this.#holds.observe(target, options);
      return;
    }
    if (!rendering()) {
      this.#holds.observe(target, options);
      deliverWithRoot();
      return;
    }
    this.#later.set(target, options);
    this.#frame ||= requestAnimationFrame(() => {
      this.#frame = 0;
      for (const [row, how] of this.#later) {
        if (row.isConnected) {
          this.#holds.observe(row, how);
        }
      }
      this.#later.clear();
      deliverWithRoot();
    });
  }

  unobserve(target: Element): void {
    this.#later.delete(target);
    this.#holds.release(target);
  }

  disconnect(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#later.clear();
    this.#holds.releaseAll();
  }
}

/**
 * Reading this module makes the window's own ResizeObserver the shared
 * observer's (`ForeignResizeObserver`), wherever it is read. Each page's
 * client entry imports it first, so it is in place before any other module
 * can make one.
 */
if (Native && typeof window !== "undefined") {
  window.ResizeObserver = ForeignResizeObserver;
}

/**
 * The sites whose answer is due in the next frame, each by the call that
 * gives it, in the order they asked. One frame callback answers them all:
 * a callback a site, a rail drag that resized forty observed boxes asked
 * for forty callbacks every frame (the owner's trace of nightly 7148: 1,702
 * of them in 6.9s).
 */
const due = new Map<object, () => void>();
let dueFrame = 0;

const answerDue = () => {
  dueFrame = 0;
  const now = [...due.values()];
  due.clear();
  // One site's failure is reported as its own and answers the rest, as
  // when each answer was a frame callback of its own.
  for (const answer of now) {
    try {
      answer();
    } catch (error) {
      reportError(error);
    }
  }
};

/**
 * `answer` null: a site that does all it does inside the delivery
 * (`inside`), with no answer in the next frame.
 */
export function frameObserver(
  answer: ((changed: Element[]) => void) | null,
  options: Inside = {}
): FrameObserver {
  const changed = new Set<Element>();
  const me = {};
  const respond = () => {
    const targets = [...changed];
    changed.clear();
    answer?.(targets);
  };
  const request = () => {
    if (answer && !due.has(me)) {
      due.set(me, respond);
      if (dueFrame === 0) {
        dueFrame = requestAnimationFrame(answerDue);
      }
    }
  };
  const site: Site = {
    ask: request,
    delivered: [],
    options,
    reported: new WeakSet(),
    take: (entry) => {
      if (answer) {
        changed.add(entry.target);
        request();
      }
    },
  };
  const held = holdsOf(site);
  const unobserve = (target: Element) => {
    held.release(target);
    changed.delete(target);
  };
  /** Each `observeChildren` still standing, by its stop. */
  const parents = new Set<() => void>();
  const observeChildren = (
    parent: Element,
    how?: ResizeObserverOptions
  ): (() => void) => {
    const take = (child: Element) => {
      if (!held.has(child)) {
        held.observe(child, how);
      }
    };
    const went = (record: MutationRecord) => {
      for (const gone of record.removedNodes) {
        if (gone instanceof Element && gone.parentNode !== parent) {
          unobserve(gone);
        }
      }
    };
    const came = (record: MutationRecord) => {
      for (const come of record.addedNodes) {
        if (come instanceof Element && come.parentNode === parent) {
          take(come);
        }
      }
    };
    const heard = (records: MutationRecord[]) => {
      for (const record of records) {
        went(record);
        came(record);
      }
    };
    const kids = new MutationObserver(heard);
    kids.observe(parent, { childList: true });
    for (const child of parent.children) {
      take(child);
    }
    const stop = () => {
      if (!parents.delete(stop)) {
        return;
      }
      heard(kids.takeRecords());
      kids.disconnect();
      for (const child of parent.children) {
        unobserve(child);
      }
    };
    parents.add(stop);
    return stop;
  };
  return {
    observe: held.observe,
    observeChildren,
    readInFrame: () => {
      if (rendering()) {
        return false;
      }
      askedToRead.add(site);
      deliverWithRoot();
      return true;
    },
    readNext: () => readInNextDelivery(site),
    request,
    unobserve,
    disconnect: () => {
      for (const stop of [...parents]) {
        stop();
      }
      due.delete(me);
      held.releaseAll();
      changed.clear();
      askedToRead.delete(site);
    },
  };
}
