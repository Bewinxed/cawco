import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { Doc } from "yjs";

/** What the page binds: the overlay's doc, the scene's, and Excalidraw. */
export interface Binding {
  api: ExcalidrawImperativeAPI;
  live: Doc;
  scene: Doc;
}

/**
 * Told what the page bound (scene.ts `bindScene`), once it is bound: nothing listens in the
 * product.
 */
export const bindingMade = (_binding: Binding): void => undefined;
