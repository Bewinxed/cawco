/**
 * A live list's order, held still. Lists sorted by recency or state re-sort
 * on every pulse: two agents trading turns swapped places every turn, and a
 * row jumped out from under the pointer. The rule here: a row never moves
 * because of ongoing activity.
 *
 * - Rows that arrive or leave do so at once, at their computed slot.
 * - A reorder of rows already shown is held until the new order has stood
 *   for SETTLE_MS, and at most once every GAP_MS.
 * - Never while the pointer or focus is inside the list (`holdWhileInside`);
 *   it commits when they leave.
 *
 * A committed reorder is a plain re-render of a keyed `{#each}`, so the
 * list's `reflow()` slides each row to its new slot (motion/rows); with less
 * motion they snap. One mechanism, no `animate:` beside it.
 *
 * Each list is its own (7433e2b3, mechanism 7): its reorder falling due
 * wakes that list alone, and while its order is the one it showed it hands
 * back the very array it handed back before, so what reads it does nothing
 * ("If the new value of a derived is referentially identical to its
 * previous value, downstream updates will be skipped",
 * svelte.dev/docs/svelte/$derived). One count for every list re-ran every
 * held list on each one's timer, each joining its two thousand ids.
 */
import type { Attachment } from "svelte/attachments";
import { unlessSame } from "../board.svelte";

const SETTLE_MS = 2000;
const GAP_MS = 5000;

interface Held {
  /** When a reorder last landed. */
  committed: number;
  /** What the list handed back last: handed back again while it holds the same rows. */
  out: unknown[];
  /** The newest computed order not yet shown, and since when it has stood. */
  pending: string[] | null;
  shown: string[];
  since: number;
  timer?: ReturnType<typeof setTimeout>;
}

const lists = new Map<string, Held>();
/**
 * Each list's count, by its key, bumped when its held reorder falls due: a
 * key of a `$state` object is a signal of its own, so the list reading it
 * re-runs, and no other.
 */
const dues: Record<string, number> = $state({});
/**
 * Scopes the pointer or focus is inside: their lists keep their order. A
 * scope is never taken out, only turned off, so the scopes are walked by
 * their names and a list reads only the scopes it is in.
 */
const inside: Record<string, boolean> = $state({});

const blocked = (key: string): boolean => {
  for (const scope of Object.keys(inside)) {
    if (key.startsWith(scope) && inside[scope]) {
      return true;
    }
  }
  return false;
};

/** Two orders of the same ids. */
const sameOrder = (a: readonly string[] | null, b: readonly string[]) =>
  a !== null && a.length === b.length && a.every((id, i) => id === b[i]);

/** `next`, or what the list handed back last while it holds the same rows in the same order. */
function handBack<T>(list: Held, next: T[]): T[] {
  list.out = unlessSame(list.out, next);
  return list.out as T[];
}

/** Stops the list's timer, if one is waiting. */
function stopTimer(list: Held): void {
  if (list.timer !== undefined) {
    clearTimeout(list.timer);
    list.timer = undefined;
  }
}

/**
 * Where a row that just arrived goes in the held order: after the row that
 * precedes it in the computed order, else first.
 */
function withArrivals(kept: string[], computed: string[]): string[] {
  const out = [...kept];
  const present = new Set(kept);
  computed.forEach((id, at) => {
    if (present.has(id)) {
      return;
    }
    let slot = 0;
    for (let back = at - 1; back >= 0; back -= 1) {
      const before = out.indexOf(computed[back] as string);
      if (before !== -1) {
        slot = before + 1;
        break;
      }
    }
    out.splice(slot, 0, id);
    present.add(id);
  });
  return out;
}

/**
 * `rows` in the order on screen for the list `key`: the computed order once
 * it has settled, else the held one with arrivals and departures applied.
 * Call it where the list is derived; it tracks what it needs.
 */
export function heldOrder<T>(
  key: string,
  rows: T[],
  id: (row: T) => string
): T[] {
  const computed = rows.map(id);
  const at = Date.now();
  const list = lists.get(key);
  if (!list) {
    lists.set(key, {
      shown: computed,
      pending: null,
      since: at,
      committed: 0,
      out: rows,
    });
    return rows;
  }
  const present = new Set(computed);
  const held = withArrivals(
    list.shown.filter((row) => present.has(row)),
    computed
  );
  if (sameOrder(held, computed)) {
    list.shown = computed;
    list.pending = null;
    stopTimer(list);
    return handBack(list, rows);
  }
  // A reorder waits: only now does the list read its own count and the
  // scopes it is in, so it re-derives when that reorder falls due or the
  // pointer leaves it. A list at rest reads neither, and a pointer crossing
  // the rail or the home re-derives none of them.
  const stop = (dues[key] ?? 0) >= 0 && blocked(key);
  if (!sameOrder(list.pending, computed)) {
    list.pending = computed;
    list.since = at;
  }
  const ready = Math.max(list.since + SETTLE_MS, list.committed + GAP_MS);
  if (stop || at >= ready) {
    stopTimer(list);
  }
  if (!stop && at >= ready) {
    list.shown = computed;
    list.pending = null;
    list.committed = at;
    return handBack(list, rows);
  }
  // One timer at a time: the moment a reorder falls due only moves later
  // (a newer order waits its own settle), so a timer set for an earlier
  // moment wakes the list, which sets the next. A list asked again before
  // it falls due (a pulse moving a row's time) set its timer anew each time.
  if (!stop && list.timer === undefined) {
    list.timer = setTimeout(() => {
      list.timer = undefined;
      dues[key] = (dues[key] ?? 0) + 1;
    }, ready - at);
  }
  list.shown = held;
  const byId = new Map(rows.map((row) => [id(row), row]));
  return handBack(
    list,
    held.map((row) => byId.get(row) as T)
  );
}

/**
 * Holds every list whose key starts with `scope` while the pointer or focus
 * is inside the element; leaving lets a waiting reorder land.
 */
export function holdWhileInside(scope: string): Attachment<HTMLElement> {
  return (node) => {
    let pointer = false;
    let focus = false;
    const sync = () => {
      inside[scope] = pointer || focus;
    };
    const enter = () => {
      pointer = true;
      sync();
    };
    const leave = () => {
      pointer = false;
      sync();
    };
    const focusIn = () => {
      focus = true;
      sync();
    };
    const focusOut = (event: FocusEvent) => {
      focus = node.contains(event.relatedTarget as Node | null);
      sync();
    };
    node.addEventListener("pointerenter", enter);
    node.addEventListener("pointerleave", leave);
    node.addEventListener("focusin", focusIn);
    node.addEventListener("focusout", focusOut);
    return () => {
      node.removeEventListener("pointerenter", enter);
      node.removeEventListener("pointerleave", leave);
      node.removeEventListener("focusin", focusIn);
      node.removeEventListener("focusout", focusOut);
      inside[scope] = false;
    };
  };
}
