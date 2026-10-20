/**
 * Boxes as drawn, in the element's own CSS pixels. getBoundingClientRect
 * includes CSS zoom (a pane drawn fitted into a decision page's embed, its
 * canvas zoomed to the card); the lengths styles lay out in, and every
 * offset (`offsetTop`, `clientHeight`, a computed `top`), do not: MDN,
 * Element.currentCSSZoom, "getBoundingClientRect() ... include the effects
 * of CSS zoom ... offset* properties ... do not include the effects of
 * zooming". Read back through the element's effective zoom, a drawn box,
 * and the difference between two of them, is in the pixels a transform, a
 * clip, a height or a custom property is written in. At zoom 1 it is the
 * rect as drawn.
 */
export function drawnBox(el: Element): DOMRect {
  const rect = el.getBoundingClientRect();
  const zoom = el.currentCSSZoom;
  return zoom === 1
    ? rect
    : new DOMRect(
        rect.x / zoom,
        rect.y / zoom,
        rect.width / zoom,
        rect.height / zoom
      );
}

/** The viewport's height in the pixels {@link drawnBox} answers for `el`. */
export const viewHeightAt = (el: Element): number =>
  window.innerHeight / el.currentCSSZoom;
