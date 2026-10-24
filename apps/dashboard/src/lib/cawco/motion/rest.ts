/**
 * Nothing animates that nobody can see. The few loops the app keeps (a
 * loader that is loading, the thinking indicator of a session streaming on
 * screen) hold still while the tab is hidden or they are scrolled out of
 * view: `data-at-rest` on the root, and `data-offscreen` on an element,
 * pause every loop under them (app.css), each loop marked by the one class
 * it carries (`loops`): the mark is what lets a flip of either attribute
 * restyle only the loops, not every element under it.
 *
 * `data-offscreen` has two writers: {@link restOffscreen} here, on an
 * element scrolled out of view, and PaneLeaf, on a pane put away
 * (`.pane-hidden`), whose skipped subtree would otherwise run its loops on
 * ({@link holdSkipped} carries the hold into it).
 */

/** Marks the root while the tab is hidden. Returns the cleanup. */
export function restWhenHidden(): () => void {
  const root = document.documentElement;
  const sync = () => root.toggleAttribute("data-at-rest", document.hidden);
  sync();
  document.addEventListener("visibilitychange", sync);
  return () => document.removeEventListener("visibilitychange", sync);
}

/**
 * An attachment for a pane `away` (put away: `data-offscreen` and
 * `content-visibility: hidden` in one update): its loops' style asked for,
 * and its runs that end finished, once, after the frame that put it away
 * has painted.
 *
 * Chrome restyles nothing inside content it skips, so the hold set in the
 * same update as the skip never reached a loop running as its pane went
 * away: it stayed running, and the page drew a main-thread frame every
 * frame for nothing drawn (measured: 120 frames in 2s with one such loop,
 * none once it was held; tab-return 1a, an empty transcript's breath). A
 * loop's computed style, asked for, restyles what the skip held back, the
 * hold among it. Asked after the paint, the rest of the page is styled
 * already, so that is all it restyles.
 *
 * What runs once (an entrance: the cover's wait-grace fade, a row's reveal)
 * is finished there, standing at its end: nothing runs while the pane is
 * away, and a person coming back sees it as it would be by then. Held
 * instead, it would play its rest as they came back (a cover's wait seen
 * again); a run already held (paused) stays as it is.
 */
export function holdSkipped(away: boolean) {
  return (node: Element): (() => void) | undefined => {
    if (!away) {
      return;
    }
    let task: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      task = setTimeout(() => {
        for (const loop of node.querySelectorAll(".loops")) {
          getComputedStyle(loop).getPropertyValue("animation-play-state");
        }
        for (const run of node.getAnimations({ subtree: true })) {
          const end = Number(run.effect?.getComputedTiming().endTime);
          if (run.playState === "running" && Number.isFinite(end)) {
            run.finish();
          }
        }
      });
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(task);
    };
  };
}

/** An attachment: marks its element while none of it is in view. */
export function restOffscreen(node: Element): () => void {
  const observer = new IntersectionObserver(([entry]) => {
    node.toggleAttribute("data-offscreen", !entry?.isIntersecting);
  });
  observer.observe(node);
  return () => observer.disconnect();
}
