/**
 * The check of a person's update to an artifact's doc before the doc takes
 * it (sync.ts `takeUpdate`): the bounds sync.ts names, each read against
 * what the update wrote alone, so an update costs the hub its own size,
 * not the doc's.
 *
 * How Yjs users check an update before they keep it. Yjs has no way to
 * refuse an update once a doc took it (its threat model: an untrusted
 * write never reaches the original doc, THREAT_MODEL.md §3.1). The
 * community's answer is a trial doc: the doc's state copied, the update
 * applied to the copy, its changes observed, and the original written only
 * if they pass ("That's the best approach that I can think of",
 * discuss.yjs.dev/t/2229); kept per writer beside the master copy, an
 * illegal change is caught "before propagating it to the master copy"
 * (discuss.yjs.dev/t/3725). The other two ways fail a rule here: undoing a
 * bad update with an UndoManager is "inefficient" and lets a peer slip an
 * update past it (dmonad, discuss.yjs.dev/t/2765), and `Y.decodeUpdate`
 * hands back structs whose parent and key an item that follows another
 * does not carry and whose deletes name ids alone, so reading what it
 * changes means integrating it by hand ("getting into YJS internals",
 * /t/2229). The copy made fresh from the whole doc for every update is
 * what cost obelisk 16 of 21.5 s on one update (2026-11-19). So the copy
 * is made once and kept in step: every update the doc takes, it takes
 * after it ({@link Gate.follow}); a person's update goes to the copy first,
 * and what that one transaction changed (`transaction.changed`, each map's
 * own keys, the structs it made) is all that is read; the doc takes it only
 * if it passes. A refusal leaves the copy holding what the doc never took,
 * so the copy goes with it, made again from the doc at the next update.
 *
 * What a rule reads of the rest of the doc it reads off a ledger the copy
 * keeps current with every transaction: each map's size, each standing
 * pin's thread bytes and its entries' keys, and which entries hold each
 * canvas element. A part the update left stood within the bounds already
 * (this check let it in, or the hub wrote it), so it is not read again.
 */
import { CANVAS_LIMITS } from "@cawco/core/canvas";
import {
  CHOICE_LIMITS,
  type ChoiceEntry,
  choiceEntryProblem,
  isChoiceEntry,
  settledWriteProblem,
} from "@cawco/core/choices";
import {
  entryPin,
  goneOf,
  type Pin,
  readPinAt,
  type ThreadEntry,
  threadBytesOf,
} from "@cawco/core/comments/model";
import {
  goneProblem,
  heldNoteProblem,
  type PinsChange,
  pinsProblem,
  seenProblem,
} from "@cawco/core/comments/validate";
import { MIRRORED_MAPS, PIN_MAPS } from "@cawco/core/doc-maps";
import {
  type ClientMetaKey,
  docMeta,
  getMeta,
  metaWriter,
} from "@cawco/core/doc-meta";
import { inkProblem } from "@cawco/core/ink";
import { TUNED_MAP, tunedProblem } from "@cawco/core/tuned";
import {
  AbstractType,
  applyUpdate,
  ContentType,
  Doc,
  encodeStateAsUpdate,
  getItem,
  getState,
  type ID,
  Item,
  type Transaction,
  Map as YMap,
} from "yjs";
import {
  addedTo,
  type Changed,
  elementIdOf,
  elementsOf,
  keysIn,
  MAPS,
  rootOf,
} from "./doc-parts";

/** A doc's top-level map, by name. */
type MapName = (typeof MAPS)[number];

