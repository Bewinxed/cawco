/**
 * The y-websocket protocol (y-protocols/sync) for one artifact's doc, on the
 * preview listener at `/__cawco/artifact/<id>` (preview.ts), and for a
 * page's store at `/__cawco/store/<scope>` ({@link storeSocket}); and the
 * person's send of their picks beside it at `/__cawco/artifact/<id>/send`,
 * and the page's pictures of their marks at `…/pictures`. Sync, and of
 * awareness only whether a main view's page is shown ({@link readShown}):
 * no awareness is relayed, and auth and awareness queries are ignored. A client
 * keeps its socket fresh with its own resync (`resyncInterval`), and the
 * hub with its {@link BEAT}, which a hidden tab's throttled timers can't
 * hold back (core doc-link.ts).
 *
 * A page's client may write the doc's `state`, within the bridge's bounds
 * (core `choiceEntryProblem`), the same the pane checks before it writes,
 * and never a pick's `settled` or `from` record, which the hub alone writes
 * (core `hubRecordWriteProblem`, artifacts/service.ts `settle` and `cite`). A
 * canvas's screen may write its `elements` and `files`, its pen mode in
 * `meta`, and its claims and results on the agent's `requests`, within the
 * canvas's bounds (core `CANVAS_LIMITS`). Either may write the person's ink,
 * its moved groups and its pins (`ink`, `moved`, `pins`), as core `ink.ts`
 * reads them. Each update is checked against what it wrote alone, on a
 * copy of the doc kept in step with it (gate.ts). An update that breaks
 * them is not applied, and its writer is told why on its socket, which
 * stays open ({@link refusal}): never a closed socket, so nothing the writer
 * holds is let go unsaid. Nothing more that socket sends is kept: Yjs takes
 * one client's updates in clock order only, so each later one would wait
 * on the refused one for ever. The writer goes on in a fresh doc (a new
 * client) on a socket of its own, its refused writes kept aside.
 */
import { rm } from "node:fs/promises";
import { CANVAS_LIMITS } from "@cawco/core/canvas";
import { ARTIFACT_GONE } from "@cawco/core/doc-link";
import { getMeta, setMeta } from "@cawco/core/doc-meta";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { writeStateFile } from "@cawco/core/state-file";
import { problemResponse } from "elysia/error";
import { createDecoder, readVarUint, readVarUint8Array } from "lib0/decoding";
import {
  createEncoder,
  type Encoder,
  toUint8Array,
  writeVarUint,
  writeVarUint8Array,
} from "lib0/encoding";
import { writePermissionDenied } from "y-protocols/auth";
import { modifyAwarenessUpdate } from "y-protocols/awareness";
import {
  messageYjsSyncStep1,
  messageYjsSyncStep2,
  messageYjsUpdate,
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
} from "y-protocols/sync";
import { applyUpdate, type Doc, Map as YMap } from "yjs";
import type { StoreKey } from "../db/page-stores";
import type { ArtifactClient, ArtifactDocs } from "./docs";
import { picturePath } from "./page-store";
import type { PageStoresShape, StoreClient } from "./page-stores";

/** y-websocket's sync message type (its server's `messageSync`). */
const MESSAGE_SYNC = 0;

/** y-websocket's awareness message type (`messageAwareness`). */
const MESSAGE_AWARENESS = 1;

/**
 * The hub's beat to a joined client (docs.ts): an awareness update of no
 * clients, which y-websocket applies as nothing and answers with nothing,
 * but which is a message, so its no-message check hears the link alive.
 */
const BEAT = (() => {
  const encoder = createEncoder();
  writeVarUint(encoder, MESSAGE_AWARENESS);
  writeVarUint8Array(encoder, Uint8Array.of(0));
  return toUint8Array(encoder);
})();

/** y-websocket's auth message type (its client's `messageAuth`): a refusal rides on it. */
const MESSAGE_AUTH = 2;

/**
 * The hub's word that it would not keep an update, and why: y-protocols'
 * permission-denied message (auth.js `writePermissionDenied`) under
 * {@link MESSAGE_AUTH}, which a client reads with `readAuthMessage`.
 */
