import type { ClientInit, HandleClientError } from "@sveltejs/kit/hooks";
// Before anything on the page makes a ResizeObserver: the window's own is
// the shared observer's from here on (frame-observer `ForeignResizeObserver`).
import "#lib/cawco/frame-observer.js";
import { reportError, reportErrorsTo } from "#lib/cawco/error-report.js";
import { holdReadsWhileLeaving } from "#lib/cawco/leaving.js";
import { claimRegionDrop } from "#lib/cawco/region-held.js";
import { version } from "$app/env";

export const init: ClientInit = () => {
  holdReadsWhileLeaving();
  reportErrorsTo("/api/dashboard-errors", version);
};

/**
 * Every error SvelteKit catches: a load's, and (SvelteKit 3) every one a
 * `<svelte:boundary>` holds (RegionBoundary), which it hands here before the
 * boundary sees it (kit client.js, `transformError`). Logged whole, as
 * SvelteKit does not in a build, and sent to the hub. A boundary's is
 * answered `region`, so `page.error` never reads as the route failing
 * (region-held.ts).
 */
export const handleError: HandleClientError = ({ error, event }) => {
  console.error("[cawco]", error);
  reportError(error, { path: event.url.pathname });
  return claimRegionDrop() ? { region: true } : undefined;
};
