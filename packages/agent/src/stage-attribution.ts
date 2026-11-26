/**
 * Who did a measured move's costly work, and what caused it (design
 * perf-read, the owner's `attribution` card, 2026-11-24): two more plays
 * after the timed ones, untimed so neither tool slows a play the figures
 * come from.
 *
 * - The first records V8's CPU sampler (`disabled-by-default-v8.cpu_profiler`):
 *   for its longest frame and each frame it dropped, the functions whose
 *   samples fell in it, each at the line most of them fell on and mapped
 *   back through its module's source map (canvas forced.ts), each style
 *   recalculation with the elements it restyled, and the main thread's
 *   tasks with what set each off.
 * - The second records Chrome's invalidation tracking
 *   (`disabled-by-default-devtools.timeline.invalidationTracking`), which the
 *   trace engine's Invalidations handler pairs with each recalculation and
 *   layout: for each one script forced, the write that left it stale.
 *
 * The stage's own marked work (canvas harness.ts) and its own code are
 * left out, as the timed read leaves them.
 */

import { recordLimitReading } from "@cawco/core/limit-readings";
import type {
  ForcedAt,
  FrameCall,
  FrameRestyle,
  FrameScript,
  FrameTask,
  FrameWork,
  TraceFrame,
} from "@cawco/core/stage-measure";
import { median, tenths } from "@cawco/core/stage-measure";
import { derivedName } from "@cawco/providers/derived-name";
import type * as TraceEngine from "@paulirish/trace_engine";
import type { Browser, Page } from "playwright-core";
import { z } from "zod";
import { forcedAllNow } from "./in-page/page";
import {
  droppedByHarness,
  type Frame,
  forcedIn,
  harnessIn,
  harnessOf,
  longestGap,
  parsedTrace,
  stackOf,
  type TraceContext,
  type TraceEvent,
  US,
} from "./stage-trace";

/** The CPU sampler's category: its samples become the trace's profile. */
const SAMPLED = "disabled-by-default-v8.cpu_profiler";
/** Chrome's invalidation tracking: each write that made style or layout stale. */
const INVALIDATIONS =
  "disabled-by-default-devtools.timeline.invalidationTracking";
/** The most functions and tasks a frame names: the rest are the long tail. */
// @limit recording: agent.frame-named until 2026-12-10
const MOST_NAMED = 8;
/** The most calls a task names, longest first. */
// @limit recording: agent.task-calls-named until 2026-12-10
const MOST_CALLS = 3;
/** Less than this, ms, a function or a task is noise in a frame. */
const LEAST_MS = 0.1;
/** The profile's own nodes for time no function of a page's took. */
const NOT_SCRIPT: ReadonlySet<string> = new Set([
  "(idle)",
  "(program)",
  "(garbage collector)",
  "(root)",
]);
/** An event that is input: what a press or a key arrives as. */
const INPUT =
  /^(?:pointer|mouse|key|touch|click$|dblclick$|auxclick$|contextmenu$|input$|beforeinput$|wheel$)/u;
/** The steps of a frame's own rendering, by which a task is the frame's. */
const RENDERING: ReadonlySet<string> = new Set([
  "Commit",
  "Paint",
  "Layerize",
  "PrePaint",
]);

type Node = TraceEngine.Helpers.TreeHelpers.TraceEntryNode;
type Profile = TraceEngine.Handlers.ModelHandlers.Samples.ProfileData;
type Mark = TraceEngine.Types.Events.PerformanceMark;

/** One play recorded with `categories`: Playwright's trace of it. */
export async function recorded(
  browser: Browser,
  page: Page,
  categories: readonly string[],
  play: () => Promise<unknown>
): Promise<Buffer> {
  await browser.startTracing(page, { categories: [...categories] });
  let trace: Buffer;
  try {
    await play();
  } finally {
    trace = await browser.stopTracing();
  }
  return trace;
}

/** Every node under `node`, itself first, depth first. */
function* within(node: Node): Generator<Node> {
  yield node;
  for (const child of node.children) {
    yield* within(child);
  }
}

