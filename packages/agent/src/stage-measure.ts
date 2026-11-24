/**
 * A move measured on the stage's own drawing (design perf-read §2), on the
 * page a render opened to measure (stage-render.ts, core `MEASURE_PARAM`):
 * the DevTools Protocol slows the main thread as the agent asked, two
 * warm-up repeats read the move's length and warm the engine, three traced
 * repeats are recorded and read with DevTools' own trace engine
 * (`@paulirish/trace_engine`), then the move repeats at ten times the
 * animations' speed while the memory counters are read after garbage
 * collection. Every repeat mounts its start afresh (canvas stage.ts
 * `measure`), so each starts alike and what one leaves behind shows.
 *
 * What the numbers say becomes faults by core stage-measure.ts's rules; a
 * move that can't be measured is refused in the page's or this file's
 * words (core words/stage-measure.ts).
 */

import type { Scheme } from "@cawco/core/stage";
import {
  COMPOSITING_OFF,
  EVERY_FRAME_SHARE,
  type ForcedLayout,
  MEASURE_CPU_RATE,
  MEASURE_LIMITS,
  MEASURE_MARKS,
  type MeasureAsk,
  type MeasureMove,
  type MeasurePass,
  type MeasureRead,
  type MeasureRun,
  median,
  moveOf,
  NO_VISIBLE_CHANGE,
  type NonComposited,
  type TraceFrame,
  tenths,
  trendAt,
  trendOf,
} from "@cawco/core/stage-measure";
import { faultsOf } from "@cawco/core/stage-measure-faults";
import { measureWords as words } from "@cawco/core/words/stage-measure";
import type * as TraceEngine from "@paulirish/trace_engine";
import type { Browser, CDPSession, Page } from "playwright-core";
import { forcedNow, measureNow, namedNow } from "./in-page/page";

/** The trace categories read (design perf-read §2): the subset of DevTools' own recording list that answers frames, style, layout, compositing and the play windows, its profiler and source rundowns left out. */
const TRACE_CATEGORIES = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "disabled-by-default-devtools.timeline.stack",
  "blink.user_timing",
];
/** Repeats before the trace: the first reads the move's clips and length, both warm the engine, neither is counted. */
const WARM = 2;
/** Repeats the memory pass makes before its baseline, uncounted: what its first repeat makes once. */
const MEMORY_WARM = 1;
/** Traced repeats: their figures are medians, a drop counts once it repeats in two. */
const TRACED = 3;
/** The quiet that ends a move on the stage (canvas stage.ts `QUIET_MS`): frames are counted to the move's length past it. */
const QUIET_MS = 250;
/** How long the stage waits on a move's motion (canvas stage.ts `MOTION_MS`): an unsettled move is one still moving past it. */
const MOTION_MS = 3000;
/** How much faster the animations run in the memory repeats (CDP `Animation.setPlaybackRate`). */
const MEMORY_RATE = 10;
/** The inspector's group the object count's handles stand in, let go after each count. */
const OBJECTS_GROUP = "cawco-measure-objects";
/** The fewest memory repeats a trend is read from. */
const TREND_LEAST = 3;
/** The fewest motion frames whose layouts say whether layout ran every frame: the press's own frame lays out once. */
const EVERY_FRAME_LEAST = 3;
/** The steps of a frame's paint DevTools colours as rendering: counted with its paint. */
const PAINT_STEPS: ReadonlySet<string> = new Set(["PrePaint", "Layerize"]);
/** What Chrome answers `DOM.resolveNode` for a node no longer in its document's tree. */
const NODE_GONE = "No node with given id found";
/** Trace times are µs. */
const US = 1000;

/** What the read is asked: the state's picture key and how it stands, the move. */
export interface MeasureTask {
  ask: MeasureAsk;
  key: string;
  scheme: Scheme;
  /** When the measurement must answer by (`Date.now()`): its own limit, inside the render's. */
  until: number;
  window: [number, number];
}

/** One counter reading after garbage collection. */
interface Counters {
  documents: number;
  heap: number;
  listeners: number;
  nodes: number;
}

