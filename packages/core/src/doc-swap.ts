/**
 * An artifact's doc replaced by one that holds its live content alone, and
 * how a device holding the old one takes the new one.
 *
 * Yjs never drops a deleted item from a doc: its garbage collection
 * (`doc.gc`, on by default) empties a deleted item's content, but the item
 * stays, because the items after it name it as their origin, and
 * `encodeStateAsUpdate` encodes every one. A map key written a thousand
 * times is a thousand items for ever. The one way to shed that history is
 * a new doc built from the live values: Yjs's own forum names it
 * (discuss.yjs.dev/t/945, "Clear document history and reject old updates":
 * a doc made again from its JSON under a new identity, the clients told to
 * move to it, and edits to the old one refused; the maintainers hold that
 * this is the application's to do, not Yjs's). The hub does so
 * ({@link rebuilt}) and keeps a record of what it let go ({@link Retired}).
 *
 * The new doc's identity is the record: a device's copy that holds any
 * client the old doc held is the old doc. The hub reads that off the
 * device's sync step 1 or any update it sends ({@link namesRetired},
 * {@link updateNamesRetired}), keeps none of it, and tells it with
 * {@link MESSAGE_REPLACED}, the record's bytes as its body, then closes its
 * socket with {@link DOC_REPLACED}. The device lets its copy go, takes the
 * hub's doc in a fresh one, and writes onto it, by value, every write of
 * its own the hub never took ({@link carryOver}): offline edits survive a
 * replacement the device slept through.
 */
import {
  createDecoder,
  type Decoder,
  readVarUint,
  readVarUint8Array,
} from "lib0/decoding";
import {
  createEncoder,
  toUint8Array,
  writeVarUint,
  writeVarUint8Array,
} from "lib0/encoding";
import { uint32 } from "lib0/random";
import {
  AbstractType,
  Doc,
  decodeStateVector,
  decodeUpdate,
  encodeStateAsUpdate,
  encodeStateVector,
  findIndexSS,
  getItem,
  type ID,
  Item,
  isDeleted,
  mergeUpdates,
  Array as YArray,
  Map as YMap,
} from "yjs";

/**
 * y-websocket's message type for the hub's word that the doc a socket
 * holds was replaced: its body the hub's {@link Retired} record as one
 * byte array. y-websocket's own types are 0 to 3 (sync, awareness, auth,
 * query awareness); the hub reads none of 4 and up.
 */
export const MESSAGE_REPLACED = 4;

/**
 * The hub's close code for a socket whose doc was replaced, after
 * {@link MESSAGE_REPLACED}: in 4400–4499, so y-websocket opens no new socket
 * with the old doc (its `shouldReconnect`), and a page from before the
 * message was known says its link refused.
 */
export const DOC_REPLACED = 4409;

/** The deletions a doc holds, as Yjs decodes them. */
type DeleteSet = ReturnType<typeof decodeUpdate>["ds"];

/** What the hub let go each time it replaced an artifact's doc. */
export interface Retired {
  /** Every deletion the replaced docs held, to the last clock each held. */
  deletes: DeleteSet;
  /** The client that wrote the current doc's live content (the newest replacement's). */
  founder: number;
  /** Every client the replaced docs held, each to the furthest clock any of them held. */
  vector: Map<number, number>;
}

/** A replacement's record as bytes: what the hub keeps and what {@link MESSAGE_REPLACED} carries. */
const encodeRetired = (
  vector: Map<number, number>,
  deletes: Uint8Array,
  founder: number
): Uint8Array => {
  const encoder = createEncoder();
  writeVarUint8Array(encoder, encodeStateVector(vector));
  writeVarUint8Array(encoder, deletes);
  writeVarUint(encoder, founder);
  return toUint8Array(encoder);
};

/** The parts of a record's bytes, as {@link encodeRetired} wrote them. */
const partsOf = (bytes: Uint8Array) => {
  const decoder = createDecoder(bytes);
  const vector = decodeStateVector(readVarUint8Array(decoder));
  const deletes = readVarUint8Array(decoder);
  const founder = readVarUint(decoder);
  return { vector, deletes, founder };
};

