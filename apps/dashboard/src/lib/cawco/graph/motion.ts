/**
 * A move's clips (spec, The move): every animation the engine ran on the
 * stage while a story's `play` moved the live component, as the Animation
 * face draws and tunes them. The page reads each one where it runs (core
 * stage-graph.ts `ClipRead`: its element and frames stay on the page) and
 * the panel names it in words: what moves, how, how long with its token,
 * on which curve. A clip whose length or curve no token names is ad hoc.
 */
import {
  type ClipKind,
  type ClipRead,
  type ClipRepeat,
  type ClipValue,
  clipEnd,
  clipKindOf,
  type Tuning as StageTuning,
} from "@cawco/core/stage-graph";
import type { TunedRecord } from "@cawco/core/tuned";
import { graphWords as words } from "@cawco/core/words/graph";
import { dur, ease } from "#lib/platform/motion/curves.svelte.js";

/** How the person tuned a clip: when it begins, how long it runs, and its curve. */
interface Tuning {
  delay: number;
  duration: number;
  /** A CSS easing: `cubic-bezier(…)`, `linear`, or a spring's `linear(…)`. */
  easing: string;
  /** A curve was chosen: a clip whose curve lived in its frames runs from its first frame to its last on it. */
  shaped: boolean;
  /** The spring it was drawn from, when it is one. */
  spring: Spring | null;
}

export interface Spring {
  bounce: number;
  damping: number;
  mass: number;
  stiffness: number;
}

export interface Clip {
  /** Neither its length nor its curve is a token's. */
  adHoc: boolean;
  /** Its curve in the house's words (a token's name), for the editor's token line alone. */
  curve: string;
  delay: number;
  duration: number;
  easing: string;
  /** What moves, in words: the thing a person names (`thing`), as it stands once the move has ended. */
  element: string;
  /** A curve kept in its frames, as its progress (offset, share), when it moves one plain number. */
  frameCurve: readonly (readonly [number, number])[] | null;
  /** Whether its curve is drawn into its frames. */
  framed: boolean;
  /** The agent's name for the group its thing stands in (`data-cawco-group`); null in none. */
  group: string | null;
  /** How it moves, in words. */
  how: string;
  id: string;
  /** How many times the engine ran it once through; 0 for a loop. */
  iterations: number;
  /** Where its legs meet, as offsets between its first frame and its last; none for a clip of one leg. */
  legs: number[];
  property: string;
  /** How it runs on past its first time: his pick, once until he picks. */
  repeat: ClipRepeat;
  /** The spring it runs on, when the person drew one. */
  spring: Spring | null;
  /** Since the move began, ms. */
  start: number;
  /** The page's id for the element it animates: two clips of one element share it. */
  target: string;
  /** The page's id for what a person names for it (the control it is part of, else the element itself): one row of the move each. */
  thing: string | null;
  /** Its length's token, when one names it. */
  token: string | null;
  /** What it animates between, per property: its first frame's value and its last's, as he typed them. */
  values: ClipValue[];
  /** The clip as the engine ran it, when the person tuned it. */
  was: Clip | null;
}

/** The duration ladder a clip may name (DESIGN.md, Motion grammar). */
const LADDER = [
  "--duration-toggle",
  "--duration-control",
  "--duration-exit",
  "--duration-menu",
  "--duration-morph",
  "--duration-fade",
  "--duration-pop",
  "--duration-panel",
  "--duration-panel-exit",
  "--duration-glide",
  "--duration-settle",
] as const;

/**
 * The design system's durations, shortest first, one per length: what the
 * Length setting offers. Tokens of one length stand as one choice under
 * both names (`--duration-toggle` and `--duration-exit` are both 160 ms; listed apart,
 * the list's two rows of one key threw and the page went to a 500).
 */
export const durationTokens = (): { tokens: string[]; ms: number }[] => {
  const by = new Map<number, string[]>();
  for (const token of LADDER) {
    const ms = Math.round(dur(token));
    by.set(ms, [...(by.get(ms) ?? []), token]);
  }
  return [...by]
    .map(([ms, tokens]) => ({ ms, tokens }))
    .sort((a, b) => a.ms - b.ms);
};

/** The house curves, by token. */
const CURVES = [
  "--ease-out",
  "--ease-in-out",
  "--ease-drawer",
  "--ease-crossfade",
] as const;

