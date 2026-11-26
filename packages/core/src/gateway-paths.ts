/**
 * The paths a machine's agent answers on its own MCP gateway, not relayed
 * to the hub: a shared server's (agent mcp-host.ts, `/mcp/local/<name>`) and
 * a workspace gate's (agent mcp-gate.ts, `/mcp/gate/<gate id>/<name>`). The
 * agent routes and builds them from these, and the hub's read of what an
 * agent calls (hub scripts/agent-calls.ts) leaves them out from these, so
 * neither can drift from the other.
 */

import { createHash } from "node:crypto";

/** Where a shared server's path begins on the gateway, its name after it. */
export const HOSTED_PREFIX = "/mcp/local/";

/** Where every gate's path begins on the gateway; OpenCode's plugin writes its gate URLs from it. */
export const GATE_PREFIX = "/mcp/gate/";

/**
 * The gate id of an OpenCode location outside every workspace: one OpenCode
 * server runs each location's MCP servers for all its sessions, so their
 * gate is the folder's, which the agent and the location's plugin both
 * derive from the folder's path as the session names it (`cwd`, the
 * location's `directory`).
 */
export const folderGateId = (directory: string): string =>
  // @limit measured: 24 hex characters are 96 bits of SHA-256; one gate id per folder an OpenCode location runs in on one machine, so two collide after about 2^48 names
  `dir-${createHash("sha256").update(directory).digest("hex").slice(0, 24)}`;
