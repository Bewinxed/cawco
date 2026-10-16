/**
 * Runtime cadence, measured as the page runs: what no seek can stand in
 * for. One watcher (`watch`, installed before the page's own scripts) keeps:
 *
 *  - every window error and unhandled rejection;
 *  - every element style written with `NaN` in it;
 *  - every main-thread long task (PerformanceObserver `longtask`);
 *  - each painted frame, read after its paint (a task behind the frame's
 *    `requestAnimationFrame`: read inside that callback, it is the layout
 *    before the frame's ResizeObserver delivery): where the anchor row
 *    (`anchor`, its text) stands in the transcript's view, the scroller's
 *    `scrollTop` while `sampling`, and the widest blank stretch of the view
 *    between the list's drawn items;
 *  - while `cadence` is on, every requestAnimationFrame's timestamp and the
 *    first pointerdown after it was turned on.
 *
 * `attribute` (installed after `watch`, for an engine with no performance
 * trace of its own: WebKit through Playwright has none) keeps, while
 * `cadence` is on, every callback of the page's own a millisecond or more
 * (frame callbacks, timers and intervals, microtasks, event listeners and
 * `on…` handlers, observers): what its code did inside a frame (`ourWork`).
 * An async function resumed after an `await` is no callback and is not seen.
 *
 * The readers below turn those series into the probes' checks.
 *
 * `traceMain` reads the main thread off a DevTools trace instead (Chromium):
 * each top-level task's wall time and its thread time, the CPU it took
 * whatever else the machine ran, and the page's `performance.mark`s.
 */
import type { Page } from "playwright-core";

