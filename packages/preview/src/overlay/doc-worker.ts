/**
 * The overlay's doc worker: the artifact's Yjs doc in a realm of its own,
 * so the page's holds no Yjs of CawCo's (doc-wire.ts). A previewed app that
 * imports Yjs loads its one copy, and Yjs's "Yjs was already imported"
 * never hears of ours; a page with none loads none.
 *
 * It holds the doc the hub keeps (Projects spec §5.10, D23), joined over
 * the y-websocket protocol on a socket the page opens for it (its
 * `WebSocket`, so the page's own patches and a probe's routes see it, as
 * they saw the overlay's socket on the page), the copy kept on the device
 * (y-indexeddb, per artifact, in the page's origin's IndexedDB), and the
 * sweep that keeps a deleted pin deleted (core comments.ts
 * `honourDeletions`). Every transaction's changes to the maps the page
 * reads go to its mirror (mirror.ts), and the page's writes come back as
 * batches of plain values. A canvas's host page, which runs a Yjs of its
 * own, takes the doc's whole state and its changes as bytes.
 *
 * Built into the overlay's bundle as text (preview proxy.ts
 * `bundleOverlay`), and started from it as a blob (artifact.ts).
 */

import { honourDeletions, lostWrites } from "@cawco/core/comments/model";
import {
  ARTIFACT_GONE,
  RESYNC_MS,
  reopenStalled,
  type ShownDocument,
  type StallWatch,
  watchSilence,
} from "@cawco/core/doc-link";
import { MIRRORED_MAPS } from "@cawco/core/doc-maps";
import { cutShort } from "@cawco/core/words/helpers";
import { IndexeddbPersistence } from "y-indexeddb";
import { readAuthMessage } from "y-protocols/auth";
import { messageAuth, WebsocketProvider } from "y-websocket";
import {
  AbstractType,
  applyUpdate,
  Doc,
  decodeStateVector,
  encodeStateAsUpdate,
  encodeStateVector,
  encodeStateVectorFromUpdate,
  type Transaction,
  type Map as YMap,
} from "yjs";
import type { ChangeOrigin, FromWorker, ToWorker, WriteOp } from "./doc-wire";

/** Attempts in a row that never opened, after which the link is said lost. */
const STALLS_LOST = 2;

const worker = globalThis as unknown as {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<ToWorker>) => void
  ) => void;
  postMessage: (message: FromWorker) => void;
};
const post = (message: FromWorker) => worker.postMessage(message);

/** The origins of the transactions the worker makes for the page. */
const PAGE = Symbol("page");
const SEED = Symbol("seed");
const REPLICA = Symbol("replica");

/** Whether the page is shown, as the page tells it: the silence watch reads it. */
const shownListeners = new Set<() => void>();
const shown: ShownDocument = {
  visibilityState: "visible",
  addEventListener: (_type, listener) => shownListeners.add(listener),
  removeEventListener: (_type, listener) => shownListeners.delete(listener),
};

// ---- The page's sockets ----------------------------------------------------

/** Each socket the page opened for the worker, by its number. */
const sockets = new Map<number, RelaySocket>();
let nextSocket = 0;

/**
 * A WebSocket whose connection the page holds (y-websocket's
 * `WebSocketPolyfill`): what y-websocket reads of one, its frames and
 * events carried by messages.
 */
class RelaySocket {
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  binaryType = "arraybuffer";
  readyState = 0;
  readonly id: number;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer | string }) => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(url: string, protocols?: string | string[]) {
    nextSocket += 1;
    this.id = nextSocket;
    sockets.set(this.id, this);
    post({
      type: "socket-new",
      id: this.id,
      url,
      protocols:
        protocols === undefined ? [] : ([] as string[]).concat(protocols),
    });
  }

  send(data: ArrayBuffer | string | Uint8Array): void {
    if (this.readyState === this.OPEN) {
      // A message's bytes are copied into one of their own as they go.
      post({
        type: "socket-send",
        id: this.id,
        data: data as ArrayBuffer | string | Uint8Array<ArrayBuffer>,
      });
    }
  }

  close(code?: number, reason?: string): void {
    if (this.readyState >= this.CLOSING) {
      return;
    }
    this.readyState = this.CLOSING;
    post({ type: "socket-close", id: this.id, code, reason });
  }

  /** What the page heard on it. */
  heard(message: ToWorker): void {
    if (message.type === "socket-open") {
      this.readyState = this.OPEN;
      this.onopen?.();
    } else if (message.type === "socket-message") {
      this.onmessage?.({ data: message.data });
    } else if (message.type === "socket-error") {
      this.onerror?.({ type: "error" });
    } else if (message.type === "socket-close") {
      this.readyState = this.CLOSED;
      sockets.delete(this.id);
      this.onclose?.({ code: message.code, reason: message.reason });
    }
  }
}

// ---- The doc ---------------------------------------------------------------

