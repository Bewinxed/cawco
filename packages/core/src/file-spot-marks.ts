/**
 * The marks CawCo's file viewer (file-viewer.ts) puts on its page, which
 * the overlay reads its spots by (file-spot.ts): plain names, no schema, so
 * the viewer's own script carries nothing more.
 */

/**
 * The attribute on each element a mark can stand on in the viewer, naming
 * its kind: `image`, `pdf` (a page, its number in {@link SPOT_PAGE_ATTR}),
 * `text` (a line, its number in {@link SPOT_LINE_ATTR}) or `file`.
 */
export const SPOT_ATTR = "data-cawco-spot";
export const SPOT_PAGE_ATTR = "data-page";
export const SPOT_LINE_ATTR = "data-line";
/** On the viewer's root: the kind of file it shows (`FileSpot["kind"]`). */
export const FILE_VIEWER_ATTR = "data-cawco-file";
/**
 * On the viewer's root while its spots are still being laid out (a PDF's
 * pages before PDF.js has read the document): a mark on it is waiting, not
 * gone. Taken off once they stand, or the file could not be read.
 */
export const FILE_LOADING_ATTR = "data-cawco-file-loading";
