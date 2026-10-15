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
 * other joined client. Every {@link COMPACT_EVERY} updates the log is
 * replaced by one snapshot.
 */
import type { CanvasAuthor } from "@cawco/core/canvas";
import {
  type AbstractType,
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  type Array as YArray,
  type YEvent,
  Map as YMap,
} from "yjs";
import type { ArtifactsDb } from "../db/artifacts";

/** The doc's top-level maps. */
export const MAPS = [
  "meta",
  "state",
  "ink",
  "moved",
  "pins",
  "comments",
  "files",
  "requests",
] as const;

/** The doc's one top-level array: a canvas's scene, as y-excalidraw lays it out. */
export const ELEMENTS = "elements";

/** A canvas's elements: each a `Y.Map` of `el`, `pos`, `by` and `at`. */
export const elementsOf = (doc: Doc): YArray<YMap<unknown>> =>
  doc.getArray<YMap<unknown>>(ELEMENTS);

/** Updates kept one by one before the log becomes one snapshot. The brief's number. */
const COMPACT_EVERY = 100;

/** How long a doc no client holds stays loaded after its last use. Our choice. */
const IDLE_MS = 5 * 60_000;

/** Who made a change: a person through a joined client, or the hub (an agent's tool, a build). */
export type ChangeOrigin = { client: ArtifactClient } | "agent" | "hub";

/** A joined client: the hub sends it every update another made. */
export interface ArtifactClient {
  /** A canvas's host page, which can convert the agent's writes (the socket's `screen` query). */
  screen: boolean;
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
  /** How many screens (canvas host pages) are joined to the artifact now. */
  screens: (id: string) => number;
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

/** The id and author of a canvas element's map, when it holds one. */
const elementOf = (
  map: YMap<unknown>
): { id: string; by: CanvasAuthor } | null => {
  const el = map.get("el") as { id?: unknown } | undefined;
  return typeof el?.id === "string"
    ? { id: el.id, by: map.get("by") === "person" ? "person" : "agent" }
    : null;
};

/** The canvas elements a deep event on `elements` added or changed. */
const elementsIn = (
  elements: YArray<YMap<unknown>>,
  events: YEvent<AbstractType<unknown>>[]
): { id: string; by: CanvasAuthor }[] =>
  events
    .flatMap((event) =>
      event.target === elements
        ? [...event.changes.added].flatMap(
            (item) => item.content.getContent() as unknown[]
          )
        : [event.target]
    )
    .flatMap((map) => {
      const element = map instanceof YMap ? elementOf(map) : null;
      return element ? [element] : [];
    });

export const createArtifactDocs = (deps: {
  /** A page's `state` changed at `keys` (a pick, a note), by anyone: its project's Decisions tab hears of it. */
  changed?: (id: string) => void;
  db: ArtifactsDb;
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
    if (deps.db.updateCount(id) >= COMPACT_EVERY) {
      deps.db.compact(id, encodeStateAsUpdate(entry.doc));
    }
    if (changed.keys.length > 0) {
      deps.changed?.(id);
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
    const elements = elementsOf(doc);
    for (const update of deps.db.updates(id)) {
      applyUpdate(doc, update, "load");
    }
    const entry: Loaded = { doc, clients: new Set() };
    // What a transaction changed, read before its update is emitted.
    let changed = {
      keys: [] as string[],
      elements: new Map<string, CanvasAuthor>(),
    };
    const state = doc.getMap("state") as unknown as AbstractType<
      YEvent<AbstractType<unknown>>
    >;
    // The elements a transaction added or changed, heard before its
    // `afterTransaction` (Yjs calls observers first).
    let touched = new Map<string, CanvasAuthor>();
    elements.observeDeep((events) => {
      for (const element of elementsIn(elements, events)) {
        touched.set(element.id, element.by);
      }
    });
    doc.on("afterTransaction", (transaction) => {
      changed = {
        keys: [...(transaction.changed.get(state) ?? [])].filter(
          (key): key is string => key !== null
        ),
        elements: touched,
      };
      touched = new Map();
    });
    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin !== "load") {
        keep(id, entry, update, origin, changed);
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
    screens: (id) =>
      [...(loaded.get(id)?.clients ?? [])].filter((client) => client.screen)
        .length,
    snapshot: (id) =>
      Buffer.from(encodeStateAsUpdate(load(id).doc)).toString("base64"),
    transact: (id, origin, change) => {
      const { doc } = load(id);
      doc.transact(() => change(doc), origin);
    },
  };
};
