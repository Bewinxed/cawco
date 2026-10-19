/**
 * The fleet's MCP servers as this machine launches them: the fleet's own and
 * each project's placed copies, every command already resolved
 * (mcp-launcher.ts). Written whole by each fleet sync (session.ts
 * `#syncFleet`) into a file of CawCo's own ({@link fleetMcpSetFile}), and
 * read by every CawCo session as it starts and as the fleet changes: Claude
 * Code's through the SDK's `mcpServers` and `setMcpServers`, pi's through
 * `pi.registerMcpServer`. OpenCode's take the same servers through its
 * launch config (opencode.ts `OPENCODE_FLEET_MCP`). No config file the
 * person's own `claude`, `opencode` or `pi` reads holds any of them.
 */
import { sep } from "node:path";
import type { FleetMcpConfig } from "@cawco/core";
import { fleetMcpSetFile } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";

/** One project's server, placed at one of its folders on this machine. */
export interface PlacedFleetMcp {
  config: FleetMcpConfig;
  cwd: string;
  name: string;
}

export interface FleetMcpSet {
  /** Each project's placed copies, by `<name>@<place id>`. */
  placed: Record<string, PlacedFleetMcp>;
  /** The fleet's own servers, by the name sessions see. */
  servers: Record<string, FleetMcpConfig>;
}

const EMPTY: FleetMcpSet = { servers: {}, placed: {} };

/** The set the last sync wrote; none before the first, or when it cannot be read (said on the log). */
export const readFleetMcpSet = async (): Promise<FleetMcpSet> => {
  try {
    return (await readRecord<FleetMcpSet>(fleetMcpSetFile())) ?? EMPTY;
  } catch (error) {
    console.warn(
      `[fleet] ${fleetMcpSetFile()} was not read, so sessions load no fleet MCP server: ${error instanceof Error ? error.message : String(error)}`
    );
    return EMPTY;
  }
};

/** The set, written whole. */
export const writeFleetMcpSet = (set: FleetMcpSet): Promise<void> =>
  writeStateFile(fleetMcpSetFile(), JSON.stringify(set, null, 2));

const within = (cwd: string, folder: string): boolean =>
  cwd === folder ||
  cwd.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);

/**
 * The servers a session in `cwd` loads: the fleet's, with the placed copies
 * of the deepest place at or above `cwd` over them, as Claude Code read a
 * folder's own map over its user scope.
 */
export const fleetMcpAt = (
  set: FleetMcpSet,
  cwd: string
): Record<string, FleetMcpConfig> => {
  const placed = Object.values(set.placed);
  const [folder] = placed
    .map((row) => row.cwd)
    .filter((one) => within(cwd, one))
    .sort((a, b) => b.length - a.length);
  return {
    ...set.servers,
    ...Object.fromEntries(
      placed
        .filter((row) => row.cwd === folder)
        .map((row) => [row.name, row.config])
    ),
  };
};