/** A record's bytes read. */
export const readRetired = (bytes: Uint8Array): Retired => {
  const { vector, deletes, founder } = partsOf(bytes);
  return { vector, deletes: decodeUpdate(deletes).ds, founder };
};

/**
 * The record after `old` is replaced by a doc `founder` wrote, kept beside
 * `before`, the record of the replacements before it: every client and
 * deletion `old` held is let go with them.
 */
export const retire = (
  old: Doc,
  founder: number,
  before: Uint8Array | null
): Uint8Array => {
  // An update of no structs past the doc's own state: its delete set alone.
  const deletes = encodeStateAsUpdate(old, encodeStateVector(old));
  const vector = decodeStateVector(encodeStateVector(old));
  if (!before) {
    return encodeRetired(vector, deletes, founder);
  }
  const was = partsOf(before);
  for (const [client, clock] of was.vector) {
    vector.set(client, Math.max(clock, vector.get(client) ?? 0));
  }
  return encodeRetired(vector, mergeUpdates([was.deletes, deletes]), founder);
};

/** The record a {@link MESSAGE_REPLACED} carries, read off its decoder past its type (a y-websocket message handler's). */
export const retiredFrom = (decoder: Decoder): Retired =>
  readRetired(readVarUint8Array(decoder));

/**
 * `doc` given a client of its own that none of the replaced docs held, so
 * nothing it writes reads as the old doc's; call it before it writes.
 */
export const clearOfRetired = (doc: Doc, retired: Retired | null): void => {
  while (retired?.vector.has(doc.clientID)) {
    doc.clientID = uint32();
  }
};

/** {@link MESSAGE_REPLACED} with record `retired` as its body, as the hub sends it. */
export const replacedMessage = (retired: Uint8Array): Uint8Array => {
  const encoder = createEncoder();
  writeVarUint(encoder, MESSAGE_REPLACED);
  writeVarUint8Array(encoder, retired);
  return toUint8Array(encoder);
};

/** Whether state vector `vector` (a sync step 1's) names a client a replaced doc held: the device holds the old doc. */
export const namesRetired = (
  retired: Retired,
  vector: Map<number, number>
): boolean =>
  [...vector].some(
    ([client, clock]) => clock > 0 && retired.vector.has(client)
  );

/** Whether `update` holds a struct or a deletion of a client a replaced doc held. */
export const updateNamesRetired = (
  retired: Retired,
  update: Uint8Array
): boolean => {
  const { structs, ds } = decodeUpdate(update);
  return (
    structs.some((struct) => retired.vector.has(struct.id.client)) ||
    [...ds.clients.keys()].some((client) => retired.vector.has(client))
  );
};

/**
 * Each root of `doc` typed as what it holds: one no code on this side read
 * stands as Yjs's untyped `AbstractType`, and is read here as a map when
 * it holds no list, else a list. Whether every root is a map or a list.
 */
const typeRoots = (doc: Doc): boolean => {
  for (const [name, type] of [...doc.share]) {
    // Yjs keeps a root no one typed as the base class itself.
    if (Object.getPrototypeOf(type) === AbstractType.prototype) {
      if (type._start === null) {
        doc.getMap(name);
      } else if (type._map.size === 0) {
        doc.getArray(name);
      } else {
        return false;
      }
    } else if (!(type instanceof YMap || type instanceof YArray)) {
      return false;
    }
  }
  return true;
};

/** A doc's value read for another doc, a shared type made again as a new one; null for a type an artifact's doc holds none of (text, XML, a subdoc). */
const copyOf = (value: unknown): { value: unknown } | null => {
  if (value instanceof YMap) {
    const map = new YMap<unknown>();
    for (const [key, inner] of value.entries()) {
      const copied = copyOf(inner);
      if (!copied) {
        return null;
      }
      map.set(key, copied.value);
    }
    return { value: map };
  }
  if (value instanceof YArray) {
    const values: unknown[] = [];
    for (const inner of value.toArray()) {
      const copied = copyOf(inner);
      if (!copied) {
        return null;
      }
      values.push(copied.value);
    }
    const list = new YArray<unknown>();
    list.push(values);
    return { value: list };
  }
  if (value instanceof AbstractType || value instanceof Doc) {
    return null;
  }
  return { value };
};

