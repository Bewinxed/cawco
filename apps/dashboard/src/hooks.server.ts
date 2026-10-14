import { crossSiteRefusal } from "@cawco/core/browser-gate";
import type { Handle } from "@sveltejs/kit/hooks";
import { RESTING_TAB_ICON } from "#lib/cawco/tab-icon/tab-icon.svelte.js";

/**
 * Every request the dashboard's server answers:
 *
 * - **The gate** (core `browser-gate.ts`): a page of another origin, a
 *   previewed app on its own port of this host above all, never reaches
 *   `/api` (and through it the hub) or any other route with the browser's
 *   cookies; a top-level navigation from elsewhere still opens a page.
 * - **Isolation**: `Origin-Agent-Cluster` keeps this origin in its own agent
 *   cluster, apart from a preview on the same site; `frame-ancestors 'self'`
 *   lets no other origin frame the dashboard.
 * - app.html's icon link gets the resting tab icon's hashed URL, on every page
 *   the server sends: one rendered here and the shell of a route with SSR off
 *   alike.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const refused = crossSiteRefusal(
    event.request.method,
    (name) => event.request.headers.get(name),
    event.url.origin
  );
  if (refused) {
    console.warn(
      `[cawco] refused ${refused} to ${event.request.method} ${event.url.pathname}`
    );
    return new Response(
      "The dashboard answers its own pages only: this request came from another page.",
      { status: 403 }
    );
  }
  const resolved = await resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace("%cawco.tab-icon%", RESTING_TAB_ICON),
  });
  // A response passed through from the hub (`/api`) may hold its headers
  // fixed: it goes on as a copy that takes them.
  let response = resolved;
  try {
    response.headers.set("origin-agent-cluster", "?1");
  } catch {
    response = new Response(resolved.body, resolved);
    response.headers.set("origin-agent-cluster", "?1");
  }
  response.headers.set("content-security-policy", "frame-ancestors 'self'");
  return response;
};
