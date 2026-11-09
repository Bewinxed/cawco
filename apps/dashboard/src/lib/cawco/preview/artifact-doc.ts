import {
  type ArtifactChoices,
  type ChoiceEntry,
  choiceEntryProblem,
} from "@cawco/core/choices";
import {
  type ActivityLine,
  activityOf,
  deletePin,
  goneOf,
  honourDeletions,
  lostWrites,
  type Pin,
  type RefusedWrites,
  readPins,
  replyToPin,
  resolvePin,
  type Said,
  type SendBody,
  seeChanges,
  seenOf,
  seePin,
  sendHeld,
} from "@cawco/core/comments/model";
import {
  ARTIFACT_GONE,
  deviceDocName,
  RESYNC_MS,
  reopenStalled,
  tendDeviceDocs,
  watchSilence,
} from "@cawco/core/doc-link";
import type { ArtifactChanges } from "@cawco/core/doc-meta";
import { docMeta, getMeta } from "@cawco/core/doc-meta";
import { hubRequest } from "@cawco/core/hub-request";
import type { StageState, StageUnreached } from "@cawco/core/stage";
import {
  keepTuned,
  TUNED_MAP,
  type TunedRecord,
  tunedEntryOf,
} from "@cawco/core/tuned";
import { commentWords } from "@cawco/core/words/comments";
import { IndexeddbPersistence } from "y-indexeddb";
import { readAuthMessage } from "y-protocols/auth";
import { messageAuth, WebsocketProvider } from "y-websocket";
import { applyUpdate, Doc, encodeStateAsUpdate } from "yjs";
import { hubFetch, hubRefusal } from "#lib/platform/hub-read.js";
import { openPageWrites } from "./open-pages";

/**
 * The pane's hold on an artifact's live document (Projects spec §5.10): the
 * pins' threads, which the pane's rail and cards read and the person writes
 * (a reply, resolve, reopen, delete); the hub delivers them to the session
 * on the person's Send (artifacts/service.ts). The page in the pane joins the same doc itself
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
 * dashboard restarting) is over well inside it. A link found silent (core
 * doc-link.ts `watchSilence`) is said at once: its silence was the grace.
 * Our call.
 */
export const LINK_DOWN_MS = 15_000;

/** A link of the comments' down past {@link LINK_DOWN_MS} (PreviewPane's `linkDown`): what happened, as the Comments control says it. */
export const NOT_REACHING = "Comments aren't reaching the agent";
/** …and in the Comments panel, with why as its own sentence (DESIGN.md's error formula); Try again is the way on. */
export const LINK_DROPPED = `${NOT_REACHING}. The link to the hub dropped.`;

/** The doc as the pane reads it. */
export interface ArtifactView extends ArtifactChoices {
  /** Each pin's lines of what changed for it, by pin id (the doc's `activity`, the hub's). */
  activity: Readonly<Record<string, ActivityLine[]>>;
  /** What changed since the person looked, as the hub read it (`meta.changes`); null before any revision did. */
  changes: ArtifactChanges | null;
  /** A decision page, carrying its own Send at its foot (`meta.ownSend`): the panel's head stands none for it. */
  ownSend: boolean;
  /** The pins, by number. */
  pins: Pin[];
  /** When the session last changed it, a revision or a new ask (`meta.revisedAt`): a Send after it is unanswered. */
  revisedAt: string | null;
  /** The anchors of the latest changes the person has looked at (the doc's `seen`, core `seenOf`). */
  seen: ReadonlySet<string>;
  /** A sheet's stage, as the hub keeps it (live components): its status and the errors in the modules the sheet imports. */
  stage: StageState | null;
  /** A component's tuned timing, every move's records (the doc's `tuned` map, core tuned.ts). */
  tuned: TunedRecord[];
  /** The hub's last read couldn't reach the stage (`meta.unreached`): which hop, why, since when. */
  unreached: StageUnreached | null;
}

