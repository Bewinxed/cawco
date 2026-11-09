import { Elysia, t } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { refusal } from "../refusal";
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
        const problem = titleProblem(title);
        if (problem) {
          return refusal(400, "title-invalid", problem);
        }
        const result = db.nameInstance(params.id, title, "agent");
        if (!result) {
          return refusal(404, "no-session", `no session ${params.id}`);
        }
        if (!result.named) {
          return refusal(
            409,
            "owner-named-session-so",
            `The owner named this session "${result.row.title}", so set_title leaves it alone. Carry on with the task; do not call set_title again.`
          );
        }
        publishInstances(result.row.machineId);
        return `Named this session "${title}".`;
      }
    );
