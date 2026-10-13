/**
 * The y-websocket protocol (y-protocols/sync) for one artifact's doc, on the
 * preview listener at `/__cawco/artifact/<id>` (preview.ts). Sync only:
 * awareness, auth and awareness queries are read and ignored, so a client
 * keeps its socket fresh with its own resync (`resyncInterval`).
 *
 * A client may write the doc's `state` only, within the bridge's bounds
 * (core `choiceEntryProblem`), the same the pane checks before it writes. An
 * update that breaks them is not applied: the socket is closed with
 * {@link REFUSED} and the reason, and the client joins again from the hub's
 * doc.
 */
import { CHOICE_LIMITS, choiceEntryProblem } from "@cawco/core";
import type { ServerWebSocket } from "bun";
import { createDecoder, readVarUint, readVarUint8Array } from "lib0/decoding";
import {
  createEncoder,
  type Encoder,
  toUint8Array,
  writeVarUint,
} from "lib0/encoding";
import {
  messageYjsSyncStep1,
  messageYjsSyncStep2,
  messageYjsUpdate,
  writeSyncStep1,
  writeSyncStep2,
  writeUpdate,
} from "y-protocols/sync";
import { applyUpdate, Doc, encodeStateAsUpdate, type Map as YMap } from "yjs";
import { type ArtifactClient, type ArtifactDocs, MAPS } from "./docs";

/** y-websocket's sync message type (its server's `messageSync`). */
const MESSAGE_SYNC = 0;

/** The close code of an update the hub would not keep. */
export const REFUSED = 4400;

/** What the listener keeps on an artifact's socket. */
export interface ArtifactSocket {
  artifactId: string;
  /** The origin its updates are applied under, so they are not sent back to it. */
  origin?: { client: ArtifactClient };
}

const syncMessage = (write: (encoder: Encoder) => void) => {
  const encoder = createEncoder();
  writeVarUint(encoder, MESSAGE_SYNC);
  write(encoder);
  return toUint8Array(encoder);
};

const sameMap = (a: YMap<unknown>, b: YMap<unknown>): boolean =>
  a.size === b.size &&
  [...a.entries()].every(
    ([key, value]) => JSON.stringify(value) === JSON.stringify(b.get(key))
  );

/** Why `trial`'s state, `doc`'s after a person's update, may not be kept; null when it may. */
const stateProblem = (doc: Doc, trial: Doc): string | null => {
  for (const name of MAPS) {
    if (name !== "state" && !sameMap(trial.getMap(name), doc.getMap(name))) {
      return `A page changes its artifact's state only, not its ${name}.`;
    }
  }
  const state = trial.getMap("state");
  if (state.size > CHOICE_LIMITS.perArtifact) {
    return `An artifact keeps at most ${CHOICE_LIMITS.perArtifact} ids.`;
  }
  const before = doc.getMap("state");
  for (const [key, value] of state.entries()) {
    if (JSON.stringify(value) !== JSON.stringify(before.get(key))) {
      const problem = choiceEntryProblem(key, value);
      if (problem) {
        return problem;
      }
    }
  }
  return null;
};

/** Why `update` from a person's client may not be applied to `doc`, or null. */
export const updateProblem = (doc: Doc, update: Uint8Array): string | null => {
  const trial = new Doc();
  try {
    applyUpdate(trial, encodeStateAsUpdate(doc));
    applyUpdate(trial, update);
    return stateProblem(doc, trial);
  } catch {
    return "That is not a Yjs update.";
  } finally {
    trial.destroy();
  }
};

/** The listener's handlers for artifact sockets. */
export const artifactSocket = (docs: ArtifactDocs) => ({
  open(socket: ServerWebSocket<ArtifactSocket>) {
    const client: ArtifactClient = {
      send: (update) =>
        socket.send(syncMessage((encoder) => writeUpdate(encoder, update))),
    };
    socket.data.origin = { client };
    const doc = docs.join(socket.data.artifactId, client);
    socket.send(syncMessage((encoder) => writeSyncStep1(encoder, doc)));
  },
  message(socket: ServerWebSocket<ArtifactSocket>, message: string | Buffer) {
    if (typeof message === "string") {
      return;
    }
    const { artifactId, origin } = socket.data;
    const decoder = createDecoder(new Uint8Array(message));
    if (readVarUint(decoder) !== MESSAGE_SYNC) {
      return;
    }
    const doc = docs.doc(artifactId);
    const kind = readVarUint(decoder);
    if (kind === messageYjsSyncStep1) {
      const vector = readVarUint8Array(decoder);
      socket.send(
        syncMessage((encoder) => writeSyncStep2(encoder, doc, vector))
      );
      return;
    }
    if (kind !== messageYjsSyncStep2 && kind !== messageYjsUpdate) {
      return;
    }
    const update = readVarUint8Array(decoder);
    const problem = updateProblem(doc, update);
    if (problem) {
      socket.close(REFUSED, problem.slice(0, 120));
      return;
    }
    applyUpdate(doc, update, origin);
  },
  close(socket: ServerWebSocket<ArtifactSocket>) {
    if (socket.data.origin) {
      docs.leave(socket.data.artifactId, socket.data.origin.client);
    }
  },
});
