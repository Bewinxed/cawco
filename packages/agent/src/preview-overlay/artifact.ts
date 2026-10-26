/**
 * The page's hold on its artifact's document (Projects spec §5.10, D23): the
 * Yjs doc the hub keeps, joined over the y-websocket protocol on the path
 * its host names in `cawco:hello` (the dashboard's preview proxy in its
 * frame, the hub's preview listener straight in the app's web view). The
 * page's picks, notes, values and fields are the doc's `state`, written here
 * within the bounds the hub keeps (`@cawco/core/choices`), and every change
 * to it, this page's, another view's or the agent's, is heard back through
 * {@link Watchers}.
 *
 * The Yjs doc itself lives in the overlay's worker (doc-worker.ts), a realm
 * of its own, so the page's realm holds no Yjs of CawCo's: a previewed app
 * keeps its one copy of Yjs, or has none. The page holds the doc's mirror
 * (mirror.ts), which the overlay reads and writes as it read the doc, and
 * the doc's socket, which the worker speaks through (doc-wire.ts).
 *
 * A page the hub serves carries its doc in the overlay's tag
 * (`data-artifact`, `data-state` for the worker, `data-maps` for the
 * mirror), so the page is filled from it before it paints, and the socket
 * only catches up.
 *
 * The doc is kept on the device too, per artifact (y-indexeddb, in the
 * worker): what the person marks while the link is down stays through a
 * reload and goes to the hub as the socket syncs again (the hub asks for
 * what it lacks on every open, artifacts/sync.ts). A write the hub refused
 * is cleared from the device with the doc that held it; the person's
 * comments and replies in it the hub doesn't hold are kept aside on the
 * device with its reason, never let go ({@link artifact.refused},
 * {@link artifact.refusedReplies}). A browser that keeps no
 * IndexedDB keeps nothing on the device. Where the page may start no worker
 * (a Content-Security-Policy that refuses one), the page keeps no doc.
 */

import {
  MADE_ARTIFACT_KINDS,
  type MadeArtifactKind,
} from "@cawco/core/artifact-kinds";
import {
  CHOICE_LIMITS,
  type ChoiceChange,
  type ChoiceEntry,
  changedEntry,
  choiceEntryProblem,
} from "@cawco/core/choices";
import {
  goneOf,
  isSendControl,
  lostReplies,
  type MarkPictures,
  PIN_MAPS,
  type Pin,
  type RefusedReplies,
  readPins,
  replyAgain,
  replyToPin,
  writePin,
} from "@cawco/core/comments";
import { deviceDocName, tendDeviceDocs } from "@cawco/core/doc-link";
import type { MapDoc } from "@cawco/core/doc-maps";
import { here } from "./boot";
import type { DeviceCopy, FromWorker, ToWorker } from "./doc-wire";
import { Mirror } from "./mirror";

/** The doc worker's bundle (doc-worker.ts), its text put in by the overlay's build (core preview-proxy.ts `bundleOverlay`). */
declare const __CAWCO_DOC_WORKER__: string;

/** Where an artifact's doc is synced: the listener's path, under the dashboard's preview prefix in its frame. */
const SYNC_PATH =
  /^\/(?:preview\/[^/]+\/[^/]+\/)?__cawco\/artifact\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/u;

export const NO_ARTIFACT = "This page has no artifact to keep its state in.";

export interface ArtifactRef {
  id: string;
  kind: MadeArtifactKind;
  name: string;
}

export type State = Record<string, ChoiceEntry>;

/**
 * The doc's link to the hub, as the page's host hears it (`cawco:sync`):
 * `connecting` until its socket first fails or syncs, `synced` while the
 * hub holds what the page holds, `lost` from a failed or closed socket
 * until it syncs again; `error` says why it was lost.
 */
export interface Link {
  error: string | null;
  /**
   * Lost to silence (core doc-link.ts `watchSilence`): its socket heard
   * nothing for `SILENT_MS`, so the host says it at once, the silence its
   * grace. Kept through the closes that follow until it syncs again.
   */
  silent: boolean;
  state: "connecting" | "synced" | "lost";
}

