/**
 * Live work's breath as a page runs it, read from the engine (DESIGN.md,
 * Live work breathes; core breath.ts, the one clock). Run in the page or a
 * frame with `evaluate(readBreath, selector)`: it touches nothing of the
 * breath it reads.
 *
 * Answers, for the element `selector` names, every endless opacity loop on
 * it (a CSS `breath`, or a Web Animation as the preview overlay draws its
 * pills): the first one's length, its keyframes' curve, where its loops
 * begin on the wall clock (`timeOrigin` + start time + delay, ms) and how
 * far that stands off the one clock (0 is in step: a multiple of its
 * length), and its opacity at 0, ½ and 1 of a loop, read off a copy of its
 * keyframes on a probe of its own. Null when nothing matches.
 */
export interface BreathRead {
  /** Its keyframes' curve, as the engine reports it. */
  easing: string;
  /** Where its loops begin, on the wall clock, ms. */
  epochStart: number | null;
  /** One loop, ms. */
  length: number;
  /** How far its loops' start stands from the one clock's, ms (0: in step). */
  offClock: number | null;
  /** Its opacity at 0, ½ and 1 of a loop. */
  opacity: number[];
  /** Endless opacity loops on it. */
  runs: number;
}

export function readBreath(selector: string): BreathRead | null {
  const el = document.querySelector(selector);
  if (!el) {
    return null;
  }
  const loops = el
    .getAnimations()
    .filter(
      ({ effect: one }) =>
        one instanceof KeyframeEffect &&
        one.getComputedTiming().iterations === Number.POSITIVE_INFINITY &&
        one.getKeyframes().some((key) => "opacity" in key)
    );
  const [run] = loops;
  const effect = run?.effect as KeyframeEffect | undefined;
  if (!(run && effect)) {
    return {
      runs: 0,
      length: 0,
      easing: "",
      epochStart: null,
      offClock: null,
      opacity: [],
    };
  }
  const length = Number(effect.getComputedTiming().duration);
  const frames = effect.getKeyframes();
  const delay = Number(effect.getTiming().delay ?? 0);
  const epochStart =
    run.startTime === null
      ? null
      : performance.timeOrigin + Number(run.startTime) + delay;
  const off =
    epochStart === null ? null : ((epochStart % length) + length) % length;
  // The same keyframes on a probe of their own, sought to each share of a
  // loop: the breath read leaves the real one running where it stands.
  const probe = document.createElement("span");
  probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none";
  document.documentElement.append(probe);
  const copy = probe.animate(
    frames.map(({ composite: _c, computedOffset: _o, ...frame }) => frame),
    { duration: length, fill: "both" }
  );
  copy.pause();
  const opacity = [0, 0.5, 1].map((share) => {
    copy.currentTime = share * length;
    return Number(getComputedStyle(probe).opacity);
  });
  copy.cancel();
  probe.remove();
  return {
    runs: loops.length,
    length,
    easing: String(frames[0]?.easing ?? ""),
    epochStart,
    // A start a hair under the next multiple is in step too.
    offClock: off === null ? null : Math.min(off, length - off),
    opacity,
  };
}