/**
 * Whether the pane holds the hub's doc yet: `reading` until its first sync
 * lands, `synced` from then on, `failed` before it ever synced when the hub
 * refused the link, or when the link has dropped for {@link LINK_DOWN_MS}
 * with y-websocket reopening it or its socket fell silent, with why as a
 * sentence of its own; `lost` when either happens after it, the last good view kept (as the
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
  /**
   * A value kept under `key` on a page, as its own `cawco.set` keeps one
   * (a setup's stages, drawn as the board in the project's page): the hub
   * takes it within the bridge's bounds (core `choiceEntryProblem`); a
   * sentence when it was not kept.
   */
  keep: (key: string, value: unknown) => string | null;
  /**
   * A component's tuned timing kept, every move's records (core tuned.ts
   * `keepTuned`: the doc's `tuned` map, a move each, within its own bounds,
   * never a choice entry's); a sentence when it was not kept.
   */
  keepTuned: (records: readonly TunedRecord[]) => string | null;
  /** The person's words, and what they attached, in pin `pin`'s thread; a sentence when they were not kept. */
  reply: (pin: string, said: Said) => string | null;
  /** The person resolves pin `pin`, or reopens it; a sentence when it was not. */
  resolve: (pin: string, resolved: boolean) => string | null;
  /** Try again on a link that failed or stands lost: a new socket now (reading again before the first sync). */
  retry: () => void;
  /** The person looked at pin `pin`'s thread: what the agent answered there is seen. */
  see: (pin: string) => void;
  /** The person looked at these of revision `revision`'s changes: each is seen. */
  seeChanges: (revision: number, anchors: string[]) => void;
  /** The person's Send all: every comment and reply they held let go with `note` (core `sendHeld`); a sentence when nothing went. */
  sendHeld: (note: string) => string | null;
}

/** A sentence's last mark. */
const ENDS_SENTENCE = /[.!?]$/u;

/** Why the hub refused the link for good (y-websocket's `closed`), as its own sentence: its reason when it gave one. */
const refusedWhy = ({ code, reason }: { code: number; reason: string }) => {
  const said = reason.trim();
  if (said) {
    return ENDS_SENTENCE.test(said) ? said : `${said}.`;
  }
  return `The hub refused the link (${code}).`;
};

/** What happens next while the link is down, and the way on. */
const KEEPS_TRYING = "It keeps trying by itself; Try again tries now.";

/** Why the link is down after {@link LINK_DOWN_MS} of reconnects: the last close's code, or attempts that never opened. */
const downWhy = (code: number | null): string =>
  `${code === null ? "The link to the hub didn't open" : `The link to the hub dropped (${code})`} and hasn't come back. ${KEEPS_TRYING}`;

/** Why the link is down when its open socket heard nothing for core `SILENT_MS`. */
const SILENT_WHY = `The link to the hub stopped answering. ${KEEPS_TRYING}`;

const viewOf = (doc: Doc): ArtifactView => {
  const meta = docMeta(doc);
  const gone = goneOf(doc);
  // One its tombstone names is deleted, though a merge wrote it a moment ago.
  const pins = [...readPins(doc).values()].filter((pin) => !gone.has(pin.id));
  const changes = meta.get("changes") ?? null;
  return {
    activity: activityOf(doc).toJSON() as Record<string, ActivityLine[]>,
    changes,
    seen: new Set(
      changes ? (seenOf(doc).get(String(changes.revision)) ?? []) : []
    ),
    choices: doc.getMap("state").toJSON() as Record<string, ChoiceEntry>,
    pageHash: meta.get("pageHash") ?? null,
    sentAt: meta.get("sentAt") ?? null,
    ownSend: meta.get("ownSend") === true,
    pins: pins.sort((a, b) => a.number - b.number),
    revisedAt: meta.get("revisedAt") ?? null,
    stage: meta.get("stage") ?? null,
    unreached: meta.get("unreached") ?? null,
    tuned:
      (tunedEntryOf(doc.getMap(TUNED_MAP).toJSON())?.value as
        TunedRecord[] | undefined) ?? [],
  };
};

/** Where the page itself joins the doc: the path on its own preview origin, which the hello names. */
export const artifactSyncPath = (artifactId: string): string =>
  `/__cawco/artifact/${artifactId}`;

/** The hub's send on the dashboard's own origin, the one a page's `cawco.send` reaches on its preview origin. */
async function postSend(
  instanceId: string,
  artifactId: string,
  body: Pick<SendBody, "again" | "control" | "pins" | "writes">,
  again: string
): Promise<void> {
  const response = await hubFetch(
    hubRequest("POST /api/instances/:id/artifacts/:artifact/send", {
      path: { id: instanceId, artifact: artifactId },
      body,
    })
  );
  if (!response.ok) {
    throw await hubRefusal(response, again);
  }
}

