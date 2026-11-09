import { crossSiteRefusal } from "@cawco/core/browser-gate";
import { compressAnswer } from "@cawco/core/compress-answer";
import { gateWords } from "@cawco/core/words/gate";
import type { Handle } from "@sveltejs/kit/hooks";
import { ownOrigin } from "#lib/cawco/own-origin.js";
import { RESTING_TAB_ICON } from "#lib/cawco/tab-icon/tab-icon.svelte.js";

/**
 * Every request the dashboard's server answers:
 *
 * - **The gate** (core `browser-gate.ts`): a page of another origin, a
 *   previewed app on its own port of this host above all, never reaches
 *   `/api` (and through it the hub) or any other route with the browser's
 *   cookies; a top-level navigation from elsewhere still opens a page. The
 *   dashboard's own origin is `ownOrigin` (lib/cawco/own-origin.ts): a
 *   browser's request's `publicOrigin` (public-origin.js), the one
 *   derivation serve.js and the vite servers' `/ws` relays read, under
 *   `vite dev` and `vite preview` too, where `event.url` knows the Host
 *   alone; a server load's own `fetch` (a subrequest, which carries none of
 *   the browser's headers), its URL's.
 * - **Isolation**: `Origin-Agent-Cluster` keeps this origin in its own agent
 *   cluster, apart from a preview on the same site; `frame-ancestors 'self'`
 *   lets no other origin frame the dashboard.
 * - app.html's icon link gets the resting tab icon's hashed URL, on every page
 *   the server sends: one rendered here and the shell of a route with SSR off
 *   alike.
 * - Scripts and styles are preloaded, as by default, the scripts at low
 *   priority (`fetchpriority="low"`, "allows the browser to increase or
 *   decrease the priority, and potentially load the image earlier or later
 *   than it would otherwise", MDN): over HTTP/2 every preload streams at once
 *   and shares a slow link with the stylesheets the first paint waits on,
 *   and the hub's relay (Bun) sends whatever is asked as it comes. At low
 *   priority Chromium holds the scripts' requests until the head's
 *   stylesheets are in: on a 10 Mbit link its first paint came 1008 → 532 ms,
 *   the page usable 2.76 → 3.19 s; WebKit's stood as they were. Moving the
 *   stylesheets ahead of the preloads in the head changed nothing measurable.
 *   No font is preloaded: the faces
 *   the first paint sets its text in, Nunito's among them, are inlined in the
 *   stylesheet (vite.config.ts `houseFaces`), so it is laid out in them and
 *   not in a fallback; laid out in Nunito's fallback, every tab stood at
 *   another width than the one its shape was measured at
 *   (fluid-tabs/fold-memory.ts).
 * - **Compression** (core compress-answer.ts): every answer this server
 *   renders or relays (pages, their data, remote functions, `/api`) goes
 *   compressed to a browser that accepts it, once, here; the client's built
 *   files are already, as adapter-node precompresses them. A server load's
 *   own `fetch` reads its answer as it is.
 */
/** Kit's modulepreload tag in the head (kit render.js `add_link_tag`), and the same at low priority. */
const MODULE_PRELOAD = '" rel="modulepreload">';
const LOW_PRELOAD = '" rel="modulepreload" fetchpriority="low">';

export const handle: Handle = async ({ event, resolve }) => {
  const refused = crossSiteRefusal(
    event.request.method,
    (name) => event.request.headers.get(name),
    ownOrigin(event)
  );
  if (refused) {
    console.warn(
      gateWords.refused(refused, event.request.method, event.url.pathname)
    );
    return new Response(gateWords.answer, { status: 403 });
  }
  const resolved = await resolve(event, {
    preload: (input) => input.type === "js" || input.type === "css",
    transformPageChunk: ({ html }) =>
      html
        .replace("%cawco.tab-icon%", RESTING_TAB_ICON)
        .replaceAll(MODULE_PRELOAD, LOW_PRELOAD),
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
  // A policy that restricts images keeps `data:` allowed: the read gate asks
  // the browser whether the page is going by loading a data image
  // (lib/cawco/leaving.ts, `loadsRefused`), and a refused ask holds the read.
  response.headers.set("content-security-policy", "frame-ancestors 'self'");
  return event.isSubRequest
    ? response
    : await compressAnswer(event.request, response);
};
