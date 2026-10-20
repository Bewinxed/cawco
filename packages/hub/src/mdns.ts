import { isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import { CAWCO_ENV, CAWCO_MDNS_TYPE, readEnv } from "@cawco/core";
import {
  getResponder,
  type Responder,
  type ServiceOptions,
} from "@homebridge/ciao";
import { BIND_HOST, HUB_VERSION } from "./config";
import { lanInterfaces } from "./lan-interfaces";

/**
 * Announces the hub on the networks it sits on: the `_cawco._tcp` service
 * `cawco up` and the app browse for, and the host name `cawco.local`, so a
 * browser on the same network reaches the hub with no CawCo service, no
 * internet and no machine name to know.
 *
 * ciao is the responder (RFC 6762 and 6763; it passes Apple's Bonjour
 * Conformance Test): a socket per interface, each answering with that
 * interface's own addresses, and every name probed before it is announced,
 * again whenever another responder claims it later (§8, §9). It runs on the
 * interfaces other devices share with this machine alone, and on Linux those
 * of one network (lan-interfaces.ts): there each socket also hears the
 * others' questions, so a container bridge or VPN tunnel given a socket
 * would answer a LAN device with its own address, one the device can't
 * reach, and the device waits out a connect to it. A second hub
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

/** A responder on one set of interfaces, and the name it claims there. */
interface Run {
  interfaces: string[];
  /** Its interfaces, joined: what a later read is compared with. */
  key: string;
  responder: Responder;
}

/** The responder answering now; undefined while the hub waits for a network. */
let current: Run | undefined;

/** What else follows the interfaces the name is answered on (local-name.ts's port 80). */
const followers: ((interfaces: string[]) => Promise<void>)[] = [];

/**
 * `follower` hears the interfaces the name is answered on at each read
 * ({@link FOLLOW_MS}), changed or not; never while mDNS is off or the hub
 * listens where no other device reaches it.
 */
export const followNameInterfaces = (
  follower: (interfaces: string[]) => Promise<void>
): void => {
  followers.push(follower);
};

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
  run: Run,
  n: number,
  port: number,
  addresses: Partial<ServiceOptions>
): void => {
  const name = n === 1 ? NAME : `${NAME}-${n}`;
  const service = run.responder.createService({
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
    if (run !== current) {
      return;
    }
    held = undefined;
    console.log(
      `[hub] ${name}.local answers for another hub on this network: claiming ${NAME}-${n + 1}.local`
    );
    service
      .destroy()
      .catch((error: Error) =>
        console.log(`[hub] mDNS: dropping ${name}.local: ${error.message}`)
      );
    claim(run, n + 1, port, addresses);
  });
  service
    .advertise()
    .then(() => {
      if (taken || run !== current) {
        return;
      }
      held = `${name}.local`;
      console.log(
        `[hub] holding ${held} and advertising _${CAWCO_MDNS_TYPE}._tcp on :${port}, on ${run.interfaces.join(", ")}`
      );
    })
    .catch((error: Error) =>
      console.log(`[hub] mDNS unavailable: ${error.message}`)
    );
};

/** How often the interfaces answered on are read again: ciao's own poll is 15 s. */
const FOLLOW_MS = 10_000;

/**
 * The interfaces the name is answered on: lan-interfaces.ts's, or for a hub
 * listening on one address, that address's interface when it is one of them.
 */
const answeredOn = async (): Promise<string[]> => {
  const shared = await lanInterfaces();
  if (!isIP(BIND_HOST) || BIND_HOST === "0.0.0.0" || BIND_HOST === "::") {
    return shared;
  }
  const owner = Object.entries(networkInterfaces()).find(([, entries]) =>
    entries?.some((entry) => entry.address === BIND_HOST)
  )?.[0];
  return owner && shared.includes(owner) ? [owner] : [];
};

/**
 * One read: the responder moved onto the interfaces read when they differ
 * from those it runs on, the old one saying goodbye there first. Answers
 * what the hub waits for, if anything.
 */
const move = async (
  port: number,
  addresses: Partial<ServiceOptions>
): Promise<string> => {
  const interfaces = await answeredOn();
  for (const follower of followers) {
    // biome-ignore lint/performance/noAwaitInLoops: each follower in turn, before the next read
    await follower(interfaces).catch((error: Error) =>
      console.log(`[hub] following ${interfaces.join(", ")}: ${error.message}`)
    );
  }
  const key = interfaces.join(",");
  if (key !== current?.key) {
    const old = current;
    current = undefined;
    held = undefined;
    await old?.responder
      .shutdown()
      .catch((error: Error) =>
        console.log(`[hub] mDNS: leaving ${old.key}: ${error.message}`)
      );
    if (interfaces.length > 0) {
      // ciao's allowlist: its sockets, and so its answers, on these alone.
      const run: Run = {
        key,
        interfaces,
        responder: getResponder({ interface: interfaces }),
      };
      current = run;
      claim(run, 1, port, addresses);
    }
  }
  return interfaces.length > 0
    ? ""
    : `[hub] mDNS waits for an interface other devices share to hold ${BIND_HOST === "0.0.0.0" || BIND_HOST === "::" ? "an address" : BIND_HOST}`;
};

/**
 * Reads the interfaces every {@link FOLLOW_MS}, so the name follows them:
 * the Wi-Fi up after the hub, a cable in, the default route moved. What the
 * hub waits for is said once, when it changes. A platform that refuses the
 * multicast socket (a locked-down container) leaves the hub usable over an
 * explicit URL.
 */
const follow = async (
  port: number,
  addresses: Partial<ServiceOptions>,
  said: string
): Promise<void> => {
  let saying = "";
  try {
    saying = await move(port, addresses);
  } catch (error) {
    saying = `[hub] mDNS waits: ${(error as Error).message}`;
  }
  if (saying && saying !== said) {
    console.log(saying);
  }
  setTimeout(() => follow(port, addresses, saying), FOLLOW_MS).unref();
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
  follow(port, addresses, "").catch((error: Error) =>
    console.log(`[hub] mDNS unavailable: ${error.message}`)
  );
};
