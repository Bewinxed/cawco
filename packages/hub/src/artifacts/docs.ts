/**
 * Artifacts' live documents (Projects spec §5.10, D23): one Yjs doc per
 * artifact, loaded from its update log on first use, kept while a client is
 * joined or it was used lately, and dropped when idle; the log reloads it
 * whole.
 *
 * Every update the doc takes, from a joined client or from the hub, is
 * appended to the log at the artifact's next seq, with what it changed and
 * who changed it (`changes`, what `artifact_read`'s `since` and the
 * delivery to the session read): a page's `state` keys, by whoever's client
 * wrote them; a canvas's element ids, by the `by` each element carries (a
 * screen writes the agent's converted elements too). It is sent to every
 * other joined client.
 *
 * Whatever the hub reads of a doc on every update is read off what that
 * update's transaction wrote (doc-parts.ts `mapKeysOf`): the `state` keys,
 * the elements, the pins it touched (each pin read again alone,
 * {@link ArtifactDocs.pins}), and whether it moved a part Needs you's facts
 * are read from ({@link ArtifactDocs.factsStamp}). Nothing on an update's
 * way reads the whole doc.
 *
 * The log is replaced by one snapshot, the doc's whole state, once it holds
 * {@link COMPACT_AT} updates and the doc has stood quiet
 * {@link COMPACT_QUIET_MS}: y-indexeddb's practice (9.0.12,
 * src/y-indexeddb.js: `PREFERRED_TRIM_SIZE = 500`, and `storeState`, which
 * writes `Y.encodeStateAsUpdate(doc)` and drops the updates before it, is
 * debounced by `_storeTimeout = 1000` after each update past it); y-leveldb
 * trims at the same size (0.2.0, `PREFERRED_TRIM_SIZE`, `flushDocument`).
 * A snapshot costs the whole doc (95 ms for a 13 MB page, 177 ms for a
 * 19,000-element canvas), so it runs on the hub's admission once the
 * person's burst is over, never inside an update.
 */
import type { CanvasAuthor } from "@cawco/core/canvas";
import type { ChoiceEntry } from "@cawco/core/choices";
import {
  dropRepeatedFiles,
  type EntryIndex,
  entryPin,
  honourDeletions,
  indexEntries,
  type Pin,
  readPinAt,
  readPins,
  splitWholePins,
} from "@cawco/core/comments/model";
import { RESYNC_MS } from "@cawco/core/doc-link";
import { mapsOf, PIN_MAPS } from "@cawco/core/doc-maps";
import { getMeta } from "@cawco/core/doc-meta";
import { keepTuned, TUNED_MAP, type TunedRecord } from "@cawco/core/tuned";
import {
  type AbstractType,
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  type Transaction,
  type Array as YArray,
  type YEvent,
  Map as YMap,
} from "yjs";
import type { ArtifactsDb } from "../db/artifacts";
import type { HubLifetimeShape, HubTimer } from "../lifetime";
import {
  addedTo,
  elementIdOf,
  elementsOf,
  FACT_MAPS,
  MAPS,
  mapKeysOf,
} from "./doc-parts";
import { createGate, type Gate } from "./gate";

/**
 * A component's tuned timing written as a choice entry (the canvas page's
 * old timeline wrote `state.tuned`, a list of records) moved into the doc's
 * `tuned` map, a move each (core tuned.ts), once, as the hub's own update.
 * Whether it moved any.
 */
function moveTunedOut(doc: Doc): boolean {
  const state = doc.getMap<ChoiceEntry>("state");
  const entry = state.get(TUNED_MAP);
  if (!entry || getMeta(doc, "kind") !== "component") {
    return false;
  }
  const records = Array.isArray(entry.value)
    ? entry.value.filter(
        (one: unknown): one is TunedRecord =>
          typeof one === "object" &&
          one !== null &&
          "move" in one &&
          typeof one.move === "string"
      )
    : [];
  keepTuned(doc, records, entry.pageHash, entry.at);
  state.delete(TUNED_MAP);
  return true;
}

/** Updates the log holds before it becomes one snapshot: y-indexeddb's and y-leveldb's `PREFERRED_TRIM_SIZE`. */
export const COMPACT_AT = 500;

/** How long a doc stands quiet before its log becomes one snapshot: y-indexeddb's `_storeTimeout`. */
export const COMPACT_QUIET_MS = 1000;