/**
 * A new doc holding `doc`'s live content alone, each root map's entries and
 * each root list's values made again in it as one transaction of its own
 * client; null when `doc` holds a type an artifact's doc never does, so it
 * keeps its history rather than lose what can't be copied.
 */
export const rebuilt = (doc: Doc): Doc | null => {
  if (!typeRoots(doc)) {
    return null;
  }
  const fresh = new Doc();
  let whole = true;
  fresh.transact(() => {
    for (const [name, type] of doc.share) {
      const into =
        type instanceof YMap ? fresh.getMap(name) : fresh.getArray(name);
      if (type instanceof YMap && into instanceof YMap) {
        for (const [key, value] of type.entries()) {
          const copied = copyOf(value);
          whole &&= copied !== null;
          into.set(key, copied?.value);
        }
      } else if (type instanceof YArray && into instanceof YArray) {
        const values = type.toArray().map(copyOf);
        whole &&= values.every((one) => one !== null);
        into.push(values.map((one) => one?.value));
      }
    }
  });
  if (!whole) {
    fresh.destroy();
    return null;
  }
  return fresh;
};

/** The id a root list's value is kept by: a canvas element's (y-excalidraw's `Y.Map` of `el`), none for any other. */
const listIdOf = (value: unknown): string | undefined => {
  const el = value instanceof YMap ? value.get("el") : undefined;
  return typeof el === "object" &&
    el !== null &&
    "id" in el &&
    typeof el.id === "string"
    ? el.id
    : undefined;
};

/** Whether `vector` reaches past `id`: the doc it was read off holds it. */
const reaches = (vector: Map<number, number>, id: ID) =>
  id.clock < (vector.get(id.client) ?? 0);

/** The item `doc` holds at `id`, when it holds one there. */
const itemAt = (doc: Doc, vector: Map<number, number>, id: ID) => {
  if (!reaches(vector, id)) {
    return null;
  }
  const struct = getItem(doc.store, id);
  return struct instanceof Item ? struct : null;
};

/** The root entries a device's writes touched: each root map's keys, each root list's values (their root-level items), by root name. */
interface Touched {
  keys: Map<string, Set<string>>;
  values: Map<string, Set<Item>>;
}

/** Root entry of `item` in `doc` noted in `touched`: the key or value it stands under at the root, when that stands undeleted. */
const touchEntry = (doc: Doc, touched: Touched, item: Item) => {
  let at = item;
  while (at.parent instanceof AbstractType && at.parent._item !== null) {
    at = at.parent._item;
  }
  const root = at.parent;
  // An entry overwritten or deleted since holds nothing of the write now.
  if (at.deleted || !(root instanceof AbstractType)) {
    return;
  }
  const name = [...doc.share].find(([, type]) => type === root)?.[0];
  if (name === undefined) {
    return;
  }
  if (at.parentSub === null) {
    touched.values.set(name, (touched.values.get(name) ?? new Set()).add(at));
  } else {
    touched.keys.set(
      name,
      (touched.keys.get(name) ?? new Set()).add(at.parentSub)
    );
  }
};

/** The root entries of `doc` that hold an item past `known`, each client's clock the hub took to. */
const writtenPast = (doc: Doc, known: Map<number, number>): Touched => {
  const touched: Touched = { keys: new Map(), values: new Map() };
  for (const [client, structs] of doc.store.clients) {
    const from = known.get(client) ?? 0;
    const last = structs.at(-1);
    if (!last || last.id.clock + last.length <= from) {
      continue;
    }
    for (
      let index = from === 0 ? 0 : findIndexSS(structs, from);
      index < structs.length;
      index += 1
    ) {
      const struct = structs[index];
      if (struct instanceof Item) {
        touchEntry(doc, touched, struct);
      }
    }
  }
  return touched;
};

/**
 * The root map keys `stale` deleted that the hub holds undeleted, added to
 * `touched`: the replaced docs' deletions don't name the item, or `fresh`
 * (its state vector `freshVector`) holds it live.
 */