/** What one update did to the copy, as the rules read it. */
interface Moved {
  /** Values inserted into a canvas's elements. */
  added: unknown[];
  /** Entries of a canvas's elements that stood before and changed within. */
  changed: Set<YMap<unknown>>;
  /** By root map: each key it touched, set, replaced or removed or its value (a type) changed within. */
  keys: Map<string, Set<string>>;
  /** Elements' own order moved: an entry inserted or removed. */
  reordered: boolean;
  /** By root map: the keys it set whole over a value that stood (its own event's `update`). */
  replaced: Map<string, Set<string>>;
  /** By root map: how many keys it added, less those it removed (its own event's `add` and `delete`). */
  sized: Map<string, number>;
  /** By root map and key: a type under it changed within, at its own keys, or `deep` below them. */
  within: Map<string, Map<string, Set<string> | "deep">>;
}

const NONE: ReadonlySet<string> = new Set();

const setIn = <K, V>(map: Map<K, Set<V>>, key: K): Set<V> => {
  const held = map.get(key);
  if (held) {
    return held;
  }
  const made = new Set<V>();
  map.set(key, made);
  return made;
};

const mapIn = <K, K2, V>(map: Map<K, Map<K2, V>>, key: K): Map<K2, V> => {
  const held = map.get(key);
  if (held) {
    return held;
  }
  const made = new Map<K2, V>();
  map.set(key, made);
  return made;
};

/** The copy's root types, by the name each stands under: the doc's maps and its elements. */
interface Roots {
  elements: unknown;
  maps: Map<unknown, string>;
}

/**
 * A change of map `name`, at `type` (`subs`, its keys): its own keys, or
 * under `child`, its key under the map, at its own keys or below them.
 */
const hearMap = (
  into: Moved,
  name: string,
  {
    child,
    type,
    subs,
  }: { child: Changed | null; subs: Set<string | null>; type: Changed }
): void => {
  const keys = setIn(into.keys, name);
  if (child === null) {
    for (const key of keysIn(subs)) {
      keys.add(key);
    }
    return;
  }
  const key = child._item?.parentSub;
  if (key === null || key === undefined) {
    return;
  }
  keys.add(key);
  const within = mapIn(into.within, name);
  const held = within.get(key);
  if (child !== type) {
    within.set(key, "deep");
  } else if (held !== "deep") {
    within.set(key, new Set([...(held ?? []), ...keysIn(subs)]));
  }
};

/** Map `name`'s own event's keys: those set whole over a value, and how many it added less those it removed. */
const hearKeys = (
  into: Moved,
  name: string,
  keys: Map<string, { action: "add" | "update" | "delete" }>
) => {
  for (const [key, { action }] of keys) {
    if (action === "update") {
      setIn(into.replaced, name).add(key);
    } else {
      into.sized.set(
        name,
        (into.sized.get(name) ?? 0) + (action === "add" ? 1 : -1)
      );
    }
  }
};

/** Each root map's own event ({@link hearKeys}). */
const hearSizes = (transaction: Transaction, roots: Roots, into: Moved) => {
  for (const [type, events] of transaction.changedParentTypes) {
    const name = roots.maps.get(type);
    if (name === undefined) {
      continue;
    }
    for (const event of events) {
      if (event.target === type) {
        hearKeys(into, name, event.keys);
      }
    }
  }
};

/** What `transaction` changed, heard while its observers run, added to `into`. */
const hear = (transaction: Transaction, roots: Roots, into: Moved): void => {
  let reordered = false;
  for (const [type, subs] of transaction.changed) {
    const { child, top } = rootOf(type);
    if (top !== roots.elements) {
      // A root the doc's layout doesn't name is no map a rule reads.
      const name = roots.maps.get(top);
      if (name !== undefined) {
        hearMap(into, name, { child, type, subs });
      }
    } else if (child === null) {
      reordered ||= subs.has(null);
    } else if (child instanceof YMap && !child._item?.deleted) {
      into.changed.add(child);
    }
  }
  hearSizes(transaction, roots, into);
  if (reordered) {
    into.reordered = true;
    into.added.push(...addedTo(transaction, roots.elements));
  }
};