const NUMBERS = /-?\d*\.?\d+/gu;
/** An easing's numbers, so `cubic-bezier(0.23,1,0.32,1)` and `cubic-bezier(0.23, 1, 0.32, 1)` are one curve. */
const shapeOf = (easing: string): string =>
  `${easing.split("(")[0]?.trim()}(${(easing.match(NUMBERS) ?? []).map(Number).join(",")})`;

/** The token whose length is `ms`, when one is. */
const tokenOf = (ms: number): string | null =>
  LADDER.find((name) => Math.round(dur(name)) === Math.round(ms)) ?? null;

/** The ladder's length nearest `ms`: where a held bar's length snaps (the owner's "Snap, and ⌥ frees it"). */
const snapLength = (ms: number): number =>
  LADDER.map((name) => Math.round(dur(name))).reduce((best, one) =>
    Math.abs(one - ms) < Math.abs(best - ms) ? one : best
  );

/**
 * A row's kind: the family of its most telling property over all its clips
 * (core `clipKindOf`), so a row whose clips animate "height, opacity", or a
 * custom property and opacity, takes the kind a person sees (size; fade),
 * and only a row of custom properties alone is "other".
 */
const kindOf = (clips: readonly Clip[]): ClipKind =>
  clipKindOf(clips.flatMap((clip) => clip.property.split(",")));

/** The token whose curve is `easing`, when one is; `linear` is its own. */
export function curveTokenOf(easing: string): string | null {
  if (easing.trim() === "linear") {
    return "linear";
  }
  const shape = shapeOf(easing);
  return (
    ([...CURVES, "--ease-goo"] as const).find(
      (name) => shapeOf(ease(name)) === shape
    ) ?? null
  );
}

/** A curve in words. */
const curveWords = (easing: string): string => {
  const token = curveTokenOf(easing);
  return token ? (words.curves[token] ?? token) : words.agentsCurve;
};

/** A clip as the panel names it, from the page's read: its words, its tokens, untuned. */
export function clipOf(read: ClipRead): Clip {
  const properties = read.property.split(",").map((one) => one.trim());
  /** The property that says most of how it moves, in the words' order. */
  const first =
    Object.keys(words.how).find((one) => properties.includes(one)) ??
    properties[0] ??
    "";
  const token = tokenOf(read.duration);
  return {
    ...read,
    frameCurve: read.frameCurve,
    how: words.how[first] ?? words.changes,
    // A curve drawn into its frames has no name of its own: its row says its length alone.
    curve: read.framed ? "" : curveWords(read.easing),
    token,
    adHoc:
      token === null || (!read.framed && curveTokenOf(read.easing) === null),
    repeat: "once",
    spring: null,
    was: null,
  };
}

/** The move's length: its last clip's end, each of its runs as the page wrote them while it runs once, one of a clip he set running on (core `clipEnd`), as the page's replays time it. */
export const lengthOf = (clips: readonly Clip[]): number =>
  Math.max(
    0,
    ...clips.map((clip) =>
      clipEnd({
        ...clip,
        iterations: clip.repeat === "once" ? clip.iterations : 0,
      })
    )
  );

/** Whether `clip` stands as `was` in every value he may change. */
const untouched = (clip: Clip, was: Clip): boolean =>
  clip.delay === was.delay &&
  clip.duration === was.duration &&
  clip.easing === was.easing &&
  clip.framed === was.framed &&
  clip.spring === was.spring &&
  clip.repeat === was.repeat &&
  JSON.stringify(clip.values) === JSON.stringify(was.values) &&
  JSON.stringify(clip.legs) === JSON.stringify(was.legs);

/** `clip` with `next` set: the engine's own again where nothing differs from it, else tuned with the clip as the engine ran it kept as `was`. */
function changed(clip: Clip, next: Partial<Clip>): Clip {
  const was = clip.was ?? clip;
  const made = { ...clip, ...next };
  if (untouched(made, was)) {
    return was;
  }
  const token = tokenOf(made.duration);
  return {
    ...made,
    curve: made.framed ? "" : curveWords(made.easing),
    token,
    adHoc:
      token === null || (!made.framed && curveTokenOf(made.easing) === null),
    was,
  };
}

