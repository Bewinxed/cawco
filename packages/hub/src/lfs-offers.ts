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
 * by git-lfs-migrate(1)'s no-rewrite path. The offer stands in Needs you
 * (offers-waiting.ts) until answered, never in the project's Caw chat; Track's
 * answer says the commit it made. Not now is recorded, and the files stay out. Nothing is tracked before the person
 * says so, and each offer is answered once.
 */

import type { LfsOfferState } from "@cawco/core/project-conversation";
import {
  CONTROL_PLACE_LFS,
  type PlaceLfsMade,
} from "@cawco/core/workspace/controls";
import { ElysiaStatus, problem } from "elysia";
import type { DbShape } from "./db";
import type { LfsOfferRow } from "./db/lfs-offers";
import type { MachineCall } from "./machine-answers";

const MB = 1024 * 1024;

export interface LfsOffersDeps {
  /** A machine-scoped daemon function, answered or thrown in the machine's own words. */
  readonly call: MachineCall;
  readonly db: Pick<DbShape, "lfsOffers" | "project">;
  /** An offer was answered: Needs you hears it (offers-waiting.ts). */
  readonly offersChanged: () => void;
}

const stateOf = (row: LfsOfferRow): LfsOfferState => ({
  id: row.id,
  answer: row.answer ?? "open",
  commit: row.commit,
  root: row.root,
  rows: row.rows,
});

export const createLfsOffers = ({ call, db, offersChanged }: LfsOffersDeps) => {
  /** Offers whose Track runs now: a second press waits on the first's answer. */
  const tracking = new Map<string, ReturnType<typeof track>>();

  /** The offer `id` as recorded, or its refusal (lfs-offer-unknown). */
  const answerable = (id: string) =>
    db.lfsOffers.of(id) ??
    problem(404, {
      code: "lfs-offer-unknown",
      detail: "This offer of Git LFS is not recorded.",
    });

  /** Where offer `id` stands, or its refusal. */
  const stateNow = (id: string) => {
    const row = answerable(id);
    return row instanceof ElysiaStatus ? row : stateOf(row);
  };

  const track = async (row: LfsOfferRow) => {
    if (!db.project(row.projectId)) {
      return problem(409, {
        code: "lfs-offer-project-gone",
        detail: "This offer's project is gone, so nothing was tracked.",
      });
    }
    // The machine's own words are the refusal the card shows.
    let made: PlaceLfsMade;
    try {
      made = await call(row.machineId, CONTROL_PLACE_LFS, [row.root, row.rows]);
    } catch (error) {
      return problem(409, {
        code: "lfs-offer-track-refused",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    db.lfsOffers.answer(row.id, "tracked", made.commit);
    offersChanged();
    console.log(
      `[lfs-offers] ${row.root}: ${made.files} large file(s), ${(made.bytes / MB).toFixed(1)} MB, committed through Git LFS in ${made.commit.slice(0, 9)} (${made.patterns.join(", ")})`
    );
    const now = stateNow(row.id);
    return made.hooks || now instanceof ElysiaStatus
      ? now
      : { ...now, ownPrePush: true as const };
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
        offersChanged();
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
