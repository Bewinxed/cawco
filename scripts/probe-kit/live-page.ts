/**
 * What live-perf (specs/live-perf.ts) runs inside the dashboard's page: one
 * watcher installed before the page's own scripts (`installPerf`), and the
 * readers and drivers it is asked through (`window.__perf`). Each function
 * here is serialized into the page as it is, none of this module's scope
 * with it, so the same text runs under the kit's Playwright and through any
 * DevTools client that evaluates a function in a page.
 *
 * The watcher keeps, from the engine's own observers:
 *  - every long animation frame (`long-animation-frame`, 50 ms and over):
 *    its blocking time, its rendering and its style-and-layout share, and
 *    each script that ran in it with what invoked it, its source position
 *    and the style and layout it forced;
 *  - every long task, every interaction's event timing (an `interactionId`
 *    event over 16 ms: its input delay, processing and presentation), and
 *    every layout shift;
 *  - while `frames` is on, each frame's timestamp, and after its paint (a
 *    task behind the frame's `requestAnimationFrame`) the transcript's
 *    scroll offset and the row nearest the middle of its view with where it
 *    stands, so a jump of the reading position is read off what was drawn;
 *  - while `mutations` is on, the DOM's changes by the region they landed
 *    in (rail, tab strip, transcript, panel, …);
 *  - every message off the page's WebSockets, by its `kind`, with its size.
 */

/** One script a long animation frame ran (PerformanceScriptTiming). */
export interface LoafScript {
  fn: string;
  /** Style and layout this script forced, ms. */
  forced: number;
  invoker: string;
  ms: number;
  pos: number;
  type: string;
  url: string;
}

/** One long animation frame. */
export interface Loaf {
  at: number;
  blocking: number;
  ms: number;
  /** From the frame's rendering start to its end, ms. */
  render: number;
  scripts: LoafScript[];
  /** From the frame's style and layout start to its end, ms. */
  styleLayout: number;
}

export interface Interaction {
  at: number;
  id: number;
  input: number;
  ms: number;
  name: string;
  present: number;
  processing: number;
  target: string;
}

/** One painted frame while `frames` is on. */
export interface Painted {
  /** The row nearest the view's middle: its key and its top in the view, px. */
  anchor: string | null;
  /** How far the driver's own scrolls moved the view since the frame before, px (negative: up). */
  driven: number;
  rows: number;
  t: number;
  top: number;
  /** Where the frame before's anchor row stands in this frame's view, px: the reading position's own move. */
  was: number | null;
  y: number | null;
}

export interface PerfState {
  /** Set as a scroll journey (`journey`) ends. */
  done?: boolean;
  events: Interaction[];
  frames: boolean;
  loaf: Loaf[];
  long: [number, number][];
  /** DOM changes while `mutations` is on, by region: added, removed, attributes, text. */
  mutated: Record<string, [number, number, number, number]>;
  mutations: boolean;
  painted: Painted[];
  pendingDrive: number;
  /** A scroll journey's steps: each its name, its span on the page's clock, how far it moved the view. */
  phases?: [string, number, number, number][];
  rafs: number[];
  shifts: [number, number][];
  /**
   * Socket messages by kind, from `since`: count, characters, and the
   * page's handler's time on each (with the microtasks it set off: the
   * store's flush), all told and the longest. Work it put off to a later
   * task (a part read in a later turn, a frame callback) is not in it.
   */
  ws: {
    kinds: Record<string, [number, number, number, number]>;
    since: number;
  };
}

