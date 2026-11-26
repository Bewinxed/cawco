/**
 * Pages' stores: the Yjs documents a page on the design graph keeps its own
 * state in, which its code joins with y-websocket's `WebsocketProvider` at
 * `/__cawco/store/<scope>` on its own preview origin (sync.ts
 * `storeSocket`). One per artifact and one per project, shared by every
 * page of it (db/page-stores.ts `StoreKey`); the hub reads nothing in them.
 *
 * Kept as an artifact's doc is (docs.ts): loaded from its update log on
 * first use, each update appended to the log and sent to every other joined
 * client, the log made one snapshot once it holds `COMPACT_AT` updates and
 * the doc stands quiet `COMPACT_QUIET_MS`, a doc no client holds let go
 * `IDLE_MS` after its last use, and every joined client hearing the hub's
 * beat every `RESYNC_MS`.
 *
 * A store holds at most {@link STORE_LIMITS}`.bytes`, its whole state as
 * one update (`Y.encodeStateAsUpdate`), checked as each update is taken
 * ({@link PageStoresShape.take}).
 */
import { RESYNC_MS } from "@cawco/core/doc-link";
import { Context, Effect, Layer } from "effect";
import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";
import { Db } from "../db";
import { type PageStoresDb, type StoreKey, storeName } from "../db/page-stores";
import type { HubLifetimeShape, HubTimer } from "../lifetime";
import { HubLifetime } from "../lifetime";
import { COMPACT_AT, COMPACT_QUIET_MS, IDLE_MS } from "./docs";

/**
 * The most a store holds, its whole state as one update. Ours: half of the
 * 16 MiB message Bun's sockets take whole (`maxPayloadLength`), which the
 * hub's first answer to a joining page (its sync step 2, the whole doc)
 * and each hop of the preview server's relay must fit in.
 */
// @limit measured: the largest update of a component artifact is 14.1 MiB, an upper bound for one store (artifact_updates on obelisk, 2026-11-26)
const STORE_LIMITS = { bytes: 8 * 1024 * 1024 } as const;

/** A page joined to a store: the hub sends it every update another made. */
export interface StoreClient {
  /** Sends it the hub's beat (sync.ts `BEAT`), every {@link RESYNC_MS}. */
  beat: () => void;
  /** Ends its socket: what the store was kept for is gone ({@link PageStoresShape.drop}). */
  close: () => void;
  send: (update: Uint8Array) => void;
}

interface Loaded {
  clients: Set<StoreClient>;
  /** The log's snapshot, owed once the doc stands quiet. */
  compacting?: HubTimer;
  doc: Doc;
  idle?: HubTimer;
  key: StoreKey;
  /** How many updates its log holds. */
  logged: number;
  /**
   * The doc's size as one update, at most: exact as it loads and once a
   * check near the limit measured it, and each update's length added on
   * after (an update that deletes or repeats adds less).
   */
  size: number;
}

export interface PageStoresShape {
  /** The store's doc, loaded from its log when it is not in memory. */
  doc: (key: StoreKey) => Doc;
  /** What `key` was kept for is gone, or came back: every joined page's socket ended and its doc let go, read again from its log at the next join. */
  drop: (key: StoreKey) => void;
  /** Starts sending `client` every update another makes; the store's doc. */
  join: (key: StoreKey, client: StoreClient) => Doc;
  leave: (key: StoreKey, client: StoreClient) => void;
  /**
   * One update from `client`, applied to the store's doc: why it isn't, in
   * a sentence for the page's agent, or null once it is.
   */
  take: (
    key: StoreKey,
    update: Uint8Array,
    client: StoreClient
  ) => string | null;
}

/** The joined client an update came from; none for the load's. */
const clientOf = (origin: unknown): StoreClient | undefined =>
  origin &&
  typeof origin === "object" &&
  "client" in origin &&
  isClient(origin.client)
    ? origin.client
    : undefined;

/** Whether `value` is a joined client: what {@link PageStoresShape.take}'s origin carries. */
const isClient = (value: unknown): value is StoreClient =>
  typeof value === "object" &&
  value !== null &&
  "send" in value &&
  typeof value.send === "function";

