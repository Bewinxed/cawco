/**
 * Git LFS offered for the large files a place's first commit left out
 * (place-repo.ts). The unattended first commit never silently drops a file
 * over 50 MiB (core `PLACE_REPO_FILE_LIMIT_BYTES`) nor silently commits one:
 * it leaves each out, names it in the note, and the note carries this
 * offer, by pattern (git-lfs-faq(7): "we recommend using patterns rather
 * than `--above`"), a row per pattern with its count and size.
 *
 * Track with LFS runs on the place's machine (core `CONTROL_PLACE_LFS`):
 * `git lfs track <patterns>`, then a second commit of the left-out files,
 * by git-lfs-migrate(1)'s no-rewrite path, and the thread is told. Not now
 * is recorded, and the files stay out. Nothing is tracked before the person
 * says so, and each offer is answered once.
 */
import {
  CONTROL_PLACE_LFS,
  type LfsOfferState,
  type PlaceLfsMade,
  type ThreadNote,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import type { LfsOfferRow } from "./db/lfs-offers";
import { FolderRefusal, refused } from "./project-folder";

const MB = 1024 * 1024;

export interface LfsOffersDeps {
  /** A machine-scoped daemon function, answered or thrown in the machine's own words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  readonly db: Pick<DbShape, "lfsOffers" | "project">;
  /** A note in a project's thread that wakes no one (caw.ts `notice`). */
  readonly notice: (
    projectId: string,
    threadId: string | null,
    note: ThreadNote
  ) => string;
}

const stateOf = (row: LfsOfferRow): LfsOfferState => ({
  id: row.id,
  answer: row.answer ?? "open",
  commit: row.commit,
  root: row.root,
  rows: row.rows,
});

export const createLfsOffers = ({ call, db, notice }: LfsOffersDeps) => {
  /** Offers whose Track runs now: a second press waits on the first's answer. */
  const tracking = new Map<string, Promise<LfsOfferState>>();

  const answerable = (id: string): LfsOfferRow => {
    const row = db.lfsOffers.of(id);
    if (!row) {
      throw new FolderRefusal(404, "This offer of Git LFS is not recorded.");
    }
    return row;
  };

  const track = async (row: LfsOfferRow): Promise<LfsOfferState> => {
    if (!db.project(row.projectId)) {
      throw new FolderRefusal(
        409,
        "This offer's project is gone, so nothing was tracked."
      );
    }
    // The machine's own words are the refusal the card shows.
    const made = (await call(row.machineId, CONTROL_PLACE_LFS, [
      row.root,
      row.rows,
    ]).catch((error: unknown) => {
      throw new FolderRefusal(
        409,
        error instanceof Error ? error.message : String(error),
        { cause: error }
      );
    })) as PlaceLfsMade;
    db.lfsOffers.answer(row.id, "tracked", made.commit);
    notice(row.projectId, row.threadId, {
      title: `Committed ${made.files} large ${made.files === 1 ? "file" : "files"} through Git LFS`,
      event: {
        kind: "repo",
        root: row.root,
        machineId: row.machineId,
        commit: made.commit,
      },
      body: `${row.root} tracks ${made.patterns.map((pattern) => `\`${pattern}\``).join(", ")} with Git LFS now, and commit ${made.commit.slice(0, 9)} holds the ${made.files} ${made.files === 1 ? "file" : "files"} (${(made.bytes / MB).toFixed(1)} MB) its first commit left out. Nothing was pushed: they go to the project's LFS with its next push.`,
    });
    return stateOf(answerable(row.id));
  };

  return {
    /** Where an offer stands. */
    state(id: string): LfsOfferState {
      return stateOf(answerable(id));
    },

    /** "Not now": recorded, and the files stay out. */
    dismiss(id: string): LfsOfferState {
      const row = answerable(id);
      if (!(row.answer || tracking.has(id))) {
        db.lfsOffers.answer(id, "dismissed");
      }
      return stateOf(answerable(id));
    },

    /** "Track with LFS": the patterns tracked and the files committed, once. */
    track(id: string): Promise<LfsOfferState> {
      const row = answerable(id);
      if (row.answer) {
        return Promise.resolve(stateOf(row));
      }
      const running = tracking.get(id);
      if (running !== undefined) {
        return running;
      }
      const work = track(row).finally(() => tracking.delete(id));
      tracking.set(id, work);
      return work;
    },
  };
};

export type LfsOffers = ReturnType<typeof createLfsOffers>;

/** The card's routes: where it stands, and its two answers. */
export const lfsOfferRoutes = (offers: LfsOffers) =>
  new Elysia()
    .get(
      "/api/lfs-offers/:id",
      { params: t.Object({ id: t.String() }) },
      ({ params }) => {
        try {
          return offers.state(params.id);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/lfs-offers/:id/dismiss",
      { params: t.Object({ id: t.String() }) },
      ({ params }) => {
        try {
          return offers.dismiss(params.id);
        } catch (error) {
          return refused(error);
        }
      }
    )
    .post(
      "/api/lfs-offers/:id/track",
      { params: t.Object({ id: t.String() }) },
      async ({ params }) => {
        try {
          return await offers.track(params.id);
        } catch (error) {
          return refused(error);
        }
      }
    );
