/**
 * Needs you's artifacts as every screen hears them (core artifact-needs.ts):
 * read from the artifacts service (`needs`, derived from each doc on every
 * read, nothing stored), sent whole as an `artifact.needs` frame whenever
 * what it says changed, and handed to whoever asks now (`/api/pending`,
 * `GET /api/artifact-needs`). A move anything it is read from makes (a doc's
 * update, a row, a plan, a turn, a session ending, an acknowledgement) asks
 * for one read a short quiet after it, so a burst of them is one frame.
 *
 * The lane is read once per move, never once per question: whoever asks
 * between moves gets the read it holds, and one asking while a move waits
 * for its quiet reads it at once. Its read is every waiting artifact's
 * sessions, work items and refusals, hundreds of milliseconds on a live
 * hub, and its askers ask per session (at-limit's `waitedOn` once per held
 * and running session in every look, find's state per keystroke): read per
 * question, it held obelisk's hub 5 to 15 s at a time on every nightly from
 * 6801 on, and 6809's trial never saw the 60 s answered it needs
 * (probe-kit hub-live-copy, on a copy of that hub's database).
 */
import {
  type ArtifactNeedsFrame,
  type ArtifactNeedsRead,
  unparked,
} from "@cawco/core/artifact-needs";
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
  /** Whether {@link current} is the lane as it stands: nothing it is read from moved since it was read. */
  let held = false;
  /** Who hears each change besides the screens ({@link listen}). */
  const listeners = new Set<(read: ArtifactNeedsRead) => void>();

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
    held = true;
    const words = JSON.stringify(read);
    if (words === said) {
      return current;
    }
    const before = unparked(current.needs);
    const after = unparked(read.needs);
    current = read;
    said = words;
    for (const need of before) {
      if (!after.some((one) => one.artifactId === need.artifactId)) {
        deps.left(need.artifactId);
      }
    }
    deps.broadcast({ kind: "artifact.needs", ...read });
    for (const listener of listeners) {
      listener(read);
    }
    return current;
  };

  return {
    /** Something the lane is read from moved: read again once it is quiet. */
    moved(): void {
      held = false;
      timer ??= deps.lifetime.after(MOVED_QUIET_MS, settle);
    },
    /** The lane as it stands now: the read it holds, or read at once when something moved since. */
    now(): ArtifactNeedsRead {
      return held ? current : settle();
    },
    /** Hears each change of the lane, as every screen does: a session's plan reads what of it waits on the person from it (plans.ts `needsMoved`). */
    listen(listener: (read: ArtifactNeedsRead) => void): void {
      listeners.add(listener);
    },
    /** The frame every screen holds now: the `/api/pending` envelope carries it whole. */
    frame(): ArtifactNeedsFrame {
      return { kind: "artifact.needs", ...(held ? current : settle()) };
    },
  };
};
