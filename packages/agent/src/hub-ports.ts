import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { CAWCO_HUB_PORT, localDashboardPort } from "@cawco/core/protocol";

/**
 * The hub's API port and the dashboard's port (on a machine that is not the
 * hub's, the latter is the agent's listener carrying to the hub's dashboard,
 * hub-loopback.ts). A hub that trusts its network takes a request with no
 * credential as the owner (hub hub-auth.ts `classify`), so a command must not
 * reach either on any address: denied on `localhost` alone, it could still
 * dial the hub at its LAN or tailnet address, as a Linux workspace, which
 * reaches no private address at all, cannot. The cost is that a command
 * cannot reach an unrelated service on these two port numbers. A workspace's
 * git, tools and MCP go through doors and the agent's gateway instead, and
 * previews stay in their own range.
 */
export const hubPorts = (): number[] => [
  Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT),
  localDashboardPort(),
];
