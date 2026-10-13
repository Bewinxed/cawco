/// <reference lib="dom" />

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
 */
import {
  CHOICE_LIMITS,
  type ChoiceChange,
  type ChoiceEntry,
  changedEntry,
  choiceEntryProblem,
} from "@cawco/core/choices";
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

/** The hub's close code for an update it would not keep (hub artifacts/sync.ts). */
const REFUSED = 4400;

/**
 * How often the client asks the hub for its state: the hub serves no
 * awareness, so this keeps the socket heard from inside y-websocket's 30s
 * reconnect window. Our choice, as the pane's.
 */
const RESYNC_MS = 10_000;

const KINDS = new Set(["page", "canvas", "preview"]);

/** Where an artifact's doc is synced: the listener's path, under the dashboard's preview prefix in its frame. */
const SYNC_PATH =
  /^\/(?:preview\/[^/]+\/[^/]+\/)?__cawco\/artifact\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export const NO_ARTIFACT = "This page has no artifact to keep its state in.";

export interface ArtifactRef {
  id: string;
  kind: "page" | "canvas" | "preview";
  name: string;
}

export type State = Record<string, ChoiceEntry>;

export interface Watchers {
  /** The ink, its moved groups or its pins changed, here or elsewhere; or the doc was replaced. */
  ink: () => void;
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
  ref: ArtifactRef | null;
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
/** The artifact the page's doc is: told by the host, or embedded by the hub before that. */
let joined: ArtifactRef | null = null;
let seeded: string | null = null;
/** The kind the hub embedded with the doc, before the host names it. */
let seededKind: ArtifactRef["kind"] | null = null;
let syncPath: string | null = null;
const holders = new Set<(hold: ArtifactHold) => void>();
let generation = 0;
const hold = (): ArtifactHold => ({
  doc,
  generation,
  ref: joined,
  sync: syncPath,
});
const handed = () => {
  for (const holder of holders) {
    holder(hold());
  }
};

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
    own.getMap(name).observe(() => {
      if (own === doc) {
        watchers?.ink();
      }
    });
  }
};
observe(doc);

/** Starts a fresh doc in place of the one held (another artifact's, or one the hub refused). */
const replaceDoc = () => {
  provider?.destroy();
  provider = null;
  doc.destroy();
  doc = new Doc();
  generation += 1;
  observe(doc);
  synced = false;
  syncedOnce = new Promise<void>((resolve) => {
    whenSynced = resolve;
  });
  watchers?.state(null, true);
  watchers?.ink();
  handed();
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
      // A canvas's page is a screen: it converts the agent's writes.
      params:
        joined.kind === "canvas"
          ? { screen: "1" }
          : ({} as Record<string, string>),
    }
  );
  provider = own;
  own.on("sync", (isSynced: boolean) => {
    if (isSynced && own === provider && !synced) {
      synced = true;
      whenSynced();
      watchers?.synced();
    }
  });
  own.on("connection-close", (event) => {
    if (event?.code !== REFUSED || own !== provider) {
      return;
    }
    // What this page wrote the hub would not keep: start again from the hub's.
    replaceDoc();
    watchers?.refused(event.reason);
    connect();
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
    if (
      !(
        raw &&
        typeof raw.id === "string" &&
        typeof raw.name === "string" &&
        typeof raw.kind === "string" &&
        KINDS.has(raw.kind) &&
        path?.[1] === raw.id
      )
    ) {
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
    connect();
    handed();
    return joined;
  },

  /** The kind of artifact this page is, once known. */
  kind: (): ArtifactRef["kind"] | null => joined?.kind ?? seededKind,

  /** The doc as it is now: the ink (ink.ts) reads and writes its `ink`, `moved` and `pins`. */
  doc: (): Doc => doc,

  /** Whether there is a doc to keep ink in: the host named the artifact, or the hub embedded it. */
  keeps: () => status === "joined" || seeded !== null,

  /** Whether the doc holds the hub's state: embedded, or synced. */
  known: () => synced || seeded !== null,

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
   * The person sends (`cawco.send`): every pick to the session as one
   * message, `text` below them, through the listener's send beside the
   * doc's socket. Waits for the doc to hold the hub's state first, so what
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
};