/** How long a doc no client holds stays loaded after its last use. Our choice. */
export const IDLE_MS = 5 * 60_000;

/** Who made a change: a person through a joined client, or the hub (an agent's tool, a build). */
type ChangeOrigin = { client: ArtifactClient } | "agent" | "hub";

/** A joined client: the hub sends it every update another made. */
export interface ArtifactClient {
  /** Sends it the hub's beat (sync.ts): a message it applies as nothing, every {@link RESYNC_MS}. */
  beat: () => void;
  /** Ends its socket: the artifact was removed ({@link ArtifactDocs.drop}). */
  close: () => void;
  /**
   * A page's main view: the id its overlay joined with (the socket's
   * `placer` query), and whether its page is shown now (Page Visibility, as
   * its awareness state says: sync.ts `readShown`). One shown view writes
   * where the marks stand (core `DocMeta.placer`).
   */
  placer?: MainView;
  /** A canvas's host page, which can convert the agent's writes (the socket's `screen` query). */
  screen: boolean;
  send: (update: Uint8Array) => void;
}

/** A page's main view among an artifact's clients ({@link ArtifactClient.placer}). */
export interface MainView {
  id: string;
  /** Its page is shown (`document.visibilityState`), until its awareness says otherwise. */
  shown: boolean;
}

interface Loaded {
  clients: Set<ArtifactClient>;
  /** The log's snapshot, owed once the doc stands quiet ({@link COMPACT_QUIET_MS}). */
  compacting?: HubTimer;
  doc: Doc;
  /** The check of a person's updates (gate.ts): made by the first one, let go with the last client or a refusal. */
  gate?: Gate;
  idle?: HubTimer;
  /** How many updates its log holds. */
  logged: number;
  /** Its pins, each read again once a change touched it ({@link keepPins}). */
  pins: PinsKept;
}

/** A doc's pins whole, kept as it takes each transaction: what {@link ArtifactDocs.pins} hands out. */
interface PinsKept {
  /** Every pin now: those a change touched since the last read are read again, alone. */
  read: () => ReadonlyMap<string, Pin>;
  /** A transaction wrote `keys` (doc-parts.ts `mapKeysOf`): the pins they name are read again at the next read. */
  touched: (keys: ReadonlyMap<string, ReadonlySet<string>>) => void;
}

/**
 * `doc`'s pins, read whole once (core `readPins`) at the first read, and
 * after it each pin a transaction touched read again at its own entry keys
 * (core `readPinAt`, `entries` the doc's {@link EntryIndex}): a reply on a
 * pin of a thread-heavy page reads that pin's thread, not every pin's.
 */
const keepPins = (doc: Doc, entries: EntryIndex): PinsKept => {
  let pins: Map<string, Pin> | undefined;
  const touched = new Set<string>();
  return {
    touched: (keys) => {
      if (!pins) {
        return;
      }
      for (const name of PIN_MAPS) {
        for (const key of keys.get(name) ?? []) {
          touched.add(name === "entries" ? entryPin(key) : key);
        }
      }
    },
    read: () => {
      if (!pins) {
        pins = readPins(doc);
        touched.clear();
        return pins;
      }
      for (const id of touched) {
        const pin = readPinAt(doc, id, entries.keysOf(id));
        if (pin) {
          pins.set(id, pin);
        } else {
          pins.delete(id);
        }
      }
      touched.clear();
      return pins;
    },
  };
};

