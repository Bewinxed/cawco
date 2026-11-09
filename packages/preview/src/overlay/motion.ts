/**
 * DESIGN.md's Reduced Motion Rule, as the overlay asks it: motion is
 * opt-in, so what travels runs only where the person has said no preference
 * (`prefers-reduced-motion: no-preference`), the question the dashboard's
 * `motionOk` asks (motion/curves.svelte.ts), which this bundle cannot
 * import. Anywhere else (reduced motion, or a browser that cannot say) only
 * opacity fades run, and a scroll jumps.
 */
export const motionOk = (): boolean =>
  matchMedia("(prefers-reduced-motion: no-preference)").matches;