type TraceEvent = TraceEngine.Types.Events.Event;

/** A refusal in words: the read answers it as its error. */
class Refused extends Error {}

/** One repeat on the page: its answer, or the page's refusal thrown. */
async function repeat(
  page: Page,
  key: string,
  move: MeasureMove,
  pass: MeasurePass,
  wait: number
): Promise<Exclude<MeasureRun, { refused: string }>> {
  const run = await page.evaluate(measureNow, { key, move, pass, wait });
  if (!run) {
    throw new Refused(
      "The stage's page has no measuring: it predates it. Update the daemon on the workspace's machine, then read again."
    );
  }
  if ("refused" in run) {
    throw new Refused(run.refused);
  }
  return run;
}

/** The page's counters after two forced collections (Chrome's unified heap collects the DOM in the same pass). */
async function countersOf(cdp: CDPSession): Promise<Counters> {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  const dom = await cdp.send("Memory.getDOMCounters");
  const heap = await cdp.send("Runtime.getHeapUsage");
  return {
    heap: heap.usedSize + (heap.embedderHeapUsedSize ?? 0),
    nodes: dom.nodes,
    listeners: dom.jsEventListeners,
    documents: dom.documents,
  };
}

/**
 * How many JavaScript objects the page holds after garbage collection:
 * every object whose prototype chain holds `Object.prototype`, as V8's
 * inspector counts them (CDP `Runtime.queryObjects`, DevTools' own
 * `queryObjects`). Machine code V8 compiles as a move turns hot is no
 * object, so a count that grows by one or more a repeat is the move's.
 */
async function objectsOf(cdp: CDPSession): Promise<number> {
  await cdp.send("HeapProfiler.collectGarbage");
  await cdp.send("HeapProfiler.collectGarbage");
  try {
    const { result: prototype } = await cdp.send("Runtime.evaluate", {
      expression: "Object.prototype",
      objectGroup: OBJECTS_GROUP,
    });
    if (!prototype.objectId) {
      return 0;
    }
    const { objects } = await cdp.send("Runtime.queryObjects", {
      prototypeObjectId: prototype.objectId,
      objectGroup: OBJECTS_GROUP,
    });
    if (!objects.objectId) {
      return 0;
    }
    const { result } = await cdp.send("Runtime.callFunctionOn", {
      objectId: objects.objectId,
      functionDeclaration: "function () { return this.length; }",
      returnByValue: true,
    });
    return typeof result.value === "number" ? result.value : 0;
  } finally {
    // The array it answered holds every object: let go, or it keeps them all.
    await cdp.send("Runtime.releaseObjectGroup", {
      objectGroup: OBJECTS_GROUP,
    });
  }
}

/**
 * Measures `task`'s move on `page` (opened by the render to measure), in
 * `browser`: its read, or a {@link Refused} thrown with why it can't be.
 */
