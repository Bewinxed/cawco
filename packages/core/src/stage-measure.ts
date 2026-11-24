/**
 * A design graph's performance read (`artifact_read`'s `measure`, design
 * perf-read §1): one move measured on the stage's own drawing in the
 * daemon's headless Chromium (agent stage-measure.ts), its frames, style
 * and layout work, the animations Chrome kept off the compositor with its
 * reasons, and the memory counters over repeats, with the faults they
 * raise. The ask, the answer and the page's side of one repeat are here;
 * the rules that turn the numbers into faults too, so every hop reads one
 * line.
 */

/** The presses a one-off measurement makes, each one `userEvent` call (core stage-play.ts). */
export const MEASURE_PRESSES = ["click", "hover", "type", "key"] as const;
export type MeasurePress = (typeof MEASURE_PRESSES)[number];

/**
 * How fast the main thread runs while a move is measured: `slowed` holds
 * it at a quarter of its speed (CDP `Emulation.setCPUThrottlingRate` 4,
 * Lighthouse's mobile default), the compositor thread at full speed, so
 * motion driven from the main thread drops frames on any machine;
 * `machine` leaves it at the machine's own. The owner's pick on perf-read's
 * `speed` card: the agent picks per call, slowed when it does not.
 */
export const MEASURE_SPEEDS = ["slowed", "machine"] as const;
export type MeasureSpeed = (typeof MEASURE_SPEEDS)[number];

/** The main thread's slowdown for each {@link MeasureSpeed}. */
export const MEASURE_CPU_RATE: Record<MeasureSpeed, number> = {
  slowed: 4,
  machine: 1,
};

/** The element a one-off press is made on, in the words a play finds it by: exactly one of these. */
export type MeasureOn =
  | { name?: string; role: string }
  | { text: string }
  | { testId: string }
  | { selector: string };

/** What a measurement asks (`artifact_read`'s `measure`): a story's own play, or one press on one element; from `state.story` either way. */
export interface MeasureAsk {
  /** `type` only: the key a `key` press sends, as `KeyboardEvent.key` names it. */
  key?: string;
  on?: MeasureOn;
  play?: true;
  press?: MeasurePress;
  /** How many times the move repeats for the memory counters. */
  repeats?: number;
  speed?: MeasureSpeed;
  /** `type` only: the words typed, a key at a time. */
  text?: string;
}

/** A measurement's bounds: its repeats (fuite's 7 at least), the words a `type` press sends, and its own share of the render's limit. Ours, from the design's time table. */
export const MEASURE_LIMITS = {
  repeats: { min: 7, max: 40, fallback: 20 },
  text: 200,
  key: 40,
  /** How long a measurement may take once its page stands, ms: inside the render's 90 s. */
  ms: 45_000,
} as const;

/** The move one repeat makes on the page: the story's play, or one press. */
export type MeasureMove =
  | { by: "play" }
  | { by: MeasurePress; key?: string; on: MeasureOn; text?: string };

/**
 * What a repeat is for: `scan` reads the move's clips and length (the first
 * warm-up, the only pass that watches its animations); `warm` warms the
 * engine; `traced` is bracketed by {@link MEASURE_MARKS} for the trace;
 * `repeat` feeds the memory counters.
 */
export type MeasurePass = "scan" | "warm" | "traced" | "repeat";

/** The user-timing marks a traced play stands between: the windows the trace is read in. */
export const MEASURE_MARKS = {
  start: "cawco measure start",
  end: "cawco measure end",
} as const;

/** One repeat as the daemon asks the page for it: the state it starts at (its picture key), the move, the pass, and how long it waits once the move is pressed, ms. */
export interface MeasureRepeatAsk {
  key: string;
  move: MeasureMove;
  pass: MeasurePass;
  wait: number;
}

/** A frame of the script stack a trace gives a forced layout: its module's address and its place there, line and column from 0 as Chrome counts them. */
export interface TraceFrame {
  column: number;
  line: number;
  url: string;
}

/** One repeat as the page answers it, or why it could not be made. */
export type MeasureRun =
  | {
      /** How many times the section was loaded again, swapped or broken by a save since the page opened: a save landed while it measured when this moves. */
      edits: number;
      /** The story the move starts from, and the one it plays into (null for a one-off press). */
      from: string;
      /** The move's motion, ms from the press to its last animation's end or the drawing's last change: read by a `scan` pass, 0 by the others. */
      length: number;
      /** The element a one-off press was made on, as the stage names it. */
      on: string | null;
      to: string | null;
      /** Motion was still running when the scan's wait for it ended. */
      unsettled: boolean;
      /** The width the drawing is laid out at, px. */
      width: number;
    }
  | { refused: string };

/** What the stage's page answers a measurement with (agent canvas stage.ts): one repeat, an element named, a forced layout placed. */
export interface StageMeasuring {
  forcedAt: (stack: readonly TraceFrame[]) => Promise<ForcedAt | null>;
  measure: (ask: MeasureRepeatAsk) => Promise<MeasureRun>;
  named: (el: Element) => { element: string; source: string | null };
}

/** One counter's course over the repeats: its first and last reading, its least-squares slope per repeat, and that line's R², absent when the counter never moved. */
export interface MeasureTrend {
  end: number;
  fit?: number;
  perRepeat: number;
  start: number;
}

