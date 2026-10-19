/**
 * The canvas page's `bindingMade` (agent canvas-host/bound.ts) as a scratch fleet's
 * hub bundles it (canvas-host-plugins.ts): it shows the probe what the page
 * bound, as `window.cawcoCanvasProbe` (probe-kit specs/canvas.ts).
 */
import type { Binding } from "../../packages/agent/src/canvas-host/bound";

export const bindingMade = ({ api, live, scene }: Binding): void => {
  (window as unknown as { cawcoCanvasProbe: object }).cawcoCanvasProbe = {
    live,
    scene,
    api,
    elements: () => api.getSceneElements(),
  };
};
