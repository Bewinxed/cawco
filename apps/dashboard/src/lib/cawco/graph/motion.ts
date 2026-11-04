/**
 * A move's clips (spec, The move): every animation the engine ran on the
 * stage while a story's `play` moved the live component, read as each
 * first ran (its element, frames and timing), so the move can be played
 * again, at a quarter of its speed, scrubbed and tuned without running
 * the play again (`Replays`; the canvas's timeline does the same:
 * component-canvas moves.md). Each
 * clip is named in words: what moves, how, how long with its token, on
 * which curve. A clip whose length or curve no token names is ad hoc.
 */
import { graphWords as words } from "@cawco/core/words/graph";
import { dur, ease } from "#lib/cawco/motion/curves.svelte.js";
import { nameOf, thingOf } from "./names";

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
  /** Whether its curve is drawn into its frames. */
  framed: boolean;
  /** Its frames, as the engine ran them: what a replay draws. */
  frames: Keyframe[];
  /** How it moves, in words. */
  how: string;
  id: string;
  property: string;
  /** The spring it runs on, when the person drew one. */
  spring: Spring | null;
  /** Since the move began, ms. */
  start: number;
  /** The element it moves, as the engine ran it. */
  target: Element | null;
  /** What a person names for it: the control it is part of, else the element itself. One row of the move each. */
  thing: Element | null;
  /** Its length's token, when one names it. */
  token: string | null;
  /** The clip as the engine ran it, when the person tuned it. */
  was: Clip | null;
}

/** The duration ladder a clip may name (DESIGN.md, Motion grammar). */
const LADDER = [
  "--dur-toggle",
  "--dur-control",
  "--dur-exit",
  "--dur-menu",
  "--dur-morph",
  "--dur-fade",
  "--dur-pop",
  "--dur-panel",
  "--dur-grow-exit",
  "--dur-grow",
  "--dur-lift",
  "--dur-glide",
  "--dur-settle",
] as const;

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

/** What a clip changes, as the timeline colours it (the `c-clip-*` tokens). */
export type ClipKind = "size" | "move" | "fade" | "tint" | "effect" | "other";
// golar-ignore-next-line house/no-clip-with-move -- a table from a property to its colour, no animation effect
const KINDS: Record<string, ClipKind> = {
  height: "size",
  "block-size": "size",
  width: "size",
  "inline-size": "size",
  "clip-path": "size",
  transform: "move",
  translate: "move",
  scale: "move",
  rotate: "move",
  opacity: "fade",
  "background-color": "tint",
  color: "tint",
  "border-color": "tint",
  filter: "effect",
  "box-shadow": "effect",
};
/**
 * A row's kind: the family of its most telling property over all its clips,
 * in the order the words name how a thing moves (`words.how`), so a row
 * whose clips animate "height, opacity", or a custom property and opacity,
 * takes the kind a person sees (size; fade), and only a row of custom
 * properties alone is "other". Read off the joined property string, every
 * row fell through to "other" and drew grey.
 */
const kindOf = (clips: readonly Clip[]): ClipKind => {
  const properties = new Set(
    clips.flatMap((clip) => clip.property.split(",").map((one) => one.trim()))
  );
  const telling = Object.keys(words.how).find((one) => properties.has(one));
  return (telling && KINDS[telling]) || "other";
};

/** One timing as the component canvas's `tuned` record says it (stage-host canvas chrome.ts `openMove`): the agent writes it into the CSS or the motion call. */
export interface TunedRecord {
  animation: string;
  delay: number;
  duration: number;
  easing: string;
  move: string;
  /** Its length or its curve is none of the design system's tokens: the agent's note, never shown on the face. */
  offTokens: boolean;
}

/** The clips the person tuned, as the canvas's `tuned` record: the move, the animation by its element and property, its begin from the move's start, its length and its curve. */
export const tunedRecord = (move: string, clips: readonly Clip[]) =>
  clips
    .filter((clip) => clip.was)
    .map((clip): TunedRecord => ({
      move,
      animation: `${clip.element} ${clip.property}`,
      delay: Math.round(clip.start + clip.delay),
      duration: Math.round(clip.duration),
      easing: clip.easing,
      offTokens: clip.adHoc,
    }));