const make = (deps: {
  db: PageStoresDb;
  lifetime: HubLifetimeShape;
}): PageStoresShape => {
  const loaded = new Map<string, Loaded>();

  deps.lifetime.every("store resync", RESYNC_MS, () => {
    for (const entry of loaded.values()) {
      for (const client of entry.clients) {
        client.beat();
      }
    }
  });

  const unload = (entry: Loaded) => {
    deps.lifetime.cancel(entry.idle);
    deps.lifetime.cancel(entry.compacting);
    entry.doc.destroy();
  };

  /** Every joined page's socket ended and the doc let go. */
  const drop = (key: StoreKey) => {
    const name = storeName(key);
    const entry = loaded.get(name);
    if (!entry) {
      return;
    }
    loaded.delete(name);
    const clients = [...entry.clients];
    entry.clients.clear();
    for (const client of clients) {
      client.close();
    }
    unload(entry);
  };

  const sleep = (name: string, entry: Loaded) => {
    deps.lifetime.cancel(entry.idle);
    if (entry.clients.size > 0) {
      return;
    }
    entry.idle = deps.lifetime.after(
      "store unloaded when idle",
      IDLE_MS,
      () => {
        if (entry.clients.size === 0 && loaded.get(name) === entry) {
          loaded.delete(name);
          unload(entry);
        }
      }
    );
  };

  /** The log made one snapshot once the doc stands quiet (docs.ts `compactWhenQuiet`). */
  const compactWhenQuiet = (name: string, entry: Loaded) => {
    deps.lifetime.cancel(entry.compacting);
    entry.compacting = deps.lifetime.after(
      "store log quiet",
      COMPACT_QUIET_MS,
      () => {
        entry.compacting = undefined;
        deps.lifetime.jobs.want({
          key: `store log ${name}`,
          name: "store log compacted",
          priority: "background",
          run: () => {
            if (loaded.get(name) === entry && entry.logged >= COMPACT_AT) {
              const whole = encodeStateAsUpdate(entry.doc);
              deps.db.compact(entry.key, whole);
              entry.logged = 1;
              entry.size = whole.byteLength;
            }
          },
        });
      }
    );
  };

  const load = (key: StoreKey): Loaded => {
    const name = storeName(key);
    const known = loaded.get(name);
    if (known) {
      return known;
    }
    const doc = new Doc();
    const updates = deps.db.updates(key);
    for (const update of updates) {
      applyUpdate(doc, update, "load");
    }
    const entry: Loaded = {
      clients: new Set(),
      doc,
      key,
      logged: updates.length,
      size: encodeStateAsUpdate(doc).byteLength,
    };
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "load") {
        return;
      }
      if (!deps.db.append(key, update)) {
        // What it was kept for went as this update came: nothing to keep it for.
        drop(key);
        return;
      }
      const from = clientOf(origin);
      for (const other of entry.clients) {
        if (other !== from) {
          other.send(update);
        }
      }
      entry.logged += 1;
      if (entry.logged >= COMPACT_AT) {
        compactWhenQuiet(name, entry);
      }
    });
    loaded.set(name, entry);
    sleep(name, entry);
    return entry;
  };

  /**
   * The doc's size once `update` is applied: the running bound while it is
   * under the limit, else measured on a copy of the doc that takes it.
   */
  const sizeWith = (entry: Loaded, update: Uint8Array): number => {
    const bound = entry.size + update.byteLength;
    if (bound <= STORE_LIMITS.bytes) {
      return bound;
    }
    const trial = new Doc();
    try {
      applyUpdate(trial, encodeStateAsUpdate(entry.doc));
      applyUpdate(trial, update);
      return encodeStateAsUpdate(trial).byteLength;
    } finally {
      trial.destroy();
    }
  };

  return {
    doc: (key) => load(key).doc,
    drop,
    join: (key, client) => {
      const entry = load(key);
      entry.clients.add(client);
      deps.lifetime.cancel(entry.idle);
      return entry.doc;
    },
    leave: (key, client) => {
      const name = storeName(key);
      const entry = loaded.get(name);
      if (entry?.clients.delete(client)) {
        sleep(name, entry);
      }
    },
    take: (key, update, client) => {
      const entry = load(key);
      const size = sizeWith(entry, update);
      if (size > STORE_LIMITS.bytes) {
        return `This store would hold ${Math.ceil(size / 1024 / 1024)} MiB; a store holds at most ${STORE_LIMITS.bytes / 1024 / 1024} MiB. Keep files and large data out of it.`;
      }
      applyUpdate(entry.doc, update, { client });
      // Dropped as it applied: its artifact or project went.
      if (loaded.get(storeName(key)) === entry) {
        entry.size = size;
      }
      return null;
    },
  };
};

/**
 * What `make` makes, as one of the hub's services: built once, from its
 * layer, by `createServer` (hub-layer.ts).
 */
export class PageStores extends Context.Service<PageStores, PageStoresShape>()(
  "PageStores"
) {}

export const PageStoresLayer = Layer.effect(PageStores)(
  Effect.gen(function* () {
    const db = yield* Db;
    return make({ db: db.pageStores, lifetime: yield* HubLifetime });
  })
);
