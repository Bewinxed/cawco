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
 * A motion token as the stylesheet defines it (app.css), so JS motion and
 * CSS motion stand on one scale: `--dur-*` as milliseconds, `--ease-*` as
 * the easing string `element.animate()` takes, `--pop-scale` as a number.
 *
 * Read off the root once, all of them in one pass, and again only after the
 * root's class changes — the theme is a class on it (theme.svelte.ts). Read
 * where each was used, every call restyled the whole page in the middle of
 * whatever task asked: a tab switch asked several times.
 */
const TOKENS = [
  "--dur-control",
  "--dur-menu",
  "--dur-pop",
  "--dur-panel",
  "--dur-exit",
  "--dur-toggle",
  "--dur-morph",
  "--dur-rail",
  "--dur-fade",
  "--dur-hold",
  "--dur-ghost",
  "--dur-stagger",
  "--dur-cascade",
  "--ease-out",
  "--ease-in-out",
  "--ease-drawer",
  "--pop-scale",
  "--pop-rise",
  "--space-1",
  "--space-3",
];
const tokens = new Map<string, string>();
let watched = false;
const rootToken = (name: string): string => {
  const held = tokens.get(name);
  if (held !== undefined) {
    return held;
  }
  const root = document.documentElement;
  if (!watched) {
    watched = true;
    new MutationObserver(() => tokens.clear()).observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });
  }
  const style = getComputedStyle(root);
  for (const token of tokens.size === 0 ? [...TOKENS, name] : [name]) {
    tokens.set(token, style.getPropertyValue(token).trim());
  }
  return tokens.get(name) as string;
};
export const dur = (name: `--dur-${string}`): number => {
  // In the unit it is written in: the built stylesheet's minifier rewrites
  // `280ms` as `.28s`, so the number alone is not milliseconds.
  const token = rootToken(name);
  const value = Number.parseFloat(token);
  return token.endsWith("ms") ? value : value * 1000;
};
export const ease = (name: `--ease-${string}`): string => rootToken(name);
/**
 * `--dur-morph` for a TextMorph's `duration` prop: words and figures morph
 * at the pace a button's width follows its label. 0 on the server, where
 * nothing animates and there is no stylesheet to read.
 */
export const morphMs = (): number =>
  typeof document === "undefined" ? 0 : dur("--dur-morph");
export const popScale = (): number =>
  Number.parseFloat(rootToken("--pop-scale"));
/** `--pop-rise` in px: how far a small entrance travels. */
export const popRise = (): number => Number.parseFloat(rootToken("--pop-rise"));

/** The CSS strings of the same curves, for `element.animate()`. */
export const CURVE = {
  out: "cubic-bezier(0.23, 1, 0.32, 1)",
  inOut: "cubic-bezier(0.77, 0, 0.175, 1)",
  drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
  glideIn: "cubic-bezier(0.3333, 0, 0.6667, 0.3333)",
  glideOut: "cubic-bezier(0.3333, 0.6667, 0.6667, 1)",
} as const;

/** A `--space-*` token in px. */
const space = (name: string) => Number.parseFloat(rootToken(name)) || 0;

/**
 * The speed (px a ms) to glide `distance` px past `stops` evenly spaced
 * stops at: --dur-stagger between one stop and the next, and never longer
 * than --dur-cascade for the whole way, its two ends included, however many
 * stops there are. With no stops to space (a block opening on its own), the
 * whole way takes --dur-panel, as a panel's does. `least`: the slowest it
 * may go and still take no longer than --dur-cascade.
 */
export function glideSpeed(
  distance: number,
  stops: number
): { least: number; speed: number } {
  const ends = space("--space-3") + space("--space-1");
  const least = (distance + ends) / dur("--dur-cascade");
  const own =
    stops > 0
      ? distance / stops / dur("--dur-stagger")
      : (distance + ends) / dur("--dur-panel");
  return { least, speed: Math.max(own, least) };
}

