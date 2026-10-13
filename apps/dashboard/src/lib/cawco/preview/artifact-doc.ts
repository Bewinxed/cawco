import type { ArtifactChoices, ChoiceEntry } from "@cawco/core";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";

/**
 * The pane's hold on an artifact's live document (Projects spec §5.10), for
 * its own head only: the picks the session has not heard, which Send sends.
 * The page in the pane joins the same doc itself (the overlay) and is the
 * one that writes it; this reads. Joined through the preview listener's
 * sync endpoint (`/__cawco/artifact/<id>`) under the dashboard's
 * `/preview/<id>/` proxy, which names the session.
 */

/**
 * How often the client asks the hub for its state: the hub serves no
 * awareness, so this keeps the socket heard from inside y-websocket's 30s
 * reconnect window. Our choice.
 */
const RESYNC_MS = 10_000;

export interface ArtifactDoc {
  /** The choices as they stand. */
  choices: () => ArtifactChoices;
  destroy: () => void;
}

const choicesOf = (doc: Doc): ArtifactChoices => {
  const meta = doc.getMap("meta");
  return {
    choices: doc.getMap("state").toJSON() as Record<string, ChoiceEntry>,
    pageHash: (meta.get("pageHash") as string | undefined) ?? null,
    sentAt: (meta.get("sentAt") as string | undefined) ?? null,
  };
};

/** The doc's path on the dashboard's origin, under the preview's own prefix (`base`, the frame's `path`). */
export const artifactSyncPath = (base: string, artifactId: string): string =>
  `${base}__cawco/artifact/${artifactId}`;

/**
 * The person sends (the head's Send): every pick to the session as one
 * message, through the listener's send beside the doc's socket, the path a
 * page's `cawco.send` takes.
 */
export async function sendArtifact(
  base: string,
  artifactId: string
): Promise<void> {
  const response = await fetch(`${artifactSyncPath(base, artifactId)}/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || "The hub didn't take the picks. Send again."
    );
  }
}

export function joinArtifact(
  base: string,
  artifactId: string,
  changed: (choices: ArtifactChoices) => void
): ArtifactDoc {
  const doc = new Doc();
  doc.on("update", () => changed(choicesOf(doc)));
  const path = artifactSyncPath(base, artifactId);
  const provider = new WebsocketProvider(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path.slice(0, path.lastIndexOf("/"))}`,
    artifactId,
    doc,
    { disableBc: true, resyncInterval: RESYNC_MS }
  );
  return {
    choices: () => choicesOf(doc),
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}