/**
 * The person's Send (the head's, a Needs you row's, named by `control`):
 * the page's picks go to the session, carrying what a frame open on it in
 * this tab shows that the hub isn't known to hold (open-pages.ts); with
 * none open, the hub's doc is what goes. Their comments go by themselves.
 */
export const sendArtifact = async (
  instanceId: string,
  artifactId: string,
  control: "needs-you" | "panel-head" | "panel-more"
): Promise<void> => {
  const writes = await openPageWrites(artifactId);
  await postSend(
    instanceId,
    artifactId,
    { control, ...(writes ? { writes } : {}) },
    commentWords.notSentThen
  );
};

/** A comment's Try again, after a delivery no one took: it goes to the session now. */
export const retryComment = (
  instanceId: string,
  artifactId: string,
  pin: string
): Promise<void> =>
  postSend(instanceId, artifactId, { pins: [pin] }, commentWords.notGoneThen);

/** A comment's Ask again: an update changed what it stands on with no answer, so it goes to the session again, whole. */
export const askAgain = (
  instanceId: string,
  artifactId: string,
  pin: string
): Promise<void> =>
  postSend(
    instanceId,
    artifactId,
    { again: [pin] },
    "so the comment wasn't asked again. Ask again."
  );

/**
 * Joins the artifact's doc: `changed` hears every view of it, each sync's
 * too (an empty doc's first), and `synced` hears whether it is held yet
 * ({@link DocSync}), starting at `reading`. The socket is kept as core
 * doc-link.ts says: y-websocket's resync is its keepalive, a drop is
 * reopened by y-websocket itself and resyncs, an attempt that never opens
 * is tried again, and an open socket silent for core `SILENT_MS` is said
 * down at once and opened again. A write of the pane's the hub would not
 * keep is said on the socket, which stays (hub artifacts/sync.ts
 * `refusal`): `refused` hears the hub's reason and what of the person's
 * the hub didn't keep (core `lostWrites`: replies, resolves, deletes, Send
 * all and its note), so each is kept aside where it was made; then the pane
 * goes on in a fresh doc, a new Yjs client, on a socket of its own, as the
 * page's overlay does (Yjs takes one client's updates in clock order only,
 * so the old one's would all wait on the refused write).
 */
