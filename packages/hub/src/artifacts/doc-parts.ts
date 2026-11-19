/**
 * An artifact's doc as the hub lays it out (docs.ts loads it, gate.ts
 * checks a person's update to it): its top-level maps, a canvas's one
 * top-level array of elements, and what one transaction wrote, read off
 * the transaction itself (the types it changed, the structs it made) so a
 * change costs what it wrote, not the doc.
 */
import { MIRRORED_MAPS, PIN_MAPS } from "@cawco/core/doc-maps";
import { TUNED_MAP } from "@cawco/core/tuned";
import {
  AbstractType,
  type Doc,
  findIndexSS,
  Item,
  type Transaction,
  type Array as YArray,
  type Map as YMap,
} from "yjs";

/** The doc's top-level maps. */
export const MAPS = [
  // What a page's overlay mirrors: the decision state, meta, ink, moved
  // groups, a pin's parts, deleted pins' tombstones (core comments.ts
  // `goneOf`) and the person's looks at what changed (`seenOf`).
  ...MIRRORED_MAPS,
  "comments",
  "files",
  "requests",
  // Each pin's lines of what changed for it, the hub's alone (core comments.ts `activityOf`).
  "activity",
  // A component's tuned timing, a move each, the panel's to write (core tuned.ts).
  TUNED_MAP,
] as const;

/**
 * The maps Needs you's facts of an artifact are read from (facts.ts
 * `factsOf`): its meta, its choices and a component's tuned timing
 * (`stateOf`), its pins in their parts, and the person's looks at what
 * changed. A change to any other (ink, elements, files, requests) moves
 * none of them.
 */
export const FACT_MAPS: readonly string[] = [
  "meta",
  "state",
  TUNED_MAP,
  ...PIN_MAPS,
  "seen",
];

/** The doc's one top-level array: a canvas's scene, as y-excalidraw lays it out. */
const ELEMENTS = "elements";

/** A canvas's elements: each a `Y.Map` of `el`, `pos`, `by` and `at`. */
export const elementsOf = (doc: Doc): YArray<YMap<unknown>> =>
  doc.getArray<YMap<unknown>>(ELEMENTS);

/** The id of the element a canvas element's map holds; none when it holds none. */
export const elementIdOf = (map: YMap<unknown>): string | undefined => {
  const el = map.get("el");
  return typeof el === "object" &&
    el !== null &&
    "id" in el &&
    typeof el.id === "string"
    ? el.id
    : undefined;
};

/**
 * The values `transaction` inserted into `type` that stand after it: read
 * off the structs it made (each client's clocks from its state before to
 * its state after, as Yjs's own `YEvent.adds` reads them), so a change of
 * one element of a 20,000-element canvas reads that element, where a
 * `YEvent`'s `changes` of an array walk the whole array. Call it while the
 * transaction's observers run (before its cleanup merges the structs).
 */
export function addedTo(transaction: Transaction, type: unknown): unknown[] {
  const added: unknown[] = [];
  for (const [client, after] of transaction.afterState) {
    const before = transaction.beforeState.get(client) ?? 0;
    const structs = transaction.doc.store.clients.get(client);
    if (after <= before || !structs) {
      continue;
    }
    for (
      let at = findIndexSS(structs, before);
      at < structs.length && structs[at].id.clock < after;
      at += 1
    ) {
      const struct = structs[at];
      if (struct instanceof Item && struct.parent === type && !struct.deleted) {
        added.push(...struct.content.getContent());
      }
    }
  }
  return added;
}

/** A changed type of a transaction (`transaction.changed`'s key). */
export type Changed =
  Transaction["changed"] extends Map<infer T, unknown> ? T : never;

/** `type`'s root, and the type right under the root that holds it (none when `type` is a root). */
export const rootOf = (
  type: Changed
): { child: Changed | null; top: Changed } => {
  let top = type;
  let child: Changed | null = null;
  while (top._item !== null) {
    const { parent } = top._item;
    if (!(parent instanceof AbstractType)) {
      break;
    }
    child = top;
    top = parent;
  }
  return { child, top };
};

/** The string keys of `subs` (a map's keys; null is an array's order). */
export const keysIn = (subs: Set<string | null>): string[] =>
  [...subs].filter((sub): sub is string => sub !== null);

/**
 * The keys of the doc's top-level maps `transaction` wrote, by map name
 * (`maps`, each root map by its name): each key it set or removed, or
 * under which a type changed within. Read off `transaction.changed`, what
 * Yjs itself hands each observer, so it costs the types the transaction
 * changed.
 */
export function mapKeysOf(
  transaction: Transaction,
  maps: ReadonlyMap<unknown, string>
): Map<string, Set<string>> {
  const written = new Map<string, Set<string>>();
  for (const [type, subs] of transaction.changed) {
    const { child, top } = rootOf(type);
    const name = maps.get(top);
    if (name === undefined) {
      continue;
    }
    const keys = written.get(name) ?? new Set<string>();
    written.set(name, keys);
    if (child === null) {
      for (const key of keysIn(subs)) {
        keys.add(key);
      }
    } else if (typeof child._item?.parentSub === "string") {
      keys.add(child._item.parentSub);
    }
  }
  return written;
}
