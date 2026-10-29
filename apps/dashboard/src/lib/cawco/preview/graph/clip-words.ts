/**
 * How the dock names a clip's timing (Projects spec §5.10, "Readable
 * labels", pin 27): a token by its short name in a code chip, a curve by its
 * word, a spring by its response and bounce, anything else the agent wrote
 * as written. And the snapping the drags and the slider share (the owner's
 * pick "snap"): to the page's duration tokens first, freed by ⌥.
 */

import {
  bounces,
  type ClipTiming,
  type Curve,
  type DurationToken,
  durationTokenOf,
  type EasingToken,
  easingTokenOf,
  type MoveTokens,
} from "@cawco/core/design-graph";
import { designGraphWords } from "@cawco/core/words/design-graph";

const DASHES = /^--/u;

/** A token's short name, as its chip says it: `--dur-pop` is `pop`, `--ease-drawer` is `drawer`, `--ease-out` stays `ease-out`. */
export function tokenWord(name: string): string {
  const bare = name.replace(DASHES, "");
  if (bare.startsWith("dur-")) {
    return bare.slice(4);
  }
  if (bare.startsWith("ease-")) {
    const rest = bare.slice(5);
    return ["out", "in", "in-out"].includes(rest) ? bare : rest;
  }
  return bare;
}

/** A curve's word: its token's short name, a spring's response and bounce, Custom, or how the agent wrote it. */
export function curveWord(
  timing: ClipTiming,
  tokens: readonly EasingToken[]
): string {
  const { curve } = timing;
  if (curve.kind === "spring") {
    return `${designGraphWords.spring.toLowerCase()} ${Math.round(timing.duration) / 1000}s · ${curve.bounce} bounce`;
  }
  if (curve.kind === "css") {
    return bounces(curve.value)
      ? designGraphWords.writtenSpring.toLowerCase()
      : designGraphWords.asWritten.toLowerCase();
  }
  const token = easingTokenOf(curve, tokens);
  return token ? tokenWord(token.name) : designGraphWords.custom.toLowerCase();
}

/** The duration ladder: each token's length once, shortest first. */
export const ladderOf = (tokens: readonly DurationToken[]): number[] =>
  [...new Set(tokens.map((one) => one.ms))].sort((a, b) => a - b);

/** The target nearest `value` within `reach`, or null where none is that near. */
export function nearest(
  value: number,
  targets: readonly number[],
  reach: number
): number | null {
  let best: number | null = null;
  for (const one of targets) {
    if (
      Math.abs(one - value) <= reach &&
      (best === null || Math.abs(one - value) < Math.abs(best - value))
    ) {
      best = one;
    }
  }
  return best;
}

const CAPITAL = /[A-Z]/gu;
const SEPARATORS = /[\s,]+/u;
/** The family a longhand belongs to, as a person names it: `padding-top` is padding, `border-top-width` border. */
const FAMILY = /^(padding|margin|border|inset|gap|outline)(-.*)?$/u;
/** How many properties a clip's row names before it says how many more. */
const PROPERTIES_SAID = 3;

/**
 * What a clip animates, as its row says it: each property in CSS's own
 * spelling (`marginBlockEnd` as `margin-block-end`), longhands folded into
 * their family (`padding-top`, `padding-bottom` as `padding`), each once, the
 * first three and how many more. An unfold that runs eight longhands reads
 * "margin, padding, opacity +3", not eight names in code.
 */
export function propertyWords(property: string): string {
  const said: string[] = [];
  for (const one of property.split(SEPARATORS)) {
    const css = one.replaceAll(CAPITAL, (letter) => `-${letter.toLowerCase()}`);
    const name = css.match(FAMILY)?.[1] ?? css;
    if (name && !said.includes(name)) {
      said.push(name);
    }
  }
  const more = said.length - PROPERTIES_SAID;
  return more > 0
    ? `${said.slice(0, PROPERTIES_SAID).join(", ")} +${more}`
    : said.join(", ");
}

/** A length rounded to the 10ms a free drag takes. */
const tens = (ms: number) => Math.round(ms / 10) * 10;

/** The slider's end: past the clip's own length, never under 500ms. */
export const sliderMax = (ms: number) =>
  Math.max(500, Math.ceil(ms / 100) * 100);