export function joinArtifact(
  instanceId: string,
  artifactId: string,
  changed: (view: ArtifactView) => void,
  synced: (sync: DocSync) => void,
  refused: (why: string, lost: RefusedWrites) => void
): ArtifactDoc {
  // The hub's `/ws/artifact/<session>/<artifact>`, through the dashboard's
  // own `/ws` relay: never the preview's origin, which is the page's.
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/artifact/${encodeURIComponent(instanceId)}`;
  let held = false;
  /** The pane let it go: a rejoin still queued doesn't start. */
  let gone = false;
  /** A refusal's reason and a copy of the refused doc, until the fresh doc has the hub's (core `lostWrites`). */
  let refusing: { refused: Doc; why: string } | null = null;
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

  /** An open socket that heard nothing for core `SILENT_MS`: said at once, the silence its grace; the watch reopens it. */
  const watchQuiet = (joined: WebsocketProvider) =>
    watchSilence(
      joined,
      () => {
        clearDown();
        sayDown(SILENT_WHY);
      },
      document
    );

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
      if (!gone) {
        sayDown(downWhy(lastDrop));
      }
    }, LINK_DOWN_MS);
  }

  /** The link said down now, `why`: `failed` before the first sync, `lost` after it. */
  function sayDown(why: string) {
    if (held) {
      lost = true;
      synced({ state: "lost", why });
    } else {
      synced({ state: "failed", why });
    }
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
  let quiet = watchQuiet(provider);

  function join(into: Doc): WebsocketProvider {
    // A pin deleted anywhere stays deleted here (core `honourDeletions`).
    honourDeletions(into);
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
      // The hub's doc is in after a refusal: what of the person's it holds
      // not is theirs to keep aside.
      if (refusing && into === doc) {
        const { refused: was, why } = refusing;
        refusing = null;
        refused(why, lostWrites(was, into));
        was.destroy();
      }
      if (!held || lost) {
        held = true;
        lost = false;
        synced({ state: "synced" });
      }
    });
    // The hub's word that it would not keep a write of the pane's (hub
    // artifacts/sync.ts `refusal`, y-protocols' permission denied).
    joined.messageHandlers[messageAuth] = (_encoder, decoder) =>
      readAuthMessage(decoder, into, (_doc, reason) => {
        if (joined === provider) {
          refusedBy(reason, into);
        }
      });
    joined.on("connection-close", (event: CloseEvent | null) => {
      // The artifact was removed: nothing of it is kept on the device, and it is no drop to say.
      if (event?.code === ARTIFACT_GONE) {
        kept?.clearData().catch(() => undefined);
        kept = null;
        return;
      }
      // y-websocket's own null close is its no-message check on an open
      // socket: a drop like any other. A stalled attempt's and a silent
      // socket's are said by their watches.
      if (!(closingOurs || stalls.reopening() || quiet.reopening())) {
        dropped(event?.code ?? null);
      }
    });
    // A close y-websocket won't reopen (4400–4499): the hub refused the link, said at once.
    joined.on("closed", (close) => {
      if (!held) {
        clearDown();
        synced({ state: "failed", why: refusedWhy(close) });
      }
    });
    return joined;
  }

  /**
   * The hub would not keep a write of the pane's: the reason and what of
   * the person's `from` held that the hub's doc doesn't go to `refused`,
   * which keeps the person's refused writes aside, and the pane goes on in a fresh doc ({@link again}).
   */
  function refusedBy(reason: string, from: Doc) {
    const said = reason.trim() || "The hub didn't keep it.";
    // The refused doc as it stood, kept until the hub's is in: what of the
    // person's it held that the hub's doesn't is theirs to keep aside.
    const copy = new Doc();
    applyUpdate(copy, encodeStateAsUpdate(from));
    refusing?.refused.destroy();
    refusing = {
      why: ENDS_SENTENCE.test(said) ? said : `${said}.`,
      refused: copy,
    };
    // Out of y-websocket's own message handling first.
    queueMicrotask(again);
  }

  /**
   * After a refused write: a fresh doc of the hub's, a new Yjs client on a
   * socket of its own, the device's copy of the old one cleared first so
   * the refused write never comes back into it.
   */
  function again() {
    if (gone) {
      return;
    }
    stalls.stop();
    quiet.stop();
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
          quiet = watchQuiet(provider);
        }
      });
  }

  return {
    reply: (pin, said) => replyToPin(doc, pin, said),
    resolve: (pin, resolved) => resolvePin(doc, pin, resolved),
    sendHeld: (note) => {
      const sent = sendHeld(doc, note);
      return typeof sent === "string" ? sent : null;
    },
    see: (pin) => seePin(doc, pin, new Date().toISOString()),
    seeChanges: (revision, anchors) => seeChanges(doc, revision, anchors),
    delete: (pin) => deletePin(doc, pin),
    keep: (key, value) => {
      const pageHash = getMeta(doc, "pageHash");
      if (typeof pageHash !== "string") {
        return "The page has not loaded yet, so nothing was kept.";
      }
      const entry: ChoiceEntry = {
        options: [],
        note: null,
        value,
        pageHash,
        at: new Date().toISOString(),
      };
      const problem = choiceEntryProblem(key, entry);
      if (problem) {
        return problem;
      }
      doc.getMap("state").set(key, entry);
      return null;
    },
    keepTuned: (records) => {
      const pageHash = getMeta(doc, "pageHash");
      if (typeof pageHash !== "string") {
        return "The page has not loaded yet, so nothing was kept.";
      }
      keepTuned(doc, records, pageHash, new Date().toISOString());
      return null;
    },
    retry: () => {
      clearDown();
      if (!held) {
        synced({ state: "reading" });
      }
      ours(() => provider.disconnect());
      provider.connect();
    },
    destroy: () => {
      gone = true;
      refusing?.refused.destroy();
      refusing = null;
      clearDown();
      stalls.stop();
      quiet.stop();
      ours(() => provider.destroy());
      doc.destroy();
    },
  };
}