/** The pins a change touched: each key of a pin's part or tombstone it wrote. */
const pinsTouched = (moved: Moved): Set<string> => {
  const pins = new Set<string>();
  for (const name of [...PIN_MAPS, "gone"]) {
    for (const key of moved.keys.get(name) ?? NONE) {
      pins.add(name === "entries" ? entryPin(key) : key);
    }
  }
  return pins;
};

/** The canvas element entry item `id` names in `doc`, standing; none when it doesn't. */
const entryIn = (doc: Doc, id: ID): YMap<unknown> | undefined => {
  if (id.clock >= getState(doc.store, id.client)) {
    return;
  }
  const struct: unknown = getItem(doc.store, id);
  return struct instanceof Item &&
    !struct.deleted &&
    struct.parent === elementsOf(doc) &&
    struct.content instanceof ContentType &&
    struct.content.type instanceof YMap
    ? struct.content.type
    : undefined;
};

/**
 * What the rules read of the copy beyond what a change wrote, kept current
 * as the copy takes each transaction ({@link Ledger.keep}): each map's size,
 * each standing pin's thread bytes, each pin's entries' keys, and the
 * entries that held each element id.
 */
interface Ledger {
  /** What the copy took is kept: the ledger stands at the copy's state again. */
  keep: (moved: Moved) => void;
  /** The made of every entry of `before` (the doc, before the change) that holds element `id`. */
  madeBefore: (before: Doc, id: string) => unknown[];
  /** The change's pins as core `pinsProblem` reads them: what it wrote, what stands after it, what it touched. */
  pinsChange: (before: Doc, moved: Moved) => PinsChange;
  /** The size of map `name` after `moved`. */
  sizeAfter: (name: MapName, moved: Moved) => number;
}

const createLedger = (copy: Doc): Ledger => {
  const sizes = new Map<string, number>(
    MAPS.map((name) => [name, copy.getMap(name).size])
  );
  const entries = copy.getMap<ThreadEntry>("entries");
  /** Each pin's entries' keys, some maybe let go since (read through the map). */
  const entryKeys = new Map<string, Set<string>>();
  for (const key of entries.keys()) {
    setIn(entryKeys, entryPin(key)).add(key);
  }
  /** The thread bytes of each standing pin (core `readPins`, less those `gone` names). */
  const stands = new Map<string, number>();
  let bytes = 0;
  /** Pin `id`'s thread bytes in `doc`, read at `keys`; undefined when it doesn't stand there. */
  const standing = (
    doc: Doc,
    id: string,
    keys: Iterable<string>
  ): { bytes: number; pin: Pin } | undefined => {
    const pin = readPinAt(doc, id, keys);
    return pin && !goneOf(doc).has(id)
      ? { pin, bytes: threadBytesOf(pin.thread) }
      : undefined;
  };
  const restand = (id: string) => {
    const now = standing(copy, id, entryKeys.get(id) ?? NONE)?.bytes;
    bytes += (now ?? 0) - (stands.get(id) ?? 0);
    if (now === undefined) {
      stands.delete(id);
    } else {
      stands.set(id, now);
    }
  };
  for (const id of copy.getMap("pins").keys()) {
    restand(id);
  }
  /** The entry items that held each element id, by `client:clock`; some maybe gone since (read through the doc). */
  const holders = new Map<string, Map<string, ID>>();
  const note = (entry: unknown) => {
    if (!(entry instanceof YMap && entry._item)) {
      return;
    }
    const { id } = entry._item;
    const element = elementIdOf(entry);
    if (element !== undefined) {
      mapIn(holders, element).set(`${id.client}:${id.clock}`, id);
    }
  };
  for (const entry of elementsOf(copy)) {
    note(entry);
  }
  /** Each written entry key, by its pin. */
  const writtenBy = (moved: Moved): Map<string, Set<string>> => {
    const by = new Map<string, Set<string>>();
    for (const key of moved.keys.get("entries") ?? NONE) {
      setIn(by, entryPin(key)).add(key);
    }
    return by;
  };

  return {
    sizeAfter: (name, moved) =>
      (sizes.get(name) ?? 0) + (moved.sized.get(name) ?? 0),
    pinsChange: (before, moved) => {
      const written = writtenBy(moved);
      let count = stands.size;
      let held = bytes;
      const touched: { pin: Pin; was: readonly ThreadEntry[] | undefined }[] =
        [];
      for (const id of pinsTouched(moved)) {
        const keys = new Set([
          ...(entryKeys.get(id) ?? NONE),
          ...(written.get(id) ?? NONE),
        ]);
        const now = standing(copy, id, keys);
        const was = stands.get(id);
        count += (now ? 1 : 0) - (was === undefined ? 0 : 1);
        held += (now?.bytes ?? 0) - (was ?? 0);
        if (now) {
          touched.push({
            pin: now.pin,
            was: readPinAt(before, id, keys)?.thread,
          });
        }
      }
      const at = (name: string) =>
        [...(moved.keys.get(name) ?? NONE)].flatMap(
          (key): [string, unknown][] => {
            const map = copy.getMap(name);
            return map.has(key) ? [[key, map.get(key)]] : [];
          }
        );
      return {
        heads: at("pins"),
        entries: at("entries"),
        standing: count,
        bytes: held,
        touched,
      };
    },
    madeBefore: (before, id) =>
      [...(holders.get(id)?.values() ?? [])].flatMap((item) => {
        const entry = entryIn(before, item);
        return entry && elementIdOf(entry) === id ? [entry.get("made")] : [];
      }),
    keep: (moved) => {
      for (const [name, by] of moved.sized) {
        sizes.set(name, (sizes.get(name) ?? 0) + by);
      }
      for (const [pin, keys] of writtenBy(moved)) {
        const held = setIn(entryKeys, pin);
        for (const key of keys) {
          if (entries.has(key)) {
            held.add(key);
          } else {
            held.delete(key);
          }
        }
        if (held.size === 0) {
          entryKeys.delete(pin);
        }
      }
      for (const id of pinsTouched(moved)) {
        restand(id);
      }
      for (const entry of [...moved.added, ...moved.changed]) {
        note(entry);
      }
    },
  };
};

