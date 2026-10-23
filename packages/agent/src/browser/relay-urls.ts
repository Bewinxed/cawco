/**
 * The stream relay's ICE URLs a browser of this machine is given (neko's
 * `NEKO_WEBRTC_ICESERVERS_BACKEND`, container-host.ts), composed here from
 * the credential the hub minted (`BrowserRelay`, its `reach` naming the
 * relay's machine and that machine's own addresses):
 *
 * - on the relay's own machine: `turn:<coturn's media address>:3478` over UDP
 *   alone. The browser and coturn share the media network (media-network.ts),
 *   so the allocation needs no forwarder and no hairpin through the router.
 * - on another machine: the relay at its tailnet address when both machines
 *   hold one (100.64/10), and at its LAN address when that address lies
 *   inside one of this machine's interface prefixes (`os.networkInterfaces()`
 *   cidr), each over UDP and TCP; then the relay's public URLs, as every
 *   viewer is given them. Local URLs first. They answer because the relay's
 *   listener is published on every address of its machine.
 *
 * Each URL costs the browser one allocation of the relay's 249 for the
 * connection's life. Whatever URL an allocation came through, its relayed
 * address is the relay's public one, so a viewer's relay candidate and the
 * browser's meet relay to relay inside the one coturn.
 */
import type { BrowserRelay } from "@cawco/core/browser";
import { STREAM_RELAY_PORT } from "@cawco/core/stream-relay";
import { insidePrefix, interfacePrefixes } from "./media-network";

/** A tailnet's addresses: CGNAT space, 100.64.0.0/10. */
const TAILNET = "100.64.0.0/10";

/** Where a browser of this machine composes its URLs from: its machine, and coturn's media address on its runtime. */
export interface RelayHere {
  machineId: string;
  /** coturn's address on this runtime's media network (media-network.ts `relayMediaAddress`). */
  relayMedia: string;
}

/** `turn:<address>:3478` over `transport`. */
const turnUrl = (address: string, transport: "udp" | "tcp"): string =>
  `turn:${address}:${STREAM_RELAY_PORT}?transport=${transport}`;

/** The relay's URLs for a browser of this machine, as the module's header says. */
export const relayUrlsFor = (
  relay: BrowserRelay,
  here: RelayHere
): string[] => {
  const { reach } = relay;
  if (reach?.machineId === here.machineId) {
    return [turnUrl(here.relayMedia, "udp")];
  }
  const prefixes = interfacePrefixes();
  const tailnetHere = prefixes.some((cidr) =>
    insidePrefix(cidr.split("/")[0] ?? "", TAILNET)
  );
  const tailnet = tailnetHere
    ? reach?.tailnet.find((one) => insidePrefix(one, TAILNET))
    : undefined;
  const lan = reach?.lan.find((one) =>
    prefixes.some((cidr) => insidePrefix(one, cidr))
  );
  const local = [tailnet, lan].flatMap((address) =>
    address ? [turnUrl(address, "udp"), turnUrl(address, "tcp")] : []
  );
  // Each URL once, where it first stands: a relay whose public address is
  // also its LAN one (a LAN-only fleet) names the same URL twice, and each
  // repeat would cost the browser another allocation of the relay's 249.
  return [...new Set([...local, ...relay.urls])];
};

/**
 * What a container's relay was made from, as one string: the hub's URLs and
 * the relay's reach. A credential that says another changes the URLs a
 * browser composes, so its container is made again.
 */
export const relayKeyOf = (relay: BrowserRelay): string =>
  JSON.stringify({ urls: relay.urls, reach: relay.reach ?? null });