/** How long a lost link stands before the canvas refuses the pen: the brief's 5 s. */
const LOST_REFUSES_MS = 5000;

export interface Watchers {
  /** The ink, its moved groups or its pins changed, here or elsewhere; or the doc was replaced. */
  ink: () => void;
  /** The doc's link to the hub changed. */
  link: (link: Link) => void;
  /** The person's ink or pins changed in this page: what the hub delivers, with this page's pictures of them. */
  marked: () => void;
  /** `meta` changed: a new revision, a send. */
  meta: () => void;
  /** The hub would not keep what this page wrote; the doc was joined again from the hub's. */
  refused: (reason: string) => void;
  /**
   * `state` changed at `keys` (null: all of it); `remote` when another view,
   * the agent or the hub made the change, not this page.
   */
  state: (keys: Set<string> | null, remote: boolean) => void;
  /** The doc has the hub's state for the first time since it was joined. */
  synced: () => void;
}

const sameEntry = (a: ChoiceEntry | undefined, b: ChoiceEntry): boolean =>
  !!a &&
  a.note === b.note &&
  a.options.join("\u0000") === b.options.join("\u0000") &&
  JSON.stringify(a.value) === JSON.stringify(b.value);

/**
 * The doc as a canvas's host page follows it (`window.cawcoArtifact`): which
 * doc of the worker's it is now, and its link, so the host page keeps its
 * own Yjs replica of it (canvas-host replica.ts) and says when the canvas
 * can't reach the hub.
 */
export interface ArtifactHold {
  /** Which doc this is: it moves when the doc is replaced (another artifact's, or one the hub refused). */
  generation: number;
  /** The doc has synced with the hub since it was joined. */
  hasSynced: boolean;
  /** The doc's link to the hub now. */
  link: Link;
  ref: ArtifactRef | null;
  /**
   * Whether what is written here would not reach the hub: before the doc
   * first synced, and once a lost link has stood {@link LOST_REFUSES_MS}.
   */
  refused: boolean;
  /** What the device kept of the doc is merged in, or there is none ({@link artifact.stored}). */
  stored: boolean;
  sync: string | null;
}

/**
 * What a canvas's host page takes from the overlay: the doc's hold now and
 * every one after, and the doc itself as Yjs updates (the host page runs
 * its own Yjs, which the overlay never brings into the page): its whole
 * state, then each change, and the host page's own changes back.
 */
export interface ArtifactGlobal {
  /** The doc's mirror: its maps as the overlay reads them. */
  readonly doc: MapDoc;
  /** Doc `generation`'s whole state, then each change to it, as Yjs updates; until the returned stop. */
  replicate: (
    heard: (generation: number, update: Uint8Array) => void
  ) => () => boolean;
  /** A change the host page made to doc `generation`, as a Yjs update. */
  send: (generation: number, update: Uint8Array) => void;
  subscribe: (holder: (hold: ArtifactHold) => void) => () => boolean;
}

/** The doc's worker, once the page has a doc to keep; null before, and where the page may start none. */
let worker: Worker | null = null;
/** The page may start no worker here (its policy refused one): it keeps no doc. */
let workerless = false;
const tell = (message: ToWorker) => worker?.postMessage(message);

const mirror = new Mirror((ops, seq) => tell({ type: "write", ops, seq }));
let watchers: Watchers | null = null;
/**
 * What the device kept of the doc is merged in, or there is none to wait
 * for (no IndexedDB here, or it wouldn't open): until then the doc is the
 * hub's embedded copy alone, which may hold a pin the device deleted. False
 * until the artifact is joined: the device's copy is opened then.
 */