/** What one person's update is read as: the doc before it, the copy after it, what it did, and the copy's ledger. */
interface Change {
  after: Doc;
  before: Doc;
  ledger: Ledger;
  moved: Moved;
}

const keysOf = (change: Change, name: string): ReadonlySet<string> =>
  change.moved.keys.get(name) ?? NONE;

/** Each key of map `name` the change wrote that stands after it, with its value. */
const written = (change: Change, name: string): [string, unknown][] => {
  const map = change.after.getMap(name);
  return [...keysOf(change, name)].flatMap((key): [string, unknown][] =>
    map.has(key) ? [[key, map.get(key)]] : []
  );
};

const same = (a: unknown, b: unknown): boolean => Bun.deepEquals(a, b);

/** Whether two plain values are equal: a type (a nested map or array) is never one. */
const plainSame = (a: unknown, b: unknown): boolean =>
  !(a instanceof AbstractType || b instanceof AbstractType) && same(a, b);

/**
 * Why the change wrote a map `may` doesn't allow, other than to a value
 * that stands as it was; null when it wrote none. `why` names the map.
 */
const unchangedProblem = (
  change: Change,
  may: (name: string) => boolean,
  why: (name: string) => string
): string | null => {
  for (const [name, keys] of change.moved.keys) {
    if (may(name)) {
      continue;
    }
    const before = change.before.getMap(name);
    const after = change.after.getMap(name);
    for (const key of keys) {
      if (!plainSame(after.get(key), before.get(key))) {
        return why(name);
      }
    }
  }
  return null;
};

/** A request's keys a screen writes: its claim (`claim-<its page's number>`, canvas-host scene.ts `PAGE_CLAIM`) and the result. */
const SCREEN_REQUEST_KEY = /^(claim-\d+|result)$/u;

