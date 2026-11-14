/**
 * The delegate-types store's routes (its table is db/delegate-types.ts).
 */
import type { DelegateType } from "@cawco/core/delegate-types";
import { delegateTypeProblem } from "@cawco/core/delegate-types";
import { EFFORT_LEVELS, HARNESSES } from "@cawco/core/harness/kinds";
import { delegateTypesWords } from "@cawco/core/words/delegate-types";
import { Elysia, problem, t } from "elysia";
import type { Static } from "typebox";
import { undoable } from "./db/trash";
import type { HubContext } from "./hub-context";

/**
 * What the fleet's delegate types are read and changed with: the routes
 * answer them, and the admin tools call them directly. A delete goes into the
 * hub's trash (`trash`, db/trash.ts) for its Undo. A type's `account` must be
 * one of the fleet's.
 */
export const delegateTypeCalls = ({
  db,
  delegateTypes,
}: Pick<HubContext, "db" | "delegateTypes">) => ({
  list: () => ({ types: delegateTypes.list() }),
  put: (name: string, body: DelegateTypeBody) => {
    const draft = { ...(body as Partial<DelegateType>), name };
    const misfit = delegateTypeProblem(draft);
    if (misfit) {
      return problem(400, {
        code: "delegate-type-invalid",
        detail: misfit,
      });
    }
    if (
      draft.account !== undefined &&
      db.accounts.get(draft.account) === undefined
    ) {
      return problem(400, {
        code: "no-account",
        detail: delegateTypesWords.noAccount(draft.account),
      });
    }
    return delegateTypes.put(draft as DelegateType);
  },
  remove: (name: string) => {
    const restore = db.trash.put(
      { kind: "delegateType", key: name },
      Date.now()
    );
    if (restore === undefined) {
      return problem(404, {
        code: "no-delegate",
        detail: `the fleet keeps no delegate type ${name}`,
      });
    }
    return undoable(restore);
  },
});

export const delegateTypeBody = t.Object({
  description: t.String(),
  harness: t.UnionEnum(HARNESSES),
  model: t.String(),
  effort: t.Optional(t.UnionEnum(EFFORT_LEVELS)),
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
});

/** A delegate type as its route takes it: everything but its name. */
export type DelegateTypeBody = Static<typeof delegateTypeBody>;

/**
 * The three routes: `GET /api/delegate-types`, `PUT /api/delegate-types/:name`,
 * `DELETE /api/delegate-types/:name`. A standalone Elysia app so `server.ts`
 * mounts it with one `.use()` rather than growing its own route list.
 */
export const delegateTypesRoutes = (
  ctx: Pick<HubContext, "db" | "delegateTypes">
) => {
  const calls = delegateTypeCalls(ctx);
  return new Elysia()
    .get("/api/delegate-types", () => calls.list())
    .put(
      "/api/delegate-types/:name",
      { body: delegateTypeBody },
      ({ params, body }) => calls.put(params.name, body)
    )
    .delete("/api/delegate-types/:name", ({ params }) =>
      calls.remove(params.name)
    );
};
