import type { ArtifactChoices, ChoiceEntry } from "@cawco/core";
import {
  COMMENT_LIMITS,
  type Pin,
  type SendBody,
  type ThreadEntry,
} from "@cawco/core/comments";
import { WebsocketProvider } from "y-websocket";
import { Doc, type Map as YMap } from "yjs";
import { newId } from "../id";

/**
 * The pane's hold on an artifact's live document (Projects spec §5.10): the
 * picks and pins the session has not heard, which Send N sends, and the
 * pins' threads, which the pane's list and card read and the person writes
 * (a reply, resolve, reopen). The page in the pane joins the same doc itself
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
  destroy: () => void;
  /** The person's words in pin `pin`'s thread; a sentence when they were not kept. */
  reply: (pin: string, text: string) => string | null;
  /** The person resolves pin `pin`, or reopens it. */
  resolve: (pin: string, resolved: boolean) => void;
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
 * The person sends (the head's Send N): every unsent pick, pin and thread
 * entry to the session as one message, with the pins' pictures, through the
 * listener's send beside the doc's socket, the path a page's `cawco.send`
 * takes.
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
  const pins = () => doc.getMap("pins") as YMap<Pin>;
  return {
    reply: (id, text) => {
      const pin = pins().get(id);
      if (!pin) {
        return "This pin is gone from the page, so the reply wasn't kept.";
      }
      if (text.length > COMMENT_LIMITS.text) {
        return `A reply holds ${COMMENT_LIMITS.text.toLocaleString()} characters, so this one wasn't kept. Shorten it, then reply again.`;
      }
      if (pin.thread.length >= COMMENT_LIMITS.entries) {
        return `This thread holds ${COMMENT_LIMITS.entries} entries, so the reply wasn't kept. Start a new pin.`;
      }
      const entry: ThreadEntry = {
        id: newId(),
        by: "person",
        text,
        at: new Date().toISOString(),
      };
      doc.transact(() =>
        pins().set(id, { ...pin, thread: [...pin.thread, entry] })
      );
      return null;
    },
    resolve: (id, resolved) => {
      const pin = pins().get(id);
      if (!pin) {
        return;
      }
      const { resolvedAt: _was, ...rest } = pin;
      doc.transact(() =>
        pins().set(
          id,
          resolved ? { ...rest, resolvedAt: new Date().toISOString() } : rest
        )
      );
    },
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}
