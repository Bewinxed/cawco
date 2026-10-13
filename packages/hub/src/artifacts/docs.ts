/**
 * Artifacts' live documents (Projects spec §5.10, D23): one Yjs doc per
 * artifact, loaded from its update log on first use, kept while a client is
 * joined or it was used lately, and dropped when idle; the log reloads it
 * whole.
 *
 * Every update the doc takes, from a joined client or from the hub, is
 * appended to the log at the artifact's next seq, with the `state` keys it
 * changed and who changed them (`changes`, what `artifact_read`'s `since`
 * and the delivery to the session read), and sent to every other joined
 * client. Every {@link COMPACT_EVERY} updates the log is replaced by one
 * snapshot.
 */
import {
  type AbstractType,
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  type YEvent,
} from "yjs";
import type { ArtifactsDb } from "../db/artifacts";

/** The doc's top-level maps; this slice writes `meta` and `state` only. */
export const MAPS = [
  "meta",
  "state",
  "elements",
  "ink",
  "pins",
  "comments",
] as const;

/** Updates kept one by one before the log becomes one snapshot. The brief's number. */
const COMPACT_EVERY = 100;

/** How long a doc no client holds stays loaded after its last use. Our choice. */
const IDLE_MS = 5 * 60_000;

/** Who made a change: a person through a joined client, or the hub (an agent's tool, a build). */
export type ChangeOrigin = { client: ArtifactClient } | "agent" | "hub";

/** A joined client: the hub sends it every update another made. */
export interface ArtifactClient {
  send: (update: Uint8Array) => void;
}

interface Loaded {
  clients: Set<ArtifactClient>;
  doc: Doc;
  idle?: ReturnType<typeof setTimeout>;
}

export interface ArtifactDocs {
  /** The artifact's doc, loaded from its log when it is not in memory. */
  doc: (id: string) => Doc;
  /** Starts sending `client` every update another makes. */
  join: (id: string, client: ArtifactClient) => Doc;
  leave: (id: string, client: ArtifactClient) => void;
  /** The whole doc as one base64 Yjs update: what a page's overlay starts from before it joins. */
  snapshot: (id: string) => string;
  /** Runs `change` as one transaction on the artifact's doc, made by `origin`. */
  transact: (
    id: string,
    origin: ChangeOrigin,
    change: (doc: Doc) => void
  ) => void;
}

/** The joined client an update came from; none for the hub's own. */
const clientOf = (origin: unknown): ArtifactClient | undefined =>
  origin && typeof origin === "object" && "client" in origin
    ? (origin as { client: ArtifactClient }).client
    : undefined;

export const createArtifactDocs = (deps: {
  db: ArtifactsDb;
  /** The person changed `keys` of `state`; the seq the update was kept at. */
  personChanged: (id: string, keys: readonly string[], seq: number) => void;
}): ArtifactDocs => {
  const loaded = new Map<string, Loaded>();

  const sleep = (id: string, entry: Loaded) => {
    clearTimeout(entry.idle);
    if (entry.clients.size > 0) {
      return;
    }
    entry.idle = setTimeout(() => {
      if (entry.clients.size === 0) {
        loaded.delete(id);
        entry.doc.destroy();
      }
    }, IDLE_MS);
  };

  /** One update the doc took: kept in the log, sent to every other client, owed to the session when a person made it. */
  const keep = (
    id: string,
    entry: Loaded,
    update: Uint8Array,
    origin: unknown,
    keys: string[]
  ) => {
    const client = clientOf(origin);
    const seq = deps.db.append(id, update, {
      keys,
      by: client ? "person" : "agent",
    });
    for (const other of entry.clients) {
      if (other !== client) {
        other.send(update);
      }
    }
    if (deps.db.updateCount(id) >= COMPACT_EVERY) {
      deps.db.compact(id, encodeStateAsUpdate(entry.doc));
    }
    if (client && keys.length > 0) {
      deps.personChanged(id, keys, seq);
    }
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
    for (const update of deps.db.updates(id)) {
      applyUpdate(doc, update, "load");
    }
    const entry: Loaded = { doc, clients: new Set() };
    // The keys a transaction changed, read before its update is emitted.
    let keys: string[] = [];
    const state = doc.getMap("state") as unknown as AbstractType<
      YEvent<AbstractType<unknown>>
    >;
    doc.on("afterTransaction", (transaction) => {
      keys = [...(transaction.changed.get(state) ?? [])].filter(
        (key): key is string => key !== null
      );
    });
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "load") {
        keep(id, entry, update, origin, keys);
      }
    });
    loaded.set(id, entry);
    sleep(id, entry);
    return entry;
  };

  return {
    doc: (id) => load(id).doc,
    join: (id, client) => {
      const entry = load(id);
      entry.clients.add(client);
      clearTimeout(entry.idle);
      return entry.doc;
    },
    leave: (id, client) => {
      const entry = loaded.get(id);
      if (entry?.clients.delete(client)) {
        sleep(id, entry);
      }
    },
    snapshot: (id) =>
      Buffer.from(encodeStateAsUpdate(load(id).doc)).toString("base64"),
    transact: (id, origin, change) => {
      const { doc } = load(id);
      doc.transact(() => change(doc), origin);
    },
  };
};