/** The transcript's scroller, as every transcript spec reads it. */
export const SCROLLER = '[aria-label="Session transcript"]';
/** A trace's node name's class attribute, cut to its first class. */
const CLASS_ATTRIBUTE = / class='([^' ]*)[^']*'/;

export interface Watched {
  anchor: string | null;
  cadence: boolean;
  /** The page's own callbacks while `cadence` is on (`attribute`): name, start, ms. */
  calls: [string, number, number][];
  errors: string[];
  frames: number;
  gap: { at: number; px: number; top: number; where: string };
  gaps: [number, number, number, string][];
  nan: string[];
  rafs: number[];
  sampling: boolean;
  tap: number;
  tasks: [number, number][];
  tops: number[];
  ys: [number, number | null][];
}

/** The watcher: an init script (see the file's head). */
export function watch(): void {
  const w = window as unknown as { __kit: Watched };
  const kit: Watched = {
    anchor: null,
    calls: [],
    cadence: false,
    errors: [],
    frames: 0,
    gap: { at: 0, px: 0, top: 0, where: "" },
    gaps: [],
    nan: [],
    rafs: [],
    sampling: false,
    tap: -1,
    tasks: [],
    tops: [],
    ys: [],
  };
  w.__kit = kit;
  window.addEventListener(
    "error",
    (event: ErrorEvent) => kit.errors.push(`error: ${event.message}`),
    true
  );
  window.addEventListener(
    "unhandledrejection",
    (event: PromiseRejectionEvent) =>
      kit.errors.push(`rejection: ${String(event.reason)}`)
  );
  addEventListener(
    "pointerdown",
    (event) => {
      if (kit.cadence && kit.tap < 0) {
        kit.tap = event.timeStamp;
      }
    },
    { capture: true }
  );
  new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target as Element;
      const style = target.getAttribute?.("style") ?? "";
      if (style.includes("NaN")) {
        kit.nan.push(
          `${target.className || target.tagName}: ${style.slice(0, 160)}`
        );
      }
    }
  }).observe(document, {
    attributes: true,
    attributeFilter: ["style"],
    subtree: true,
  });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      kit.tasks.push([entry.startTime, entry.duration]);
    }
  }).observe({ type: "longtask", buffered: true });
  /** The widest stretch of the view the list's drawn items leave blank, and where. */
  const blank = (container: HTMLElement, view: DOMRect) => {
    const list = container.getBoundingClientRect();
    const from = Math.max(view.top, list.top);
    const to = Math.min(view.bottom, list.bottom);
    const spans = [...container.children]
      .map((item) => ({
        rect: item.getBoundingClientRect(),
        row: item.querySelector<HTMLElement>("[data-row]")?.dataset.row ?? "?",
      }))
      .filter(
        ({ rect }) => rect.height > 0 && rect.bottom > from && rect.top < to
      )
      .sort((a, b) => a.rect.top - b.rect.top);
    let reach = from;
    let above = "the view's top";
    let widest = 0;
    let where = "";
    for (const { rect, row } of spans) {
      if (rect.top - reach > widest) {
        widest = rect.top - reach;
        where = `between ${above} and ${row}`;
      }
      if (rect.bottom > reach) {
        reach = rect.bottom;
        above = row;
      }
    }
    if (to > from && to - reach > widest) {
      widest = to - reach;
      where = `between ${above} and the view's bottom (${spans.length} rows drawn)`;
    }
    return { widest, where };
  };
  const anchorY = (scroller: HTMLElement, text: string, top: number) => {
    for (const node of scroller.querySelectorAll("*")) {
      if (node.children.length === 0 && node.textContent?.includes(text)) {
        return node.getBoundingClientRect().top - top;
      }
    }
    return null;
  };
  const painted = () => {
    kit.frames += 1;
    const scroller = document.querySelector<HTMLElement>(
      '[aria-label="Session transcript"]'
    );
    const container = document.querySelector<HTMLElement>(
      ".listing > :first-child"
    );
    if (scroller) {
      const view = scroller.getBoundingClientRect();
      if (kit.sampling) {
        kit.tops.push(scroller.scrollTop);
      }
      if (container) {
        const { widest, where } = blank(container, view);
        const now = performance.now();
        if (widest > 4 && kit.gaps.length < 40) {
          kit.gaps.push([now, widest, scroller.scrollTop, where]);
        }
        if (widest > kit.gap.px) {
          kit.gap = { px: widest, at: now, top: scroller.scrollTop, where };
        }
      }
      if (kit.anchor) {
        kit.ys.push([
          performance.now(),
          anchorY(scroller, kit.anchor, view.top),
        ]);
      }
    }
    requestAnimationFrame(after);
  };
  const channel = new MessageChannel();
  channel.port1.onmessage = painted;
  const after = () => channel.port2.postMessage(0);
  requestAnimationFrame(after);
  // Cadence on its own loop, each frame asking for the next.
  const loop = (t: number) => {
    if (kit.cadence) {
      kit.rafs.push(t);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** The page's own callbacks, timed while `cadence` is on: an init script after `watch` (see the file's head). */
export function attribute(): void {
  const kit = (window as unknown as { __kit: Watched }).__kit;
  const named = (kind: string, fn: unknown) =>
    `${kind} ${(typeof fn === "function" && fn.name) || String(fn).replace(/\s+/g, " ").slice(0, 60)}`;
  const timed = <A extends unknown[], R>(kind: string, fn: (...a: A) => R) =>
    function (this: unknown, ...a: A): R {
      const start = performance.now();
      try {
        return fn.apply(this, a);
      } finally {
        const ms = performance.now() - start;
        if (kit.cadence && ms >= 1) {
          kit.calls.push([named(kind, fn), start, ms]);
        }
      }
    };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf(timed("frame", cb));
  const timeout = window.setTimeout.bind(window);
  window.setTimeout = ((cb: TimerHandler, ms?: number, ...rest: unknown[]) =>
    timeout(
      typeof cb === "function"
        ? timed("timer", cb as (...a: unknown[]) => unknown)
        : cb,
      ms,
      ...rest
    )) as typeof window.setTimeout;
  const interval = window.setInterval.bind(window);
  window.setInterval = ((cb: TimerHandler, ms?: number, ...rest: unknown[]) =>
    interval(
      typeof cb === "function"
        ? timed("interval", cb as (...a: unknown[]) => unknown)
        : cb,
      ms,
      ...rest
    )) as typeof window.setInterval;
  const micro = window.queueMicrotask.bind(window);
  window.queueMicrotask = (cb) => micro(timed("microtask", cb));
  const wrapped = new WeakMap<object, EventListener>();
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (typeof listener !== "function") {
      return add.call(this, type, listener, options);
    }
    let one = wrapped.get(listener);
    if (!one) {
      one = timed(`event ${type}`, listener) as EventListener;
      wrapped.set(listener, one);
    }
    return add.call(this, type, one, options);
  };
  EventTarget.prototype.removeEventListener = function (
    type,
    listener,
    options
  ) {
    const one =
      typeof listener === "function" ? wrapped.get(listener) : undefined;
    return remove.call(this, type, one ?? listener, options);
  };
  // `socket.onmessage = …` and its kin: a handler property is no listener
  // added. Read back, it is the function the page set. The watcher's own
  // port was set before this ran, and stays untimed.
  const setBy = new WeakMap<object, unknown>();
  for (const owner of [
    "WebSocket",
    "EventSource",
    "MessagePort",
    "BroadcastChannel",
    "Worker",
    "XMLHttpRequestEventTarget",
    "XMLHttpRequest",
    "FileReader",
    "IDBRequest",
    "IDBOpenDBRequest",
    "IDBTransaction",
    "IDBDatabase",
  ]) {
    const proto = (
      window as unknown as Record<string, { prototype?: object } | undefined>
    )[owner]?.prototype;
    if (!proto) {
      continue;
    }
    for (const key of Object.getOwnPropertyNames(proto)) {
      const real = Object.getOwnPropertyDescriptor(proto, key);
      if (!(key.startsWith("on") && real?.get && real.set)) {
        continue;
      }
      const { get, set } = real;
      Object.defineProperty(proto, key, {
        configurable: true,
        enumerable: real.enumerable,
        get(this: unknown) {
          const one = get.call(this) as object | null;
          return one ? (setBy.get(one) ?? one) : one;
        },
        set(this: unknown, fn: unknown) {
          if (typeof fn !== "function") {
            set.call(this, fn);
            return;
          }
          const one = timed(
            `${owner}.${key}`,
            fn as (...a: unknown[]) => unknown
          );
          setBy.set(one, fn);
          set.call(this, one);
        },
      });
    }
  }
  for (const name of [
    "MutationObserver",
    "ResizeObserver",
    "IntersectionObserver",
  ] as const) {
    const Real = window[name] as unknown as new (
      cb: (...a: unknown[]) => void,
      o?: unknown
    ) => object;
    (window as unknown as Record<string, unknown>)[name] = class extends Real {
      constructor(cb: (...a: unknown[]) => void, o?: unknown) {
        super(timed(name, cb), o);
      }
    };
  }
}

