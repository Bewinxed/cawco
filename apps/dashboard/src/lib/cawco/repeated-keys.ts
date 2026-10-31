/**
 * A keyed list that holds one key twice says so to the hub's error log
 * (error-report.ts) before Svelte throws on it. In a build, Svelte's
 * `each_key_duplicate` names neither the list nor the key, so the region
 * stopped with nothing to trace (the owner, 10-31: the transcript stopped
 * as a comment's popover closed). The report names the list, the key, both
 * rows that hold it, and what moved the page last ({@link noteChange}),
 * once per list and key in a tab. It only reports: the list stays as it
 * is, and the throw that follows is the boundary's to hold.
 */
import { browser } from "$app/env";
import { reportError } from "./error-report";

/** What moved the page last, by what it was, and when (`performance.now()`). */
const changes = new Map<string, number>();

/**
 * Something that can change what a keyed list holds happened now: a
 * popover closed, the transcript scrolled, the stream brought a batch. The
 * report says each, newest first, with how long before it they were.
 */
export function noteChange(what: string): void {
  // The server's render reports nothing, and keeps nothing across requests.
  if (!browser) {
    return;
  }
  changes.delete(what);
  changes.set(what, performance.now());
}

/** The changes noted, newest first: "comment popover closed 412ms before, …". */
function changesSaid(now: number): string {
  const said = [...changes]
    .reverse()
    .map(([what, at]) => `${what} ${Math.round(now - at)}ms before`);
  return said.length > 0 ? said.join(", ") : "nothing noted";
}

/** A key a list holds twice, and the two items holding it, in order. */
export interface Repeat<T> {
  first: T;
  key: string;
  second: T;
}

/**
 * The first key `items` holds twice, from `from` on, where `known` holds
 * the keys of the items before `from` (read once by the caller); null when
 * each key is held once.
 */
export function repeatedKey<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  from = 0,
  known: ReadonlySet<string> = new Set()
): Repeat<T> | null {
  const held = new Map<string, T>();
  for (let i = from; i < items.length; i += 1) {
    const second = items[i] as T;
    const key = keyOf(second);
    const first =
      held.get(key) ??
      (known.has(key)
        ? items.slice(0, from).find((item) => keyOf(item) === key)
        : undefined);
    if (first !== undefined) {
      return { first, key, second };
    }
    held.set(key, second);
  }
  return null;
}

/** The lists and keys already reported by this tab. */
const reported = new Set<string>();

/**
 * `repeat` in list `list` goes to the hub's error log and the console, once
 * per list and key in this tab; `said` names one item (its kind and ids).
 */
export function reportRepeat<T>(
  list: string,
  repeat: Repeat<T>,
  said: (item: T) => string
): void {
  // The server's render says it in its own log each time, keeping nothing.
  const at = JSON.stringify([list, repeat.key]);
  if (browser) {
    if (reported.has(at)) {
      return;
    }
    reported.add(at);
  }
  const error = new Error(
    `The ${list} holds the key ${JSON.stringify(repeat.key)} twice: ${said(repeat.first)}, then ${said(repeat.second)}. Last changes: ${changesSaid(performance.now())}.`
  );
  console.error("[cawco]", error);
  reportError(error, { about: "Repeated key" });
}

/**
 * `items`, as they are, once their keys were checked ({@link repeatedKey},
 * {@link reportRepeat}): for a list read whole each time it changes.
 */
export function keysChecked<T>(
  list: string,
  items: T[],
  keyOf: (item: T) => string,
  said: (item: T) => string
): T[] {
  const repeat = repeatedKey(items, keyOf);
  if (repeat) {
    reportRepeat(list, repeat, said);
  }
  return items;
}