export interface ArtifactDocs {
  /** The artifact's doc, loaded from its log when it is not in memory. */
  doc: (id: string) => Doc;
  /** The artifact was removed: every joined client's socket is ended and its doc let go. */
  drop: (id: string) => void;
  /**
   * When a change last moved a part of the artifact's doc Needs you's
   * facts are read from (doc-parts.ts `FACT_MAPS`), as a stamp unique in
   * this hub's life, 0 for a doc no change moved since the hub started:
   * facts read at the same stamp stand (facts.ts `factsOf`). Read without
   * loading the doc; an unloaded doc keeps the stamp it had.
   */
  factsStamp: (id: string) => number;
  /** Artifact `to`'s doc made a copy of `from`'s whole, as one update of `to`'s, by the hub: a held next version's start. */
  fork: (from: string, to: string) => void;
  /** Starts sending `client` every update another makes. */
  join: (id: string, client: ArtifactClient) => Doc;
  leave: (id: string, client: ArtifactClient) => void;
  /**
   * What `from`'s doc holds that `to`'s does not, applied to `to`'s as one
   * transaction made by `origin`: a held next version merged into its
   * artifact. `from` forked from `to`, so what changed on `to` since (the
   * person's picks) stays beside it.
   */
  merge: (from: string, to: string, origin: ChangeOrigin) => void;
  /**
   * Every pin of the artifact's doc, whole (core `readPins`), as it stands
   * now: each pin read again only once a change touched one of its parts.
   * Read it at once; it moves with the doc.
   */
  pins: (id: string) => ReadonlyMap<string, Pin>;
  /** The main views joined to the artifact now, in the order they joined ({@link ArtifactClient.placer}). */
  placers: (id: string) => MainView[];
  /**
   * Why `update`, from a person's client, may not be applied to the
   * artifact's doc; null when it may, the caller applying it next (sync.ts
   * `takeUpdate`). Read by the doc's gate (gate.ts), which costs the update,
   * not the doc: made from the doc once, it takes every update the doc
   * takes after.
   */
  problem: (id: string, update: Uint8Array) => string | null;
  /** How many screens (canvas host pages) are joined to the artifact now. */
  screens: (id: string) => number;
  /**
   * What a page's overlay starts from before it joins, its tag's data: the
   * whole doc as one base64 Yjs update (`state`, for its doc worker) and its
   * mirrored maps as JSON (`maps`, for the page's mirror, core doc-maps.ts).
   */
  seed: (id: string) => { maps: string; state: string };
  /** Runs `change` as one transaction on the artifact's doc, made by `origin`. */
  transact: (
    id: string,
    origin: ChangeOrigin,
    change: (doc: Doc) => void
  ) => void;
  /** How many views (a page's overlay, a pane, a canvas's host) are joined to the artifact now. */
  viewers: (id: string) => number;
}

/** The joined client an update came from; none for the hub's own. */
const clientOf = (origin: unknown): ArtifactClient | undefined =>
  origin &&
  typeof origin === "object" &&
  "client" in origin &&
  isClient(origin.client)
    ? origin.client
    : undefined;

/** Whether `value` is a joined client: what a socket's origin carries (sync.ts). */
const isClient = (value: unknown): value is ArtifactClient =>
  typeof value === "object" &&
  value !== null &&
  "send" in value &&
  typeof value.send === "function";

/** The id and author of a canvas element's map, when it holds one. */
const elementOf = (
  map: YMap<unknown>
): { id: string; by: CanvasAuthor } | null => {
  const id = elementIdOf(map);
  return id === undefined
    ? null
    : { id, by: map.get("by") === "person" ? "person" : "agent" };
};

/**
 * The canvas elements a transaction on `elements` added or changed: the
 * entries it inserted (read off its own structs, doc-parts.ts `addedTo`)
 * and those its deep events changed within.
 */
const elementsIn = (
  elements: YArray<YMap<unknown>>,
  events: YEvent<AbstractType<unknown>>[],
  transaction: Transaction
): { id: string; by: CanvasAuthor }[] =>
  [
    ...addedTo(transaction, elements),
    ...events.flatMap((event) =>
      event.target === elements ? [] : [event.target]
    ),
  ].flatMap((map) => {
    const element = map instanceof YMap ? elementOf(map) : null;
    return element ? [element] : [];
  });