/**
 * What the page's own code did between `from` and `to` (its clock, ms):
 * the time its callbacks ran there, and the heaviest of them.
 */
export function ourWork(
  calls: [string, number, number][],
  from: number,
  to: number
): { ms: number; heaviest: string } {
  const inside = calls.filter(([, start, d]) => start < to && start + d > from);
  const ms = inside.reduce(
    (sum, [, start, d]) =>
      sum + Math.min(to, start + d) - Math.max(from, start),
    0
  );
  const [top] = [...inside].sort((a, b) => b[2] - a[2]);
  return {
    ms,
    heaviest: top ? `${top[0].slice(0, 60)} ${top[2].toFixed(0)}ms` : "none",
  };
}

/** What the watcher holds now. */
export const watched = (page: Page): Promise<Watched> =>
  page.evaluate(() => (window as unknown as { __kit: Watched }).__kit);

/** Sets fields on the watcher (an anchor, sampling on, a series cleared). */
export const tell = (page: Page, fields: Partial<Watched>): Promise<void> =>
  page.evaluate((f) => {
    Object.assign((window as unknown as { __kit: Watched }).__kit, f);
  }, fields);

/**
 * An anchor's painted path against wheels of `wheel` px: on every frame it is
 * drawn it has moved from where it was first drawn by a whole number of
 * wheels, within 2px (with `oneWay`, never back past the most it has reached
 * nor past `total`); in all by `total` wheels within 2px. Its faults, frames
 * and moves.
 */
export function wholeWheels(
  ys: [number, number | null][],
  wheel: number,
  total: number,
  oneWay = false
) {
  const most = oneWay ? total : Number.POSITIVE_INFINITY;
  const seen = ys.filter(([, y]) => y !== null) as [number, number][];
  const first = seen[0]?.[1] ?? 0;
  const faults: string[] = [];
  let reached = 0;
  let widest = 0;
  seen.forEach(([, y], i) => {
    const moved = y - first;
    const whole = Math.round(moved / wheel);
    widest = Math.max(widest, Math.abs(y - (seen[i - 1]?.[1] ?? y)));
    if (
      Math.abs(moved - whole * wheel) > 2 ||
      (oneWay && whole < reached) ||
      whole > most
    ) {
      faults.push(`frame ${i}: moved ${moved.toFixed(1)}`);
    }
    reached = Math.max(reached, whole);
  });
  const moved = (seen.at(-1)?.[1] ?? 0) - first;
  if (seen.length < 2) {
    faults.push(`${seen.length} frame(s) with it drawn`);
  } else if (Math.abs(moved - total * wheel) > 2) {
    faults.push(`moved ${moved.toFixed(1)}px in all, not ${total * wheel}`);
  }
  return {
    faults,
    frames: seen.length,
    missing: ys.length - seen.length,
    moved,
    widest,
  };
}

