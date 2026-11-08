/** The ports CawCo listens on, and how a process reads the ones an environment can move. */

import { CAWCO_ENV, readEnv } from "./cawco-env";

/**
 * The port an agent serves its MCP gateway on when `CAWCO_MCP_PORT` names
 * none: every production machine. Read it through `mcpGatewayPort()`, never
 * directly.
 *
 * Below Linux's ephemeral range, 32768–60999 (kernel ip-sysctl.rst,
 * `ip_local_port_range`), where a socket the kernel gives a port to could
 * hold it first: one of the agent's own did, on 2026-10-26, while the
 * gateway sat in that range. IANA's registry lists it inside
 * `,14035-14140,,Unassigned,,,,,,,,`, and nmap-services has no line for
 * 14060, TCP or UDP, so its scans never found it open (both read
 * 2026-10-26). Just below the browsers' ports (browser.ts `BROWSER_PORTS`).
 * A running session's config names the port it was launched on: one on
 * another port is relaunched at rest (core harness.ts `GATEWAY_RELAUNCH`).
 */
const CAWCO_MCP_DEFAULT_PORT = 14_060;

export const CAWCO_HUB_PORT = 3456;

/**
 * The dashboard's port, beside the hub's (IANA lists 3455 as `prsvp`, a
 * legacy RSVP encapsulation; no dev server defaults to it, as Vite, Next and
 * Rails do to 3000): on the hub's computer the dashboard's socket listens on
 * it, on the network and loopback alike, and on every other computer running
 * the agent `http://localhost:3455` is carried to it (agent hub-loopback.ts).
 * Every address of the dashboard ends in it. Loopback is a secure context,
 * so its previews run in a process of their own.
 */
export const CAWCO_LOCAL_DASHBOARD_PORT = 3455;

let gatewayPort: number | undefined;

/**
 * The port this machine's agent serves its MCP gateway on: `CAWCO_MCP_PORT`,
 * else {@link CAWCO_MCP_DEFAULT_PORT}, read once per process. It is the one
 * setting every end that names the gateway reads: the agent's listener, the
 * URL each session's MCP config and OpenCode config carry, the pi host the
 * keeper runs (given it by its agent), and `cawco service`'s restart
 * question. So a second agent on one host runs on a port of its own, with no
 * network namespace; production machines keep the default, which nothing in
 * the installer changes.
 *
 * A session's CLI is started with the gateway URL in its config and keeps it
 * for its whole life, across restarts of its agent (the keeper holds it).
 * So when the port changes (an update that moves the default, or a new
 * `CAWCO_MCP_PORT`), the agent asks the hub to relaunch each session whose
 * process names another port, between its turns ({@link GATEWAY_RELAUNCH}:
 * a Claude CLI by its CawCo slot's URL, a pi host by the port it says),
 * and each OpenCode server, whose config and plugin carry the URL, fails its
 * launch check and is replaced at rest.
 */
export const mcpGatewayPort = (): number => {
  if (gatewayPort === undefined) {
    const named = readEnv(CAWCO_ENV.mcpPort);
    const port = named === undefined ? CAWCO_MCP_DEFAULT_PORT : Number(named);
    if (!(Number.isInteger(port) && port > 0 && port < 65_536)) {
      throw new Error(
        `${CAWCO_ENV.mcpPort} must be a port number, not "${named}"`
      );
    }
    gatewayPort = port;
  }
  return gatewayPort;
};

/**
 * The dashboard's loopback port: `CAWCO_LOCAL_DASHBOARD_PORT`, else
 * {@link CAWCO_LOCAL_DASHBOARD_PORT}. The hub names it to every agent in its
 * register answer, and the installer listens on it with the dashboard's
 * sockets on the hub's computer (cli service.ts `dashboardAddress`); both
 * read it here.
 */
export const localDashboardPort = (): number => {
  const named = readEnv(CAWCO_ENV.localDashboardPort);
  const port = named === undefined ? CAWCO_LOCAL_DASHBOARD_PORT : Number(named);
  if (!(Number.isInteger(port) && port > 0 && port < 65_536)) {
    throw new Error(
      `${CAWCO_ENV.localDashboardPort} must be a port number, not "${named}"`
    );
  }
  return port;
};
