/**
 * The y-websocket protocol (y-protocols/sync) for one artifact's doc, on the
 * preview listener at `/__cawco/artifact/<id>` (preview.ts), and the
 * person's send of their picks beside it at `/__cawco/artifact/<id>/send`,
 * and the page's pictures of their marks at `…/pictures`. Sync only:
 * awareness, auth and awareness queries are read and ignored. A client
 * keeps its socket fresh with its own resync (`resyncInterval`), and the
 * hub with its {@link BEAT}, which a hidden tab's throttled timers can't
 * hold back (core doc-link.ts).
 *
 * A page's client may write the doc's `state`, within the bridge's bounds
 * (core `choiceEntryProblem`), the same the pane checks before it writes,
 * and never a pick's `settled` record, which the hub alone writes (core
 * `settledWriteProblem`, artifacts/service.ts `settle`). A
 * canvas's screen may write its `elements` and `files`, its pen mode in
 * `meta`, and its claims and results on the agent's `requests`, within the
 * canvas's bounds (core `CANVAS_LIMITS`). Either may write the person's ink,
 * its moved groups and its pins (`ink`, `moved`, `pins`), within core
 * `INK_LIMITS`. An update that breaks
 * them is not applied, and its writer is told why on its socket, which
 * stays open ({@link refusal}): never a closed socket, so nothing the writer
 * holds is let go unsaid. Nothing more that socket sends is kept: Yjs takes
 * one client's updates in clock order only, so each later one would wait
 * on the refused one for ever. The writer goes on in a fresh doc (a new
 * client) on a socket of its own, its refused writes kept aside.
 */
import { rm } from "node:fs/promises";
import { CANVAS_LIMITS } from "@cawco/core/canvas";
import {
  CHOICE_LIMITS,
  type ChoiceEntry,
  choiceEntryProblem,
  isChoiceEntry,
  settledWriteProblem,
} from "@cawco/core/choices";
import {
  goneProblem,
  heldNoteProblem,
  pinsProblem,
  seenProblem,
} from "@cawco/core/comments/validate";
import { ARTIFACT_GONE } from "@cawco/core/doc-link";
import { MIRRORED_MAPS } from "@cawco/core/doc-maps";
import {
  type ClientMetaKey,
  docMeta,
  getMeta,
  type MetaMap,
  metaWriter,
  setMeta,
} from "@cawco/core/doc-meta";
import { inkProblem } from "@cawco/core/ink";
import { writeStateFile } from "@cawco/core/state-file";
import { TUNED_MAP, tunedProblem } from "@cawco/core/tuned";
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
import {
  messageYjsSyncStep1,
  messageYjsSyncStep2,
  messageYjsUpdate,
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
} from "y-protocols/sync";
import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  type Array as YArray,
  Map as YMap,
} from "yjs";
import {
  type ArtifactClient,
  type ArtifactDocs,
  elementIdOf,
  elementsOf,
  MAPS,
} from "./docs";
import { picturePath } from "./page-store";

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
  artifactId: string;
  /** The preview origin it joined on, by its key (preview.ts): none for a dashboard pane's link. */
  at?: string;
  /** The origin its updates are applied under, so they are not sent back to it. */
  origin?: { client: ArtifactClient };
  /**
   * The hub refused an update from it ({@link refusal}): nothing more it
   * sends is kept, as each would wait on the refused one; its writer goes
   * on from a socket of its own.
   */
  refused?: true;
  /** A canvas's host page, which converts the agent's writes (`?screen=1` on its socket). */
  screen: boolean;
}

const syncMessage = (write: (encoder: Encoder) => void) => {
  const encoder = createEncoder();
  writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return toUint8Array(encoder);
};

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const sameMap = (a: YMap<unknown>, b: YMap<unknown>): boolean =>
  a.size === b.size &&
  [...a.entries()].every(([key, value]) => same(value, b.get(key)));