const refusal = (why: string): Uint8Array => {
  const encoder = createEncoder();
  writeVarUint(encoder, MESSAGE_AUTH);
  writePermissionDenied(encoder, why);
  return toUint8Array(encoder);
};

/** What the listener keeps on an artifact's socket. */
export interface ArtifactSocket {
  /**
   * A page in an agent's browser: a dashboard pane's link a `browser`
   * caller opened, or a preview's page opened with a session's pass
   * (`?viewer=agent` from the preview server). It writes no pick.
   */
  agent?: true;
  artifactId: string;
  /** The preview origin it joined on, by its key (preview.ts): none for a dashboard pane's link. */
  at?: string;
  /** The origin its updates are applied under, so they are not sent back to it. */
  origin?: { client: ArtifactClient };
  /** A page's main view, by the id its overlay joined with (`?placer=<id>` on its socket): {@link electPlacer} names one of them. */
  placer?: string;
  /**
   * The hub refused an update from it ({@link refusal}): nothing more it
   * sends is kept, as each would wait on the refused one; its writer goes
   * on from a socket of its own.
   */
  refused?: true;
  /** A canvas's host page, which converts the agent's writes (`?screen=1` on its socket). */
  screen: boolean;
}

/** A main view's id, as its overlay makes it (core comments model `newId`). */
const PLACER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/** The main view a socket's query names (`placer`), when it names one well. */
export const placerOf = (query: string | undefined): string | undefined =>
  query && PLACER_ID.test(query) ? query : undefined;

const syncMessage = (write: (encoder: Encoder) => void) => {
  const encoder = createEncoder();
  writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return toUint8Array(encoder);
};

/**
 * The listener's paths for an artifact: its doc's socket, the person's send
 * (`/send`), and a canvas's picture (`/picture`), on the page's own origin
 * as the overlay and the canvas's host page reach them.
 */
export const ARTIFACT_PATH =
  /^\/__cawco\/artifact\/([0-9a-f-]{36})(\/send|\/picture|\/pictures|\/canvas)?$/u;
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * A canvas's screen posts its picture (`POST …/picture`, a PNG; empty when
 * the canvas holds nothing): the hub keeps the latest as a file and stamps
 * `meta.pictureAt`, what `artifact_read(png: true)` and the export answer.
 */