export async function measureMove(
  browser: Browser,
  page: Page,
  task: MeasureTask
): Promise<MeasureRead> {
  const started = Date.now();
  const { ask, key } = task;
  const speed = ask.speed ?? "slowed";
  const repeats = ask.repeats ?? MEASURE_LIMITS.repeats.fallback;
  const move = moveOf(ask);
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Emulation.setCPUThrottlingRate", {
      rate: MEASURE_CPU_RATE[speed],
    });
    const scan = await repeat(page, key, move, "scan", 0);
    const { length } = scan;
    const settledWait = length + QUIET_MS;
    await repeat(page, key, move, "warm", settledWait);
    // Chrome writes a compositor verdict only for an animation that begins inside the recording.
    await browser.startTracing(page, { categories: TRACE_CATEGORIES });
    let trace: Buffer;
    try {
      for (let at = 0; at < TRACED; at += 1) {
        await repeat(page, key, move, "traced", settledWait);
      }
    } finally {
      trace = await browser.stopTracing();
    }
    if (Date.now() > task.until) {
      throw new Refused(words.tooLong(MEASURE_LIMITS.ms / 1000));
    }
    const read = await traceRead(trace, length);
    const nonComposited = await namesOf(cdp, read.refused);
    const forced = await forcedOf(page, read.forced);
    // What a repeat leaves behind does not hang on the main thread's speed: the memory pass runs at the machine's own.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    // The Animation domain keeps a snapshot of every animation it saw (DevTools' Animations panel): each repeat's are let go after it, or the read's own bookkeeping grows the heap it reads.
    const seen: string[] = [];
    cdp.on("Animation.animationCreated", ({ id }) => seen.push(id));
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: MEMORY_RATE });
    const memoryWait = Math.round(length / MEMORY_RATE);
    const countersAfter = async (): Promise<Counters> => {
      if (seen.length > 0) {
        await cdp.send("Animation.releaseAnimations", {
          animations: seen.splice(0),
        });
      }
      return await countersOf(cdp);
    };
    // The memory pass's own first repeat makes what it makes once (its code paths at ten times the animations' speed): uncounted.
    for (let at = 0; at < MEMORY_WARM; at += 1) {
      await repeat(page, key, move, "repeat", memoryWait);
    }
    const readings = [await countersAfter()];
    const counting = Date.now();
    const objects: [number, number][] = [[0, await objectsOf(cdp)]];
    const countTook = Date.now() - counting;
    const halfway = Math.floor(repeats / 2);
    let last = scan;
    let took = 0;
    for (let at = 0; at < repeats; at += 1) {
      // One more repeat, as long as the last took, and the last count of objects must fit before the limit.
      if (Date.now() + took + countTook > task.until) {
        break;
      }
      const from = Date.now();
      last = await repeat(page, key, move, "repeat", memoryWait);
      readings.push(await countersAfter());
      if (at + 1 === halfway) {
        objects.push([halfway, await objectsOf(cdp)]);
      }
      took = Date.now() - from;
    }
    if (last.edits !== scan.edits) {
      throw new Refused(words.changed);
    }
    const ran = readings.length - 1;
    const memory =
      ran >= TREND_LEAST
        ? {
            memory: {
              objects: trendAt([
                ...objects.filter(([at]) => at < ran),
                [ran, await objectsOf(cdp)],
              ]),
              heap: trendOf(readings.map((one) => one.heap)),
              nodes: trendOf(readings.map((one) => one.nodes)),
              listeners: trendOf(readings.map((one) => one.listeners)),
              documents: trendOf(readings.map((one) => one.documents)),
            },
          }
        : {};
    const measured: Omit<MeasureRead, "faults"> = {
      move: {
        from: scan.from,
        ...(scan.to ? { to: scan.to } : {}),
        by: move.by,
        ...(scan.on ? { on: scan.on } : {}),
      },
      at: {
        width: scan.width,
        scheme: task.scheme,
        window: task.window,
        speed,
        ...(read.hz ? { hz: read.hz } : {}),
      },
      runs: { warm: WARM + MEMORY_WARM, traced: TRACED, repeats: ran },
      took: Date.now() - started,
      length,
      frames: read.frames,
      style: read.style,
      layout: { ...read.layout, forced },
      nonComposited,
      ...memory,
      ...(ran < repeats ? { cut: true as const } : {}),
    };
    return {
      ...measured,
      faults: faultsOf(measured, {
        droppedPlays: read.droppedPlays,
        everyShare: read.everyShare,
        traced: TRACED,
        unsettledAfter: scan.unsettled ? MOTION_MS / 1000 : null,
      }),
    };
  } finally {
    await cdp
      .send("Animation.setPlaybackRate", { playbackRate: 1 })
      .catch(() => undefined);
    await cdp
      .send("Emulation.setCPUThrottlingRate", { rate: 1 })
      .catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
}

/** A refused animation as the trace has it: what it animates, its node, Chrome's reasons and properties. */
interface Refusal {
  animation: string;
  node: number | undefined;
  nodeName: string;
  properties: string[];
  reasons: string[];
}

