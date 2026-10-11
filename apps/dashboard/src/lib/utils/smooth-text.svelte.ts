import { untrack } from "svelte";

/** Frames a backlog is spread over — ~0.4s at 60fps, whatever its size. */
const CATCH_UP_FRAMES = 24;

const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Paces a streaming string so a burst arrives as a steady reveal instead of a
 * jump. Presentation only — the source is never touched, so whoever owns it
 * (follow pins, unseen counters) still reads the real thing. An idle stream
 * costs nothing: no frame is scheduled once the shown text has caught up.
 */
export function smoothText(source: () => string): { readonly text: string } {
  let shown = $state("");

  $effect(() => {
    const target = source();
    const from = untrack(() => shown);

    // A source that no longer continues what is on screen was reset or
    // replaced; revealing the difference would be nonsense, so snap.
    if (prefersReducedMotion() || !target.startsWith(from)) {
      shown = target;
      return;
    }
    const backlog = target.length - from.length;
    if (backlog <= 0) {
      return;
    }

    // Fixed for this drain, so the reveal is steady rather than easing out; the
    // next chunk re-arms the effect and sizes its own step against its own
    // backlog, which is what makes a long one catch up quickly.
    const step = Math.max(1, Math.ceil(backlog / CATCH_UP_FRAMES));

    let frame = requestAnimationFrame(function reveal() {
      const next = shown.length + step;
      shown = target.slice(0, next);
      if (next < target.length) {
        frame = requestAnimationFrame(reveal);
      }
    });

    return () => cancelAnimationFrame(frame);
  });

  return {
    get text() {
      return shown;
    },
  };
}
