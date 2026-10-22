/**
 * Custom properties a sheet needs that change while it is open, written on
 * its node one at a time and never through its `style` attribute. vaul
 * writes the sheet's transform on the node itself while a finger drags it,
 * and a changed style attribute is written whole: one keyboard step, or one
 * new height, rewrote it and dropped that transform, so the sheet jumped
 * back under the finger (probe parked-start, "the sheet's transform holds").
 *
 * A redraw of the attribute that happens anyway (vaul's own snap-point
 * height as the window changes) takes these with it, so they are written
 * again whenever the attribute changes. `null` takes a property away.
 * Returns the release.
 */
export function holdStyle(
  node: HTMLElement,
  values: Record<`--${string}`, string | null>
): () => void {
  const entries = Object.entries(values) as [string, string | null][];
  const hold = () => {
    for (const [name, value] of entries) {
      const now = node.style.getPropertyValue(name);
      if (value === null) {
        if (now) {
          node.style.removeProperty(name);
        }
      } else if (now !== value) {
        node.style.setProperty(name, value);
      }
    }
  };
  hold();
  const watch = new MutationObserver(hold);
  watch.observe(node, { attributeFilter: ["style"] });
  return () => watch.disconnect();
}
