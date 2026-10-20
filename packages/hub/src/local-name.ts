/**
 * The hub's `.local` name typed in a browser (core local-name.ts): port 80
 * on the addresses the name answers with, redirecting every request to the
 * dashboard's port at the host the request named, so one dashboard origin
 * stands (`cawco.local:3000`) and its pairing and cookies with it. 307, not
 * 308: the dashboard's port is the person's to change (`PORT` at install).
 *
 * A browser given a bare name asks port 80; Chromium first upgrades it to
 * https on 443, and a refused 443 falls back to http (its HTTPS-Upgrades
 * fallback exempts only resolution, network-changed, disconnected and
 * unreachable errors), so nothing listens on 443 and no certificate is made
 * for a `.local` name.
 *
 * Where it listens follows the name: on the interfaces mdns.ts answers it on
 * (lan-interfaces.ts), read again on each of its reads, so a listener comes
 * and goes with its network.
 * - Linux: each of those interfaces' addresses, the families the name
 *   answers with, never a public one; a tunnel's (the tailnet's, whose
 *   name has HTTPS of its own, tailnet-https.ts) is never among them. Below
 *   `ip_unprivileged_port_start` the kernel refuses the port (EACCES): no
 *   listener starts, the hub says so in one line, and Needs you shows the
 *   one command that lowers the setting (core stream-relay.ts
 *   `lowPortsCommand`, the stream relay's own, one file for both). Each
 *   read tries again, so the step ticks by itself once it is run.
 * - macOS: the wildcard address, the one a process other than root may bind
 *   under 1024 there ("iOS never had this restriction and we've now lifted
 *   it on macOS", Apple DTS, developer.apple.com/forums/thread/674179;
 *   binding a specific address still needs root). A request from outside
 *   the shared networks is answered 404, so no tunnel or public address
 *   gets the redirect.
 *
 * The same listener answers the stream relay's ACME challenges from
 * {@link ACME_WEBROOT} to anyone (Let's Encrypt asks from the internet,
 * through the router's forward of port 80 to this machine): the relay's
 * certbot on this machine writes them there (`--webroot`) instead of binding
 * the port, so one process holds port 80 here, at issue and at renewal alike.
 */
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { BlockList, isIP } from "node:net";
import { hostname, networkInterfaces } from "node:os";
import { join } from "node:path";
import {
  ACME_CHALLENGE,
  LOCAL_WEB_PORT,
  type LocalName,
  lowPortsCommand,
} from "@cawco/core";
import { cawcoDataDir } from "@cawco/core/paths";
import { causeOf } from "@cawco/core/preview-proxy";
import { isPublicAddress } from "@cawco/core/public-address";
import { BIND_HOST } from "./config";
import { localHubName } from "./mdns";

/** Where the relay's certbot writes its challenges on this machine, and this listener reads them. */
export const ACME_WEBROOT = join(cawcoDataDir(), "acme");
const CHALLENGES = join(ACME_WEBROOT, ".well-known", "acme-challenge");
/** An ACME token: base64url (RFC 8555 §8.3: "base64url alphabet"). */
const TOKEN = /^[\w-]+$/;
const UNPRIVILEGED = "/proc/sys/net/ipv4/ip_unprivileged_port_start";
const MAPPED_V4 = /^::ffff:/;
const WILDCARDS = new Set(["0.0.0.0", "::"]);

interface Listening {
  stop: (closeActiveConnections?: boolean) => Promise<void>;
}

/** One address the port was refused on, and why. */
interface Refusal {
  address: string;
  code: string;
  said: string;
}

/** `address` as the kernel reports a peer, without an IPv4-mapped prefix. */
const plain = (address: string): string => address.replace(MAPPED_V4, "");

const isLoopback = (address: string): boolean =>
  address.startsWith("127.") || address === "::1";

/**
 * The addresses to listen on for the name answered on `interfaces`: the
 * wildcard the hub listens on (macOS), else each interface address of the
 * families the name answers with (mdns.ts `listened`), never a public or
 * link-local one; a hub on one address, that address alone.
 */
const addressesFor = (interfaces: string[]): string[] => {
  if (interfaces.length === 0) {
    return [];
  }
  if (process.platform === "darwin") {
    return [BIND_HOST];
  }
  const v6 = BIND_HOST === "::";
  const held = interfaces
    .flatMap((name) => networkInterfaces()[name] ?? [])
    .filter(
      (entry) =>
        !entry.internal &&
        (entry.family === "IPv4" || (v6 && !entry.address.startsWith("fe80")))
    )
    .map((entry) => entry.address)
    .filter((address) => !isPublicAddress(address));
  return WILDCARDS.has(BIND_HOST)
    ? held
    : held.filter((address) => address === BIND_HOST);
};

/** The networks of `interfaces`: a peer inside one is a device the name was answered to. */
const networksOf = (interfaces: string[]): BlockList => {
  const list = new BlockList();
  for (const entry of interfaces.flatMap(
    (name) => networkInterfaces()[name] ?? []
  )) {
    const [address, prefix] = (entry.cidr ?? "").split("/");
    if (address && prefix && isIP(address)) {
      list.addSubnet(
        address.split("%")[0] ?? address,
        Number(prefix),
        entry.family === "IPv4" ? "ipv4" : "ipv6"
      );
    }
  }
  return list;
};

/** `ip_unprivileged_port_start` as the kernel has it now, or null where there is none. */
const unprivilegedStart = async (): Promise<number | null> => {
  const read = await readFile(UNPRIVILEGED, "utf8").catch(() => null);
  return read === null ? null : Number(read.trim());
};

