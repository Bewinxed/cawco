/**
 * Plugins the canvas host's bundle is built with beside its own
 * (canvas-host.ts `buildCanvasHost`): none in the product. A scratch fleet's
 * hub runs the probe kit's list in this module's place
 * (scripts/scratch-fleet-stand-ins.ts), which bundles its listener in place of
 * the page's `bindingMade` (agent canvas-host/bound.ts).
 */
export const HOST_PLUGINS: Bun.BunPlugin[] = [];
