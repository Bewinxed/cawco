/**
 * The y-websocket protocol (y-protocols/sync) for one artifact's doc, on the
 * preview listener at `/__cawco/artifact/<id>` (preview.ts), and the
 * person's send beside it at `/__cawco/artifact/<id>/send`. Sync only:
 * awareness, auth and awareness queries are read and ignored, so a client
 * keeps its socket fresh with its own resync (`resyncInterval`).
 *
 * A page's client may write the doc's `state`, within the bridge's bounds
 * (core `choiceEntryProblem`), the same the pane checks before it writes. A
 * canvas's screen may write its `elements` and `files`, its pen mode in
 * `meta`, and its claims and results on the agent's `requests`, within the
 * canvas's bounds (core `CANVAS_LIMITS`). Either may write the person's ink,
 * its moved groups and its pins (`ink`, `moved`, `pins`), within core
 * `INK_LIMITS`. An update that breaks
 * them is not applied: the socket is closed with {@link REFUSED} and the
 * reason, and the client joins again from the hub's doc.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ArtifactChoices,
  CHOICE_LIMITS,
  choiceEntryProblem,
} from "@cawco/core";
import { CANVAS_LIMITS } from "@cawco/core/canvas";
import { inkProblem } from "@cawco/core/ink";
import type { ServerWebSocket } from "bun";
import { createDecoder, readVarUint, readVarUint8Array } from "lib0/decoding";
import {
  createEncoder,
  type Encoder,
  toUint8Array,
  writeVarUint,
} from "lib0/encoding";
import {
  messageYjsSyncStep1,
  messageYjsSyncStep2,
  messageYjsUpdate,
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
} from "y-protocols/sync";
import { applyUpdate, Doc, encodeStateAsUpdate, Map as YMap } from "yjs";
import {
  type ArtifactClient,
  type ArtifactDocs,
  elementsOf,
  MAPS,
} from "./docs";
import { ArtifactRefusal } from "./service";

/** y-websocket's sync message type (its server's `messageSync`). */
const MESSAGE_SYNC = 0;

/** The close code of an update the hub would not keep. */
export const REFUSED = 4400;

/** What the listener keeps on an artifact's socket. */
export interface ArtifactSocket {
  artifactId: string;
  /** The origin its updates are applied under, so they are not sent back to it. */
  origin?: { client: ArtifactClient };
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

/** The keys of a canvas's `meta` its screen keeps: Excalidraw's pen mode, once a pen touched it. */
const PEN_KEYS = new Set(["penMode", "penDetected"]);

/** A request's keys a screen writes: its claim (`claim-<clientID>`) and the result. */
const SCREEN_REQUEST_KEY = /^(claim-\d+|result)$/;

/** Why a screen's change to a canvas's `requests` may not be kept, or null. */
const requestsProblem = (
  before: YMap<YMap<unknown>>,
  after: YMap<YMap<unknown>>
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
      if (
        !(SCREEN_REQUEST_KEY.test(key) || same(request.get(key), was.get(key)))
      ) {
        return `A screen changes only a request's claim and result, not its ${key}.`;
      }
    }
  }
  return null;
};

/** Why a screen's change to a canvas's `meta` may not be kept: it keeps its pen mode there, and nothing else. */
const metaProblem = (
  before: YMap<unknown>,
  after: YMap<unknown>
): string | null => {
  for (const key of new Set([...after.keys(), ...before.keys()])) {
    const value = after.get(key);
    if (!PEN_KEYS.has(key)) {
      if (!same(value, before.get(key))) {
        return "A screen keeps only penMode and penDetected in a canvas's meta.";
      }
    } else if (!(value === undefined || typeof value === "boolean")) {
      return `${key} is true or false.`;
    }
  }
  return null;
};

/** Why one entry of a canvas's elements is not one: a map of `el` (an element with its id), `pos`, and `by` when it says who. */
const entryProblem = (entry: unknown): string | null => {
  if (!(entry instanceof YMap)) {
    return "An element is a map of el, pos and by.";
  }
  const el = entry.get("el") as { id?: unknown } | null | undefined;
  if (
    !(
      el &&
      typeof el === "object" &&
      typeof el.id === "string" &&
      typeof entry.get("pos") === "string"
    )
  ) {
    return "An element is a map of el, an Excalidraw element with its id, and pos.";
  }
  const by = entry.get("by");
  return by === undefined || by === "person" || by === "agent"
    ? null
    : "An element's by is person or agent.";
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

/** The maps a person's ink writes, on any artifact (core ink.ts). */
const INK_MAPS = ["ink", "moved", "pins"];

/** Why the ink, moved groups and pins in `trial` may not be kept; null when they may. */
const inkMapsProblem = (trial: Doc): string | null =>
  inkProblem(
    [...trial.getMap("ink").entries()],
    [...trial.getMap("moved").entries()],
    [...trial.getMap("pins").entries()]
  );

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
    metaProblem(doc.getMap("meta"), trial.getMap("meta")) ??
    elements
      .toArray()
      .map(entryProblem)
      .find((problem) => problem !== null) ??
    filesProblem(doc.getMap("files"), trial.getMap("files")) ??
    requestsProblem(
      doc.getMap("requests") as YMap<YMap<unknown>>,
      trial.getMap("requests") as YMap<YMap<unknown>>
    ) ??
    inkMapsProblem(trial)
  );
};

