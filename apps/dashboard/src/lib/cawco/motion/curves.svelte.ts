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
import type { TransitionConfig } from "svelte/transition";

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
  "--dur-grow",
  "--dur-grow-exit",
  "--dur-lift",
  "--dur-press-hold",
  "--dur-exit",
  "--dur-toggle",
  "--dur-morph",
  "--dur-rail",
  "--dur-fade",
  "--dur-hold",
  "--dur-ghost",
  "--dur-stagger",
  "--dur-cascade",
  "--dur-skeleton-reveal",
  "--skeleton-reveal-blur",
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
export const popScale = (): number =>
  Number.parseFloat(rootToken("--pop-scale"));
/** `--pop-rise` in px: how far a small entrance travels. */
export const popRise = (): number => Number.parseFloat(rootToken("--pop-rise"));
/** A unitless or px token as its number (`--echo-scale`, `--ride-fade`). */
export const numberOf = (name: `--${string}`): number =>
  Number.parseFloat(rootToken(name));

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

/** One way an element comes in: its length and curve, and whether it rises from its side. */
export interface Arrival {
  easing?: `--ease-${string}`;
  over: `--dur-${string}`;
  /** It comes in from beside where it stands, by --pop-rise along x, as a sheet from its side. */
  rise?: "x";
}

/**
 * An element's entrance, attached: as it mounts it comes in by one Web
 * Animation on the element itself (`appear` by default: --dur-fade on
 * ease-out, opacity only). Never by `@starting-style` (Tailwind's
 * `starting:`), which WebKit sometimes skips for an element just added
 * (bugs.webkit.org 275184, comment 8, "transitions are sometimes not
 * applied when adding elements"). An attachment, so it runs as the element
 * mounts whichever block mounts it (a Svelte Flow node, an `{#if}`).
 *
 * `motion` is how it comes in with motion, `reduced` with reduced motion,
 * each an `Arrival` or `false` (it stands at once): the stylesheet's own
 * `motion-safe:` and `motion-reduce:` split, kept site by site. `when` says
 * whether this mount is an arrival at all (the Canvas view's first layout,
 * a decision card landing in one frame); read off the page, never off
 * state, so the entrance runs once.
 */
export function appearOnMount({
  when = () => true,
  motion = { over: "--dur-fade" },
  reduced = false,
}: {
  motion?: Arrival | false;
  reduced?: Arrival | false;
  when?: (node: HTMLElement) => boolean;
} = {}): (node: HTMLElement) => void {
  return (node) => {
    const arrival = motionOk.current ? motion : reduced;
    if (!(arrival && when(node))) {
      return;
    }
    const from: Keyframe = { opacity: 0 };
    const to: Keyframe = { opacity: 1 };
    if (arrival.rise === "x") {
      const by = Number.parseFloat(
        getComputedStyle(node).getPropertyValue("--pop-rise")
      );
      from.translate = `${by}px 0`;
      to.translate = "0 0";
    }
    node.animate([from, to], {
      duration: dur(arrival.over),
      easing: arrival.easing ? ease(arrival.easing) : CURVE.out,
    });
  };
}

/**
 * An entrance by the element's own transition, for one whose transition
 * also carries its exit (a decided line's Change, which a turn caught
 * mid-way fades back from where it stands): drawn with `data-entering`,
 * which its classes draw at its starting look (`data-entering:opacity-0`),
 * the mark is taken off once its first style is drawn, and its transition
 * runs from there. A style change WebKit always plays, never
 * `@starting-style`, which it sometimes skips for an element just added
 * (bugs.webkit.org 275184). A CSS transition, so a turn back mid-way runs
 * from where it stands, which a script's animation under it would not.
 * `when` false (its card lands in one frame, or it is not moving): the
 * mark goes with the transition held off, and it is simply there.
 */
