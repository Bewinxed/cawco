import type { RequestEvent } from "@sveltejs/kit";
import { publicOrigin } from "../../../public-origin.js";

/**
 * The dashboard's own origin as `event` reached it: what the gate
 * (hooks.server.ts) holds a request's `Origin` to, and the page origin the
 * `/api` relay tells the hub.
 *
 * A browser's request is the {@link publicOrigin} of its headers. A
 * subrequest (a server load's `fetch` to the dashboard's own routes,
 * SvelteKit's `isSubRequest`) carries none of the browser's headers, its
 * `Host` and a proxy's `X-Forwarded-*` among them: SvelteKit makes it from
 * the load's URL and stamps it with that URL's origin as its `Origin`
 * (kit `fetch.js`: `request.headers.set('origin', event.url.origin)`), and
 * its own URL is resolved against the same one. Its origin is its URL's.
 * Read off its headers it was `http://undefined`, and the gate refused
 * every POST a load made from any address (`/api/instances/titles`).
 */
export const ownOrigin = (
  event: Pick<RequestEvent, "isSubRequest" | "request" | "url">
): string =>
  event.isSubRequest
    ? event.url.origin
    : publicOrigin(Object.fromEntries(event.request.headers)).origin;