/** The watcher: an init script, or evaluated into a running page (it then sees what it missed only through buffered entries). */
export function installPerf(): string {
  const w = window as unknown as { __perf?: PerfState };
  if (w.__perf) {
    return "installed already";
  }
  const p: PerfState = {
    events: [],
    frames: false,
    loaf: [],
    long: [],
    mutated: {},
    mutations: false,
    painted: [],
    pendingDrive: 0,
    rafs: [],
    shifts: [],
    ws: { kinds: {}, since: performance.now() },
  };
  w.__perf = p;
  const observe = (
    options: PerformanceObserverInit,
    each: (entry: PerformanceEntry) => void
  ) => {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          each(entry);
        }
      }).observe(options);
    } catch {
      // An engine without the entry type keeps nothing of it.
    }
  };
  interface ScriptTiming {
    duration: number;
    forcedStyleAndLayoutDuration: number;
    invoker: string;
    invokerType: string;
    sourceCharPosition: number;
    sourceFunctionName: string;
    sourceURL: string;
  }
  interface LoafEntry extends PerformanceEntry {
    blockingDuration: number;
    renderStart: number;
    scripts: ScriptTiming[];
    styleAndLayoutStart: number;
  }
  observe({ type: "long-animation-frame", buffered: true }, (entry) => {
    const e = entry as LoafEntry;
    const end = e.startTime + e.duration;
    p.loaf.push({
      at: e.startTime,
      ms: e.duration,
      blocking: e.blockingDuration,
      render: e.renderStart ? end - e.renderStart : 0,
      styleLayout: e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0,
      scripts: e.scripts.map((s) => ({
        ms: s.duration,
        forced: s.forcedStyleAndLayoutDuration,
        invoker: String(s.invoker).slice(0, 120),
        type: s.invokerType,
        url: s.sourceURL,
        fn: s.sourceFunctionName,
        pos: s.sourceCharPosition,
      })),
    });
    if (p.loaf.length > 4000) {
      p.loaf.splice(0, 1000);
    }
  });
  observe({ type: "longtask", buffered: true }, (e) => {
    p.long.push([e.startTime, e.duration]);
  });
  interface EventEntry extends PerformanceEntry {
    interactionId: number;
    processingEnd: number;
    processingStart: number;
    target: Node | null;
  }
  const describe = (node: Node | null): string => {
    if (!(node instanceof Element)) {
      return "";
    }
    const label =
      node.getAttribute("aria-label") ||
      node.closest("[role=tab]")?.getAttribute("aria-label") ||
      node.textContent?.trim().slice(0, 40) ||
      "";
    return `${node.tagName.toLowerCase()}${node.getAttribute("role") ? `[role=${node.getAttribute("role")}]` : ""} ${label.slice(0, 60)}`;
  };
  observe(
    {
      type: "event",
      buffered: true,
      durationThreshold: 16,
    } as PerformanceObserverInit,
    (entry) => {
      const e = entry as EventEntry;
      if (!e.interactionId) {
        return;
      }
      p.events.push({
        name: e.name,
        at: e.startTime,
        ms: e.duration,
        id: e.interactionId,
        input: e.processingStart - e.startTime,
        processing: e.processingEnd - e.processingStart,
        present: e.startTime + e.duration - e.processingEnd,
        target: describe(e.target),
      });
    }
  );
  interface ShiftEntry extends PerformanceEntry {
    hadRecentInput: boolean;
    value: number;
  }
  observe({ type: "layout-shift", buffered: true }, (entry) => {
    const e = entry as ShiftEntry;
    if (!e.hadRecentInput) {
      p.shifts.push([e.startTime, e.value]);
    }
  });
  // Where a DOM change landed: the nearest region a person would name.
  const REGIONS: [string, string][] = [
    ["[aria-label='Session transcript']", "transcript"],
    ["form[data-slot='cin']", "composer"],
    ["[role=tablist], header[role=banner], [role=banner]", "tab strip"],
    ["aside, [role=complementary]", "rail"],
    ["iframe", "frame"],
    ["[data-slot='preview'], [aria-label*='review' i]", "panel"],
    ["[role=dialog], [role=menu], [popover]", "overlay"],
    ["main", "main other"],
  ];
  const regionOf = (node: Node): string => {
    const el = node instanceof Element ? node : node.parentElement;
    if (!el) {
      return "detached";
    }
    for (const [selector, name] of REGIONS) {
      if (el.closest(selector)) {
        return name;
      }
    }
    // Elsewhere: named by the nearest box with a slot, a label or an id.
    const named = el.closest("[data-slot], [aria-label], [id]");
    if (!named) {
      return `other ${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ")[0]}`;
    }
    const slot = named.getAttribute("data-slot");
    if (slot) {
      return `other ${named.tagName.toLowerCase()}[data-slot=${slot}]`;
    }
    if (named.id) {
      return `other ${named.tagName.toLowerCase()}#${named.id}`;
    }
    return `other ${named.tagName.toLowerCase()}[aria-label=${named.getAttribute("aria-label")?.slice(0, 30)}]`;
  };
  const watchMutations = () => {
    new MutationObserver((records) => {
      if (!p.mutations) {
        return;
      }
      for (const r of records) {
        const region = regionOf(r.target);
        const row = p.mutated[region] ?? [0, 0, 0, 0];
        row[0] += r.addedNodes.length;
        row[1] += r.removedNodes.length;
        if (r.type === "attributes") {
          row[2] += 1;
        } else if (r.type === "characterData") {
          row[3] += 1;
        }
        p.mutated[region] = row;
      }
    }).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  };
  if (document.documentElement) {
    watchMutations();
  } else {
    addEventListener("DOMContentLoaded", watchMutations, { once: true });
  }
  // Each frame's time, and after its paint where the reading position stands.
  const scrollerOf = () => {
    const all = [
      ...document.querySelectorAll<HTMLElement>(
        "[aria-label='Session transcript']"
      ),
    ];
    return (
      all.find((one) => one.checkVisibility() && one.clientHeight > 0) ?? null
    );
  };
  let lastAnchor: string | null = null;
  const afterPaint = () => {
    if (!p.frames) {
      lastAnchor = null;
      return;
    }
    const scroller = scrollerOf();
    const driven = p.pendingDrive;
    p.pendingDrive = 0;
    if (!scroller) {
      p.painted.push({
        t: performance.now(),
        top: -1,
        anchor: null,
        y: null,
        was: null,
        driven,
        rows: 0,
      });
      lastAnchor = null;
      return;
    }
    const view = scroller.getBoundingClientRect();
    const before = lastAnchor
      ? scroller.querySelector<HTMLElement>(
          `[data-row="${CSS.escape(lastAnchor)}"]`
        )
      : null;
    const was = before ? before.getBoundingClientRect().top - view.top : null;
    const middle = view.top + view.height / 2;
    let anchor: string | null = null;
    let y: number | null = null;
    let best = Number.POSITIVE_INFINITY;
    const rows = scroller.querySelectorAll<HTMLElement>("[data-row]");
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (r.height === 0 || r.bottom < view.top || r.top > view.bottom) {
        continue;
      }
      const distance = Math.abs(r.top - middle);
      if (distance < best) {
        best = distance;
        anchor = row.dataset.row ?? null;
        y = r.top - view.top;
      }
    }
    p.painted.push({
      t: performance.now(),
      top: scroller.scrollTop,
      anchor,
      y,
      was,
      driven,
      rows: rows.length,
    });
    lastAnchor = anchor;
  };
  const channel = new MessageChannel();
  channel.port1.onmessage = afterPaint;
  const loop = (t: number) => {
    if (p.frames) {
      p.rafs.push(t);
      channel.port2.postMessage(0);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // Every message off the page's sockets, by kind (the hub's `payload.kind`
  // or `type`, read off the text without parsing it).
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page, which has none of this module's scope
  const KIND = /"(?:kind|type)":"([^"]{1,40})"/;
  const kindOf = (data: unknown): [string, number] => {
    const text = typeof data === "string" ? data : "";
    return [KIND.exec(text.slice(0, 400))?.[1] ?? "?", text.length];
  };
  // Each message's handling: a listener of ours before the page's handler
  // and one after it. The page's `onmessage` is kept as a listener between
  // the two (its own function, so a long frame still names it at its
  // source); a microtask checkpoint follows each listener, so the one after
  // reads the handler and the flush it set off, and nothing else.
  window.WebSocket = new Proxy(WebSocket, {
    construct(Real, args: ConstructorParameters<typeof WebSocket>) {
      const socket = new Real(...args);
      let began = 0;
      let handler: ((event: MessageEvent) => unknown) | null = null;
      const before = () => {
        began = performance.now();
      };
      const after = (event: MessageEvent) => {
        const [kind, chars] = kindOf(event.data);
        const ms = performance.now() - began;
        const row = p.ws.kinds[kind] ?? [0, 0, 0, 0];
        row[0] += 1;
        row[1] += chars;
        row[2] += ms;
        row[3] = Math.max(row[3], ms);
        p.ws.kinds[kind] = row;
      };
      socket.addEventListener("message", before);
      socket.addEventListener("message", after);
      Object.defineProperty(socket, "onmessage", {
        configurable: true,
        get: () => handler,
        set: (fn: unknown) => {
          if (handler) {
            socket.removeEventListener("message", handler);
          }
          handler =
            typeof fn === "function"
              ? (fn as (event: MessageEvent) => unknown)
              : null;
          socket.removeEventListener("message", after);
          if (handler) {
            socket.addEventListener("message", handler);
          }
          socket.addEventListener("message", after);
        },
      });
      return socket;
    },
  });
  return "installed";
}

