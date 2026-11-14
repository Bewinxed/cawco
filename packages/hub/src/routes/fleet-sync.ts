/**
 * Pushing the fleet to its machines and retrying what a machine refused.
 */
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";
import { awayStatus, type MachineReadsContext } from "../machine-reads";

export const fleetSyncRoutes = (
  ctx: Pick<HubContext, "fleetSyncs"> & MachineReadsContext
) =>
  new Elysia()
    // The click for a machine that drifted, or for the whole fleet: what
    // moved goes, and every item the machine holds converges again.
    .post(
      "/api/fleet/sync",
      { body: t.Object({ machineId: t.Optional(t.String()) }) },
      ({ body, set }) => {
        if (body.machineId && !ctx.registry.agent(body.machineId)) {
          return awayStatus(ctx, set, body.machineId);
        }
        ctx.fleetSyncs.changed("asked for", {
          reconverge: true,
          ...(body.machineId ? { machineId: body.machineId } : {}),
        });
        return { ok: true };
      }
    )
    // A person's Retry of the items that failed to converge on a machine
    // for one cause (the machines panel's group): sent forced in one
    // delta, so its machine converges them again.
    .post(
      "/api/fleet/items/retry",
      {
        body: t.Object({
          machineId: t.String(),
          ids: t.Array(t.String(), { minItems: 1 }),
        }),
      },
      ({ body, set }) => {
        if (!ctx.registry.agent(body.machineId)) {
          return awayStatus(ctx, set, body.machineId);
        }
        ctx.fleetSyncs.retry(body.machineId, body.ids);
        return { ok: true };
      }
    );
