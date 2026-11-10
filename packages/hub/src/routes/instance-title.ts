import { Elysia, problem, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";

import { titleProblem } from "../work-items";

export const instanceTitleRenameRoutes = ({
  db,
  publishInstances,
}: Pick<HubContext, "db" | "publishInstances">) =>
  new Elysia()
    // The session naming itself (`set_title`). Refused, with the owner's
    // name in the answer, once the owner has renamed it.
    .post(
      "/api/instances/:id/title",
      { ...hidden, body: t.Object({ title: t.String() }) },
      ({ params, body }) => {
        const title = body.title.trim();
        const misfit = titleProblem(title);
        if (misfit) {
          return problem(400, { code: "title-invalid", detail: misfit });
        }
        const result = db.nameInstance(params.id, title, "agent");
        if (!result) {
          return problem(404, {
            code: "no-session",
            detail: `no session ${params.id}`,
          });
        }
        if (!result.named) {
          return problem(409, {
            code: "owner-named-session-so",
            detail: `The owner named this session "${result.row.title}", so set_title leaves it alone. Carry on with the task; do not call set_title again.`,
          });
        }
        publishInstances(result.row.machineId);
        return `Named this session "${title}".`;
      }
    );
