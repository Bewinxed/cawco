/**
 * Needs you's artifacts as every screen hears them (core artifact-needs.ts):
 * read from the artifacts service (`needs`, derived from each doc on every
 * read, nothing stored), sent whole as an `artifact.needs` frame whenever
 * what it says changed, and handed to whoever asks now (`/api/pending`,
 * `GET /api/artifact-needs`). A move anything it is read from makes (a doc's
 * update, a row, a plan, a turn, a session ending, an acknowledgement) asks
 * for one read a short quiet after it, so a burst of them is one frame.
 */
import type { ArtifactNeedsFrame, ArtifactNeedsRead } from "@cawco/core";
import type { HubLifetimeShape, HubTimer } from "../lifetime";

/** How long after a move the lane is read: a Send's doc writes land as one. Our call. */
const MOVED_QUIET_MS = 150;

export interface ArtifactLaneDeps {
  /** Sends the frame to every dashboard. */
  broadcast: (frame: ArtifactNeedsFrame) => void;
  /** An artifact left the lane (answered, retired, put away, its session ended): its push is over. */
  left: (artifactId: string) => void;
  lifetime: HubLifetimeShape;
  /** The lane as it stands now (artifacts service `needs`). */
  read: () => ArtifactNeedsRead;
}

export const createArtifactLane = (deps: ArtifactLaneDeps) => {
  let current: ArtifactNeedsRead = { needs: [], notices: [] };
  let said: string | null = null;
  let timer: HubTimer | undefined;

  /** Reads the lane; tells every screen, and the push, what changed. */
  const settle = (): ArtifactNeedsRead => {
    deps.lifetime.cancel(timer);
    timer = undefined;
    let read: ArtifactNeedsRead;
    try {
      read = deps.read();
    } catch (error) {
      console.warn(
        `[needs] the artifacts waiting on you were not read: ${error instanceof Error ? error.message : String(error)}`
      );
      return current;
    }
    const words = JSON.stringify(read);
    if (words === said) {
      return current;
    }
    const before = current.needs;
    current = read;
    said = words;
    for (const need of before) {
      if (!read.needs.some((one) => one.artifactId === need.artifactId)) {
        deps.left(need.artifactId);
      }
    }
    deps.broadcast({ kind: "artifact.needs", ...read });
    return current;
  };

  return {
    /** Something the lane is read from moved: read again once it is quiet. */
    moved(): void {
      timer ??= deps.lifetime.after(MOVED_QUIET_MS, settle);
    },
    /** The lane as it stands now, read at once. */
    now(): ArtifactNeedsRead {
      return settle();
    },
    /** The frame every screen holds now: the `/api/pending` envelope carries it whole. */
    frame(): ArtifactNeedsFrame {
      return { kind: "artifact.needs", ...settle() };
    },
  };
};

export type ArtifactLane = ReturnType<typeof createArtifactLane>;