/** What the page holds now, beside the watcher's series: its DOM, its frames, its heap. */
export function pageNow() {
  const iframes: string[] = [];
  const walk = (doc: Document) => {
    for (const frame of doc.querySelectorAll("iframe")) {
      iframes.push(
        frame.src || frame.getAttribute("srcdoc")?.slice(0, 30) || ""
      );
      try {
        if (frame.contentDocument) {
          walk(frame.contentDocument);
        }
      } catch {
        // A frame of another origin keeps its own.
      }
    }
  };
  walk(document);
  const { memory } = performance as unknown as {
    memory?: { totalJSHeapSize: number; usedJSHeapSize: number };
  };
  const origins = new Set(
    iframes.map((src) => {
      try {
        return new URL(src, location.href).origin;
      } catch {
        return src;
      }
    })
  );
  return {
    nodes: document.getElementsByTagName("*").length,
    iframes: iframes.length,
    iframeOrigins: origins.size,
    canvases: document.querySelectorAll("canvas").length,
    heapMB: memory ? Math.round(memory.usedJSHeapSize / 1_048_576) : -1,
    url: location.pathname,
  };
}

/** Clears the watcher's series and turns frames and mutations on or off. */
export function perfReset(frames: boolean, mutations: boolean): number {
  const p = (window as unknown as { __perf: PerfState }).__perf;
  p.loaf = [];
  p.long = [];
  p.events = [];
  p.shifts = [];
  p.rafs = [];
  p.painted = [];
  p.mutated = {};
  p.pendingDrive = 0;
  p.ws = { kinds: {}, since: performance.now() };
  p.frames = frames;
  p.mutations = mutations;
  return performance.now();
}

