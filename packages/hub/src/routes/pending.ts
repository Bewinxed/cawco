/**
 * What the person has seen and what waits on them: unanswered hand-offs, the pending envelopes and Needs you's artifacts.
 */

import { archiveRefusal } from "@cawco/core/archive";
import type {
  ArtifactNeedsFrame,
  ArtifactNeedsRead,
} from "@cawco/core/artifact-needs";
import type { ParkedAsk } from "@cawco/core/frames";
import type { Envelope } from "@cawco/core/protocol";
import { Elysia, problem, t } from "elysia";
import { clientAsk } from "../ask-presentation";
import type { HubContext } from "../hub-context";
import {
  askCollapseId,
  messageCollapseId,
  turnCollapseId,
} from "../notifications";

export const pendingRoutes = ({
  archiveView,
  artifactLane,
  db,
  handoffs,
  notifications,
  pending,
  publishInstances,
}: Pick<
  HubContext,
  | "archiveView"
  | "artifactLane"
  | "db"
  | "handoffs"
  | "notifications"
  | "pending"
  | "publishInstances"
>) =>
  new Elysia()
    // The owner looked at these sessions (a tab in front, after it ended)
    // or archived them off Finished. Every dashboard hears it on the
    // instance list it already reads.
    .post(
      "/api/seen",
      {
        body: t.Object({
          ids: t.Array(t.String(), { minItems: 1 }),
          /**
           * `archive`: taken off Finished without opening it, refused for
           * anything still doing something (`archiveRefusal`). `look`: the
           * owner had it in front after it ended, which is always so.
           * `unarchive`: clears the mark, so a session that ended is in
           * Finished again; keep-alive stays as it is.
           */
          kind: t.Union([
            t.Literal("archive"),
            t.Literal("look"),
            t.Literal("unarchive"),
          ]),
        }),
      },
      ({ body }) => {
        if (body.kind === "archive") {
          const view = archiveView();
          const refused = body.ids.flatMap((id) => {
            const why = archiveRefusal(id, view);
            return why ? [`${id}: ${why}`] : [];
          });
          if (refused.length > 0) {
            return problem(409, {
              code: "not-archived-still-doing",
              detail: `Not archived, still doing something. ${refused.join(" ")}`,
            });
          }
        }
        const instanceIds = body.ids;
        if (body.kind === "archive") {
          for (const id of instanceIds) {
            db.updateKeepAlive(id, {
              keepAliveEnabled: false,
              keepAliveStopped: null,
            });
          }
        }
        const at = body.kind === "unarchive" ? null : new Date();
        const seen = db.markSeen(instanceIds, at);
        // Done (an archive) takes it off the sidebar's Recent list until
        // the person writes to it again; an unarchive puts it back.
        if (body.kind !== "look") {
          db.markDone(instanceIds, at);
        }
        if (body.kind === "look") {
          // Looked at: a session's finished turn or failure, its message
          // and its asks are read, so their notifications come down.
          const looked = new Set(instanceIds);
          notifications.clear(
            [
              ...instanceIds.map((id) => turnCollapseId(id)),
              ...instanceIds.map((id) => messageCollapseId(id)),
              ...pending
                .list()
                .flatMap((parked) =>
                  parked.requestId &&
                  parked.instanceId &&
                  looked.has(parked.instanceId)
                    ? [askCollapseId(parked.requestId)]
                    : []
                ),
            ],
            "look"
          );
        }
        for (const machineId of new Set(seen.map((row) => row.machineId))) {
          publishInstances(machineId);
        }
        return { at: at?.getTime() ?? null };
      }
    )
    // Broadcast on change *and* readable on connect: a dashboard that opens
    // after a hand-off went out would otherwise show nothing until the next
    // time anything else moved.
    .get("/api/handoffs", () => Object.fromEntries(handoffs))
    // Every ask parked on the person, and Needs you's artifacts as one
    // `artifact.needs` frame (artifacts/lane.ts): the lane whole, from
    // the hub, which no session's ask names.
    .get("/api/pending", (): (ParkedAsk | Envelope<ArtifactNeedsFrame>)[] => [
      ...pending.list().map(clientAsk),
      { verb: "frames", machineId: "hub", payload: artifactLane.frame() },
    ])
    // Needs you's artifacts and their notices as they stand (core
    // artifact-needs.ts); each change after arrives as an
    // `artifact.needs` frame.
    .get("/api/artifact-needs", (): ArtifactNeedsRead => artifactLane.now());
