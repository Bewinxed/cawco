/**
 * The fleet's whole configuration as the dashboard reads it.
 */

import { maskMcpServer } from "@cawco/core/fleet-secrets";
import { Elysia } from "elysia";
import type { HubContext } from "../hub-context";

export const fleetRoutes = (
  ctx: Pick<
    HubContext,
    | "db"
    | "fleetMcp"
    | "marketplaceLinks"
    | "mcpReady"
    | "pluginRow"
    | "skillRow"
    | "unpushable"
  >
) => {
  const { db, fleetMcp, marketplaceLinks, pluginRow, skillRow, unpushable } =
    ctx;

  return (
    new Elysia()
      // The fleet's desired state (NEW.md §11), every table at once: it is one
      // page in the dashboard and one `syncFleetConfig` on a machine.
      //
      // The skills come back as rows rather than as part of the config: what the
      // machines get carries every skill's files, and a page that only lists them
      // must not weigh what the fleet weighs. The subagents do carry their files —
      // a definition is a page of markdown, and an editor that has to fetch each
      // one again is a round trip for nothing.
      .get("/api/fleet", async () => {
        await ctx.mcpReady;
        await fleetMcp.ready();
        const { mcp, marketplaces } = db.fleetConfig();
        return {
          // The plugins come from `listPlugins`, not from `fleetConfig`: the
          // config is what a MACHINE is sent, and it carries neither the hash a
          // resolve produced nor the sentence a failed one left. The dashboard
          // needs both — a plugin the hub could not fetch and a plugin a machine
          // would not install are different faults with different fixes.
          config: {
            // Every secret said as set, never its value (core fleet-secrets.ts).
            mcp: mcp.map(maskMcpServer),
            marketplaces,
            plugins: db.listPlugins().map(pluginRow),
          },
          // Links with no row yet: under way, or refused and not let go.
          links: [...marketplaceLinks.values()],
          skills: db.listSkills().map(skillRow),
          agents: db.listFleetAgents(),
          memory: db.getFleetMemory() ?? null,
          // The linked documents carry their files for the same reason the
          // subagents do: each one is a page of markdown, and the panel that
          // lists them is the panel that edits them.
          memoryDocs: db.listFleetMemoryDocs(),
          unpushable: Object.fromEntries(unpushable),
        };
      })
  );
};
