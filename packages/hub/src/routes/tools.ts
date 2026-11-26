/**
 * A machine's tools: their list, and changing one; what the
 * fleet does with a copy CawCo does not run, and updating every such copy.
 */

import { type ToolUpdatesState, toolsBehind } from "@cawco/core/tool-updates";
import { TOOL_CATALOG, TOOL_UPDATES, toolSpec } from "@cawco/core/tools";
import { Elysia, problem, t } from "elysia";
import type { HubContext } from "../hub-context";

export const toolRoutes = ({
  db,
  keepCopiesOn,
  keptReleases,
  registry,
  updateAll,
}: Pick<
  HubContext,
  "db" | "keepCopiesOn" | "keptReleases" | "registry" | "updateAll"
>) => {
  /** The fleet's choice and each tool some machine is behind on, as the cells stand now. */
  const fleetUpdates = (): ToolUpdatesState => {
    const updates = db.toolUpdates();
    // The releases the hub's pass acts on, a pinned tool's left out, so a
    // copy the screens call due is one the pass sends.
    const releases = keptReleases();
    const machines = db.namedMachines().map(({ machineId }) => ({
      machineId,
      status: registry.agent(machineId) ? "online" : "offline",
      tools: db.agentTools(machineId),
    }));
    return {
      updates,
      releases,
      behind: toolsBehind(machines, updates, releases),
    };
  };
  return (
    new Elysia()
      // What the fleet does with a machine's copy of a tool at a version CawCo
      // does not run (core `ToolUpdates`): "update" (the default) or "ask".
      // Machines read it too: a build's `cawco binary-pins` puts its pins on
      // before the swap only under "update" (agent pin-record.ts).
      .get("/api/tool-updates", (): ToolUpdatesState => fleetUpdates())
      .put(
        "/api/tool-updates",
        {
          body: t.Object({
            updates: t.UnionEnum(TOOL_UPDATES),
          }),
        },
        ({ body }): ToolUpdatesState => {
          const before = db.toolUpdates();
          db.setToolUpdates(body.updates);
          if (before !== body.updates) {
            console.info(
              `[hub] a copy of a tool at a version CawCo doesn't run: ${body.updates === "update" ? "CawCo updates its own copies" : "nothing installs until a person presses Update"}`
            );
          }
          // Every machine connected now is sent what is due under the new
          // choice, rather than whenever it next reports.
          keepCopiesOn();
          return fleetUpdates();
        }
      )
      // Update all: the Update of the tool on every connected, unpaused
      // machine whose copy CawCo put there and does not run; a person's own
      // copy and the rest are left, each with why (tool-installs.ts
      // `updateAll`). Each
      // machine's cell reads `installing` until it answers, on the `instances`
      // frame, as after its own Update.
      .post("/api/tools/:id/update-all", ({ params }) => {
        if (!toolSpec(params.id)) {
          return problem(404, {
            code: "no-tool",
            detail: `no tool ${params.id}`,
          });
        }
        return updateAll(params.id);
      })
      // The catalog is code, so it ships with the answer rather than being stored:
      // a dashboard reads what tools exist and what the fleet has decided about
      // them here, and each machine's own status off the `instances` frame.
      .get("/api/tools", () => ({
        catalog: TOOL_CATALOG,
        policies: db.listToolPolicies(),
      }))
      .put(
        "/api/tools/:id",
        {
          body: t.Object({
            required: t.Optional(t.Boolean()),
            pinnedVersion: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
        ({ params, body }) => {
          if (!toolSpec(params.id)) {
            return problem(404, {
              code: "no-tool",
              detail: `no tool ${params.id}`,
            });
          }

          const policy = db.putToolPolicy(params.id, body);
          // The click: every machine that is online and missing a required
          // tool starts now, rather than whenever it next happens to
          // reconnect, and a pin set or cleared moves which release a copy
          // is due (tool-releases.ts `keptReleases`).
          keepCopiesOn();
          return policy;
        }
      )
  );
};
