/**
 * A session's MCP gate: the agent's gateway path it reaches every fleet
 * server through, whatever its harness (`/mcp/gate/<gate id>/<name>`,
 * mcp-host.ts `McpHost.gateTarget`), and CawCo's own server too. The gate is
 * its workspace's, else its own: the session's, or an OpenCode location's
 * folder's (core `folderGateId`).
 *
 * - A server with a command runs on the host, one process per gate and
 *   name, started at its first call; no session starts one of its own, so a
 *   session's start starts no fleet server (the owner's pick of 2026-11-19
 *   on "What stays running on a machine": browser tools "Start on first
 *   use"). A Claude Code session in a workspace runs every process it
 *   spawns inside the boundary (its shell prefix, boundary/hook-judge.ts
 *   `claudePrefixScript`), where no fleet server reaches its install, its
 *   browser door or the owner's machines; every harness takes the same
 *   gate, so each server works the same in each.
 * - A remote server (streamable HTTP or SSE) is relayed by the gate, which adds
 *   the server's own headers (an API key, a CF-Access secret) itself, and
 *   CawCo's own server with the session's credential. So no harness holds
 *   a fleet server's secret or the session's credential in what it is
 *   handed: Antigravity writes every MCP server's headers into its
 *   conversation database, in plain text, and keeps them after the session.
 *
 * What a harness is handed is the session's own gate token
 * ({@link GATE_TOKEN_HEADER}): good for its gate while its process runs,
 * and refused from the moment it ends (mcp-host.ts `memberToken`).
 *
 * A module with nothing to start, so a harness's own host (pi's) can read it.
 */
import { createHash } from "node:crypto";
import { CAWCO_SERVER } from "@cawco/core/delegate-types";
import type { FleetMcpConfig } from "@cawco/core/fleet";
import { GATE_PREFIX } from "@cawco/core/gateway-paths";

/**
 * The header a session's harness carries its gate token in. Not
 * `Authorization`: a remote server's own `Authorization` is the gate's to
 * add, and the token is no bearer of anything past its gate.
 */
export const GATE_TOKEN_HEADER = "X-CawCo-Gate";

/** A session's gate: the path its servers hang off, and the session's token every call carries. */
export interface McpGate {
  /** `http://127.0.0.1:<gateway>/mcp/gate/<gate id>/`, each server's name after it. */
  readonly base: string;
  /** {@link GATE_TOKEN_HEADER}: the session's gate token (mcp-host.ts `memberToken`). */
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
 * Server `name` of `gate`, on `config`, as a harness's config names a remote
 * server (SSE for an SSE one, streamable HTTP for the rest), holding nothing
 * of `config` but its hash. The URL carries the config's hash (`?config=`),
 * which the gate does not route by: a harness that takes a fleet change by
 * comparing its servers' entries (Claude Code's `setMcpServers`, pi's
 * registrations) sees a changed server as changed, and dials it anew,
 * listing the new config's tools. The gate itself runs whatever config the
 * fleet names now (mcp-host.ts `gateTarget`).
 */
const gatedEntry = (
  gate: McpGate,
  name: string,
  config: FleetMcpConfig
): Extract<FleetMcpConfig, { url: string }> => ({
  type: config.type === "sse" ? "sse" : "http",
  // @limit measured: 16 hex characters are 64 bits of SHA-256; the MCP configs one gate has held, so two collide after about 2^32 names
  url: `${gate.base}${encodeURIComponent(name)}?config=${createHash("sha256")
    .update(JSON.stringify(config))
    .digest("hex")
    .slice(0, CONFIG_MARK_LENGTH)}`,
  headers: { ...gate.headers },
});

/** `servers` as a session of `gate` takes them: every one through the gate. */
export const throughMcpGate = (
  servers: Record<string, FleetMcpConfig>,
  gate: McpGate
): Record<string, FleetMcpConfig> =>
  Object.fromEntries(
    Object.entries(servers).map(([name, config]) => [
      name,
      gatedEntry(gate, name, config),
    ])
  );

/**
 * CawCo's own server as a session of `gate` takes it: relayed by the gate
 * with the session's credential, which the harness never holds (mcp-host.ts
 * `gateTarget`).
 */
export const gatedCawco = (
  gate: McpGate
): Extract<FleetMcpConfig, { url: string }> => ({
  type: "http",
  url: `${gate.base}${encodeURIComponent(CAWCO_SERVER)}`,
  headers: { ...gate.headers },
});
