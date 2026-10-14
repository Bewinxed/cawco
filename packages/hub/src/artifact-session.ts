/**
 * The sockets artifacts' own tabs follow their sessions on
 * (`ARTIFACT_SESSION_PATH`): one session each, its panel, its row's name and
 * place, whether it is working, and the fleet's machines. The owner: "an
 * artifact shouldn't load anything that is not needed for the
 * preview/artifact, no unnecessary connections etc", so such a tab opens this
 * and its doc's sync socket, never the dashboard's socket and the board it
 * carries.
 *
 * Each socket is sent the whole frame when it opens, and again whenever the
 * hub moves anything it reads (a preview opens or closes, the board moves, a
 * pulse lands) and the frame comes out different from the last one sent.
 */
import type { ArtifactSessionFrame } from "@cawco/core";
import { type HubSocket, sendFrame } from "./wire-socket";

export interface ArtifactSessionsShape {
  close: (socket: HubSocket) => void;
  open: (socket: HubSocket, instanceId: string) => void;
  /** Sends what changed to the sockets on `instanceId`, or on every session when none is named. */
  refresh: (instanceId?: string) => void;
}

interface Follower {
  instanceId: string;
  /** The frame last sent, serialised. */
  last: string;
  socket: HubSocket;
}

export const createArtifactSessions = (
  frameOf: (instanceId: string) => ArtifactSessionFrame
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
    for (const follower of followers.values()) {
      if (instanceId && follower.instanceId !== instanceId) {
        continue;
      }
      let read = frames.get(follower.instanceId);
      if (!read) {
        const frame = frameOf(follower.instanceId);
        read = { frame, text: JSON.stringify(frame) };
        frames.set(follower.instanceId, read);
      }
      if (read.text !== follower.last) {
        follower.last = read.text;
        sendFrame(follower.socket, read.frame);
      }
    }
  };

  return {
    open: (socket, instanceId) => {
      followers.set(socket.id, { socket, instanceId, last: "" });
      refresh(instanceId);
    },
    close: (socket) => {
      followers.delete(socket.id);
    },
    refresh,
  };
};