/** What an `EventDispatch` carries: the event's type. */
const DispatchArgs = z.object({ data: z.object({ type: z.string() }) });
/** What a `FunctionCall` carries: the function's name, when it has one. */
const CallArgs = z.object({
  data: z.object({ functionName: z.string().optional() }).optional(),
});
/** What an invalidation carries, as far as the read says it. */
const InvalidationArgs = z.object({
  data: z
    .object({
      changedAttribute: z.string().optional(),
      changedClass: z.string().optional(),
      changedId: z.string().optional(),
      nodeName: z.string().optional(),
      reason: z.string().optional(),
    })
    .optional(),
});

/** The events a task dispatched, by type, in order, once each. */
const dispatched = (task: Node): string[] => [
  ...new Set(
    [...within(task)].flatMap(({ entry }) => {
      const args =
        entry.name === "EventDispatch"
          ? DispatchArgs.safeParse(entry.args)
          : null;
      return args?.success ? [args.data.data.type] : [];
    })
  ),
];

/** The kind of work an event is, where a task's time is told by it: its outermost such event. */
const KIND_OF: ReadonlyMap<string, string> = new Map([
  ["TimerFire", "timer"],
  ["FireAnimationFrame", "animation frame"],
  ["FunctionCall", "script"],
  ["EvaluateScript", "script"],
  ["V8.Execute", "script"],
  ["RunMicrotasks", "script"],
  ["HandlePostMessage", "message"],
  ...[...RENDERING].map((name) => [name, "rendering"] as const),
  ["UpdateLayoutTree", "rendering"],
  ["Layout", "rendering"],
]);

/** Each kind of work in `node`'s subtree, its outermost events' time (µs). */
function kindsIn(node: Node, into: Map<string, number>): Map<string, number> {
  const kind = KIND_OF.get(node.entry.name);
  if (kind) {
    into.set(kind, (into.get(kind) ?? 0) + (node.entry.dur ?? 0));
    return into;
  }
  for (const child of node.children) {
    kindsIn(child, into);
  }
  return into;
}

/** What set a task off: its input events by type; else the kind of work most of its time went to (a timer, an animation frame, rendering, script, a message); else `task`. */
function taskFor(task: Node): string {
  const input = dispatched(task).filter((type) => INPUT.test(type));
  if (input.length > 0) {
    return input.join(", ");
  }
  const most = [...kindsIn(task, new Map())].reduce<[string, number]>(
    (best, one) => (one[1] > best[1] ? one : best),
    ["task", 0]
  );
  return most[0];
}

/** The main thread's tasks that ran between `from` and `to` (µs), each with its time inside them, the stage's own time left out. */
function tasksIn(
  { harness, thread }: TraceContext,
  from: number,
  to: number
): (FrameTask & { input: boolean; node: Node; ts: number })[] {
  return [...(thread.tree?.roots ?? [])].flatMap((task) => {
    const { entry } = task;
    const start = Math.max(from, entry.ts);
    const end = Math.min(to, entry.ts + (entry.dur ?? 0));
    const ms = (end - start - harnessIn(harness, start, end)) / US;
    return ms < LEAST_MS
      ? []
      : [
          {
            for: taskFor(task),
            ms: tenths(ms),
            ts: entry.ts,
            node: task,
            input: dispatched(task).some((type) => INPUT.test(type)),
          },
        ];
  });
}

/** The outermost calls into script under `node`: where each task's script began. */
function* callsUnder(node: Node): Generator<TraceEvent> {
  if (node.entry.name === "FunctionCall") {
    yield node.entry;
    return;
  }
  for (const child of node.children) {
    yield* callsUnder(child);
  }
}

/** The tasks the move's input arrived as between `from` and `to` (µs), in order, each at ms from `from`. */
export function inputTasks(
  context: TraceContext,
  from: number,
  to: number
): (FrameTask & { at: number })[] {
  return tasksIn(context, from, to)
    .filter((task) => task.input)
    .map((task) => ({
      at: tenths((task.ts - from) / US),
      for: task.for,
      ms: task.ms,
    }));
}

