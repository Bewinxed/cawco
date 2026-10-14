/**
 * `yjs` in the canvas's host bundle: the overlay's own Yjs
 * (`window.cawcoArtifact.Y`, preview-overlay/artifact.ts), so the page runs
 * one copy of it and the doc it binds is the doc the overlay syncs, its
 * types the same classes (`instanceof Y.Map` holds across the two bundles;
 * a second copy logs "Yjs was already imported" and breaks those checks).
 * The bundle resolves every `import … from "yjs"` here (core canvas-host.ts
 * `buildCanvasHost`). The overlay's script runs before the host's module:
 * it is a classic script at the head of the page, the module is deferred.
 *
 * Exported: what the host code and y-excalidraw use, the members the
 * overlay hands over (`SHARED_YJS`).
 */
import type { ArtifactGlobal } from "../preview-overlay/artifact";

const { Y } = (window as unknown as { cawcoArtifact: ArtifactGlobal })
  .cawcoArtifact;

export const {
  applyUpdate,
  Array: YArray,
  Doc,
  encodeStateAsUpdate,
  Map: YMap,
  YArrayEvent,
  YEvent,
  YMapEvent,
} = Y;
export { YArray as Array, YMap as Map };