let doc = new Doc();
let generation = 0;
/** The page's last write batch applied to the doc. */
let seq = 0;
let provider: WebsocketProvider | null = null;
let quiet: StallWatch | null = null;
let kept: IndexeddbPersistence | null = null;
let joined: Extract<ToWorker, { type: "join" }> | null = null;
let replicating = false;
/**
 * What of the doc the hub is known to hold, as a state vector: the copy it
 * embedded in the page (`seed`) and every update it sent on the socket,
 * each client's clock the furthest either reached (the hub's doc holds
 * each client's updates in clock order, so it holds all below). The page's
 * own writes and the device's copy are never counted: the hub may lack them.
 */
let hubHolds = new Map<number, number>();

/** Update `update` came from the hub: what it holds reaches at least as far as it does. */
const heardFromHub = (update: Uint8Array) => {
  for (const [client, clock] of decodeStateVector(
    encodeStateVectorFromUpdate(update)
  )) {
    if (clock > (hubHolds.get(client) ?? 0)) {
      hubHolds.set(client, clock);
    }
  }
};

const originOf = (transaction: Transaction): ChangeOrigin => {
  const { origin } = transaction;
  if (origin === PAGE) {
    return "page";
  }
  if (origin === SEED) {
    return "seed";
  }
  if (origin === REPLICA) {
    return "replica";
  }
  if (kept && origin === kept) {
    return "kept";
  }
  return transaction.local ? "local" : "remote";
};

/** A map's value as the page holds it: plain data. */
const plain = (value: unknown): unknown =>
  value instanceof AbstractType ? value.toJSON() : value;

/** What one transaction changed of the mirrored maps (`named`, by their types): each key's value now, or its deletion. */
const changesOf = (
  transaction: Transaction,
  named: Map<unknown, { map: YMap<unknown>; name: string }>
) => {
  const set: Record<string, Record<string, unknown>> = {};
  const deleted: Record<string, string[]> = {};
  for (const [type, keys] of transaction.changed) {
    const mirrored = named.get(type);
    if (!mirrored) {
      continue;
    }
    const { map, name } = mirrored;
    for (const key of keys) {
      if (key === null) {
        continue;
      }
      if (map.has(key)) {
        set[name] ??= {};
        set[name][key] = plain(map.get(key));
      } else {
        deleted[name] ??= [];
        deleted[name].push(key);
      }
    }
  }
  return { set, deleted };
};

/** Every transaction on `own` that changed a mirrored map: its keys' values now, to the page. */
const watch = (own: Doc, at: number) => {
  honourDeletions(own);
  const named = new Map<unknown, { map: YMap<unknown>; name: string }>(
    MIRRORED_MAPS.map((name) => {
      const map = own.getMap(name);
      return [map, { map, name }];
    })
  );
  own.on("afterTransaction", (transaction: Transaction) => {
    if (own !== doc) {
      return;
    }
    const { set, deleted } = changesOf(transaction, named);
    if (Object.keys(set).length > 0 || Object.keys(deleted).length > 0) {
      post({
        type: "changes",
        generation: at,
        origin: originOf(transaction),
        seq,
        set,
        deleted,
      });
    }
  });
  own.on("update", (update: Uint8Array, origin: unknown) => {
    // y-websocket applies what the hub sends with its provider as the origin.
    if (
      own === doc &&
      (origin === SEED || origin instanceof WebsocketProvider)
    ) {
      heardFromHub(update);
    }
    if (replicating && own === doc && origin !== REPLICA) {
      post({ type: "replica", generation: at, update });
    }
  });
};
watch(doc, generation);

/** The doc's whole state for the page's replica, when it asked for it. */
const handReplica = () => {
  if (replicating) {
    post({ type: "replica", generation, update: encodeStateAsUpdate(doc) });
  }
};

/** The joined doc kept on the device from now on, and what the device kept of it merged in. */
const keepOnDevice = () => {
  if (!joined?.device) {
    post({ type: "stored" });
    return;
  }
  const own = new IndexeddbPersistence(joined.device, doc);
  kept = own;
  const loaded = () => {
    if (kept === own) {
      post({ type: "stored" });
    }
  };
  own.whenSynced.then(loaded);
  // A database that won't open gives nothing back: there is no copy to wait for.
  own._db.catch(loaded);
};

/** A fresh doc numbered `next` in place of the one held; the device keeps the old one's no longer. */
const replaceDoc = (next: number) => {
  quiet?.stop();
  quiet = null;
  provider?.destroy();
  provider = null;
  kept = null;
  // Its device copy lets go with it (y-indexeddb destroys on the doc's destroy).
  doc.destroy();
  doc = new Doc();
  hubHolds = new Map();
  generation = next;
  watch(doc, generation);
  handReplica();
};

const closedBecause = (
  host: string,
  event: { code: number; reason: string } | null
) =>
  event
    ? `Its link to ${host} closed (code ${event.code}${event.reason ? `: ${cutShort(event.reason, 80)}` : ""})`
    : `Its link to ${host} stopped answering`;