/**
 * Wheels the visible transcript as a hand does: a notch of `px` (negative:
 * up) every `everyMs` for `ms`, each a wheel event at the scroller's middle
 * and the scroll it asks for. A fling is many notches close together.
 * Stops early at either end. Resolves with how far it moved the view.
 */
export function wheel(
  px: number,
  everyMs: number,
  ms: number
): Promise<{ moved: number; notches: number; stoppedAt: string }> {
  const p = (window as unknown as { __perf: PerfState }).__perf;
  const scroller = [
    ...document.querySelectorAll<HTMLElement>(
      "[aria-label='Session transcript']"
    ),
  ].find((one) => one.checkVisibility() && one.clientHeight > 0);
  if (!scroller) {
    return Promise.resolve({
      moved: 0,
      notches: 0,
      stoppedAt: "no transcript",
    });
  }
  const box = scroller.getBoundingClientRect();
  const start = performance.now();
  let moved = 0;
  let notches = 0;
  let still = 0;
  return new Promise((resolve) => {
    const step = () => {
      const now = performance.now();
      if (now - start >= ms) {
        resolve({ moved, notches, stoppedAt: "time" });
        return;
      }
      scroller.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: px,
          deltaMode: 0,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
          bubbles: true,
          cancelable: true,
        })
      );
      const before = scroller.scrollTop;
      scroller.scrollBy({ top: px, behavior: "instant" });
      const after = scroller.scrollTop;
      const delta = after - before;
      moved += delta;
      p.pendingDrive += delta;
      notches += 1;
      still = delta === 0 ? still + 1 : 0;
      // Twenty notches that moved nothing: at an end, older pages not coming.
      if (still >= 20) {
        resolve({ moved, notches, stoppedAt: "an end" });
        return;
      }
      setTimeout(step, everyMs);
    };
    step();
  });
}

/** One step of a scroll journey: wheel notches for a while, or a rest. */
export interface Step {
  everyMs?: number;
  ms: number;
  name: string;
  px?: number;
}

/**
 * A scroll journey through the visible transcript, started and left to run
 * (a DevTools client's evaluation need not wait 30 s): frames and mutations
 * counted from its start, each step's span kept in `__perf.phases`, and
 * `__perf.done` set at its end. Each wheeling step is `wheel`'s.
 */
export function journey(steps: Step[]): string {
  const p = (
    window as unknown as {
      __perf: PerfState & {
        done: boolean;
        phases: [string, number, number, number][];
      };
    }
  ).__perf;
  const pf = (
    window as unknown as {
      __pf: {
        perfReset: (f: boolean, m: boolean) => number;
        wheel: (
          px: number,
          every: number,
          ms: number
        ) => Promise<{ moved: number }>;
      };
    }
  ).__pf;
  pf.perfReset(true, true);
  p.done = false;
  p.phases = [];
  (async () => {
    for (const step of steps) {
      const start = performance.now();
      let moved = 0;
      if (step.px) {
        // biome-ignore lint/performance/noAwaitInLoops: one step after another, as a hand moves
        ({ moved } = await pf.wheel(step.px, step.everyMs ?? 100, step.ms));
      } else {
        await new Promise((resolve) => setTimeout(resolve, step.ms));
      }
      p.phases.push([step.name, start, performance.now(), moved]);
    }
    p.frames = false;
    p.mutations = false;
    p.done = true;
  })();
  return `started ${steps.length} steps`;
}

/** What `attributeOn` keeps: each slow callback's kind, ms and the stack that scheduled it; JSON.parse's count, ms and characters. */
export interface Attributed {
  calls: [string, number, string][];
  json: [number, number, number];
}