/** Why a screen's change to a canvas's `requests` may not be kept, or null. */
const requestsProblem = (change: Change): string | null => {
  const before = change.before.getMap("requests");
  const after = change.after.getMap("requests");
  const replaced = change.moved.replaced.get("requests");
  const within = change.moved.within.get("requests");
  for (const id of keysOf(change, "requests")) {
    if (before.has(id) !== after.has(id)) {
      return "A screen claims or answers the agent's requests; it does not add or remove them.";
    }
    if (!after.has(id)) {
      continue;
    }
    const request = after.get(id);
    const was = before.get(id);
    if (!(request instanceof YMap && was instanceof YMap)) {
      return "A request is the hub's map.";
    }
    // Written within, its own keys alone; set whole, or below them, every key.
    const own = replaced?.has(id) ? "deep" : (within?.get(id) ?? "deep");
    const keys =
      own === "deep" ? new Set([...request.keys(), ...was.keys()]) : own;
    for (const key of keys) {
      if (!(
        SCREEN_REQUEST_KEY.test(key) ||
        plainSame(request.get(key), was.get(key))
      )) {
        return `A screen changes only a request's claim and result, not its ${key}.`;
      }
    }
  }
  return null;
};

/**
 * Why a client's value for a key of `meta` it writes (core
 * `META_WRITERS`) may not be kept: Send all's note beside the comments the
 * person held (core comments.ts `sendHeld`, `HeldNote`), which the
 * delivery that carries them takes away; on a canvas, Excalidraw's pen
 * mode, once a pen touched it.
 */
const CLIENT_META: { [K in ClientMetaKey]: (value: unknown) => string | null } =
  {
    heldNote: heldNoteProblem,
    penDetected: (value) => penProblem("penDetected", value),
    penMode: (value) => penProblem("penMode", value),
  };

/** Whether a client writes `key` of `meta` ({@link CLIENT_META}). */
const isClientMetaKey = (key: string): key is ClientMetaKey =>
  Object.hasOwn(CLIENT_META, key);

/** Why a canvas screen's pen key `key` may not hold `value`, or null. */
const penProblem = (key: string, value: unknown): string | null =>
  value === undefined || typeof value === "boolean"
    ? null
    : `${key} is true or false.`;

/**
 * Why a person's change to `meta` may not be kept: on any artifact they
 * write the keys core `META_WRITERS` gives the person, on a canvas the
 * keys it gives the canvas's screen too ({@link CLIENT_META}), and nothing
 * else.
 */
const metaProblem = (change: Change, canvas: boolean): string | null => {
  const keys = keysOf(change, "meta");
  if (keys.size === 0) {
    return null;
  }
  const was = new Map(docMeta(change.before).entries());
  const now = new Map(docMeta(change.after).entries());
  for (const key of keys) {
    const value = now.get(key);
    if (same(value, was.get(key))) {
      continue;
    }
    const writer = metaWriter(key);
    if (!(
      isClientMetaKey(key) &&
      (writer === "person" || (canvas && writer === "canvas"))
    )) {
      return canvas
        ? "A screen keeps only penMode, penDetected and heldNote in a canvas's meta."
        : "A page changes its artifact's meta only by its held note.";
    }
    const why = CLIENT_META[key](value);
    if (why) {
      return why;
    }
  }
  return null;
};

/** Why one entry of a canvas's elements is not one: a map of `el` (an element with its id), `pos`, and `by` and `made` when they say who. */
const entryProblem = (entry: unknown): string | null => {
  if (!(entry instanceof YMap)) {
    return "An element is a map of el, pos and by.";
  }
  if (!(
    elementIdOf(entry) !== undefined && typeof entry.get("pos") === "string"
  )) {
    return "An element is a map of el, an Excalidraw element with its id, and pos.";
  }
  const author = (value: unknown) =>
    value === undefined || value === "person" || value === "agent";
  if (!author(entry.get("by"))) {
    return "An element's by is person or agent.";
  }
  return author(entry.get("made"))
    ? null
    : "An element's made is person or agent.";
};

