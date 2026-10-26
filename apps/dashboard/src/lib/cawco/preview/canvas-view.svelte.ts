/**
 * A component canvas's view (component canvas §2, "How he watches and
 * steers"): its frames' scheme, their widths, reduced motion, and the zoom,
 * each posted to the canvas page through the overlay (`cawco:canvas-view`),
 * kept per session as the mode is; and Map, the canvas's component among
 * what renders it and what it renders (CanvasMap), over the page while on.
 * One per pane, read by both of its controls (CanvasView): the head's own
 * button and More's submenu.
 */
import { PREVIEW_SCHEMES, type PreviewScheme } from "@cawco/core/comments";
import { CanvasChosenShape } from "#lib/cawco/stored-shapes.js";
import { store, stored } from "../storage";

export type CanvasWidth = "own" | "390" | "768" | "1280" | "all";
export interface CanvasChosen {
  motion: "on" | "reduce";
  scheme: PreviewScheme;
  width: CanvasWidth;
}

const SCHEME_LABELS: Record<PreviewScheme, string> = {
  page: "As the page",
  light: "Light",
  dark: "Dark",
  both: "Light and dark",
};
export const CANVAS_SCHEMES: [PreviewScheme, string][] = PREVIEW_SCHEMES.map(
  (scheme) => [scheme, SCHEME_LABELS[scheme]]
);
export const CANVAS_WIDTHS: [CanvasWidth, string][] = [
  ["own", "Each story's own"],
  ["390", "Phone, 390"],
  ["768", "Tablet, 768"],
  ["1280", "Desk, 1280"],
  ["all", "Every width"],
];

/** A canvas's own view, before anyone chose another. */
const OWN_VIEW: CanvasChosen = { scheme: "page", width: "own", motion: "on" };

/** The view kept for a session under `key`, over the canvas's own; its own when none is kept or it doesn't read. */
function keptView(key: string): CanvasChosen {
  const kept = stored("local", key);
  if (!kept) {
    return { ...OWN_VIEW };
  }
  try {
    return {
      ...OWN_VIEW,
      ...CanvasChosenShape.partial().catch({}).parse(JSON.parse(kept)),
    };
  } catch {
    return { ...OWN_VIEW };
  }
}

/**
 * Built where a derived builds it (PreviewPane `canvasView`), once per
 * session and kind: its view is set from storage and never read back while
 * it is built. Nightly 4202's CanvasView read the kept view in an effect
 * that spread `chosen` and wrote it again (`chosen = { ...chosen, ...kept }`),
 * so with a view kept for the session it re-ran itself until Svelte stopped
 * the side panel (`effect_update_depth_exceeded`, the owner's "i selected
 * plan view"); this class reads it once, where nothing re-runs it.
 */
export class CanvasViewState {
  chosen = $state<CanvasChosen>({ ...OWN_VIEW });
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
    this.chosen = keptView(this.#key);
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
