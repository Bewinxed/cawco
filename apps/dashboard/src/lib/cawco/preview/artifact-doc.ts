import {
  type ArtifactChoices,
  CHOICE_LIMITS,
  type ChoiceChange,
  type ChoiceEntry,
  changedEntry,
  choiceEntryProblem,
} from "@cawco/core";
import { WebsocketProvider } from "y-websocket";
import { Doc } from "yjs";

/**
 * The pane's hold on an artifact's live document (Projects spec §5.10): the
 * Yjs doc the hub keeps, joined through the preview listener's sync endpoint
 * (`/__cawco/artifact/<id>`, reached under the dashboard's `/preview/<id>/`
 * proxy, which names the session). The page's bridge reads and writes the
 * doc's `state` through it; every change, the person's on another screen
 * and the agent's included, is heard back as the choices the page reads.
 */

/** The hub's close code for an update it would not keep (hub artifacts/sync.ts). */
const REFUSED = 4400;

/**
 * How often the client asks the hub for its state: the hub serves no
 * awareness, so this keeps the socket heard from inside y-websocket's 30s
 * reconnect window. Our choice.
 */
const RESYNC_MS = 10_000;

export interface ArtifactDoc {
  /** The choices as they stand: what `artifact_read` answers the page. */
  choices: () => ArtifactChoices;
  destroy: () => void;
  /** Resolves once the doc has the hub's state. */
  ready: () => Promise<void>;
  /** Writes one change into `state`; a sentence when it breaks the bridge's bounds. */
  write: (change: ChoiceChange) => string | null;
}

const choicesOf = (doc: Doc): ArtifactChoices => {
  const meta = doc.getMap("meta");
  return {
    choices: doc.getMap("state").toJSON() as Record<string, ChoiceEntry>,
    pageHash: (meta.get("pageHash") as string | undefined) ?? null,
    sentAt: (meta.get("sentAt") as string | undefined) ?? null,
  };
};

export function joinArtifact(
  instanceId: string,
  artifactId: string,
  on: {
    /** The choices after any change to the doc. */
    changed: (choices: ArtifactChoices) => void;
    /** The hub refused an update; the doc was joined again from the hub's. */
    refused: (reason: string) => void;
  }
): ArtifactDoc {
  let doc: Doc;
  let provider: WebsocketProvider;
  let synced: Promise<void>;
  const base = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/preview/${encodeURIComponent(instanceId)}/artifact/__cawco/artifact`;

  const join = () => {
    doc = new Doc();
    const own = doc;
    own.on("update", () => on.changed(choicesOf(own)));
    provider = new WebsocketProvider(base, artifactId, own, {
      disableBc: true,
      resyncInterval: RESYNC_MS,
    });
    const joined = provider;
    synced = new Promise((done) => {
      if (joined.synced) {
        done();
        return;
      }
      const heard = (isSynced: boolean) => {
        if (isSynced) {
          joined.off("sync", heard);
          done();
        }
      };
      joined.on("sync", heard);
    });
    joined.on("connection-close", (event) => {
      if (event?.code !== REFUSED || joined !== provider) {
        return;
      }
      // What this doc holds the hub would not keep: start again from the hub's.
      joined.destroy();
      own.destroy();
      on.refused(event.reason);
      join();
    });
  };
  join();

  return {
    choices: () => choicesOf(doc),
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
    ready: () => synced,
    write: (change) => {
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
      state.set(change.choice, entry);
      return null;
    },
  };
}
