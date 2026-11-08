/**
 * The hub's `.local` name (hub mdns.ts), and the address it opens the
 * dashboard at: the dashboard's own listener, on its own port
 * (`http://cawco.local:3455`). CawCo binds no other port for it.
 */

/**
 * Where the name stands:
 * - `held`: the hub answers `name` on its networks (`cawco.local`, or
 *   `cawco-2.local` when another hub there answers the first);
 * - `absent`: it answers none (mDNS off, no network other devices share, or
 *   the name still being probed).
 */
export type LocalNameState = "held" | "absent";

/** What `GET /api/local-name` answers. */
export interface LocalName {
  /** The dashboard's port: the one the name's address carries. */
  dashboardPort: number;
  /** The hub's machine, by its hostname. */
  host: string;
  /** The `.local` name the hub holds, while `held`. */
  name?: string;
  state: LocalNameState;
  /** The dashboard at the name, with its port (`http://cawco.local:3455`), while `held`. */
  url?: string;
}

/** {@link LocalName} for the name the hub holds now (undefined while it holds none). */
export const localNameOf = (
  host: string,
  dashboardPort: number,
  name: string | undefined
): LocalName =>
  name
    ? {
        host,
        dashboardPort,
        name,
        state: "held",
        url: `http://${name}:${dashboardPort}`,
      }
    : { host, dashboardPort, state: "absent" };
