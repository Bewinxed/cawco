/**
 * Git LFS offered for the large files a place's first commit left out
 * (place-repo.ts). The unattended first commit never silently drops a file
 * of 50 MiB or more (core `LARGE_FILE_BYTES`) nor silently commits one:
 * it leaves each out, names it in the note, and the note carries this
 * offer, by pattern (git-lfs-faq(7): "we recommend using patterns rather
 * than `--above`"), a row per pattern with its count and size.
 *
 * Track with LFS runs on the place's machine (core `CONTROL_PLACE_LFS`):
 * `git lfs track <patterns>`, then a second commit of the left-out files,
 * by git-lfs-migrate(1)'s no-rewrite path, and the conversation is told. Not now
 * is recorded, and the files stay out. Nothing is tracked before the person
 * says so, and each offer is answered once.
 */

import type {
  LfsOfferState,
  ProjectNote,
} from "@cawco/core/project-conversation";
import {
  CONTROL_PLACE_LFS,
  type PlaceLfsMade,
} from "@cawco/core/workspace/controls";
import { Elysia, ElysiaStatus } from "elysia";
import type { DbShape } from "./db";
import type { LfsOfferRow } from "./db/lfs-offers";
import { refusal } from "./refusal";

const MB = 1024 * 1024;

export interface LfsOffersDeps {
  /** A machine-scoped daemon function, answered or thrown in the machine's own words. */
  readonly call: (
    machineId: string,
    method: string,
    args: unknown[]
  ) => Promise<unknown>;
  readonly db: Pick<DbShape, "lfsOffers" | "project">;
  /** A note to the person in the project's conversation, waking no one (caw.ts `notice`). */
  readonly notice: (projectId: string, note: ProjectNote) => void;
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
  const tracking = new Map<string, ReturnType<typeof track>>();

  /** The offer `id` as recorded, or its refusal (lfs-offer-unknown). */
  const answerable = (id: string) =>
    db.lfsOffers.of(id) ??
    refusal(404, "lfs-offer-unknown", "This offer of Git LFS is not recorded.");

  /** Where offer `id` stands, or its refusal. */
  const stateNow = (id: string) => {
    const row = answerable(id);
    return row instanceof ElysiaStatus ? row : stateOf(row);
  };

  const track = async (row: LfsOfferRow) => {
    if (!db.project(row.projectId)) {
      return refusal(
        409,
        "lfs-offer-project-gone",
        "This offer's project is gone, so nothing was tracked."
      );
    }
    // The machine's own words are the refusal the card shows.
    let made: PlaceLfsMade;
    try {
      made = (await call(row.machineId, CONTROL_PLACE_LFS, [
        row.root,
        row.rows,
      ])) as PlaceLfsMade;
    } catch (error) {
      return refusal(
        409,
        "lfs-offer-track-refused",
        error instanceof Error ? error.message : String(error)
      );
    }
    db.lfsOffers.answer(row.id, "tracked", made.commit);
    notice(row.projectId, {
      title: `Committed ${made.files} large ${made.files === 1 ? "file" : "files"} through Git LFS`,
      event: {
        kind: "repo",
        root: row.root,
        machineId: row.machineId,
        commit: made.commit,
      },
      body: `${row.root} tracks ${made.patterns.map((pattern) => `\`${pattern}\``).join(", ")} with Git LFS now, and commit ${made.commit.slice(0, 9)} holds the ${made.files} ${made.files === 1 ? "file" : "files"} (${(made.bytes / MB).toFixed(1)} MB) its first commit left out. Nothing was pushed: they go to the project's LFS with its next push.${made.hooks ? "" : "\n\nThe folder has a pre-push hook of its own, so git-lfs's was not put beside it: a push from there sends the large files only with `git lfs push origin --all`, or once the hooks are merged (`git lfs update --manual` says how)."}`,
    });
    return stateNow(row.id);
  };

  return {
    /** Where an offer stands. */
    state: stateNow,

    /** "Not now": recorded, and the files stay out. */
    dismiss(id: string) {
      const row = answerable(id);
      if (row instanceof ElysiaStatus) {
        return row;
      }
      if (!(row.answer || tracking.has(id))) {
        db.lfsOffers.answer(id, "dismissed");
      }
      return stateNow(id);
    },

    /** "Track with LFS": the patterns tracked and the files committed, once. */
    track(id: string) {
      const row = answerable(id);
      if (row instanceof ElysiaStatus) {
        return Promise.resolve(row);
      }
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
    .get("/api/lfs-offers/:id", ({ params }) => offers.state(params.id))
    .post("/api/lfs-offers/:id/dismiss", ({ params }) =>
      offers.dismiss(params.id)
    )
    .post("/api/lfs-offers/:id/track", ({ params }) => offers.track(params.id));
