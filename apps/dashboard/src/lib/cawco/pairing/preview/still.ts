/**
 * A frame of a moment, held still: every animation and transition under a
 * root sought to one time on the moment's clock, its values read there and
 * written on its element, and the animation gone, so no clock (the page's,
 * or a capture's that finishes animations) moves the frame again. Preview
 * only: how a decision page shows motion compared where takes differ.
 */

/** Keyframe keys that name no property. */
const NOT_PROPERTIES = new Set([
  "offset",
  "computedOffset",
  "easing",
  "composite",
]);

/** A keyframe key as its CSS property: `strokeDashoffset` → `stroke-dashoffset`, `cssOffset` → `offset`. */
const property = (key: string): string =>
  key === "cssOffset"
    ? "offset"
    : key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/**
 * Holds everything animating under `root` `ms` into the moment (its runs
 * all start with it), and writes each animated value inline. Answers how
 * many runs it held.
 */
export function still(root: Element, ms: number): number {
  const runs = root.getAnimations({ subtree: true });
  for (const run of runs) {
    run.pause();
    run.currentTime = ms;
  }
  const held: [HTMLElement | SVGElement, string, string][] = [];
  for (const run of runs) {
    const { effect } = run;
    if (!(effect instanceof KeyframeEffect) || effect.pseudoElement) {
      continue;
    }
    const { target } = effect;
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) {
      continue;
    }
    const style = getComputedStyle(target);
    const keys = new Set(effect.getKeyframes().flatMap(Object.keys));
    for (const key of keys) {
      if (!NOT_PROPERTIES.has(key)) {
        const name = property(key);
        held.push([target, name, style.getPropertyValue(name)]);
      }
    }
  }
  for (const run of runs) {
    run.cancel();
  }
  for (const [target, name, value] of held) {
    target.style.setProperty("animation", "none", "important");
    target.style.setProperty("transition", "none", "important");
    target.style.setProperty(name, value, "important");
  }
  return runs.length;
}
