/// <reference lib="dom" />

/**
 * The canvas's motion clocks (DESIGN.md, Motion grammar). Excalidraw draws
 * its elements on a canvas, so what fades there is an element's opacity set
 * frame by frame; the frames read a Web Animation that carries no keyframes
 * of its own, the clock, which DevTools can pause and seek (the probe
 * scrubs it) and which runs on the tokens' durations and curves. Opacity
 * fades run under reduced motion too (The Reduced Motion Rule: "opacity
 * and colour fades still run").
 */

/** A token's value as written (`--ease-out` is a `cubic-bezier(…)`). */
export const tokenValue = (token: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(token).trim();

/** A token's duration in ms (`--dur-fade` is 200ms). */
export const tokenMs = (token: string): number =>
  Number.parseFloat(tokenValue(token)) || 0;

/** A clock named `name` (its Web Animation's id) of `duration` on `--ease-out`, after `delay` ms. */
export const clock = (name: string, duration: number, delay = 0): Animation => {
  const host =
    document.querySelector(".excalidraw") ?? document.documentElement;
  const run = host.animate([], {
    duration,
    delay,
    easing: tokenValue("--ease-out") || "linear",
    fill: "both",
  });
  run.id = name;
  return run;
};

/** Where a clock stands, 0 to 1 on its curve; 1 once it has run out. */
export const progressOf = (run: Animation): number =>
  run.playState === "finished"
    ? 1
    : (run.effect?.getComputedTiming().progress ?? 1);
