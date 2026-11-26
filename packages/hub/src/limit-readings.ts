/**
 * The readings of the bounds still waiting on data (core limit-readings.ts)
 * reach the hub's `limit_readings` table here, by one of three ways:
 *
 * - the hub's own, taken from its process every
 *   {@link READINGS_HANDED_EVERY_MS} ({@link keepHubReadings});
 * - a machine daemon's, on its beat (server.ts `heartbeatFromMachine`);
 * - a page's, the CLI's and a script's, posted to
 *   `POST /api/limit-readings/:machine` (a machine's own, by its proof; the
 *   person's pages as `browser`, by the person's sign-in or a preview
 *   origin's error path, preview-control.ts).
 *
 * `GET /api/limit-readings` reads each metric back per machine: its count,
 * p50, p95, p99 and largest, and the days it spans, which is what a
 * recording tag's value is set from once its date has come.
 */

import {
  LimitReadingsBodySchema,
  READINGS_HANDED_EVERY_MS,
  takeLimitReadings,
} from "@cawco/core/limit-readings";
import { Elysia, status, t } from "elysia";
import type { LimitReadingsDb } from "./db/limit-readings";
import type { HubLifetimeShape } from "./lifetime";

/** What a page's reading is kept under: a browser is no machine of the fleet. */
const BROWSER_READINGS = "browser";

/** What `POST /api/limit-readings/:machine` takes: core `LimitReadingsBodySchema`, as the route's own schema. */
const readingsBody = t.Object({
  readings: t.Array(
    t.Object({
      at: t.Integer({ minimum: 0 }),
      bucket: t.Integer(),
      count: t.Integer({ minimum: 1 }),
      day: t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" }),
      metric: t.String({ minLength: 1 }),
      value: t.Number(),
    })
  ),
});

export const limitReadingsRoutes = (readings: LimitReadingsDb) =>
  new Elysia()
    .get("/api/limit-readings", () => ({ readings: readings.summary() }))
    .post(
      "/api/limit-readings/:machine",
      { body: readingsBody },
      ({ params, body }) => {
        readings.keep(params.machine, body.readings);
        return status(204);
      }
    );

/**
 * A preview page's readings (core `PREVIEW_READINGS_PATH`, the overlay's),
 * kept under {@link BROWSER_READINGS} as the dashboard's are; a body that
 * is not readings is refused.
 */
export const takeBrowserReadings = async (
  request: Request,
  readings: LimitReadingsDb
): Promise<Response> => {
  const body = LimitReadingsBodySchema.safeParse(
    await request.json().catch(() => undefined)
  );
  if (!body.success) {
    return new Response("Not readings", { status: 422 });
  }
  readings.keep(BROWSER_READINGS, body.data.readings);
  return new Response(null, { status: 204 });
};

/** The hub's own readings, written under its machine's id as they come, until the hub closes. */
export const keepHubReadings = (
  lifetime: HubLifetimeShape,
  readings: LimitReadingsDb,
  machineId: () => string | undefined
): void => {
  lifetime.every("limit readings kept", READINGS_HANDED_EVERY_MS, () => {
    const machine = machineId();
    if (machine) {
      readings.keep(machine, takeLimitReadings());
    }
  });
};