/** The token whose curve is `easing`, when one is; `linear` is its own. */
export function curveTokenOf(easing: string): string | null {
  if (easing.trim() === "linear") {
    return "linear";
  }
  const shape = shapeOf(easing);
  return (
    [...CURVES, "--ease-goo"].find(
      (name) => shapeOf(ease(name as `--ease-${string}`)) === shape
    ) ?? null
  );
}

/** A curve in words. */
const curveWords = (easing: string): string => {
  const token = curveTokenOf(easing);
  return token ? (words.curves[token] ?? token) : words.ownCurve;
};

const MOTION_KEYS = new Set([
  "offset",
  "computedOffset",
  "easing",
  "composite",
]);

function propertyOf(animation: Animation): string {
  if (
    typeof CSSTransition !== "undefined" &&
    animation instanceof CSSTransition
  ) {
    return animation.transitionProperty;
  }
  if (
    typeof CSSAnimation !== "undefined" &&
    animation instanceof CSSAnimation
  ) {
    return animation.animationName;
  }
  const effect = animation.effect as KeyframeEffect | null;
  const keys = new Set<string>();
  for (const frame of effect?.getKeyframes() ?? []) {
    for (const key of Object.keys(frame)) {
      if (!MOTION_KEYS.has(key)) {
        keys.add(key.replace(/[A-Z]/gu, (c) => `-${c.toLowerCase()}`));
      }
    }
  }
  return [...keys].join(", ");
}

/** Whether its curve lives in its frames: a run of three or more frames on a linear timing (Svelte's transitions). */
const framedOf = (animation: Animation): boolean => {
  const effect = animation.effect as KeyframeEffect | null;
  return (
    (effect?.getTiming().easing ?? "linear") === "linear" &&
    (effect?.getKeyframes().length ?? 0) > 2
  );
};

/** A clip from an animation the engine ran, `start` ms after the move began. */
export function clipOf(animation: Animation, start: number, at: number): Clip {
  const effect = animation.effect as KeyframeEffect | null;
  const timing = effect?.getComputedTiming();
  const property = propertyOf(animation);
  const easing = effect?.getTiming().easing ?? "linear";
  const duration = Math.round(Number(timing?.duration) || 0);
  const framed = framedOf(animation);
  const token = tokenOf(duration);
  const curveToken = framed ? "framed" : curveTokenOf(easing);
  const properties = property.split(",").map((one) => one.trim());
  /** The property that says most of how it moves, in the words' order. */
  const first =
    Object.keys(words.how).find((one) => properties.includes(one)) ??
    properties[0] ??
    "";
  const target = effect?.target ?? null;
  const thing = target ? thingOf(target) : null;
  return {
    id: `${at}`,
    target,
    thing,
    spring: null,
    frames: effect?.getKeyframes() ?? [],
    element: thing ? nameOf(thing) : words.element,
    property,
    how: words.how[first] ?? words.changes,
    start,
    delay: Math.round(Number(timing?.delay) || 0),
    duration,
    easing,
    framed,
    // A curve drawn into its frames has no name of its own: its row says its length alone.
    curve: framed ? "" : curveWords(easing),
    token,
    adHoc: token === null || curveToken === null,
    was: null,
  };
}

/** The move's length: its last clip's end. */
export const lengthOf = (clips: readonly Clip[]): number =>
  Math.max(0, ...clips.map((clip) => clip.start + clip.delay + clip.duration));

/**
 * The move's replays: each clip drawn again from its frames and its timing
 * as they stand (tuned or not), on its element, over what the element is
 * now; the engine's own animation is gone once it ends (a transition's,
 * Svelte's). Each lasts until it ends, then lets the element go.
 */
export class Replays {
  readonly #running = new Map<string, Animation>();