/** Why `trial`'s state, `doc`'s after a person's update, may not be kept; null when it may. */
const stateProblem = (doc: Doc, trial: Doc): string | null => {
  if (doc.getMap("meta").get("kind") === "canvas") {
    return canvasProblem(doc, trial);
  }
  for (const name of MAPS) {
    if (
      !(
        name === "state" ||
        INK_MAPS.includes(name) ||
        sameMap(trial.getMap(name), doc.getMap(name))
      )
    ) {
      return `A page changes its artifact's state and ink only, not its ${name}.`;
    }
  }
  const ink = inkMapsProblem(trial);
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
  const before = doc.getMap("state");
  for (const [key, value] of state.entries()) {
    if (JSON.stringify(value) !== JSON.stringify(before.get(key))) {
      const problem = choiceEntryProblem(key, value);
      if (problem) {
        return problem;
      }
    }
  }
  return null;
};

/** Why `update` from a person's client may not be applied to `doc`, or null. */
export const updateProblem = (doc: Doc, update: Uint8Array): string | null => {
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
  /^\/__cawco\/artifact\/([0-9a-f-]{36})(\/send|\/picture)?$/;

/** Where a canvas's latest picture is kept: its folder under the artifacts' root. */
export const picturePath = (root: string, artifactId: string): string =>
  join(root, artifactId, "picture.png");

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * A canvas's screen posts its picture (`POST …/picture`, a PNG; empty when
 * the canvas holds nothing): the hub keeps the latest as a file and stamps
 * `meta.pictureAt`, what `artifact_read(png: true)` and the export answer.
 */
export const artifactPicture =
  (root: string, docs: ArtifactDocs) =>
  async (request: Request, artifactId: string): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response("A picture is a POST.", {
        status: 405,
        headers: { allow: "POST" },
      });
    }
    if (docs.doc(artifactId).getMap("meta").get("kind") !== "canvas") {
      return new Response("Only a canvas keeps a picture.", { status: 409 });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.length > CANVAS_LIMITS.pictureBytes) {
      return new Response(
        `A picture is at most ${CANVAS_LIMITS.pictureBytes / 1024 / 1024} MB.`,
        { status: 413 }
      );
    }
    const path = picturePath(root, artifactId);
    if (body.length === 0) {
      await rm(path, { force: true });
    } else {
      if (!PNG_SIGNATURE.every((byte, i) => body[i] === byte)) {
        return new Response("A picture is a PNG.", { status: 415 });
      }
      await mkdir(join(root, artifactId), { recursive: true });
      await writeFile(path, body);
    }
    docs.transact(artifactId, "hub", (doc) =>
      doc
        .getMap("meta")
        .set("pictureAt", body.length === 0 ? null : new Date().toISOString())
    );
    return new Response(null, { status: 204 });
  };

/**
 * The first claim on each of the agent's requests wins (Projects spec
 * §5.10): a screen claims one by writing `claim-<its clientID>`; the hub,
 * which takes every update in turn, names the first claimant it heard as
 * the request's `holder`, and only the holder converts.
 */
const holdClaims = (docs: ArtifactDocs, artifactId: string) => {
  const requests = docs.doc(artifactId).getMap("requests") as YMap<
    YMap<unknown>
  >;
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

/** The longest send body read: its text at the note's bound, as JSON. */
const SEND_BODY_MAX = 4 * CHOICE_LIMITS.note;

/**
 * The person sends (`cawco.send`, and the panel's Send): what the send
 * applies first (a project's setup page: its fleet choices and place), then
 * the session hears every pick as one message, at once, with the page's text
 * below them. `instanceId` already owns `artifactId` (the listener checked).
 */
export const artifactSend =
  (
    send: (
      instanceId: string,
      artifactId: string,
      text?: string
    ) => Promise<ArtifactChoices>
  ) =>
  async (
    request: Request,
    instanceId: string,
    artifactId: string
  ): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response("Send is a POST.", {
        status: 405,
        headers: { allow: "POST" },
      });
    }
    const body = await request.text();
    if (body.length > SEND_BODY_MAX) {
      return new Response(
        `A page's text stops at ${CHOICE_LIMITS.note} characters.`,
        { status: 413 }
      );
    }
    let text: unknown;
    try {
      text = body ? (JSON.parse(body) as { text?: unknown }).text : undefined;
    } catch {
      return new Response("Send takes JSON: { text? }.", { status: 400 });
    }
    if (
      text !== undefined &&
      !(typeof text === "string" && text.length <= CHOICE_LIMITS.note)
    ) {
      return new Response(
        `text is a string of at most ${CHOICE_LIMITS.note} characters.`,
        { status: 400 }
      );
    }
    try {
      return Response.json(await send(instanceId, artifactId, text?.trim()));
    } catch (error) {
      if (error instanceof ArtifactRefusal) {
        return new Response(error.message, { status: error.status });
      }
      throw error;
    }
  };

/** The listener's handlers for artifact sockets. */
export const artifactSocket = (docs: ArtifactDocs) => ({
  open(socket: ServerWebSocket<ArtifactSocket>) {
    const client: ArtifactClient = {
      screen: socket.data.screen,
      send: (update) =>
        socket.send(syncMessage((encoder) => writeUpdate(encoder, update))),
    };
    socket.data.origin = { client };
    const doc = docs.join(socket.data.artifactId, client);
    socket.send(syncMessage((encoder) => writeSyncStep1(encoder, doc)));
  },
  message(socket: ServerWebSocket<ArtifactSocket>, message: string | Buffer) {
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
    if (kind !== messageYjsSyncStep2 && kind !== messageYjsUpdate) {
      return;
    }
    const update = readVarUint8Array(decoder);
    const problem = updateProblem(doc, update);
    if (problem) {
      socket.close(REFUSED, problem.slice(0, 120));
      return;
    }
    applyUpdate(doc, update, origin);
    if (doc.getMap("meta").get("kind") === "canvas") {
      holdClaims(docs, artifactId);
    }
  },
  close(socket: ServerWebSocket<ArtifactSocket>) {
    if (socket.data.origin) {
      docs.leave(socket.data.artifactId, socket.data.origin.client);
    }
  },
});
