import type { ArtifactChoices, ChoiceEntry } from "@cawco/core";
import {
  deletePin,
  type Pin,
  replyToPin,
  resolvePin,
  type SendBody,
} from "@cawco/core/comments";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";

/**
 * The pane's hold on an artifact's live document (Projects spec §5.10): the
 * picks and pins the session has not heard, which Send N sends, and the
 * pins' threads, which the pane's list and card read and the person writes
 * (a reply, resolve, reopen, delete). The page in the pane joins the same doc itself
 * (the overlay), which writes its picks and places its pins. Joined through
 * the preview listener's sync endpoint (`/__cawco/artifact/<id>`) under the
 * dashboard's `/preview/<id>/` proxy, which names the session.
 */

/**
 * How often the client asks the hub for its state: the hub serves no
 * awareness, so this keeps the socket heard from inside y-websocket's 30s
 * reconnect window. Our choice.
 */
const RESYNC_MS = 10_000;

/** The doc as the pane reads it. */
export interface ArtifactView extends ArtifactChoices {
  /** Ink groups the person drew that no pin stands on and no send has carried. */
  looseInk: number;
  /** The pins, by number. */
  pins: Pin[];
}

export interface ArtifactDoc {
  /** The person deletes pin `pin`, and the ink it alone stands on; a sentence when it was not. */
  delete: (pin: string) => string | null;
  destroy: () => void;
  /** The person's words in pin `pin`'s thread; a sentence when they were not kept. */
  reply: (pin: string, text: string) => string | null;
  /** The person resolves pin `pin`, or reopens it; a sentence when it was not. */
  resolve: (pin: string, resolved: boolean) => string | null;
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
  };
};

/** The doc's path on the dashboard's origin, under the preview's own prefix (`base`, the frame's `path`). */
export const artifactSyncPath = (base: string, artifactId: string): string =>
  `${base}__cawco/artifact/${artifactId}`;

/**
 * The person sends (the head's Send N): the session hears it has new
 * responses to read, with the pins' pictures, through the listener's send
 * beside the doc's socket, the path a page's `cawco.send` takes.
 */
export async function sendArtifact(
  base: string,
  artifactId: string,
  body: SendBody
): Promise<void> {
  const response = await fetch(`${artifactSyncPath(base, artifactId)}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || "The hub didn't take the send. Send again."
    );
  }
}

export function joinArtifact(
  base: string,
  artifactId: string,
  changed: (view: ArtifactView) => void
): ArtifactDoc {
  const doc = new Doc();
  doc.on("update", () => changed(viewOf(doc)));
  const path = artifactSyncPath(base, artifactId);
  const provider = new WebsocketProvider(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path.slice(0, path.lastIndexOf("/"))}`,
    artifactId,
    doc,
    { disableBc: true, resyncInterval: RESYNC_MS }
  );
  return {
    reply: (pin, text) => replyToPin(doc, pin, text),
    resolve: (pin, resolved) => resolvePin(doc, pin, resolved),
    delete: (pin) => deletePin(doc, pin),
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}