/** The clip run with the person's tuning; the clip as the engine ran it kept as `was`. */
function tune(clip: Clip, tuning: Tuning): Clip {
  // A curve chosen for a clip whose curve lived in its frames: it runs from its first frame to its last on that curve.
  const framed = clip.framed && !tuning.shaped;
  return changed(clip, {
    delay: tuning.delay,
    duration: tuning.duration,
    easing: framed ? clip.easing : tuning.easing,
    framed,
    spring: framed ? null : tuning.spring,
  });
}

/** The clip put back as the engine ran it. */
export const untune = (clip: Clip): Clip => clip.was ?? clip;

/**
 * One row of the move: one thing on the stage that moves, every clip that
 * moves it together (a button's two labels cross-fading are the button
 * changing). Its stretches are its clips' windows run together where they
 * overlap.
 */
export interface Track {
  /** Since the move began, ms: its first clip's begin. */
  begins: number;
  clips: Clip[];
  /** Its last clip's end, ms. */
  ends: number;
  /** The agent's group it stands in, by its first clip; null in none. */
  group: string | null;
  how: string;
  /** Its first clip's id. */
  id: string;
  /** What it changes, by its first clip: its colour on the timeline. */
  kind: ClipKind;
  /** The one length its stretches share, else null. */
  length: number | null;
  name: string;
  /** Its runs, each grabbed, dragged and resized on its own. */
  runs: Run[];
  /** The moment the move set it off, ms: its earliest clip's start, before any delay. */
  setOff: number;
  /** It runs on a spring: its true end is where it settles. */
  sprung: boolean;
  /** The page's id for what it names on the stage, which a rested row rings. */
  thing: string | null;
}

const beginOf = (clip: Clip) => clip.start + clip.delay;
const endOf = (clip: Clip) => beginOf(clip) + clip.duration;

/** Its how in words: one element's most telling, or "changes" for a thing whose parts move. */
function howOf(clips: readonly Clip[]): string {
  if (new Set(clips.map((clip) => clip.target)).size > 1) {
    return words.changes;
  }
  const said = new Set(clips.map((clip) => clip.how));
  return Object.values(words.how).find((how) => said.has(how)) ?? words.changes;
}

/**
 * One run of a row: the clips of a thing that ran together as the engine
 * ran them (their windows overlapping), a bar of its own on the lane
 * (react-timeline-editor's `rows[].actions[]`). A run is what a drag, a
 * resize or a key moves, and nothing else: a row of two runs dragged as
 * one bar moved both ("Button “Create routine” changes", 80–260 and
 * 690–870 ms).
 */
export interface Run {
  clips: Clip[];
  /** The earliest it may begin: the moment the move set its first clip off. */
  floor: number;
  /** Where it runs now, ms into the move. */
  from: number;
  /** Its first clip's id, as the engine ran it: the same run however he tunes it. */
  id: string;
  /** Where it ran as the engine ran it. */
  ran: { from: number; to: number };
  to: number;
}

/**
 * A row's runs: its clips grouped by the windows they ran in as the engine
 * ran them, untuned, so tuning one run never merges it into another; each
 * run stands where its clips stand now.
 */
function runsOf(clips: readonly Clip[]): Run[] {
  const groups: { clips: Clip[]; to: number }[] = [];
  for (const clip of [...clips].sort(asRan)) {
    const ran = untune(clip);
    const last = groups.at(-1);
    if (last && beginOf(ran) <= last.to) {
      last.clips.push(clip);
      last.to = Math.max(last.to, endOf(ran));
    } else {
      groups.push({ clips: [clip], to: endOf(ran) });
    }
  }
  return groups.map(({ clips: own }) => {
    const ran = own.map(untune);
    return {
      id: own[0].id,
      clips: own,
      from: Math.min(...own.map(beginOf)),
      to: Math.max(...own.map(endOf)),
      ran: {
        from: Math.min(...ran.map(beginOf)),
        to: Math.max(...ran.map(endOf)),
      },
      floor: Math.min(...own.map((clip) => clip.start)),
    };
  });
}

/** Clips in the order the engine ran them: by where each began untuned, then as read. */
const asRan = (a: Clip, b: Clip) =>
  beginOf(untune(a)) - beginOf(untune(b)) || Number(a.id) - Number(b.id);

/** A row's clips in the order the engine ran them: its rows per animation keep their places while one is retimed. */
const inRunOrder = (clips: readonly Clip[]): Clip[] => [...clips].sort(asRan);

