/**
 * Caw's artboard and how a frame of it is drawn: shared by the page's Caw
 * (Caw.svelte) and the tab icon's tiles (scripts/tab-icon-tile.ts), which
 * bundles this module into its page, so it imports Rive's types only.
 */
import type { RuntimeLoader } from "@rive-app/canvas";

/** Rive's low-level runtime, as the dashboard's own package loads it. */
export type RiveRuntime = Awaited<
  ReturnType<typeof RuntimeLoader.awaitInstance>
>;
type RiveRenderer = ReturnType<RiveRuntime["makeRenderer"]>;
type RiveArtboard = ReturnType<
  Awaited<ReturnType<RiveRuntime["load"]>>["artboardByName"]
>;
/** Where the artboard lands on the canvas, in the canvas's pixels. */
export type ArtboardFrame = Parameters<RiveRenderer["align"]>[2];

/** The files' 592 px artboard and the 512 px still box in it, at (43, 40). */
export const ARTBOARD = 592;
export const BOX = { x: 43, y: 40, side: 512 } as const;

/** Draws the artboard's current state into `frame` of the renderer's canvas. */
export function drawArtboard(
  rive: RiveRuntime,
  renderer: RiveRenderer,
  artboard: RiveArtboard,
  frame: ArtboardFrame
): void {
  renderer.clear();
  renderer.save();
  renderer.align(
    rive.Fit.contain,
    rive.Alignment.center,
    frame,
    artboard.bounds
  );
  artboard.draw(renderer);
  renderer.restore();
  renderer.flush();
}
