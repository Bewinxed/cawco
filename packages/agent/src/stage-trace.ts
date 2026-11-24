/**
 * A measured move's trace as the performance read reads it (agent
 * stage-measure.ts, stage-attribution.ts): Chrome's JSON trace parsed by
 * DevTools' own trace engine (`@paulirish/trace_engine`), the plays found
 * by their marks, and the stage's own marked work (core
 * `MEASURE_MARKS.harness`, canvas harness.ts) left out of what a frame
 * charges the component.
 */

import {
  MEASURE_MARKS,
  type MeasureRead,
  median,
  type TraceFrame,
  tenths,
} from "@cawco/core/stage-measure";
import type * as TraceEngine from "@paulirish/trace_engine";

/** Trace times are µs. */
export const US = 1000;
/** The steps of a frame's paint DevTools colours as rendering: counted with its paint. */
const PAINT_STEPS: ReadonlySet<string> = new Set(["PrePaint", "Layerize"]);

export type TraceEvent = TraceEngine.Types.Events.Event;

/** DevTools' trace engine, loaded when a move is first measured. */
type Engine = typeof TraceEngine;
/** What the engine read of a trace. */
type TraceData = TraceEngine.Handlers.Types.HandlerData;
/** The page's main thread, as the engine read it. */
type MainThread = TraceEngine.Handlers.ModelHandlers.Renderer.RendererThread;
/** A frame, as the engine pairs it from the compositor's events. */
export type Frame = TraceEngine.Types.Events.LegacyTimelineFrame;

/** A stretch of the stage's own work on the main thread (core `MEASURE_MARKS.harness`), µs. */
export interface Span {
  from: number;
  to: number;
}

/** What one traced play's window is read with. */
export interface TraceContext {
  data: TraceData;
  engine: Engine;
  /** The stage's own work, left out of what the read charges the component (canvas harness.ts), in time order. */
  harness: readonly Span[];
  /** Each event's kind of work, as DevTools' Performance panel colours it. */
  kinds: Map<string, { category: { name: string } }>;
  thread: MainThread;
}

/** The stage's own stretch that holds `event` whole, if one does. */
export const harnessOf = (
  harness: readonly Span[],
  event: TraceEvent
): Span | undefined =>
  harness.find(
    (span) => event.ts >= span.from && event.ts + (event.dur ?? 0) <= span.to
  );

/** How much of `from`–`to` (µs) the stage's own work takes. */
export const harnessIn = (harness: readonly Span[], from: number, to: number) =>
  harness.reduce(
    (sum, span) =>
      sum + Math.max(0, Math.min(to, span.to) - Math.max(from, span.from)),
    0
  );

/** How much of `from`–`to` (µs) the main thread is busy: its tasks' time in it. */
const busyIn = (thread: MainThread, from: number, to: number) =>
  [...(thread.tree?.roots ?? [])].reduce((sum, { entry }) => {
    const end = entry.ts + (entry.dur ?? 0);
    return sum + Math.max(0, Math.min(to, end) - Math.max(from, entry.ts));
  }, 0);

/**
 * Whether a dropped frame was the stage's own: the main thread held the
 * whole frame, and without the stage's own work in it the frame would have
 * had time. A frame dropped with the main thread free (raster, the
 * compositor) stays the component's.
 */
export const droppedByHarness = (
  { harness, thread }: TraceContext,
  frame: Frame
): boolean => {
  const busy = busyIn(thread, frame.startTime, frame.endTime);
  return (
    busy >= frame.duration &&
    busy - harnessIn(harness, frame.startTime, frame.endTime) < frame.duration
  );
};

/** The kind of work an entry is, as the read sums it: style and layout by name, the rest by DevTools' colours; null for what it leaves out. */
function kindOf(
  { kinds }: TraceContext,
  name: string
): keyof MeasureRead["frames"]["longestWork"] | null {
  if (name === "UpdateLayoutTree") {
    return "style";
  }
  if (name === "Layout") {
    return "layout";
  }
  const category = kinds.get(name)?.category.name;
  if (category === "scripting") {
    return "script";
  }
  return category === "painting" || PAINT_STEPS.has(name) ? "paint" : null;
}

/**
 * The main thread's own time between `from` and `to` (µs), by the kind of
 * work, ms, the stage's own left out: what runs inside one of its
 * stretches (a forced style or layout), and the stretch's own script, the
 * rest of its time.
 */