/**
 * Names who scheduled each slow callback, for an engine whose trace is out
 * of reach: every `requestAnimationFrame` and `setTimeout` callback keeps
 * the stack that asked for it (an `Error` made as it is asked, read only
 * when the callback, with the microtasks it set off first, ran `minMs` or
 * more). A promise awaiting `tick()` resumes inside its frame callback, so
 * the stack names the function that awaited. JSON.parse's own time is
 * counted beside. On until the page goes; it costs an Error per callback.
 */
export function attributeOn(minMs: number): string {
  const p = (
    window as unknown as { __perf: PerfState & { attrib?: Attributed } }
  ).__perf;
  if (p.attrib) {
    return "on already";
  }
  const attrib: Attributed = { calls: [], json: [0, 0, 0] };
  p.attrib = attrib;
  Error.stackTraceLimit = 14;
  const keep = (kind: string, asked: Error, ms: number) => {
    if (ms >= minMs && attrib.calls.length < 4000) {
      attrib.calls.push([
        kind,
        ms,
        String(asked.stack).split("\n").slice(2, 14).join("\n"),
      ]);
    }
  };
  const settled = (then: () => void) =>
    Promise.resolve().then().then().then().then().then(then);
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) => {
    const asked = new Error("asked");
    return raf((t) => {
      const start = performance.now();
      try {
        callback(t);
      } finally {
        // A few microtask turns on: an `await tick()` resumes through an
        // async function's own promise, two or three turns after it settles.
        settled(() => keep("frame", asked, performance.now() - start));
      }
    });
  };
  const timeout = window.setTimeout.bind(window);
  window.setTimeout = ((
    callback: TimerHandler,
    ms?: number,
    ...extra: unknown[]
  ) => {
    if (typeof callback !== "function") {
      return timeout(callback, ms, ...extra);
    }
    const asked = new Error("asked");
    return timeout(
      (...args: unknown[]) => {
        const start = performance.now();
        try {
          (callback as (...a: unknown[]) => void)(...args);
        } finally {
          settled(() => keep("timer", asked, performance.now() - start));
        }
      },
      ms,
      ...extra
    );
  }) as typeof window.setTimeout;
  const { parse } = JSON;
  JSON.parse = ((...args: unknown[]) => {
    const start = performance.now();
    try {
      return Reflect.apply(parse, JSON, args) as unknown;
    } finally {
      attrib.json[0] += 1;
      attrib.json[1] += performance.now() - start;
      attrib.json[2] += typeof args[0] === "string" ? args[0].length : 0;
    }
  }) as typeof JSON.parse;
  return "on";
}

/** Waits `ms`, frames still counted. */
export function rest(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * How much of the page's main thread its own work takes over `ms`, for an
 * engine whose trace is out of reach: one task of ours is always queued
 * (a MessageChannel message, which no timer clamp delays), so the thread
 * never sleeps and the page's tasks and frames run between ours; the time
 * between one of ours ending and the next starting, past half a
 * millisecond, is the page's. It is wall time: the machine's other turns
 * land in it too, so it is read beside the same meter on a blank page
 * (its floor) and the machine's load. The gaps are binned by length (under
 * 4 ms, 4–16, 16–50, 50 and over). `requestIdleCallback`'s deadlines
 * overlap and promise time a task can still take, so they are not used.
 */
export function busyMeter(ms: number): Promise<{
  bins: [number, number][];
  busyMs: number;
  busyShare: number;
  wallMs: number;
}> {
  const GAP_MS = 0.5;
  const EDGES = [4, 16, 50, Number.POSITIVE_INFINITY];
  return new Promise((resolve) => {
    const start = performance.now();
    const bins: [number, number][] = EDGES.map(() => [0, 0]);
    const channel = new MessageChannel();
    let busy = 0;
    let ended = start;
    channel.port1.onmessage = () => {
      const now = performance.now();
      const gap = now - ended;
      if (gap > GAP_MS) {
        busy += gap;
        const bin = bins[EDGES.findIndex((edge) => gap < edge)];
        if (bin) {
          bin[0] += 1;
          bin[1] += gap;
        }
      }
      if (now - start >= ms) {
        channel.port1.close();
        resolve({
          busyMs: busy,
          busyShare: busy / (now - start),
          wallMs: now - start,
          bins,
        });
        return;
      }
      ended = performance.now();
      channel.port2.postMessage(0);
    };
    channel.port2.postMessage(0);
  });
}

/** The watcher's series, read once. */
export function perfRead(): PerfState {
  return (window as unknown as { __perf: PerfState }).__perf;
}
