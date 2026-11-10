/**
 * The hub's MCP endpoints: CawCo's own tools and each fleet server's relay.
 */

import { Elysia, problem } from "elysia";
import { hidden } from "../hidden";
import type { HubContext } from "../hub-context";

import { mcpRefused } from "../tool-call-keys";

export const mcpRoutes = ({
  delegationMcp,
  fleetMcp,
  hubAuth,
  toolCallKeys,
}: Pick<
  HubContext,
  "delegationMcp" | "fleetMcp" | "hubAuth" | "toolCallKeys"
>) =>
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
        // A Bearer that names no session is no credential: refused as
        // CawCo's own endpoint refuses it, before any server is relayed.
        const caller = hubAuth.callerOf(request, null);
        if (caller.kind === "session" && caller.instanceId === null) {
          return problem(401, {
            code: "invalid-session-credential",
            detail: "Invalid session credential",
          });
        }
        server?.timeout(request, 0);
        return fleetMcp.forward(params.name, request);
      }
    );
