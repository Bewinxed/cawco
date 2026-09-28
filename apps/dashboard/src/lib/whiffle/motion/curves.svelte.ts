/**
 * The motion vocabulary for JavaScript-driven motion (Svelte transitions and
 * `element.animate()`), which the stylesheet's tokens cannot reach: the same
 * three curves as app.css, as functions of t, and the one reduced-motion
 * query every piece of JS motion reads.
 *
 * Motion is opt-in, as in the stylesheet: it runs where the reader has not
 * asked for less (`prefers-reduced-motion: no-preference`). Svelte 5 runs
 * `in:`/`out:` through the Web Animations API, which CSS media rules never
 * reach, so each transition asks `motionOk` itself; without it a transition
 * keeps its opacity and drops its travel.
 */
import { MediaQuery } from "svelte/reactivity";

export const motionOk = new MediaQuery(
  "(prefers-reduced-motion: no-preference)"
);

/** A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress. */
export function bezier(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  /** The curve parameter whose x is `x`: Newton, then bisection. */
  const solve = (x: number) => {
    let s = x;
    for (let i = 0; i < 8; i += 1) {
      const error = sampleX(s) - x;
      if (Math.abs(error) < 1e-6) {
        return s;
      }
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) {
        break;
      }
      s -= error / slope;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (hi - lo > 1e-6) {
      if (sampleX(s) < x) {
        lo = s;
      } else {
        hi = s;
      }
      s = (lo + hi) / 2;
    }
    return s;
  };
  return (t: number) => {
    if (t <= 0) {
      return 0;
    }
    return t >= 1 ? 1 : sampleY(solve(t));
  };
}

/** `--ease-out`: entrances and exits. */
export const easeOut = bezier(0.23, 1, 0.32, 1);
/** `--ease-in-out`: movement on screen. */
export const easeInOut = bezier(0.77, 0, 0.175, 1);
/** `--ease-drawer`: popovers, drawers, pages. */
export const easeDrawer = bezier(0.32, 0.72, 0, 1);

/**
 * A motion token as the stylesheet defines it (app.css), read where it is
 * used, so JS motion and CSS motion stand on one scale: `--dur-*` as
 * milliseconds, `--ease-*` as the easing string `element.animate()` takes,
 * `--pop-scale` as a number.
 */
const rootToken = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const dur = (name: `--dur-${string}`): number => {
  // In the unit it is written in: the built stylesheet's minifier rewrites
  // `280ms` as `.28s`, so the number alone is not milliseconds.
  const token = rootToken(name);
  const value = Number.parseFloat(token);
  return token.endsWith("ms") ? value : value * 1000;
};
export const ease = (name: `--ease-${string}`): string => rootToken(name);
export const popScale = (): number =>
  Number.parseFloat(rootToken("--pop-scale"));

/** The CSS strings of the same curves, for `element.animate()`. */
export const CURVE = {
  out: "cubic-bezier(0.23, 1, 0.32, 1)",
  inOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
} as const;

/**
 * Something that appears in place — a problem under a field, a notice in a
 * footer — fades up rather than popping in. Opacity only, so it runs with or
 * without motion.
 */
export function appear(_node: Element) {
  return {
    duration: 200,
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  };
}

/**
 * A floating tag coming and going over the transcript's foot ("Jump to
 * latest", the catch-up): it rises 8px and grows from .96 as it fades in,
 * and sinks back out. `token` is its duration: --dur-panel in, --dur-exit
 * out. Without motion it only fades.
 */
export function rise(_node: Element, token: "--dur-panel" | "--dur-exit") {
  const travel = motionOk.current;
  return {
    duration: dur(token),
    easing: easeOut,
    css: (t: number) =>
      travel
        ? `opacity: ${t}; transform: translateY(${(1 - t) * 8}px) scale(${0.96 + 0.04 * t})`
        : `opacity: ${t}`,
  };
}

/**
 * One view handing its place to another — a skeleton to what it stood in
 * for, a document to the next, a reader to its editor: the two cross-fade
 * over --dur-control. The one leaving is taken out of the flow as it starts,
 * pinned where it stands (its parent is `position: relative`), so the box is only ever the size of
 * what arrives and a height morph around it has one change to follow.
 * Opacity only, so it runs with or without motion.
 */
export function crossIn(_node: Element) {
  return {
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  };
}

export function crossOut(node: HTMLElement) {
  const { offsetTop, offsetLeft, offsetWidth } = node;
  node.style.position = "absolute";
  node.style.top = `${offsetTop}px`;
  node.style.left = `${offsetLeft}px`;
  node.style.width = `${offsetWidth}px`;
  node.style.pointerEvents = "none";
  return {
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  };
}