const connect = () => {
  if (!joined) {
    return;
  }
  const { params, room, url } = joined;
  const { host } = new URL(url);
  const own = new WebsocketProvider(url, room, doc, {
    disableBc: true,
    resyncInterval: RESYNC_MS,
    WebSocketPolyfill: RelaySocket as unknown as typeof WebSocket,
    params,
  });
  provider = own;
  post({ type: "connecting" });
  // An open socket silent for core `SILENT_MS` is lost now; the watch opens it again.
  quiet?.stop();
  const silence = watchSilence(
    own,
    () =>
      post({
        type: "lost",
        error: `Its link to ${host} stopped answering`,
        silent: true,
      }),
    shown
  );
  quiet = silence;
  // An attempt that never opens is tried again (core doc-link.ts); the
  // second in a row that never opened says the link is lost.
  const stalls = reopenStalled(own, (inRow) => {
    if (own === provider && inRow >= STALLS_LOST) {
      post({
        type: "lost",
        error: `Its link to ${host} didn't open`,
        silent: false,
      });
    }
  });
  own.on("sync", (isSynced: boolean) => {
    if (isSynced && own === provider) {
      // The hub's doc is in after a refusal: what of the person's the
      // refused doc held that it doesn't is the page's to keep aside.
      if (refusing) {
        const { copy, reason } = refusing;
        refusing = null;
        post({ type: "refused-writes", writes: lostWrites(copy, doc), reason });
        copy.destroy();
      }
      post({ type: "synced" });
    }
  });
  // The hub's word that it would not keep a write of the page's (hub
  // artifacts/sync.ts `refusal`, y-protocols' permission denied): its socket
  // stays, and nothing more this client sends is kept there.
  own.messageHandlers[messageAuth] = (_encoder, decoder) =>
    readAuthMessage(decoder, doc, (_doc, reason) => {
      if (own === provider) {
        // Out of y-websocket's own message handling first.
        queueMicrotask(() => refused(reason));
      }
    });
  own.on("connection-close", (event) => {
    if (own !== provider || stalls.reopening() || silence.reopening()) {
      return;
    }
    // The artifact was removed: nothing of it is kept on the device.
    if (event?.code === ARTIFACT_GONE) {
      kept?.clearData().catch(() => undefined);
      kept = null;
    }
    post({ type: "lost", error: closedBecause(host, event), silent: false });
  });
};

/**
 * What the page wrote the hub would not keep: once the hub's doc is in, the
 * page keeps aside every write of the person's it doesn't hold (core
 * `lostWrites`, said as `lost`), and the worker goes on from the
 * hub's doc in a fresh one, a new Yjs client on a socket of its own (Yjs
 * takes one client's updates in clock order only, so the old one's would
 * all wait on the refused write), the device's copy of the old one cleared
 * first so the refused write never comes back into it.
 */
/** A refusal's reason and a copy of the refused doc, until the hub's doc is in (core `lostWrites`). */
let refusing: { copy: Doc; reason: string } | null = null;
const refused = (reason: string) => {
  const refusedCopy = kept;
  const copy = new Doc();
  applyUpdate(copy, encodeStateAsUpdate(doc));
  refusing?.copy.destroy();
  refusing = { copy, reason };
  replaceDoc(generation + 1);
  post({ type: "refused", generation, reason });
  (refusedCopy?.clearData() ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => {
      if (provider === null) {
        keepOnDevice();
        connect();
      }
    });
};

/**
 * What the doc holds that the hub isn't known to ({@link hubHolds}), as one
 * update: the page's own writes, those the device's copy gave back, and the
 * doc's deletions (Yjs encodes a delete set whole). The page's write
 * batches reach the worker before the ask does, so the update holds every
 * pick the page shows.
 */
const unheardWrites = (): Uint8Array =>
  encodeStateAsUpdate(doc, encodeStateVector(hubHolds));

/** The page's writes, in one transaction, as plain values. */
const write = (ops: WriteOp[]) => {
  doc.transact(() => {
    for (const op of ops) {
      const map = doc.getMap(op.map);
      if ("deleted" in op) {
        map.delete(op.key);
      } else {
        map.set(op.key, op.value);
      }
    }
  }, PAGE);
};

worker.addEventListener("message", ({ data: message }) => {
  switch (message.type) {
    case "seed":
      try {
        applyUpdate(doc, message.update, SEED);
      } catch {
        // Not a Yjs update: the socket brings the doc instead.
      }
      return;
    case "join":
      joined = message;
      keepOnDevice();
      connect();
      return;
    case "replace":
      replaceDoc(message.generation);
      return;
    case "write":
      ({ seq } = message);
      write(message.ops);
      return;
    case "reconnect":
      provider?.disconnect();
      provider?.connect();
      return;
    case "writes":
      post({ type: "writes", id: message.id, update: unheardWrites() });
      return;
    case "shown":
      shown.visibilityState = message.visible ? "visible" : "hidden";
      for (const listener of shownListeners) {
        listener();
      }
      return;
    case "replicate":
      replicating = true;
      handReplica();
      return;
    case "replica-update":
      if (message.generation === generation) {
        applyUpdate(doc, message.update, REPLICA);
      }
      return;
    case "socket-open":
    case "socket-message":
    case "socket-close":
    case "socket-error":
      sockets.get(message.id)?.heard(message);
      return;
    default:
      return;
  }
});