/**
 * Whether a clip's length or curve is the agent's own, off the token scale
 * (the owner: "it chooses to use the tokens or adhoc values"): a length that
 * is no duration token, a curve that is no easing token. Marked "ad hoc".
 */
export function adHoc(
  timing: ClipTiming,
  tokens: MoveTokens
): { curve: boolean; duration: boolean } {
  return {
    duration: !durationTokenOf(timing.duration, tokens.durations),
    curve: !easingTokenOf(timing.curve, tokens.easings),
  };
}

/** The curve a choice of the curve list gives a clip: a token's, a spring kept or new, Custom from what it was. */
export function curveFor(
  choice: string,
  was: Curve,
  tokens: readonly EasingToken[]
): Curve {
  if (choice === "spring") {
    return was.kind === "spring"
      ? was
      : { kind: "spring", bounce: 0, mass: 1, velocity: 0 };
  }
  if (choice === "custom") {
    if (was.kind === "bezier") {
      return was;
    }
    const first = tokens[0]?.points ?? [0.23, 1, 0.32, 1];
    return { kind: "bezier", points: [...first] };
  }
  const token = tokens.find((one) => one.name === choice);
  return token ? { kind: "bezier", points: [...token.points] } : was;
}

/** Which choice of the curve list a curve is: its token's name, spring, custom, or written. */
export function choiceOf(curve: Curve, tokens: readonly EasingToken[]): string {
  if (curve.kind === "spring") {
    return "spring";
  }
  if (curve.kind === "css") {
    return "written";
  }
  return easingTokenOf(curve, tokens)?.name ?? "custom";
}

/** What a drag snaps to: the other clips' edges and the playhead, the duration ladder, how near in ms; ⌥ frees it. */
export interface Snaps {
  edges: readonly number[];
  free: boolean;
  ladder: readonly number[];
  reach: number;
}

/** A start dragged by `dt`: onto an edge or a ladder step, or its end onto an edge; else to the 10ms. */
function startTo(was: ClipTiming, dt: number, snaps: Snaps): number {
  const start = Math.max(0, was.start + dt);
  if (snaps.free) {
    return tens(start);
  }
  const atStart = nearest(
    start,
    [...snaps.edges, ...snaps.ladder],
    snaps.reach
  );
  if (atStart !== null) {
    return atStart;
  }
  const atEnd = nearest(start + was.duration, snaps.edges, snaps.reach);
  return atEnd === null ? tens(start) : atEnd - was.duration;
}

/** A length dragged by its end: onto a duration token first (the owner's pick "snap"), else an edge; else to the 10ms. */
function lengthTo(was: ClipTiming, dt: number, snaps: Snaps): number {
  const length = Math.max(10, was.duration + dt);
  if (snaps.free) {
    return tens(length);
  }
  const onLadder = nearest(length, snaps.ladder, snaps.reach);
  if (onLadder !== null) {
    return onLadder;
  }
  const onEdge = nearest(was.start + length, snaps.edges, snaps.reach);
  return onEdge === null ? tens(length) : onEdge - was.start;
}

/** A start dragged by the bar's start edge, its end held: onto an edge, else so its length lands on a token; else to the 10ms. */
function leadTo(was: ClipTiming, dt: number, snaps: Snaps): number {
  const stop = was.start + was.duration;
  const start = Math.min(stop - 10, Math.max(0, was.start + dt));
  if (snaps.free) {
    return tens(start);
  }
  const onEdge = nearest(start, snaps.edges, snaps.reach);
  if (onEdge !== null) {
    return onEdge;
  }
  const onLadder = nearest(stop - start, snaps.ladder, snaps.reach);
  return onLadder === null ? tens(start) : stop - onLadder;
}

/** A clip's timing dragged by `dt` ms: whole (`body`), by its start edge, or by its end. */
export function dragTo(
  zone: "start" | "end" | "body",
  was: ClipTiming,
  dt: number,
  snaps: Snaps
): ClipTiming {
  if (zone === "body") {
    return { ...was, start: Math.max(0, startTo(was, dt, snaps)) };
  }
  if (zone === "end") {
    return { ...was, duration: Math.max(10, lengthTo(was, dt, snaps)) };
  }
  const stop = was.start + was.duration;
  const start = Math.max(0, leadTo(was, dt, snaps));
  return { ...was, start, duration: Math.max(10, stop - start) };
}
