import { CARDS_COOKIE, parseCards } from "#lib/cawco/config/cards.js";
import { prefCookie } from "#lib/cawco/prefs.js";
import type { LayoutServerLoad } from "./$types";

/**
 * The heights Configure's cards last settled at, so a cold load draws its
 * loading state at the size the page will have (lib/cawco/config/cards).
 */
export const load: LayoutServerLoad = ({ cookies, url }) => ({
  cards: parseCards(cookies.get(prefCookie(CARDS_COOKIE, url))),
});
