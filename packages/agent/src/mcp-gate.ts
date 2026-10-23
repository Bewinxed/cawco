/**
 * A workspace's MCP gate: the agent's gateway path its sessions reach every
 * fleet server with a command through, whatever their harness
 * (`/mcp/gate/<gate id>/<name>`, mcp-host.ts `McpHost.fetchGate`). The
 * server runs on the host, one process per gate and name, started at its
 * first call; a session of the workspace starts none of its own. A Claude
 * Code session in a workspace runs every process it spawns inside the
 * boundary (its shell prefix, boundary.ts `claudePrefixScript`), where no
 * fleet server reaches its install, its browser door or the owner's
 * machines; OpenCode's and pi's take the same gate, so each server works
 * the same in every harness.
 *
 * A module with nothing to start, so a harness's own host (pi's) can read it.
 */
import type { FleetMcpConfig } from "@cawco/core";

/** A workspace session's gate: the path its servers hang off, and the host key every call carries. */
export interface McpGate {
  /** `http://127.0.0.1:<gateway>/mcp/gate/<gate id>/`, each server's name after it. */
  readonly base: string;
  /** `Authorization: Bearer <host key>` (mcp-host.ts `hostKey`), which no boundary reads. */
  readonly headers: Readonly<Record<string, string>>;
}

/** Where every gate's path begins on the gateway; OpenCode's plugin writes its gate URLs from it. */
export const GATE_PREFIX = "/mcp/gate/";

/** The gateway path a gate's server is dialled on: its gate id and its name. */
export const GATE_PATH = /^\/mcp\/gate\/([^/]+)\/([^/]+)$/;

/** The gate path of gate `gateId`, server names after it. */
export const gatePath = (gateId: string): string =>
  `${GATE_PREFIX}${encodeURIComponent(gateId)}/`;

/** Server `name` of `gate`, as a harness's config names a streamable HTTP server. */
export const gatedEntry = (
  gate: McpGate,
  name: string
): Extract<FleetMcpConfig, { url: string }> => ({
  type: "http",
  url: `${gate.base}${encodeURIComponent(name)}`,
  headers: { ...gate.headers },
});

/**
 * `servers` as a session of `gate` takes them: each with a command through
 * the gate, every remote one as it is.
 */
export const throughMcpGate = (
  servers: Record<string, FleetMcpConfig>,
  gate: McpGate
): Record<string, FleetMcpConfig> =>
  Object.fromEntries(
    Object.entries(servers).map(([name, config]) => [
      name,
      "command" in config ? gatedEntry(gate, name) : config,
    ])
  );
