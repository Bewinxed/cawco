/**
 * The sockets artifacts' own tabs follow their sessions on
 * (`ARTIFACT_SESSION_PATH`): one session each, the tab's own artifact as
 * the session's panel would show it, its row's name and place, whether it is working, and the fleet's machines. The owner: "an
 * artifact shouldn't load anything that is not needed for the
 * preview/artifact, no unnecessary connections etc", so such a tab opens this
 * and its doc's sync socket, never the dashboard's socket and the board it
 * carries.
 *
 * Each socket is sent the whole frame when it opens, and again whenever the
 * hub moves anything it reads (a preview opens or closes, the board moves, a
 * pulse lands) and the frame comes out different from the last one sent. A
 * tab whose artifact is gone is closed with `ARTIFACT_SESSION_REFUSED.gone`
 * instead, and says why.
 */
import {
  ARTIFACT_GONE,
  ARTIFACT_SESSION_REFUSED,
  type ArtifactSessionFrame,
} from "@cawco/core";
import { type HubSocket, sendFrame } from "./wire-socket";

/** A tab's socket, which the hub closes once its artifact is gone. */
export type ArtifactTabSocket = HubSocket & {
  close: (code?: number, reason?: string) => void;
};

export interface ArtifactSessionsShape {
  close: (socket: HubSocket) => void;
  open: (
    socket: ArtifactTabSocket,
    instanceId: string,
    artifactId: string
  ) => void;
  /** Sends what changed to the sockets on `instanceId`, or on every session when none is named. */
  refresh: (instanceId?: string) => void;
}

interface Follower {
  artifactId: string;
  instanceId: string;
  /** The frame last sent, serialised. */
  last: string;
  socket: ArtifactTabSocket;
}

export const createArtifactSessions = (
  /** The frame of `artifactId`'s own tab, on session `instanceId`. */
  frameOf: (instanceId: string, artifactId: string) => ArtifactSessionFrame,
  /** Whether `artifactId` is still `instanceId`'s. */
  holds: (instanceId: string, artifactId: string) => boolean
): ArtifactSessionsShape => {
  const followers = new Map<string, Follower>();

  const refresh = (instanceId?: string): void => {
    if (followers.size === 0) {
      return;
    }
    // Read once per session, however many tabs follow it.
    const frames = new Map<
      string,
      { frame: ArtifactSessionFrame; text: string }
    >();
    for (const follower of [...followers.values()]) {
      if (instanceId && follower.instanceId !== instanceId) {
        continue;
      }
      if (!holds(follower.instanceId, follower.artifactId)) {
        followers.delete(follower.socket.id);
        follower.socket.close(ARTIFACT_SESSION_REFUSED.gone, ARTIFACT_GONE);
        continue;
      }
      const key = `${follower.instanceId}/${follower.artifactId}`;
      let read = frames.get(key);
      if (!read) {
        const frame = frameOf(follower.instanceId, follower.artifactId);
        read = { frame, text: JSON.stringify(frame) };
        frames.set(key, read);
      }
      if (read.text !== follower.last) {
        follower.last = read.text;
        sendFrame(follower.socket, read.frame);
      }
    }
  };

  return {
    open: (socket, instanceId, artifactId) => {
      followers.set(socket.id, { socket, instanceId, artifactId, last: "" });
      refresh(instanceId);
    },
    close: (socket) => {
      followers.delete(socket.id);
    },
    refresh,
  };
};
