/**
 * What CawCo's file viewer says (core file-viewer.ts): the page a preview
 * answers a frame's load of a file that is no HTML page with (a PDF, an
 * image, plain text, anything else), and where a pin stands in such a file
 * (core file-spot.ts), as a pin's title and as `comment_read` and a
 * delivery say it. The probe kit finds them by these same words.
 */

/** A reason's own full stop, which the line that quotes it puts back. */
const FINAL_STOP = /\.$/u;
/** Rows of a vertical third, top to bottom. */
const ROWS = ["top", "middle", "bottom"] as const;
/** Columns of a horizontal third, left to right. */
const COLUMNS = ["left", "centre", "right"] as const;

export const fileViewerWords = {
  /** A mark's section, as a delivery and `comment_read` say it: where in the file it stands, before its words. */
  inFile: "In the file",
  /** The viewer's foot link to the file's own bytes. */
  download: "Download",
  /** What a file with no viewer is, by its type: under its name. */
  noViewer: (type: string) =>
    `CawCo can't draw a ${type} file here. Download it to open it, or comment on the file as a whole.`,
  /** A PDF that PDF.js couldn't read: what happened, why, the way on. */
  pdfUnread: (why: string) =>
    `This PDF couldn't be drawn: ${why.replace(FINAL_STOP, "")}. Download it to open it in a reader.`,
  /** A text file past the most the viewer draws: how much it shows. */
  textCut: (shown: number) =>
    `Showing the first ${shown.toLocaleString("en")} lines. Download the file for the rest.`,
  /** A PDF's page, as a screen reader names it. */
  pageLabel: (page: number, pages: number) => `Page ${page} of ${pages}`,
  /** A PDF still being read, said where its pages will stand. */
  pdfReading: "Reading the PDF…",
  /** A PDF's pages, said under its name. */
  pages: (count: number) => (count === 1 ? "1 page" : `${count} pages`),
  /** Text's lines, said under its name. */
  lines: (count: number) =>
    count === 1 ? "1 line" : `${count.toLocaleString("en")} lines`,
  /** Where in a page or picture a point stands, by thirds: "the top left", "the centre". */
  region: (x: number, y: number): string => {
    const third = (at: number) => Math.min(2, Math.max(0, Math.floor(at * 3)));
    const row = ROWS[third(y)];
    const column = COLUMNS[third(x)];
    if (row === "middle" && column === "centre") {
      return "the centre";
    }
    if (row === "middle") {
      return `the ${column}`;
    }
    return column === "centre" ? `the ${row}` : `the ${row} ${column}`;
  },
  /** A point in fractions, said as percentages across and down. */
  across: (x: number, y: number) =>
    `${Math.round(x * 100)}% across, ${Math.round(y * 100)}% down`,
  page: (page: number) => `page ${page}`,
  line: (line: number) => `line ${line}`,
  lineRange: (start: number, end: number) => `lines ${start}–${end}`,
  image: "the image",
  wholeFile: "the file as a whole",
  near: (where: string, region: string) => `${where}, near ${region}`,
};
