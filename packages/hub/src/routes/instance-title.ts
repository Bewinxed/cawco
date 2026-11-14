import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";

import { titleCalls } from "../session-calls";

export const instanceTitleRenameRoutes = (
  ctx: Pick<HubContext, "db" | "publishInstances">
) => {
  const { setTitle } = titleCalls(ctx);
  return (
    new Elysia()
      // The session naming itself (`set_title`). Refused, with the owner's
      // name in the answer, once the owner has renamed it.
      .post(
        "/api/instances/:id/title",
        { ...hidden, body: t.Object({ title: t.String() }) },
        ({ params, body }) => setTitle(params.id, body.title)
      )
  );
};