/** One traced play's figures. */
interface PlayRead {
  drawn: number;
  dropped: number;
  elements: number;
  every: number;
  layoutCount: number;
  layoutMs: number;
  longest: number;
  longestWork: MeasureRead["frames"]["longestWork"];
  motionFrames: number;
  styleCount: number;
  styleMs: number;
}

/** DevTools' trace engine, loaded when a move is first measured. */
type Engine = typeof TraceEngine;
/** What the engine read of a trace. */
type TraceData = TraceEngine.Handlers.Types.HandlerData;
/** The page's main thread, as the engine read it. */
type MainThread = TraceEngine.Handlers.ModelHandlers.Renderer.RendererThread;
/** A frame, as the engine pairs it from the compositor's events. */
type Frame = TraceEngine.Types.Events.LegacyTimelineFrame;

/** What one traced play's window is read with. */
interface TraceContext {
  data: TraceData;
  engine: Engine;
  /** Each event's kind of work, as DevTools' Performance panel colours it. */
  kinds: Map<string, { category: { name: string } }>;
  thread: MainThread;
}

/** The main thread's own time between `from` and `to` (µs), by the kind of work, ms. */
function workIn(
  { data, kinds, thread }: TraceContext,
  from: number,
  to: number
): MeasureRead["frames"]["longestWork"] {
  const work = { script: 0, style: 0, layout: 0, paint: 0 };
  for (const entry of thread.entries) {
    if (entry.ts < from || entry.ts >= to) {
      continue;
    }
    const self = (data.Renderer.entryToNode.get(entry)?.selfTime ?? 0) / US;
    const category = kinds.get(entry.name)?.category.name;
    if (entry.name === "UpdateLayoutTree") {
      work.style += self;
    } else if (entry.name === "Layout") {
      work.layout += self;
    } else if (category === "scripting") {
      work.script += self;
    } else if (category === "painting" || PAINT_STEPS.has(entry.name)) {
      work.paint += self;
    }
  }
  return {
    script: tenths(work.script),
    style: tenths(work.style),
    layout: tenths(work.layout),
    paint: tenths(work.paint),
  };
}

/** The longest gap between two drawn frames, ms, and where it stands (µs): the first frame's own length when only one was drawn. */
function longestGap(drawn: readonly Frame[], from: number) {
  const [first] = drawn;
  let gap = {
    ms: first ? first.duration / US : 0,
    from: first?.startTime ?? from,
    to: first?.endTime ?? from,
  };
  for (const [index, one] of drawn.entries()) {
    const before = drawn[index - 1];
    if (before && (one.startTime - before.startTime) / US > gap.ms) {
      gap = {
        ms: (one.startTime - before.startTime) / US,
        from: before.startTime,
        to: one.startTime,
      };
    }
  }
  return gap;
}

/** One traced play's figures, from `from` to the move's `length` and its quiet past it. */
function playRead(
  context: TraceContext,
  from: number,
  length: number
): PlayRead & { layouts: TraceEvent[]; styles: TraceEvent[] } {
  const { data, thread } = context;
  const to = from + (length + QUIET_MS) * US;
  const inWindow = data.Frames.frames.filter(
    (one) => one.startTime >= from && one.startTime < to
  );
  const drawn = inWindow.filter((one) => !(one.dropped || one.idle));
  const gap = longestGap(drawn, from);
  const styles = thread.recalcStyleEvents.filter(
    (one) => one.ts >= from && one.ts < to
  );
  const layouts = thread.layoutEvents.filter(
    (one) => one.ts >= from && one.ts < to
  );
  const motion = drawn.filter((one) => one.startTime < from + length * US);
  const laidOut = motion.filter((one) =>
    layouts.some(
      (layout) => layout.ts >= one.startTime && layout.ts < one.endTime
    )
  );
  return {
    drawn: drawn.length,
    dropped: inWindow.filter((one) => one.dropped).length,
    longest: gap.ms,
    longestWork: workIn(context, gap.from, gap.to),
    styleCount: styles.length,
    styleMs: styles.reduce((sum, one) => sum + (one.dur ?? 0), 0) / US,
    elements: styles.reduce(
      (sum, one) => sum + (one.args.elementCount ?? 0),
      0
    ),
    layoutCount: layouts.length,
    layoutMs: layouts.reduce((sum, one) => sum + (one.dur ?? 0), 0) / US,
    motionFrames: motion.length,
    every: motion.length > 0 ? laidOut.length / motion.length : 0,
    styles,
    layouts,
  };
}

