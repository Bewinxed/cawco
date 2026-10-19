/**
 * A component canvas's view (component canvas §2, "How he watches and
 * steers"): its frames' scheme, their widths, reduced motion, and the zoom,
 * each posted to the canvas page through the overlay (`cawco:canvas-view`),
 * kept per session as the mode is; and Map, the canvas's component among
 * what renders it and what it renders (CanvasMap), over the page while on.
 * One per pane, read by both of its controls (CanvasView): the head's own
 * button and More's submenu.
 */
import { store, stored } from "../storage";

export type CanvasScheme = "page" | "light" | "dark" | "both";
export type CanvasWidth = "own" | "390" | "768" | "1280" | "all";
export interface CanvasChosen {
  motion: "on" | "reduce";
  scheme: CanvasScheme;
  width: CanvasWidth;
}

export const CANVAS_SCHEMES: [CanvasScheme, string][] = [
  ["page", "As the page"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["both", "Light and dark"],
];
export const CANVAS_WIDTHS: [CanvasWidth, string][] = [
  ["own", "Each story's own"],
  ["390", "Phone, 390"],
  ["768", "Tablet, 768"],
  ["1280", "Desk, 1280"],
  ["all", "Every width"],
];

export class CanvasViewState {
  chosen = $state<CanvasChosen>({ scheme: "page", width: "own", motion: "on" });
  /** Map mode: the map stands over the page, which stays loaded under it. */
  map = $state(false);
  readonly #key: string;
  readonly #mapKey: string;
  readonly #post: (message: object) => void;

  /** `post`: to the page, on its own origin (the pane's). */
  constructor(instanceId: string, post: (message: object) => void) {
    this.#key = `cawco-canvas-view:${instanceId}`;
    this.#mapKey = `cawco-canvas-map:${instanceId}`;
    this.#post = post;
    this.map = stored("local", this.#mapKey) === "on";
    const kept = stored("local", this.#key);
    if (kept) {
      try {
        this.chosen = {
          ...this.chosen,
          ...(JSON.parse(kept) as Partial<CanvasChosen>),
        };
      } catch {
        // Unreadable: the canvas's own view.
      }
    }
  }

  /** Map mode on or off, kept per session. */
  showMap(on: boolean): void {
    this.map = on;
    store("local", this.#mapKey, on ? "on" : "off");
  }

  /** The view as the page takes it: every permutation for "every width". */
  send(next: CanvasChosen, zoom?: number | "fit"): void {
    this.chosen = next;
    store("local", this.#key, JSON.stringify(next));
    this.#post({
      type: "cawco:canvas-view",
      view: {
        scheme: next.scheme,
        widths:
          next.width === "own" || next.width === "all"
            ? null
            : [Number(next.width)],
        all: next.width === "all",
        motion: next.motion,
        ...(zoom === undefined ? {} : { zoom }),
      },
    });
  }
}