/** The profile V8 sampled on the thread the play's start mark stands on. */
const profileOf = ({ data }: TraceContext, start: Mark): Profile | undefined =>
  data.Samples.profilesInProcess.get(start.pid)?.get(start.tid);

/** A function's name, and the time its samples took, line by line (µs). */
interface Sampled {
  lines: Map<string, { frame: TraceFrame; us: number }>;
  name: string;
}

type ProfileNode = NonNullable<
  ReturnType<Profile["parsedProfile"]["nodeByIndex"]>
>;

/** The function a sample is charged to: its own, or, in code with no address (a built-in, `performance.now`), its nearest caller's; none for time no page function took. */
function chargedTo(leaf: ProfileNode | null): ProfileNode | null {
  let node = leaf;
  while (node && !node.url) {
    if (NOT_SCRIPT.has(node.functionName)) {
      return null;
    }
    node = node.parent;
  }
  return node;
}

/** Where sample `index` ran in `node`, the nearest function with an address: the line V8 took it on in that function (1-based, 0 unknown), else where the function begins. */
function lineOf(
  model: Profile["parsedProfile"],
  index: number,
  node: ProfileNode
): TraceFrame {
  const { callFrame } = node;
  const line = model.lines?.[index] ?? 0;
  const column = model.columns?.[index] ?? 0;
  return line > 0
    ? { url: callFrame.url, line: line - 1, column: Math.max(0, column - 1) }
    : {
        url: callFrame.url,
        line: callFrame.lineNumber,
        column: callFrame.columnNumber,
      };
}

/**
 * The functions whose samples fell between `from` and `to` (µs), each
 * with its time line by line, the stage's own marked work left out.
 */
function sampledIn(
  { harness, thread }: TraceContext,
  profile: Profile,
  from: number,
  to: number
): Map<string, Sampled> {
  const model = profile.parsedProfile;
  // A sample taken while script waited on a style recalculation or a layout it forced is that work's, which `restyles` and `layout.forced` tell.
  const rendering = [...thread.recalcStyleEvents, ...thread.layoutEvents]
    .filter((one) => one.ts < to && one.ts + (one.dur ?? 0) > from)
    .map((one) => ({ from: one.ts, to: one.ts + (one.dur ?? 0) }));
  const { timestamps } = model;
  const byFunction = new Map<string, Sampled>();
  // The profile keeps its times in ms, the trace's events in µs.
  for (const [index, ms] of timestamps.entries()) {
    const ts = ms * US;
    const next = (timestamps[index + 1] ?? ms) * US;
    if (
      ts < from ||
      ts >= to ||
      harnessIn(harness, ts, next) > 0 ||
      harnessIn(rendering, ts, ts + 1) > 0
    ) {
      continue;
    }
    const node = chargedTo(model.nodeByIndex(index));
    if (!node) {
      continue;
    }
    const { callFrame } = node;
    const key = `${callFrame.url}:${callFrame.lineNumber}:${callFrame.columnNumber}`;
    const own: Sampled = byFunction.get(key) ?? {
      name: callFrame.functionName || "(anonymous)",
      lines: new Map(),
    };
    const at = lineOf(model, index, node);
    const lineKey = `${at.line}:${at.column}`;
    const had = own.lines.get(lineKey) ?? { frame: at, us: 0 };
    own.lines.set(lineKey, { frame: at, us: had.us + (next - ts) });
    byFunction.set(key, own);
  }
  return byFunction;
}

/** A costly frame of the sampled play: its window (µs) and why it is named. */
interface Costly {
  frame: FrameWork["frame"];
  from: number;
  to: number;
}

/** How much longer than one frame's interval the longest frame must take to be named: it missed one at least. */
const MISSED = 1.5;

