/** How every fit of a graph canvas frames it: the first, a refit, the tool. */
export const FIT = { padding: 0.2, maxZoom: 1 } as const;

/** How far every graph canvas zooms (a project's Canvas, the whole set, a view). */
export const ZOOM = { minZoom: 0.15, maxZoom: 2 } as const;

/** The house's fit with room kept clear at the top and foot, px (what floats over the canvas there). */
export const fitPadding = (insets: { top: number; bottom: number }) => ({
  x: FIT.padding,
  top: `${insets.top}px` as const,
  bottom: `${insets.bottom}px` as const,
});
