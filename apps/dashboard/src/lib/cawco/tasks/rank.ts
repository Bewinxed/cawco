/**
 * Where a card let go at a place of its own in a column stays: the ranks
 * that make the hub list the column in that order (core `byRank`: ranked
 * tasks by rank, then the rest by number). Keys come from
 * fractional-indexing (Figma's and Linear's ordering keys, rocicorp's
 * maintained implementation), which sort as plain strings, as the hub
 * compares them.
 *
 * A ranked task always stands above every unranked one, so a card put
 * below an unranked card takes that card's rank with it: every card above
 * it from the first unranked one down is ranked too, in the order they
 * stand. Nothing below it is written. A column whose ranks are no keys of
 * this order (written by hand in a task file) is ranked whole, top to
 * bottom, as it stands.
 */
import { generateNKeysBetween } from "fractional-indexing";

export interface Ranked {
  id: string;
  rank: string | null;
}

/** One task's new rank. */
export interface RankWrite {
  id: string;
  rank: string;
}

/**
 * The writes that make `column` (every card, in the order it should stand,
 * `moved` at its new place) the hub's order: `moved` and the cards above
 * it that must take a rank for it to stand there.
 */
export function ranksFor(column: Ranked[], moved: string): RankWrite[] {
  const at = column.findIndex((card) => card.id === moved);
  if (at < 0) {
    return [];
  }
  // The cards above it that already stand in rank order, from the top.
  let kept = 0;
  while (kept < at) {
    const rank = column[kept]?.rank ?? null;
    const before = kept > 0 ? (column[kept - 1]?.rank ?? null) : null;
    if (rank === null || (before !== null && !(before < rank))) {
      break;
    }
    kept += 1;
  }
  const low = kept > 0 ? (column[kept - 1]?.rank ?? null) : null;
  const next = column[at + 1]?.rank ?? null;
  const fresh = column.slice(kept, at + 1);
  try {
    if (next !== null && low !== null && !(low < next)) {
      throw new RangeError("the card below stands above the ones over it");
    }
    const keys = generateNKeysBetween(low, next, fresh.length);
    return fresh.map((card, i) => ({ id: card.id, rank: keys[i] as string }));
  } catch {
    // A rank that is no key of this order: the column is ranked whole.
    const keys = generateNKeysBetween(null, null, column.length);
    return column.flatMap((card, i) =>
      card.rank === keys[i] ? [] : [{ id: card.id, rank: keys[i] as string }]
    );
  }
}
