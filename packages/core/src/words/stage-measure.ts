/**
 * What a design graph's performance read says an agent (core
 * stage-measure.ts, agent stage-measure.ts, hub presenters/artifacts.ts):
 * each refusal, naming the read to send instead; each fault, naming what,
 * where and what to do next; and the read's lines.
 */

import { firstNames } from "@cawco/providers/names";
import type {
  ForcedLayout,
  FrameCall,
  FrameWork,
  MeasureOn,
  MeasureRead,
  MeasureTrend,
  NonComposited,
} from "../stage-measure";

/** An element as `on` names it, in a play's words. */
const onSaid = (on: MeasureOn): string => {
  if ("role" in on) {
    return on.name === undefined
      ? `getByRole("${on.role}")`
      : `getByRole("${on.role}", { name: "${on.name}" })`;
  }
  if ("text" in on) {
    return `getByText("${on.text}")`;
  }
  return "testId" in on
    ? `getByTestId("${on.testId}")`
    : `querySelector("${on.selector}")`;
};

const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

/** A counter's course as a line says it. */
const trendSaid = (name: string, trend: MeasureTrend, unit = ""): string =>
  `${name} ${trend.start}${unit} → ${trend.end}${unit}, ${trend.perRepeat}${unit} a repeat${trend.fit === undefined ? "" : ` (fit ${trend.fit})`}`;

/** A call as a line says it: the way it went, package by package, to the function its time went to. */
const callSaid = (call: FrameCall): string =>
  call.path
    ? `${call.path.map((step) => step.slice(0, step.lastIndexOf(" at "))).join(" → ")}, at ${call.at}`
    : `${call.name} at ${call.at}`;

/** What a costly frame held, as one line: its longest tasks with the call each began with, the functions that took its script time, its restyles. */
const workSaid = (one: FrameWork): string => {
  const tasks = firstNames(one.tasks).shown.map(
    (task) =>
      `${task.for} ${task.ms} ms${task.calls?.[0] ? ` (${callSaid(task.calls[0])})` : ""}`
  );
  const script = firstNames(one.script).shown.map(
    (fn) => `${fn.name} at ${fn.at} ${fn.ms} ms`
  );
  const elements = one.restyles.reduce((sum, r) => sum + r.elements, 0);
  return `${one.frame === "longest" ? "The longest frame" : "A dropped frame"} on the sampled play, at ${one.at} ms, ${one.ms} ms: ${tasks.length > 0 ? `tasks ${tasks.join("; ")}` : "no task of the page's"}${script.length > 0 ? `; script in ${script.join(", ")}` : ""}${one.restyles.length > 0 ? `; ${plural(one.restyles.length, "restyle")} of ${elements} elements` : ""}.`;
};

