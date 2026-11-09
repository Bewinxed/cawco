/**
 * Model context windows the hub has heard.
 */
import { Elysia } from "elysia";
import type { HubContext } from "../hub-context";

export const modelWindowRoutes = ({ db }: Pick<HubContext, "db">) =>
  new Elysia()
    // Claude models' context windows as their turns last reported them; the
    // dashboard's model list carries them for claude rows.
    .get("/api/model-windows", () => ({
      claude: db.claudeContextWindows(),
    }));