/** The sampled play's longest frame, when it missed one frame's interval at least, and each frame it dropped outside it, the stage's own drops left out. */
function costlyIn(context: TraceContext, from: number, to: number): Costly[] {
  const inWindow = context.data.Frames.frames.filter(
    (one: Frame) => one.startTime >= from && one.startTime < to
  );
  const interval = median(inWindow.map((one) => one.duration)) / US;
  const gap = longestGap(context, inWindow, from);
  const dropped = inWindow.filter(
    (one) =>
      one.dropped &&
      !droppedByHarness(context, one) &&
      !(one.startTime >= gap.from && one.startTime < gap.to)
  );
  return [
    ...(gap.ms > 0 && gap.ms >= MISSED * interval
      ? [{ frame: "longest" as const, from: gap.from, to: gap.to }]
      : []),
    ...dropped.map((one) => ({
      frame: "dropped" as const,
      from: one.startTime,
      to: one.endTime,
    })),
  ];
}

/** Each stack placed in the project's code (canvas forced.ts), in one call to the page: by its key. */
async function placed(
  page: Page,
  stacks: Map<string, TraceFrame[]>
): Promise<Map<string, ForcedAt>> {
  const keys = [...stacks.keys()];
  const all = await page.evaluate(forcedAllNow, [...stacks.values()]);
  return new Map(
    keys.flatMap((key, index) => {
      const one = all[index];
      return one ? [[key, one] as const] : [];
    })
  );
}

const keyOf = (stack: readonly TraceFrame[]): string => JSON.stringify(stack);

/** A costly frame as read before its places are mapped. */
interface Read {
  calls: {
    /** The functions from the call's entry down to where its time went, each its frame and name. */
    chain: { frame: TraceFrame; name: string }[];
    ms: number;
    name: string;
    stack: TraceFrame[];
    task: Node;
  }[];
  costly: Costly;
  restyles: TraceEngine.Types.Events.RecalcStyle[];
  sampled: Map<string, Sampled>;
  tasks: ReturnType<typeof tasksIn>;
}

/** The line most of a function's samples fell on. */
const hottest = (one: Sampled): TraceFrame =>
  [...one.lines.values()].reduce((most, line) =>
    line.us > most.us ? line : most
  ).frame;

/** Most of a call's time: the share of its samples a function must run under to stand for it. */
const MAJORITY_SHARE = 0.6;

/**
 * Where a call's time went: the deepest function with an address that
 * most of the call's samples between `from` and `to` (µs) ran under, so a
 * framework's entry (a microtask that runs a queue) is told by the flush it
 * runs, where its work fans out; null without samples.
 */
function heavyIn(
  profile: Profile | undefined,
  from: number,
  to: number
): ProfileNode | null {
  if (!profile) {
    return null;
  }
  const model = profile.parsedProfile;
  const under = new Map<ProfileNode, number>();
  let total = 0;
  for (const [index, ms] of model.timestamps.entries()) {
    const ts = ms * US;
    if (ts < from || ts >= to) {
      continue;
    }
    const us = (model.timestamps[index + 1] ?? ms) * US - ts;
    total += us;
    for (let node = model.nodeByIndex(index); node; node = node.parent) {
      if (node.url) {
        under.set(node, (under.get(node) ?? 0) + us);
      }
    }
  }
  return [...under]
    .filter(([, us]) => us >= MAJORITY_SHARE * total)
    .reduce<ProfileNode | null>(
      (deepest, [node]) =>
        !deepest || node.depth > deepest.depth ? node : deepest,
      null
    );
}

/** A profile node's place, as a frame. */
const frameOf = (node: ProfileNode): TraceFrame => ({
  url: node.url,
  line: node.lineNumber,
  column: node.columnNumber,
});

/** The functions with an address from the root down to `node`, outermost first. */
const chainTo = (node: ProfileNode | null): Read["calls"][number]["chain"] => {
  const chain: Read["calls"][number]["chain"] = [];
  for (let at = node; at; at = at.parent) {
    if (at.url) {
      chain.unshift({ frame: frameOf(at), name: at.functionName });
    }
  }
  return chain;
};