  #of(clip: Clip): Animation | null {
    this.#running.get(clip.id)?.cancel();
    if (!clip.target) {
      return null;
    }
    const replay = clip.target.animate(clip.frames, {
      delay: clip.delay,
      duration: clip.duration,
      easing: clip.framed ? "linear" : clip.easing,
      fill: "both",
    });
    replay.pause();
    this.#running.set(clip.id, replay);
    return replay;
  }

  /** Every clip stood at `t` ms into the move, held there. */
  seek(clips: readonly Clip[], t: number): void {
    for (const clip of clips) {
      const replay = this.#running.get(clip.id) ?? this.#of(clip);
      if (replay) {
        replay.currentTime = t - clip.start;
      }
    }
  }

  /** Every clip played from `t`, at `rate` (1, or a quarter); each lets its element go as it ends. */
  play(clips: readonly Clip[], t: number): void {
    for (const clip of clips) {
      const replay = this.#of(clip);
      if (replay) {
        replay.onfinish = () => this.#let(clip.id, replay);
        // Played, then placed: `play()` on a paused animation whose time
        // stands before 0 rewinds it to 0 (Web Animations, "play an
        // animation", auto-rewind), so a clip the move set off later ran at
        // once and every staggered move played collapsed.
        replay.play();
        replay.currentTime = t - clip.start;
      }
    }
  }

  #let(id: string, replay: Animation): void {
    if (this.#running.get(id) === replay) {
      this.#running.delete(id);
    }
    replay.cancel();
  }

  /** Every replay ended, its element let go: the state as it stands. */
  release(): void {
    for (const replay of this.#running.values()) {
      replay.cancel();
    }
    this.#running.clear();
  }
}

/** The clip run with the person's tuning; the clip as the engine ran it kept as `was`. */
function tune(clip: Clip, tuning: Tuning): Clip {
  const was = clip.was ?? clip;
  // Brought back to the timing the engine ran: no change, and nothing to send.
  if (
    tuning.delay === was.delay &&
    tuning.duration === was.duration &&
    tuning.easing === was.easing &&
    !tuning.shaped
  ) {
    return was;
  }
  const token = tokenOf(tuning.duration);
  // A curve chosen for a clip whose curve lived in its frames: it runs from its first frame to its last on that curve.
  const unframe = clip.framed && tuning.shaped;
  const frames = unframe ? endsOf(clip.frames) : clip.frames;
  const framed = clip.framed && !unframe;
  const easing = framed ? clip.easing : tuning.easing;
  return {
    ...clip,
    delay: tuning.delay,
    duration: tuning.duration,
    easing,
    frames,
    framed,
    spring: framed ? null : tuning.spring,
    curve: framed ? "" : curveWords(easing),
    token,
    adHoc: token === null || (!framed && curveTokenOf(easing) === null),
    was,
  };
}

