/**
 * The sockets artifacts' own tabs follow their sessions on
 * (`ARTIFACT_SESSION_PATH`): one session each, the tab's own artifact as
 * the session's panel would show it, its row's name and place, whether it is working, and the fleet's machines. The owner: "an
 * artifact shouldn't load anything that is not needed for the
 * preview/artifact, no unnecessary connections etc", so such a tab opens this
 * and its doc's sync socket, never the dashboard's socket and the board it
 * carries.
 *
 * Each socket is sent the whole frame when it opens. After that, each move
 * the hub hears names the part of the frame it moves ({@link TabMove}): a
 * session's row on the board, a pulse, what a tab shows (its preview, its
 * browser, that browser's ask), the machines. Only that part is read again,
 * once per session however many tabs follow it, and a tab is sent the frame
 * again when the part read differs from what it holds. A tab whose artifact
 * is gone is closed with `ARTIFACT_SESSION_REFUSED.gone` instead, and says
 * why.
 */

import { ARTIFACT_SESSION_REFUSED } from "@cawco/core/artifact-session";
import type { ArtifactSessionFrame } from "@cawco/core/frames";
import { ARTIFACT_GONE } from "@cawco/core/words/artifact-session";
import { type ClientSocket, sendToClient } from "./wire-socket";

/** A tab's socket, which the hub closes once its artifact is gone. */
type ArtifactTabSocket = ClientSocket & {
  close: (code?: number, reason?: string) => void;
};

/** What a tab shows: its artifact as the panel would, the browser it shows, and its session's open ask for that browser. */
type Shown = Pick<ArtifactSessionFrame, "ask" | "browser" | "preview">;
/** The session's row as a tab names it. */
type Session = ArtifactSessionFrame["session"];
type Machines = ArtifactSessionFrame["machines"];

/** How each part of a tab's frame is read. */
export interface ArtifactTabReads {
  /** Whether `artifactId` is still `instanceId`'s. */
  holds: (instanceId: string, artifactId: string) => boolean;
  machines: () => Machines;
  session: (instanceId: string) => Session;
  shown: (instanceId: string, artifactId: string) => Shown;
  /** Whether the session is in a turn, its delegates' included. */
  working: (instanceId: string) => boolean;
}

/**
 * A move the tabs hear, by the part it moves: a session's row (its name,
 * place and machine, so what it shows and whether it works too), its work,
 * what a session's tabs show (every tab's when none is named), the machines.
 */
export type TabMove =
  | { instanceId: string; kind: "session" }
  | { instanceId: string; kind: "working" }
  | { instanceId?: string; kind: "shown" }
  | { kind: "machines" };

export interface ArtifactSessionsShape {
  close: (socket: ClientSocket) => void;
  /** Sends the tabs a move touches their frame again, when the part it moves reads otherwise now. */
  moved: (move: TabMove) => void;
  open: (
    socket: ArtifactTabSocket,
    instanceId: string,
    artifactId: string
  ) => void;
}

interface Follower {
  artifactId: string;
  /** The frame last sent. */
  frame: ArtifactSessionFrame;
  instanceId: string;
  socket: ArtifactTabSocket;
}

/** The parts of a frame a move reads again. */
type Parts = Partial<Omit<ArtifactSessionFrame, "type" | "instanceId">>;

export const createArtifactSessions = (
  reads: ArtifactTabReads
): ArtifactSessionsShape => {
  const followers = new Map<string, Follower>();

  /** The parts `move` moves of a tab on `instanceId` showing `artifactId`. */
  const partsOf = (
    move: TabMove,
    instanceId: string,
    artifactId: string
  ): Parts => {
    switch (move.kind) {
      case "session":
        return {
          session: reads.session(instanceId),
          working: reads.working(instanceId),
          ...reads.shown(instanceId, artifactId),
        };
      case "working":
        return { working: reads.working(instanceId) };
      case "shown":
        return reads.shown(instanceId, artifactId);
      case "machines":
        return { machines: reads.machines() };
      default:
        return move satisfies never;
    }
  };

  /** Whether `parts` read otherwise than the frame holds them. */
  const differs = (frame: ArtifactSessionFrame, parts: Parts): boolean =>
    !Bun.deepEquals({ ...frame, ...parts }, frame);

  const moved = (move: TabMove): void => {
    if (followers.size === 0) {
      return;
    }
    const named = "instanceId" in move ? move.instanceId : undefined;
    // Read once per session's artifact, however many tabs follow it.
    const read = new Map<string, Parts>();
    for (const follower of [...followers.values()]) {
      if (named && follower.instanceId !== named) {
        continue;
      }
      if (
        move.kind !== "working" &&
        move.kind !== "machines" &&
        !reads.holds(follower.instanceId, follower.artifactId)
      ) {
        followers.delete(follower.socket.id);
        follower.socket.close(ARTIFACT_SESSION_REFUSED.gone, ARTIFACT_GONE);
        continue;
      }
      const key = `${follower.instanceId}/${follower.artifactId}`;
      let parts = read.get(key);
      if (!parts) {
        parts = partsOf(move, follower.instanceId, follower.artifactId);
        read.set(key, parts);
      }
      if (differs(follower.frame, parts)) {
        follower.frame = { ...follower.frame, ...parts };
        sendToClient(follower.socket, follower.frame);
      }
    }
  };

  return {
    open: (socket, instanceId, artifactId) => {
      if (!reads.holds(instanceId, artifactId)) {
        socket.close(ARTIFACT_SESSION_REFUSED.gone, ARTIFACT_GONE);
        return;
      }
      const frame: ArtifactSessionFrame = {
        type: "artifact.session",
        instanceId,
        session: reads.session(instanceId),
        working: reads.working(instanceId),
        machines: reads.machines(),
        ...reads.shown(instanceId, artifactId),
      };
      followers.set(socket.id, { socket, instanceId, artifactId, frame });
      sendToClient(socket, frame);
    },
    close: (socket) => {
      followers.delete(socket.id);
    },
    moved,
  };
};
