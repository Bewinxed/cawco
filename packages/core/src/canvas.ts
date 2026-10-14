/**
 * A canvas artifact (Projects spec §5.10, D24–D25): its doc's `elements` is
 * an Excalidraw scene as y-excalidraw lays it out, a `Y.Array` of `Y.Map`s
 * `{ el, pos }` (the element, its fractional order), each carrying beside
 * them who last wrote it (`by`) and when (`at`). The agent reads the scene
 * as an {@link canvasOutline}, and writes skeleton elements or Mermaid that
 * a screen showing the canvas converts (the hub cannot: conversion measures
 * text and renders Mermaid's SVG in a DOM). Pure: the hub and the canvas's
 * host page both use it.
 */

/** Who last wrote an element: the person on a screen, or the agent through a tool. */
export type CanvasAuthor = "person" | "agent";

/** An element as the outline reads it: Excalidraw's own fields, those it needs. */
export interface CanvasElement {
  boundElements?: readonly { id: string; type: string }[] | null;
  containerId?: string | null;
  /** Ours on Excalidraw's element: `shape` names what a held stroke was read as when Excalidraw has no type for it (a triangle). */
  customData?: Record<string, unknown> | null;
  endBinding?: { elementId: string } | null;
  groupIds?: readonly string[];
  height: number;
  id: string;
  isDeleted?: boolean;
  points?: readonly (readonly [number, number])[];
  startBinding?: { elementId: string } | null;
  text?: string;
  type: string;
  width: number;
  x: number;
  y: number;
}

/** One entry of the doc's `elements`, as its `Y.Map` reads. */
export interface CanvasEntry {
  at?: string;
  by?: CanvasAuthor;
  el: CanvasElement;
  pos: string;
}

/** A request the agent's tool leaves for a screen to convert (the doc's `requests`). */
export type CanvasRequestKind = "elements" | "mermaid";

/** What a screen writes on a request it converted. */
export type CanvasRequestResult = { ids: string[] } | { error: string };

/** Our bounds on a canvas, each the brief's number or our own call where marked. */
export const CANVAS_LIMITS = {
  /** Skeleton elements one `artifact_update` or create may write. */
  elementsPerCall: 500,
  /** Ids one `artifact_update` may delete. */
  deletePerCall: 500,
  /** Characters of Mermaid one call may send. */
  mermaid: 20_000,
  /** How long the tool waits for a screen to convert. */
  convertMs: 10_000,
  /** Pixels in a canvas's picture. */
  picturePixels: 16_000_000,
  /** The picture's scale at most. */
  pictureScale: 2,
  /** Elements a canvas keeps. Our call. */
  elements: 20_000,
  /** Image files a canvas keeps. Our call. */
  files: 200,
  /** Bytes of one image file's data URL. Our call. */
  fileBytes: 8 * 1024 * 1024,
  /** Bytes of one image a screen adds: Excalidraw's own ceiling (its `MAX_ALLOWED_FILE_BYTES`). */
  imageBytes: 4 * 1024 * 1024,
  /** Bytes of one picture. Our call. */
  pictureBytes: 32 * 1024 * 1024,
} as const;

/** The images a screen adds to a canvas (pasted, dropped or picked), by MIME type, with the name a refusal lists. */
export const CANVAS_IMAGE_TYPES: Readonly<Record<string, string>> = {
  "image/png": "PNG",
  "image/jpeg": "JPEG",
  "image/webp": "WebP",
  "image/svg+xml": "SVG",
  "image/gif": "GIF",
};

/** The skeleton element types an agent may write (Excalidraw's `convertToExcalidrawElements`). */
export const SKELETON_TYPES = [
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "line",
  "text",
  "frame",
] as const;

/** The refusal when no screen can convert (WORDS.md's error formula). */
export const NO_SCREEN =
  "No screen is showing this canvas. Open it on a dashboard (artifact_show), then try again.";