/** A row's own lengths, the shortest and the longest of its animations' durations: what each was written to last, never a measured span. */
export const ownLengths = (clips: readonly Clip[]): [number, number] => [
  Math.min(...clips.map((clip) => clip.duration)),
  Math.max(...clips.map((clip) => clip.duration)),
];

/**
 * The move's rows: its clips by the thing each moves, in the order each
 * thing first moved as the engine ran it. The order is the untuned one, so
 * a row he retimes stays where it stands, its editor open under it: sorted
 * by the tuned start, a delay stepped up sent the row he was tuning below
 * the fold and dropped its focus.
 */
export function tracksOf(
  clips: readonly Clip[],
  keyOf: (clip: Clip) => unknown = (clip) => clip.thing ?? clip.id
): Track[] {
  const by = new Map<unknown, Clip[]>();
  for (const clip of clips) {
    const key = keyOf(clip);
    by.set(key, [...(by.get(key) ?? []), clip]);
  }
  return [...by.values()]
    .map((own) => [...own].sort(asRan))
    .sort((a, b) => asRan(a[0], b[0]))
    .map((ran): Track => {
      const sorted = [...ran].sort((a, b) => beginOf(a) - beginOf(b));
      const runs = runsOf(sorted);
      const lengths = new Set(runs.map((run) => run.to - run.from));
      const [first] = ran;
      return {
        id: first.id,
        clips: sorted,
        thing: first.thing,
        group: first.group,
        name: first.element,
        how: howOf(sorted),
        kind: kindOf(sorted),
        setOff: Math.min(...sorted.map((clip) => clip.start)),
        sprung: sorted.some((clip) => clip.spring !== null),
        begins: beginOf(sorted[0]),
        ends: Math.max(...sorted.map(endOf)),
        runs,
        length: lengths.size === 1 ? ([...lengths][0] ?? null) : null,
      };
    });
}

/** One row under a row: the animations of one property in one of its runs, however many parts of the thing they move. */
export interface Part {
  /** Its parts: the elements its animations move (a morphed text's letters, each one). */
  count: number;
  key: string;
  property: string;
  /** Its run, when its thing runs more than once. */
  run: number | null;
  track: Track;
}

/**
 * A row's animations as the rows under it: by run, then by property, in
 * the order the engine ran them, each its own track to retime. A text that
 * morphs letter by letter was forty rows each saying "transform" or
 * "opacity"; it is four.
 */
export function partsOf(track: Track): Part[] {
  return track.runs.flatMap((run, at) =>
    tracksOf(inRunOrder(run.clips), (clip) => clip.property).map(
      (part): Part => ({
        key: `${track.id}/${at}/${part.clips[0]?.property ?? ""}`,
        property: part.clips[0]?.property ?? "",
        run: track.runs.length > 1 ? at + 1 : null,
        count: new Set(part.clips.map((clip) => clip.target)).size,
        track: { ...part, name: track.name, thing: track.thing },
      })
    )
  );
}

/** When the track begins after the moment the move set it off, ms: its delay. */
export const delayOf = (track: Track): number =>
  track.begins - Math.min(...track.clips.map((clip) => clip.start));

/** A run's drag step and an arrow's, ms; Shift and an arrow, ms. */
export const RUN_STEP = 10;
export const RUN_BIG_STEP = 100;

/*
 * A run's clamps, one per gesture, modelled on a timeline library's
 * (`clampClipMove`, `clampClipResizeStart`, `clampClipResizeEnd`, MIT),
 * never imported: its three take seconds and hold a clip to 0, ours ms
 * and hold a run to the moment the move set it off. The drag and the keys call the
 * same ones.
 */
const clamp = (n: number, low: number, high: number) =>
  Math.min(Math.max(n, low), Math.max(low, high));

/** A run's start as a body drag or an arrow leaves it: inside the lane, never before its floor. */
const clampRunMove = (
  at: number,
  length: number,
  floor: number,
  end: number
): number => clamp(at, floor, end - length);

/** A run's length as its end's drag or arrow leaves it: a step at least, inside the lane. */
const clampRunResizeEnd = (length: number, at: number, end: number): number =>
  clamp(length, RUN_STEP, end - at);

/** A run's start and length as its start's drag or arrow leaves them: never before its floor, a step long at least. */
const clampRunResizeStart = (
  next: number,
  at: number,
  length: number,
  floor: number
): { at: number; length: number } => {
  const begins = clamp(next, floor, at + length - RUN_STEP);
  return { at: begins, length: at + length - begins };
};

