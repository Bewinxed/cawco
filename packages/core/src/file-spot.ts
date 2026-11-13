/**
 * Where a mark stands in a file that is no HTML page (a PDF, an image,
 * plain text, anything else a preview serves), as a pin's anchor keeps it
 * beside its element (comments.ts `PageAnchor.file`). A preview answers a
 * frame's load of such a file with CawCo's viewer page (file-viewer.ts),
 * which carries the overlay like any page; each place a mark can stand in
 * it is an element marked `SPOT_ATTR` (file-spot-marks.ts): the image, a PDF's page, a
 * text's line, or the file as a whole where it has no viewer. The overlay
 * reads the spot off that element and the point pressed on it, finds the
 * element again by it on a later load, and the hub says it in words
 * ({@link fileSpotWords}).
 *
 * Prior art: Hypothesis anchors a PDF note to its page and text through
 * PDF.js's own layers; GitHub's line comments stand on a line or a range of
 * lines (`#L12-L14`); image tools (Figma, Markup.io) keep a comment as a
 * point in fractions of the image, so it holds at any size.
 *
 * Read from a doc through {@link FileSpotSchema} alone: a stored value is
 * whatever a client wrote.
 */
import { z } from "zod";
import { fileViewerWords as words } from "./words/file-viewer";

/** A point's fraction of its box, 0 to 1. */
const fraction = z.number().min(0).max(1);
const lineNumber = z.number().int().min(1);

/**
 * Where in a file a mark stands: a point on the image (fractions of its
 * box); a point on a PDF's page (from 1, fractions of the page's box); a
 * text's line (from 1), or its lines `line` to `end`; a file with no
 * viewer, as a whole.
 */
export type FileSpot =
  | { kind: "image"; x: number; y: number }
  | { kind: "pdf"; page: number; x: number; y: number }
  | { end?: number; kind: "text"; line: number }
  | { kind: "file" };

/** {@link FileSpot} as a stored value is read: its kind, each number in its range. */
const FileSpotSchema: z.ZodType<FileSpot> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), x: fraction, y: fraction }),
  z.object({
    kind: z.literal("pdf"),
    page: lineNumber,
    x: fraction,
    y: fraction,
  }),
  z.object({
    kind: z.literal("text"),
    line: lineNumber,
    end: lineNumber.optional(),
  }),
  z.object({ kind: z.literal("file") }),
]);

/** `value` as a file spot, or null when it is none (a stored value is any client's). */
export const readFileSpot = (value: unknown): FileSpot | null => {
  const read = FileSpotSchema.safeParse(value);
  return read.success ? read.data : null;
};

/** The id of the element spot `spot` stands on in the viewer: `#L12`, `#page-3`, `#cawco-image`, `#cawco-file`. */
export const spotElementId = (spot: FileSpot): string => {
  switch (spot.kind) {
    case "image":
      return "cawco-image";
    case "pdf":
      return `page-${spot.page}`;
    case "text":
      return `L${spot.line}`;
    case "file":
      return "cawco-file";
    default:
      return spot satisfies never;
  }
};

/** Where in the file `spot` stands, in words: "page 3, near the top left", "lines 12–14". */
function fileSpotWords(spot: FileSpot): string {
  switch (spot.kind) {
    case "image":
      return words.near(words.image, words.region(spot.x, spot.y));
    case "pdf":
      return words.near(words.page(spot.page), words.region(spot.x, spot.y));
    case "text":
      return spot.end !== undefined && spot.end !== spot.line
        ? words.lineRange(spot.line, spot.end)
        : words.line(spot.line);
    case "file":
      return words.wholeFile;
    default:
      return spot satisfies never;
  }
}

/** {@link fileSpotWords} with its point to the percent, for the agent: "page 3, near the top left (18% across, 12% down)". */
export function fileSpotDetail(spot: FileSpot): string {
  const said = fileSpotWords(spot);
  return spot.kind === "image" || spot.kind === "pdf"
    ? `${said} (${words.across(spot.x, spot.y)})`
    : said;
}

/** {@link fileSpotWords} as a pin's title: its first letter a capital. */
export const fileSpotName = (spot: FileSpot): string => {
  const said = fileSpotWords(spot);
  return said.charAt(0).toUpperCase() + said.slice(1);
};
