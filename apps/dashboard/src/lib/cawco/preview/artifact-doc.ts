import type { ArtifactChoices, ChoiceEntry } from "@cawco/core";
import {
  deletePin,
  type Pin,
  replyToPin,
  resolvePin,
  withdrawPin,
} from "@cawco/core/comments";
import {
  ARTIFACT_GONE,
  deviceDocName,
  RESYNC_MS,
  reopenStalled,
  tendDeviceDocs,
} from "@cawco/core/doc-link";
import type { StageState } from "@cawco/core/stage";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";
import { hubRefusal } from "#lib/cawco/hub-read.js";

/**
 * The pane's hold on an artifact's live document (Projects spec §5.10): the
 * pins' threads, which the pane's list and card read and the person writes
 * (a reply, resolve, reopen, delete); the hub delivers them to the session
 * by themselves once quiet (artifacts/service.ts). The page in the pane joins the same doc itself
 * (the overlay), on its own preview origin, which writes its picks and
 * places its pins; the pane joins it on the dashboard's origin, through the
 * hub's `/ws/artifact/<session>/<artifact>`. Each keeps the doc on its
 * device as well (y-indexeddb), so what the person writes while a link is
 * down stays through a reload and goes to the hub as it syncs again.
 */

/**
 * How long a link may go on dropping before the pane says so, ms: the
 * pane's own before its first sync and after it, and the page's
 * (PreviewPane's `pageDown`). y-websocket reopens a dropped socket within
 * 2.5 s, so a drop a reconnect fixes (a proxy's or tunnel's, a hub or
 * dashboard restarting) is over well inside it. Our call.
 */
export const LINK_DOWN_MS = 15_000;

/** A link of the comments' down past {@link LINK_DOWN_MS} (PreviewPane's `linkDown`): what happened, as the Comments control says it. */
export const NOT_REACHING = "Comments aren't reaching the agent";
/** …and in the Comments panel, with why as its own sentence (WORDS.md's error formula); Try again is the way on. */
export const LINK_DROPPED = `${NOT_REACHING}. The link to the hub dropped.`;

/** The doc as the pane reads it. */
export interface ArtifactView extends ArtifactChoices {
  /** Ink groups the person drew that no pin stands on and no delivery has carried. */
  looseInk: number;
  /** The pins, by number. */
  pins: Pin[];
  /** When the session last changed it, a revision or a new ask (`meta.revisedAt`): a Send after it is unanswered. */
  revisedAt: string | null;
  /** A sheet's stage, as the hub keeps it (live components): its status and the errors in the modules the sheet imports. */
  stage: StageState | null;
}

/**
 * Whether the pane holds the hub's doc yet: `reading` until its first sync
 * lands, `synced` from then on, `failed` before it ever synced when the hub
 * refused the link, or when the link has dropped for {@link LINK_DOWN_MS}
 * with y-websocket reopening it, with why as a sentence of its own; `lost`
 * when it has dropped that long after it, the last good view kept (as the
 * board does). A sync after either clears it.
 */
export type DocSync =
  | { state: "reading" }
  | { state: "synced" }
  | { state: "failed"; why: string }
  | { state: "lost"; why: string };

/**
 * What the Comments list stands on: `quiet` while the first sync is inside
 * `--dur-wait-grace` (nothing said), `reading` past it, `ready` once held,
 * or why it couldn't be read.
 */
export type ListHold = "quiet" | "reading" | "ready" | { failed: string };

export interface ArtifactDoc {
  /** The person deletes pin `pin`, and the ink it alone stands on; a sentence when it was not. */
  delete: (pin: string) => string | null;
  destroy: () => void;
  /** The person's words in pin `pin`'s thread; a sentence when they were not kept. */
  reply: (pin: string, text: string) => string | null;
  /** The person resolves pin `pin`, or reopens it; a sentence when it was not. */
  resolve: (pin: string, resolved: boolean) => string | null;
  /** Try again on a link that failed or stands lost: a new socket now (reading again before the first sync). */
  retry: () => void;
  /** The person dismissed pin `pin`'s card having said nothing in it: the pin is taken back (core `withdrawPin`). */
  withdraw: (pin: string) => void;
}