/** The calls each task's script began with in `costly`, each told by where its time went ({@link heavyIn}), the stage's own time left out. */
const callsIn = (
  context: TraceContext,
  profile: Profile | undefined,
  costly: Costly,
  tasks: ReturnType<typeof tasksIn>
): Read["calls"] =>
  tasks.flatMap((task) =>
    [...callsUnder(task.node)].flatMap((call) => {
      const from = Math.max(costly.from, call.ts);
      const to = Math.min(costly.to, call.ts + (call.dur ?? 0));
      const ms = (to - from - harnessIn(context.harness, from, to)) / US;
      if (ms < LEAST_MS) {
        return [];
      }
      const heavy = heavyIn(profile, from, to);
      const stack = heavy
        ? [frameOf(heavy)]
        : stackOf(context, call).slice(0, 1);
      const name =
        heavy?.functionName ??
        CallArgs.safeParse(call.args).data?.data?.functionName ??
        "";
      return stack.length > 0
        ? [{ task: task.node, stack, ms, name, chain: chainTo(heavy) }]
        : [];
    })
  );

/** Every place a read names, by its key, to map in one call. */
function stacksOf(
  context: TraceContext,
  reads: readonly Read[]
): Map<string, TraceFrame[]> {
  const stacks = new Map<string, TraceFrame[]>();
  for (const read of reads) {
    for (const one of read.calls) {
      stacks.set(keyOf(one.stack), one.stack);
      for (const link of one.chain) {
        stacks.set(keyOf([link.frame]), [link.frame]);
      }
    }
    for (const one of read.sampled.values()) {
      stacks.set(keyOf([hottest(one)]), [hottest(one)]);
    }
    for (const restyle of read.restyles) {
      const stack = stackOf(context, restyle);
      if (stack.length > 0) {
        stacks.set(keyOf(stack), stack);
      }
    }
  }
  return stacks;
}

/** What a placed function or call is called, and whose it is. */
const said = (place: ForcedAt, name: string) => ({
  at: place.at,
  name: name || place.name || "(anonymous)",
  ...(place.library ? { library: true as const } : {}),
});

/** The functions that took a frame's script time, by where they are written, most first. */
function scriptOf(read: Read, places: Map<string, ForcedAt>): FrameScript[] {
  const script = new Map<string, FrameScript>();
  for (const one of read.sampled.values()) {
    const place = places.get(keyOf([hottest(one)]));
    if (place) {
      const us = [...one.lines.values()].reduce(
        (sum, line) => sum + line.us,
        0
      );
      const had = script.get(place.at);
      script.set(place.at, {
        ...said(place, had?.name ?? one.name),
        ms: (had?.ms ?? 0) + us / US,
      });
    }
  }
  const named = [...script.values()]
    .map((one) => ({ ...one, ms: tenths(one.ms) }))
    .filter((one) => one.ms >= LEAST_MS)
    .sort((a, b) => b.ms - a.ms);
  recordLimitReading("agent.frame-named", named.length);
  return named.slice(0, MOST_NAMED);
}

const PACKAGE = /^node_modules\/((?:@[^/]+\/)?[^/]+)\//u;

/** The package a placed function is in (`svelte`, `@floating-ui/dom`), else its file: the unit a path names once. */
const unitOf = (at: string): string =>
  at.match(PACKAGE)?.[1] ?? at.slice(0, at.indexOf(":"));

/**
 * How a call reached where its time went, one step a package (or a file
 * of the project's), outermost first: the step's named functions in call
 * order, at where its outermost is written (`run_micro_tasks › flush ›
 * update_effect at node_modules/svelte/…`). Empty when it never left one.
 */
