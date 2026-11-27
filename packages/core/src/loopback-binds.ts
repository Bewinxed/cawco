/**
 * The loopback addresses a listener binds beside its own address, so
 * `http://localhost:<port>` reaches it here by either family: a browser
 * resolves `localhost` to `::1` as well as 127.0.0.1, and a port open on
 * one family alone refuses the other (measured: a listener on 0.0.0.0
 * answers `http://127.0.0.1:<port>` and refuses `http://[::1]:<port>`).
 * The dashboard's sockets (cli service.ts `dashboardSockets`) and every
 * preview listener (hub preview-server/listeners.ts) bind them alike.
 */

/**
 * The loopback addresses a listener on `host` already answers: the IPv4
 * wildcard takes 127.0.0.1 and a loopback address itself; `::` is left to
 * name each, since an IPv6 wildcard takes IPv4 only where the system maps it.
 */
const coveredLoopback = (host: string): string[] => {
  if (host === "0.0.0.0") {
    return ["127.0.0.1"];
  }
  return host === "127.0.0.1" || host === "::1" ? [host] : [];
};

/**
 * Whether this computer can listen on `::1` now. A container or host with no
 * IPv6 loopback (`::1` absent, or no IPv6 at all) gets no `[::1]` listen.
 */
const hasIpv6Loopback = (): boolean => {
  try {
    Bun.serve({
      hostname: "::1",
      port: 0,
      fetch: () => new Response(null),
    }).stop(true);
    return true;
  } catch {
    // EADDRNOTAVAIL (no `::1`) or EAFNOSUPPORT (no IPv6): none here.
    return false;
  }
};

/** Each loopback address this computer has that a listener on `host` does not already answer ({@link coveredLoopback}). */
export const loopbackBeside = (host: string): string[] => {
  const covered = coveredLoopback(host);
  return ["127.0.0.1", ...(hasIpv6Loopback() ? ["::1"] : [])].filter(
    (one) => !covered.includes(one)
  );
};
