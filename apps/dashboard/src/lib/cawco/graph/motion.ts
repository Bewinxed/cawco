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
import { nameOf } from "./names";

/** How the person tuned a clip: a length, a delay, and a curve or a spring. */
export interface Tuning {
  delay: number;
  duration: number;
  /** A CSS easing: a token's curve, `cubic-bezier(…)`, or a spring's `linear(…)`. */
  easing: string;
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
  /** Its curve in words: a token's name, else what it is. */
  curve: string;
  delay: number;
  duration: number;
  easing: string;
  /** What moves, in words. */
  element: string;
  /** Whether its curve is drawn into its frames, so only its length can change. */
  framed: boolean;
  /** How it moves, in words. */
  how: string;
  id: string;
  property: string;
  /** Since the move began, ms. */
  start: number;
  /** The element it moves, as the engine ran it. */
  target: Element | null;
  /** Its frames, as the engine ran them: what a replay draws. */
  frames: Keyframe[];
  /** Its length's token, when one names it. */
  token: string | null;
  /** What it was before the person tuned it, when they did. */
  was: Tuning | null;
}

/** The duration ladder a clip may name (DESIGN.md, Motion grammar). */
export const LADDER = [
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
export const CURVES = [
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

/** The token whose curve is `easing`, when one is; `linear` is its own. */
function curveTokenOf(easing: string): string | null {
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
export function clipOf(
  animation: Animation,
  start: number,
  at: number
): Clip {
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
  return {
    id: `${at}`,
    target,
    frames: effect?.getKeyframes() ?? [],
    element: target ? nameOf(target) : words.element,
    property,
    how: words.how[first] ?? words.changes,
    start,
    delay: Math.round(Number(timing?.delay) || 0),
    duration,
    easing,
    framed,
    curve: framed ? words.keyframedCurve : curveWords(easing),
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
  #running = new Map<string, Animation>();

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
  play(clips: readonly Clip[], t: number, rate: number): void {
    for (const clip of clips) {
      const replay = this.#of(clip);
      if (replay) {
        replay.playbackRate = rate;
        replay.currentTime = t - clip.start;
        replay.onfinish = () => this.#let(clip.id, replay);
        replay.play();
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

/** A tuned clip's curve in words: a framed clip keeps its own; a spring is a spring. */
function curveAfter(clip: Clip, tuning: Tuning, easing: string): string {
  if (clip.framed) {
    return clip.curve;
  }
  return tuning.spring ? words.spring : curveWords(easing);
}

/** The clip run with the person's tuning, its old timing kept as `was`. */
export function tune(clip: Clip, tuning: Tuning): Clip {
  const was: Tuning = clip.was ?? {
    delay: clip.delay,
    duration: clip.duration,
    easing: clip.easing,
    spring: null,
  };
  const token = tokenOf(tuning.duration);
  const easing = clip.framed ? clip.easing : tuning.easing;
  return {
    ...clip,
    delay: tuning.delay,
    duration: tuning.duration,
    easing,
    curve: curveAfter(clip, tuning, easing),
    token,
    adHoc: token === null || (!clip.framed && curveTokenOf(easing) === null),
    was,
  };
}

/** The clip put back as the engine ran it. */
export const untune = (clip: Clip): Clip =>
  clip.was ? tune({ ...clip, was: null }, clip.was) : clip;

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
