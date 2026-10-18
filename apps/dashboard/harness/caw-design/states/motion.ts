/**
 * DESIGN STATES: the design's motion tokens read where Svelte's own
 * transitions need them as numbers (a duration in ms, an easing function),
 * so a proposal's list motion runs on DESIGN.md's clock and curves.
 */
import type { TransitionConfig } from "svelte/transition";

const value = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A duration token in ms ("260ms", "1.2s"). */
export function ms(name: string): number {
  const raw = value(name);
  const number = Number.parseFloat(raw);
  return raw.endsWith("ms") ? number : number * 1000;
}

const BEZIER = /cubic-bezier\(([^)]+)\)/;

/** A `cubic-bezier()` easing token as a function of progress. */
export function ease(name: string): (t: number) => number {
  const found = value(name).match(BEZIER);
  if (!found) {
    return (t) => t;
  }
  const [x1, y1, x2, y2] = found[1].split(",").map(Number);
  const at = (a: number, b: number, t: number) =>
    3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t ** 2 + t ** 3;
  return (x) => {
    let low = 0;
    let high = 1;
    for (let step = 0; step < 24; step += 1) {
      const mid = (low + high) / 2;
      if (at(x1, x2, mid) < x) {
        low = mid;
      } else {
        high = mid;
      }
    }
    return at(y1, y2, (low + high) / 2);
  };
}

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Uncovered: up from --pop-rise and in over --dur-pop (opacity only, reduced). */
export function uncover(
  _node: Element,
  { delay = 0 }: { delay?: number } = {}
): TransitionConfig {
  const rise = Number.parseFloat(value("--pop-rise"));
  const still = reduced();
  return {
    delay,
    duration: ms("--dur-pop"),
    easing: ease("--ease-out"),
    css: (t, u) =>
      still
        ? `opacity: ${t}`
        : `opacity: ${t}; transform: translateY(${u * rise}px)`,
  };
}

/** Closed and faded over --dur-exit: a leaver. */
export function leave(node: Element): TransitionConfig {
  const height = (node as HTMLElement).offsetHeight;
  return {
    duration: ms("--dur-exit"),
    easing: ease("--ease-out"),
    css: (t) => `opacity: ${t}; block-size: ${t * height}px; overflow: clip`,
  };
}

/** A cross-fade on --dur-fade, opacity only. */
export function crossFade(_node: Element): TransitionConfig {
  return {
    duration: ms("--dur-fade"),
    easing: ease("--ease-out"),
    css: (t) => `opacity: ${t}`,
  };
}
