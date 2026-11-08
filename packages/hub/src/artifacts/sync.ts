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
import { join } from "node:path";
import { CANVAS_LIMITS } from "@cawco/core/canvas";
import {
  type ArtifactChoices,
  CHOICE_LIMITS,
  type ChoiceEntry,
  choiceEntryProblem,
  settledWriteProblem,
} from "@cawco/core/choices";
import {
  COMMENT_LIMITS,
  isSendControl,
  type MarkPictures,
  SEND_CONTROLS,
  SEND_WRITES_MAX,
  type SendBody,
} from "@cawco/core/comments/model";
import {
  goneProblem,
  heldNoteProblem,
  pinsProblem,
  seenProblem,
} from "@cawco/core/comments/validate";
import { ARTIFACT_GONE } from "@cawco/core/doc-link";
import { MIRRORED_MAPS } from "@cawco/core/doc-maps";
import { inkProblem } from "@cawco/core/ink";
import { writeStateFile } from "@cawco/core/state-file";
import { TUNED_MAP, tunedProblem } from "@cawco/core/tuned";
import type { ServerWebSocket } from "bun";
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
  elementsOf,
  MAPS,
} from "./docs";
import { ArtifactRefusal, NothingNewToSend } from "./service";

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

/** The keys of a canvas's `meta` its screen keeps: Excalidraw's pen mode, once a pen touched it. */
const PEN_KEYS = new Set(["penMode", "penDetected"]);

/** A request's keys a screen writes: its claim (`claim-<its page's number>`, canvas-host scene.ts `PAGE_CLAIM`) and the result. */
const SCREEN_REQUEST_KEY = /^(claim-\d+|result)$/u;

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
 * The key of `meta` a person writes on any artifact: Send all's note beside
 * the comments they held (core comments.ts `sendHeld`, `HeldNote`), which
 * the delivery that carries them takes away.
 */
const HELD_NOTE_KEY = "heldNote";

/**
 * Why a person's change to `meta` may not be kept: on any artifact they
 * write Send all's note ({@link HELD_NOTE_KEY}), on a canvas its pen mode
 * too ({@link PEN_KEYS}), and nothing else.
 */
const metaProblem = (
  before: YMap<unknown>,
  after: YMap<unknown>,
  canvas: boolean
): string | null => {
  for (const key of new Set([...after.keys(), ...before.keys()])) {
    const value = after.get(key);
    if (same(value, before.get(key))) {
      continue;
    }
    if (key === HELD_NOTE_KEY) {
      const problem = heldNoteProblem(value);
      if (problem) {
        return problem;
      }
    } else if (!(canvas && PEN_KEYS.has(key))) {
      return canvas
        ? "A screen keeps only penMode, penDetected and heldNote in a canvas's meta."
        : "A page changes its artifact's meta only by its held note.";
    } else if (!(value === undefined || typeof value === "boolean")) {
      return `${key} is true or false.`;
    }
  }
  return null;
};

