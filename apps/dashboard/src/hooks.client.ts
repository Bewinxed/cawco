// First, before any module that could make a ResizeObserver: reading
// frame-observer makes the window's own the shared observer's
// (`ForeignResizeObserver`), and an observer made earlier would escape it.
import "#lib/platform/frame-observer.js";
import type { ClientInit, HandleClientError } from "@sveltejs/kit/hooks";
import { reportError, reportErrorsTo } from "#lib/cawco/error-report.js";
import { holdReadsWhileLeaving } from "#lib/cawco/leaving.js";
import { claimRegionDrop } from "#lib/cawco/region-held.js";
import { version } from "$app/env";

export const init: ClientInit = () => {
  holdReadsWhileLeaving();
  reportErrorsTo("dashboard", version);
};

/**
 * Every error SvelteKit catches: a load's, and (SvelteKit 3) every one a
 * `<svelte:boundary>` holds (RegionBoundary), which it hands here before the
 * boundary sees it (kit client.js, `transformError`). Logged whole, as
 * SvelteKit does not in a build, and sent to the hub. A boundary's is
 * answered `region`, so `page.error` never reads as the route failing
 * (region-held.ts), and carries the throw's own words, which the part's
 * face shows under Show details (fault/rebuild `detailsOf`).
 */
export const handleError: HandleClientError = ({ error, event }) => {
  console.error("[cawco]", error);
  reportError(error, { path: event.url.pathname });
  return claimRegionDrop()
    ? { region: true, message: String(error) }
    : undefined;
};
