import { isIP } from "node:net";
import { hostname } from "node:os";
import { CAWCO_ENV, CAWCO_MDNS_TYPE, readEnv } from "@cawco/core";
import { getResponder, type ServiceOptions } from "@homebridge/ciao";
import { BIND_HOST, HUB_VERSION } from "./config";

/**
 * Announces the hub on the networks it sits on: the `_cawco._tcp` service
 * `cawco up` and the app browse for, and the host name `cawco.local`, so a
 * browser on the same network reaches the hub with no CawCo service, no
 * internet and no machine name to know.
 *
 * ciao is the responder (RFC 6762 and 6763; it passes Apple's Bonjour
 * Conformance Test): a socket per interface, each answering with that
 * interface's own addresses, and every name probed before it is announced,
 * again whenever another responder claims it later (§8, §9). A second hub
 * on the network finds `cawco.local` answered and holds `cawco-2.local`.
 * `cawco` is never the machine's own name, which the OS responder holds,
 * unless the machine is called that, and then probing moves the hub on too.
 *
 * Multicast is link-local: the name does not cross a router, and it does not
 * cross Tailscale or WireGuard, which carry no multicast. A VPN that does
 * (ZeroTier) carries it. The CLI walks tailscale peers for the tailnet case
 * — do not try to make mDNS carry that one.
 */
const NAME = "cawco";
const MACHINE = `cawco-${hostname().replaceAll(".", "-")}`;

let held: string | undefined;

/**
 * The `.local` name this hub holds on its networks right now: `cawco.local`,
 * or the next free `cawco-<n>.local`. Undefined with mDNS off, and while a
 * name is still being probed.
 */
export const localHubName = (): string | undefined => held;

/**
 * The addresses the name answers with: those the hub listens on (`HOST`),
 * so a client is never sent where nothing answers. `0.0.0.0` is every
 * IPv4 address and no IPv6 one, `::` every address, one address that one.
 * Undefined for a hub no other device reaches (loopback) and for a host
 * name, which can't be announced.
 */
const listened = (): Partial<ServiceOptions> | undefined => {
  if (BIND_HOST === "0.0.0.0") {
    return { disabledIpv6: true };
  }
  if (BIND_HOST === "::") {
    return {};
  }
  const loopback = BIND_HOST.startsWith("127.") || BIND_HOST === "::1";
  return isIP(BIND_HOST) && !loopback
    ? { restrictedAddresses: [BIND_HOST] }
    : undefined;
};

/**
 * Probes for the `n`th name and announces it once it is free. Its service's
 * instance name carries the same number: an instance numbered ciao's way,
 * `cawco-mac (2)`, would make ciao number the host name too
 * (`CiaoService.incrementName`).
 */
const claim = (
  n: number,
  port: number,
  addresses: Partial<ServiceOptions>
): void => {
  const name = n === 1 ? NAME : `${NAME}-${n}`;
  const service = getResponder().createService({
    ...addresses,
    name: n === 1 ? MACHINE : `${MACHINE}-${n}`,
    type: CAWCO_MDNS_TYPE,
    hostname: name,
    port,
    txt: { version: HUB_VERSION },
  });
  let taken = false;
  // Probing found the name answered, at start or after it was announced.
  // ciao would announce `cawco-(2).local` next; it says the change as its
  // probe ends, before announcing (`Prober.endProbing`), so the service is
  // dropped here, `cawco-(2)` never goes out, and the next number is claimed.
  service.on("hostname-change", () => {
    taken = true;
    held = undefined;
    console.log(
      `[hub] ${name}.local answers for another hub on this network: claiming ${NAME}-${n + 1}.local`
    );
    service
      .destroy()
      .catch((error: Error) =>
        console.log(`[hub] mDNS: dropping ${name}.local: ${error.message}`)
      );
    claim(n + 1, port, addresses);
  });
  service
    .advertise()
    .then(() => {
      if (taken) {
        return;
      }
      held = `${name}.local`;
      console.log(
        `[hub] holding ${held} and advertising _${CAWCO_MDNS_TYPE}._tcp on :${port}`
      );
    })
    .catch((error: Error) =>
      console.log(`[hub] mDNS unavailable: ${error.message}`)
    );
};

export const advertise = (port: number): void => {
  if (readEnv(CAWCO_ENV.noMdns) === "1") {
    console.log("[hub] mDNS advertisement disabled");
    return;
  }
  const addresses = listened();
  if (!addresses) {
    console.log(
      `[hub] mDNS not started: HOST is ${BIND_HOST}, which no other device on the network reaches by address`
    );
    return;
  }
  // Platforms that refuse the multicast socket (locked-down containers, no
  // interface but loopback) leave the hub perfectly usable over an explicit URL.
  try {
    claim(1, port, addresses);
  } catch (error) {
    console.log(`[hub] mDNS unavailable: ${(error as Error).message}`);
  }
};
