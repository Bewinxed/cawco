/**
 * What the agent's services are built from that only the daemon knows
 * (daemon.ts `startDaemon`): its ports, the hub it dials now, the frame
 * line, and the supervisor while one supervises. The daemon gives it to
 * the agent's layer (agent-layer.ts) as it builds it.
 */

import type { RestartHold } from "@cawco/core/binary-updates";
import type { DaemonFrame } from "@cawco/core/envelopes";
import { Context } from "effect";
import type { AgentPorts } from "./agent-ports";

export class DaemonLinks extends Context.Service<
  DaemonLinks,
  {
    /** The machine this agent is. */
    readonly machineId: string;
    /** The hub this daemon was started for (`CAWCO_HUB_URL`, else the default). */
    readonly hubUrl: string;
    /** The hub it dials now: a rediscovery moves it, so it is read fresh at each use. */
    readonly hubNow: () => string;
    /** What the modules send through. */
    readonly ports: AgentPorts;
    /** A frame to the hub on the connection that is up. */
    readonly frame: (frame: DaemonFrame) => void;
    /**
     * The supervisor, from when its layer makes it until it detaches: what
     * the gateway and the updater ask what a restart would cut read it
     * (restart.ts). Set by the supervisor's layer alone.
     */
    readonly supervising: {
      current: { readonly restartHolds: () => RestartHold[] } | undefined;
    };
  }
>()("DaemonLinks") {}
