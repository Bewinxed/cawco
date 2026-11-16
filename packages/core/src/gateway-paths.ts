/**
 * The paths a machine's agent answers on its own MCP gateway, not relayed
 * to the hub: a shared server's (agent mcp-host.ts, `/mcp/local/<name>`) and
 * a workspace gate's (agent mcp-gate.ts, `/mcp/gate/<gate id>/<name>`). The
 * agent routes and builds them from these, and the hub's read of what an
 * agent calls (hub scripts/agent-calls.ts) leaves them out from these, so
 * neither can drift from the other.
 */

/** Where a shared server's path begins on the gateway, its name after it. */
export const HOSTED_PREFIX = "/mcp/local/";

/** Where every gate's path begins on the gateway; OpenCode's plugin writes its gate URLs from it. */
export const GATE_PREFIX = "/mcp/gate/";