/** The part of a run a gesture holds. */
export type RunPart = "body" | "start" | "end";

/**
 * The one snapper: a body on 10 ms steps; an end's length on the duration
 * ladder (motion `snapLength`), on 10 ms steps while `free` (⌥ held).
 */
const snapRun = (part: RunPart, ms: number, free: boolean): number =>
  part === "body" || free
    ? Math.round(ms / RUN_STEP) * RUN_STEP
    : snapLength(ms);

/** The other bars' edges a run's moving edge settles on, and how near it must come, ms. */
export interface Neighbours {
  edges: readonly number[];
  within: number;
}

/** `at` settled on the nearest neighbouring edge within reach, else as it stands. */
const toEdge = (at: number, near: Neighbours | null): number => {
  if (!near) {
    return at;
  }
  let best = at;
  let gap = near.within;
  for (const edge of near.edges) {
    if (Math.abs(edge - at) <= gap) {
      gap = Math.abs(edge - at);
      best = edge;
    }
  }
  return best;
};

/**
 * Where a run stands after `part` is moved by `by` ms, snapped and held
 * to the lane `[0, end]`: one rule for a drag and a key. Unless `free`
 * (⌥ held, or a key's own step), the edge that moves settles on another
 * bar's edge it comes near (T9: "settles on the project's duration tokens
 * and on neighbouring clips' edges").
 */
export function moveRun(
  run: Run,
  part: RunPart,
  by: number,
  end: number,
  free: boolean,
  near: Neighbours | null = null
): { from: number; to: number } {
  const length = run.to - run.from;
  const edges = free ? null : near;
  if (part === "body") {
    // On 10 ms steps of its delay, from the moment the move set it off: a
    // step of the time since the move began left delays of 397 ms.
    const snapped =
      run.floor + snapRun("body", run.from + by - run.floor, free);
    // Either edge of the body may meet a neighbour; the nearer one wins.
    const byStart = toEdge(snapped, edges) - snapped;
    const byEnd = toEdge(snapped + length, edges) - (snapped + length);
    const shift =
      byStart !== 0 && (byEnd === 0 || Math.abs(byStart) <= Math.abs(byEnd))
        ? byStart
        : byEnd;
    const at = clampRunMove(snapped + shift, length, run.floor, end);
    return { from: at, to: at + length };
  }
  if (part === "end") {
    const snapped = run.from + snapRun("end", length + by, free);
    const next = clampRunResizeEnd(
      toEdge(snapped, edges) - run.from,
      run.from,
      end
    );
    return { from: run.from, to: run.from + next };
  }
  const moved = clampRunResizeStart(run.from + by, run.from, length, run.floor);
  const snapped = snapRun("start", moved.length, free);
  const begins = clampRunResizeStart(
    toEdge(run.to - snapped, edges),
    run.from,
    length,
    run.floor
  );
  return { from: begins.at, to: begins.at + begins.length };
}

/**
 * A run's clips moved and stretched so it runs from `from` to `to` ms into
 * the move, each keeping its place and share of the run; no other clip
 * moves. A clip never begins before the moment the move set it off.
 */
export function retimeRun(run: Run, from: number, to: number): Clip[] {
  const scale = (to - from) / Math.max(1, run.to - run.from);
  return run.clips.map((clip) => {
    const begins = from + (beginOf(clip) - run.from) * scale;
    return tune(clip, {
      delay: Math.max(0, Math.round(begins - clip.start)),
      duration: Math.max(1, Math.round(clip.duration * scale)),
      easing: clip.easing,
      shaped: false,
      spring: clip.spring,
    });
  });
}

/** Every clip of the track given one curve, and with a spring its length too. */
export const reshape = (
  track: Track,
  easing: string,
  spring: Spring | null,
  duration?: number
): Clip[] =>
  track.clips.map((clip) =>
    tune(clip, {
      delay: clip.delay,
      duration: duration ?? clip.duration,
      easing,
      shaped: true,
      spring,
    })
  );

/** Every clip of the track given one length, on its curve. */
export const relength = (track: Track, duration: number): Clip[] =>
  track.clips.map((clip) =>
    tune(clip, {
      delay: clip.delay,
      duration,
      easing: clip.easing,
      shaped: false,
      spring: clip.spring,
    })
  );

