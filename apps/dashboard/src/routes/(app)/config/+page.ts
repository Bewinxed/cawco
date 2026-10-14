import { redirect } from "@sveltejs/kit";
import { NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
import { browser } from "$app/env";
import type { PageLoad } from "./$types";

/**
 * Wide screens open on Rules; a phone gets the rail itself as the page. The
 * browser asks the live query the Shell asks, since the layout's cookie
 * answer is only re-read on a full load and a turned phone outruns it.
 */
export const load: PageLoad = async ({ parent, url }) => {
  const { narrow } = await parent();
  if (!(browser ? matchMedia(NARROW_QUERY).matches : narrow)) {
    // What the link asked for comes along: its query. A load cannot read the
    // fragment (SvelteKit's `disable_hash`); on a full load the browser
    // keeps it across the 307.
    redirect(307, `/config/rules${url.search}`);
  }
};