export const createArtifactDocs = (deps: {
  /** A page's `state` changed at `keys` (a pick, a note), by `by`: its project's Decisions tab hears of it, and Who decides of a settled card picked again. */
  changed?: (id: string, keys: string[], by: CanvasAuthor) => void;
  db: ArtifactsDb;
  /** The hub's lifetime: each doc's idle timer runs on it. */
  lifetime: HubLifetimeShape;
  /** Any update the doc took, from anyone, and whose it was: what waits on the person in it may have moved (Needs you). */
  updated?: (id: string, by: CanvasAuthor) => void;
}): ArtifactDocs => {
  const loaded = new Map<string, Loaded>();
  /** Each doc's facts stamp ({@link ArtifactDocs.factsStamp}), kept while it is unloaded. */
  const stamps = new Map<string, number>();
  let stamped = 0;

  /*
   * Every joined client hears the hub every RESYNC_MS, whatever its page's
   * timers do. A hidden tab's chained timers run once a minute (Chromium's
   * intensive wake-up throttling, which an open WebSocket doesn't exempt:
   * chromium commit b3ca8d2), so y-websocket's own resync goes out once a
   * minute and its 30 s no-message check, on the same wake-up, would find
   * the link a minute quiet and close it. Its check is a constant, not an
   * option (y-websocket 3.1.0 `messageReconnectTimeout`), and the socket's
   * pings never reach the page's script; a message does.
   */
  deps.lifetime.every("doc resync", RESYNC_MS, () => {
    for (const entry of loaded.values()) {
      for (const client of entry.clients) {
        client.beat();
      }
    }
  });

  const sleep = (id: string, entry: Loaded) => {
    deps.lifetime.cancel(entry.idle);
    if (entry.clients.size > 0) {
      return;
    }
    entry.idle = deps.lifetime.after("doc unloaded when idle", IDLE_MS, () => {
      if (entry.clients.size === 0) {
        loaded.delete(id);
        unload(entry);
      }
    });
  };

  /** A doc let go: its gate, its owed snapshot and the doc. */
  const unload = (entry: Loaded) => {
    deps.lifetime.cancel(entry.idle);
    deps.lifetime.cancel(entry.compacting);
    letGate(entry);
    entry.doc.destroy();
  };

  /**
   * The log of `id` replaced by one snapshot once the doc stands quiet
   * {@link COMPACT_QUIET_MS} (see the top): each update past
   * {@link COMPACT_AT} pushes it back; it runs on the hub's admission,
   * background, while the doc is still the one loaded.
   */
  const compactWhenQuiet = (id: string, entry: Loaded) => {
    deps.lifetime.cancel(entry.compacting);
    entry.compacting = deps.lifetime.after(
      "doc log quiet",
      COMPACT_QUIET_MS,
      () => {
        entry.compacting = undefined;
        deps.lifetime.jobs.want({
          key: `doc log ${id}`,
          name: "doc log compacted",
          priority: "background",
          run: () => {
            if (loaded.get(id) === entry && entry.logged >= COMPACT_AT) {
              deps.db.compact(id, encodeStateAsUpdate(entry.doc));
              entry.logged = 1;
            }
          },
        });
      }
    );
  };

  /** The doc's gate let go: a refusal left it holding what the doc never took, or nobody writes. */
  const letGate = (entry: Loaded) => {
    entry.gate?.destroy();
    entry.gate = undefined;
  };

  /** One update the doc took: kept in the log, by who made it, and sent to every other client. */
  const keep = (
    id: string,
    entry: Loaded,
    update: Uint8Array,
    origin: unknown,
    changed: { keys: string[]; elements: Map<string, CanvasAuthor> }
  ) => {
    const client = clientOf(origin);
    const by: CanvasAuthor = client ? "person" : "agent";
    deps.db.append(id, update, {
      ...Object.fromEntries(changed.keys.map((key) => [key, by])),
      ...Object.fromEntries(changed.elements),
    });
    for (const other of entry.clients) {
      if (other !== client) {
        other.send(update);
      }
    }
    entry.logged += 1;
    if (entry.logged >= COMPACT_AT) {
      compactWhenQuiet(id, entry);
    }
    if (changed.keys.length > 0) {
      deps.changed?.(id, changed.keys, by);
    }
    deps.updated?.(id, by);
  };

  const load = (id: string): Loaded => {
    const known = loaded.get(id);
    if (known) {
      sleep(id, known);
      return known;
    }
    const doc = new Doc();
    for (const name of MAPS) {
      doc.getMap(name);
    }
    const elements = elementsOf(doc);
    const updates = deps.db.updates(id);
    for (const update of updates) {
      applyUpdate(doc, update, "load");
    }
    // Made before honourDeletions' watch, so its entry observer hears a change first (core `honourDeletions`).
    const entries = indexEntries(doc);
    const entry: Loaded = {
      doc,
      clients: new Set(),
      logged: updates.length,
      pins: keepPins(doc, entries),
    };
    const roots = new Map<unknown, string>(
      MAPS.map((name) => [doc.getMap(name), name])
    );
    // What a transaction changed, read before its update is emitted.
    let changed: { keys: string[]; elements: Map<string, CanvasAuthor> } = {
      keys: [],
      elements: new Map(),
    };
    // The elements it added or changed, heard before its `afterTransaction`
    // (Yjs calls observers first).
    let touched = new Map<string, CanvasAuthor>();
    elements.observeDeep((events, transaction) => {
      for (const element of elementsIn(elements, events, transaction)) {
        touched.set(element.id, element.by);
      }
    });
    doc.on("afterTransaction", (transaction: Transaction) => {
      const keys = mapKeysOf(transaction, roots);
      if (FACT_MAPS.some((name) => keys.has(name))) {
        stamped += 1;
        stamps.set(id, stamped);
      }
      entry.pins.touched(keys);
      changed = {
        // A component's tuned timing reads as the one `tuned` entry of its state (core tuned.ts `tunedEntryOf`): a change to it is that key's.
        keys: [
          ...(keys.get("state") ?? []),
          ...(keys.has(TUNED_MAP) ? [TUNED_MAP] : []),
        ],
        elements: touched,
      };
      touched = new Map();
    });
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "load") {
        entry.gate?.follow(update);
        keep(id, entry, update, origin, changed);
      }
    });
    // A doc written while each pin was one whole value is split into its
    // parts once, here, as the hub's own update: kept in the log like any
    // other, so every client joining reads the parts, and the next load
    // finds nothing to split. An entry stored with one file twice is written
    // again the same way, so no person's write meets a doc the gate refuses.
    let whole = 0;
    let repeated = 0;
    let tunedOut = false;
    doc.transact(() => {
      whole = splitWholePins(doc);
      repeated = dropRepeatedFiles(doc);
      tunedOut = moveTunedOut(doc);
    }, "hub");
    if (tunedOut) {
      console.log(
        `[artifacts] ${id}: its tuned timing, kept as a choice entry, is kept in its tuned map now`
      );
    }
    if (repeated > 0) {
      console.log(
        `[artifacts] ${id}: ${repeated} thread entries that held one file twice hold it once now`
      );
    }
    if (whole > 0) {
      console.log(
        `[artifacts] ${id}: ${whole} pin(s) written whole are kept in their parts now`
      );
    }
    // A pin deleted on any device stays deleted here: a write that reached
    // the hub before its tombstone (a page placing its pins on a stale load,
    // a delivery's stamp, an agent's reply) is undone as the tombstone lands,
    // and that undoing is kept and sent like any update.
    honourDeletions(doc, entries);
    loaded.set(id, entry);
    sleep(id, entry);
    return entry;
  };

  return {
    doc: (id) => load(id).doc,
    drop: (id) => {
      const entry = loaded.get(id);
      if (!entry) {
        return;
      }
      loaded.delete(id);
      stamps.delete(id);
      const clients = [...entry.clients];
      entry.clients.clear();
      for (const client of clients) {
        client.close();
      }
      unload(entry);
    },
    factsStamp: (id) => stamps.get(id) ?? 0,
    fork: (from, to) => {
      const whole = encodeStateAsUpdate(load(from).doc);
      const { doc } = load(to);
      doc.transact(() => applyUpdate(doc, whole), "hub");
    },
    merge: (from, to, origin) => {
      const { doc } = load(to);
      const missing = encodeStateAsUpdate(
        load(from).doc,
        encodeStateVector(doc)
      );
      doc.transact(() => applyUpdate(doc, missing), origin);
    },
    join: (id, client) => {
      const entry = load(id);
      entry.clients.add(client);
      deps.lifetime.cancel(entry.idle);
      return entry.doc;
    },
    leave: (id, client) => {
      const entry = loaded.get(id);
      if (entry?.clients.delete(client)) {
        // Nobody joined writes: the gate's copy of the doc goes with them.
        if (entry.clients.size === 0) {
          letGate(entry);
        }
        sleep(id, entry);
      }
    },
    pins: (id) => load(id).pins.read(),
    problem: (id, update) => {
      const entry = load(id);
      entry.gate ??= createGate(entry.doc);
      const why = entry.gate.problem(update);
      if (why) {
        letGate(entry);
      }
      return why;
    },
    placers: (id) =>
      [...(loaded.get(id)?.clients ?? [])].flatMap((client) =>
        client.placer ? [client.placer] : []
      ),
    screens: (id) =>
      [...(loaded.get(id)?.clients ?? [])].filter((client) => client.screen)
        .length,
    viewers: (id) => loaded.get(id)?.clients.size ?? 0,
    seed: (id) => {
      const { doc } = load(id);
      return {
        state: Buffer.from(encodeStateAsUpdate(doc)).toString("base64"),
        maps: JSON.stringify(mapsOf(doc)),
      };
    },
    transact: (id, origin, change) => {
      const { doc } = load(id);
      doc.transact(() => change(doc), origin);
    },
  };
};
