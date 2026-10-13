/// <reference lib="dom" />

/**
 * A pen stroke held still at its end becomes the shape it was drawn as
 * (Projects spec §5.10, slice 5a): a pen that stays within {@link HOLD_PX}
 * for `--dur-press-hold` before it lifts has its freedraw replaced by the
 * shape core shapes.ts reads in it, on the stroke's own box, in one step of
 * the canvas's history and one transaction of its doc. A stroke lifted
 * without the hold, or one that is no shape well enough, stays as drawn.
 *
 * The swap crossfades on one clock (DESIGN.md: one shared clock, opacity
 * only): a Web Animation `shape-swap` of `--dur-fade` on `--ease-out` is the
 * clock, and each frame reads its progress into the freedraw's ghost (the
 * stroke drawn on, fading out) and the shape (fading up to its own
 * opacity). Neither is written: the doc holds the shape at its own opacity
 * from the swap on, and never the ghost ({@link SwapView}). Reduced motion
 * swaps at once.
 */
import { recognise } from "@cawco/core/shapes";
import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElementSkeleton } from "@excalidraw/excalidraw/data/transform";
import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/** How far a held pen may wander and still be held, px: the brief's number. */
export const HOLD_PX = 4;

/** The clock's name, which the probe finds it by. */
const CLOCK = "shape-swap";