export interface LocalNameDeps {
  /** The dashboard's port: where port 80 sends every request. */
  dashboardPort: number;
}

export const createLocalName = ({ dashboardPort }: LocalNameDeps) => {
  mkdirSync(ACME_WEBROOT, { recursive: true });
  const host = hostname();
  const servers = new Map<string, Listening>();
  let networks = new BlockList();
  // In the order `settle` writes it: a change is told by its JSON.
  let state: LocalName = { host, dashboardPort, state: "off" };
  /** The line said for the state now: said again only when it changes. */
  let said = "";
  const listeners: ((state: LocalName) => void)[] = [];

  /** Whether `remote` is this machine or a device on one of the name's networks. */
  const onNetwork = (remote: string): boolean => {
    const address = plain(remote);
    const family = isIP(address);
    return (
      isLoopback(address) ||
      (family !== 0 && networks.check(address, family === 4 ? "ipv4" : "ipv6"))
    );
  };

  /** An ACME challenge the relay's certbot wrote here, or a 404. */
  const challenge = async (token: string): Promise<Response> => {
    const file = Bun.file(join(CHALLENGES, token));
    if (!(TOKEN.test(token) && (await file.exists()))) {
      return new Response(null, { status: 404 });
    }
    return new Response(file, { headers: { "content-type": "text/plain" } });
  };

  const open = (address: string): Listening =>
    Bun.serve({
      hostname: address,
      port: LOCAL_WEB_PORT,
      fetch(request, server) {
        const url = new URL(request.url);
        if (url.pathname.startsWith(ACME_CHALLENGE)) {
          return challenge(url.pathname.slice(ACME_CHALLENGE.length));
        }
        if (!onNetwork(server.requestIP(request)?.address ?? "")) {
          return new Response(null, { status: 404 });
        }
        return new Response(null, {
          status: 307,
          headers: {
            location: `http://${url.hostname}:${dashboardPort}${url.pathname}${url.search}`,
          },
        });
      },
    });

  /** The state the listeners and their refusals stand for now, and the line that says it. */
  const settle = async (
    refused: Refusal[]
  ): Promise<{ next: LocalName; line: string }> => {
    const name = localHubName();
    const base = { host, dashboardPort, ...(name ? { name } : {}) };
    const held = [...servers.keys()];
    const notOn = (some: Refusal[]) =>
      `[hub] port ${LOCAL_WEB_PORT} not opened on ${some.map((one) => one.address).join(", ")}`;
    const lines: string[] = [];
    if (held.length > 0) {
      lines.push(
        `[hub] port ${LOCAL_WEB_PORT} on ${held.join(", ")} sends a typed .local name to the dashboard on :${dashboardPort}`
      );
    }
    const floor = refused.filter((one) => one.code === "EACCES");
    const start =
      floor.length > 0 && process.platform === "linux"
        ? await unprivilegedStart()
        : null;
    const command = lowPortsCommand(LOCAL_WEB_PORT);
    if (floor.length > 0) {
      lines.push(
        start === null
          ? `${notOn(floor)}: this OS lets only root bind it on one address, so a typed .local name doesn't reach the dashboard on :${dashboardPort}.`
          : `${notOn(floor)}: it is below this machine's ip_unprivileged_port_start (${start}), so a typed .local name doesn't reach the dashboard on :${dashboardPort}. Run ${command} once to let it.`
      );
    }
    const other = refused.filter((one) => one.code !== "EACCES");
    if (other.length > 0) {
      lines.push(
        `${notOn(other)}: ${[...new Set(other.map((one) => one.said))].join("; ")}`
      );
    }
    let next: LocalName = { ...base, state: "off" };
    if (held.length > 0) {
      next = { ...base, state: "serving" };
    } else if (start !== null) {
      next = { ...base, state: "needs", command };
    }
    return { next, line: lines.join("\n") };
  };

  return {
    /**
     * Port 80 on `interfaces`, the ones the name is answered on now (mdns.ts
     * calls this on each of its reads): a listener opened on each address
     * not yet held, tried again on each read, and closed on each address
     * gone. Its state is told when it changes, its line said with it.
     */
    async hold(interfaces: string[]): Promise<void> {
      networks = networksOf(interfaces);
      const wanted = addressesFor(interfaces);
      for (const [address, server] of servers) {
        if (!wanted.includes(address)) {
          servers.delete(address);
          server
            .stop(true)
            .catch((error: unknown) =>
              console.log(
                `[hub] port ${LOCAL_WEB_PORT} on ${address} didn't close: ${causeOf(error)}`
              )
            );
        }
      }
      const refused: Refusal[] = [];
      for (const address of wanted.filter((one) => !servers.has(one))) {
        try {
          servers.set(address, open(address));
        } catch (thrown) {
          refused.push({
            address,
            code: String((thrown as { code?: unknown }).code ?? ""),
            said: causeOf(thrown),
          });
        }
      }
      const { next, line } = await settle(refused);
      if (line && line !== said) {
        console.log(line);
      }
      said = line;
      if (JSON.stringify(next) === JSON.stringify(state)) {
        return;
      }
      state = next;
      for (const listener of listeners) {
        listener(state);
      }
    },

    /** Where it stands now, as `GET /api/local-name` answers. */
    state: (): LocalName => state,

    /** Hears every change of state. */
    onChange(listener: (state: LocalName) => void): void {
      listeners.push(listener);
    },

    /** The folder the relay's certbot on this machine writes its challenges into, while port 80 is held here. */
    webroot: (): string | null =>
      state.state === "serving" ? ACME_WEBROOT : null,
  };
};

export type LocalNameService = ReturnType<typeof createLocalName>;
