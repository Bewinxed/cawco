/**
 * Nothing animates that nobody can see. The few loops the app keeps (a
 * loader that is loading, the thinking indicator of a session streaming on
 * screen) hold still while the tab is hidden or they are scrolled out of
 * view: `data-at-rest` on the root, and `data-offscreen` on an element,
 * pause every animation under them (app.css).
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