export const measureWords = {
  /** A measurement with no story to start from. */
  noStory: (first: string | null) =>
    `A measurement starts from a story: name it in state.story${first ? `, like { state: { story: "${first}" }, measure: { play: true } }` : ""}.`,
  /** Neither a play nor a press. */
  noMove:
    "Name the move to measure: measure.play: true runs state.story's own play from its from story; measure.press with measure.on makes one press on one element from state.story.",
  /** Both a play and a press. */
  bothMoves:
    "Send one move: { play: true } for the story's own play, or { press, on } for one press. A move of two presses is a play: write it as a story with from and play.",
  /** A press with no element. */
  noElement: (press: string) =>
    `A ${press} needs its element: measure.on names it by exactly one of { role, name? }, { text }, { testId } or { selector }.`,
  /** `on` naming the element more than one way, or none. */
  onOneWay:
    "measure.on names the element exactly one way: { role, name? }, { text }, { testId } or { selector }.",
  /** Words or a key sent with the wrong press. */
  textForType:
    'A type press sends its words in measure.text, like { press: "type", on: { role: "textbox", name: "Machine name" }, text: "studio-mac" }; the other presses send none.',
  keyForKey:
    'A key press names its key in measure.key as KeyboardEvent.key names it, like { press: "key", on: { role: "textbox" }, key: "Enter" }; the other presses send none.',

  /** A field of a one-off press sent with a play. */
  playTakesNoElement:
    "measure.play runs the story's own play from its from story: send { play: true } alone, or { press, on } for one press.",
  /** A design folder: no stories to play. */
  designFolder: (name: string) =>
    `${name} is a design folder. A measurement plays a story on a design graph's stage: open the piece from its states file (kind "component" with file) and measure that. To look at the folder, artifact_read({ id: "${name}", png: true }) draws its first page, and artifact_browse({ id: "${name}" }) opens each page in your browser tool.`,
  /** A story with no move of its own. */
  noPlay: (story: string) =>
    `${story} has no from and play to measure. Measure a one-off press from it instead: measure: { press: "click", on: { role: "button", name: "…" } }.`,
  /** The element a press names, found nowhere. */
  nothingMatches: (on: MeasureOn) =>
    `${onSaid(on)} matches nothing in the drawing or the layers it opened. Read the story's frame (artifact_read with state) for the roles and words it draws.`,
  /** The element a press names, found more than once. */
  severalMatch: (on: MeasureOn, found: readonly string[], more: number) =>
    `${onSaid(on)} matches ${found.length + more} elements: ${found.join(", ")}${more > 0 ? `, and ${more} more` : ""}. Name the one to press so only it matches (a role with its name comes first).`,
  /** The play or the press threw. */
  threw: (message: string, at: string | null) =>
    `The move threw as it measured${at ? ` at ${at}` : ""}: ${message}`,
  /** The play ran past its limit. */
  playTooLong: (seconds: number) =>
    `The move's play ran past ${seconds} s. A measurement reads one move: split it into stories of its own.`,
  /** A press's element has no box to press: hidden, or drawn at no size. */
  noBox: (element: string) =>
    `${element} has no box to press: it is hidden or drawn at no size. Press the element a person sees, or open what shows it first in the story's play.`,
  /** Another element stands over the middle of the one a press names, so a real press lands on it. */
  covered: (element: string, over: string | null) =>
    `A press on ${element} lands on ${over ?? "nothing in the page"}, which stands over its middle. Press the element on top, or close what covers it first in the story's play.`,
  /** A measuring page without the daemon's real input: a daemon older than the stage it measures. */
  noInput:
    "The stage's page has no real input to press with: the daemon predates it. Update the daemon on the workspace's machine, then read again.",
  /** A save landed while it measured. */
  changed:
    "The states file or a file it draws from changed while this measured, so the numbers mix two versions. Read again.",
  /** Chromium's compositing is off on this machine. */
  compositingOff:
    "This machine's browser has its compositing switched off (ACCELERATED_ANIMATIONS_DISABLED on every animation), so it can't say which animations run on the compositor. That is a fault of the machine, not of the component: measure on another machine.",
  /** The render was let go before the traced plays were done. */
  tooLong:
    "The move's scan and traced plays did not finish before the read was let go. Measure a shorter move, or split its play into stories of its own.",

  /* --- Faults ---------------------------------------------------------- */

  nonComposited: (one: NonComposited) =>
    `${one.animation} on ${one.element}${one.source ? ` (${one.source})` : ""} runs on the main thread (${one.reasons.join(", ")}): ${one.properties.length > 0 ? `Chrome can't composite ${one.properties.join(", ")}. Animate transform, opacity or a clip instead (the animation-performance skill).` : "Chrome kept it off the compositor. Animate transform or opacity on an element of its own (the animation-performance skill)."}`,
  droppedFrames: (plays: number, of: number, dropped: number) =>
    `Frames were dropped in ${plays} of ${of} traced plays (${plural(dropped, "frame")} in the median play): the main thread could not keep up with the motion. frames.work names what ran in each dropped frame: its tasks, the functions that took its script time, each restyle's elements.`,
  longFrame: (ms: number, work: MeasureRead["frames"]["longestWork"]) =>
    `The longest frame took ${ms} ms, past Chrome's 50 ms long animation frame line: script ${work.script} ms, style ${work.style} ms, layout ${work.layout} ms, paint ${work.paint} ms. frames.work names who ran it: its tasks and the calls they began with, the functions that took its script time, each restyle's elements.`,
  layoutEveryFrame: (share: number) =>
    `Layout ran in ${Math.round(share * 100)}% of the frames while the motion ran, so the motion is driven from the main thread. Animate transform or opacity instead of a layout property, or hand a script-driven spring to a CSS transition or a Web Animation.`,
  forcedLayout: (one: ForcedLayout) =>
    `Script forced layout during the move at ${one.at} (${plural(one.count, "time")}, ${one.ms} ms)${one.cause ? `, reading what the write at ${one.cause.at} left stale (${one.cause.what})` : ""}. Read layout before writing styles in that code, or move the read out of the frame.`,
  leak: (
    left: {
      documents: number;
      listeners: number;
      nodes: number;
      objects: number;
    },
    repeats: number
  ) => {
    const parts = [
      ...(left.objects > 0 ? [plural(left.objects, "JavaScript object")] : []),
      ...(left.nodes > 0 ? [plural(left.nodes, "DOM node")] : []),
      ...(left.listeners > 0 ? [plural(left.listeners, "event listener")] : []),
      ...(left.documents > 0 ? [plural(left.documents, "document")] : []),
    ];
    return `Each repeat leaves ${parts.join(", ")} behind (${repeats} repeats). For what holds them, hand the move to a browser delegate with DevTools heap tools.`;
  },
  unsettled: (seconds: number) =>
    `Motion was still running ${seconds} s after the move: an endless animation, or one longer than ${seconds} s. The numbers cover its first ${seconds} s.`,

  /* --- The read, as lines -------------------------------------------- */

  /** A measurement's lines for the concise answer: the move, the numbers, every fault. */
  lines: (read: MeasureRead): string[] => {
    const { frames, style, layout, memory } = read;
    return [
      `Measured ${read.move.from} → ${read.move.to ?? `${read.move.by}${read.move.on ? ` on ${read.move.on}` : ""}`} at ${read.at.width}px ${read.at.scheme}, main thread ${read.at.speed === "slowed" ? "slowed 4×" : "at the machine's speed"}${read.at.hz ? `, ${read.at.hz} Hz` : ""}: ${read.runs.traced} traced plays, ${read.runs.attributed} attribution plays, ${read.runs.repeats} repeats, ${(read.took / 1000).toFixed(1)} s${read.cut ? " (cut at the render's deadline)" : ""}.`,
      `Motion ${read.length} ms. Frames: ${frames.count} drawn, ${frames.dropped} dropped, longest ${frames.longest} ms (script ${frames.longestWork.script}, style ${frames.longestWork.style}, layout ${frames.longestWork.layout}, paint ${frames.longestWork.paint} ms).`,
      ...(frames.input.length > 0
        ? [
            `Input arrived as ${plural(frames.input.length, "task")}: ${frames.input.map((one) => `${one.for} at ${one.at} ms, ${one.ms} ms`).join("; ")}.`,
          ]
        : []),
      ...(frames.work ?? []).map(workSaid),
      `Style: ${plural(style.count, "recalc")}, ${style.ms} ms, ${style.elements} elements. Layout: ${layout.count}, ${layout.ms} ms${layout.everyFrame ? ", every frame" : ""}${layout.forced.length > 0 ? `, forced at ${layout.forced.map((one) => `${one.at}${one.library ? " (a library's)" : ""}${one.cause ? ` after the write at ${one.cause.at}` : ""}`).join(", ")}` : ""}.`,
      read.nonComposited.length > 0
        ? `Off the compositor: ${read.nonComposited.map((one) => `${one.animation} on ${one.element} (${one.reasons.join(", ")})`).join("; ")}.`
        : "Every animation ran on the compositor.",
      memory
        ? `Memory after garbage collection: ${trendSaid("objects", memory.objects)}; ${trendSaid("nodes", memory.nodes)}; ${trendSaid("listeners", memory.listeners)}; ${trendSaid("documents", memory.documents)}; ${trendSaid("heap", memory.heap, " B")}, compiled code in it.`
        : "Memory: too few repeats ran before the render's deadline to read a trend.",
      ...(read.faults.length > 0
        ? [
            `Faults (${read.faults.length}):`,
            ...read.faults.map((one) => `- ${one.kind}: ${one.says}`),
          ]
        : ["No faults: the move is clean."]),
    ];
  },
};
