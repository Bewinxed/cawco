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
 *
 * The effective zoom is the product of the computed `zoom` of the element
 * and of every ancestor in its document, which every engine with CSS zoom
 * answers. `Element.currentCSSZoom` gives the same number but is missing
 * from Safari before 26.4 (caniuse.com/mdn-api_element_currentcsszoom:
 * "Safari 3.1–26.3: Not supported"), where it drew every box at NaN.
 */
export function zoomOf(el: Element): number {
  let zoom = 1;
  for (let at: Element | null = el; at; at = at.parentElement) {
    const own = Number.parseFloat(getComputedStyle(at).zoom);
    if (own > 0) {
      zoom *= own;
    }
  }
  return zoom;
}

export function drawnBox(el: Element): DOMRect {
  const rect = el.getBoundingClientRect();
  const zoom = zoomOf(el);
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
  window.innerHeight / zoomOf(el);
