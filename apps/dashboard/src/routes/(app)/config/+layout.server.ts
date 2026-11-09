import { parseCards } from "#lib/cawco/config/cards.js";
import { CONFIG_CARDS_PREF, prefCookie } from "#lib/platform/prefs.js";
import type { LayoutServerLoad } from "./$types";

/**
 * The heights Configure's cards last settled at, so a cold load draws its
 * loading state at the size the page will have (lib/cawco/config/cards).
 */
export const load: LayoutServerLoad = ({ cookies, url }) => ({
  cards: parseCards(cookies.get(prefCookie(CONFIG_CARDS_PREF, url))),
});
