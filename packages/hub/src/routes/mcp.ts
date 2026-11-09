/**
 * The hub's MCP endpoints: CawCo's own tools and each fleet server's relay.
 */

import { Elysia } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";
import { mcpRefused } from "../tool-call-keys";

export const mcpRoutes = ({
  delegationMcp,
  fleetMcp,
  toolCallKeys,
}: Pick<HubContext, "delegationMcp" | "fleetMcp" | "toolCallKeys">) =>
  new Elysia()
    .all("/mcp/cawco", hidden, ({ request, body, server }) => {
      // Tool deadlines govern long calls; the HTTP idle timer must not cut them short.
      server?.timeout(request, 0);
      return toolCallKeys.once(
        request,
        () => delegationMcp.handle(request, body),
        (words) => mcpRefused(body, words)
      );
    })
    .all(
      "/mcp/fleet/:name",
      { ...hidden, parse: "none" },
      ({ params, request, server }) => {
        server?.timeout(request, 0);
        return fleetMcp.forward(params.name, request);
      }
    );