/** One top-level task of the page's main thread, from a trace. */
export interface MainTask {
  /** When it started, the trace clock, µs. */
  at: number;
  /** Its thread's own clock (`tdur`), ms: the CPU it took, whatever else ran. */
  cpu: number;
  /** When it ended, the trace clock, µs. */
  end: number;
  /**
   * What its style recalculations were asked for (`restyles` only): each
   * invalidation's reason and the element it named, with how many times.
   */
  invalidated: [string, number][];
  layoutMs: number;
  /**
   * Each style recalculation and layout in it, in order (`restyles` only):
   * what it was, the elements it restyled, its ms, and the script frame
   * that forced it (`url:line:column`), or "the frame" when the frame's own
   * rendering ran it.
   */
  passes: { at: string; elements: number; ms: number; name: string }[];
  /**
   * What its layouts were asked for (`restyles` only): each layout
   * invalidation's reason and the element it named, with how many times.
   * A layout pass's `elements` are the layout objects it found dirty.
   */
  relaidOut: [string, number][];
  /**
   * How many elements its style recalculations restyled, all of them
   * together (`UpdateLayoutTree`'s `elementCount`); read only when asked
   * for (`traceMain`'s `restyles`), 0 otherwise.
   */
  restyled: number;
  /** Its style recalculations' and layouts' wall time, ms; 0 unless `restyles`. */
  styleMs: number;
  /** The trace clock (`dur`), ms: wall time, other processes' turns included. */
  wall: number;
}

/** What a trace says of the page's main thread: its top-level tasks, and the marks made on it. */
export interface MainThread {
  /** Each `performance.mark` made while tracing: its name and when, the trace clock, µs. */
  marks: { at: number; name: string }[];
  /**
   * The script functions the main thread ran between two points of the
   * trace clock (µs), by the time sampled in each function itself, ms, the
   * most first (`profile` only; empty otherwise): `name@file:line`.
   */
  selfTime: (from: number, to: number) => [string, number][];
  tasks: MainTask[];
}

interface StackFrame {
  columnNumber: number;
  functionName: string;
  lineNumber: number;
  url: string;
}

/** A sampling profile's chunk (`ProfileChunk`): new call-tree nodes, and samples with the µs since the last. */
interface ProfileData {
  cpuProfile?: {
    nodes?: { callFrame: Partial<StackFrame>; id: number; parent?: number }[];
    samples?: number[];
  };
  startTime?: number;
  timeDeltas?: number[];
}

interface TraceEvent {
  args?: {
    /** A Layout's: the layout objects it found dirty, of all there are. */
    beginData?: {
      dirtyObjects?: number;
      stackTrace?: StackFrame[];
      totalObjects?: number;
    };
    data?: ProfileData & {
      nodeName?: string;
      reason?: string;
      stackTrace?: StackFrame[];
    };
    elementCount?: number;
    endData?: { elementCount?: number };
  };
  cat: string;
  dur?: number;
  id?: string;
  name: string;
  ph: string;
  pid: number;
  tdur?: number;
  tid: number;
  ts: number;
}

/** A call-tree node's script frame, `name@file:line:column`; null for the engine's own. */
const scriptFrame = (c: Partial<StackFrame>): string | null =>
  c.url
    ? `${c.functionName || "(anonymous)"}@${c.url.split("/").pop()}:${(c.lineNumber ?? 0) + 1}:${(c.columnNumber ?? 0) + 1}`
    : null;

/**
 * The main thread's sampling profile, out of the trace's `Profile` and
 * `ProfileChunk` events: each sample's time (µs, the trace clock), how long
 * it stands for, and the function it was taken in. A frame of the engine's
 * own (a native like `getAnimations`, with the style or layout it forces)
 * is named with the script frame that called it: `getAnimations ← f@file`.
 */