/** A request's keys a screen writes: its claim (`claim-<its page's number>`, canvas-host scene.ts `PAGE_CLAIM`) and the result. */
const SCREEN_REQUEST_KEY = /^(claim-\d+|result)$/u;

/** Why a screen's change to a canvas's `requests` may not be kept, or null. */
const requestsProblem = (
  before: YMap<unknown>,
  after: YMap<unknown>
): string | null => {
  if (!same([...before.keys()].sort(), [...after.keys()].sort())) {
    return "A screen claims or answers the agent's requests; it does not add or remove them.";
  }
  for (const [id, request] of after.entries()) {
    const was = before.get(id);
    if (!(request instanceof YMap && was instanceof YMap)) {
      return "A request is the hub's map.";
    }
    const keys = new Set([...request.keys(), ...was.keys()]);
    for (const key of keys) {
      if (!(
        SCREEN_REQUEST_KEY.test(key) || same(request.get(key), was.get(key))
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
const metaProblem = (
  before: MetaMap,
  after: MetaMap,
  canvas: boolean
): string | null => {
  const was = new Map(before.entries());
  const now = new Map(after.entries());
  for (const key of new Set([...now.keys(), ...was.keys()])) {
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
const madeProblem = (
  before: YArray<YMap<unknown>>,
  after: YArray<YMap<unknown>>
): string | null => {
  const made = new Map(
    before.toArray().map((entry) => [elementIdOf(entry), entry.get("made")])
  );
  const changed = after.toArray().find((entry) => {
    const was = made.get(elementIdOf(entry));
    return was !== undefined && entry.get("made") !== was;
  });
  return changed ? "Who made an element never changes." : null;
};

/** Why a canvas's image files after a screen's change may not be kept. */
const filesProblem = (
  before: YMap<unknown>,
  after: YMap<unknown>
): string | null => {
  if (after.size > CANVAS_LIMITS.files) {
    return `A canvas keeps at most ${CANVAS_LIMITS.files} files.`;
  }
  const large = [...after.entries()].some(
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

/** Why the ink, moved groups, pins, deleted pins and looks in `trial`, `doc` after a person's update, may not be kept; null when they may. */
const inkMapsProblem = (doc: Doc, trial: Doc): string | null => {
  const gone = new Map(trial.getMap("gone").entries());
  return (
    inkProblem(
      [...trial.getMap("ink").entries()],
      [...trial.getMap("moved").entries()]
    ) ??
    goneProblem(new Map(doc.getMap("gone").entries()), gone) ??
    pinsProblem(doc, trial) ??
    seenProblem(new Map(trial.getMap("seen").entries()))
  );
};

/** Why `trial`, a canvas's doc after its screen's update, may not be kept; null when it may. */
const canvasProblem = (doc: Doc, trial: Doc): string | null => {
  const untouched = MAPS.filter(
    (name) => !["meta", "files", "requests", ...INK_MAPS].includes(name)
  ).find((name) => !sameMap(trial.getMap(name), doc.getMap(name)));
  if (untouched) {
    return `A canvas's screen changes its elements, not its ${untouched}.`;
  }
  const elements = elementsOf(trial);
  if (elements.length > CANVAS_LIMITS.elements) {
    return `A canvas keeps at most ${CANVAS_LIMITS.elements} elements.`;
  }
  return (
    metaProblem(docMeta(doc), docMeta(trial), true) ??
    elements
      .toArray()
      .map(entryProblem)
      .find((why) => why !== null) ??
    madeProblem(elementsOf(doc), elements) ??
    filesProblem(doc.getMap("files"), trial.getMap("files")) ??
    requestsProblem(doc.getMap("requests"), trial.getMap("requests")) ??
    inkMapsProblem(doc, trial)
  );
};

/** Why `trial`'s state, `doc`'s after a person's update, may not be kept; null when it may. */
const stateProblem = (doc: Doc, trial: Doc): string | null => {
  if (getMeta(doc, "kind") === "canvas") {
    return canvasProblem(doc, trial);
  }
  const component = getMeta(doc, "kind") === "component";
  for (const name of MAPS) {
    if (!(
      name === "state" ||
      name === "meta" ||
      INK_MAPS.includes(name) ||
      (component && name === TUNED_MAP) ||
      sameMap(trial.getMap(name), doc.getMap(name))
    )) {
      return `A page changes its artifact's state and ink only, not its ${name}.`;
    }
  }
  const ink =
    metaProblem(docMeta(doc), docMeta(trial), false) ??
    inkMapsProblem(doc, trial) ??
    (component ? tunedProblem([...trial.getMap(TUNED_MAP).entries()]) : null);
  if (ink) {
    return ink;
  }
  if (elementsOf(trial).length !== elementsOf(doc).length) {
    return "A page changes its artifact's state only, not its elements.";
  }
  const state = trial.getMap("state");
  if (state.size > CHOICE_LIMITS.perArtifact) {
    return `An artifact keeps at most ${CHOICE_LIMITS.perArtifact} ids.`;
  }
  // What the doc keeps is a choice entry: this check let it in.
  const before = doc.getMap<ChoiceEntry>("state");
  for (const [key, value] of state.entries()) {
    if (JSON.stringify(value) !== JSON.stringify(before.get(key))) {
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

/** Why `update` from a person's client may not be applied to `doc`, or null. */
const updateProblem = (doc: Doc, update: Uint8Array): string | null => {
  const trial = new Doc();
  try {
    applyUpdate(trial, encodeStateAsUpdate(doc));
    applyUpdate(trial, update);
    return stateProblem(doc, trial);
  } catch {
    return "That is not a Yjs update.";
  } finally {
    trial.destroy();
  }
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
  const doc = docs.doc(artifactId);
  const why = updateProblem(doc, update);
  if (why) {
    return why;
  }
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

/** The listener's handlers for artifact sockets. */
export const artifactSocket = (docs: ArtifactDocs) => ({
  open(socket: ArtifactSocketEnd) {
    const client: ArtifactClient = {
      beat: () => socket.send(BEAT),
      // The artifact was removed: core ARTIFACT_GONE, on which a device lets its copy go.
      close: () => socket.close(ARTIFACT_GONE, "This artifact was removed."),
      screen: socket.data.screen,
      send: (update) =>
        socket.send(syncMessage((encoder) => writeUpdate(encoder, update))),
    };
    socket.data.origin = { client };
    const doc = docs.join(socket.data.artifactId, client);
    socket.send(syncMessage((encoder) => writeSyncStep1(encoder, doc)));
  },
  message(socket: ArtifactSocketEnd, message: string | Buffer) {
    if (typeof message === "string") {
      return;
    }
    const { artifactId, origin } = socket.data;
    const decoder = createDecoder(new Uint8Array(message));
    if (readVarUint(decoder) !== MESSAGE_SYNC) {
      return;
    }
    const doc = docs.doc(artifactId);
    const kind = readVarUint(decoder);
    if (kind === messageYjsSyncStep1) {
      const vector = readVarUint8Array(decoder);
      socket.send(
        syncMessage((encoder) => writeSyncStep2(encoder, doc, vector))
      );
      return;
    }
    if (
      (kind !== messageYjsSyncStep2 && kind !== messageYjsUpdate) ||
      socket.data.refused
    ) {
      return;
    }
    const why = takeUpdate(
      docs,
      artifactId,
      readVarUint8Array(decoder),
      origin
    );
    if (why) {
      socket.data.refused = true;
      socket.send(refusal(why));
    }
  },
  close(socket: ArtifactSocketEnd, code?: number) {
    if (socket.data.origin) {
      docs.leave(socket.data.artifactId, socket.data.origin.client);
      // A removed artifact's doc is let go with its sockets: nothing to elect.
      if (socket.data.screen && code !== ARTIFACT_GONE) {
        releaseClaims(docs, socket.data.artifactId, socket.data.origin.client);
      }
    }
  },
});

export const routeOf = (id: string) => `/__cawco/artifact/${id}`;
