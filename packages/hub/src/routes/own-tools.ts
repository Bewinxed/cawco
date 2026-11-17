/**
 * The fleet's helpers and step lists (core own-tools.ts): whether sessions
 * use CawCo's delegates and plan list or their agent's own subagents, to-do
 * list and plan mode. Read by the first run and Configure › Helpers & step
 * lists, written by either; each machine takes a change on its next fleet
 * sync, and a session as it starts.
 */
import {
  HELPERS,
  type OwnTools,
  type OwnToolsChosen,
  STEP_LISTS,
} from "@cawco/core/own-tools";
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";

export const ownToolRoutes = ({
  db,
  fleetChanged,
}: Pick<HubContext, "db" | "fleetChanged">) =>
  new Elysia()
    .get("/api/own-tools", (): OwnToolsChosen => db.ownTools())
    .put(
      "/api/own-tools",
      {
        body: t.Object({
          helpers: t.Optional(t.UnionEnum(HELPERS)),
          stepLists: t.Optional(t.UnionEnum(STEP_LISTS)),
        }),
      },
      ({ body }): OwnToolsChosen => {
        const before = db.ownTools();
        const next: Partial<OwnTools> = {
          ...(body.helpers ? { helpers: body.helpers } : {}),
          ...(body.stepLists ? { stepLists: body.stepLists } : {}),
        };
        db.setOwnTools(next);
        const after = db.ownTools();
        if (
          before.helpers !== after.helpers ||
          before.stepLists !== after.stepLists
        ) {
          console.info(
            `[hub] sessions start with ${after.helpers === "subagents" ? "their agent's own subagents" : "CawCo's delegates"} and ${after.stepLists === "agent" ? "their agent's own step list" : "CawCo's plan list"}`
          );
          // Every machine is sent the policy item again; a session takes it
          // as it starts.
          fleetChanged("the fleet's helpers and step lists changed");
        }
        return after;
      }
    );