export function workIn(
  context: TraceContext,
  from: number,
  to: number
): MeasureRead["frames"]["longestWork"] {
  const { data, harness, thread } = context;
  const work = { script: 0, style: 0, layout: 0, paint: 0 };
  /** Each stretch's time its own events took, µs. */
  const heldIn = new Map<Span, number>();
  for (const entry of thread.entries) {
    if (entry.ts < from || entry.ts >= to) {
      continue;
    }
    const self = data.Renderer.entryToNode.get(entry)?.selfTime ?? 0;
    const span = harnessOf(harness, entry);
    const kind = kindOf(context, entry.name);
    if (span) {
      heldIn.set(span, (heldIn.get(span) ?? 0) + self);
    } else if (kind) {
      work[kind] += self / US;
    }
  }
  // A stretch's own script is its enclosing call's self time: the stretch's length less what ran inside it.
  for (const span of harness) {
    if (span.from >= from && span.from < to) {
      work.script -= (span.to - span.from - (heldIn.get(span) ?? 0)) / US;
    }
  }
  return {
    script: tenths(Math.max(0, work.script)),
    style: tenths(work.style),
    layout: tenths(work.layout),
    paint: tenths(work.paint),
  };
}

/**
 * Whether the main thread held up the frames between `from` and `to` (µs):
 * one was dropped there, or the main thread was busy for at least half of
 * the time past one frame's `interval` (µs). Else the page asked for no
 * frame in between (nothing changed, or only the compositor animated) and
 * Chrome recorded none: the stretch is no long frame.
 */
const heldUp = (
  { thread }: TraceContext,
  inWindow: readonly Frame[],
  interval: number,
  from: number,
  to: number
): boolean =>
  inWindow.some(
    (one) => one.dropped && one.startTime >= from && one.startTime < to
  ) || busyIn(thread, from, to) >= (to - from - interval) / 2;

/**
 * The longest gap between two drawn frames in `inWindow` the main thread
 * held up ({@link heldUp}), ms, the stage's own work in it left out, and
 * where it stands (µs): the first frame's own length when there is none.
 */
export function longestGap(
  context: TraceContext,
  inWindow: readonly Frame[],
  from: number
) {
  const own = (start: number, end: number) =>
    (end - start - harnessIn(context.harness, start, end)) / US;
  const drawn = inWindow.filter((one) => !(one.dropped || one.idle));
  const interval = median(inWindow.map((one) => one.duration));
  const [first] = drawn;
  let gap = {
    ms: first ? own(first.startTime, first.endTime) : 0,
    from: first?.startTime ?? from,
    to: first?.endTime ?? from,
  };
  for (const [index, one] of drawn.entries()) {
    const before = drawn[index - 1];
    if (
      before &&
      own(before.startTime, one.startTime) > gap.ms &&
      heldUp(context, inWindow, interval, before.startTime, one.startTime)
    ) {
      gap = {
        ms: own(before.startTime, one.startTime),
        from: before.startTime,
        to: one.startTime,
      };
    }
  }
  return gap;
}

/** The style and layout `events` script forced before `end` (µs): each with its stack ({@link stackOf}). */
export function forcedIn(
  context: TraceContext,
  events: readonly TraceEvent[],
  end: number
): { ms: number; stack: TraceFrame[] }[] {
  return events.flatMap((one) => {
    const stack = stackOf(context, one);
    return stack.length > 0 && one.ts < end
      ? [{ ms: (one.dur ?? 0) / US, stack }]
      : [];
  });
}

/** A trace's plays: each one's start and end marks, in time order. */
type Mark = TraceEngine.Types.Events.PerformanceMark;

/**
 * `trace` (Playwright's recording, Chrome's JSON trace `{ traceEvents,
 * metadata }`) parsed, with the plays its marks stand between; null when
 * it lacks their marks (the recording ended before they did).
 */
export async function parsedTrace(
  trace: Buffer
): Promise<{ context: TraceContext; ends: Mark[]; starts: Mark[] } | null> {
  const engine = await import("@paulirish/trace_engine");
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
    return null;
  }
  const context: TraceContext = {
    data,
    engine,
    harness: data.UserTimings.performanceMeasures
      .filter((one) => one.name === MEASURE_MARKS.harness)
      .map((one) => ({ from: one.ts, to: one.ts + (one.dur ?? 0) }))
      .sort((a, b) => a.from - b.from),
    kinds: new Map(Object.entries(engine.Styles.maybeInitSylesMap())),
    thread,
  };
  return { context, starts, ends };
}

/** `event`'s script stack, numbered from 0 by the engine's own read (Chrome numbers a forced layout's from 1); empty for none. */
export function stackOf(
  { engine }: TraceContext,
  event: TraceEvent
): TraceFrame[] {
  return (
    engine.Helpers.Trace.getZeroIndexedStackTraceInEventPayload(event) ?? []
  ).map((frame) => ({
    url: frame.url,
    line: frame.lineNumber,
    column: frame.columnNumber,
  }));
}