function samplesOf(
  events: TraceEvent[],
  pid: number,
  tid: number
): { at: number; fn: string; us: number }[] {
  const head = events.find(
    (event) =>
      event.name === "Profile" && event.pid === pid && event.tid === tid
  );
  if (!head) {
    return [];
  }
  const frames = new Map<number, Partial<StackFrame>>();
  const parents = new Map<number, number>();
  const fns = new Map<number, string>();
  const nameOf = (id: number): string => {
    const known = fns.get(id);
    if (known !== undefined) {
      return known;
    }
    const own = frames.get(id) ?? {};
    let name = scriptFrame(own);
    if (name === null) {
      name = own.functionName || "(native)";
      for (let up = parents.get(id); up !== undefined; up = parents.get(up)) {
        const caller = scriptFrame(frames.get(up) ?? {});
        if (caller) {
          name = `${name} ← ${caller}`;
          break;
        }
      }
    }
    fns.set(id, name);
    return name;
  };
  const samples: { at: number; fn: string; us: number }[] = [];
  let at = head.args?.data?.startTime ?? head.ts;
  for (const chunk of events) {
    if (
      chunk.name !== "ProfileChunk" ||
      chunk.pid !== pid ||
      chunk.id !== head.id
    ) {
      continue;
    }
    const data = chunk.args?.data;
    for (const { callFrame, id, parent } of data?.cpuProfile?.nodes ?? []) {
      frames.set(id, callFrame);
      if (parent !== undefined) {
        parents.set(id, parent);
      }
    }
    const ids = data?.cpuProfile?.samples ?? [];
    const deltas = data?.timeDeltas ?? [];
    ids.forEach((id, i) => {
      at += deltas[i] ?? 0;
      samples.push({ at, fn: nameOf(id), us: deltas[i + 1] ?? 0 });
    });
  }
  return samples;
}

/**
 * The page's main thread while `act` runs, read off a DevTools trace
 * (Chromium): every top-level task (`RunTask`) with its wall time (`dur`)
 * and its thread time (`tdur`, the thread clock: the CPU the task took),
 * and every user-timing mark. The main thread is the one the marks are made
 * on, so `act` makes at least one (`performance.mark`) in the page.
 * `restyles`: each task also says how many elements it restyled, from the
 * timeline's own category, which the trace then carries whole. `profile`:
 * V8 samples the main thread's script as well (`selfTime`).
 */
