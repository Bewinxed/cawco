/**
 * What this process's environment names for the ports and servers its
 * machine-side parts use, each read where it is asked for: a scratch fleet
 * names its own. A module of the machine's and the hub's alone: it reads
 * `process.env`, which no browser has, so nothing the dashboard loads
 * imports it (scripts/browser-core-check.ts).
 */
import { BROWSER_GATE_PORT } from "./browser";
import { CAWCO_ENV, readEnv } from "./cawco-env";

/**
 * The port this machine's agent serves its DevTools gate on:
 * `CAWCO_BROWSER_GATE_PORT`, else {@link BROWSER_GATE_PORT} (browser.ts). The agent's
 * listener and every door it writes read it here, so a second agent on one
 * host (a scratch fleet) runs its gate on a port of its own.
 */
export const browserGatePort = (): number => {
  const named = readEnv(CAWCO_ENV.browserGatePort);
  const port = named === undefined ? BROWSER_GATE_PORT : Number(named);
  if (!(Number.isInteger(port) && port > 0 && port < 65_536)) {
    throw new Error(
      `${CAWCO_ENV.browserGatePort} must be a port number, not "${named}"`
    );
  }
  return port;
};

/**
 * The STUN server a machine asks for the public address its router maps it
 * to, at start and on each network change (agent capabilities.ts): one
 * server, Cloudflare's ("Cloudflare STUN Server: `stun.cloudflare.com:3478`",
 * developers.cloudflare.com/realtime/sfu/https-api/). A scratch fleet names
 * its own stand-in (`CAWCO_STUN_SERVER`).
 */
const STUN_SERVER = "stun:stun.cloudflare.com:3478";

/**
 * The STUN server this process names: a scratch fleet's stand-in where
 * `CAWCO_STUN_SERVER` names one, else {@link STUN_SERVER}. The one every reading of it goes
 * through: a machine's mapped address (agent relay-reach.ts), a browser's
 * own ICE servers (agent container-host.ts) and each viewer's (hub
 * browser-routes.ts), so all of them name the same server.
 */
export const stunServer = (): string =>
  readEnv(CAWCO_ENV.stunServer) ?? STUN_SERVER;