/** Every clip of the track begun `delay` ms after the moment the move set it off. */
export const redelay = (track: Track, delay: number): Clip[] => {
  const by = delay - delayOf(track);
  return track.clips.map((clip) =>
    tune(clip, {
      delay: Math.max(0, clip.delay + by),
      duration: clip.duration,
      easing: clip.easing,
      shaped: false,
      spring: clip.spring,
    })
  );
};

/** Four numbers as CSS: a curve he drew. */
export const cubic = (at: readonly number[]): string =>
  // golar-ignore-next-line house/no-raw-motion -- a curve for the component under review, never the dashboard's own motion
  `cubic-bezier(${at.map((one) => Number(one.toFixed(3))).join(", ")})`;

/** CSS's keywords as their four numbers (CSS Easing Functions Level 1). */
const KEYWORDS: Record<string, number[]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  linear: [1 / 3, 1 / 3, 2 / 3, 2 / 3],
};

/** A cubic-bezier's four numbers, from its CSS; null for a spring's `linear(…)` or steps. */
export function bezierOf(easing: string): number[] | null {
  const said = easing.trim();
  const keyword = KEYWORDS[said];
  if (keyword) {
    return keyword;
  }
  const numbers = said.startsWith("cubic-bezier")
    ? (said.match(NUMBERS) ?? []).map(Number)
    : [];
  return numbers.length === 4 ? numbers : null;
}

const STEP = 1 / 120;
const SETTLED = 0.001;
/** The longest a spring may ring, s. */
const RING = 4;

/**
 * A spring as a CSS `linear()` easing and the time it takes to settle: a
 * damped spring from 0 to 1 at rest, integrated at 120Hz (as the house
 * spring is, motion/spring.ts), sampled every 1/60 s.
 */
export function springEasing(spring: Spring): {
  duration: number;
  easing: string;
} {
  let x = 0;
  let v = 0;
  let t = 0;
  const points: number[] = [0];
  while (t < RING) {
    const a = (-spring.stiffness * (x - 1) - spring.damping * v) / spring.mass;
    v += a * STEP;
    x += v * STEP;
    t += STEP;
    if (Math.round(t / STEP) % 2 === 0) {
      points.push(x);
    }
    if (Math.abs(x - 1) < SETTLED && Math.abs(v) < SETTLED) {
      break;
    }
  }
  points.push(1);
  return {
    duration: Math.round(t * 1000),
    easing: `linear(${points.map((p) => Number(p.toFixed(4))).join(", ")})`,
  };
}

/**
 * A spring from its perceptual length and bounce (as SwiftUI's
 * `.spring(duration:bounce:)` and the house spring are: mass 1, stiffness
 * (2π / duration)², damping 4π(1 − bounce) / duration).
 */
export const springOf = (seconds: number, bounce: number): Spring => ({
  bounce,
  mass: 1,
  stiffness: Number(((2 * Math.PI) / seconds) ** 2),
  damping: (4 * Math.PI * (1 - bounce)) / seconds,
});

/**
 * A spring that settles in `ms`, its bounce and mass kept: one length a
 * spring is told by, where it settles, the same in its row and its editor
 * (the editor set its response, 260 ms, while the row said it settled at
 * ~450). For one bounce the settling time grows as the response does.
 */
export function springSettling(ms: number, bounce: number, mass = 1): Spring {
  const unit = { ...springOf(1, bounce), mass };
  const settles = springEasing(unit).duration;
  return { ...springOf(ms / Math.max(1, settles), bounce), mass };
}

/** A value of a row's timing he may change, and put back alone: when it begins, how long it runs, its curve, what it runs between, where its legs meet, how it repeats. */
export type Timing =
  "start" | "length" | "curve" | "values" | "legs" | "repeat";

/** Whether two clips run on one curve: one easing, both drawn in their frames or neither, one spring. */
const sameCurve = (a: Clip, b: Clip): boolean =>
  a.easing === b.easing && a.framed === b.framed && a.spring === b.spring;

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Whether `clip` differs from `was` in each value he may change. */
const DIFFERS: readonly (readonly [
  Timing,
  (clip: Clip, was: Clip) => boolean,
])[] = [
  ["start", (clip, was) => clip.delay !== was.delay],
  ["length", (clip, was) => clip.duration !== was.duration],
  ["curve", (clip, was) => !sameCurve(clip, was)],
  ["values", (clip, was) => !same(clip.values, was.values)],
  ["legs", (clip, was) => !same(clip.legs, was.legs)],
  ["repeat", (clip, was) => clip.repeat !== was.repeat],
];