/** An element's box in scene coordinates, from its points when it has them. */
export const boxOf = (
  element: CanvasElement
): { x: number; y: number; width: number; height: number } => {
  const { points } = element;
  if (!points || points.length === 0) {
    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    };
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [px, py] of points) {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  return {
    x: element.x + minX,
    y: element.y + minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const round = (n: number) => Math.round(n);

const boxText = (box: ReturnType<typeof boxOf>) =>
  `${round(box.x)},${round(box.y)} ${round(box.width)}×${round(box.height)}`;

const overlaps = (
  a: ReturnType<typeof boxOf>,
  b: ReturnType<typeof boxOf>
): boolean =>
  a.x <= b.x + b.width &&
  b.x <= a.x + a.width &&
  a.y <= b.y + b.height &&
  b.y <= a.y + a.height;

const quoted = (text: string) => JSON.stringify(text);

/** An arrow's outline line: its label, its two ends, and its place when an end is free. */
const arrowLine = (
  element: CanvasElement,
  label: string | null,
  box: ReturnType<typeof boxOf>
): string => {
  const free = !(element.startBinding && element.endBinding);
  return `arrow ${element.id}${label === null ? "" : ` ${quoted(label)}`}: ${element.startBinding?.elementId ?? "free"} → ${element.endBinding?.elementId ?? "free"}${free ? ` at ${boxText(box)}` : ""}`;
};

/**
 * The canvas as the agent reads it: one line per element that is not
 * deleted, in scene order.
 *
 * - `<id> <type> "<text>" at x,y w×h`, the text its own or its bound
 *   label's (a label is read on its container, not on a line of its own);
 *   a held stroke read as a triangle (a closed line) reads `triangle`;
 * - `arrow <id> "<label>": <startId> → <endId>` (`free` for an end bound to
 *   nothing), and `at x,y w×h` after it when an end is free, since its
 *   place is then its own;
 * - `ink <id>: N points, x,y w×h, over <ids>`, a freedraw with the ids
 *   whose boxes it crosses (`over nothing` when none);
 * - `image <id> at x,y w×h`, an image the person pasted, dropped or picked
 *   (its file in the doc's `files`);
 * - then `group <id>: <ids>` for every group.
 */
export const canvasOutline = (elements: readonly CanvasElement[]): string => {
  const live = elements.filter((element) => !element.isDeleted);
  const byId = new Map(live.map((element) => [element.id, element]));
  const labelOf = (element: CanvasElement): string | null => {
    const bound = element.boundElements?.find((one) => one.type === "text");
    const label = bound ? byId.get(bound.id)?.text : undefined;
    return label ?? null;
  };
  const shown = live.filter(
    (element) =>
      !(
        element.type === "text" &&
        element.containerId &&
        byId.has(element.containerId)
      )
  );
  const lines = shown.map((element) => {
    const box = boxOf(element);
    if (element.type === "arrow") {
      return arrowLine(element, labelOf(element), box);
    }
    if (element.type === "freedraw") {
      const over = shown
        .filter(
          (other) =>
            other.id !== element.id &&
            other.type !== "freedraw" &&
            overlaps(box, boxOf(other))
        )
        .map((other) => other.id);
      return `ink ${element.id}: ${element.points?.length ?? 0} points, ${boxText(box)}, over ${over.length > 0 ? over.join(", ") : "nothing"}`;
    }
    if (element.type === "image") {
      return `image ${element.id} at ${boxText(box)}`;
    }
    const text =
      element.type === "text" ? (element.text ?? "") : labelOf(element);
    const shape = element.customData?.shape;
    const type = typeof shape === "string" ? shape : element.type;
    return `${element.id} ${type}${text === null ? "" : ` ${quoted(text)}`} at ${boxText(box)}`;
  });
  const groups = new Map<string, string[]>();
  for (const element of shown) {
    for (const group of element.groupIds ?? []) {
      groups.set(group, [...(groups.get(group) ?? []), element.id]);
    }
  }
  for (const [group, ids] of groups) {
    lines.push(`group ${group}: ${ids.join(", ")}`);
  }
  return lines.join("\n");
};

/** The `.excalidraw` document of a scene: the canvas's truth, as a file. */
export const excalidrawFile = (
  elements: readonly CanvasElement[],
  files: Record<string, unknown>
) => ({
  type: "excalidraw" as const,
  version: 2 as const,
  source: "cawco",
  elements,
  appState: {},
  files,
});
