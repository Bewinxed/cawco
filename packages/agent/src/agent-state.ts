/**
 * What this agent holds now, as it says the same in its log and from the same
 * values: the log line is for people, this record for what checks the agent
 * (proofs, probe specs). `agent-state.json` in CawCo's data dir, written whole
 * or not at all at each change, one key per subject, each with the agent's pid
 * (`agent`) and when it took it, in ms since the epoch (`at`). It holds only
 * what this process recorded: an earlier agent's values go with its first
 * write.
 */
import { join } from "node:path";
import { cawcoDataDir } from "@cawco/core/paths";
import { writeStateFile } from "@cawco/core/state-file";

/** The file in CawCo's data dir that holds {@link AgentState}. */
export const AGENT_STATE_FILE = "agent-state.json";

/** Why the hub is on this computer (hub-loopback.ts `onThisComputer`): its own word, an address that is this computer's loopback, or one of its own interfaces'. */
export type HubHere = "hub-says" | "loopback" | "own-address";

export interface AgentState {
  /** The hub's last fleet sync this agent took (session.ts `FLEET_DELTA`): its revision, how many items, and whether it held all, was the welcome, or converges every item. */
  readonly fleetSync?: {
    readonly full: boolean;
    readonly items: number;
    readonly reconverge: boolean;
    readonly rev: number;
    readonly welcome: boolean;
  };
  /** How this computer's loopback serves the hub (hub-loopback.ts). */
  readonly hubLoopback?: {
    /** The dashboard's port here (`local`) and on the hub (`hub`); null when nothing is carried. */
    readonly dashboard: { readonly hub: number; readonly local: number } | null;
    /** Why the hub is on this computer, so nothing is carried; null when it is elsewhere. */
    readonly here: HubHere | null;
    /** The hub's host as the agent reaches it. */
    readonly hub: string;
    /** The loopback addresses that serve it. */
    readonly hosts: readonly string[];
    /** Its listeners, the dashboard's and every preview port's on each host. */
    readonly listeners: number;
    /** The tailnet name it is carried to over https; null over plain http. */
    readonly serverName: string | null;
  };
  /** The hub's session limits, which every keeper starts each child under (daemon.ts `takeSessionLimits`); null for unlimited. */
  readonly sessionLimits?: {
    readonly cpuPercent: number | null;
    readonly memoryPercent: number | null;
  };
  /** The start-up pass over the workspaces (boundary.ts `rearmHooks`): those armed then, those left for a session there, the older boundaries an earlier agent left in those, closed in the pass with nothing in them (`closeLeftRetiring`), and how long it took. */
  readonly startup?: {
    readonly armed: number;
    readonly later: number;
    readonly ms: number;
    readonly retired: number;
  };
}

/** Each subject as recorded, with its agent and time. */
type Recorded = {
  [Key in keyof AgentState]?: NonNullable<AgentState[Key]> & {
    readonly agent: number;
    readonly at: number;
  };
};

const held: Recorded = {};
let writes: Promise<void> = Promise.resolve();

/**
 * Records `value` as what this agent holds of `key`, the file written whole;
 * one write at a time, so none is lost. A write that fails is said, never
 * thrown: the record follows the agent, never steers it.
 */
export const recordAgentState = <Key extends keyof AgentState>(
  key: Key,
  value: NonNullable<AgentState[Key]>
): Promise<void> => {
  held[key] = { ...value, agent: process.pid, at: Date.now() } as Recorded[Key];
  const path = join(cawcoDataDir(), AGENT_STATE_FILE);
  writes = writes
    .then(() => writeStateFile(path, `${JSON.stringify(held)}\n`))
    .catch((error: unknown) => {
      console.warn(
        `[agent] ${path} could not be written: ${error instanceof Error ? error.message : String(error)}`
      );
    });
  return writes;
};