/** The values of the row he changed, read off each clip against the clip as the engine ran it. */
export function editsOf(track: Track): Set<Timing> {
  const edits = new Set<Timing>();
  for (const clip of track.clips) {
    const { was } = clip;
    for (const [value, differs] of DIFFERS) {
      if (was && differs(clip, was)) {
        edits.add(value);
      }
    }
  }
  return edits;
}

/**
 * The row with one value put back as the engine ran it, the others as he
 * left them; a clip with nothing left changed is the engine's own again.
 * A spring sets its own length, so a spring's length and its curve go back
 * together.
 */
export function restore(track: Track, value: Timing): Clip[] {
  return track.clips.map((clip) => {
    const { was } = clip;
    if (!was) {
      return clip;
    }
    const sprung = clip.spring !== was.spring;
    const curveBack =
      value === "curve" ||
      (sprung && value === "length") ||
      sameCurve(clip, was);
    // The curve put back is the engine's: its easing, its frames, no spring.
    const curve = curveBack
      ? { easing: was.easing, framed: was.framed, spring: was.spring }
      : {};
    return changed(clip, {
      ...curve,
      delay: value === "start" ? was.delay : clip.delay,
      duration:
        value === "length" || (sprung && value === "curve")
          ? was.duration
          : clip.duration,
      ...(value === "values" && { values: was.values }),
      ...(value === "legs" && { legs: was.legs }),
      ...(value === "repeat" && { repeat: was.repeat }),
    });
  });
}

/** Every clip of the track that animates `property` run between `from` and `to`: its first frame's value and its last's, as he typed them. */
export const revalue = (
  track: Track,
  property: string,
  from: string,
  to: string
): Clip[] =>
  track.clips.map((clip) =>
    clip.values.some((one) => one.property === property)
      ? changed(clip, {
          values: clip.values.map((one) =>
            one.property === property ? { property, from, to } : one
          ),
        })
      : clip
  );

/** Every clip of the track run on past its first time as `repeat` says. */
export const rerepeat = (track: Track, repeat: ClipRepeat): Clip[] =>
  track.clips.map((clip) => changed(clip, { repeat }));

/** One clip with its legs meeting at `legs`, offsets between its first frame and its last. */
export const releg = (clip: Clip, legs: number[]): Clip =>
  changed(clip, { legs });

/** The clips he tuned, as the stage page plays them (core stage-graph `Tuning`): each by its id. */
export const tuningsOf = (clips: readonly Clip[]): StageTuning[] =>
  clips.flatMap((clip) => {
    const { was } = clip;
    if (!was) {
      return [];
    }
    return [
      {
        id: clip.id,
        delay: clip.delay,
        duration: clip.duration,
        easing: clip.easing,
        shaped: was.framed && !clip.framed,
        repeat: clip.repeat,
        legs: same(clip.legs, was.legs) ? null : clip.legs,
        values: clip.values.filter(
          (one) =>
            !was.values.some(
              (ran) =>
                ran.property === one.property &&
                ran.from === one.from &&
                ran.to === one.to
            )
        ),
      },
    ];
  });

/** The clips the person tuned, as the canvas's `tuned` record: the move, the animation by its element and property, its begin from the move's start, its length and its curve. */
export const tunedRecord = (move: string, clips: readonly Clip[]) =>
  clips.flatMap((clip): TunedRecord[] => {
    const { was } = clip;
    if (!was) {
      return [];
    }
    return [
      {
        move,
        animation: `${clip.element} ${clip.property}`,
        delay: Math.round(clip.start + clip.delay),
        duration: Math.round(clip.duration),
        easing: clip.easing,
        offTokens: clip.adHoc,
        ...(clip.repeat === was.repeat ? {} : { repeat: clip.repeat }),
        ...(same(clip.legs, was.legs) ? {} : { legs: clip.legs }),
        ...(same(clip.values, was.values) ? {} : { values: clip.values }),
      },
    ];
  });