/** A sentence's last mark. */
const ENDS_SENTENCE = /[.!?]$/;

/** Why the hub refused the link for good (y-websocket's `closed`), as its own sentence: its reason when it gave one. */
const refusedWhy = ({ code, reason }: { code: number; reason: string }) => {
  const said = reason.trim();
  if (said) {
    return ENDS_SENTENCE.test(said) ? said : `${said}.`;
  }
  return `The hub refused the link (${code}).`;
};

/** Why the link is down after {@link LINK_DOWN_MS} of reconnects: the last close's code, or attempts that never opened. */
const downWhy = (code: number | null): string =>
  `${code === null ? "The link to the hub didn't open" : `The link to the hub dropped (${code})`} and hasn't come back. It keeps trying by itself; Try again tries now.`;

const viewOf = (doc: Doc): ArtifactView => {
  const meta = doc.getMap("meta");
  const pins = Object.values(
    doc.getMap("pins").toJSON() as Record<string, Pin>
  );
  const pinned = new Set(pins.map((pin) => pin.ink));
  const looseInk = Object.values(
    doc.getMap("ink").toJSON() as Record<
      string,
      { id: string; sentAt?: string }
    >
  ).filter((group) => !(group.sentAt || pinned.has(group.id))).length;
  return {
    choices: doc.getMap("state").toJSON() as Record<string, ChoiceEntry>,
    pageHash: (meta.get("pageHash") as string | undefined) ?? null,
    sentAt: (meta.get("sentAt") as string | undefined) ?? null,
    pins: pins.sort((a, b) => a.number - b.number),
    revisedAt: (meta.get("revisedAt") as string | undefined) ?? null,
    looseInk,
    stage: (meta.get("stage") as StageState | undefined) ?? null,
  };
};

/** Where the page itself joins the doc: the path on its own preview origin, which the hello names. */
export const artifactSyncPath = (artifactId: string): string =>
  `/__cawco/artifact/${artifactId}`;

/**
 * The person sends the page's picks (the head's Send picks): the session
 * hears it has new responses to read, through the hub's send on the
 * dashboard's own origin, the one a page's `cawco.send` reaches on its
 * preview origin.
 */
