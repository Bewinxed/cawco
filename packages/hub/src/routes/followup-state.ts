/**
 * A session's follow-up reading, as keep-alive and the dashboard ask it.
 */

import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { followupCalls } from "../session-calls";

export const followupStateRoutes = (
  ctx: Pick<HubContext, "coldReading" | "db" | "followupState">
) => {
  const { followupState } = followupCalls(ctx);
  return new Elysia().post(
    "/api/followup-state",
    {
      ...hidden,
      body: t.Object({
        instanceId: t.Optional(t.String()),
        workspace: t.Optional(t.String()),
        /** The message or brief the caller would send: Attach or fresh's question, with Jev on. */
        message: t.Optional(t.String()),
      }),
    },
    ({ body }) => followupState(body)
  );
};
