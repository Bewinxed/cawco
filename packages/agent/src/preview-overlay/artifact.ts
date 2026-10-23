/**
 * The page's hold on its artifact's document (Projects spec §5.10, D23): the
 * Yjs doc the hub keeps, joined by the overlay itself over the y-websocket
 * protocol on the path its host names in `cawco:hello` (the dashboard's
 * preview proxy in its frame, the hub's preview listener straight in the
 * app's web view). The page's picks, notes, values and fields are the doc's
 * `state`, written here within the bounds the hub keeps (`@cawco/core/choices`),
 * and every change to it, this page's, another view's or the agent's, is
 * heard back through {@link Watchers}.
 *
 * A page the hub serves carries its doc in the overlay's tag
 * (`data-artifact`, `data-state`), so the page is filled from it before it
 * paints, and the socket only catches up.
 *
 * The doc is kept on the device too, per artifact (y-indexeddb, its
 * IndexedDB provider): what the person marks while the link is down stays
 * through a reload and goes to the hub as the socket syncs again (the hub
 * asks for what it lacks on every open, artifacts/sync.ts). A write the hub
 * refused is cleared from the device with the doc that held it; the
 * person's comments in it the hub doesn't hold are kept aside on the
 * device with its reason, never let go ({@link artifact.refused}). A
 * browser that keeps no IndexedDB keeps nothing on the device.
 */
import {
  CHOICE_LIMITS,
  type ChoiceChange,
  type ChoiceEntry,
  changedEntry,
  choiceEntryProblem,
} from "@cawco/core/choices";
import {
  goneOf,
  honourDeletions,
  type MarkPictures,
  type Pin,
} from "@cawco/core/comments";
import {
  ARTIFACT_GONE,
  deviceDocName,
  RESYNC_MS,
  reopenStalled,
  type StallWatch,
  tendDeviceDocs,
  watchSilence,
} from "@cawco/core/doc-link";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  Array as YArray,
  YArrayEvent,
  YEvent,
  Map as YMap,
  YMapEvent,
} from "yjs";
import { here } from "./boot";

/** The hub's close code for an update it would not keep (hub artifacts/sync.ts). */
const REFUSED = 4400;

/** Attempts in a row that never opened, after which the link is said lost. */
const STALLS_LOST = 2;

const KINDS = new Set(["page", "canvas", "preview", "component"]);

/** Where an artifact's doc is synced: the listener's path, under the dashboard's preview prefix in its frame. */
const SYNC_PATH =
  /^\/(?:preview\/[^/]+\/[^/]+\/)?__cawco\/artifact\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const NO_ARTIFACT = "This page has no artifact to keep its state in.";