/**
 * Why a screen's update changed who made an element (core
 * `CanvasEntry.made`): set once as its entry is made, it never changes, so
 * a moved or edited element stays whoever's it was.
 */
const madeProblem = (change: Change, entries: unknown[]): string | null => {
  for (const entry of entries) {
    const id = entry instanceof YMap ? elementIdOf(entry) : undefined;
    if (!(entry instanceof YMap) || id === undefined) {
      continue;
    }
    const made = entry.get("made");
    const changed = change.ledger
      .madeBefore(change.before, id)
      .some((was) => was !== undefined && was !== made);
    if (changed) {
      return "Who made an element never changes.";
    }
  }
  return null;
};

/** Why a canvas's image files after a screen's change may not be kept. */
const filesProblem = (change: Change): string | null => {
  if (keysOf(change, "files").size === 0) {
    return null;
  }
  if (change.ledger.sizeAfter("files", change.moved) > CANVAS_LIMITS.files) {
    return `A canvas keeps at most ${CANVAS_LIMITS.files} files.`;
  }
  const before = change.before.getMap("files");
  const large = written(change, "files").some(
    ([key, file]) =>
      !same(file, before.get(key)) &&
      JSON.stringify(file).length > CANVAS_LIMITS.fileBytes
  );
  return large
    ? `A canvas's file is at most ${CANVAS_LIMITS.fileBytes / 1024 / 1024} MB.`
    : null;
};

/**
 * The maps a person's ink, pins (each in its parts, core `PIN_MAPS`), deleted
 * pins and looks write, on any artifact (core ink.ts, comments.ts): every
 * mirrored map but the decision state and the doc's meta.
 */
const INK_MAPS: string[] = MIRRORED_MAPS.filter(
  (map) => map !== "state" && map !== "meta"
);

/** Why the ink, moved groups, pins, deleted pins and looks a person's update wrote may not be kept; null when they may. */
const inkMapsProblem = (change: Change): string | null => {
  const { ledger, moved } = change;
  const touches = (name: string) => keysOf(change, name).size > 0;
  if (touches("ink") || touches("moved")) {
    const problem = inkProblem(
      ledger.sizeAfter("ink", moved) + ledger.sizeAfter("moved", moved),
      [...written(change, "ink"), ...written(change, "moved")].map(
        ([, group]) => group
      )
    );
    if (problem) {
      return problem;
    }
  }
  if (touches("gone")) {
    const problem = goneProblem(
      goneOf(change.before),
      goneOf(change.after),
      keysOf(change, "gone"),
      ledger.sizeAfter("gone", moved)
    );
    if (problem) {
      return problem;
    }
  }
  if (touches("gone") || PIN_MAPS.some(touches)) {
    const problem = pinsProblem(ledger.pinsChange(change.before, moved));
    if (problem) {
      return problem;
    }
  }
  return touches("seen")
    ? seenProblem(ledger.sizeAfter("seen", moved), written(change, "seen"))
    : null;
};

/** Why a canvas's screen's update may not be kept; null when it may. */
const canvasProblem = (change: Change): string | null => {
  const untouched = unchangedProblem(
    change,
    (name) => ["meta", "files", "requests", ...INK_MAPS].includes(name),
    (name) => `A canvas's screen changes its elements, not its ${name}.`
  );
  if (untouched) {
    return untouched;
  }
  if (elementsOf(change.after).length > CANVAS_LIMITS.elements) {
    return `A canvas keeps at most ${CANVAS_LIMITS.elements} elements.`;
  }
  const entries = [...change.moved.added, ...change.moved.changed];
  return (
    metaProblem(change, true) ??
    entries.map(entryProblem).find((why) => why !== null) ??
    madeProblem(change, entries) ??
    filesProblem(change) ??
    requestsProblem(change) ??
    inkMapsProblem(change)
  );
};

