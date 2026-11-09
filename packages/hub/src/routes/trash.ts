/**
 * Bringing a thing the person deleted back from the trash.
 */

import { areaWords } from "@cawco/core/words/areas";
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";
import { unreachable } from "../unreachable";

export const trashRoutes = ({
  db,
  returned,
}: Pick<HubContext, "db" | "returned">) =>
  new Elysia()
    /**
     * Undo, for every config delete (db/trash.ts): the item back whole,
     * what its putting back sets going (a fan-out, a probe, the rule engine)
     * set going, and the item as its list reads it, under `row`.
     */
    .post(
      "/api/trash/:id/restore",
      { params: t.Object({ id: t.Numeric() }) },
      async ({ params, status }) => {
        const back = db.trash.take(params.id, Date.now());
        if (!back.ok) {
          switch (back.why) {
            case "taken":
              return status(
                409,
                "Something of the same name was made while it waited, and that one stays."
              );
            case "unbound":
              return status(409, areaWords.undoUnbound);
            case "gone":
              return status(
                404,
                "It can no longer be brought back: its undo has run out."
              );
            default:
              throw unreachable(back);
          }
        }
        return { kind: back.kind, row: await returned(back.kind, back.key) };
      }
    );