export async function sendArtifact(
  instanceId: string,
  artifactId: string
): Promise<void> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/artifacts/${encodeURIComponent(artifactId)}/send`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    }
  );
  if (!response.ok) {
    throw await hubRefusal(response, "so the picks weren't taken. Send again.");
  }
}

/** The hub's close code for an update it would not keep (hub artifacts/sync.ts `REFUSED`). */
const REFUSED = 4400;

/**
 * Joins the artifact's doc: `changed` hears every view of it, each sync's
 * too (an empty doc's first), and `synced` hears whether it is held yet
 * ({@link DocSync}), starting at `reading`. The socket is kept as core
 * doc-link.ts says: y-websocket's resync is its keepalive, a drop is
 * reopened by y-websocket itself and resyncs, an attempt that never opens
 * is tried again. A write of the pane's the hub would not keep closes the
 * socket with {@link REFUSED}, which y-websocket never reopens: the pane
 * starts again from the hub's doc, as the page's overlay does, and
 * `refused` hears the hub's reason.
 */
export function joinArtifact(
  instanceId: string,
  artifactId: string,
  changed: (view: ArtifactView) => void,
  synced: (sync: DocSync) => void,
  refused: (why: string) => void
): ArtifactDoc {
  // The hub's `/ws/artifact/<session>/<artifact>`, through the dashboard's
  // own `/ws` relay: never the preview's origin, which is the page's.
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/artifact/${encodeURIComponent(instanceId)}`;
  let held = false;
  /** The pane let it go: a rejoin still queued doesn't start. */
  let gone = false;
  /** The pane is closing its own socket (Try again, a rejoin, its end): not a drop. */
  let closingOurs = false;
  /** Running from a drop until a sync: says the link down at its end. */
  let downTimer: ReturnType<typeof setTimeout> | undefined;
  /** The last drop's close code; null when the attempts never opened. */
  let lastDrop: number | null = null;
  /** The link was said lost after the first sync: the next sync says it back. */
  let lost = false;

  const watchStalls = (joined: WebsocketProvider) =>
    reopenStalled(joined, () => dropped(null));

  const ours = (close: () => void) => {
    closingOurs = true;
    try {
      close();
    } finally {
      closingOurs = false;
    }
  };

  const clearDown = () => {
    clearTimeout(downTimer);
    downTimer = undefined;
  };

  /**
   * The link dropped: y-websocket reopens it, and only a link still down
   * after LINK_DOWN_MS is said, `failed` before the first sync and `lost`
   * after it.
   */
  function dropped(code: number | null) {
    lastDrop = code;
    if (downTimer !== undefined) {
      return;
    }
    downTimer = setTimeout(() => {
      downTimer = undefined;
      if (gone) {
        return;
      }
      if (held) {
        lost = true;
        synced({ state: "lost", why: downWhy(lastDrop) });
      } else {
        synced({ state: "failed", why: downWhy(lastDrop) });
      }
    }, LINK_DOWN_MS);
  }

  /**
   * `into` kept on the device, and the device's copies of artifacts no one
   * has opened lately let go (core `tendDeviceDocs`); none where the browser
   * keeps no IndexedDB.
   */
  function keepOnDevice(into: Doc): IndexeddbPersistence | null {
    try {
      if (!globalThis.indexedDB) {
        return null;
      }
    } catch {
      return null;
    }
    tendDeviceDocs(artifactId);
    return new IndexeddbPersistence(deviceDocName(artifactId), into);
  }

  let doc = new Doc();
  let kept = keepOnDevice(doc);
  let provider = join(doc);
  let stalls = watchStalls(provider);

  function join(into: Doc): WebsocketProvider {
    into.on("update", () => changed(viewOf(into)));
    const joined = new WebsocketProvider(url, artifactId, into, {
      disableBc: true,
      resyncInterval: RESYNC_MS,
    });
    joined.on("sync", (now: boolean) => {
      if (!now) {
        return;
      }
      clearDown();
      changed(viewOf(into));
      if (!held || lost) {
        held = true;
        lost = false;
        synced({ state: "synced" });
      }
    });
    joined.on("connection-close", (event: CloseEvent | null) => {
      if (event?.code === REFUSED) {
        refused(refusedWhy(event));
        // Out of y-websocket's own close handling first, then a doc of the hub's.
        queueMicrotask(again);
        return;
      }
      // The artifact was removed: nothing of it is kept on the device, and it is no drop to say.
      if (event?.code === ARTIFACT_GONE) {
        kept?.clearData().catch(() => undefined);
        kept = null;
        return;
      }
      // y-websocket's own null close is its no-message check on an open
      // socket: a drop like any other. A stalled attempt's is said by its watch.
      if (!(closingOurs || stalls.reopening())) {
        dropped(event?.code ?? null);
      }
    });
    // A close y-websocket won't reopen (4400–4499): the hub refused the link, said at once.
    joined.on("closed", (close) => {
      if (close.code !== REFUSED && !held) {
        clearDown();
        synced({ state: "failed", why: refusedWhy(close) });
      }
    });
    return joined;
  }

  /**
   * What the pane wrote the hub would not keep: start again from the hub's
   * doc, the device's copy of it cleared first so it never comes back.
   */
  function again() {
    if (gone) {
      return;
    }
    stalls.stop();
    ours(() => provider.destroy());
    const refusedCopy = kept;
    kept = null;
    doc.destroy();
    doc = new Doc();
    const fresh = doc;
    (refusedCopy?.clearData() ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (!gone && doc === fresh) {
          kept = keepOnDevice(fresh);
          provider = join(fresh);
          stalls = watchStalls(provider);
        }
      });
  }

  return {
    reply: (pin, text) => replyToPin(doc, pin, text),
    resolve: (pin, resolved) => resolvePin(doc, pin, resolved),
    delete: (pin) => deletePin(doc, pin),
    retry: () => {
      clearDown();
      if (!held) {
        synced({ state: "reading" });
      }
      ours(() => provider.disconnect());
      provider.connect();
    },
    withdraw: (pin) => withdrawPin(doc, pin),
    destroy: () => {
      gone = true;
      clearDown();
      stalls.stop();
      ours(() => provider.destroy());
      doc.destroy();
    },
  };
}