/** Each clip's identity across reads of one move: what moves, what it animates, and which of those it is. */
const identities = (clips: readonly Clip[]): [Clip, string][] => {
  const seen = new Map<string, number>();
  return clips.map((clip) => {
    const base = `${clip.element}\u0000${clip.property}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return [clip, `${base}\u0000${n}`];
  });
};

/** The tuned clips of a move by their identity, to put back on its next read. */
export const tuningOf = (clips: readonly Clip[]): Map<string, Clip> =>
  new Map(
    identities(clips).flatMap(([clip, name]) =>
      clip.was ? [[name, clip] as const] : []
    )
  );

/**
 * A fresh read of a move with what he tuned on an earlier read put back:
 * each tuned animation's values over the clip as the engine ran it this
 * time. Choosing another move and back kept nothing.
 */
export function withTuning(
  clips: readonly Clip[],
  tuning: ReadonlyMap<string, Clip>
): Clip[] {
  if (tuning.size === 0) {
    return [...clips];
  }
  return identities(clips).map(([clip, name]) => {
    const tuned = tuning.get(name);
    return tuned
      ? changed(clip, {
          delay: tuned.delay,
          duration: tuned.duration,
          easing: tuned.easing,
          framed: tuned.framed,
          spring: tuned.spring,
          repeat: tuned.repeat,
          legs: tuned.legs.length === clip.legs.length ? tuned.legs : clip.legs,
          values: tuned.values,
        })
      : clip;
  });
}

/**
 * A move's clips with what the artifact keeps of his tuning (its doc's
 * `tuned`, read back on open) put back: each record of this move on the
 * clip of its animation, in order where one thing animates a property more
 * than once.
 */
export function withTuned(
  move: string,
  clips: readonly Clip[],
  records: readonly TunedRecord[]
): Clip[] {
  const left = records.filter((one) => one.move === move);
  if (left.length === 0) {
    return [...clips];
  }
  return clips.map((clip) => {
    const at = left.findIndex(
      (one) => one.animation === `${clip.element} ${clip.property}`
    );
    const record = left[at];
    if (!record) {
      return clip;
    }
    left.splice(at, 1);
    return changed(clip, {
      delay: Math.max(0, record.delay - clip.start),
      duration: Math.max(1, record.duration),
      easing:
        clip.framed && record.easing === clip.easing
          ? clip.easing
          : record.easing,
      framed: clip.framed && record.easing === clip.easing,
      ...(record.repeat ? { repeat: record.repeat } : {}),
      ...(record.legs && record.legs.length === clip.legs.length
        ? { legs: record.legs }
        : {}),
      ...(record.values ? { values: record.values } : {}),
    });
  });
}

/**
 * A curve drawn as a glyph, from its start (bottom left) to its end (top
 * right) in a 24-unit box: a cubic curve as its bezier, a spring's or any
 * `linear(…)` as its points, `linear` as a line. Null for a curve drawn
 * into its frames, or steps: nothing to draw.
 */
export function curveGlyph(easing: string): string | null {
  const said = easing.trim();
  const x = (t: number) => (2 + 20 * t).toFixed(1);
  const y = (p: number) => (22 - 20 * p).toFixed(1);
  if (said.startsWith("linear(")) {
    // Its points alone, evenly apart (a spring's); one with stops (`30%`) is not drawn.
    const points = said.includes("%")
      ? []
      : (said.slice("linear(".length, -1).match(NUMBERS) ?? []).map(Number);
    return points.length < 2
      ? null
      : points
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"}${x(i / (points.length - 1))} ${(22 - 16 * p).toFixed(1)}`
          )
          .join(" ");
  }
  const bezier = bezierOf(said);
  if (!bezier) {
    return null;
  }
  const [x1 = 0, y1 = 0, x2 = 1, y2 = 1] = bezier;
  return `M2 22 C${x(x1)} ${y(y1)} ${x(x2)} ${y(y2)} 22 2`;
}

/**
 * A curve kept in a clip's frames (a Svelte transition's), drawn as its
 * progress from the points the page read (`frameCurve`): each frame's
 * offset and its share of the way. Null when no property moves as one
 * number (the Curve chip then names the agent's curve with no picture).
 */
export function framesGlyph(
  curve: readonly (readonly [number, number])[] | null
): string | null {
  if (!curve || curve.length < 2) {
    return null;
  }
  return curve
    .map(
      ([offset, share], at) =>
        `${at === 0 ? "M" : "L"}${(2 + 20 * offset).toFixed(1)} ${(22 - 20 * share).toFixed(1)}`
    )
    .join(" ");
}
