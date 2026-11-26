/**
 * The hub's offers waiting on the person's answer, as Needs you lists them
 * (core `WaitingOffer`): the design-system offer (design-offers.ts), an
 * LFS server a checkout named that the project never declared
 * (routes/lfs.ts), and an outsider's words held on an item no task links
 * (outsiders.ts). None is a line in the project's Caw chat (the
 * owner's "Where triggers go", 2026-11-23: what needs the person goes to
 * Needs you).
 *
 * Read whole from their tables on each change and sent to every dashboard
 * as one `offers.waiting` frame; a dashboard that connects reads
 * `/api/offers/waiting`. An offer of a project that is gone is not listed.
 */

import type {
  OffersWaitingFrame,
  WaitingOffer,
} from "@cawco/core/project-conversation";
import { Elysia, problem, t } from "elysia";
import type { DbShape } from "./db";

export interface OffersWaitingDeps {
  /** Sends a frame to every dashboard. */
  readonly broadcast: (frame: OffersWaitingFrame) => void;
  readonly db: Pick<DbShape, "designOffers" | "lfsRefusals" | "project">;
  /** An outsider's words held on items no task links, folded by item (outsiders.ts `held`). */
  readonly outsiders: () => WaitingOffer[];
  /** What a project's design system would be built from, in words (design-offers.ts `sourcesOf`); none when it cannot be read now. */
  readonly sources: (projectId: string) => string[];
}

export const createOffersWaiting = ({
  broadcast,
  db,
  outsiders,
  sources,
}: OffersWaitingDeps) => {
  /** Every offer waiting now, oldest first. */
  const list = (): WaitingOffer[] => {
    const design: WaitingOffer[] = db.designOffers.open().map((row) => ({
      kind: "design",
      offeredAt: row.offeredAt.getTime(),
      projectId: row.projectId,
      sources: sources(row.projectId),
      taskId: row.taskId,
    }));
    const refused: WaitingOffer[] = db.lfsRefusals.open().map((row) => ({
      kind: "lfs-refused",
      endpoint: row.endpoint,
      machineId: row.machineId,
      offeredAt: row.notedAt.getTime(),
      projectId: row.projectId,
      root: row.root,
    }));
    return [...design, ...refused, ...outsiders()]
      .filter((offer) => db.project(offer.projectId) !== undefined)
      .sort((a, b) => a.offeredAt - b.offeredAt);
  };

  return {
    list,
    /** An offer was raised or answered: every dashboard hears the list whole. */
    changed(): void {
      broadcast({ kind: "offers.waiting", offers: list() });
    },
    /** Puts an LFS server's refusal away from Needs you; false when none stood. */
    dismissRefusal(projectId: string, endpoint: string): boolean {
      const dismissed = db.lfsRefusals.dismiss(projectId, endpoint);
      if (dismissed) {
        broadcast({ kind: "offers.waiting", offers: list() });
      }
      return dismissed;
    },
  };
};

export type OffersWaiting = ReturnType<typeof createOffersWaiting>;

/**
 * Needs you's read of the offers, and Dismiss on an LFS server's refusal.
 * One plugin, so the hub's route list stays within TypeScript's
 * instantiation depth (server.ts).
 */
export const offersWaitingRoutes = (offers: OffersWaiting) =>
  new Elysia()
    .get("/api/offers/waiting", (): { offers: WaitingOffer[] } => ({
      offers: offers.list(),
    }))
    .post(
      "/api/lfs-refusals/dismiss",
      {
        body: t.Object({
          projectId: t.String({ minLength: 1 }),
          endpoint: t.String({ minLength: 1 }),
        }),
      },
      ({ body }) =>
        offers.dismissRefusal(body.projectId, body.endpoint)
          ? { ok: true as const }
          : problem(404, {
              code: "lfs-refusal-unknown",
              detail:
                "No refused LFS server of that project stands in Needs you.",
            })
    );
