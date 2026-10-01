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
 */
import type { Attachment } from "svelte/attachments";
import { SvelteSet } from "svelte/reactivity";

const SETTLE_MS = 2000;
const GAP_MS = 5000;

interface Held {
  /** When a reorder last landed. */
  committed: number;
  /** The newest computed order not yet shown, and since when it has stood. */
  pending: string;
  shown: string[];
  since: number;
  timer?: ReturnType<typeof setTimeout>;
}

const lists = new Map<string, Held>();
/** Bumped when a held reorder falls due, so the lists reading it re-run. */
let due = $state(0);
/** Scopes the pointer or focus is inside: their lists keep their order. */
const inside = new SvelteSet<string>();

const blocked = (key: string): boolean => {
  for (const scope of inside) {
    if (key.startsWith(scope)) {
      return true;
    }
  }
  return false;
};

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
  // Reads `due` and the scopes, so a list re-derives when a held reorder
  // falls due or the pointer leaves it.
  const stop = due >= 0 && blocked(key);
  const computed = rows.map(id);
  const at = Date.now();
  const list = lists.get(key);
  if (!list) {
    lists.set(key, {
      shown: computed,
      pending: "",
      since: at,
      committed: 0,
    });
    return rows;
  }
  const present = new Set(computed);
  const held = withArrivals(
    list.shown.filter((row) => present.has(row)),
    computed
  );
  const target = computed.join("\n");
  if (held.join("\n") === target) {
    list.shown = computed;
    list.pending = "";
    clearTimeout(list.timer);
    return rows;
  }
  if (list.pending !== target) {
    list.pending = target;
    list.since = at;
  }
  const ready = Math.max(list.since + SETTLE_MS, list.committed + GAP_MS);
  clearTimeout(list.timer);
  if (!stop && at >= ready) {
    list.shown = computed;
    list.pending = "";
    list.committed = at;
    return rows;
  }
  if (!stop) {
    list.timer = setTimeout(() => {
      due += 1;
    }, ready - at);
  }
  list.shown = held;
  const byId = new Map(rows.map((row) => [id(row), row]));
  return held.map((row) => byId.get(row) as T);
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
      if (pointer || focus) {
        inside.add(scope);
      } else {
        inside.delete(scope);
      }
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
      inside.delete(scope);
    };
  };
}
