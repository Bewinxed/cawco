/**
 * A component artifact's view in the panel's head (component canvas §2,
 * "How he watches and steers"): Map, the canvas's component among what
 * renders it and what it renders (CanvasMap), over the design graph while
 * on, kept per session as the mode is; beside it in the same menu, Verify
 * (CanvasView). The stage's own view, its width, scheme and motion, is the
 * design graph's view card. One per pane, read by both of its controls:
 * the head's own button and More's submenu.
 */
import { store, stored } from "#lib/platform/storage.js";

/**
 * Built where a derived builds it (PreviewPane `canvasView`), once per
 * session and kind: its state is read from storage once, where nothing
 * re-runs it, and never read back while it is built.
 */
export class CanvasViewState {
  /** Map mode: the map stands over the design graph, which stays loaded under it. */
  map = $state(false);
  readonly #mapKey: string;

  constructor(instanceId: string) {
    this.#mapKey = `cawco-canvas-map:${instanceId}`;
    this.map = stored("local", this.#mapKey) === "on";
  }

  /** Map mode on or off, kept per session. */
  showMap(on: boolean): void {
    this.map = on;
    store("local", this.#mapKey, on ? "on" : "off");
  }
}
