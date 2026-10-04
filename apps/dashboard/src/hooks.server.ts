import type { Handle } from "@sveltejs/kit/hooks";
import { RESTING_TAB_ICON } from "#lib/cawco/tab-icon/tab-icon.svelte.js";

/**
 * app.html's icon link gets the resting tab icon's hashed URL, on every page
 * the server sends: one rendered here and the shell of a route with SSR off
 * alike.
 */
export const handle: Handle = ({ event, resolve }) =>
  resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace("%cawco.tab-icon%", RESTING_TAB_ICON),
  });
