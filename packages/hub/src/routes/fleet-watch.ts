/**
 * Fleet watch: whether it runs, and its notices.
 */
import {
  FLEET_WATCH_LIMITS,
  type FleetWatchNotice,
  type FleetWatchSettings,
} from "@cawco/core/fleet-watch";
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";
import { jevAccess } from "../jev";

export const fleetWatchRoutes = (ctx: Pick<HubContext, "db" | "watch">) => {
  const { db } = ctx;

  return (
    new Elysia()
      // ── fleet watch (fleet-watch.ts) ──────────────────────────────────────
      // Its switch, and its limits and Jev as facts: Settings shows them.
      .get("/api/fleet-watch", (): FleetWatchSettings => ({
        on: db.fleetWatchOn(),
        jev: jevAccess(db) !== undefined,
        limits: FLEET_WATCH_LIMITS,
      }))
      .put(
        "/api/fleet-watch",
        { body: t.Object({ on: t.Boolean() }) },
        ({ body }): FleetWatchSettings => {
          db.setFleetWatchOn(body.on);
          ctx.watch?.switched(body.on);
          console.log(`[fleet-watch] turned ${body.on ? "on" : "off"}`);
          return {
            on: body.on,
            jev: jevAccess(db) !== undefined,
            limits: FLEET_WATCH_LIMITS,
          };
        }
      )
      // Its open needs-you notices, as a dashboard that connects reads them;
      // each change after arrives as a `fleet_watch.notices` frame.
      .get("/api/fleet-watch/notices", (): { notices: FleetWatchNotice[] } => ({
        notices: db.watchNotices(),
      }))
  );
};
