import { hubPorts } from "../hub-ports";

/**
 * The proxy auto-config script a container's Chromium starts with: a proxy
 * that cannot connect for any URL on the hub's port or the dashboard's port
 * ({@link hubPorts}), on any host, and `DIRECT` for the rest. A hub that
 * trusts its network takes a request with no credential as the owner (hub
 * hub-auth.ts `classify`), so a session's browser must not reach either.
 * A PAC decides every request the browser makes (navigation, fetch,
 * WebSocket) by host and port, whatever name or address the page used.
 *
 * Port 1 on 127.0.0.1 is the container's own loopback, where nothing listens:
 * the connection is refused. Preview ports and names stay `DIRECT`.
 */
const hubPac = (): string => {
  const ports = JSON.stringify(hubPorts().map(String));
  return `function FindProxyForURL(url, host) {
  var m = /^[a-z][a-z0-9+.-]*:\\/\\/[^\\/?#]*:(\\d+)(?:[\\/?#]|$)/i.exec(url);
  if (m && ${ports}.indexOf(m[1]) >= 0) return "PROXY 127.0.0.1:1";
  return "DIRECT";
}`;
};

/** The PAC as the `data:` URL Chromium's `--proxy-pac-url` takes (net/docs/proxy.md). */
export const hubPacUrl = (): string =>
  `data:application/x-ns-proxy-autoconfig;charset=utf-8,${encodeURIComponent(hubPac())}`;
