/** How every fit of a graph canvas frames it: the first, a refit, the tool. */
export const FIT = { padding: 0.2, maxZoom: 1 } as const;

/** How far every graph canvas zooms (a project's Canvas, a decision graph, a view). */
export const ZOOM = { minZoom: 0.15, maxZoom: 2 } as const;
