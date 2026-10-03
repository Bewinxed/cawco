/**
 * Whether an element is rendered at all, and the moment that changes.
 *
 * Content an ancestor skips (`content-visibility: hidden`: the home board
 * put away under a conversation) has no layout to read, and reading one
 * lays it out. `checkVisibility()` says so without laying anything out: it
 * is false when "the element is not being rendered because the element or
 * an ancestor element sets the content-visibility property to hidden"
 * (https://developer.mozilla.org/en-US/docs/Web/API/Element/checkVisibility).
 * The platform's event for skipped content, `contentvisibilityautostatechange`,
 * fires only for `content-visibility: auto`, and a skipped subtree fires no
 * ResizeObserver; an IntersectionObserver reports it as not intersecting and
 * reports it again the frame it is rendered (measured in WebKit and
 * Chromium). Not intersecting, the element counts as skipped only when
 * `checkVisibility()` agrees: one merely scrolled out of view is still laid
 * out.
 *
 * `change` hears each edge after the first; the first answer is returned.
 */
export function watchRendered(
  node: Element,
  change: (rendered: boolean) => void
): { rendered: boolean; stop: () => void } {
  let rendered = node.checkVisibility();
  const shown = new IntersectionObserver(([entry]) => {
    const now = entry.isIntersecting || node.checkVisibility();
    if (now !== rendered) {
      rendered = now;
      change(now);
    }
  });
  shown.observe(node);
  return { rendered, stop: () => shown.disconnect() };
}
