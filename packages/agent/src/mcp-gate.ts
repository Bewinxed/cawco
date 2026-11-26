/**
 * A session's MCP gate: the agent's gateway path it reaches every fleet
 * server with a command through, whatever its harness
 * (`/mcp/gate/<gate id>/<name>`, mcp-host.ts `McpHost.fetchGate`). The gate
 * is its workspace's, else its own: the session's, or an OpenCode
 * location's folder's (core `folderGateId`). The server runs on the host,
 * one process per gate and name, started at its first call; no session
 * starts one of its own, so a session's start starts no fleet server (the
 * owner's pick of 2026-11-19 on "What stays running on a machine": browser
 * tools "Start on first use"). A Claude Code session in a workspace runs
 * every process it spawns inside the boundary (its shell prefix,
 * boundary/hook-judge.ts `claudePrefixScript`), where no fleet server
 * reaches its install, its browser door or the owner's machines; every
 * harness takes the same gate, so each server works the same in each.
 *
 * A module with nothing to start, so a harness's own host (pi's) can read it.
 */
import { createHash } from "node:crypto";
import type { FleetMcpConfig } from "@cawco/core/fleet";
import { GATE_PREFIX } from "@cawco/core/gateway-paths";

/** A session's gate: the path its servers hang off, and the host key every call carries. */
export interface McpGate {
  /** `http://127.0.0.1:<gateway>/mcp/gate/<gate id>/`, each server's name after it. */
  readonly base: string;
  /** `Authorization: Bearer <host key>` (mcp-host.ts `hostKey`), which no boundary reads. */
  readonly headers: Readonly<Record<string, string>>;
}

/** The gateway path a gate's server is dialled on: its gate id and its name. */
export const GATE_PATH = new RegExp(
  `^${RegExp.escape(GATE_PREFIX)}([^/]+)/([^/]+)$`,
  "u"
);

/** The gate path of gate `gateId`, server names after it. */
export const gatePath = (gateId: string): string =>
  `${GATE_PREFIX}${encodeURIComponent(gateId)}/`;

/** How much of a config's hash its gate URL carries: enough to tell two configs of one server apart. */
const CONFIG_MARK_LENGTH = 16;

/**
 * Server `name` of `gate`, on `config`, as a harness's config names a
 * streamable HTTP server. The URL carries the config's hash (`?config=`),
 * which the gate does not route by: a harness that takes a fleet change by
 * comparing its servers' entries (Claude Code's `setMcpServers`, pi's
 * registrations) sees a changed server as changed, and dials it anew,
 * listing the new config's tools. The gate itself runs whatever config the
 * fleet names now (mcp-host.ts `fetchGate`).
 */
const gatedEntry = (
  gate: McpGate,
  name: string,
  config: FleetMcpConfig
): Extract<FleetMcpConfig, { url: string }> => ({
  type: "http",
  // @limit measured: 16 hex characters are 64 bits of SHA-256; the MCP configs one gate has held, so two collide after about 2^32 names
  url: `${gate.base}${encodeURIComponent(name)}?config=${createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex")
    .slice(0, CONFIG_MARK_LENGTH)}`,
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
      "command" in config ? gatedEntry(gate, name, config) : config,
    ])
  );
