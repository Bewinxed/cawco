import { Elysia, t } from "elysia";
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
      ({ params, body, status }) => {
        const title = body.title.trim();
        const problem = titleProblem(title);
        if (problem) {
          return status(400, problem);
        }
        const result = db.nameInstance(params.id, title, "agent");
        if (!result) {
          return status(404, `no session ${params.id}`);
        }
        if (!result.named) {
          return status(
            409,
            `The owner named this session "${result.row.title}", so set_title leaves it alone. Carry on with the task; do not call set_title again.`
          );
        }
        publishInstances(result.row.machineId);
        return `Named this session "${title}".`;
      }
    );