/** Why a person's update may not be kept; null when it may. */
const stateProblem = (change: Change): string | null => {
  const kind = getMeta(change.before, "kind");
  if (kind === "canvas") {
    return canvasProblem(change);
  }
  const component = kind === "component";
  const untouched = unchangedProblem(
    change,
    (name) =>
      name === "state" ||
      name === "meta" ||
      INK_MAPS.includes(name) ||
      (component && name === TUNED_MAP),
    (name) =>
      `A page changes its artifact's state and ink only, not its ${name}.`
  );
  if (untouched) {
    return untouched;
  }
  const ink =
    metaProblem(change, false) ??
    inkMapsProblem(change) ??
    (component && keysOf(change, TUNED_MAP).size > 0
      ? tunedProblem(
          change.ledger.sizeAfter(TUNED_MAP, change.moved),
          written(change, TUNED_MAP)
        )
      : null);
  if (ink) {
    return ink;
  }
  if (
    change.moved.reordered &&
    elementsOf(change.after).length !== elementsOf(change.before).length
  ) {
    return "A page changes its artifact's state only, not its elements.";
  }
  if (keysOf(change, "state").size === 0) {
    return null;
  }
  if (
    change.ledger.sizeAfter("state", change.moved) > CHOICE_LIMITS.perArtifact
  ) {
    return `An artifact keeps at most ${CHOICE_LIMITS.perArtifact} ids.`;
  }
  // What the doc keeps is a choice entry: this check let it in.
  const before = change.before.getMap<ChoiceEntry>("state");
  for (const [key, value] of written(change, "state")) {
    if (!Bun.deepEquals(value, before.get(key))) {
      const why = isChoiceEntry(key, value)
        ? settledWriteProblem(before.get(key), value)
        : choiceEntryProblem(key, value);
      if (why) {
        return why;
      }
    }
  }
  return null;
};

/** An artifact doc's check of a person's updates: a copy of it kept in step, and the ledger the rules read. */
export interface Gate {
  /** The copy and its ledger let go. */
  destroy: () => void;
  /** An update the doc took (anyone's, the hub's own included): the copy takes it too. */
  follow: (update: Uint8Array) => void;
  /**
   * Why `update`, from a person's client, may not be applied to the doc;
   * null when it may, the copy holding it already. After a refusal the
   * copy holds what the doc won't: the gate is let go (docs.ts).
   */
  problem: (update: Uint8Array) => string | null;
}

/** A gate on `doc`: its copy made from the doc's whole state, once. */
export const createGate = (doc: Doc): Gate => {
  const copy = new Doc();
  // The doc's own layout, so each root is the type the rules read it as.
  const roots: Roots = {
    maps: new Map(MAPS.map((name) => [copy.getMap(name), name])),
    elements: elementsOf(copy),
  };
  applyUpdate(copy, encodeStateAsUpdate(doc));
  const ledger = createLedger(copy);
  let heard: Moved | undefined;
  copy.on("afterTransaction", (transaction: Transaction) => {
    if (heard) {
      hear(transaction, roots, heard);
    }
  });
  /** `update` applied to the copy; what it did. */
  const take = (update: Uint8Array): Moved => {
    const moved: Moved = {
      added: [],
      changed: new Set(),
      keys: new Map(),
      reordered: false,
      replaced: new Map(),
      sized: new Map(),
      within: new Map(),
    };
    heard = moved;
    try {
      applyUpdate(copy, update);
    } finally {
      heard = undefined;
    }
    return moved;
  };
  return {
    destroy: () => copy.destroy(),
    follow: (update) => ledger.keep(take(update)),
    problem: (update) => {
      let why: string | null;
      let moved: Moved | undefined;
      try {
        moved = take(update);
        why = stateProblem({ after: copy, before: doc, ledger, moved });
      } catch {
        why = "That is not a Yjs update.";
      }
      if (why === null && moved) {
        ledger.keep(moved);
      }
      return why;
    },
  };
};
