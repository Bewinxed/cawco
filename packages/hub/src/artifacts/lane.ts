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
 *
 * A move is the lane's only when what the lane read reads otherwise: a
 * session's when its end, place or plan as the last read read them moved
 * ({@link ArtifactLaneDeps.sessionMoved}), an artifact's doc when its item
 * or notice read alone moved ({@link ArtifactLaneDeps.artifactMoved}). From
 * 16:45 to 16:55 on 2026-11-19 obelisk's hub read the whole lane 165 times
 * a minute, 96 ms each: every board publish that laid a session it named (a
 * turn's tokens, its last request, a row laid unchanged) moved it, as every
 * update to an artifact's doc did, whatever it changed.
 */
import {
  type ArtifactNeedsFrame,
  type ArtifactNeedsRead,
  unparked,
} from "@cawco/core/artifact-needs";
import type { HubLifetimeShape, HubTimer } from "../lifetime";
import type { SessionRead } from "./facts";

/** How long after a move the lane is read: a Send's doc writes land as one. Our call. */
const MOVED_QUIET_MS = 150;

/** One read of the lane, and what it read of each session: a move of anything else is none of the lane's. */
export interface LaneRead {
  read: ArtifactNeedsRead;
  sessions: ReadonlyMap<string, SessionRead>;
}

export interface ArtifactLaneDeps {
  /** Whether artifact `id` stands otherwise in the lane now than in `last` (artifacts service `laneMoved`). */
  artifactMoved: (id: string, last: LaneRead) => boolean;
  /** Sends the frame to every dashboard. */
  broadcast: (frame: ArtifactNeedsFrame) => void;
  /** An artifact left the lane (answered, retired, put away, its session ended): its push is over. */
  left: (artifactId: string) => void;
  lifetime: HubLifetimeShape;
  /** The lane as it stands now, and what it read of each session (artifacts service `needs`). */
  read: () => LaneRead;
  /** Whether session `id` reads otherwise now than `was`, the last read's of it (artifacts service `readsOtherwise`). */
  sessionMoved: (id: string, was: SessionRead) => boolean;
}

export const createArtifactLane = (deps: ArtifactLaneDeps) => {
  let last: LaneRead = {
    read: { needs: [], notices: [] },
    sessions: new Map(),
  };
  let timer: HubTimer | undefined;
  /** Whether {@link last} is the lane as it stands: nothing it is read from moved since it was read. */
  let held = false;
  /** Who hears each change besides the screens ({@link listen}). */
  const listeners = new Set<(read: ArtifactNeedsRead) => void>();

  /** Reads the lane; tells every screen, and the push, what changed. */
  const settle = (): ArtifactNeedsRead => {
    deps.lifetime.cancel(timer);
    timer = undefined;
    let next: LaneRead;
    try {
      next = deps.read();
    } catch (error) {
      console.warn(
        `[needs] the artifacts waiting on you were not read: ${error instanceof Error ? error.message : String(error)}`
      );
      return last.read;
    }
    held = true;
    const before = last.read;
    if (Bun.deepEquals(next.read, before)) {
      // What it says stands; what it read of each session is the newest read's.
      last = { read: before, sessions: next.sessions };
      return before;
    }
    last = next;
    const after = unparked(next.read.needs);
    for (const need of unparked(before.needs)) {
      if (!after.some((one) => one.artifactId === need.artifactId)) {
        deps.left(need.artifactId);
      }
    }
    deps.broadcast({ kind: "artifact.needs", ...next.read });
    for (const listener of listeners) {
      listener(next.read);
    }
    return next.read;
  };

  /** The read, wanted on the hub's admission; one asked meanwhile ({@link now}) read it already. */
  const wantSettled = (): void => {
    timer = undefined;
    deps.lifetime.jobs.want({
      key: "artifact lane",
      name: "artifact lane settled",
      priority: "background",
      run: () => {
        if (!held) {
          settle();
        }
      },
    });
  };

  /**
   * Whether `ask` says the lane reads otherwise now; one that could not be
   * asked is taken for a move, so the next read settles it.
   */
  const otherwise = (ask: () => boolean): boolean => {
    try {
      return ask();
    } catch (error) {
      console.warn(
        `[needs] whether the artifacts waiting on you moved was not read: ${error instanceof Error ? error.message : String(error)}`
      );
      return true;
    }
  };

  /** Something the lane is read from moved: read again once it is quiet. */
  const moved = (): void => {
    held = false;
    // Once quiet, read on the hub's admission (scheduler.ts): background,
    // one read however often it moved meanwhile.
    timer ??= deps.lifetime.after(
      "artifact lane quiet",
      MOVED_QUIET_MS,
      wantSettled
    );
  };

  return {
    moved,
    /**
     * Sessions moved (the board's change log, a plan's steps): a move of
     * the lane when its last read read one of them and it reads otherwise
     * now. While a read is owed already, nothing is asked.
     */
    sessionsMoved(ids: Iterable<string>): void {
      if (!held) {
        return;
      }
      for (const id of ids) {
        const was = last.sessions.get(id);
        if (was && otherwise(() => deps.sessionMoved(id, was))) {
          moved();
          return;
        }
      }
    },
    /** Artifact `id`'s doc took an update: a move of the lane when its item or notice reads otherwise now. */
    artifactMoved(id: string): void {
      if (held && otherwise(() => deps.artifactMoved(id, last))) {
        moved();
      }
    },
    /** The lane as it stands now: the read it holds, or read at once when something moved since. */
    now(): ArtifactNeedsRead {
      return held ? last.read : settle();
    },
    /** Hears each change of the lane, as every screen does: a session's plan reads what of it waits on the person from it (plans.ts `needsMoved`). */
    listen(listener: (read: ArtifactNeedsRead) => void): void {
      listeners.add(listener);
    },
    /** The frame every screen holds now: the `/api/pending` envelope carries it whole. */
    frame(): ArtifactNeedsFrame {
      return { kind: "artifact.needs", ...(held ? last.read : settle()) };
    },
  };
};
