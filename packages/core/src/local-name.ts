/**
 * The hub's `.local` name typed in a browser (hub local-name.ts): a browser
 * given a bare name asks port 80 (Chromium first tries 443, and falls back
 * to http when that is refused), and the dashboard answers on its own port.
 * So the hub answers port 80 on the addresses its name is answered on with
 * a redirect to the dashboard's port at the same host, and with the stream
 * relay's ACME challenges, so the relay's certificate on this machine is
 * issued through the same listener.
 */

/** The port a browser asks for a bare name over http. */
export const LOCAL_WEB_PORT = 80;

/** Where an ACME HTTP-01 challenge is asked (RFC 8555 §8.3). */
export const ACME_CHALLENGE = "/.well-known/acme-challenge/";

/**
 * Where a typed `.local` name stands:
 * - `off`: the hub answers no name here (mDNS off, no shared network), or
 *   port 80 is refused for a reason this machine's setting doesn't fix (a
 *   listener of another process holds it);
 * - `needs`: Linux refuses the port below `ip_unprivileged_port_start`, and
 *   `command` lowers it;
 * - `serving`: port 80 redirects to the dashboard.
 */
export type LocalNameState = "off" | "needs" | "serving";

/** What `GET /api/local-name` answers, and the `local.name` frame carries. */
export interface LocalName {
  /** The one-line command that lets the hub bind port 80, while `needs`. */
  command?: string;
  /** The dashboard's port, the one port 80 redirects to. */
  dashboardPort: number;
  /** The hub's machine, by its hostname. */
  host: string;
  /** The `.local` name the hub holds, once it holds one. */
  name?: string;
  state: LocalNameState;
}
