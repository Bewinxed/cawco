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
 * (`.pane-hidden`), whose skipped subtree would otherwise run its loops on.
 */

/** Marks the root while the tab is hidden. Returns the cleanup. */
export function restWhenHidden(): () => void {
  const root = document.documentElement;
  const sync = () => root.toggleAttribute("data-at-rest", document.hidden);
  sync();
  document.addEventListener("visibilitychange", sync);
  return () => document.removeEventListener("visibilitychange", sync);
}

/** An attachment: marks its element while none of it is in view. */
export function restOffscreen(node: Element): () => void {
  const observer = new IntersectionObserver(([entry]) => {
    node.toggleAttribute("data-offscreen", !entry?.isIntersecting);
  });
  observer.observe(node);
  return () => observer.disconnect();
}