/** The kinds of fault a measurement raises (design perf-read §1, Faults). */
export const MEASURE_FAULTS = [
  "non-composited",
  "dropped-frames",
  "long-frame",
  "layout-every-frame",
  "forced-layout",
  "leak",
  "unsettled",
] as const;
export type MeasureFaultKind = (typeof MEASURE_FAULTS)[number];

/** One fault: its kind and the sentence naming what, where and what to do. */
export interface MeasureFault {
  kind: MeasureFaultKind;
  says: string;
}

/** An animation Chrome would not hand to the compositor. */
export interface NonComposited {
  /** What it animates: a transition's property, a keyframes' name. */
  animation: string;
  /** Its element as the stage names it, or the trace's node name when it was gone before it could be named. */
  element: string;
  /** The properties Chrome named as ones it can't composite. */
  properties: string[];
  /** Chrome's reasons, as DevTools names them (`UNSUPPORTED_CSS_PROPERTY`). */
  reasons: string[];
  /** Its element's `file:line:column`, where the dev build marks it. */
  source?: string;
}

/** Layout or style that script forced during the move, by the line that forced it. */
export interface ForcedLayout {
  /** `file:line:column`, mapped back through its module's source map where it has one. */
  at: string;
  /** How many times a traced play. */
  count: number;
  /** True when no line of the project's own code is on its stack: a library forced it, and its fix is the library's. */
  library?: true;
  ms: number;
}

/** Where a forced layout was forced, as the page places it by its stack. */
export interface ForcedAt {
  at: string;
  library: boolean;
}

/** What a measurement answers (`artifact_read`'s `measured`). Times in ms to a tenth, heap in bytes, the rest counts; frame, style and layout figures the median of the traced plays, `frames.longest` their largest. */
export interface MeasureRead {
  at: {
    /** The display's frame rate, absent when the trace held too few frames to read it. */
    hz?: number;
    scheme: "light" | "dark";
    speed: MeasureSpeed;
    width: number;
    window: [number, number];
  };
  /** The limit came before every repeat ran: `runs.repeats` says how many did. */
  cut?: true;
  faults: MeasureFault[];
  frames: {
    count: number;
    dropped: number;
    longest: number;
    longestWork: {
      layout: number;
      paint: number;
      script: number;
      style: number;
    };
  };
  layout: {
    count: number;
    everyFrame: boolean;
    forced: ForcedLayout[];
    ms: number;
  };
  length: number;
  /** Absent when fewer than three repeats ran before the limit (`cut`). */
  memory?: {
    documents: MeasureTrend;
    /** V8's used heap and Blink's, bytes: the machine code V8 compiles as the move turns hot is in it, so it is read, never judged. */
    heap: MeasureTrend;
    listeners: MeasureTrend;
    nodes: MeasureTrend;
    /** The JavaScript objects the page holds, counted before the first repeat, halfway and after the last. */
    objects: MeasureTrend;
  };
  /** The move: a play's `from` and `to` stories, or a press's story (`from`) and its element (`on`). */
  move: {
    by: "play" | MeasurePress;
    from: string;
    on?: string;
    to?: string;
  };
  nonComposited: NonComposited[];
  runs: { repeats: number; traced: number; warm: number };
  style: { count: number; elements: number; ms: number };
  took: number;
}

/** The share of a frame's time past which layout ran "every frame" while the motion ran (design perf-read §1). */
export const EVERY_FRAME_SHARE = 0.8;
/** The reason Chrome writes for a constant or off-screen animation, which costs nothing. */
export const NO_VISIBLE_CHANGE = "ANIMATION_HAS_NO_VISIBLE_CHANGE";
/** The reason Chrome writes when its compositing is off: the machine's fault, not the component's. */
export const COMPOSITING_OFF = "ACCELERATED_ANIMATIONS_DISABLED";

/** A count of ms to a tenth. */
export const tenths = (ms: number): number => Math.round(ms * 10) / 10;

/** The middle of `values` (the lower of the middle two); 0 for none. */
export const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
};

/** The course of readings taken at the repeats `points` name (`[repeat, reading]`): the least-squares line through them, and its R². */
export function trendAt(
  points: readonly (readonly [number, number])[]
): MeasureTrend {
  const start = points[0]?.[1] ?? 0;
  const end = points.at(-1)?.[1] ?? 0;
  const n = Math.max(1, points.length);
  const meanX = points.reduce((sum, [x]) => sum + x, 0) / n;
  const meanY = points.reduce((sum, [, y]) => sum + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const [x, y] of points) {
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
    syy += (y - meanY) ** 2;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  return {
    start,
    end,
    perRepeat: Math.round(slope * 100) / 100,
    ...(syy > 0 && sxx > 0
      ? { fit: Math.round(((sxy * sxy) / (sxx * syy)) * 100) / 100 }
      : {}),
  };
}

/** `readings`' course, one a repeat from the baseline: {@link trendAt} over their index. */
export const trendOf = (readings: readonly number[]): MeasureTrend =>
  trendAt(readings.map((one, at) => [at, one] as const));

/** The move an ask stage-measure-faults.ts `measureAskRefusal` passed makes. */
export const moveOf = (ask: MeasureAsk): MeasureMove =>
  ask.press && ask.on
    ? {
        by: ask.press,
        on: ask.on,
        ...(ask.text === undefined ? {} : { text: ask.text }),
        ...(ask.key === undefined ? {} : { key: ask.key }),
      }
    : { by: "play" };