/**
 * A glide: a distance travelled at one steady speed (px a ms), its speed
 * rising evenly from rest over the first --space-3 and falling evenly to
 * rest over the last --space-1 (--ease-glide-in, --ease-glide-out), steady
 * between. A tree's line runs its length this way, so the rows it reaches
 * are revealed at even times, and the room it opens and the rows under it
 * travel the same way at the same speed, so they keep step with it. A
 * distance too short for both ends shares it between them.
 */
export function glide(distance: number, speed: number) {
  const ends = space("--space-3") + space("--space-1");
  const share = ends > 0 ? Math.min(1, distance / ends) : 0;
  const into = space("--space-3") * share;
  const outOf = space("--space-1") * share;
  const rising = (2 * into) / speed;
  const steady = Math.max(0, distance - into - outOf) / speed;
  const fall = (2 * outOf) / speed;
  const duration = rising + steady + fall;
  /** How far along it is at `t` ms. */
  const covered = (t: number): number => {
    if (t <= 0) {
      return 0;
    }
    if (t < rising) {
      return (speed / (2 * rising)) * t * t;
    }
    if (t < rising + steady) {
      return into + speed * (t - rising);
    }
    if (t < duration) {
      const left = duration - t;
      return distance - (speed / (2 * fall)) * left * left;
    }
    return distance;
  };
  /** When it is `d` along. */
  const reached = (d: number): number => {
    if (d <= 0) {
      return 0;
    }
    if (d >= distance) {
      return duration;
    }
    if (d < into) {
      return Math.sqrt((2 * rising * d) / speed);
    }
    if (d <= distance - outOf) {
      return rising + (d - into) / speed;
    }
    return duration - Math.sqrt((2 * fall * (distance - d)) / speed);
  };
  /**
   * The same glide as keyframes, from `from` to `to`: a rising stretch, a
   * steady one and a falling one, each on its own curve, so it runs off the
   * main thread like any other animation.
   */
  const frames = (from: Keyframe, to: Keyframe): Keyframe[] =>
    duration <= 0 || distance <= 0
      ? [from, to]
      : [
          { ...from, offset: 0, easing: CURVE.glideIn },
          {
            ...between(from, to, into / distance),
            offset: rising / duration,
            easing: "linear",
          },
          {
            ...between(from, to, (distance - outOf) / distance),
            offset: (rising + steady) / duration,
            easing: CURVE.glideOut,
          },
          { ...to, offset: 1 },
        ];
  return { covered, duration, frames, reached };
}

const NUMBER = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
const TIMING_KEYS = new Set([
  "offset",
  "easing",
  "composite",
  "computedOffset",
]);

/**
 * A keyframe `p` of the way from `from` to `to`: every number in each of
 * `from`'s values moved that far towards its counterpart in `to` (the two
 * are written alike: `12px` and `40px`, `inset(… 30px …)` and
 * `inset(… 0px …)`).
 */
function between(from: Keyframe, to: Keyframe, p: number): Keyframe {
  const mixed: Keyframe = {};
  for (const [key, value] of Object.entries(from)) {
    if (TIMING_KEYS.has(key) || value === undefined || value === null) {
      continue;
    }
    const target = String(to[key] ?? value).match(NUMBER) ?? [];
    let i = 0;
    mixed[key] = String(value).replace(NUMBER, (number) => {
      const a = Number(number);
      const b = Number(target[i] ?? number);
      i += 1;
      return String(Number((a + (b - a) * p).toFixed(3)));
    });
  }
  return mixed;
}

/**
 * Something that appears in place — a problem under a field, a notice in a
 * footer — fades up rather than popping in. Opacity only, so it runs with or
 * without motion.
 */
export function appear(_node: Element) {
  return {
    duration: dur("--dur-fade"),
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

/**
 * A view leaving where nothing is rendered (an ancestor skips its content:
 * the home board put away under a conversation) goes at once: there is no
 * fade to see, and reading where it stands would lay the skipped content out.
 */
export function crossOut(node: HTMLElement) {
  if (!node.checkVisibility()) {
    return { duration: 0 };
  }
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
