/**
 * The owner's own starters, as the hub wrote them for his live projects
 * (starters.tsv: project, place, position, glyph, text, reason), and the
 * sets the preview's Data group draws from them. Nothing here is made up:
 * every sentence and reason is one of his, word for word.
 *
 * - three: Cawco's board, its first three, in the hub's order;
 * - one: one of his, the routine that failed;
 * - seven: Cawco's board's first four and three of Cawco-Dev's board;
 * - longest: the longest he has, three at the hub's 90-character cap.
 */
import tsv from "./starters.tsv?raw";

const [head, ...lines] = tsv.trim().split("\n");
const keys = head.split("\t");
/** Every starter of his, each a row of the file. */
export const STARTERS = lines.map((line) => {
  const cells = line.split("\t");
  return Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""]));
});

/** One starter of his, by its project, place and position. */
const of = (project, place, position) => {
  const row = STARTERS.find(
    (each) =>
      each.project === project &&
      each.place === place &&
      each.position === String(position)
  );
  if (!row) {
    throw new Error(`no starter ${project} ${place} ${position}`);
  }
  return { glyph: row.glyph, text: row.text, reason: row.reason };
};

export const THREE = [0, 1, 2].map((i) => of("Cawco", "board", i));
export const ONE = [of("Cawco", "board", 1)];
export const SEVEN = [
  ...[0, 1, 2, 3].map((i) => of("Cawco", "board", i)),
  ...[0, 1, 3].map((i) => of("Cawco-Dev", "board", i)),
];
export const LONGEST = [
  of("Cawco", "board", 5),
  of("Cawco-Dev", "board", 1),
  of("Cawco-Dev", "board", 2),
];
/** A set with its reasons left out. */
export const bare = (set) => set.map(({ glyph, text }) => ({ glyph, text }));