export interface ArtifactRef {
  id: string;
  kind: "page" | "canvas" | "preview" | "component";
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
export const LOST_REFUSES_MS = 5000;

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

/**
 * Opens each socket through whatever `window.WebSocket` is when it opens, so
 * the overlay's own prefix patch, and any a page installs later, sees every
 * connection, a reconnect's included.
 */
const LiveWebSocket = class {
  constructor(url: string | URL, protocols?: string | string[]) {
    // biome-ignore lint/correctness/noConstructorReturn: y-websocket constructs this, and the socket itself is what it gets.
    return new window.WebSocket(url, protocols);
  }
} as unknown as typeof WebSocket;

const decode = (base64: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

const sameEntry = (a: ChoiceEntry | undefined, b: ChoiceEntry): boolean =>
  !!a &&
  a.note === b.note &&
  a.options.join("\u0000") === b.options.join("\u0000") &&
  JSON.stringify(a.value) === JSON.stringify(b.value);

/**
 * The doc the overlay holds, as a canvas's host page takes it
 * (`window.cawcoArtifact`): the doc itself, of the page's one Yjs (the host
 * bundle's `yjs` is this one, canvas-host/yjs.ts), so whatever the page
 * writes in it reaches the hub and every other view. With it, the artifact
 * once the host named it, and where it is synced (the host page posts its
 * picture beside it).
 */
export interface ArtifactHold {
  doc: Doc;
  /** Which doc this is: it moves when the overlay replaces its doc (another artifact's, or one the hub refused). */
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
  sync: string | null;
}

/**
 * The Yjs a canvas's host page runs on: the members it and y-excalidraw
 * use, so every other page's overlay keeps the rest of Yjs out of its
 * bundle. canvas-host/yjs.ts re-exports these by name.
 */
const SHARED_YJS = Object.freeze({
  applyUpdate,
  Array: YArray,
  Doc,
  encodeStateAsUpdate,
  Map: YMap,
  YArrayEvent,
  YEvent,
  YMapEvent,
});

/** What a canvas's host page takes from the overlay: its Yjs, the doc now, and every doc after. */
export interface ArtifactGlobal {
  readonly doc: Doc;
  subscribe: (holder: (hold: ArtifactHold) => void) => () => boolean;
  readonly Y: typeof SHARED_YJS;
}

let watchers: Watchers | null = null;
let doc = new Doc();
let provider: WebsocketProvider | null = null;
/** {@link provider}'s silence watch (core doc-link.ts `watchSilence`), stopped with it. */
let quiet: StallWatch | null = null;
/** The doc kept on the device, once the artifact is joined. */
let kept: IndexeddbPersistence | null = null;
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
let generation = 0;
let link: Link = { state: "connecting", error: null, silent: false };
/** The doc has synced with the hub since it was joined. */
let everSynced = false;
/** A lost link has stood {@link LOST_REFUSES_MS}. */
let lostLong = false;
let lostTimer: ReturnType<typeof setTimeout> | undefined;
const hold = (): ArtifactHold => ({
  doc,
  generation,
  hasSynced: everSynced,
  link,
  refused: !everSynced || lostLong,
  ref: joined,
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

/** Why a socket to the hub closed, as one clause. */
const closedBecause = (event: CloseEvent | null): string =>
  event
    ? `Its link to ${location.host} closed (code ${event.code}${event.reason ? `: ${event.reason.slice(0, 80)}` : ""})`
    : `Its link to ${location.host} stopped answering`;

/**
 * The one global a canvas's host page takes the doc from, and its Yjs:
 * `subscribe` calls back at once and again whenever the doc is replaced or
 * joined, so the page binds to the doc the overlay syncs and never opens a
 * socket of its own; `Y` is the Yjs the page's bundle runs on, so the page
 * holds one copy of it and its types are the doc's.
 */
const artifactGlobal: ArtifactGlobal = Object.freeze({
  Y: SHARED_YJS,
  get doc() {
    return doc;
  },
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

const observe = (own: Doc) => {
  // A pin deleted anywhere stays deleted here, whatever a merge brings back
  // of it (core comments.ts `honourDeletions`); its watch ends with the doc.
  honourDeletions(own);
  own.getMap("state").observe((event) => {
    if (own === doc) {
      watchers?.state(
        new Set([...event.keysChanged]),
        !event.transaction.local
      );
    }
  });
  own.getMap("meta").observe(() => {
    if (own === doc) {
      watchers?.meta();
    }
  });
  for (const name of ["ink", "moved", "pins"]) {
    own.getMap(name).observe((event) => {
      if (own === doc) {
        watchers?.ink();
        if (name !== "moved" && event.transaction.local) {
          watchers?.marked();
        }
        if (name !== "moved" && kept && event.transaction.origin === kept) {
          restored = true;
        }
      }
    });
  }
};
observe(doc);

/**
 * The joined artifact's doc kept on the device from now on, and what the
 * device kept of it merged in; the device's copies of artifacts no one has
 * opened lately let go (core `tendDeviceDocs`). Nothing is kept where the
 * browser keeps no IndexedDB (a sandboxed frame, storage refused). Once
 * the device's copy is in (or there is none), the pins are drawn again:
 * what waited on it ({@link artifact.stored}) goes on.
 */
const keepOnDevice = () => {
  if (!joined) {
    return;
  }
  const none = () => {
    stored = true;
    watchers?.ink();
  };
  try {
    if (!globalThis.indexedDB) {
      none();
      return;
    }
  } catch {
    none();
    return;
  }
  tendDeviceDocs(joined.id);
  stored = false;
  const own = new IndexeddbPersistence(deviceDocName(joined.id), doc);
  kept = own;
  const loaded = () => {
    if (kept === own) {
      none();
    }
  };
  own.whenSynced.then(loaded);
  // A database that won't open gives nothing back: there is no copy to wait for.
  own._db.catch(loaded);
};

/** Starts a fresh doc in place of the one held (another artifact's, or one the hub refused); the device keeps the old one's no longer. */
const replaceDoc = () => {
  quiet?.stop();
  quiet = null;
  provider?.destroy();
  provider = null;
  kept = null;
  stored = false;
  restored = false;
  // Its device copy lets go with it (y-indexeddb destroys on the doc's destroy).
  doc.destroy();
  doc = new Doc();
  generation += 1;
  observe(doc);
  synced = false;
  // The new doc holds nothing of the hub's until it syncs.
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
 * The person's comments the hub refused (a write it would not keep, its
 * close's reason), kept on the device apart from the doc, per artifact: the
 * host lists each with why and Send again ({@link artifact.resend}), and a
 * reload keeps them. A browser that keeps no storage keeps them in memory.
 */
const REFUSED_KEY = (id: string) => `cawco-refused-pins:${id}`;
let refusedPins: Pin[] = [];
/** A refusal's comments, until the hub's doc is in to tell which it doesn't hold. */
let refusing: { pins: Record<string, Pin>; why: string } | null = null;
const storeRefused = () => {
  if (!joined) {
    return;
  }
  try {
    if (refusedPins.length > 0) {
      localStorage.setItem(REFUSED_KEY(joined.id), JSON.stringify(refusedPins));
    } else {
      localStorage.removeItem(REFUSED_KEY(joined.id));
    }
  } catch {
    // No storage here: they stand in memory for this page's life.
  }
};
const loadRefused = (id: string) => {
  try {
    const raw = JSON.parse(localStorage.getItem(REFUSED_KEY(id)) ?? "[]");
    refusedPins = Array.isArray(raw) ? (raw as Pin[]) : [];
  } catch {
    refusedPins = [];
  }
};
/** The hub's doc is in after a refusal: each of the person's comments it doesn't hold is kept aside with the hub's reason. */
const keepRefused = () => {
  if (!refusing) {
    return;
  }
  const { pins, why } = refusing;
  refusing = null;
  const held = doc.getMap("pins");
  const gone = goneOf(doc);
  const at = new Date().toISOString();
  // One the hub holds deleted was deleted, not lost: it is not kept aside.
  const lost = Object.values(pins).filter(
    (pin) => pin.by === "person" && !held.has(pin.id) && !gone.has(pin.id)
  );
  if (lost.length === 0) {
    return;
  }
  const ids = new Set(lost.map((pin) => pin.id));
  refusedPins = [
    ...refusedPins.filter((pin) => !ids.has(pin.id)),
    ...lost.map((pin) => ({ ...pin, notSent: { at, why } })),
  ];
  storeRefused();
  watchers?.ink();
};

const connect = () => {
  if (!(syncPath && joined)) {
    return;
  }
  const at = syncPath.lastIndexOf("/");
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  const own = new WebsocketProvider(
    `${scheme}://${location.host}${syncPath.slice(0, at)}`,
    syncPath.slice(at + 1),
    doc,
    {
      disableBc: true,
      resyncInterval: RESYNC_MS,
      WebSocketPolyfill: LiveWebSocket,
      // A canvas's page is a screen: it converts the agent's writes. One
      // embedded in a decision page only shows it.
      params:
        joined.kind === "canvas" && here.tag?.dataset.embed === undefined
          ? { screen: "1" }
          : ({} as Record<string, string>),
    }
  );
  provider = own;
  linked({
    state: link.state === "lost" ? "lost" : "connecting",
    error: link.error,
  });
  // An open socket silent for core `SILENT_MS` is lost now, the host told
  // to say so at once; the watch opens it again.
  quiet?.stop();
  const silence = watchSilence(own, () => {
    linked({
      state: "lost",
      error: `Its link to ${location.host} stopped answering`,
      silent: true,
    });
  });
  quiet = silence;
  // An attempt that never opens is tried again (core doc-link.ts); the
  // second in a row that never opened says the link is lost.
  const stalls = reopenStalled(own, (inRow) => {
    if (own === provider && inRow >= STALLS_LOST) {
      linked({
        state: "lost",
        error: `Its link to ${location.host} didn't open`,
      });
    }
  });
  own.on("sync", (isSynced: boolean) => {
    if (!isSynced || own !== provider) {
      return;
    }
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
    if (event?.code !== REFUSED) {
      linked({ state: "lost", error: closedBecause(event) });
      return;
    }
    // What this page wrote the hub would not keep: start again from the
    // hub's, the device's copy of it cleared first so it never comes back.
    // The person's comments in it are never let go: once the hub's doc is
    // in, each it doesn't hold is kept aside with the hub's reason.
    const refusedCopy = kept;
    refusing = {
      pins: doc.getMap("pins").toJSON() as Record<string, Pin>,
      why: event.reason || "The hub didn't keep it.",
    };
    replaceDoc();
    watchers?.refused(event.reason);
    (refusedCopy?.clearData() ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (own === provider || provider === null) {
          keepOnDevice();
          connect();
        }
      });
  });
};

export const artifact = {
  watch: (next: Watchers) => {
    watchers = next;
  },

  /** The doc the hub embedded in the page's overlay tag, for `id`, and its kind (a page's, unless it says canvas). */
  seed: (id: string, state: string, kind: string | undefined) => {
    const update = decode(state);
    if (!update) {
      return;
    }
    try {
      applyUpdate(doc, update, "seed");
      seeded = id;
      seededKind = kind === "canvas" ? "canvas" : "page";
      handed();
    } catch {
      // Not a Yjs update: the socket brings the doc instead.
    }
  },

  /**
   * The host's word on which artifact this page is (`cawco:hello`): the doc
   * joins it, once. Null when the host named none or named it wrongly, and
   * the page runs without state.
   */
  join: (artifactValue: unknown, sync: unknown): ArtifactRef | null => {
    const raw = artifactValue as Partial<ArtifactRef> | null | undefined;
    const path = typeof sync === "string" ? sync.match(SYNC_PATH) : null;
    if (!(
      raw &&
      typeof raw.id === "string" &&
      typeof raw.name === "string" &&
      typeof raw.kind === "string" &&
      KINDS.has(raw.kind) &&
      path?.[1] === raw.id
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
      replaceDoc();
    }
    joined = { id: raw.id, kind: raw.kind, name: raw.name.slice(0, 200) };
    syncPath = sync as string;
    status = "joined";
    loadRefused(joined.id);
    keepOnDevice();
    connect();
    handed();
    return joined;
  },

  /** The host's Try again (`cawco:reconnect`): the socket closed and opened again now, not at its backoff's next turn. */
  reconnect: () => {
    provider?.disconnect();
    provider?.connect();
  },

  /** The kind of artifact this page is, once known. */
  kind: (): ArtifactRef["kind"] | null => joined?.kind ?? seededKind,

  /** The artifact this page is, by id, once known. */
  id: (): string | null => joined?.id ?? seeded,

  /** The doc as it is now: the ink (ink.ts) reads and writes its `ink`, `moved` and `pins`. */
  doc: (): Doc => doc,

  /** The person's comments the hub refused, each with its reason (`notSent`), kept on the device. */
  refused: (): Pin[] => refusedPins,

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
   * Refused comment `id` written into the doc again, for the hub to take
   * (its Send again): it leaves the device's keep; refused once more, it is
   * kept again with the new reason. False when no such comment is kept.
   */
  resend: (id: string): boolean => {
    const pin = refusedPins.find((one) => one.id === id);
    if (!pin) {
      return false;
    }
    const { notSent: _why, ...again } = pin;
    refusedPins = refusedPins.filter((one) => one.id !== id);
    storeRefused();
    doc.transact(() => doc.getMap("pins").set(id, again));
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

  state: (): State => doc.getMap("state").toJSON() as State,

  meta: () => {
    const meta = doc.getMap("meta");
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
    const state = doc.getMap("state");
    const before = state.get(change.choice) as ChoiceEntry | undefined;
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
   * beside the doc's socket. Waits for the doc to hold the hub's state first, so what
   * this page wrote is on the hub before the hub reads it.
   */
  send: async (text?: string): Promise<void> => {
    if (!syncPath) {
      throw new Error(NO_ARTIFACT);
    }
    await syncedOnce;
    const response = await fetch(`${syncPath}/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(text ? { text } : {}),
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
