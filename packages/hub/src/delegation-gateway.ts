/**
 * What the hub's routes read of the delegation MCP (delegation-mcp.ts): its
 * listing, its calls and its transport. The hub's context holds this, not
 * the factory, so the routes that take the context import nothing of the
 * MCP's own modules (admin tools, hand-off tools) and those can call a
 * route's functions without an import cycle.
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export interface DelegationGateway {
  /** A tool call by the session `binding` names, or by OpenCode's stamped credential, run as the hub's one tool door. */
  readonly call: (
    binding: string | null,
    name: string,
    args: Record<string, unknown>,
    authorization?: string,
    toolUseId?: string,
    callKey?: string,
    cut?: AbortSignal
  ) => Promise<CallToolResult>;
  /** An MCP request, answered as the streamable HTTP transport answers it. */
  readonly handle: (
    request: Request,
    parsedBody?: unknown
  ) => Promise<Response>;
  /** What a session is listed, for the REST door (`cawco tools`); without one, the superset. Nothing when `instanceId` names no session on this hub. */
  readonly list: (
    instanceId?: string,
    own?: boolean
  ) =>
    | {
        tools: {
          _meta?: { "anthropic/alwaysLoad": boolean };
          annotations?: unknown;
          description: string;
          inputSchema: { type: "object" };
          name: string;
        }[];
      }
    | undefined;
}
