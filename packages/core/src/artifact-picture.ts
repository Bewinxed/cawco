/** Drawing an artifact as the person's panel does: its size, its limits and the daemon method. */

/**
 * The size an artifact's picture is drawn at: the dashboard's pane at a
 * desk, so a picture is the page as it is read there. A Files thumbnail
 * (dashboard page-thumbs.ts) and `artifact_read`'s `png` of a preview or a
 * page (agent artifact-picture.ts) both use it; a read may name its own
 * width.
 */
export const PICTURE_VIEW = { width: 640, height: 800 } as const;

/**
 * The daemon's control method that draws a preview or a page as the
 * person's panel does (agent artifact-picture.ts), in the hub machine's
 * Chromium on the artifact's own preview origin, overlay and all. Takes
 * `{ url, width, artifact: { id, kind, name }, sync }` and answers
 * `{ png }`, base64.
 */
export const ARTIFACT_PICTURE = "artifactPicture";

/**
 * What scrolls a decision page (dashboard decisions host Decisions.svelte): the
 * page is the window's height, so its length is this element's, and a picture
 * opens the window to it (agent artifact-picture.ts).
 */
export const PICTURE_PAGE_SCROLLER = '[data-slot="page-scroll"]';

/** How an artifact's picture is bounded ({@link ARTIFACT_PICTURE}). */
export const PICTURE_LIMITS = {
  /** Widths a read may name, in CSS px: a phone's to a wide desk's. */
  minWidth: 320,
  maxWidth: 2560,
  /** The tallest picture, in CSS px: a page longer than this is drawn from its top. Our call: three panes' worth. */
  maxHeight: 2400,
  /**
   * The page's load, through its preview origin: a sleeping server is woken
   * by it and waited on first (agent preview.ts `staged`, within core
   * `STAGE_READY_MS`, 60 s), then the page loads and is waited on until
   * it is ready: one bound for both. Our call.
   */
  loadMs: 75_000,
  /**
   * How long a page stands ready before its picture: content painted and
   * nothing of its own in flight, since its last paint, its last request
   * and the hello that places its pins (agent artifact-picture.ts
   * `watchReadiness`), within `loadMs`, as Files waits on a page.
   */
  settleMs: 1000,
  /** The picture itself, once the page settled. Our call. */
  shotMs: 15_000,
  /** How long the hub waits for the daemon's answer, launch to picture: the load, the settle and the picture, with room for the launch. Our call. */
  askMs: 100_000,
} as const;