let stored = false;
/** The device gave the doc marks back (a reload while they hadn't reached the hub): their pictures are drawn once it syncs. */
let restored = false;
/** The artifact the page's doc is: told by the host, or embedded by the hub before that. */
let joined: ArtifactRef | null = null;
let seeded: string | null = null;
/** The kind the hub embedded with the doc, before the host names it. */
let seededKind: ArtifactRef["kind"] | null = null;
let syncPath: string | null = null;
const holders = new Set<(hold: ArtifactHold) => void>();
const replicas = new Set<(generation: number, update: Uint8Array) => void>();
let link: Link = { state: "connecting", error: null, silent: false };
/** The doc has synced with the hub since it was joined. */
let everSynced = false;
/** A lost link has stood {@link LOST_REFUSES_MS}. */
let lostLong = false;
let lostTimer: ReturnType<typeof setTimeout> | undefined;
const hold = (): ArtifactHold => ({
  generation: mirror.generation,
  hasSynced: everSynced,
  link,
  refused: !everSynced || lostLong,
  ref: joined,
  stored,
  sync: syncPath,
});
const handed = () => {
  for (const holder of holders) {
    holder(hold());
  }
};

/**
 * The link moved: the holders and the host hear it; a lost one refuses once
 * it has stood {@link LOST_REFUSES_MS}. A link lost to silence stays silent
 * through the closes after it, until it is no longer lost.
 */
const linked = (said: Omit<Link, "silent"> & { silent?: boolean }) => {
  const next: Link = {
    ...said,
    silent:
      said.state === "lost" &&
      (said.silent === true || (link.state === "lost" && link.silent)),
  };
  if (next.state === "synced") {
    everSynced = true;
  }
  if (next.state !== "lost") {
    clearTimeout(lostTimer);
    lostTimer = undefined;
    lostLong = false;
  } else if (lostTimer === undefined && !lostLong) {
    lostTimer = setTimeout(() => {
      lostTimer = undefined;
      lostLong = true;
      handed();
    }, LOST_REFUSES_MS);
  }
  if (
    next.state === link.state &&
    next.error === link.error &&
    next.silent === link.silent
  ) {
    return;
  }
  link = next;
  watchers?.link(link);
  handed();
};

/**
 * The one global a canvas's host page takes the doc from: `subscribe` calls
 * back at once and again whenever the doc is replaced or joined, and
 * `replicate` hands it the doc as Yjs updates, so the page binds its own
 * Yjs doc to the one the overlay syncs and never opens a socket of its own.
 * `doc` is the mirror, what a probe reads the doc's maps from.
 */
const artifactGlobal: ArtifactGlobal = Object.freeze({
  get doc() {
    return mirror;
  },
  replicate: (replica: (generation: number, update: Uint8Array) => void) => {
    replicas.add(replica);
    tell({ type: "replicate" });
    return () => replicas.delete(replica);
  },
  send: (generation: number, update: Uint8Array) =>
    tell({ type: "replica-update", generation, update }),
  subscribe: (holder: (hold: ArtifactHold) => void) => {
    holders.add(holder);
    holder(hold());
    return () => holders.delete(holder);
  },
});
Object.defineProperty(window, "cawcoArtifact", { value: artifactGlobal });
/** "none": the host said this page has no artifact, so nothing is kept. */
let status: "waiting" | "joined" | "none" = "waiting";
let synced = false;
let whenSynced: () => void = () => undefined;
let syncedOnce = new Promise<void>((resolve) => {
  whenSynced = resolve;
});

// The mirror's own watchers: what the overlay hears of the doc.
mirror.getMap("state").observe((event) => {
  watchers?.state(new Set([...event.keysChanged]), !event.transaction.local);
});
mirror.getMap("meta").observe(() => watchers?.meta());
for (const name of ["ink", "moved", ...PIN_MAPS]) {
  mirror.getMap(name).observe((event) => {
    watchers?.ink();
    if (name !== "moved" && event.transaction.local) {
      watchers?.marked();
    }
    if (name !== "moved" && event.transaction.origin === "kept") {
      restored = true;
    }
  });
}

/** The page's sockets the worker speaks through, by its number for them. */
const sockets = new Map<number, WebSocket>();