/** Why one entry of a canvas's elements is not one: a map of `el` (an element with its id), `pos`, and `by` and `made` when they say who. */
const entryProblem = (entry: unknown): string | null => {
  if (!(entry instanceof YMap)) {
    return "An element is a map of el, pos and by.";
  }
  const el = entry.get("el") as { id?: unknown } | null | undefined;
  if (!(
    el &&
    typeof el === "object" &&
    typeof el.id === "string" &&
    typeof entry.get("pos") === "string"
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
    before
      .toArray()
      .map((entry) => [
        (entry.get("el") as { id: string }).id,
        entry.get("made"),
      ])
  );
  const changed = after.toArray().find((entry) => {
    const was = made.get((entry.get("el") as { id: string }).id);
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
    metaProblem(doc.getMap("meta"), trial.getMap("meta"), true) ??
    elements
      .toArray()
      .map(entryProblem)
      .find((problem) => problem !== null) ??
    madeProblem(elementsOf(doc), elements) ??
    filesProblem(doc.getMap("files"), trial.getMap("files")) ??
    requestsProblem(
      doc.getMap("requests") as YMap<YMap<unknown>>,
      trial.getMap("requests") as YMap<YMap<unknown>>
    ) ??
    inkMapsProblem(doc, trial)
  );
};

/** Why `trial`'s state, `doc`'s after a person's update, may not be kept; null when it may. */
const stateProblem = (doc: Doc, trial: Doc): string | null => {
  if (doc.getMap("meta").get("kind") === "canvas") {
    return canvasProblem(doc, trial);
  }
  const component = doc.getMap("meta").get("kind") === "component";
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
    metaProblem(doc.getMap("meta"), trial.getMap("meta"), false) ??
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
  const before = doc.getMap("state");
  for (const [key, value] of state.entries()) {
    if (JSON.stringify(value) !== JSON.stringify(before.get(key))) {
      const problem =
        choiceEntryProblem(key, value) ??
        settledWriteProblem(
          before.get(key) as ChoiceEntry | undefined,
          value as ChoiceEntry
        );
      if (problem) {
        return problem;
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

/** Where a canvas's latest picture is kept: its folder under the artifacts' root. */
export const picturePath = (root: string, artifactId: string): string =>
  join(root, artifactId, "picture.png");

/** Where a page's or preview's latest thumbnail is kept: a PNG per scheme and `thumbnail.json` naming them. */
export const thumbnailPath = (
  root: string,
  artifactId: string,
  part: "light" | "dark" | "json"
): string =>
  join(
    root,
    artifactId,
    part === "json" ? "thumbnail.json" : `thumbnail-${part}.png`
  );

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
      await writeStateFile(path, body);
    }
    docs.transact(artifactId, "hub", (doc) =>
      doc
        .getMap("meta")
        .set("pictureAt", body.length === 0 ? null : new Date().toISOString())
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
  const requests = docs.doc(artifactId).getMap("requests") as YMap<
    YMap<unknown>
  >;
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
  const requests = docs.doc(artifactId).getMap("requests") as YMap<
    YMap<unknown>
  >;
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

/** The longest send body read: its text and the page's writes at their bounds, as JSON. */
const SEND_BODY_MAX = 4 * CHOICE_LIMITS.note + SEND_WRITES_MAX + 4096;

/** The longest pictures body read: its pictures and its address at their bounds, as JSON. */
const PICTURES_BODY_MAX =
  COMMENT_LIMITS.pictures * (COMMENT_LIMITS.pictureChars + 100) + 4096;

/** The longest page address a post names. Our call. */
const URL_MAX = 2048;
/** The longest mark id a picture names: a pin's or a stroke group's. Our call. */
const MARK_ID_MAX = 100;

const PNG_BASE64 = /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/u;

const SEND_SHAPE = "Send takes JSON: { text?, pins?, control?, writes? }.";

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/u;

const PICTURES_SHAPE = "Pictures take JSON: { pictures, url? }.";

const isRecord = (body: unknown): body is Record<string, unknown> =>
  !!body && typeof body === "object" && !Array.isArray(body);

/** Why a send's body is not one, or its fields; null when it is. */
const sendBodyProblem = (body: unknown): string | null => {
  if (!isRecord(body)) {
    return SEND_SHAPE;
  }
  const { text } = body;
  if (
    text !== undefined &&
    !(typeof text === "string" && text.length <= CHOICE_LIMITS.note)
  ) {
    return `text is a string of at most ${CHOICE_LIMITS.note} characters.`;
  }
  const { control } = body;
  if (control !== undefined && !isSendControl(control)) {
    return `control is one of ${Object.keys(SEND_CONTROLS).join(", ")}.`;
  }
  const ids = (value: unknown) =>
    value === undefined ||
    (Array.isArray(value) &&
      value.length > 0 &&
      value.length <= COMMENT_LIMITS.pins &&
      value.every(
        (pin) =>
          typeof pin === "string" && pin.length > 0 && pin.length <= MARK_ID_MAX
      ));
  if (!ids(body.pins)) {
    return `pins is a list of 1 to ${COMMENT_LIMITS.pins} pin ids.`;
  }
  if (!ids(body.again)) {
    return `again is a list of 1 to ${COMMENT_LIMITS.pins} pin ids.`;
  }
  return sentWritesProblem(body.writes);
};

/** Why a pictures post's body is not one, or its fields; null when it is. */
const picturesBodyProblem = (body: unknown): string | null => {
  if (!isRecord(body)) {
    return PICTURES_SHAPE;
  }
  const { url, pictures } = body;
  if (
    url !== undefined &&
    !(typeof url === "string" && url.length <= URL_MAX)
  ) {
    return `url is a string of at most ${URL_MAX} characters.`;
  }
  if (!(
    Array.isArray(pictures) && pictures.length <= COMMENT_LIMITS.pictures
  )) {
    return `pictures is a list of at most ${COMMENT_LIMITS.pictures}.`;
  }
  for (const picture of pictures as (Record<string, unknown> | null)[]) {
    if (!(
      picture &&
      typeof picture.mark === "string" &&
      picture.mark.length <= MARK_ID_MAX &&
      typeof picture.png === "string" &&
      picture.png.length <= COMMENT_LIMITS.pictureChars &&
      PNG_BASE64.test(picture.png)
    )) {
      return `A picture is { mark, png }: a mark's id and a base64 PNG of at most ${COMMENT_LIMITS.pictureChars.toLocaleString()} characters.`;
    }
  }
  return null;
};

/**
 * The page posts its pictures of the marks the person just made on it
 * (`POST …/pictures`, core `MarkPictures`): the hub holds them for the
 * delivery that carries those marks (service.ts `pictures`). `instanceId`
 * already owns `artifactId` (the listener checked).
 */
export const artifactPictures =
  (
    keep: (
      instanceId: string,
      artifactId: string,
      body: MarkPictures
    ) => { held: number }
  ) =>
  async (
    request: Request,
    instanceId: string,
    artifactId: string
  ): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response("Pictures are a POST.", {
        status: 405,
        headers: { allow: "POST" },
      });
    }
    const raw = await request.text();
    if (raw.length > PICTURES_BODY_MAX) {
      return new Response(
        `A post carries at most ${COMMENT_LIMITS.pictures} pictures.`,
        { status: 413 }
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return new Response(PICTURES_SHAPE, { status: 400 });
    }
    const problem = picturesBodyProblem(body);
    if (problem) {
      return new Response(problem, { status: 400 });
    }
    try {
      return Response.json(keep(instanceId, artifactId, body as MarkPictures));
    } catch (error) {
      if (error instanceof ArtifactRefusal) {
        return new Response(error.message, { status: error.status });
      }
      throw error;
    }
  };

/** A checked send's body as the service takes it: its text trimmed, and only the fields it holds. */
const sentBody = ({ text, pins, again, control }: SendBody): SendBody => ({
  ...(text?.trim() ? { text: text.trim() } : {}),
  ...(pins ? { pins } : {}),
  ...(again ? { again } : {}),
  ...(control ? { control } : {}),
});

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
  const problem = updateProblem(doc, update);
  if (problem) {
    return problem;
  }
  applyUpdate(doc, update, origin);
  if (doc.getMap("meta").get("kind") === "canvas") {
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

/** Why `writes` is not a Send's carried writes (core `SendBody.writes`), or null. */
const sentWritesProblem = (writes: unknown): string | null =>
  writes === undefined ||
  (typeof writes === "string" &&
    writes.length <= SEND_WRITES_MAX &&
    BASE64.test(writes))
    ? null
    : `writes is a base64 Yjs update of at most ${SEND_WRITES_MAX.toLocaleString()} characters.`;

/**
 * The person sends their picks (`cawco.send`): the page's own writes it
 * carries applied first, as its socket's would be ({@link takeUpdate}), so
 * the picks the page counts are the ones read; then what the send applies
 * (a project's setup page: its name, shape and account), then the session
 * hears it has new responses to read (service.ts `send`). `instanceId`
 * already owns `artifactId` (the listener checked).
 */
export const artifactSend =
  (
    send: (
      instanceId: string,
      artifactId: string,
      body: SendBody,
      route: string
    ) => Promise<ArtifactChoices>,
    docs: ArtifactDocs
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
    const raw = await request.text();
    if (raw.length > SEND_BODY_MAX) {
      return new Response(
        `A send carries at most ${COMMENT_LIMITS.pictures} pictures and ${CHOICE_LIMITS.note} characters of text.`,
        { status: 413 }
      );
    }
    let body: unknown;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return new Response(SEND_SHAPE, { status: 400 });
    }
    const problem = sendBodyProblem(body);
    if (problem) {
      return new Response(problem, { status: 400 });
    }
    const { writes } = body as SendBody;
    if (writes) {
      const refused = takeSentWrites(docs, artifactId, writes);
      if (refused) {
        return new Response(refused, { status: 422 });
      }
    }
    try {
      return Response.json(
        await send(
          instanceId,
          artifactId,
          sentBody(body as SendBody),
          `POST ${new URL(request.url).pathname}`
        )
      );
    } catch (error) {
      return refusedSend(error);
    }
  };

/**
 * The page's answer for a Send the service refused, in its words and
 * status; a Send with nothing new reads as sent (his press after every pick
 * had gone, by the hub's own send or an earlier press: what he asked for
 * holds). Anything else is thrown on.
 */
const refusedSend = (error: unknown): Response => {
  if (error instanceof NothingNewToSend) {
    return Response.json({ sent: "already" });
  }
  if (error instanceof ArtifactRefusal) {
    return new Response(error.message, { status: error.status });
  }
  throw error;
};

/** The listener's handlers for artifact sockets. */
export const artifactSocket = (docs: ArtifactDocs) => ({
  open(socket: ServerWebSocket<ArtifactSocket>) {
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
    if (
      (kind !== messageYjsSyncStep2 && kind !== messageYjsUpdate) ||
      socket.data.refused
    ) {
      return;
    }
    const problem = takeUpdate(
      docs,
      artifactId,
      readVarUint8Array(decoder),
      origin
    );
    if (problem) {
      socket.data.refused = true;
      socket.send(refusal(problem));
    }
  },
  close(socket: ServerWebSocket<ArtifactSocket>, code?: number) {
    if (socket.data.origin) {
      docs.leave(socket.data.artifactId, socket.data.origin.client);
      // A removed artifact's doc is let go with its sockets: nothing to elect.
      if (socket.data.screen && code !== ARTIFACT_GONE) {
        releaseClaims(docs, socket.data.artifactId, socket.data.origin.client);
      }
    }
  },
});
