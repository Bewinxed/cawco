/**
 * The delegate-types store's routes (its table is db/delegate-types.ts).
 */
import type { DelegateType } from "@cawco/core/delegate-types";
import { delegateTypeProblem } from "@cawco/core/delegate-types";
import { EFFORT_LEVELS, HARNESSES } from "@cawco/core/harness/kinds";
import { delegateTypesWords } from "@cawco/core/words/delegate-types";
import { Elysia, t } from "elysia";
import type { DelegateTypesShape } from "./db/delegate-types";
import { undoable } from "./db/trash";

/**
 * The three routes: `GET /api/delegate-types`, `PUT /api/delegate-types/:name`,
 * `DELETE /api/delegate-types/:name`. A standalone Elysia app so `server.ts`
 * mounts it with one `.use()` rather than growing its own route list. A
 * delete goes into the hub's trash (`trash`, db/trash.ts) for its Undo. A
 * type's `account` must be one of the fleet's (`accountKnown`).
 */
export const delegateTypesRoutes = (
  store: DelegateTypesShape,
  trash: (name: string) => number | undefined,
  accountKnown: (id: string) => boolean
) =>
  new Elysia()
    .get("/api/delegate-types", () => ({ types: store.list() }))
    .put(
      "/api/delegate-types/:name",
      {
        body: t.Object({
          description: t.String(),
          harness: t.Union(HARNESSES.map((harness) => t.Literal(harness))),
          model: t.String(),
          effort: t.Optional(
            t.Union(EFFORT_LEVELS.map((level) => t.Literal(level)))
          ),
          skills: t.Optional(t.Array(t.String())),
          denyTools: t.Optional(t.Array(t.String())),
          mayStart: t.Optional(t.Array(t.String())),
          account: t.Optional(t.String()),
          connections: t.Optional(t.Array(t.String())),
          startingSet: t.Optional(
            t.Object({
              skills: t.Array(t.String()),
              servers: t.Array(t.String()),
            })
          ),
        }),
      },
      ({ params, body, status }) => {
        const draft = { ...(body as Partial<DelegateType>), name: params.name };
        const problem = delegateTypeProblem(draft);
        if (problem) {
          return status(400, problem);
        }
        if (draft.account !== undefined && !accountKnown(draft.account)) {
          return status(400, delegateTypesWords.noAccount(draft.account));
        }
        return store.put(draft as DelegateType);
      }
    )
    .delete("/api/delegate-types/:name", ({ params, status }) => {
      const restore = trash(params.name);
      if (restore === undefined) {
        return status(404, `the fleet keeps no delegate type ${params.name}`);
      }
      return undoable(restore);
    });