export function enterByStyle(
  when: (node: HTMLElement) => boolean = () => true
): (node: HTMLElement) => void {
  return (node) => {
    const play = when(node);
    if (!play) {
      node.style.transition = "none";
    }
    // Its first style, at its starting look, before the mark goes.
    // biome-ignore lint/complexity/noVoid: the read draws its first style, so taking the mark off is a change its transition runs on
    void getComputedStyle(node).opacity;
    node.removeAttribute("data-entering");
    if (!play) {
      // biome-ignore lint/complexity/noVoid: the read draws it standing, with the transition still held off
      void getComputedStyle(node).opacity;
      node.style.removeProperty("transition");
    }
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
 * One view handing its place to another — a document to the next, a reader
 * to its editor (a skeleton hands its place by `reveal`/`revealOut`): the two cross-fade
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

/** `--ease-crossfade` (CSS ease-in-out): a skeleton's pulse and its reveal. */
export const easeCrossfade = bezier(0.42, 0, 0.58, 1);

/**
 * The reveal (transitions.dev Skeleton loader and reveal, DESIGN.md
 * Skeleton): a skeleton handing its place to what it stood for. Both layers
 * run on one clock, --dur-skeleton-reveal on --ease-crossfade: the content
 * fades up out of a --skeleton-reveal-blur blur while the skeleton fades out
 * into one. Every swap from a skeleton to its content takes it: `in:reveal`
 * on what arrives, and `out:revealOut` on the skeleton where it leaves the
 * flow, or `out:reveal` where the two already share one cell. With reduced
 * motion the swap is at once, as the recipe's guard has it.
 */
export function reveal(_node?: Element): TransitionConfig {
  if (!motionOk.current) {
    return { duration: 0 };
  }
  const blur = numberOf("--skeleton-reveal-blur");
  return {
    duration: dur("--dur-skeleton-reveal"),
    easing: easeCrossfade,
    css: (t) => `opacity: ${t}; filter: blur(${((1 - t) * blur).toFixed(3)}px)`,
  };
}

/**
 * {@link reveal} as one Web Animation on an element the page moves itself:
 * `in`, content unveiled where its skeleton stood (`out:reveal` beside it in
 * its cell, or a skeleton row a `reflow` list lets go); `out`, the copy of a
 * skeleton row such a list leaves where it stood. The same keyframes on the
 * same clock; null, and nothing run, with reduced motion.
 */
export function revealOn(
  node: Element,
  way: "in" | "out",
  options: KeyframeAnimationOptions = {}
): Animation | null {
  const { duration } = reveal();
  if (!duration) {
    return null;
  }
  const blur = numberOf("--skeleton-reveal-blur");
  const standing = { opacity: 1, filter: "blur(0px)" };
  const away = { opacity: 0, filter: `blur(${blur}px)` };
  return node.animate(way === "in" ? [away, standing] : [standing, away], {
    duration,
    easing: ease("--ease-crossfade"),
    ...options,
  });
}

/**
 * The reveal for content whose own block does not swap with its skeleton's
 * (the rows of an `{#each}` inside the branch that replaces the skeleton,
 * whose local intros never play as that branch comes): `stood`, attached to
 * the skeleton, marks that it stood; `arrive`, as `in:arrive|global` on what
 * comes, is {@link reveal} in the frame the skeleton went and nothing at any
 * other time (a popover opening on content already read).
 */
export function afterSkeleton(): {
  arrive: (node: Element) => TransitionConfig;
  stood: (node: Element) => void;
} {
  let stood = false;
  let clearing = false;
  return {
    stood: () => {
      stood = true;
    },
    arrive: (node) => {
      if (!stood) {
        return { duration: 0 };
      }
      if (!clearing) {
        clearing = true;
        requestAnimationFrame(() => {
          stood = false;
          clearing = false;
        });
      }
      return reveal(node);
    },
  };
}

/**
 * A blur that moves with a CSS animation on `node`, driven by script: each
 * frame while the animation named `name` runs, `node`'s inline `filter` is
 * `blur(px × (1 − p))`, p its progress on `curve` (the curve its keyframes
 * name), the same clock; cleared once it ends. The look is the keyframes'
 * own blur, frame for frame. Why by script: WebKit 2359 kills its web
 * process on a blur an animation or a transition moves, as the owner's
 * iPhone Safari hangs (scripts/probe-kit/specs/web/safari-blurs.ts, the
 * send/stop glyph caught with `icon-swap` running at every crash), and it
 * draws a blur a script sets each frame (the recall wheel's rows) whole.
 */
export function blurAlong(
  node: HTMLElement,
  name: string,
  px: number,
  curve: (t: number) => number
): void {
  const run = node
    .getAnimations()
    .find(
      (one) =>
        (one as Animation & { animationName?: string }).animationName === name
    );
  if (!run) {
    return;
  }
  const frame = () => {
    const progress = run.effect?.getComputedTiming().progress;
    if (
      run.playState === "finished" ||
      progress === null ||
      progress === undefined
    ) {
      node.style.removeProperty("filter");
      return;
    }
    node.style.filter = `blur(${(px * (1 - curve(progress))).toFixed(3)}px)`;
    requestAnimationFrame(frame);
  };
  frame();
}

/** {@link revealOn}'s arrival, for an attachment: content unveiled where its skeleton stood. */
export function revealHere(node: Element): void {
  revealOn(node, "in");
}

/**
 * A skeleton leaving by its {@link reveal}, taken out of the flow where it
 * stands as it starts (pinned there, as {@link crossOut} pins), so the box
 * is only ever the size of what arrives. One leaving where nothing is
 * rendered goes at once, as with reduced motion.
 */
export function revealOut(node: HTMLElement): TransitionConfig {
  return revealOutWith(node, pinned(node));
}

/** {@link revealOut} lifted by its own `lift` (pinned over its parent's whole box, held at a height). */
export function revealOutWith(
  node: HTMLElement,
  lift: () => Record<string, string>
): TransitionConfig {
  if (!(motionOk.current && node.checkVisibility())) {
    return { duration: 0 };
  }
  return lifting(node, lift, reveal());
}

/**
 * A view leaving where nothing is rendered (an ancestor skips its content:
 * the home board put away under a conversation) goes at once: there is no
 * fade to see, and reading where it stands would lay the skipped content out.
 */
export function crossOut(node: HTMLElement) {
  return crossOutWith(node);
}

/**
 * {@link crossOut} with more of the lift, read with it (a height it is held
 * at). Never a directive itself: Svelte calls a transition with its params,
 * `{}` when none are given, as the second argument.
 */
export function crossOutWith(
  node: HTMLElement,
  more?: () => Record<string, string>
) {
  if (!node.checkVisibility()) {
    return { duration: 0 };
  }
  return lifting(node, pinned(node, more), {
    duration: dur("--dur-control"),
    easing: easeOut,
    css: (t: number) => `opacity: ${t}`,
  });
}

/**
 * Where a leaving node stands, pinned there out of the flow and out of the
 * pointer's way (its offset parent is `position: relative`): {@link lifting}'s
 * lift for every view that hands its place to another.
 */
export const pinned =
  (node: HTMLElement, more?: () => Record<string, string>) =>
  (): Record<string, string> => ({
    position: "absolute",
    top: `${node.offsetTop}px`,
    left: `${node.offsetLeft}px`,
    width: `${node.offsetWidth}px`,
    "pointer-events": "none",
    ...more?.(),
  });

/**
 * An outro that lifts its node as it starts to leave: `lift` reads where it
 * stands and answers the inline styles that take it out of the flow (or the
 * pointer's way, or onto a stack of its own), by CSS property name.
 *
 * Svelte 5 resumes a branch still leaving when it is asked for again (a
 * refused password answered sooner than the fade): the same node comes back
 * (svelte/src/internal/client/dom/blocks/branches.js `resume_effect`), its
 * outro aborted and reset, and reset ticks it (1, 0)
 * (svelte/src/internal/client/dom/elements/transitions.js `animate`). That
 * tick sets it down: each property takes back the inline value it had before
 * the lift, so the node stands in the flow and takes presses again. Left
 * lifted, it stood out of the flow and out of the pointer's way, its box (and
 * a card sized by it) short of it and whatever lay behind it taking its
 * presses.
 *
 * Svelte keeps these options for the node's next leave and does not call the
 * factory again, so that leave lifts it as its keyframes are built (Svelte
 * calls `css` then, before the first frame plays), read where it stands then.
 *
 * Reset and the first frame of a fade both tick (1, 0). A reset before this
 * leave's keyframes were built (during Svelte's delay) or after a frame under
 * 1 has played is told by that alone. Between the two, the fade's own
 * animation tells them: Svelte starts it on the node just after building its
 * keyframes, and a reset has aborted it (`catchFade` takes it as it starts).
 */
export function lifting(
  node: HTMLElement,
  lift: () => Record<string, string>,
  config: TransitionConfig
): TransitionConfig {
  /** What each lifted property held inline before: its value and priority. */
  let held: [string, string, string][] | null = null;
  /** This leave's keyframes are built and no frame under 1 has played. */
  let opening = false;
  /** The fade Svelte started after this leave's keyframes, taken as it started. */
  let fade: Animation | null = null;
  /** That fade is still playing: a reset aborts it first. */
  const fading = () => fade?.playState === "running";
  /**
   * Takes the fade Svelte starts on the node straight after asking for its
   * keyframes, the node's next `animate` (svelte/src/internal/client/dom/
   * elements/transitions.js `animate`: `animation = element.animate(
   * keyframes, { duration, fill: 'forwards' })`), and hands it on. Listing
   * the node's animations to tell the fade from the rest instead styled
   * the whole page in the middle of the frame the leave began in — every
   * tab switch's frame, for the composer's tray — and once more for what
   * the frame went on to change.
   */
  const catchFade = () => {
    node.animate = (keyframes, options) => {
      Reflect.deleteProperty(node, "animate");
      fade = Element.prototype.animate.call(node, keyframes, options);
      return fade;
    };
  };
  const up = () => {
    if (held) {
      return;
    }
    held = Object.entries(lift()).map(([prop, value]) => {
      const was: [string, string, string] = [
        prop,
        node.style.getPropertyValue(prop),
        node.style.getPropertyPriority(prop),
      ];
      node.style.setProperty(prop, value);
      return was;
    });
  };
  const down = () => {
    for (const [prop, value, priority] of held ?? []) {
      if (value) {
        node.style.setProperty(prop, value, priority);
      } else {
        node.style.removeProperty(prop);
      }
    }
    held = null;
  };
  up();
  const { css, tick } = config;
  return {
    ...config,
    css: (t, u) => {
      if (!(held && opening)) {
        up();
        opening = true;
        fade = null;
        catchFade();
      }
      return css?.(t, u) ?? "";
    },
    tick: (t, u) => {
      if (t < 1) {
        opening = false;
        up();
      } else if (!(opening && fading())) {
        opening = false;
        down();
      }
      tick?.(t, u);
    },
  };
}
