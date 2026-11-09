/**
 * Pausing a machine and starting it again.
 */
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";

export const machinePauseRoutes = ({
  identities,
  machinePause,
  machineRow,
  publishInstances,
}: Pick<
  HubContext,
  "identities" | "machinePause" | "machineRow" | "publishInstances"
>) =>
  new Elysia()
    // The owner pauses a machine until a time (machine-pause.ts): nothing
    // CawCo starts runs there until then, its agent connected throughout.
    // Answers the machine's row as it stands, its pause on it, once what
    // ran there has stopped: the row says how many commands that was.
    .post(
      "/api/machines/:machineId/pause",
      {
        body: t.Object({
          until: t.String(),
          // The harness's id for the machine_pause call that asks it
          // (delegation-actions.ts `machinePause`): its own session's turn
          // is cut once that call is answered (machine-pause.ts `PauseCaller`).
          call: t.Optional(t.String()),
        }),
      },
      async ({ params, body, status, request }) => {
        const until = new Date(body.until);
        if (Number.isNaN(until.getTime())) {
          return status(
            400,
            `until: "${body.until}" is not a time; send an ISO 8601 time, such as 2026-10-15T21:00:00Z.`
          );
        }
        if (until.getTime() <= Date.now()) {
          return status(400, `until: ${body.until} has already passed.`);
        }
        // The session asking, when a session's credential asks it.
        const asker = identities.resolve(request.headers.get("authorization"));
        const row = (await machinePause.pause(
          params.machineId,
          until,
          asker ? { instanceId: asker.instanceId, call: body.call } : undefined
        ))
          ? machineRow(params.machineId)
          : undefined;
        if (!row) {
          return status(404, "No machine with that id on this hub.");
        }
        publishInstances(params.machineId);
        return row;
      }
    )
    // Ends a machine's pause now: what it was kept goes, in order.
    .post("/api/machines/:machineId/resume", ({ params, status }) => {
      if (!machineRow(params.machineId)) {
        return status(404, "No machine with that id on this hub.");
      }
      machinePause.resume(params.machineId);
      const row = machineRow(params.machineId);
      return row ?? status(404, "No machine with that id on this hub.");
    });
