import { CARDS_COOKIE, parseCards } from "$lib/whiffle/config/cards";
import type { LayoutServerLoad } from "./$types";

/**
 * The heights Configure's cards last settled at, so a cold load draws its
 * loading state at the size the page will have (lib/whiffle/config/cards).
 */
export const load: LayoutServerLoad = ({ cookies }) => ({
  cards: parseCards(cookies.get(CARDS_COOKIE)),
});
