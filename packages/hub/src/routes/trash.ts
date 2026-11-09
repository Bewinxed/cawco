/**
 * Bringing a thing the person deleted back from the trash.
 */

import { areaWords } from "@cawco/core/words/areas";
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";
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
      async ({ params }) => {
        const back = db.trash.take(params.id, Date.now());
        if (!back.ok) {
          switch (back.why) {
            case "taken":
              return refusal(
                409,
                "trash-name-taken",
                "Something of the same name was made while it waited, and that one stays."
              );
            case "unbound":
              return refusal(409, "undo-unbound", areaWords.undoUnbound);
            case "gone":
              return refusal(
                404,
                "trash-gone",
                "It can no longer be brought back: its undo has run out."
              );
            default:
              throw unreachable(back);
          }
        }
        return { kind: back.kind, row: await returned(back.kind, back.key) };
      }
    );
