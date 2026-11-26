/**
 * A fleet as Configure › Command-line tools draws it, for ToolMatrix's
 * stories: every catalog tool installed four minutes ago, and the
 * Antigravity CLI in the state each machine gives it.
 */
import { MINUTE_MS } from "@cawco/core/time";
import { TOOL_CATALOG, type ToolStatus } from "@cawco/core/tools";
import type { Machine } from "./stores/board.svelte";

const AGY = "antigravity";

const VERSIONS: Record<string, string> = {
  claude: "2.1.321",
  opencode: "2.3.0",
  pi: "1.4.0",
  [AGY]: "1.5.18",
};

const installed = (id: string): ToolStatus => ({
  id,
  state: "installed",
  version: VERSIONS[id] ?? "1.0.0",
  method: "script",
  at: Date.now() - 4 * MINUTE_MS,
});

/** The CLI installed. */
export const agyInstalled: ToolStatus = installed(AGY);

/** No copy of the CLI on the machine. */
export const agyMissing: ToolStatus = {
  id: AGY,
  state: "missing",
  at: Date.now() - 4 * MINUTE_MS,
};

export const fleetMachine = (
  machineId: string,
  hostname: string,
  os: string,
  agy: ToolStatus,
  online = true
): Machine => ({
  machineId,
  hostname,
  os,
  status: online ? ("online" as const) : ("offline" as const),
  auth: "unknown",
  joinedAt: 0,
  pausedUntil: null,
  pauseStopped: null,
  tools: {
    ...Object.fromEntries(
      TOOL_CATALOG.filter((spec) => spec.id !== AGY).map((spec) => [
        spec.id,
        installed(spec.id),
      ])
    ),
    [AGY]: agy,
  },
});

/** Eight machines: the CLI missing, installed, and installed on one offline. */
export const toolFleet = (): Machine[] => [
  fleetMachine("m-nifty", "niftybot.art", "linux", agyMissing),
  fleetMachine("m-obelisk", "obelisk-of-light", "linux", agyInstalled),
  fleetMachine("m-omar", "Omars-MacBook-Pro", "darwin", agyInstalled),
  fleetMachine("m-uwu", "uwucloud", "linux", agyInstalled),
  fleetMachine("m-hangar", "hangar", "linux", agyInstalled, false),
  fleetMachine("m-roost", "roost", "darwin", agyMissing),
  fleetMachine("m-crow", "crowsnest", "linux", agyInstalled),
  fleetMachine(
    "m-ledger",
    "ledger-build-runner-eu-west-3.internal",
    "linux",
    agyInstalled
  ),
];