export async function traceMain(
  page: Page,
  act: () => Promise<unknown>,
  {
    profile = false,
    restyles = false,
  }: { profile?: boolean; restyles?: boolean } = {}
): Promise<MainThread> {
  const cdp = await page.context().newCDPSession(page);
  const events: TraceEvent[] = [];
  cdp.on("Tracing.dataCollected", ({ value }) => {
    events.push(...(value as unknown as TraceEvent[]));
  });
  const complete = new Promise<void>((resolve) => {
    cdp.once("Tracing.tracingComplete", () => resolve());
  });
  await cdp.send("Tracing.start", {
    transferMode: "ReportEvents",
    traceConfig: {
      includedCategories: [
        "blink.user_timing",
        "disabled-by-default-devtools.timeline",
        ...(restyles
          ? [
              "devtools.timeline",
              "disabled-by-default-devtools.timeline.stack",
              "disabled-by-default-devtools.timeline.invalidationTracking",
            ]
          : []),
        ...(profile ? ["disabled-by-default-v8.cpu_profiler"] : []),
      ],
    },
  });
  await act();
  await cdp.send("Tracing.end");
  await complete;
  await cdp.detach();
  const marks = events.filter(
    (event) => event.cat.includes("blink.user_timing") && event.ph !== "X"
  );
  const [first] = marks;
  if (!first) {
    throw new Error("the trace holds no performance.mark of the page's");
  }
  const main = events.filter(
    (event) =>
      event.ph === "X" && event.pid === first.pid && event.tid === first.tid
  );
  const recalcs = main.filter((event) => event.name === "UpdateLayoutTree");
  const layouts = main.filter((event) => event.name === "Layout");
  const msIn = (list: TraceEvent[], from: number, to: number) =>
    list
      .filter((one) => one.ts >= from && one.ts < to)
      .reduce((sum, one) => sum + (one.dur ?? 0) / 1000, 0);
  const elementsOf = (one: TraceEvent) =>
    one.args?.elementCount ??
    one.args?.endData?.elementCount ??
    one.args?.beginData?.dirtyObjects ??
    0;
  const forcedBy = (one: TraceEvent) => {
    const [frame] =
      one.args?.beginData?.stackTrace ?? one.args?.data?.stackTrace ?? [];
    return frame
      ? `${frame.functionName || "(anonymous)"}@${frame.url.split("/").pop()}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`
      : "the frame";
  };
  const trackedAs = (name: string) =>
    events.filter((event) => event.name === name && event.pid === first.pid);
  // A container's whole subtree restyled is asked for here, not by the
  // element-by-element invalidations above: the node it names is where the
  // restyle starts.
  const restyleAsks = [
    ...trackedAs("StyleRecalcInvalidationTracking"),
    ...trackedAs("StyleInvalidatorInvalidationTracking").filter((one) =>
      /subtree/i.test(one.args?.data?.reason ?? "")
    ),
  ];
  const relayoutAsks = trackedAs("LayoutInvalidationTracking");
  const askedIn = (
    asks: TraceEvent[],
    from: number,
    to: number
  ): [string, number][] => {
    const counted = new Map<string, number>();
    for (const one of asks) {
      if (one.ts >= from && one.ts < to) {
        const node = (one.args?.data?.nodeName ?? "?")
          .replace(CLASS_ATTRIBUTE, ".$1")
          .slice(0, 60);
        const key = `${one.args?.data?.reason ?? "?"} on ${node}`;
        counted.set(key, (counted.get(key) ?? 0) + 1);
      }
    }
    // A whole subtree asked for once outweighs an element asked for often.
    const whole = (key: string) => (/subtree/i.test(key) ? 1 : 0);
    return [...counted]
      .sort((a, b) => whole(b[0]) - whole(a[0]) || b[1] - a[1])
      .slice(0, 8);
  };
  const passesIn = (from: number, to: number) =>
    [...recalcs, ...layouts]
      .filter((one) => one.ts >= from && one.ts < to)
      .sort((a, b) => a.ts - b.ts)
      .map((one) => ({
        name: one.name,
        elements: elementsOf(one),
        ms: (one.dur ?? 0) / 1000,
        at: forcedBy(one),
      }));
  const samples = profile ? samplesOf(events, first.pid, first.tid) : [];
  const selfTime = (from: number, to: number): [string, number][] => {
    const counted = new Map<string, number>();
    for (const { at, fn, us } of samples) {
      if (at >= from && at < to) {
        counted.set(fn, (counted.get(fn) ?? 0) + us / 1000);
      }
    }
    return [...counted].sort((a, b) => b[1] - a[1]);
  };
  return {
    marks: marks.map((event) => ({ at: event.ts, name: event.name })),
    selfTime,
    tasks: main
      .filter((event) => event.name === "RunTask")
      .map((event) => {
        const end = event.ts + (event.dur ?? 0);
        return {
          at: event.ts,
          end,
          wall: (event.dur ?? 0) / 1000,
          cpu: (event.tdur ?? 0) / 1000,
          restyled: recalcs
            .filter((recalc) => recalc.ts >= event.ts && recalc.ts < end)
            .reduce((sum, recalc) => sum + elementsOf(recalc), 0),
          styleMs: msIn(recalcs, event.ts, end),
          layoutMs: msIn(layouts, event.ts, end),
          passes: restyles ? passesIn(event.ts, end) : [],
          invalidated: restyles ? askedIn(restyleAsks, event.ts, end) : [],
          relaidOut: restyles ? askedIn(relayoutAsks, event.ts, end) : [],
        };
      }),
  };
}

/** The task a mark was made in. */
export const taskOf = (
  main: MainThread,
  mark: string
): MainTask | undefined => {
  const at = main.marks.find((one) => one.name === mark)?.at;
  return at === undefined
    ? undefined
    : main.tasks.find((task) => task.at <= at && at <= task.end);
};

/** The longest long task that started at or after `since` (ms, the page's clock), and how many. */
export function longest(tasks: [number, number][], since: number) {
  const after = tasks.filter(([at]) => at >= since - 1);
  return { ms: Math.max(0, ...after.map(([, ms]) => ms)), count: after.length };
}
