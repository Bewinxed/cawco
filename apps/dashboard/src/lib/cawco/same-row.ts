/**
 * Whether two session rows say the same thing: the same object, or one
 * whose every field is the same.
 *
 * A list that keeps the rows it had while the hub's frames repeat them (the
 * rail's splits, Home's naming rows) hands those kept rows on to everything
 * that reads them, menus and lookups included. So "the same" is every field,
 * never the ones one reader was thought to need: a field left out stays as
 * it was before the change for every reader of the kept row. The rail kept
 * a session's row across a move to another account, and its menu still
 * checked the old one; Home kept a row across a change of project, and a
 * stored transcript's place read the project it had left.
 *
 * Rows are immutable and replaced whole (client.svelte.ts `hubRows`), so a
 * nested value that differs by identity alone is compared by what it holds.
 */
import type { InstanceRow } from "./client.svelte";

/** One field of two rows: the same value, or nested values holding the same. */
const sameField = (a: unknown, b: unknown): boolean =>
  a === b ||
  (typeof a === "object" &&
    typeof b === "object" &&
    a !== null &&
    b !== null &&
    JSON.stringify(a) === JSON.stringify(b));

export function sameRow(a: InstanceRow, b: InstanceRow): boolean {
  if (a === b) {
    return true;
  }
  const keys = Object.keys(a) as (keyof InstanceRow)[];
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => sameField(a[key], b[key]))
  );
}