function pathOf(
  call: Read["calls"][number],
  places: Map<string, ForcedAt>
): string[] {
  const steps: { names: string[]; place: ForcedAt; unit: string }[] = [];
  for (const link of call.chain) {
    const place = places.get(keyOf([link.frame]));
    if (!place) {
      continue;
    }
    const unit = unitOf(place.at);
    const last = steps.at(-1);
    if (last?.unit === unit) {
      if (link.name && last.names.at(-1) !== link.name) {
        last.names.push(link.name);
      }
    } else {
      steps.push({ names: link.name ? [link.name] : [], place, unit });
    }
  }
  return steps.length > 1
    ? steps.map(
        (step) =>
          `${step.names.length > 0 ? step.names.join(" › ") : "(anonymous)"} at ${step.place.at}`
      )
    : [];
}

/** A frame's tasks, longest first, each with the calls its script began with. */
function tasksOf(read: Read, places: Map<string, ForcedAt>): FrameTask[] {
  const calls = new Map<Node, FrameCall[]>();
  for (const one of read.calls) {
    const place = places.get(keyOf(one.stack));
    if (place) {
      const path = pathOf(one, places);
      calls.set(one.task, [
        ...(calls.get(one.task) ?? []),
        {
          ...said(place, one.name),
          ms: tenths(one.ms),
          ...(path.length > 0 ? { path } : {}),
        },
      ]);
    }
  }
  recordLimitReading("agent.frame-named", read.tasks.length);
  return [...read.tasks]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, MOST_NAMED)
    .map((task) => {
      const all = calls.get(task.node) ?? [];
      recordLimitReading("agent.task-calls-named", all.length);
      const its = all.sort((a, b) => b.ms - a.ms).slice(0, MOST_CALLS);
      return {
        for: task.for,
        ms: task.ms,
        ...(its.length > 0 ? { calls: its } : {}),
      };
    });
}

/** The sampled play read: what each costly frame held. */
async function workOf(
  page: Page,
  trace: Buffer,
  windowMs: number
): Promise<FrameWork[]> {
  const parsed = await parsedTrace(trace);
  const start = parsed?.starts[0];
  if (!(parsed && start)) {
    return [];
  }
  const { context } = parsed;
  const profile = profileOf(context, start);
  const reads = costlyIn(context, start.ts, start.ts + windowMs * US).map(
    (costly): Read => {
      const tasks = tasksIn(context, costly.from, costly.to);
      return {
        costly,
        tasks,
        calls: callsIn(context, profile, costly, tasks),
        restyles: context.thread.recalcStyleEvents.filter(
          (one) =>
            one.ts >= costly.from &&
            one.ts < costly.to &&
            !harnessOf(context.harness, one)
        ),
        sampled: profile
          ? sampledIn(context, profile, costly.from, costly.to)
          : new Map(),
      };
    }
  );
  const places = await placed(page, stacksOf(context, reads));
  return reads.map((read) => ({
    at: tenths((read.costly.from - start.ts) / US),
    frame: read.costly.frame,
    ms: tenths((read.costly.to - read.costly.from) / US),
    restyles: read.restyles.map((one): FrameRestyle => {
      const forcedAt = places.get(keyOf(stackOf(context, one)))?.at;
      return {
        ms: tenths((one.dur ?? 0) / US),
        elements: one.args.elementCount ?? 0,
        ...(forcedAt ? { forcedAt } : {}),
      };
    }),
    script: scriptOf(read, places),
    tasks: tasksOf(read, places),
  }));
}

/** What an invalidation changed, in a line: Chrome's reason or the class, attribute or id that changed, and the element. */
function changed(event: TraceEvent): string {
  const data = InvalidationArgs.safeParse(event.args).data?.data ?? {};
  const what =
    (data.changedClass && `class ${data.changedClass}`) ||
    (data.changedAttribute && `attribute ${data.changedAttribute}`) ||
    (data.changedId && `id ${data.changedId}`) ||
    data.reason ||
    "a change";
  return data.nodeName ? `${what} on ${elementOf(data.nodeName)}` : what;
}

