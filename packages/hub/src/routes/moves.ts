/**
 * Moving a project's sessions to another machine: the estimate, the start, and the moves under way.
 */

import { EFFORT_LEVELS } from "@cawco/core/harness/kinds";
import type { MoveRequest } from "@cawco/core/move";
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";
import { MoveRefused } from "../moves";
import { harnessSchema } from "./harness-schema";
import { continueBody, permissionModeSchema } from "./session-bodies";

/** `POST /api/projects/:id/moves`: core `MoveRequest`. */
const moveBody = t.Object({
  approved: t.Optional(t.String({ minLength: 1 })),
  // The checkout it moves, by place id; optional on the wire for the shipped
  // apps, which name none: their move takes the primary (moves.ts `sourceOf`).
  from: t.Optional(t.String({ minLength: 1 })),
  machineId: t.String({ minLength: 1 }),
  path: t.Optional(t.String({ pattern: "^(/|~/)" })),
  spawn: t.Object({
    // Refused when absent (moves.ts `refusal`); optional on the wire only
    // until TestFlight 20261015, 20261015.3, 20261017 and 20261018 are
    // expired, then required (core move.ts MoveRequest).
    harness: t.Optional(harnessSchema),
    model: t.Optional(t.String({ minLength: 1 })),
    effort: t.Optional(t.UnionEnum(EFFORT_LEVELS)),
    permissionMode: t.Optional(permissionModeSchema),
    account: t.Optional(t.String({ minLength: 1 })),
    title: t.Optional(t.String()),
  }),
  prompt: t.Optional(t.String()),
  images: continueBody.properties.images,
  attachments: continueBody.properties.attachments,
});

export const moveRoutes = ({ moves }: Pick<HubContext, "moves">) =>
  new Elysia()
    // Moving a project to a machine without a checkout of it (moves.ts).
    // What the New session modal reads when such a machine is picked.
    .get(
      "/api/projects/:id/move-estimate",
      {
        query: t.Object({
          machine: t.String({ minLength: 1 }),
          path: t.Optional(t.String({ pattern: "^(/|~/)" })),
          from: t.Optional(t.String({ minLength: 1 })),
        }),
      },
      async ({ params, query, status }) => {
        try {
          return await moves.estimate(params.id, query.machine, {
            ...(query.from === undefined ? {} : { from: query.from }),
            ...(query.path === undefined ? {} : { path: query.path }),
          });
        } catch (error) {
          return error instanceof MoveRefused
            ? status(error.status, error.message)
            : status(
                422,
                error instanceof Error ? error.message : String(error)
              );
        }
      }
    )
    // Move & start: the hub owns the job from here; its stages reach every
    // screen on the `moves` frame. The no-move case is the ordinary spawn.
    .post(
      "/api/projects/:id/moves",
      { body: moveBody },
      async ({ params, body, status }) => {
        try {
          return await moves.start(params.id, body as MoveRequest);
        } catch (error) {
          return error instanceof MoveRefused
            ? status(error.status, error.message)
            : status(
                422,
                error instanceof Error ? error.message : String(error)
              );
        }
      }
    )
    // The moves the hub is carrying, for a screen that connects late.
    .get("/api/moves", () => moves.table())
    // Cancel: the step in flight stops; what is done stays, in `kept`.
    .delete("/api/moves/:id", ({ params, status }) => {
      try {
        return moves.cancel(params.id);
      } catch (error) {
        return error instanceof MoveRefused
          ? status(error.status, error.message)
          : status(422, error instanceof Error ? error.message : String(error));
      }
    })
    // Retry: a failed move runs its failed step again.
    .post("/api/moves/:id/retry", ({ params, status }) => {
      try {
        return moves.retry(params.id);
      } catch (error) {
        return error instanceof MoveRefused
          ? status(error.status, error.message)
          : status(422, error instanceof Error ? error.message : String(error));
      }
    });
