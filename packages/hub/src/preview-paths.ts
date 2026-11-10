/**
 * The paths the hub keeps for itself on a preview origin, under
 * {@link RESERVED}: a previewed app never sees them.
 */
import { versionedFile } from "@cawco/preview/proxy";

/**
 * A canvas by its id, whichever artifact the panel shows: the composer's
 * canvas stands outside the panel, at `/__cawco/canvas/<id>/` on its
 * session's preview origin, its bundle and fonts under that.
 */
export const CANVAS_PATH = /^\/__cawco\/canvas\/([0-9a-f-]{36})(\/.*)$/u;

/**
 * A page by its id, whichever artifact the panel shows: the project page's
 * Decisions tab opens a decision page in its own pane, at
 * `/__cawco/page/<id>/` on its session's preview origin, beside the doc's
 * socket the page joins there.
 */
export const PAGE_PATH = /^\/__cawco\/page\/([0-9a-f-]{36})(\/.*)$/u;

/**
 * Where a decision page's Preview tells the shape its component canvas
 * said, relative to the page (`shape` beside `/__cawco/page/<id>/`): a POST
 * of the canvas's id, its stories and the shape (preview.ts
 * `PreviewListenerDeps.keepShape`).
 */
export const PAGE_SHAPE_PATH = /^\/__cawco\/page\/([0-9a-f-]{36})\/shape$/u;

/** Everything under it is the hub's own on a preview origin; a previewed app never sees it. */
const RESERVED = "/__cawco/";

/** A path the hub keeps for itself: under {@link RESERVED}, but a page's own file at its folder's key, which goes on to whatever serves the page. */
export const hubsOwn = (pathname: string): boolean =>
  pathname.startsWith(RESERVED) && versionedFile(pathname) === null;
