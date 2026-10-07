/** How every fit of a workflow graph frames it: the first, a refit, the tool. */
export const FIT = { padding: 0.2, maxZoom: 1 } as const;

/** How far every graph canvas zooms (the workflow editor, a project's Canvas). */
export const ZOOM = { minZoom: 0.15, maxZoom: 2 } as const;
