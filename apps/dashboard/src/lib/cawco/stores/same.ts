/**
 * How a store keeps what it holds when a read or a frame says the same
 * again: a value equal to the one held stays the object held, so nothing that
 * reads it wakes.
 */
import { unlessSame } from "#lib/platform/unless-same.js";

/**
 * A derived list that hands back the array it handed back before while it
 * holds the same rows in the same order (board.svelte.ts `unlessSame`), so what
 * reads it is not woken by a row that moved outside it.
 */
export function keepsLast<T>(list: () => T[]): () => T[] {
  let was: T[] | undefined;
  return () => {
    was = unlessSame(was, list());
    return was;
  };
}

/** Whether two plain values say the same thing, field for field. */
export function equal(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (!(a && b && typeof a === "object" && typeof b === "object")) {
    return false;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return (
    ak.length === bk.length &&
    ak.every((key) =>
      equal(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
  );
}

/** A snapshot keeps unchanged rows and, when nothing moved, the list itself. */
export function reconcileRows<T>(
  current: T[],
  incoming: T[],
  key: (row: T) => string
): T[] {
  const known = new Map(current.map((row) => [key(row), row]));
  const next = incoming.map((row) => {
    const held = known.get(key(row));
    return held && equal(held, row) ? held : row;
  });
  return current.length === next.length &&
    current.every((row, i) => row === next[i])
    ? current
    : next;
}

/** A delta keeps all absent rows; an empty or identical patch is a no-op. */
export function patchRows<T>(
  current: T[],
  upserts: T[],
  removed: string[],
  key: (row: T) => string
): T[] {
  if (upserts.length === 0 && removed.length === 0) {
    return current;
  }
  const gone = new Set(removed);
  const next = current.filter((row) => !gone.has(key(row)));
  const at = new Map(next.map((row, i) => [key(row), i]));
  for (const row of upserts) {
    const i = at.get(key(row));
    if (i === undefined) {
      at.set(key(row), next.length);
      next.push(row);
    } else if (!equal(next[i], row)) {
      next[i] = row;
    }
  }
  return current.length === next.length &&
    current.every((row, i) => row === next[i])
    ? current
    : next;
}