/** A token's value as written (`--ease-out` is a `cubic-bezier(…)`). */
const tokenValue = (token: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(token).trim();

/** A token's duration in ms (`--dur-fade` is 200ms). */
export const tokenMs = (token: string): number =>
  Number.parseFloat(tokenValue(token)) || 0;

/**
 * What the doc sees of a scene mid-swap: no ghost, and every fading shape
 * at its own opacity. The binding reads the scene through it, so a frame of
 * the fade never reaches the doc, whatever renders when.
 */
export interface SwapView {
  /** Shapes fading up, by id: their own opacity. */
  fading: Map<string, number>;
  /** Ghosts of replaced strokes, drawn here only. */
  ghosts: Set<string>;
}

export const swapView = (): SwapView => ({
  fading: new Map(),
  ghosts: new Set(),
});

/** The scene as the doc should hear it. */
export const seenByDoc = (
  view: SwapView,
  elements: readonly OrderedExcalidrawElement[]
): readonly OrderedExcalidrawElement[] => {
  if (view.ghosts.size === 0 && view.fading.size === 0) {
    return elements;
  }
  return elements
    .filter((el) => !view.ghosts.has(el.id))
    .map((el) => {
      const own = view.fading.get(el.id);
      return own === undefined || el.opacity === own
        ? el
        : { ...el, opacity: own };
    });
};

type Point = [number, number];

const nonce = () => Math.floor(Math.random() * 2 ** 31);

/** The skeleton of what `stroke` was drawn as, in scene coordinates; null when it is no shape. */
const shapeOf = (
  stroke: ExcalidrawFreeDrawElement
): { skeleton: ExcalidrawElementSkeleton; points: Point[] | null } | null => {
  const found = recognise(stroke.points.map(([px, py]) => [px, py] as Point));
  if (!found) {
    return null;
  }
  const look = {
    strokeColor: stroke.strokeColor,
    backgroundColor: "transparent",
    strokeWidth: stroke.strokeWidth,
    strokeStyle: "solid" as const,
    roughness: 0,
    opacity: stroke.opacity,
    frameId: stroke.frameId,
  };
  const x = stroke.x + found.box.x;
  const y = stroke.y + found.box.y;
  if (found.type === "rectangle" || found.type === "ellipse") {
    return {
      skeleton: {
        type: found.type,
        x,
        y,
        width: found.box.width,
        height: found.box.height,
        ...look,
      },
      points: null,
    };
  }
  // A line or an arrow runs from the stroke's first point to its last; a
  // triangle is a line closed on its first corner (0.18.1 has no polygon).
  const corners = found.points ?? [];
  const [origin] = corners;
  const local: Point[] = [
    ...corners,
    ...(found.type === "triangle" ? [origin] : []),
  ].map(([px, py]) => [px - origin[0], py - origin[1]]);
  const xs = local.map(([px]) => px);
  const ys = local.map(([, py]) => py);
  return {
    skeleton: {
      type: found.type === "arrow" ? "arrow" : "line",
      x: stroke.x + origin[0],
      y: stroke.y + origin[1],
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      points: local,
      ...(found.type === "triangle"
        ? { customData: { shape: "triangle" } }
        : {}),
      ...look,
    } as ExcalidrawElementSkeleton,
    points: local,
  };
};

/**
 * Replaces the held `stroke` with its shape, when it is one: one step of
 * Excalidraw's history (undo brings the stroke back), one transaction of
 * the doc (the binding writes the stroke's removal and the shape's arrival
 * together). Answers whether it did.
 */
export const snapToShape = (
  api: ExcalidrawImperativeAPI,
  stroke: ExcalidrawFreeDrawElement,
  view: SwapView,
  reduced: boolean
): boolean => {
  const found = shapeOf(stroke);
  if (!found) {
    return false;
  }
  const [converted] = convertToExcalidrawElements([found.skeleton]);
  // The conversion insets an arrow's ends and redraws a 0-wide line 100px:
  // the shape keeps the points it was read with.
  const shape: OrderedExcalidrawElement = found.points
    ? ({ ...converted, points: found.points } as OrderedExcalidrawElement)
    : converted;
  const all = api.getSceneElementsIncludingDeleted();
  const replaced = all.flatMap((el): ExcalidrawElement[] =>
    el.id === stroke.id
      ? [
          {
            ...el,
            isDeleted: true,
            version: el.version + 1,
            versionNonce: nonce(),
          },
          shape,
        ]
      : [el]
  );
  if (reduced) {
    api.updateScene({
      elements: replaced,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    return true;
  }
  // The fade begins once Excalidraw has taken the swap into its history (its
  // store commits before onChange): what the fade draws is never undone.
  const stop = api.onChange(() => {
    stop();
    crossfade(api, stroke, shape, view);
  });
  api.updateScene({
    elements: replaced,
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return true;
};

/** The stroke's ghost fading out and the shape fading up, both read from one clock each frame. */
const crossfade = (
  api: ExcalidrawImperativeAPI,
  stroke: ExcalidrawFreeDrawElement,
  shape: OrderedExcalidrawElement,
  view: SwapView
) => {
  const ghost: ExcalidrawElement = {
    ...stroke,
    id: `${stroke.id}~${CLOCK}`,
    isDeleted: false,
  };
  const own = shape.opacity;
  view.ghosts.add(ghost.id);
  view.fading.set(shape.id, own);
  const host =
    document.querySelector(".excalidraw") ?? document.documentElement;
  const clock = host.animate([], {
    duration: tokenMs("--dur-fade"),
    easing: tokenValue("--ease-out") || "linear",
    fill: "both",
  });
  clock.id = CLOCK;
  const draw = (progress: number) => {
    const elements: ExcalidrawElement[] = api
      .getSceneElementsIncludingDeleted()
      .filter((el) => el.id !== ghost.id)
      .map((el) =>
        el.id === shape.id ? { ...el, opacity: own * progress } : el
      );
    if (progress < 1) {
      const at = elements.findIndex((el) => el.id === shape.id);
      elements.splice(at < 0 ? elements.length : at, 0, {
        ...ghost,
        opacity: stroke.opacity * (1 - progress),
      });
    }
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
  };
  const frame = () => {
    const progress = clock.effect?.getComputedTiming().progress ?? 1;
    if (clock.playState === "finished" || progress === null) {
      view.ghosts.delete(ghost.id);
      view.fading.delete(shape.id);
      draw(1);
      clock.cancel();
      return;
    }
    draw(progress);
    requestAnimationFrame(frame);
  };
  draw(0);
  requestAnimationFrame(frame);
};
