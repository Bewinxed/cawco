/**
 * What a design graph's performance read says an agent (core
 * stage-measure.ts, agent stage-measure.ts, hub presenters/artifacts.ts):
 * each refusal, naming the read to send instead; each fault, naming what,
 * where and what to do next; and the read's lines.
 */
import type {
  ForcedLayout,
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
    `${name} is a design folder. A measurement plays a story on a design graph's stage: open the piece from its states file (kind "component" with file) and measure that.`,
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
  /** A save landed while it measured. */
  changed:
    "The states file or a file it draws from changed while this measured, so the numbers mix two versions. Read again.",
  /** Chromium's compositing is off on this machine. */
  compositingOff:
    "This machine's browser has its compositing switched off (ACCELERATED_ANIMATIONS_DISABLED on every animation), so it can't say which animations run on the compositor. That is a fault of the machine, not of the component: measure on another machine.",
  /** The render's deadline came before the traced plays were done. */
  tooLong: (seconds: number) =>
    `The move's scan and traced plays did not finish within the render's ${seconds} s. Measure a shorter move, or split its play into stories of its own.`,

  /* --- Faults ---------------------------------------------------------- */

  nonComposited: (one: NonComposited) =>
    `${one.animation} on ${one.element}${one.source ? ` (${one.source})` : ""} runs on the main thread (${one.reasons.join(", ")}): ${one.properties.length > 0 ? `Chrome can't composite ${one.properties.join(", ")}. Animate transform, opacity or a clip instead (the animation-performance skill).` : "Chrome kept it off the compositor. Animate transform or opacity on an element of its own (the animation-performance skill)."}`,
  droppedFrames: (plays: number, of: number, dropped: number) =>
    `Frames were dropped in ${plays} of ${of} traced plays (${plural(dropped, "frame")} in the median play): the main thread could not keep up with the motion. frames.longestWork says what took the longest frame's time.`,
  longFrame: (ms: number, work: MeasureRead["frames"]["longestWork"]) =>
    `The longest frame took ${ms} ms, past Chrome's 50 ms long animation frame line: script ${work.script} ms, style ${work.style} ms, layout ${work.layout} ms, paint ${work.paint} ms.`,
  layoutEveryFrame: (share: number) =>
    `Layout ran in ${Math.round(share * 100)}% of the frames while the motion ran, so the motion is driven from the main thread. Animate transform or opacity instead of a layout property, or hand a script-driven spring to a CSS transition or a Web Animation.`,
  forcedLayout: (one: ForcedLayout) =>
    `Script forced layout during the move at ${one.at} (${plural(one.count, "time")}, ${one.ms} ms). Read layout before writing styles in that code, or move the read out of the frame.`,
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
      `Measured ${read.move.from} → ${read.move.to ?? `${read.move.by}${read.move.on ? ` on ${read.move.on}` : ""}`} at ${read.at.width}px ${read.at.scheme}, main thread ${read.at.speed === "slowed" ? "slowed 4×" : "at the machine's speed"}${read.at.hz ? `, ${read.at.hz} Hz` : ""}: ${read.runs.traced} traced plays, ${read.runs.repeats} repeats, ${(read.took / 1000).toFixed(1)} s${read.cut ? " (cut at the render's deadline)" : ""}.`,
      `Motion ${read.length} ms. Frames: ${frames.count} drawn, ${frames.dropped} dropped, longest ${frames.longest} ms (script ${frames.longestWork.script}, style ${frames.longestWork.style}, layout ${frames.longestWork.layout}, paint ${frames.longestWork.paint} ms).`,
      `Style: ${plural(style.count, "recalc")}, ${style.ms} ms, ${style.elements} elements. Layout: ${layout.count}, ${layout.ms} ms${layout.everyFrame ? ", every frame" : ""}${layout.forced.length > 0 ? `, forced at ${layout.forced.map((one) => `${one.at}${one.library ? " (a library's)" : ""}`).join(", ")}` : ""}.`,
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
