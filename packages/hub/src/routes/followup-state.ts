/**
 * A session's follow-up reading, as keep-alive and the dashboard ask it.
 */

import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";

export const followupStateRoutes = ({
  coldReading,
  db,
  followupState,
}: Pick<HubContext, "coldReading" | "db" | "followupState">) =>
  new Elysia().post(
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
    async ({ body }) => {
      let { instanceId } = body;
      if (body.workspace) {
        const workspaces = db.workspacesNamed(body.workspace.trim());
        if (workspaces.length !== 1) {
          return refusal(
            404,
            "no-unique-workspace",
            `No unique workspace "${body.workspace}".`
          );
        }
        instanceId = db.workItemsIn(workspaces[0].id)[0]?.instanceId;
      }
      const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
      if (!row) {
        return {
          row: null,
          midTurn: false,
          hasTurns: false,
          lastTurnAt: null,
          activityBound: false,
        };
      }
      const state = followupState(row);
      return {
        row,
        midTurn: state.midTurn,
        hasTurns: state.hasTurns,
        lastTurnAt: state.lastTurnAt,
        activityBound: state.activityBound,
        ...(await coldReading(row, state, body.message)),
      };
    }
  );