/** A run of frames as its first and its last, their timing keys dropped. */
function endsOf(frames: readonly Keyframe[]): Keyframe[] {
  const bare = (frame: Keyframe | undefined): Keyframe =>
    Object.fromEntries(
      Object.entries(frame ?? {}).filter(([key]) => !MOTION_KEYS.has(key))
    );
  return [bare(frames[0]), bare(frames.at(-1))];
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
  thing: Element | null;
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
      id: (own[0] as Clip).id,
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

/**
 * The move's rows: its clips by the thing each moves, in the order each
 * thing first moved as the engine ran it. The order is the untuned one, so
 * a row he retimes stays where it stands, its editor open under it: sorted
 * by the tuned start, a delay stepped up sent the row he was tuning below
 * the fold and dropped its focus.
 */
export function tracksOf(clips: readonly Clip[]): Track[] {
  const by = new Map<Element | string, Clip[]>();
  for (const clip of clips) {
    const key = clip.thing ?? clip.id;
    by.set(key, [...(by.get(key) ?? []), clip]);
  }
  return [...by.values()]
    .map((own) => [...own].sort(asRan))
    .sort((a, b) => asRan(a[0] as Clip, b[0] as Clip))
    .map((ran): Track => {
      const sorted = [...ran].sort((a, b) => beginOf(a) - beginOf(b));
      const runs = runsOf(sorted);
      const lengths = new Set(runs.map((run) => run.to - run.from));
      const first = ran[0] as Clip;
      return {
        id: first.id,
        clips: sorted,
        thing: first.thing,
        name: first.element,
        how: howOf(sorted),
        kind: kindOf(sorted),
        setOff: Math.min(...sorted.map((clip) => clip.start)),
        sprung: sorted.some((clip) => clip.spring !== null),
        begins: beginOf(sorted[0] as Clip),
        ends: Math.max(...sorted.map(endOf)),
        runs,
        length: lengths.size === 1 ? ([...lengths][0] ?? null) : null,
      };
    });
}

/** When the track begins after the moment the move set it off, ms: its delay. */
export const delayOf = (track: Track): number =>
  track.begins - Math.min(...track.clips.map((clip) => clip.start));

/** A run's drag step and an arrow's, ms; Shift and an arrow, ms. */
export const RUN_STEP = 10;
export const RUN_BIG_STEP = 100;

/*
 * A run's clamps, one per gesture, after DialKit's timeline
 * (`clampClipMove`, `clampClipResizeStart`, `clampClipResizeEnd`,
 * dialkit/timeline, MIT): its three take seconds and hold a clip to 0,
 * ours ms and hold a run to the moment the move set it off, so they are
 * modelled on them rather than imported. The drag and the keys call the
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

/**
 * Where a run stands after `part` is moved by `by` ms, snapped and held
 * to the lane `[0, end]`: one rule for a drag and a key.
 */
export function moveRun(
  run: Run,
  part: RunPart,
  by: number,
  end: number,
  free: boolean
): { from: number; to: number } {
  const length = run.to - run.from;
  if (part === "body") {
    const at = clampRunMove(
      snapRun("body", run.from + by, free),
      length,
      run.floor,
      end
    );
    return { from: at, to: at + length };
  }
  if (part === "end") {
    const next = clampRunResizeEnd(
      snapRun("end", length + by, free),
      run.from,
      end
    );
    return { from: run.from, to: run.from + next };
  }
  const moved = clampRunResizeStart(run.from + by, run.from, length, run.floor);
  const snapped = snapRun("start", moved.length, free);
  const begins = clampRunResizeStart(
    run.to - snapped,
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

/**
 * A curve in plain words, as motion tools name them (Jitter's presets, each
 * with its intensity: jitter.video/changelog/2023-11-08-easings-intensity):
 * a shape and how strongly it bends, from 0 (a straight line) to 1.
 */
export type Shape = "linear" | "smooth" | "slowDown" | "speedUp" | "spring";
type Bent = "smooth" | "slowDown" | "speedUp";

/** The straight line, and each shape at its strongest, as cubic-bezier's four numbers. */
const LINE = [1 / 3, 1 / 3, 2 / 3, 2 / 3];
const STRONGEST: Record<Bent, number[]> = {
  smooth: [0.87, 0, 0.13, 1],
  slowDown: [0.16, 1, 0.3, 1],
  speedUp: [0.7, 0, 0.84, 0],
};
/** CSS's keywords as their four numbers (CSS Easing Functions Level 1). */
const KEYWORDS: Record<string, number[]> = {
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  linear: LINE,
};
/** How far off a shape a curve may stand and still be called by its name. */
const NEAR = 0.2;
/** A straight line, near enough. */
const STRAIGHT = 0.02;

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

/** Four numbers as CSS. */
export const cubic = (at: readonly number[]): string =>
  // golar-ignore-next-line house/no-raw-motion -- a curve for the component under review, never the dashboard's own motion
  `cubic-bezier(${at.map((one) => Number(one.toFixed(3))).join(", ")})`;

/** A shape at `intensity`, as CSS. */
export const easingOf = (shape: Bent, intensity: number): string =>
  cubic(
    LINE.map((one, i) => one + ((STRONGEST[shape][i] ?? one) - one) * intensity)
  );

/** How near `bezier` stands to `shape`, and at what intensity. */
function nearness(
  bezier: readonly number[],
  shape: Bent
): { intensity: number; off: number } {
  const way = LINE.map((one, i) => (STRONGEST[shape][i] ?? one) - one);
  const from = bezier.map((one, i) => one - (LINE[i] ?? 0));
  const along =
    way.reduce((sum, one, i) => sum + one * (from[i] ?? 0), 0) /
    way.reduce((sum, one) => sum + one * one, 0);
  const intensity = Math.max(0, Math.min(1, along));
  return {
    intensity,
    off: Math.hypot(...from.map((one, i) => one - (way[i] ?? 0) * intensity)),
  };
}

/** A clip's curve as a shape and its intensity; `own` when no shape is near it. */
export function shapeOfCurve(
  easing: string,
  spring: Spring | null
): { intensity: number; shape: Shape | "own" } {
  if (spring) {
    return { shape: "spring", intensity: spring.bounce };
  }
  const bezier = bezierOf(easing);
  if (!bezier) {
    return { shape: "own", intensity: 0 };
  }
  if (bezier.every((one, i) => Math.abs(one - (LINE[i] ?? 0)) < STRAIGHT)) {
    return { shape: "linear", intensity: 0 };
  }
  let best: { intensity: number; off: number; shape: Shape | "own" } = {
    shape: "own",
    intensity: 0,
    off: NEAR,
  };
  for (const shape of Object.keys(STRONGEST) as Bent[]) {
    const near = nearness(bezier, shape);
    if (near.off < best.off) {
      best = { shape, ...near };
    }
  }
  return { shape: best.shape, intensity: best.intensity };
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

/** A value of a row's timing he may change, and put back alone: when it begins, how long it runs, its curve. */
export type Timing = "start" | "length" | "curve";

/** Whether two clips run on one curve: one easing, both drawn in their frames or neither, one spring. */
const sameCurve = (a: Clip, b: Clip): boolean =>
  a.easing === b.easing && a.framed === b.framed && a.spring === b.spring;

/** The values of the row he changed, read off each clip against the clip as the engine ran it. */
export function editsOf(track: Track): Set<Timing> {
  const edits = new Set<Timing>();
  for (const clip of track.clips) {
    const { was } = clip;
    if (was) {
      if (clip.delay !== was.delay) {
        edits.add("start");
      }
      if (clip.duration !== was.duration) {
        edits.add("length");
      }
      if (!sameCurve(clip, was)) {
        edits.add("curve");
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
    const delay = value === "start" ? was.delay : clip.delay;
    const duration =
      value === "length" || (sprung && value === "curve")
        ? was.duration
        : clip.duration;
    if (curveBack && delay === was.delay && duration === was.duration) {
      return was;
    }
    // The curve put back is the engine's: its easing, its frames, no spring.
    const base = curveBack ? was : clip;
    const token = tokenOf(duration);
    return {
      ...base,
      delay,
      duration,
      token,
      adHoc:
        token === null || (!base.framed && curveTokenOf(base.easing) === null),
      was,
    };
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

/** What a clip changes, when it is one property between two plain numbers: its name, from, to and unit. */
export interface Delta {
  from: number;
  property: string;
  to: number;
  unit: string;
}

const PLAIN = /^(-?\d*\.?\d+)([a-z%]*)$/u;
/** A transform that only moves: `matrix(1, 0, 0, 1, x, y)`, or a `translate`. */
const MATRIX = /^matrix\(([^)]*)\)$/u;

/** A frame's value as plain numbers by axis: `120px` → {"": [120, "px"]}; a moving matrix → x and y in px. */
function plainOf(value: string): Map<string, [number, string]> | null {
  const said = value.trim();
  const plain = said.match(PLAIN);
  if (plain) {
    return new Map([["", [Number(plain[1]), plain[2] ?? ""]]]);
  }
  if (said === "none") {
    return new Map([
      ["x", [0, "px"]],
      ["y", [0, "px"]],
    ]);
  }
  const matrix = said.match(MATRIX);
  const n = (matrix?.[1] ?? "").split(",").map(Number);
  if (n.length === 6 && n[0] === 1 && n[1] === 0 && n[2] === 0 && n[3] === 1) {
    return new Map([
      ["x", [n[4] ?? 0, "px"]],
      ["y", [n[5] ?? 0, "px"]],
    ]);
  }
  return null;
}

/**
 * What a clip of one property changes, as its first and last frames say
 * it, when both are plain numbers in one unit (`height 0 → 120 px`,
 * `opacity 0 → 1`); a transform that only moves is said by the axis that
 * moves (`y 16 → 0 px`). Null for anything else: the row says how it moves.
 */
export function deltaOf(clip: Clip): Delta | null {
  if (clip.property.includes(",")) {
    return null;
  }
  const key = clip.property.replace(/-([a-z])/gu, (_, c: string) =>
    c.toUpperCase()
  );
  const first = clip.frames[0]?.[key];
  const last = clip.frames.at(-1)?.[key];
  if (typeof first !== "string" || typeof last !== "string") {
    return null;
  }
  const a = plainOf(first);
  const b = plainOf(last);
  if (!(a && b)) {
    return null;
  }
  const moved = [...a.keys()].filter(
    (one) => b.has(one) && a.get(one)?.[0] !== b.get(one)?.[0]
  );
  const [axis] = moved;
  if (moved.length !== 1 || axis === undefined) {
    return null;
  }
  const [from, unit] = a.get(axis) as [number, string];
  const [to, toUnit] = b.get(axis) as [number, string];
  // 0 is written bare in either unit.
  if (unit !== toUnit && from !== 0 && to !== 0) {
    return null;
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    property: axis === "" ? clip.property : axis,
    from: round(from),
    to: round(to),
    unit: unit || toUnit,
  };
}
