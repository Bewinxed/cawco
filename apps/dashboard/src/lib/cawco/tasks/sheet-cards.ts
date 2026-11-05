/**
 * The decision cards a task's sheet names (its waits, its words), as the
 * sheet draws them: each card's chip, and its Pick, go to the card on its
 * page in the project's Decisions (JOURNEY.md, Act on what waits: "a
 * decision page opens in Decisions"), on the first press, the way its
 * "Decided on" line goes; and whether it is picked is the hub's answer for
 * the task's wait, never a doc the dashboard may not hold. Elsewhere (the
 * transcript), a card's chip opens as it always has (reference-open).
 */
import { getContext, setContext } from "svelte";

/** A card as the sheet draws it: where it is picked, and whether it is. */
export interface SheetCard {
  href: string;
  /** The hub's answer for the task's wait on it; null when the task does not wait on it. */
  picked: boolean | null;
}

/** A card by its page's artifact and its id, as the sheet draws it; null where the sheet can't say. */
export type SheetCards = (artifactId: string, card: string) => SheetCard | null;

const KEY = Symbol("sheet-cards");

/** The cards drawn under here go where the sheet says: called by the task's sheet. */
export function setSheetCards(cards: () => SheetCards): void {
  setContext(KEY, cards);
}

/** Read as a component starts; call what it answers for the card, null outside a sheet. */
export function sheetCardsHere(): (
  artifactId: string,
  card: string
) => SheetCard | null {
  const here = getContext<(() => SheetCards) | undefined>(KEY);
  return (artifactId, card) => here?.()(artifactId, card) ?? null;
}
