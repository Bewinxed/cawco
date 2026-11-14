/**
 * Pausing a machine and starting it again.
 */
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";
import { machinePauseCalls } from "../session-calls";

export const machinePauseRoutes = (
  ctx: Pick<
    HubContext,
    "identities" | "machinePause" | "machineRow" | "publishInstances"
  >
) => {
  const { pauseMachine, resumeMachine } = machinePauseCalls(ctx);
  return (
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
        ({ params, body, request }) => {
          // The session asking, when a session's credential asks it.
          const asker = ctx.identities.resolve(
            request.headers.get("authorization")
          );
          return pauseMachine(
            params.machineId,
            body,
            asker
              ? { instanceId: asker.instanceId, call: body.call }
              : undefined
          );
        }
      )
      // Ends a machine's pause now: what it was kept goes, in order.
      .post("/api/machines/:machineId/resume", ({ params }) =>
        resumeMachine(params.machineId)
      )
  );
};
