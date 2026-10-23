/**
 * The harness config the fleet places, as this machine's CawCo sessions take
 * it: the fleet's hooks and each project's placed copies, every command hook
 * pointed at the script the sync wrote for it. Written whole by each fleet
 * sync (fleet.ts `converge`) into a file of CawCo's own
 * ({@link fleetHarnessSetFile}), and read by every CawCo session as it
 * starts: Claude Code's through the SDK's flag settings (claude.ts
 * `sessionSettingsOptions`), OpenCode's through CawCo's plugin
 * (opencode-plugin.ts), pi's through CawCo's inline extension
 * (pi-runtime.ts). No config file the person's own `claude`, `opencode` or
 * `pi` reads holds a project's copy, and nothing is written into a checkout.
 *
 * The fleet's own hooks are here for OpenCode and pi; Claude Code reads them
 * from the user settings the sync registers them in, where the person's own
 * `claude` runs them too.
 */
import type { HookEvent, HookHandler } from "@cawco/core";
import { fleetHarnessSetFile } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import { within } from "./fleet-mcp-set";

/** One hook as a session runs it: a command hook's `command` is its script's path on this machine. */
export interface SetHook {
  event: HookEvent;
  handler: HookHandler;
  /** The fleet row's id; a placed copy's is `<id>@<place id>`. */
  id: string;
  matcher?: string;
  name: string;
}

/** One project's hook, placed at one of its folders on this machine. */
export interface PlacedSetHook extends SetHook {
  cwd: string;
}

export interface FleetHarnessSet {
  /** The fleet's own hooks, by id. */
  hooks: Record<string, SetHook>;
  /** Each project's placed copies, by `<id>@<place id>`. */
  placedHooks: Record<string, PlacedSetHook>;
}

const EMPTY: FleetHarnessSet = { hooks: {}, placedHooks: {} };

/** The set the last sync wrote; none before the first, or when it cannot be read (said on the log). */
export const readFleetHarnessSet = async (): Promise<FleetHarnessSet> => {
  try {
    const stored = await readRecord<Partial<FleetHarnessSet>>(
      fleetHarnessSetFile()
    );
    return { ...EMPTY, ...stored };
  } catch (error) {
    console.warn(
      `[fleet] ${fleetHarnessSetFile()} was not read, so sessions take no fleet hook: ${error instanceof Error ? error.message : String(error)}`
    );
    return EMPTY;
  }
};

/** The set, written whole. */
export const writeFleetHarnessSet = (set: FleetHarnessSet): Promise<void> =>
  writeStateFile(fleetHarnessSetFile(), JSON.stringify(set, null, 2));

/**
 * The placed rows a session in `cwd` takes: those of the deepest place at or
 * above it, as a project's MCP servers are taken (fleet-mcp-set.ts
 * `fleetMcpAt`). None when no place holds `cwd`.
 */
export const placedAt = <T extends { cwd: string }>(
  placed: Record<string, T>,
  cwd: string
): T[] => {
  const rows = Object.values(placed);
  const [folder] = rows
    .map((row) => row.cwd)
    .filter((one) => within(cwd, one))
    .sort((a, b) => b.length - a.length);
  return folder === undefined ? [] : rows.filter((row) => row.cwd === folder);
};

/** The hooks a session in `cwd` runs on a harness that takes the fleet's from here: the fleet's, then its place's. */
export const hooksAt = (set: FleetHarnessSet, cwd: string): SetHook[] => [
  ...Object.values(set.hooks),
  ...placedAt(set.placedHooks, cwd),
];
