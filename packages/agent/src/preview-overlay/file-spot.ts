/**
 * The overlay in CawCo's file viewer (core file-viewer.ts): the page a
 * preview answers a frame's load of a PDF, an image, plain text or any
 * other file that is no HTML page with. Its marks stand on the viewer's
 * spots (core file-spot.ts `SPOT_ATTR`: the image, each PDF page, each
 * text line, the file as a whole), never on what is drawn inside one (a
 * PDF's text layer is drawn again as its page scrolls into view), and each
 * anchor carries where in the file it stands (`PageAnchor.file`).
 */
import { type FileSpot, spotElementId } from "@cawco/core/file-spot";
import {
  FILE_LOADING_ATTR,
  FILE_VIEWER_ATTR,
  SPOT_ATTR,
  SPOT_LINE_ATTR,
  SPOT_PAGE_ATTR,
} from "@cawco/core/file-spot-marks";

/** Fractions kept to four places, as a pin's point is (pins.ts `pointOn`). */
const round = (value: number) => Math.round(value * 10_000) / 10_000;
const clamp = (value: number) => round(Math.min(1, Math.max(0, value)));

/** Whether `doc` is CawCo's file viewer. */
export const inViewer = (doc: Document = document): boolean =>
  doc.documentElement.hasAttribute(FILE_VIEWER_ATTR);

/** Whether the viewer's spots are still being laid out (a PDF's pages before PDF.js read it): a mark on one is waiting, not gone. */
export const viewerLoading = (doc: Document = document): boolean =>
  inViewer(doc) && doc.documentElement.hasAttribute(FILE_LOADING_ATTR);

/** The viewer's spot holding `el`, itself or an ancestor; null outside the viewer or any spot. */
export const spotOf = (el: Element | null): Element | null =>
  el && inViewer(el.ownerDocument) ? el.closest(`[${SPOT_ATTR}]`) : null;

/** What a press or a stroke on `el` marks: in the viewer, the spot holding it; anywhere else, `el`. */
export const markable = <E extends Element | null>(el: E): E | Element =>
  spotOf(el) ?? el;

/** The element `spot` stands on in this document now; null when it has none (a line past the file's end). */
export const spotElement = (
  spot: FileSpot,
  doc: Document = document
): Element | null => {
  const el = doc.getElementById(spotElementId(spot));
  return el?.hasAttribute(SPOT_ATTR) ? el : null;
};

/** `point` (fractions of `el`'s box) as fractions of `spot`'s, which holds `el`; its middle when no point is given. */
function pointIn(
  spot: Element,
  el: Element,
  point: { x: number; y: number } | undefined
): { x: number; y: number } {
  const at = point ?? { x: 0.5, y: 0.5 };
  if (el === spot) {
    return { x: clamp(at.x), y: clamp(at.y) };
  }
  const own = el.getBoundingClientRect();
  const box = spot.getBoundingClientRect();
  return {
    x:
      box.width > 0
        ? clamp((own.left + at.x * own.width - box.left) / box.width)
        : 0,
    y:
      box.height > 0
        ? clamp((own.top + at.y * own.height - box.top) / box.height)
        : 0,
  };
}

/** A whole number from 1 read off `el`'s `name`, or null. */
const numberOn = (el: Element, name: string): number | null => {
  const value = Number(el.getAttribute(name));
  return Number.isInteger(value) && value >= 1 ? value : null;
};

/**
 * Where in the file a mark on `el` at `point` (fractions of `el`'s box)
 * stands: a point on the image or on a PDF's page, a text's line, or the
 * file as a whole; null outside the viewer's spots.
 */
export function fileSpotAt(
  el: Element,
  point?: { x: number; y: number }
): FileSpot | null {
  const spot = spotOf(el);
  if (!spot) {
    return null;
  }
  switch (spot.getAttribute(SPOT_ATTR)) {
    case "image":
      return { kind: "image", ...pointIn(spot, el, point) };
    case "pdf": {
      const page = numberOn(spot, SPOT_PAGE_ATTR);
      return page === null
        ? null
        : { kind: "pdf", page, ...pointIn(spot, el, point) };
    }
    case "text": {
      const line = numberOn(spot, SPOT_LINE_ATTR);
      return line === null ? null : { kind: "text", line };
    }
    case "file":
      return { kind: "file" };
    case null:
      return null;
    default:
      return null;
  }
}

/** The text lines `elements` mark, first to last, as one spot (`lines 12–14`); null unless they are two or more of a text's lines. */
export function linesOver(elements: readonly Element[]): FileSpot | null {
  const lines = elements
    .map((el) => spotOf(el))
    .filter((spot) => spot?.getAttribute(SPOT_ATTR) === "text")
    .map((spot) => numberOn(spot as Element, SPOT_LINE_ATTR))
    .filter((n): n is number => n !== null);
  if (lines.length < 2) {
    return null;
  }
  const line = Math.min(...lines);
  const end = Math.max(...lines);
  return line === end ? { kind: "text", line } : { kind: "text", line, end };
}
