import type { ArtifactChoices, ChoiceEntry } from "@cawco/core";
import {
  deletePin,
  type Pin,
  replyToPin,
  resolvePin,
  withdrawPin,
} from "@cawco/core/comments";
import type { StageState } from "@cawco/core/stage";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";

/**
 * The pane's hold on an artifact's live document (Projects spec §5.10): the
 * pins' threads, which the pane's list and card read and the person writes
 * (a reply, resolve, reopen, delete); the hub delivers them to the session
 * by themselves once quiet (artifacts/service.ts). The page in the pane joins the same doc itself
 * (the overlay), on its own preview origin, which writes its picks and
 * places its pins; the pane joins it on the dashboard's origin, through the
 * hub's `/ws/artifact/<session>/<artifact>`.
 */

/**
 * How often the client asks the hub for its state: the hub serves no
 * awareness, so this keeps the socket heard from inside y-websocket's 30s
 * reconnect window. Our choice.
 */
const RESYNC_MS = 10_000;

/** The doc as the pane reads it. */
export interface ArtifactView extends ArtifactChoices {
  /** Ink groups the person drew that no pin stands on and no delivery has carried. */
  looseInk: number;
  /** The pins, by number. */
  pins: Pin[];
  /** A sheet's stage, as the hub keeps it (live components): its status and the errors in the modules the sheet imports. */
  stage: StageState | null;
}

export interface ArtifactDoc {
  /** The person deletes pin `pin`, and the ink it alone stands on; a sentence when it was not. */
  delete: (pin: string) => string | null;
  destroy: () => void;
  /** The person's words in pin `pin`'s thread; a sentence when they were not kept. */
  reply: (pin: string, text: string) => string | null;
  /** The person resolves pin `pin`, or reopens it; a sentence when it was not. */
  resolve: (pin: string, resolved: boolean) => string | null;
  /** The person dismissed pin `pin`'s card having said nothing in it: the pin is taken back (core `withdrawPin`). */
  withdraw: (pin: string) => void;
}

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
    throw new Error(
      (await response.text()) || "The hub didn't take the picks. Send again."
    );
  }
}

export function joinArtifact(
  instanceId: string,
  artifactId: string,
  changed: (view: ArtifactView) => void
): ArtifactDoc {
  const doc = new Doc();
  doc.on("update", () => changed(viewOf(doc)));
  // The hub's `/ws/artifact/<session>/<artifact>`, through the dashboard's
  // own `/ws` relay: never the preview's origin, which is the page's.
  const provider = new WebsocketProvider(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/artifact/${encodeURIComponent(instanceId)}`,
    artifactId,
    doc,
    { disableBc: true, resyncInterval: RESYNC_MS }
  );
  return {
    reply: (pin, text) => replyToPin(doc, pin, text),
    resolve: (pin, resolved) => resolvePin(doc, pin, resolved),
    delete: (pin) => deletePin(doc, pin),
    withdraw: (pin) => withdrawPin(doc, pin),
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}
