/**
 * Move files: a project's folder moved, files and all (folder-moves.ts):
 * what it would do, the move, where it stands, Call off, Try again, an
 * agent's reply interrupted, and the stream of bytes between two machines.
 */

import { Elysia, t } from "elysia";
import { byteRoutes } from "../byte-routes";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";

/** A destination: a machine of the fleet and a folder on it, full or under its home. */
const destination = {
  machineId: t.String({ minLength: 1 }),
  path: t.String({ pattern: "^(/|~/|~$)" }),
};

export const folderMoveRoutes = ({
  folderMoves,
}: Pick<HubContext, "folderMoves">) =>
  new Elysia()
    .use(byteRoutes)
    // What moving the folder would do, before anything runs.
    .get(
      "/api/projects/:id/places/:placeId/move-preview",
      { query: t.Object(destination) },
      ({ params, query }) =>
        folderMoves.preview(params.id, params.placeId, query)
    )
    // The move: the hub owns the job from here.
    .post(
      "/api/projects/:id/places/:placeId/move",
      {
        body: t.Object({
          ...destination,
          // The agents asked to continue from a summary.
          summaries: t.Array(t.String({ minLength: 1 })),
        }),
      },
      ({ params, body }) => folderMoves.start(params.id, params.placeId, body)
    )
    // Where a move stands, or what it did.
    .get("/api/folder-moves/:moveId", ({ params }) =>
      folderMoves.read(params.moveId)
    )
    // Call off, before the project is recorded at the new folder.
    .delete("/api/folder-moves/:moveId", ({ params }) =>
      folderMoves.callOff(params.moveId)
    )
    // Try again: a stage that stopped, or what the removal left.
    .post("/api/folder-moves/:moveId/retry", ({ params }) =>
      folderMoves.retry(params.moveId)
    )
    // Interrupt now: the reply a move waits for stops.
    .post("/api/folder-moves/interrupt/:instanceId", ({ params }) =>
      folderMoves.interrupt(params.instanceId)
    )
    // The bytes between two machines, each side a machine's agent; the
    // stream is read by the take as it is put, and kept nowhere. Each side
    // may wait for the other, or for a slow disk, longer than the server's
    // idle timer, so neither request is timed out.
    .put(
      "/api/folder-moves/relay/:token",
      { parse: "none", bytesIn: true, ...hidden },
      ({ params, request, server }) => {
        server?.timeout(request, 0);
        return folderMoves.relayPut(params.token, request);
      }
    )
    .get(
      "/api/folder-moves/relay/:token",
      { bytesOut: true, ...hidden },
      ({ params, request, server }) => {
        server?.timeout(request, 0);
        return folderMoves.relayTake(params.token);
      }
    );
