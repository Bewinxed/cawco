/**
 * Whether the error SvelteKit's client `handleError` is answering was held by
 * a part of the page (a `<svelte:boundary>`) rather than failing the route.
 * SvelteKit 3 hands every error a boundary catches to `handleError` (kit
 * client.js, `transformError`) and then sets `page.error` and `page.status`
 * from its answer, so without a mark one part's error read everywhere as the
 * route failing: the bar's crumb said "Error" over a page that still worked.
 * `handleError` marks its answer `region` (hooks.client.ts) and the route's
 * own error is `page.error` without that mark (Shell's `routeError`).
 *
 * The drop is counted before `handleError` runs. A boundary that catches
 * tears its content down at once (svelte boundary.js `#handle_error`; a
 * branch that throws while it is built is torn down as it throws,
 * effects.js `create_effect`) and calls `transformError` only a microtask
 * later. {@link RegionHeld} sits first inside each boundary, and its
 * teardown counts one drop. A drop no `handleError` claims within the task
 * was an ordinary unmount (a tab closed) and lapses.
 */
let drops = 0;
let lapse: ReturnType<typeof setTimeout> | undefined;

/** A boundary's content was torn down: RegionHeld's teardown. */
export function regionDropped(): void {
  drops += 1;
  clearTimeout(lapse);
  lapse = setTimeout(() => {
    drops = 0;
  });
}

/** Whether the error being handled was a boundary's: claims one drop. */
export function claimRegionDrop(): boolean {
  if (drops === 0) {
    return false;
  }
  drops -= 1;
  return true;
}
