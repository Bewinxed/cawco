/**
 * An artifact's doc as the comment helpers (comments.ts) and a page's
 * overlay read it: its top-level maps, each of plain values (a pin, an ink
 * group, a choice entry), and a transaction round a batch of writes. A Yjs
 * `Doc` is one, on the hub, in the dashboard and in the overlay's doc
 * worker; so is the overlay's mirror of that worker's doc on the page
 * (agent preview-overlay mirror.ts), which loads no Yjs into the page.
 */

import { PIN_MAPS } from "./comments";

/** What a map's watcher hears of one transaction: the keys it changed, and whether this view made it. */
export interface MapChange {
  keysChanged: Set<string>;
  transaction: { local: boolean; origin: unknown };
}

/** One top-level map of a doc, its values plain data: a Yjs `Map` is one. */
export interface DocMap<T> {
  delete: (key: string) => void;
  entries: () => IterableIterator<[string, T]>;
  get: (key: string) => T | undefined;
  has: (key: string) => boolean;
  keys: () => IterableIterator<string>;
  observe: (watcher: (change: MapChange) => void) => void;
  set: (key: string, value: T) => unknown;
  readonly size: number;
  // biome-ignore lint/suspicious/noExplicitAny: Yjs's own `toJSON` answers `{ [x: string]: any }`
  toJSON: () => Record<string, any>;
  unobserve: (watcher: (change: MapChange) => void) => void;
  values: () => IterableIterator<T>;
}

/** A doc of top-level maps, and a transaction round a batch of writes. */
export interface MapDoc {
  getMap: <T = unknown>(name: string) => DocMap<T>;
  transact: (writes: () => void, origin?: unknown) => void;
}

/**
 * The maps a page's overlay reads and writes, kept on the page by its
 * mirror: the decision state and the doc's meta, the ink, its moved groups,
 * the pins in their parts (comments.ts `PIN_MAPS`), their tombstones, and
 * the person's looks at what changed.
 */
export const MIRRORED_MAPS = [
  "state",
  "meta",
  "ink",
  "moved",
  ...PIN_MAPS,
  "gone",
  "seen",
] as const;

export type MirroredMap = (typeof MIRRORED_MAPS)[number];

/** Each mirrored map of `doc`, as plain data: what a page's mirror opens on. */
export function mapsOf(
  doc: MapDoc
): Record<MirroredMap, Record<string, unknown>> {
  return Object.fromEntries(
    MIRRORED_MAPS.map((name) => [name, doc.getMap(name).toJSON()])
  ) as Record<MirroredMap, Record<string, unknown>>;
}