/** Opens socket `id` for the worker through whatever `window.WebSocket` is now, so a patch the page installs sees it. */
const openSocket = (id: number, url: string, protocols: string[]) => {
  let socket: WebSocket;
  try {
    socket = new window.WebSocket(
      url,
      protocols.length > 0 ? protocols : undefined
    );
  } catch {
    tell({ type: "socket-error", id });
    tell({ type: "socket-close", id, code: 1006, reason: "", wasClean: false });
    return;
  }
  socket.binaryType = "arraybuffer";
  sockets.set(id, socket);
  socket.onopen = () => tell({ type: "socket-open", id });
  socket.onmessage = (event: MessageEvent<ArrayBuffer | string>) =>
    tell({ type: "socket-message", id, data: event.data });
  socket.onerror = () => tell({ type: "socket-error", id });
  socket.onclose = (event) => {
    sockets.delete(id);
    tell({
      type: "socket-close",
      id,
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
    });
  };
};

/** The doc started again as `generation`: the mirror emptied, nothing of the hub's held until it syncs. */
const restart = (generation: number) => {
  mirror.reset(generation);
  stored = false;
  restored = false;
  synced = false;
  everSynced = false;
  linked({ state: "connecting", error: null });
  syncedOnce = new Promise<void>((resolve) => {
    whenSynced = resolve;
  });
  watchers?.state(null, true);
  watchers?.ink();
  handed();
};

/**
 * The person's words the hub refused (a write it would not keep, the
 * refusal's reason), kept on the device apart from the doc, per artifact:
 * whole comments the hub holds none of, and replies in a thread the hub
 * holds (the app's `cawco:reply` on a thread another device filled), by
 * pin, as the pane keeps its own (PreviewPane.svelte `refusedReplies`). The
 * host draws each with why and Try again ({@link artifact.resend}), and a
 * reload keeps them. A browser that keeps no storage keeps them in memory.
 */
const REFUSED_KEY = (id: string) => `cawco-refused-pins:${id}`;
/** The page's own key: a page the dashboard proxies shares its origin, whose `cawco-refused-replies:` are the pane's. */
const REPLIES_KEY = (id: string) => `cawco-refused-page-replies:${id}`;
let refusedPins: Pin[] = [];
let refusedReplies: RefusedReplies = {};
/** A refusal's comments, until the hub's doc is in to tell which it doesn't hold. */
let refusing: { pins: Record<string, Pin>; why: string } | null = null;
const keep = (key: string, value: unknown, any: boolean) => {
  try {
    if (any) {
      localStorage.setItem(key, JSON.stringify(value));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // No storage here: they stand in memory for this page's life.
  }
};
const storeRefused = () => {
  if (!joined) {
    return;
  }
  keep(REFUSED_KEY(joined.id), refusedPins, refusedPins.length > 0);
  keep(
    REPLIES_KEY(joined.id),
    refusedReplies,
    Object.keys(refusedReplies).length > 0
  );
};
const readKept = (key: string): unknown => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};
const loadRefused = (id: string) => {
  const pins = readKept(REFUSED_KEY(id));
  refusedPins = Array.isArray(pins) ? (pins as Pin[]) : [];
  const replies = readKept(REPLIES_KEY(id));
  refusedReplies =
    replies && typeof replies === "object" && !Array.isArray(replies)
      ? (replies as RefusedReplies)
      : {};
};
/**
 * The hub's doc is in after a refusal: each of the person's comments it
 * doesn't hold is kept aside with the hub's reason, and each of the
 * person's entries missing from a thread it does hold.
 */