/** The style and layout `events` script forced before `end` (µs): each with its stack, numbered from 0 by the engine's own read (Chrome numbers them from 1). */
function forcedIn(
  { engine }: TraceContext,
  events: readonly TraceEvent[],
  end: number
): { ms: number; stack: TraceFrame[] }[] {
  return events.flatMap((one) => {
    const stack =
      engine.Helpers.Trace.getZeroIndexedStackTraceInEventPayload(one) ?? [];
    return stack.length > 0 && one.ts < end
      ? [
          {
            ms: (one.dur ?? 0) / US,
            stack: stack.map((frame) => ({
              url: frame.url,
              line: frame.lineNumber,
              column: frame.columnNumber,
            })),
          },
        ]
      : [];
  });
}

/** Each animation begun between `from` and `end` (µs) that Chrome kept off the compositor, into `refused` by what it animates, its node and its reasons: the last play's node, still mounted, is the one named. */
function refusedIn(
  { data, engine }: TraceContext,
  from: number,
  end: number,
  refused: Map<string, Refusal>
): void {
  for (const animation of data.Animations.animations) {
    if (animation.ts < from || animation.ts >= end) {
      continue;
    }
    const failures =
      engine.Insights.Models.CLSCulprits.getNonCompositedFailure(animation);
    for (const failure of failures) {
      const reasons = failure.failureReasons.map(String);
      if (reasons.includes(COMPOSITING_OFF)) {
        throw new Refused(words.compositingOff);
      }
      const kept = reasons.filter((one) => one !== NO_VISIBLE_CHANGE);
      const begin = animation.args.data.beginEvent.args.data;
      const name = failure.name || begin.displayName || "animation";
      const nodeName = begin.nodeName ?? "an element";
      if (kept.length > 0) {
        refused.set(`${name}|${nodeName}|${kept.join(",")}`, {
          animation: name,
          node: begin.nodeId,
          nodeName,
          properties: failure.unsupportedProperties ?? [],
          reasons: kept,
        });
      }
    }
  }
}