const NODE_NAME = /^(\w+)(?: id='([^']*)')?(?: class='([^']*)')?/u;

/** An element as the trace names it (`DIV id='x' class='a b c'`), as a selector a person reads: its tag, id and classes, as one derived name. */
function elementOf(nodeName: string): string {
  const [, tag = nodeName, id, classes] = nodeName.match(NODE_NAME) ?? [];
  const named = (classes ?? "").split(" ").filter(Boolean);
  return derivedName(
    `${tag.toLowerCase()}${id ? `#${id}` : ""}${named.map((one) => `.${one}`).join("")}`
  );
}

/** The tracked play read: for each place script forced style or layout, the write that left it stale (its latest one with a stack before the forced read). */
async function causesOf(
  page: Page,
  trace: Buffer
): Promise<Map<string, { at: string; what: string }>> {
  const parsed = await parsedTrace(trace);
  const start = parsed?.starts[0];
  if (!(parsed && start)) {
    return new Map();
  }
  const { context } = parsed;
  const end = parsed.ends[0]?.ts ?? Number.POSITIVE_INFINITY;
  const pairs = forcedEvents(context, start.ts, end).flatMap((event) => {
    const write = (
      context.data.Invalidations.invalidationsForEvent.get(event) ?? []
    )
      .filter((one) => one.ts <= event.ts)
      .map((one) => ({ one, stack: writtenAt(context, one) }))
      .filter(({ stack }) => stack.length > 0)
      .at(-1);
    return write
      ? [
          {
            read: stackOf(context, event),
            write: write.stack,
            what: changed(write.one),
          },
        ]
      : [];
  });
  const stacks = new Map<string, TraceFrame[]>();
  for (const pair of pairs) {
    stacks.set(keyOf(pair.read), pair.read);
    stacks.set(keyOf(pair.write), pair.write);
  }
  const places = await placed(page, stacks);
  const causes = new Map<string, { at: string; what: string }>();
  for (const pair of pairs) {
    const read = places.get(keyOf(pair.read));
    const write = places.get(keyOf(pair.write));
    if (read && write && !causes.has(read.at)) {
      causes.set(read.at, { at: write.at, what: pair.what });
    }
  }
  return causes;
}

/** Where an invalidation was written: its stack, which Chrome numbers from 1 and the engine passes on as it is, numbered from 0 as every other stack here. */
const writtenAt = (context: TraceContext, event: TraceEvent): TraceFrame[] =>
  stackOf(context, event).map((frame) => ({
    url: frame.url,
    line: Math.max(0, frame.line - 1),
    column: Math.max(0, frame.column - 1),
  }));

/** The recalculations and layouts script forced in `from`–`end` (µs), the stage's own left out. */
const forcedEvents = (context: TraceContext, from: number, end: number) =>
  [...context.thread.recalcStyleEvents, ...context.thread.layoutEvents].filter(
    (one) =>
      one.ts >= from &&
      one.ts < end &&
      !harnessOf(context.harness, one) &&
      forcedIn(context, [one], end).length > 0
  );

/**
 * The sampled attribution play: `play` recorded with `categories` and V8's
 * CPU sampler, at the traced plays' speed, read for what each costly frame
 * in its first `windowMs` (the move and its quiet) held.
 */
export async function sampledWork(
  browser: Browser,
  page: Page,
  categories: readonly string[],
  play: () => Promise<unknown>,
  windowMs: number
): Promise<FrameWork[]> {
  return await workOf(
    page,
    await recorded(browser, page, [...categories, SAMPLED], play),
    windowMs
  );
}

/**
 * The tracked attribution play: `play` recorded with `categories` and
 * Chrome's invalidation tracking, read for the write behind each place
 * script forced style or layout, by that place. Which write left layout
 * stale does not hang on the main thread's speed, so it runs at the
 * machine's own.
 */
export async function writesBehind(
  browser: Browser,
  page: Page,
  categories: readonly string[],
  play: () => Promise<unknown>
): Promise<Map<string, { at: string; what: string }>> {
  return await causesOf(
    page,
    await recorded(browser, page, [...categories, INVALIDATIONS], play)
  );
}
