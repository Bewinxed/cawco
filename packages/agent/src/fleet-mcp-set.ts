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
import {
  type FleetItemState,
  type FleetMcpConfig,
  MCP_NEEDS_SIGN_IN,
} from "@cawco/core";
import { fleetMcpSetFile } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";

/** One project's server, placed at one of its folders on this machine. */
interface PlacedFleetMcp {
  config: FleetMcpConfig;
  cwd: string;
  name: string;
}

export interface FleetMcpSet {
  /** Each project's placed copies, by `<name>@<place id>`. */
  placed: Record<string, PlacedFleetMcp>;
  /** The fleet's own servers, by the name sessions see. */
  servers: Record<string, FleetMcpConfig>;
  /**
   * The fleet's servers the hub holds no sign-in for (`auth.state`
   * `needs-auth` on the sync's row): sessions still take them, so the
   * sign-in reaches them in place, but no harness starts or reads one for
   * its status ({@link apartSignedOut}). The hub's sync after the sign-in
   * drops the name.
   */
  signedOut: string[];
}

const EMPTY: FleetMcpSet = { servers: {}, placed: {}, signedOut: [] };

/** The set the last sync wrote; none before the first, or when it cannot be read (said on the log). */
export const readFleetMcpSet = async (): Promise<FleetMcpSet> => {
  try {
    const stored = await readRecord<Partial<FleetMcpSet>>(fleetMcpSetFile());
    return { ...EMPTY, ...stored };
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

/**
 * `names` apart by the set's sign-in marks: the ones a harness reads, and
 * each one the hub holds no sign-in for with its verdict, read from nothing.
 * A signed-out server is never started for a status read: the proxy answers
 * it 503 until the sign-in, which is a verdict that waits, not a failure to
 * try again.
 */
export const apartSignedOut = (
  names: readonly string[],
  set: Pick<FleetMcpSet, "signedOut">
): { read: string[]; signedOut: Record<string, FleetItemState> } => ({
  read: names.filter((name) => !set.signedOut.includes(name)),
  signedOut: Object.fromEntries(
    names
      .filter((name) => set.signedOut.includes(name))
      .map((name) => [name, MCP_NEEDS_SIGN_IN])
  ),
});

/** Whether `cwd` is `folder` or inside it, on whole path segments. */
export const within = (cwd: string, folder: string): boolean =>
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