const deletedUnsent = (
  stale: Doc,
  fresh: Doc,
  freshVector: Map<number, number>,
  retired: Retired,
  touched: Touched
) => {
  const unsent = (id: ID): boolean => {
    if (id.clock < (retired.vector.get(id.client) ?? 0)) {
      return !isDeleted(retired.deletes, id);
    }
    if (reaches(freshVector, id)) {
      return !(itemAt(fresh, freshVector, id)?.deleted ?? true);
    }
    return true;
  };
  for (const [name, type] of stale.share) {
    if (!(type instanceof YMap)) {
      continue;
    }
    for (const [key, item] of type._map) {
      if (item.deleted && unsent(item.id)) {
        touched.keys.set(name, (touched.keys.get(name) ?? new Set()).add(key));
      }
    }
  }
};

/**
 * Key `key` of root map `name` written onto `fresh` as `stale` holds it:
 * its value, or its deletion where `fresh`'s value stands as the
 * replacement wrote it (`founder`) or as `stale` saw it (`staleVector`).
 * Whether it wrote.
 */
const carryKey = (
  stale: Doc,
  fresh: Doc,
  name: string,
  key: string,
  seen: { founder: number; staleVector: Map<number, number> }
): boolean => {
  const from = stale.getMap(name);
  const into = fresh.getMap(name);
  if (from.has(key)) {
    const copied = copyOf(from.get(key));
    if (copied) {
      into.set(key, copied.value);
    }
    return copied !== null;
  }
  const now = into._map.get(key);
  if (
    now &&
    !now.deleted &&
    (now.id.client === seen.founder || reaches(seen.staleVector, now.id))
  ) {
    into.delete(key);
    return true;
  }
  return false;
};

/** Root list `name`'s values `item` holds written onto `fresh`, each in place of `fresh`'s of the same id, else at its end. How many it wrote. */
const carryValues = (fresh: Doc, name: string, item: Item): number => {
  const into = fresh.getArray(name);
  let carried = 0;
  for (const value of item.content.getContent()) {
    const copied = copyOf(value);
    if (!copied) {
      continue;
    }
    const id = listIdOf(value);
    const at =
      id === undefined
        ? -1
        : into.toArray().findIndex((one) => listIdOf(one) === id);
    if (at >= 0) {
      into.delete(at, 1);
      into.insert(at, [copied.value]);
    } else {
      into.push([copied.value]);
    }
    carried += 1;
  }
  return carried;
};

/**
 * Every write of `stale`'s that the hub never took, written onto `fresh`
 * by value, as one transaction under `origin`: `stale` is a device's copy
 * of a doc the hub replaced (record `retired`), `fresh` the hub's doc as
 * the device has just synced it. How many entries it wrote.
 *
 * What the hub took is every client's clock to the furthest the replaced
 * docs held or `fresh` holds now; any item of `stale`'s past it is the
 * device's own unsent write. Each such item, nested or not, carries its
 * whole root entry across, when that entry still stands in `stale`: a root
 * map's key, or a root list's value (a canvas element, by its id). A key
 * `stale` deleted is carried as its deletion when the hub holds that item
 * undeleted, and only onto a value that stands as the replacement wrote it
 * or as the device last saw it, so it never deletes what another wrote
 * since. A list value the device deleted is not carried: Yjs has emptied
 * the deleted item, so its id can't be read again.
 */
export const carryOver = (
  stale: Doc,
  fresh: Doc,
  retired: Retired,
  origin: unknown
): number => {
  if (!(typeRoots(stale) && typeRoots(fresh))) {
    return 0;
  }
  const freshVector = decodeStateVector(encodeStateVector(fresh));
  const known = new Map(retired.vector);
  for (const [client, clock] of freshVector) {
    known.set(client, Math.max(clock, known.get(client) ?? 0));
  }
  const touched = writtenPast(stale, known);
  deletedUnsent(stale, fresh, freshVector, retired, touched);
  const seen = {
    founder: retired.founder,
    staleVector: decodeStateVector(encodeStateVector(stale)),
  };
  let carried = 0;
  fresh.transact(() => {
    for (const [name, keys] of touched.keys) {
      for (const key of keys) {
        carried += carryKey(stale, fresh, name, key, seen) ? 1 : 0;
      }
    }
    for (const [name, items] of touched.values) {
      for (const item of items) {
        carried += carryValues(fresh, name, item);
      }
    }
  }, origin);
  return carried;
};