export const artifactPicture =
  (root: string, docs: ArtifactDocs) =>
  async (request: Request, artifactId: string): Promise<Response> => {
    if (request.method !== "POST") {
      return problemResponse(
        { status: 405, code: "picture-post", detail: "A picture is a POST." },
        { allow: "POST" }
      );
    }
    if (getMeta(docs.doc(artifactId), "kind") !== "canvas") {
      return problemResponse({
        status: 409,
        code: "only-canvas-keeps-picture",
        detail: "Only a canvas keeps a picture.",
      });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    recordLimitReading("hub.canvas-picture-bytes", body.length);
    if (body.length > CANVAS_LIMITS.pictureBytes) {
      return problemResponse({
        status: 413,
        code: "picture-most-mb",
        detail: `A picture is at most ${CANVAS_LIMITS.pictureBytes / 1024 / 1024} MB.`,
      });
    }
    const path = picturePath(root, artifactId);
    if (body.length === 0) {
      await rm(path, { force: true });
    } else {
      if (!PNG_SIGNATURE.every((byte, i) => body[i] === byte)) {
        return problemResponse({
          status: 415,
          code: "picture-png",
          detail: "A picture is a PNG.",
        });
      }
      await writeStateFile(path, body);
    }
    docs.transact(artifactId, "hub", (doc) =>
      setMeta(
        doc,
        "pictureAt",
        body.length === 0 ? null : new Date().toISOString()
      )
    );
    return new Response(null, { status: 204 });
  };

/**
 * Which screen's socket each claim came in on, by artifact: a holder is a
 * screen while it stays joined ({@link releaseClaims}).
 */
const claimedOn = new Map<string, Map<string, ArtifactClient>>();

/** The claims on unanswered requests that no socket has said yet, said now by `client`'s. */
const noteClaims = (
  docs: ArtifactDocs,
  artifactId: string,
  client: ArtifactClient
) => {
  const requests = docs.doc(artifactId).getMap<YMap<unknown>>("requests");
  let mine = claimedOn.get(artifactId);
  for (const request of requests.values()) {
    if (!(request instanceof YMap) || request.get("result") !== undefined) {
      continue;
    }
    for (const key of request.keys()) {
      if (key.startsWith("claim-") && !mine?.has(key)) {
        mine ??= new Map();
        mine.set(key, client);
      }
    }
  }
  if (mine) {
    claimedOn.set(artifactId, mine);
  }
};

/**
 * A screen's socket closed: its claims on requests still unanswered are
 * taken off, the holder among them too, and the claims left (another
 * screen's, or the next one a screen writes) elect a holder again
 * ({@link holdClaims}). A holder that left never answers: kept, the agent's
 * write waited out `convertMs` and was refused while another screen stood
 * joined.
 */
const releaseClaims = (
  docs: ArtifactDocs,
  artifactId: string,
  client: ArtifactClient
) => {
  const mine = claimedOn.get(artifactId);
  const gone = [...(mine?.entries() ?? [])]
    .filter(([, by]) => by === client)
    .map(([key]) => key);
  if (!mine || gone.length === 0) {
    return;
  }
  for (const key of gone) {
    mine.delete(key);
  }
  if (mine.size === 0) {
    claimedOn.delete(artifactId);
  }
  const requests = docs.doc(artifactId).getMap<YMap<unknown>>("requests");
  docs.transact(artifactId, "hub", () => {
    for (const request of requests.values()) {
      if (!(request instanceof YMap) || request.get("result") !== undefined) {
        continue;
      }
      const holder = request.get("holder");
      for (const key of gone) {
        if (request.has(key)) {
          request.delete(key);
          if (holder === key.slice("claim-".length)) {
            request.delete("holder");
          }
        }
      }
    }
  });
  holdClaims(docs, artifactId);
};

/**
 * The first claim on each of the agent's requests wins (Projects spec
 * §5.10): a screen claims one by writing `claim-<its page's id>`; the hub,
 * which takes every update in turn, names the first claimant it heard as
 * the request's `holder`, and only the holder converts. One whose screen
 * leaves before answering is let go ({@link releaseClaims}).
 */
const holdClaims = (docs: ArtifactDocs, artifactId: string) => {
  const requests = docs.doc(artifactId).getMap<YMap<unknown>>("requests");
  const claimed = [...requests.values()].filter(
    (request) =>
      request instanceof YMap &&
      request.get("holder") === undefined &&
      [...request.keys()].some((key) => key.startsWith("claim-"))
  );
  if (claimed.length === 0) {
    return;
  }
  docs.transact(artifactId, "hub", () => {
    for (const request of claimed) {
      const [first] = [...request.keys()].filter((key) =>
        key.startsWith("claim-")
      );
      request.set("holder", first.slice("claim-".length));
    }
  });
};

/**
 * The one main view of a page or a sheet that writes where its marks stand
 * (core `DocMeta.placer`): a view that can place them now, its page shown
 * (Page Visibility: a hidden tab draws nothing until it is shown again). The
 * one named stays while it stays joined and shown, or while no view is
 * shown; else the first shown view joined of those joined now is named,
 * and with none shown, the first joined. Two views of one page read the
 * page each at its own width, scheme and ids, and both writing what they
 * read wrote the pins back and forth; the hub hears every join, leave and
 * change of shown in turn, so it names one without a race. Nothing is
 * written while the one named stands, nor when no main view is joined: the
 * next to join is named then.
 */
const electPlacer = (docs: ArtifactDocs, artifactId: string) => {
  const joined = docs.placers(artifactId);
  const shown = joined.filter((view) => view.shown);
  const named = getMeta(docs.doc(artifactId), "placer");
  const among = shown.length > 0 ? shown : joined;
  const [first] = among;
  if (first === undefined || among.some((view) => view.id === named)) {
    return;
  }
  docs.transact(artifactId, "hub", (doc) => setMeta(doc, "placer", first.id));
};

/**
 * Whether a main view's page is shown, as an awareness message from its
 * socket says (y-websocket sends its own state on joining and on each
 * change: overlay doc-worker.ts sets `shown` from the page's
 * `visibilityState`); undefined when it says nothing of it. Read with
 * y-protocols' own decoder of an awareness update.
 */
const readShown = (message: Buffer): boolean | undefined => {
  const decoder = createDecoder(new Uint8Array(message));
  if (readVarUint(decoder) !== MESSAGE_AWARENESS) {
    return;
  }
  let shown: boolean | undefined;
  modifyAwarenessUpdate(readVarUint8Array(decoder), (state: unknown) => {
    if (
      typeof state === "object" &&
      state !== null &&
      "shown" in state &&
      typeof state.shown === "boolean"
    ) {
      ({ shown } = state);
    }
    return state;
  });
  return shown;
};

/**
 * One update from a person's client, applied to artifact `artifactId`'s
 * doc as `origin`'s within the bounds (see the top): from its socket, or
 * carried by its Send. Why it isn't, or null once it is.
 */
const takeUpdate = (
  docs: ArtifactDocs,
  artifactId: string,
  update: Uint8Array,
  origin: { client: ArtifactClient } | undefined
): string | null => {
  const why = docs.problem(artifactId, update, origin?.client.agent === true);
  if (why) {
    return why;
  }
  const doc = docs.doc(artifactId);
  applyUpdate(doc, update, origin);
  if (getMeta(doc, "kind") === "canvas") {
    if (origin?.client.screen) {
      noteClaims(docs, artifactId, origin.client);
    }
    holdClaims(docs, artifactId);
  }
  return null;
};

/**
 * A Send's carried writes (core `SendBody.writes`, base64) applied to
 * artifact `artifactId`'s doc as the socket's would be ({@link takeUpdate}),
 * one person's change by a client no socket holds, so every joined client
 * hears the update, the page's own socket among them, which may already
 * hold it. Why they aren't, or null once they are: every Send's route
 * (the page's, the panel's, the Decisions tab's) applies them before it
 * reads the picks.
 */
export const takeSentWrites = (
  docs: ArtifactDocs,
  artifactId: string,
  writes: string
): string | null =>
  takeUpdate(docs, artifactId, new Uint8Array(Buffer.from(writes, "base64")), {
    client: {
      beat: () => undefined,
      close: () => undefined,
      screen: false,
      send: () => undefined,
    },
  });

/**
 * What of Bun's `ServerWebSocket` the artifact socket's handlers read: its
 * data, a send and a close. A panel's doc socket, which Elysia holds, is
 * handed in as these alone (preview-routes.ts).
 */
export interface ArtifactSocketEnd {
  close: (code?: number, reason?: string) => void;
  readonly data: ArtifactSocket;
  send: (message: Uint8Array) => void;
}

/**
 * One y-websocket message from a client of `doc`: its sync step 1 answered
 * with the hub's step 2, its step 2 or update handed to `take`, and an
 * update `take` refuses told to it as a {@link refusal}, after which nothing
 * more it sends is kept (see the top). Awareness, auth and awareness
 * queries are read and ignored.
 */
const readSync = (
  message: Buffer,
  doc: Doc,
  socket: {
    readonly data: { refused?: true };
    send: (message: Uint8Array) => void;
  },
  take: (update: Uint8Array) => string | null
): void => {
  const decoder = createDecoder(new Uint8Array(message));
  if (readVarUint(decoder) !== MESSAGE_SYNC) {
    return;
  }
  const kind = readVarUint(decoder);
  if (kind === messageYjsSyncStep1) {
    const vector = readVarUint8Array(decoder);
    socket.send(syncMessage((encoder) => writeSyncStep2(encoder, doc, vector)));
    return;
  }
  if (
    (kind !== messageYjsSyncStep2 && kind !== messageYjsUpdate) ||
    socket.data.refused
  ) {
    return;
  }
  const why = take(readVarUint8Array(decoder));
  if (why) {
    socket.data.refused = true;
    socket.send(refusal(why));
  }
};

/** The listener's handlers for artifact sockets. */
export const artifactSocket = (docs: ArtifactDocs) => ({
  open(socket: ArtifactSocketEnd) {
    const client: ArtifactClient = {
      beat: () => socket.send(BEAT),
      // The artifact was removed: core ARTIFACT_GONE, on which a device lets its copy go.
      close: () => socket.close(ARTIFACT_GONE, "This artifact was removed."),
      screen: socket.data.screen,
      ...(socket.data.agent ? { agent: true as const } : {}),
      ...(socket.data.placer
        ? { placer: { id: socket.data.placer, shown: true } }
        : {}),
      send: (update) =>
        socket.send(syncMessage((encoder) => writeUpdate(encoder, update))),
    };
    socket.data.origin = { client };
    const doc = docs.join(socket.data.artifactId, client);
    if (client.placer) {
      electPlacer(docs, socket.data.artifactId);
    }
    socket.send(syncMessage((encoder) => writeSyncStep1(encoder, doc)));
  },
  message(socket: ArtifactSocketEnd, message: string | Buffer) {
    if (typeof message === "string") {
      return;
    }
    const { artifactId, origin } = socket.data;
    const view = origin?.client.placer;
    const shown = view ? readShown(message) : undefined;
    if (view && shown !== undefined) {
      if (shown !== view.shown) {
        view.shown = shown;
        electPlacer(docs, artifactId);
      }
      return;
    }
    readSync(message, docs.doc(artifactId), socket, (update) =>
      takeUpdate(docs, artifactId, update, origin)
    );
  },
  close(socket: ArtifactSocketEnd, code?: number) {
    if (socket.data.origin) {
      docs.leave(socket.data.artifactId, socket.data.origin.client);
      // A removed artifact's doc is let go with its sockets: nothing to elect.
      if (socket.data.screen && code !== ARTIFACT_GONE) {
        releaseClaims(docs, socket.data.artifactId, socket.data.origin.client);
      }
      if (socket.data.placer && code !== ARTIFACT_GONE) {
        electPlacer(docs, socket.data.artifactId);
      }
    }
  },
});

/**
 * A page's store's socket on its own preview origin
 * (`/__cawco/store/<scope>`): what y-websocket's `WebsocketProvider` joins
 * with that origin's `/__cawco/store` as its server and the scope as its
 * room (page-stores.ts).
 */
export const STORE_PATH = /^\/__cawco\/store\/(artifact|project)$/u;

/** What the listener keeps on a store's socket. */
export interface StoreSocket {
  /** The client it joined as, once it has. */
  client?: StoreClient;
  /** The hub refused an update from it: nothing more it sends is kept (see the top). */
  refused?: true;
  store: StoreKey;
}

/** What of a socket a store's handlers read (preview-control.ts hands Elysia's in as these). */
export interface StoreSocketEnd {
  close: (code?: number, reason?: string) => void;
  readonly data: StoreSocket;
  send: (message: Uint8Array) => void;
}

/** The listener's handlers for pages' store sockets: y-websocket's protocol, sync only, as an artifact's. */
export const storeSocket = (stores: PageStoresShape) => ({
  open(socket: StoreSocketEnd) {
    const client: StoreClient = {
      beat: () => socket.send(BEAT),
      close: () =>
        socket.close(
          ARTIFACT_GONE,
          "This page's design or project was removed."
        ),
      send: (update) =>
        socket.send(syncMessage((encoder) => writeUpdate(encoder, update))),
    };
    socket.data.client = client;
    const doc = stores.join(socket.data.store, client);
    socket.send(syncMessage((encoder) => writeSyncStep1(encoder, doc)));
  },
  message(socket: StoreSocketEnd, message: string | Buffer) {
    const { client, store } = socket.data;
    if (typeof message === "string" || !client) {
      return;
    }
    readSync(message, stores.doc(store), socket, (update) =>
      stores.take(store, update, client)
    );
  },
  close(socket: StoreSocketEnd) {
    if (socket.data.client) {
      stores.leave(socket.data.store, socket.data.client);
    }
  },
});

export const routeOf = (id: string) => `/__cawco/artifact/${id}`;