const keepRefused = () => {
  if (!refusing) {
    return;
  }
  const { pins, why } = refusing;
  refusing = null;
  const held = readPins(mirror);
  const gone = goneOf(mirror);
  const at = new Date().toISOString();
  // One the hub holds deleted was deleted, not lost: it is not kept aside.
  const lost = Object.values(pins).filter(
    (pin) => pin.by === "person" && !held.has(pin.id) && !gone.has(pin.id)
  );
  const replies = { ...refusedReplies };
  const lostThreads = lostReplies(Object.values(pins), held);
  for (const { pin, entries } of lostThreads) {
    const ids = new Set(entries.map((entry) => entry.id));
    const was = replies[pin]?.entries ?? [];
    replies[pin] = {
      entries: [...was.filter((entry) => !ids.has(entry.id)), ...entries],
      why,
    };
  }
  if (lost.length === 0 && lostThreads.length === 0) {
    return;
  }
  const ids = new Set(lost.map((pin) => pin.id));
  refusedPins = [
    ...refusedPins.filter((pin) => !ids.has(pin.id)),
    ...lost.map((pin) => ({ ...pin, notSent: { at, why } })),
  ];
  refusedReplies = replies;
  storeRefused();
  watchers?.ink();
};

/** What the worker says. */
const heard = (message: FromWorker) => {
  switch (message.type) {
    case "changes":
      mirror.heard(message);
      return;
    case "connecting":
      linked({
        state: link.state === "lost" ? "lost" : "connecting",
        error: link.error,
      });
      return;
    case "lost":
      linked({ state: "lost", error: message.error, silent: message.silent });
      return;
    case "synced":
      linked({ state: "synced", error: null });
      keepRefused();
      if (!synced) {
        synced = true;
        whenSynced();
        watchers?.synced();
      }
      // Marks the device gave back are on the hub now: their pictures go for the delivery that carries them.
      if (restored) {
        restored = false;
        watchers?.marked();
      }
      return;
    case "stored":
      stored = true;
      watchers?.ink();
      handed();
      return;
    case "refused":
      // What this page wrote the hub would not keep: the worker starts
      // again from the hub's. The person's comments in it are never let
      // go: once the hub's doc is in, each it doesn't hold is kept aside.
      refusing = {
        pins: message.pins as Record<string, Pin>,
        why: message.reason || "The hub didn't keep it.",
      };
      restart(message.generation);
      watchers?.refused(message.reason);
      return;
    case "replica":
      for (const replica of replicas) {
        replica(message.generation, message.update);
      }
      return;
    case "socket-new":
      openSocket(message.id, message.url, message.protocols);
      return;
    case "socket-send":
      sockets.get(message.id)?.send(message.data);
      return;
    case "socket-close":
      sockets.get(message.id)?.close(message.code, message.reason);
      return;
    default:
      return;
  }
};

/**
 * The doc's worker, started once the page has a doc to keep: from the
 * overlay's own text of it, as a blob of the page's origin, so its
 * IndexedDB is the page's. Null where the page's policy refuses a worker:
 * the page keeps no doc.
 */
const started = (): Worker | null => {
  if (worker || workerless) {
    return worker;
  }
  try {
    const url = URL.createObjectURL(
      new Blob([__CAWCO_DOC_WORKER__], { type: "text/javascript" })
    );
    worker = new Worker(url, { name: "cawco-doc" });
    URL.revokeObjectURL(url);
  } catch {
    workerless = true;
    return null;
  }
  worker.addEventListener("message", (event: MessageEvent<FromWorker>) =>
    heard(event.data)
  );
  const shown = () =>
    tell({ type: "shown", visible: document.visibilityState === "visible" });
  document.addEventListener("visibilitychange", shown);
  shown();
  // A replica that asked before the page had a doc to keep.
  if (replicas.size > 0) {
    tell({ type: "replicate" });
  }
  return worker;
};

/**
 * Where the joined doc is kept on the device: its database's name, the
 * device's copies of artifacts no one has opened lately let go (core
 * `tendDeviceDocs`); none where the browser keeps no IndexedDB (a
 * sandboxed frame, storage refused).
 */
const deviceCopy = (id: string): DeviceCopy => {
  try {
    if (!globalThis.indexedDB) {
      return null;
    }
  } catch {
    return null;
  }
  tendDeviceDocs(id);
  return deviceDocName(id);
};

const decode = (base64: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

/** The mirror filled from the hub's embedded maps, as the worker's doc will hold them once seeded. */
const fill = (maps: string) => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(maps);
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") {
    return;
  }
  mirror.heard({
    type: "changes",
    generation: mirror.generation,
    origin: "seed",
    seq: 0,
    set: parsed as Record<string, Record<string, unknown>>,
    deleted: {},
  });
};

