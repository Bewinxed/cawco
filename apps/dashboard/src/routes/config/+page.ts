import { redirect } from "@sveltejs/kit";
import { browser } from "$app/env";
import { NARROW_QUERY } from "#lib/hooks/is-mobile.svelte.js";
import type { PageLoad } from "./$types";

/**
 * Wide screens open on Rules; a phone gets the rail itself as the page. The
 * browser asks the live query the Shell asks, since the layout's cookie
 * answer is only re-read on a full load and a turned phone outruns it.
 */
export const load: PageLoad = async ({ parent }) => {
  const { narrow } = await parent();
  if (!(browser ? matchMedia(NARROW_QUERY).matches : narrow)) {
    redirect(307, "/config/rules");
  }
};