/** The trace of the traced plays, read: medians of their figures, the animations kept off the compositor, the stacks of forced layouts. */
async function traceRead(trace: Buffer, length: number) {
  const engine = await import("@paulirish/trace_engine");
  // Playwright's recording is Chrome's JSON trace: `{ traceEvents, metadata }`.
  const { traceEvents }: { traceEvents: TraceEvent[] } = JSON.parse(
    trace.toString("utf8")
  );
  const model = engine.TraceModel.Model.createWithAllHandlers();
  await model.parse(traceEvents);
  const data = model.parsedTrace()?.data;
  const marks = [...(data?.UserTimings.performanceMarks ?? [])].sort(
    (a, b) => a.ts - b.ts
  );
  const starts = marks.filter((one) => one.name === MEASURE_MARKS.start);
  const ends = marks.filter((one) => one.name === MEASURE_MARKS.end);
  const [first] = starts;
  const thread = first
    ? data?.Renderer.processes.get(first.pid)?.threads.get(first.tid)
    : undefined;
  if (!(data && thread && ends.length === starts.length)) {
    throw new Refused(words.tooLong(MEASURE_LIMITS.ms / 1000));
  }
  const context: TraceContext = {
    data,
    engine,
    kinds: new Map(Object.entries(engine.Styles.maybeInitSylesMap())),
    thread,
  };
  const plays: PlayRead[] = [];
  const refused = new Map<string, Refusal>();
  const forced: { ms: number; stack: TraceFrame[] }[] = [];
  for (const [at, start] of starts.entries()) {
    const { layouts, styles, ...play } = playRead(context, start.ts, length);
    plays.push(play);
    // The play's own window, its marks: what script forced and what Chrome kept off the compositor in it.
    const end = ends[at]?.ts ?? start.ts + (length + QUIET_MS) * US;
    forced.push(...forcedIn(context, [...styles, ...layouts], end));
    refusedIn(context, start.ts, end, refused);
  }
  const { frames } = data.Frames;
  const played = plays.length;
  const middle = (pick: (one: PlayRead) => number) => median(plays.map(pick));
  const longestPlay = plays.reduce(
    (most, one) => (one.longest > most.longest ? one : most),
    plays[0] ?? null
  );
  const share = middle((one) => one.every);
  // The display's own rate: every frame's interval, its idle and dropped ones too.
  const frameMs = median(frames.map((one) => one.duration / US));
  return {
    hz: frameMs > 0 ? Math.round(1000 / frameMs) : null,
    frames: {
      count: middle((one) => one.drawn),
      dropped: middle((one) => one.dropped),
      longest: tenths(longestPlay?.longest ?? 0),
      longestWork: longestPlay?.longestWork ?? {
        script: 0,
        style: 0,
        layout: 0,
        paint: 0,
      },
    },
    style: {
      count: middle((one) => one.styleCount),
      ms: tenths(middle((one) => one.styleMs)),
      elements: middle((one) => one.elements),
    },
    layout: {
      count: middle((one) => one.layoutCount),
      ms: tenths(middle((one) => one.layoutMs)),
      everyFrame:
        middle((one) => one.motionFrames) >= EVERY_FRAME_LEAST &&
        share >= EVERY_FRAME_SHARE,
    },
    everyShare: share,
    droppedPlays: plays.filter((one) => one.dropped > 0).length,
    refused: [...refused.values()],
    forced: forced.map((one) => ({ ...one, plays: played })),
  };
}

/** Each refused animation named as the stage names its element, where it still stands; the trace's node name where it is gone. */
async function namesOf(
  cdp: CDPSession,
  refused: readonly Refusal[]
): Promise<NonComposited[]> {
  const named: NonComposited[] = [];
  for (const one of refused) {
    let said: { element: string; source: string | null } | null = null;
    if (one.node !== undefined) {
      // A node gone with its play's drawing resolves to nothing: the trace's own name stands in.
      const node = await cdp
        .send("DOM.resolveNode", { backendNodeId: one.node })
        .catch((error: unknown) => {
          if (String(error).includes(NODE_GONE)) {
            return null;
          }
          throw error;
        });
      if (node?.object.objectId) {
        const { result } = await cdp.send("Runtime.callFunctionOn", {
          objectId: node.object.objectId,
          functionDeclaration: namedNow.toString(),
          returnByValue: true,
        });
        said = result.value ?? null;
      }
    }
    named.push({
      animation: one.animation,
      element: said?.element ?? one.nodeName,
      ...(said?.source ? { source: said.source } : {}),
      reasons: one.reasons,
      properties: one.properties,
    });
  }
  return named;
}

/** Each forced layout placed in the project's code (canvas forced.ts), by its place: how often and how long a traced play, the stage's own left out. */
async function forcedOf(
  page: Page,
  forced: readonly { ms: number; plays: number; stack: TraceFrame[] }[]
): Promise<ForcedLayout[]> {
  const byPlace = new Map<
    string,
    { count: number; library: boolean; ms: number }
  >();
  let plays = 1;
  for (const one of forced) {
    ({ plays } = one);
    const placed = await page.evaluate(forcedNow, one.stack);
    if (placed) {
      const had = byPlace.get(placed.at) ?? {
        count: 0,
        library: placed.library,
        ms: 0,
      };
      byPlace.set(placed.at, {
        ...had,
        count: had.count + 1,
        ms: had.ms + one.ms,
      });
    }
  }
  return [...byPlace].map(([at, one]) => ({
    at,
    count: Math.max(1, Math.round(one.count / plays)),
    ms: tenths(one.ms / plays),
    ...(one.library ? { library: true as const } : {}),
  }));
}