export const artifact = {
  watch: (next: Watchers) => {
    watchers = next;
  },

  /**
   * The doc the hub embedded in the page's overlay tag, for `id`: its Yjs
   * update for the worker, and its maps for the mirror, so the page is
   * filled before it paints; and its kind (a page's, unless it says canvas).
   */
  seed: (
    id: string,
    state: string,
    kind: string | undefined,
    maps: string | undefined
  ) => {
    const update = decode(state);
    if (!(update && started())) {
      return;
    }
    tell({ type: "seed", update });
    if (maps) {
      fill(maps);
    }
    seeded = id;
    seededKind = kind === "canvas" ? "canvas" : "page";
    handed();
  },

  /**
   * The host's word on which artifact this page is (`cawco:hello`): the doc
   * joins it, once. Null when the host named none or named it wrongly, or
   * the page may keep no doc, and the page runs without state.
   */
  join: (artifactValue: unknown, sync: unknown): ArtifactRef | null => {
    const raw = artifactValue as Partial<ArtifactRef> | null | undefined;
    const path = typeof sync === "string" ? sync.match(SYNC_PATH) : null;
    const kind = MADE_ARTIFACT_KINDS.find((one) => one === raw?.kind);
    if (!(
      raw &&
      typeof raw.id === "string" &&
      typeof raw.name === "string" &&
      kind &&
      path?.[1] === raw.id &&
      started()
    )) {
      if (status === "waiting") {
        status = "none";
      }
      return status === "joined" ? joined : null;
    }
    if (joined?.id === raw.id) {
      return joined;
    }
    if (joined || (seeded && seeded !== raw.id)) {
      const next = mirror.generation + 1;
      tell({ type: "replace", generation: next });
      restart(next);
    }
    joined = { id: raw.id, kind, name: raw.name.slice(0, 200) };
    syncPath = sync as string;
    status = "joined";
    loadRefused(joined.id);
    stored = false;
    const at = syncPath.lastIndexOf("/");
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    tell({
      type: "join",
      url: `${scheme}://${location.host}${syncPath.slice(0, at)}`,
      room: syncPath.slice(at + 1),
      // A canvas's page is a screen: it converts the agent's writes. One
      // embedded in a decision page only shows it.
      params:
        joined.kind === "canvas" && here.tag?.dataset.embed === undefined
          ? { screen: "1" }
          : {},
      device: deviceCopy(joined.id),
    });
    handed();
    return joined;
  },

  /** The host's Try again (`cawco:reconnect`): the socket closed and opened again now, not at its backoff's next turn. */
  reconnect: () => tell({ type: "reconnect" }),

  /** The kind of artifact this page is, once known. */
  kind: (): ArtifactRef["kind"] | null => joined?.kind ?? seededKind,

  /** The artifact this page is, by id, once known. */
  id: (): string | null => joined?.id ?? seeded,

  /** The doc as it is now, its mirror: the ink (ink.ts) reads and writes its `ink`, `moved` and `pins`. */
  doc: (): MapDoc => mirror,

  /** The person's comments the hub refused, each with its reason (`notSent`), kept on the device. */
  refused: (): Pin[] => refusedPins,

  /**
   * The person's replies the hub refused in threads it holds, by pin, each
   * with its reason, kept on the device; a deleted pin's are let go.
   */
  refusedReplies: (): RefusedReplies => {
    const gone = goneOf(mirror);
    if (Object.keys(refusedReplies).some((pin) => gone.has(pin))) {
      refusedReplies = Object.fromEntries(
        Object.entries(refusedReplies).filter(([pin]) => !gone.has(pin))
      );
      storeRefused();
    }
    return refusedReplies;
  },

  /** Refused comment `id` let go of the device's keep (the person deleted it); false when no such comment is kept. */
  letGoRefused: (id: string): boolean => {
    if (!refusedPins.some((one) => one.id === id)) {
      return false;
    }
    refusedPins = refusedPins.filter((one) => one.id !== id);
    storeRefused();
    return true;
  },

  /**
   * Refused comment `id`, or its refused replies, written into the doc
   * again, for the hub to take (its Try again): they leave the device's
   * keep; a reply the doc won't take stays with why, and one the hub refuses
   * once more is kept again with the new reason. False when nothing of pin
   * `id` is kept.
   */
  resend: (id: string): boolean => {
    const pin = refusedPins.find((one) => one.id === id);
    if (pin) {
      const { notSent: _why, ...again } = pin;
      refusedPins = refusedPins.filter((one) => one.id !== id);
      storeRefused();
      writePin(mirror, again);
      return true;
    }
    if (!refusedReplies[id]) {
      return false;
    }
    refusedReplies = replyAgain(refusedReplies, id, (said) =>
      replyToPin(mirror, id, said)
    ).left;
    storeRefused();
    return true;
  },

  /** Whether there is a doc to keep ink in: the host named the artifact, or the hub embedded it. */
  keeps: () => status === "joined" || seeded !== null,

  /** The doc's link to the hub now. */
  link: (): Link => link,

  /** Whether the doc holds the hub's state: embedded, or synced. */
  known: () => synced || seeded !== null,

  /**
   * Whether what the device kept of the doc is merged in, or there is none:
   * a write the page makes of its own accord (placing its pins again) waits
   * for it, so the hub's embedded copy alone never writes over a deletion
   * the device holds.
   */
  stored: () => stored,

  /** Resolves once the doc holds the hub's state; ask only when it {@link artifact.keeps}. */
  whenKnown: (): Promise<void> =>
    synced || seeded !== null ? Promise.resolve() : syncedOnce,

  state: (): State => mirror.getMap("state").toJSON() as State,

  meta: () => {
    const meta = mirror.getMap("meta");
    return {
      pageHash: (meta.get("pageHash") as string | undefined) ?? null,
      revision: (meta.get("revision") as number | undefined) ?? null,
    };
  },

  /** Writes one change into `state`; a sentence when it breaks the bounds the hub keeps, and nothing is written. */
  write: (change: ChoiceChange): string | null => {
    if (status === "none") {
      return NO_ARTIFACT;
    }
    const state = mirror.getMap<ChoiceEntry>("state");
    const before = state.get(change.choice);
    if (!before && state.size >= CHOICE_LIMITS.perArtifact) {
      return `An artifact keeps at most ${CHOICE_LIMITS.perArtifact} ids.`;
    }
    const entry = changedEntry(before, change, new Date().toISOString());
    const problem = choiceEntryProblem(change.choice, entry);
    if (problem) {
      return problem;
    }
    if (!sameEntry(before, entry)) {
      state.set(change.choice, entry);
    }
    return null;
  },

  /**
   * The person sends (`cawco.send`): the session hears it has new
   * responses to read, `text` kept with them, through the listener's send
   * beside the doc's socket, with the control the page says was pressed
   * (core `SEND_CONTROLS`; the hub's journal names it). Waits for the doc to
   * hold the hub's state first, so what this page wrote is on the hub
   * before the hub reads it.
   */
  send: async (text?: string, control?: unknown): Promise<void> => {
    if (!syncPath) {
      throw new Error(NO_ARTIFACT);
    }
    await syncedOnce;
    const response = await fetch(`${syncPath}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(text ? { text } : {}),
        ...(isSendControl(control) ? { control } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(
        (await response.text()).slice(0, 300) || "The hub refused the send."
      );
    }
  },

  /**
   * This page's pictures of the person's marks it holds unheard, to the hub
   * beside the doc's socket, which holds them for the delivery that carries
   * those marks; nothing when this page joined no doc.
   */
  pictures: async (body: MarkPictures): Promise<void> => {
    if (!syncPath) {
      return;
    }
    const response = await fetch(`${syncPath}/pictures`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(
        (await response.text()).slice(0, 300) ||
          "The hub refused the marks' pictures."
      );
    }
  },
};
