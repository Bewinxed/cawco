import { hubPorts } from "../hub-ports";

/**
 * The port inside a browser container where its socat carries Chromium's
 * proxy to the browser's dashboard door (chromium.conf `door`,
 * dashboard-door.ts): the container's own loopback, which nothing else in
 * it holds.
 */
const CONTAINER_DOOR_PORT = 9230;

const DOOR = `PROXY 127.0.0.1:${CONTAINER_DOOR_PORT}`;

/** `origin`'s `host:port` as a PAC reads a URL's: the host lowercased, an IPv6 one in brackets, the port written out. */
const hostPort = (origin: string): string => {
  const { hostname, port, protocol } = new URL(origin);
  return `${hostname.toLowerCase()}:${port || (protocol === "https:" ? "443" : "80")}`;
};

/**
 * The proxy auto-config script a container's Chromium starts with: every
 * URL on the hub's port or the dashboard's port ({@link hubPorts}), on any
 * host, and every dashboard origin on another port (`origins`, the hub's
 * list as the browser's door last read it: a proxy domain on 443), go to
 * the browser's dashboard door, which signs the dashboard's in as the
 * browser and refuses the rest (dashboard-door.ts); everything else is
 * `DIRECT`. A hub that trusts its network takes a request with no
 * credential as the owner (hub hub-auth.ts `classify`), so none of them
 * may go direct.
 *
 * A PAC given on the command line is not mandatory: Chromium sends a URL
 * whose script throws `DIRECT` ("Fall-back to direct for non-mandatory PAC
 * runtime errors", net/proxy_resolution/configured_proxy_resolution_service.cc).
 * So the script catches everything and sends such a URL to the door, which
 * passes on what is neither the hub's nor its dashboard's.
 */
const hubPac = (origins: readonly string[]): string => {
  const ports = JSON.stringify(hubPorts().map(String));
  const off = JSON.stringify(
    origins.map(hostPort).filter(
      (one) =>
        !hubPorts()
          .map(String)
          .includes(one.slice(one.lastIndexOf(":") + 1))
    )
  );
  return `function FindProxyForURL(url, host) {
  try {
    var m = /^([a-z][a-z0-9+.-]*):\\/\\/(?:[^\\/?#@]*@)?(\\[[^\\]]*\\]|[^\\/?#:]*)(?::(\\d+))?/i.exec(url);
    if (!m) return "${DOOR}";
    var scheme = m[1].toLowerCase();
    var port = m[3] || (scheme === "https" || scheme === "wss" ? "443" : "80");
    if (${ports}.indexOf(port) >= 0) return "${DOOR}";
    if (${off}.indexOf(m[2].toLowerCase() + ":" + port) >= 0) return "${DOOR}";
    return "DIRECT";
  } catch (e) {
    return "${DOOR}";
  }
}`;
};

/** The PAC as the `data:` URL Chromium's `--proxy-pac-url` takes (net/docs/proxy.md). */
export const hubPacUrl = (origins: readonly string[]): string =>
  `data:application/x-ns-proxy-autoconfig;charset=utf-8,${encodeURIComponent(hubPac(origins))}`;
