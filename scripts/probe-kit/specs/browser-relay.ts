/**
 * The fleet's stream relay on this machine (Projects spec §5.11, build item
 * 5): the agent's own `relay.start` (agent browser/relay.ts) run here, as the
 * daemon runs it for the hub, with a secret this spec makes (or `--secret`),
 * and then checked from outside it the way a viewer reaches it. One topology
 * on every runtime: coturn on the runtime's media network at .2, its one
 * listener (UDP and TCP 443) published on every address, its relay range
 * never published; every relayed stream relay to relay inside it.
 *
 * 1. coturn's arguments carry `--relay-ip=<.2>` and `--external-ip=P/<.2>`,
 *    no `--server-relay` and no `--allowed-peer-ip`; it stands on the media
 *    network at .2 (an address fixed at create: run fact 3), only 443 is
 *    published, and its log says `Whitelisting external-ip private part:
 *    <.2>`;
 * 2. a permission with a minted credential is refused 403 to this machine's
 *    LAN addresses, the media network's gateway, its tailnet addresses,
 *    another fleet machine's LAN and tailnet address (`--peer`, else stand-ins
 *    in the same ranges) at a browser's media port and at a non-media port,
 *    loopback, link-local, a container bridge and 10.0.0.5; and granted to
 *    P at any port. Any refusal that is not a 403 prints coturn's "denied"
 *    and 403 lines, so the range it fell into is named;
 * 3. the relay-to-relay path proven, not assumed: `turnutils_uclient -y`
 *    (two clients sending to each other's relayed address, its help text
 *    read first) from coturn's image on the media network against .2, and
 *    the same exchange from this machine's own process through the published
 *    listener at P (a viewer's way in), with a minted credential: every
 *    packet back, none lost, none dropped, no "denied" in coturn's log;
 * 4. no port of the relay range is bound on this machine, and a STUN binding
 *    to P:<first of the range> is unanswered;
 * 5. a STUN binding answered on UDP and TCP 443 (and TLS with a name) through
 *    the hub's own health check; 401 for a lapsed username; 442 for a TCP
 *    relay allocation (`no-tcp-relay`); with `--hostname` the certificate
 *    issued and TLS on 443 with the Let's Encrypt chain;
 * - Stop relay keeps the certificate volume; Remove relay takes the container
 *   and then the volume, so nothing of the relay stays.
 *
 * It runs only where the machine has no relay yet (no `cawco-relay`
 * container, no `cawco-relay-certs` volume): its Remove would delete them.
 *
 * On a rootless runtime whose `ip_unprivileged_port_start` is above the
 * lowest port the relay needs (obelisk: rootless Podman, 1024), the start
 * fails with the sysctl sentence and no container is made; the rest is then
 * run against coturn started by this spec on the relay's own arguments and
 * seat, at .3 of the media network (so a relay's .2 is never taken), its
 * listener (443 inside) published on a stand-in port free at run time, and
 * says so on each line. There TLS on the plain listener is checked with a
 * self-signed certificate this spec makes with openssl for
 * `relay.cawco-probe.test`, bind-mounted where coturn's arguments read a
 * Let's Encrypt one, and `--no-tls` is checked to start no TLS listener (no
 * "cannot start TLS" warning).
 *
 * With `--hold <s>` the relay stays live that long after the checks, before
 * Stop and Remove, so `browser-stream --relay-address <P> --relay-secret <S>`
 * on another fleet machine runs its other-machine leg against it; `--secret`
 * names the secret both runs share.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket), on the machine named, with the address a viewer reaches
 * it at (its public address; a LAN address stands in for it):
 *
 *   bun scripts/probe-kit/run.ts browser-relay --machine <name> --address <a> [--hostname <dns name>] [--peer <a>]… [--secret <s>] [--hold <s>]
 */
import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { type AddressInfo, createServer } from "node:net";
import { hostname as machineHostname, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { connect, getPublicIP } from "turn-server";
import type { RelaySeat } from "../../../packages/agent/src/browser/relay";
import type { Runtime } from "../../../packages/agent/src/browser/runtime";
import { browserPorts } from "../../../packages/core/src/browser";
import type {
  RelayFailure,
  RelayStartArgs,
} from "../../../packages/core/src/stream-relay";
import {
  isStreamRelayPort,
  RELAY_FAILURES,
  STREAM_RELAY_PORT,
  STREAM_RELAY_PORTS,
} from "../../../packages/core/src/stream-relay";
import type { Kit, Spec } from "../kit";

type Relay = typeof import("../../../packages/agent/src/browser/relay");
type Docker = Runtime["docker"];
type Container = ReturnType<Docker["getContainer"]>;

/** This spec's own coturn, where 443 is refused. */
const PROBE_CONTAINER = "cawco-relay-probe";
/** turnutils_uclient's container. */
const UCLIENT_CONTAINER = "cawco-relay-uclient";
/** The host this spec's own coturn takes on the media network: never the relay's .2. */
const PROBE_HOST = 3;
const TURN_MS = 8000;
/** How long this spec's own coturn has to answer on its listener. */
const BIND_MS = 30_000;
/** How long turnutils_uclient may run. */
const UCLIENT_MS = 60_000;
/** A private peer `denied-peer-ip` must refuse. */
const PRIVATE_PEER = "10.0.0.5";
/** The name the stand-in's self-signed certificate is for. */
const PROBE_NAME = "relay.cawco-probe.test";
/** The fix the relay's refusal names: the value set live and kept over a reboot, in one line. */
const SYSCTL =
  /^sudo sh -c 'sysctl -w net\.ipv4\.ip_unprivileged_port_start=(443|80) && echo net\.ipv4\.ip_unprivileged_port_start=\1 > \/etc\/sysctl\.d\/90-cawco-relay\.conf'$/;
/** coturn's words when it starts no TLS listener for want of a certificate. */
const NO_TLS_WARNING = /cannot start TLS/i;
/** coturn's line at start for the private side of `--external-ip` (mainrelay.c). */
const WHITELISTING = "Whitelisting external-ip private part:";
/** coturn's lines about a refused peer: its range, its 403. */
const DENIED = /denied|403|Forbidden/i;
/** turnutils_uclient's `-y` line in its usage. */
const C2C_HELP = /-y\s+Use client-to-client connections/;
/** turnutils_uclient's totals: `start_mclient: tot_send_msgs=10, tot_recv_msgs=10`. */
const TOTALS = /start_mclient: tot_send_msgs=(\d+), tot_recv_msgs=(\d+)/;
const LOST = /Total lost packets (\d+) .*total send dropped (\d+)/;
/** A browser's media port, as another fleet machine's would be. */
const MEDIA_PORT = browserPorts(0).media;
/** A port no browser takes. */
const OTHER_PORT = 22;
/** netstat's columns. */
const FIELDS = /\s+/;
const TAILNET_PREFIX = /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const PRIVATE_V4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

/** Every value of a flag given more than once. */
const flags = (name: string): string[] =>
  process.argv.flatMap((arg, at) =>
    arg === `--${name}` && process.argv[at + 1] ? [process.argv[at + 1]] : []
  ) as string[];

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const bracketed = (address: string): string =>
  address.includes(":") ? `[${address}]` : address;

/** TLS to a listener: the name its certificate is checked for, and the CA it is checked against (the system's when absent). */
interface TlsTo {
  ca?: string;
  servername: string;
}

/** TCP's protocol number, REQUESTED-TRANSPORT's value for a TCP relay (RFC 6062). */
const TCP_TRANSPORT = 6;

/**
 * One TURN exchange: allocate with `user` (a UDP relay, or a TCP one when
 * `relay` asks), then (when asked) a permission to `peer`; what each answered.
 */
export const turn = (
  url: string,
  user: { username: string; credential: string },
  peer?: { ip: string; port: number },
  tls?: TlsTo,
  relay?: "tcp"
): Promise<{
  allocated: boolean;
  allocateCode?: number;
  relayed?: string;
  permissionCode?: number | "granted";
  error?: string;
}> =>
  new Promise((resolve) => {
    let done = false;
    const result: Awaited<ReturnType<typeof turn>> = { allocated: false };
    const finish = (open?: { close: () => void }) => {
      if (done) {
        return;
      }
      done = true;
      try {
        open?.close();
      } catch {
        // already closed
      }
      resolve(result);
    };
    const socket = connect(
      url,
      {
        username: user.username,
        password: user.credential,
        autoRefresh: false,
        ...(tls ?? {}),
      },
      (error, connected) => {
        if (error) {
          result.error = said(error);
          finish();
          return;
        }
        connected.on("allocate:success", (msg) => {
          result.allocated = true;
          const relayed = msg.getAttribute(0x00_16) as
            { ip: string; port: number } | undefined;
          result.relayed = relayed
            ? `${relayed.ip}:${relayed.port}`
            : undefined;
          if (!peer) {
            finish(connected);
            return;
          }
          connected.createPermission(peer);
        });
        connected.on("allocate:error", (_msg, err) => {
          result.allocateCode = (err as { code?: number } | undefined)?.code;
          finish(connected);
        });
        connected.on("create_permission:success", () => {
          result.permissionCode = "granted";
          finish(connected);
        });
        connected.on("create_permission:error", (_msg, err) => {
          result.permissionCode = (err as { code?: number } | undefined)?.code;
          finish(connected);
        });
        connected.on("error", (err) => {
          result.error = said(err);
          finish(connected);
        });
        connected.allocate(
          relay === "tcp" ? { transport: TCP_TRANSPORT } : undefined
        );
      }
    );
    setTimeout(() => {
      result.error ??= `no answer within ${TURN_MS / 1000} s`;
      finish(socket);
    }, TURN_MS);
  });

/** A port the OS hands out on `proto` for port 0, released again; `want` asks for that one instead. */
const bindPort = (
  proto: "tcp" | "udp",
  want = 0
): Promise<number | undefined> =>
  new Promise((resolve) => {
    if (proto === "tcp") {
      const server = createServer();
      server.once("error", () => resolve(undefined));
      server.listen({ port: want, host: "0.0.0.0", exclusive: true }, () => {
        const { port } = server.address() as AddressInfo;
        server.close(() => resolve(port));
      });
      return;
    }
    const socket = createSocket("udp4");
    socket.once("error", () => {
      socket.close();
      resolve(undefined);
    });
    socket.bind({ port: want, address: "0.0.0.0", exclusive: true }, () => {
      const { port } = socket.address();
      socket.close(() => resolve(port));
    });
  });

/**
 * Where a coturn of a probe's is published instead of 443, where 443 is
 * refused or held: a port free on TCP and UDP at run time, outside the hub's
 * preview ports and the relay's own; `tries` more ports are asked for when
 * one is not.
 */
export const freeStandIn = async (tries = 20): Promise<number | undefined> => {
  if (tries === 0) {
    return;
  }
  const { PREVIEW_PORTS } = await import("../../../packages/hub/src/config");
  const port = await bindPort("tcp");
  if (
    port === undefined ||
    isStreamRelayPort(port) ||
    (port >= PREVIEW_PORTS.first && port <= PREVIEW_PORTS.last) ||
    (await bindPort("udp", port)) !== port
  ) {
    return freeStandIn(tries - 1);
  }
  return port;
};

/** One STUN binding over `url`: answered, or why not. Over TLS through `connect`, which takes a server name and a CA. */
export const binding = (url: string, tls?: TlsTo): Promise<string> =>
  new Promise((resolve) => {
    if (!tls) {
      getPublicIP(url, { timeout: 3000 }, (error, address) =>
        resolve(
          error
            ? `down (${error.message})`
            : `up (${address?.ip}:${address?.port})`
        )
      );
      return;
    }
    let done = false;
    const finish = (answer: string, open?: { close: () => void }) => {
      if (done) {
        return;
      }
      done = true;
      try {
        open?.close();
      } catch {
        // already closed
      }
      resolve(answer);
    };
    const socket = connect(url, { autoRefresh: false, ...tls }, (error, on) => {
      if (error) {
        finish(`down (${said(error)})`);
        return;
      }
      on.on("binding:success", (msg) => {
        const mapped = msg.getAttribute(0x00_20) as
          { ip: string; port: number } | undefined;
        finish(`up (${mapped?.ip}:${mapped?.port})`, on);
      });
      on.on("binding:error", (_msg, err) =>
        finish(
          `down (binding error ${(err as { code?: number } | undefined)?.code})`,
          on
        )
      );
      on.on("error", (err) => finish(`down (${said(err)})`, on));
      on.binding();
    });
    setTimeout(() => finish("down (no answer within 3 s)", socket), 3000);
  });

/** The issuer a TLS handshake to `host`:`port` shows, the certificate checked for `tls.servername` against `tls.ca` (the system's when absent). */
const issuerOn = (host: string, port: number, tls: TlsTo): Promise<string> =>
  new Promise((resolve) => {
    const socket = tlsConnect(
      {
        host,
        port,
        servername: tls.servername,
        ...(tls.ca ? { ca: tls.ca } : {}),
      },
      () => {
        const issuer = socket.getPeerCertificate().issuer as
          { O?: string; CN?: string } | undefined;
        socket.end();
        resolve(
          `${socket.authorized ? "verified" : `unverified (${socket.authorizationError})`} by ${issuer?.O ?? issuer?.CN ?? "nobody"}`
        );
      }
    );
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve("no handshake within 5 s");
    });
    socket.on("error", (error) => resolve(`refused (${error.message})`));
  });

/* ------------------------------------------------------------------ */
/* The checks against a listener                                        */
/* ------------------------------------------------------------------ */

/** A coturn to check: where a viewer reaches it, its seat, its container. */
interface Listener {
  /** coturn's container, whose log every check reads. */
  container: Container;
  /** P: the address plain URLs name. */
  host: string;
  /** coturn's address on the media network. */
  media: string;
  /** The media network's name and gateway. */
  network: { name: string; gateway: string };
  /** The listener's port on the machine: 443, or a stand-in. */
  port: number;
  tls?: TlsTo & { host: string };
  /** Said after every line: why the port is not 443, where it is not. */
  where: string;
}

/** coturn's lines since `since` (s epoch). */
const coturnLines = async (
  container: Container,
  since: number
): Promise<string[]> => {
  const { logsOf } = await import("../../../packages/agent/src/browser/relay");
  return (await logsOf(container, { since }).catch(() => ""))
    .split("\n")
    .filter(Boolean);
};

/** A credential minted for this spec, good for 10 minutes (or `at` in the past). */
const minted = async (args: RelayStartArgs, at?: number) => {
  const { mintCredential } =
    await import("../../../packages/hub/src/stream-relay");
  return mintCredential(
    { secret: args.secret, address: args.address, hostname: null },
    "probe:browser-relay",
    10 * 60_000,
    at
  );
};

/** Assertion 1: coturn's arguments, its seat on the media network, what is published, and its log at start. */
const seatChecks = async (
  kit: Kit,
  docker: Docker,
  on: Listener,
  address: string
): Promise<void> => {
  const inspected = await on.container.inspect();
  const cmd = inspected.Config.Cmd ?? [];
  const at =
    inspected.NetworkSettings.Networks?.[on.network.name]?.IPAddress ?? "";
  const bindings = inspected.HostConfig.PortBindings ?? {};
  const published = Object.keys(bindings).sort();
  const log = await coturnLines(on.container, 0);
  const whitelisted = log.find((line) => line.includes(WHITELISTING));
  const shape = cmd.filter(
    (arg) =>
      arg.startsWith("--relay-ip") ||
      arg.startsWith("--listening-ip") ||
      arg.startsWith("--external-ip")
  );
  kit.check(
    `1 · coturn at ${at || "no address"} on ${on.network.name} (asked ${on.media}: the address fixed at create), ${shape.join(" ")}, no --server-relay, no --allowed-peer-ip; published ${published.join(", ")} on 0.0.0.0, no relay range; its log: "${whitelisted?.trim() ?? "no whitelisting line"}"${on.where}`,
    at === on.media &&
      cmd.includes(`--relay-ip=${on.media}`) &&
      cmd.includes(`--listening-ip=${on.media}`) &&
      cmd.includes(`--external-ip=${address}/${on.media}`) &&
      !cmd.includes("--server-relay") &&
      !cmd.some((arg) => arg.startsWith("--allowed-peer-ip")) &&
      published.join() ===
        `${STREAM_RELAY_PORT}/tcp,${STREAM_RELAY_PORT}/udp` &&
      Object.values(
        bindings as Record<string, { HostIp?: string; HostPort?: string }[]>
      ).every(
        (one) =>
          one?.[0]?.HostIp === "0.0.0.0" && one[0].HostPort === String(on.port)
      ) &&
      !!whitelisted?.includes(on.media),
    JSON.stringify({ cmd, at, bindings })
  );
  // The network's own word on the address: the fixed one, as made.
  const network = await docker.getNetwork(on.network.name).inspect();
  const container = Object.values(
    (network as { Containers?: Record<string, { IPv4Address?: string }> })
      .Containers ?? {}
  ).find((one) => one.IPv4Address?.startsWith(`${on.media}/`));
  kit.check(
    `run fact 3 · the runtime's network ${on.network.name} lists coturn at ${container?.IPv4Address ?? "nothing"}${on.where}`,
    !!container,
    JSON.stringify(network)
  );
};

/** The peers assertion 2 refuses, each named: this machine's LAN and tailnet addresses, the gateway, another fleet machine's at a media and a non-media port, and the ranges no peer may be in. */
const refusedPeers = async (
  on: Listener,
  address: string
): Promise<{ what: string; ip: string; port: number }[]> => {
  const { machineAddresses } =
    await import("../../../packages/agent/src/browser/media-forwarding");
  const own = (await machineAddresses()).filter(
    (one) => !one.includes(":") && one !== address
  );
  const lan = own.filter((one) => PRIVATE_V4.test(one));
  const tailnet = own.filter((one) => TAILNET_PREFIX.test(one));
  const given = flags("peer");
  // Another fleet machine's: named with --peer, else one in this LAN's /24
  // and one in the tailnet's range (a permission is checked by address alone).
  const lanBase = (lan[0] ?? "192.168.1.1").split(".").slice(0, 3).join(".");
  const others = given.length
    ? given
    : [`${lanBase}.${lan[0]?.endsWith(".250") ? 251 : 250}`, "100.100.1.2"];
  return [
    ...lan.map((ip) => ({ what: "this machine's LAN", ip, port: MEDIA_PORT })),
    ...(tailnet.length ? tailnet : ["100.100.1.1"]).map((ip) => ({
      what: tailnet.length
        ? "this machine's tailnet"
        : "a tailnet stand-in (this machine has none)",
      ip,
      port: MEDIA_PORT,
    })),
    {
      what: "the media network's gateway (the host)",
      ip: on.network.gateway,
      port: MEDIA_PORT,
    },
    ...others.flatMap((ip) => [
      {
        what: `another fleet machine${given.length ? "" : " (stand-in)"}, a browser's media port`,
        ip,
        port: MEDIA_PORT,
      },
      {
        what: `another fleet machine${given.length ? "" : " (stand-in)"}, a non-media port`,
        ip,
        port: OTHER_PORT,
      },
    ]),
    { what: "loopback", ip: "127.0.0.1", port: MEDIA_PORT },
    { what: "link-local", ip: "169.254.1.1", port: MEDIA_PORT },
    { what: "a container bridge", ip: "172.17.0.1", port: MEDIA_PORT },
    { what: "a private peer", ip: PRIVATE_PEER, port: 5000 },
  ];
};

/** Assertion 2: every refused peer 403, P at any port granted; coturn's own words for any that is not. */
const permissionChecks = async (
  kit: Kit,
  args: RelayStartArgs,
  on: Listener
): Promise<void> => {
  const fresh = await minted(args);
  const url = `turn:${on.host}:${on.port}?transport=udp`;
  const since = Math.floor(Date.now() / 1000) - 1;
  const asked = await Promise.all(
    (await refusedPeers(on, args.address)).map(async (peer) => ({
      ...peer,
      answer: await turn(url, fresh, { ip: peer.ip, port: peer.port }),
    }))
  );
  const relayPort = STREAM_RELAY_PORTS.relayRange[0] + 1;
  const toP = await turn(url, fresh, { ip: args.address, port: relayPort });
  const wrong = asked.filter((one) => one.answer.permissionCode !== 403);
  kit.check(
    `2 · permissions refused 403: ${asked.map((one) => `${one.what} ${one.ip}:${one.port} → ${one.answer.permissionCode ?? one.answer.error ?? one.answer.allocateCode}`).join("; ")}${on.where}`,
    wrong.length === 0,
    JSON.stringify(wrong)
  );
  kit.check(
    `2 · a permission to P ${args.address}:${relayPort} (another allocation's relayed address) granted: ${toP.permissionCode ?? toP.error ?? toP.allocateCode}${on.where}`,
    toP.permissionCode === "granted",
    JSON.stringify(toP)
  );
  const lines = await coturnLines(on.container, since);
  const denied = lines.filter((line) => DENIED.test(line));
  if (wrong.length > 0 || toP.permissionCode !== "granted") {
    for (const line of denied.slice(-40)) {
      kit.note(`coturn: ${line.trim()}`);
    }
  }
  kit.check(
    `2 · coturn's log names no denial for P ${args.address} or its own ${on.media}${on.where}`,
    !denied.some(
      (line) =>
        line.includes(`peer IP ${on.media} `) ||
        line.includes(`peer IP ${args.address} `)
    ),
    denied.slice(-20).join("\n")
  );
};

/** Its usage, then turnutils_uclient's relay-to-relay run against `server`:`port` from `network` (the runtime's default when absent): its totals and what coturn said since. */
const uclient = async (
  docker: Docker,
  image: string,
  cmd: string[],
  network?: string
): Promise<{ code: number; out: string }> => {
  await docker
    .getContainer(UCLIENT_CONTAINER)
    .remove({ force: true })
    .catch(() => undefined);
  const container = await docker.createContainer({
    name: UCLIENT_CONTAINER,
    Image: image,
    Entrypoint: ["turnutils_uclient"],
    Cmd: cmd,
    HostConfig: network ? { NetworkMode: network } : {},
  });
  try {
    await container.start();
    const { readWithin } = await import("../../../packages/core/src/bounded");
    const ended = await readWithin(
      UCLIENT_MS,
      () => container.wait() as Promise<{ StatusCode: number }>
    );
    const { logsOf } =
      await import("../../../packages/agent/src/browser/relay");
    const out = await logsOf(container, { tail: 400 });
    return {
      code: ended.kind === "answered" ? ended.value.StatusCode : -1,
      out: ended.kind === "answered" ? out : `${out}\n(no end within 60 s)`,
    };
  } finally {
    await container.remove({ force: true }).catch(() => undefined);
  }
};

/** How many datagrams each side of {@link clientToClient} sends the other. */
const C2C_COUNT = 10;
const C2C_MS = 10_000;
const C2C_GAP_MS = 20;

/** One side of {@link clientToClient}: its relayed address, the permission for the other's, and how many of the other's datagrams it heard. */
interface C2cSide {
  error?: string;
  heard: number;
  permission?: number | "granted";
  relayed?: { ip: string; port: number };
}

/**
 * What turnutils_uclient's `-y` does, from this machine's own process: two
 * allocations through `url` (a viewer's own way in, the published listener
 * at P), each given a permission for the other's relayed address and sending
 * it {@link C2C_COUNT} datagrams. Both relayed addresses are P, so every
 * datagram goes relay to relay inside coturn.
 */
const clientToClient = (
  url: string,
  user: { username: string; credential: string }
): Promise<{ a: C2cSide; b: C2cSide }> =>
  new Promise((resolve) => {
    const sides = {
      a: { heard: 0 } as C2cSide,
      b: { heard: 0 } as C2cSide,
    };
    const clients: Partial<Record<"a" | "b", ReturnType<typeof connect>>> = {};
    const timers: ReturnType<typeof setTimeout>[] = [];
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
      for (const client of Object.values(clients)) {
        try {
          client?.close();
        } catch {
          // already closed
        }
      }
      resolve(sides);
    };
    const other = (name: "a" | "b") => (name === "a" ? "b" : "a");
    const settled = () => {
      if (sides.a.heard >= C2C_COUNT && sides.b.heard >= C2C_COUNT) {
        finish();
      }
    };
    /** Both allocated: each asks a permission for the other's relayed address. */
    const permit = () => {
      for (const name of ["a", "b"] as const) {
        const peer = sides[other(name)].relayed;
        if (peer) {
          clients[name]?.createPermission({ ip: peer.ip, port: 0 });
        }
      }
    };
    /** `name`'s permission answered: granted, it sends its datagrams. */
    const permitted = (name: "a" | "b", code: number | "granted") => {
      sides[name].permission = code;
      const peer = sides[other(name)].relayed;
      if (code !== "granted" || !peer) {
        finish();
        return;
      }
      for (let at = 0; at < C2C_COUNT; at += 1) {
        timers.push(
          setTimeout(
            () => clients[name]?.send(peer, Buffer.from(`c2c-${name}`)),
            at * C2C_GAP_MS
          )
        );
      }
    };
    for (const name of ["a", "b"] as const) {
      clients[name] = connect(
        url,
        {
          username: user.username,
          password: user.credential,
          autoRefresh: false,
        },
        (error, connected) => {
          if (error) {
            sides[name].error = said(error);
            finish();
            return;
          }
          connected.on("allocate:success", (msg) => {
            sides[name].relayed = msg.getAttribute(0x00_16) as
              { ip: string; port: number } | undefined;
            if (sides.a.relayed && sides.b.relayed) {
              permit();
            }
          });
          connected.on("allocate:error", (_msg, err) => {
            sides[name].error =
              `allocation refused ${(err as { code?: number } | undefined)?.code}`;
            finish();
          });
          connected.on("create_permission:success", () =>
            permitted(name, "granted")
          );
          connected.on("create_permission:error", (_msg, err) =>
            permitted(name, (err as { code?: number } | undefined)?.code ?? 0)
          );
          connected.on("data", (_peer, data) => {
            if (Buffer.from(data).toString() === `c2c-${other(name)}`) {
              sides[name].heard += 1;
              settled();
            }
          });
          connected.on("error", (err) => {
            sides[name].error = said(err);
            finish();
          });
          connected.allocate();
        }
      );
    }
    timers.push(setTimeout(finish, C2C_MS));
  });

/**
 * Assertion 3: relay to relay inside coturn. turnutils_uclient `-y` on the
 * media network against coturn's own address; then the same from this
 * machine's own process through the published listener at P, the way every
 * viewer and every other machine's browser comes in. That second run is the
 * spec's own client, not uclient in a container: a rootless Podman's
 * container reaches its own host's address only through pasta's mapped one
 * ("By default, IPv4 and IPv6 addresses and routes ... are copied from the
 * host", podman-run(1)), which no other fleet machine ever uses.
 */
const relayToRelay = async (
  kit: Kit,
  relay: Relay,
  docker: Docker,
  args: RelayStartArgs,
  on: Listener
): Promise<void> => {
  const help = await uclient(docker, relay.RELAY_IMAGE, []);
  const c2c = help.out.split("\n").find((line) => C2C_HELP.test(line));
  if (
    !kit.check(
      `3 · turnutils_uclient's usage says "${c2c?.trim() ?? "no -y line"}"`,
      !!c2c,
      help.out.slice(-2000)
    )
  ) {
    return;
  }
  const fresh = await minted(args);
  const since = await secondAfter();
  const run = await uclient(
    docker,
    relay.RELAY_IMAGE,
    [
      "-y",
      "-c",
      "-n",
      "10",
      "-u",
      fresh.username,
      "-w",
      fresh.credential,
      "-p",
      String(STREAM_RELAY_PORT),
      on.media,
    ],
    on.network.name
  );
  const lines = run.out.split("\n");
  const totals = lines
    .map((line) => TOTALS.exec(line))
    .filter((one) => one !== null)
    .at(-1);
  const lost = lines
    .map((line) => LOST.exec(line))
    .filter((one) => one !== null)
    .at(-1);
  const sent = Number(totals?.[1] ?? 0);
  const received = Number(totals?.[2] ?? Number.NaN);
  const uclientDenied = await deniedSince(kit, on, since);
  kit.check(
    `3 · turnutils_uclient -y on ${on.network.name} against coturn's ${on.media}: sent ${sent}, received ${received}, lost ${lost?.[1] ?? "?"}, dropped ${lost?.[2] ?? "?"}; ${uclientDenied} "denied" lines in coturn's log${on.where}`,
    sent > 0 &&
      received === sent &&
      lost?.[1] === "0" &&
      lost[2] === "0" &&
      uclientDenied === 0,
    lines.slice(-30).join("\n")
  );
  const hostSince = await secondAfter();
  const sides = await clientToClient(
    `turn:${on.host}:${on.port}?transport=udp`,
    fresh
  );
  const hostDenied = await deniedSince(kit, on, hostSince);
  const sideWords = (side: C2cSide) =>
    `relayed ${side.relayed ? `${side.relayed.ip}:${side.relayed.port}` : `nothing (${side.error ?? "no answer"})`}, permission ${side.permission ?? "not asked"}, heard ${side.heard} of ${C2C_COUNT}`;
  kit.check(
    `3 · two clients of this machine's own process through the published listener at P ${args.address}:${on.port}, each sending the other's relayed address ${C2C_COUNT} datagrams: a ${sideWords(sides.a)}; b ${sideWords(sides.b)}; ${hostDenied} "denied" lines in coturn's log${on.where}`,
    [sides.a, sides.b].every(
      (side) =>
        side.relayed?.ip === args.address &&
        side.permission === "granted" &&
        side.heard === C2C_COUNT
    ) && hostDenied === 0,
    JSON.stringify(sides)
  );
};

/**
 * A second (s epoch) no line of coturn's before now falls in: the logs'
 * `since` counts whole seconds, so this waits into the next one, and a
 * leg's read of coturn's log holds none of the 403s the permission checks
 * before it asked for.
 */
const secondAfter = async (): Promise<number> => {
  await Bun.sleep(1000 - (Date.now() % 1000) + 50);
  return Math.floor(Date.now() / 1000);
};

/** How many of coturn's lines since `since` name a denial, each printed. */
const deniedSince = async (
  kit: Kit,
  on: Listener,
  since: number
): Promise<number> => {
  const denied = (await coturnLines(on.container, since)).filter((line) =>
    DENIED.test(line)
  );
  for (const line of denied.slice(-20)) {
    kit.note(`coturn: ${line.trim()}`);
  }
  return denied.length;
};

/** What this machine binds on UDP for each port of the relay range: /proc where it has one, else netstat (a Mac). */
const rangeBound = async (relay: Relay): Promise<string[]> => {
  const [first, last] = STREAM_RELAY_PORTS.relayRange;
  if (platform() === "darwin") {
    const child = Bun.spawn(["netstat", "-an", "-p", "udp"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = await new Response(child.stdout).text();
    await child.exited;
    return out.split("\n").filter((line) => {
      const port = Number(line.trim().split(FIELDS)[3]?.split(".").at(-1));
      return port >= first && port <= last;
    });
  }
  const held = await relay.heldPorts(
    Array.from({ length: last - first + 1 }, (_, at) => ({
      proto: "udp" as const,
      port: first + at,
    }))
  );
  return held.map((one) => one.said);
};

/** Assertion 4: the relay range bound nowhere on this machine, and unanswered from outside. */
const rangeChecks = async (
  kit: Kit,
  relay: Relay,
  args: RelayStartArgs,
  on: Listener
): Promise<void> => {
  const bound = await rangeBound(relay);
  const [first, last] = STREAM_RELAY_PORTS.relayRange;
  const stun = await binding(`stun:${bracketed(args.address)}:${first}`);
  kit.check(
    `4 · no port of UDP ${first}–${last} bound on this machine (${bound.length ? bound.join("; ") : "none"}); a STUN binding to P ${args.address}:${first} ${stun}${on.where}`,
    bound.length === 0 && stun.startsWith("down"),
    JSON.stringify(bound)
  );
};

/** Assertion 5's UDP part: a binding and an allocation, and a lapsed username refused 401. */
const udpChecks = async (
  kit: Kit,
  args: RelayStartArgs,
  on: Listener
): Promise<void> => {
  const fresh = await minted(args);
  const lapsed = await minted(args, Date.now() - 2 * 60 * 60_000);
  const url = `turn:${on.host}:${on.port}?transport=udp`;
  const stun = await binding(`stun:${on.host}:${on.port}?transport=udp`);
  const udp = await turn(url, fresh);
  const expired = await turn(url, lapsed);
  kit.check(
    `5 · UDP on the listener: STUN binding on udp ${on.port} ${stun}; allocation with a minted credential relayed ${udp.relayed ?? `nothing (${udp.error ?? udp.allocateCode})`}, as P${on.where}`,
    stun.startsWith("up") &&
      udp.allocated &&
      udp.relayed?.split(":")[0] === args.address,
    JSON.stringify({ stun, udp })
  );
  kit.check(
    `5 · an expired username (${lapsed.username.split(":")[0]}, in the past) refused: ${expired.allocateCode}${on.where}`,
    expired.allocateCode === 401,
    JSON.stringify(expired)
  );
};

/** Assertion 5's TCP part: plain TCP on the listener, TLS on it with a certificate, and a TCP relay refused 442. */
const streamChecks = async (
  kit: Kit,
  args: RelayStartArgs,
  on: Listener
): Promise<void> => {
  const fresh = await minted(args);
  const plainStun = await binding(`stun:${on.host}:${on.port}?transport=tcp`);
  const plain = await turn(`turn:${on.host}:${on.port}?transport=tcp`, fresh);
  const plainUp = plainStun.startsWith("up") && plain.allocated;
  const tcpRelay = await turn(
    `turn:${on.host}:${on.port}?transport=tcp`,
    fresh,
    undefined,
    undefined,
    "tcp"
  );
  kit.check(
    `5 · a TCP relay allocation refused (no-tcp-relay): ${tcpRelay.allocateCode ?? (tcpRelay.allocated ? "allocated" : tcpRelay.error)}${on.where}`,
    tcpRelay.allocateCode === 442,
    JSON.stringify(tcpRelay)
  );
  if (!on.tls) {
    kit.check(
      `5 · plain TCP on the listener: STUN binding on tcp ${on.port} ${plainStun}; allocation relayed ${plain.relayed ?? `nothing (${plain.error ?? plain.allocateCode})`}${on.where}`,
      plainUp,
      JSON.stringify({ plainStun, plain })
    );
    return;
  }
  const { tls } = on;
  const handshake = await issuerOn(on.tls.host, on.port, tls);
  const tlsStun = await binding(
    `stuns:${tls.host}:${on.port}?transport=tcp`,
    tls
  );
  const secure = await turn(
    `turns:${tls.host}:${on.port}?transport=tcp`,
    fresh,
    undefined,
    tls
  );
  kit.check(
    `5 · TLS on the plain listener: handshake on tcp ${on.port} for ${tls.servername} ${handshake}; stuns binding ${tlsStun}; turns allocation relayed ${secure.relayed ?? `nothing (${secure.error ?? secure.allocateCode})`}; plain TCP on the same port: binding ${plainStun}, allocation relayed ${plain.relayed ?? `nothing (${plain.error ?? plain.allocateCode})`}${on.where}`,
    handshake.startsWith("verified") &&
      tlsStun.startsWith("up") &&
      secure.allocated &&
      plainUp,
    JSON.stringify({ handshake, tlsStun, secure, plainStun, plain })
  );
};

/** Every check against one listener, in the assertions' order. */
const listenerChecks = async (
  kit: Kit,
  relay: Relay,
  docker: Docker,
  args: RelayStartArgs,
  on: Listener
): Promise<void> => {
  await seatChecks(kit, docker, on, args.address);
  await permissionChecks(kit, args, on);
  await relayToRelay(kit, relay, docker, args, on);
  await rangeChecks(kit, relay, args, on);
  await udpChecks(kit, args, on);
  await streamChecks(kit, args, on);
};

/** The media network on `docker`, as the relay and every browser stand on it. */
const mediaOf = async (docker: Docker) => {
  const media =
    await import("../../../packages/agent/src/browser/media-network");
  const network = await media.ensureMediaNetwork(docker);
  return { media, network };
};

/* ------------------------------------------------------------------ */
/* The relay's own start, where 443 may be bound                        */
/* ------------------------------------------------------------------ */

/** The relay's own start, its ports through the hub's health check, every listener check, TLS with a name. */
const relayLegs = async (
  kit: Kit,
  relay: Relay,
  runtime: Runtime,
  args: RelayStartArgs
): Promise<void> => {
  // A name's certificate first, its own command (the journey's certificate
  // step), over HTTP on port 80; then the start, on the certificate.
  if (args.hostname) {
    const certified = await relay.certifyRelay({ hostname: args.hostname });
    kit.check(
      `relay.certify for ${args.hostname} over HTTP: a certificate ending ${new Date(certified.expiresAt).toISOString()}`,
      certified.expiresAt > Date.now(),
      JSON.stringify(certified)
    );
  }
  const frame = await relay.startRelay(args);
  const container = runtime.docker.getContainer(relay.RELAY_CONTAINER);
  const inspected = await container.inspect().catch(() => undefined);
  kit.check(
    `${relay.RELAY_IMAGE} pulled; container ${relay.RELAY_CONTAINER} ${frame.state}${frame.why ? ` (${frame.why})` : ""}; its frame's reach: LAN ${frame.reach?.lan.join(", ") || "none"}, tailnet ${frame.reach?.tailnet.join(", ") || "none"}`,
    frame.state === "live" &&
      inspected?.State.Running === true &&
      inspected.Config.Image === relay.RELAY_IMAGE &&
      !!frame.reach,
    JSON.stringify(frame)
  );
  if (!inspected) {
    return;
  }
  const { probeRelay } = await import("../../../packages/hub/src/stream-relay");
  const name = args.hostname ?? null;
  const health = await probeRelay(args.address, name);
  kit.check(
    `5 · STUN binding answered on ${health.map((port) => `${port.port} ${port.up ? "up" : `down (${port.error})`}`).join(", ")} (the hub's health check)`,
    health.length === (name ? 3 : 2) && health.every((port) => port.up),
    JSON.stringify(health)
  );
  const { media, network } = await mediaOf(runtime.docker);
  await listenerChecks(kit, relay, runtime.docker, args, {
    container,
    host: bracketed(args.address),
    media: media.relayMediaAddress(network),
    network: { name: network.name, gateway: media.gatewayAddress(network) },
    port: STREAM_RELAY_PORT,
    where: "",
    ...(name ? { tls: { host: name, servername: name } } : {}),
  });
  if (name) {
    const issuer = await issuerOn(name, STREAM_RELAY_PORT, {
      servername: name,
    });
    kit.check(
      `with --hostname ${name}: certificate issued, ${frame.ports.tls ? "tls stands" : "no tls"}; turns:${name}:443 ${issuer}`,
      frame.ports.tls && issuer.startsWith("verified by Let's Encrypt"),
      JSON.stringify(frame.ports)
    );
  }
  const hold = Number(flag("hold") ?? 0);
  if (hold > 0) {
    kit.note(
      `holding the relay live at ${args.address} for ${hold} s (its secret as --secret gave it): run browser-stream --relay-address ${args.address} --relay-secret <that secret> on another fleet machine now`
    );
    await Bun.sleep(hold * 1000);
  }
};

/* ------------------------------------------------------------------ */
/* coturn started by this spec on a stand-in port, where 443 is refused */
/* ------------------------------------------------------------------ */

/** A self-signed certificate for {@link PROBE_NAME}, laid out as the relay's volume lays out Let's Encrypt's: its folder, and the certificate's text. */
const selfSigned = async (): Promise<{ dir: string; cert: string }> => {
  const dir = await mkdtemp(join(tmpdir(), "cawco-relay-probe-"));
  const live = join(dir, "live", PROBE_NAME);
  await mkdir(live, { recursive: true });
  const cert = join(live, "fullchain.pem");
  const made = Bun.spawn(
    [
      "openssl",
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:prime256v1",
      "-nodes",
      "-days",
      "1",
      "-subj",
      `/CN=${PROBE_NAME}`,
      "-addext",
      `subjectAltName=DNS:${PROBE_NAME}`,
      "-keyout",
      join(live, "privkey.pem"),
      "-out",
      cert,
    ],
    { stdout: "ignore", stderr: "pipe" }
  );
  if ((await made.exited) !== 0) {
    throw new Error(
      `openssl did not make the test certificate: ${await new Response(made.stderr).text()}`
    );
  }
  // coturn runs as nobody: the folders and the key open to it, as the
  // relay's deploy hook opens Let's Encrypt's.
  for (const path of [dir, join(dir, "live"), live]) {
    // biome-ignore lint/performance/noAwaitInLoops: three folders, in order.
    await chmod(path, 0o755);
  }
  await chmod(join(live, "privkey.pem"), 0o644);
  return { dir, cert: await readFile(cert, "utf8") };
};

/**
 * A coturn of a probe's, made as the relay makes its own (agent relay.ts):
 * the relay's arguments for `seat`, on the media network at `seat.media`, its
 * listener (443 inside) published on `port`, the certificate folder at
 * /etc/letsencrypt when given; once it answers a STUN binding on `address`.
 */
export const startProbeCoturn = async (
  docker: Docker,
  probe: {
    name: string;
    args: RelayStartArgs;
    certified: boolean;
    seat: RelaySeat;
    network: string;
    port: number;
    certs?: string;
    extra?: string[];
  }
): Promise<{ container: Container; bound: string }> => {
  const relay = await import("../../../packages/agent/src/browser/relay");
  const { onMediaNetwork } =
    await import("../../../packages/agent/src/browser/media-network");
  const { until } = await import("../../scratch-fleet");
  await docker
    .getContainer(probe.name)
    .remove({ force: true })
    .catch(() => undefined);
  const published = relay.listenerPublished(probe.port);
  const placed = onMediaNetwork(probe.network, probe.seat.media);
  const container = await docker.createContainer({
    name: probe.name,
    Image: relay.RELAY_IMAGE,
    Cmd: [
      ...relay.coturnArgs(probe.args, probe.certified, probe.seat),
      ...(probe.extra ?? []),
    ],
    ExposedPorts: published.exposed,
    NetworkingConfig: placed.NetworkingConfig,
    HostConfig: {
      NetworkMode: placed.NetworkMode,
      PortBindings: published.bindings,
      ...(probe.certs
        ? { Binds: [`${probe.certs}:/etc/letsencrypt:ro,z`] }
        : {}),
    },
  });
  await container.start();
  // A VM's forwarder binds a moment after the guest does (Lima: every 3 s).
  const bound = await until(
    "coturn answers a STUN binding",
    () =>
      binding(
        `stun:${bracketed(probe.args.address)}:${probe.port}?transport=udp`
      ),
    (answer) => answer.startsWith("up"),
    BIND_MS
  ).catch((error: unknown) => String(error));
  return { container, bound };
};

/**
 * Where the runtime may not bind 443: the relay's start refused with the
 * sysctl sentence before any container, then coturn on the relay's own
 * arguments at .3 of the media network, its listener published on a stand-in
 * {@link freeStandIn} picks: once with a certificate (every check) and once
 * with `--no-tls`.
 */
const refusedLegs = async (
  kit: Kit,
  relay: Relay,
  runtime: Runtime,
  args: RelayStartArgs,
  refusal: RelayFailure
): Promise<void> => {
  const start = await readFile(
    "/proc/sys/net/ipv4/ip_unprivileged_port_start",
    "utf8"
  );
  // With a name, the first command that binds below the start is the
  // certificate's over HTTP (port 80); without, the start's (443).
  const first = (): Promise<unknown> =>
    args.hostname
      ? relay.certifyRelay({ hostname: args.hostname })
      : relay.startRelay(args);
  const thrown = await first().then(
    () => ({ said: "started", command: undefined }),
    (error: unknown) => ({
      said: said(error),
      command: error instanceof relay.RelayFailed ? error.command : undefined,
    })
  );
  const made = await runtime.docker
    .getContainer(relay.RELAY_CONTAINER)
    .inspect()
    .then(
      () => true,
      () => false
    );
  kit.check(
    `rootless with ip_unprivileged_port_start=${start.trim()}: failed with the sysctl sentence, its one-line command beside it, no container started ("${thrown.said}"; command "${thrown.command}")`,
    thrown.said === refusal.why &&
      thrown.command === refusal.command &&
      SYSCTL.test(thrown.command ?? "") &&
      !made,
    `container ${relay.RELAY_CONTAINER} ${made ? "exists" : "absent"}`
  );
  const standIn = await freeStandIn();
  if (
    !kit.check(
      `a stand-in for 443 free on UDP and TCP, outside the hub's preview ports and the relay's: ${standIn ?? "none found"}`,
      standIn !== undefined
    ) ||
    standIn === undefined
  ) {
    return;
  }
  const where = ` (443 refused here: coturn started by this spec with the relay's arguments at .${PROBE_HOST} of the media network, its listener published on ${standIn})`;
  const { docker } = runtime;
  const { pullImage } =
    await import("../../../packages/agent/src/browser/image");
  await pullImage(docker, relay.RELAY_IMAGE, (step) =>
    kit.note(`${relay.RELAY_IMAGE}: ${step.done}/${step.total} layers`)
  );
  const { media, network } = await mediaOf(docker);
  const seat = {
    ...(await relay.relaySeat(docker, args.address)),
    media: `${media.gatewayAddress(network).split(".").slice(0, 3).join(".")}.${PROBE_HOST}`,
  };
  const host = bracketed(args.address);
  const { dir, cert } = await selfSigned();
  try {
    const named = { ...args, hostname: PROBE_NAME };
    const withCert = await startProbeCoturn(docker, {
      name: PROBE_CONTAINER,
      args: named,
      certified: true,
      seat,
      network: network.name,
      port: standIn,
      certs: dir,
    });
    try {
      if (
        kit.check(
          `coturn with a certificate answers on udp ${standIn}: ${withCert.bound}${where}`,
          withCert.bound.startsWith("up"),
          (await coturnLines(withCert.container, 0)).slice(-30).join("\n")
        )
      ) {
        await listenerChecks(kit, relay, docker, args, {
          container: withCert.container,
          host,
          media: seat.media,
          network: {
            name: network.name,
            gateway: media.gatewayAddress(network),
          },
          port: standIn,
          where,
          tls: { host, servername: PROBE_NAME, ca: cert },
        });
      }
    } finally {
      await withCert.container.remove({ force: true }).catch(() => undefined);
    }
    // Without a name: `--no-tls`.
    const plain = await startProbeCoturn(docker, {
      name: PROBE_CONTAINER,
      args,
      certified: false,
      seat,
      network: network.name,
      port: standIn,
    });
    try {
      const log = (await coturnLines(plain.container, 0)).join("\n");
      const running = (await plain.container.inspect()).State.Running === true;
      const tcp = await binding(`stun:${host}:${standIn}?transport=tcp`);
      const warned = NO_TLS_WARNING.test(log);
      kit.check(
        `--no-tls: coturn ${running ? "running" : "not running"}, udp ${standIn} ${plain.bound}, tcp ${standIn} ${tcp}, ${warned ? "a" : "no"} "cannot start TLS" warning in its log${where}`,
        running &&
          plain.bound.startsWith("up") &&
          tcp.startsWith("up") &&
          !warned,
        log.slice(-2000)
      );
    } finally {
      await plain.container.remove({ force: true }).catch(() => undefined);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** Whether the runtime holds the relay's container, and its certificate volume. */
const relayLeft = async (
  relay: Relay,
  runtime: Runtime
): Promise<{ container: boolean; volume: boolean }> => {
  const there = (read: Promise<unknown>) =>
    read.then(
      () => true,
      () => false
    );
  return {
    container: await there(
      runtime.docker.getContainer(relay.RELAY_CONTAINER).inspect()
    ),
    volume: await there(runtime.docker.getVolume(relay.CERTS_VOLUME).inspect()),
  };
};

/**
 * Stop, then Remove: Stop keeps the certificate volume (when one was made),
 * Remove takes the container and then the volume. Where no certificate was
 * issued (no `--hostname`, or 443 refused), the volume is made empty first so
 * Remove has one to take.
 */
const removeLegs = async (
  kit: Kit,
  relay: Relay,
  runtime: Runtime,
  certified: boolean
): Promise<void> => {
  await relay.stopRelay();
  const stopped = await relayLeft(relay, runtime);
  if (certified) {
    kit.check(
      `Stop relay: container ${relay.RELAY_CONTAINER} gone, volume ${relay.CERTS_VOLUME} kept for the next start`,
      !stopped.container && stopped.volume,
      JSON.stringify(stopped)
    );
  }
  if (!stopped.volume) {
    await runtime.docker.createVolume({ Name: relay.CERTS_VOLUME });
  }
  const frame = await relay.removeRelay();
  const removed = await relayLeft(relay, runtime);
  kit.check(
    `Remove relay: container ${relay.RELAY_CONTAINER} and volume ${relay.CERTS_VOLUME} both gone${certified ? "" : " (the volume made empty by this spec)"}; state ${frame.state}`,
    !(removed.container || removed.volume) && frame.state === "stopped",
    JSON.stringify(removed)
  );
};

const relaySpec = async (kit: Kit): Promise<void> => {
  const machine = flag("machine");
  const address = flag("address");
  const name = flag("hostname");
  if (!(machine && address)) {
    kit.check(
      "--machine <name> and --address <a viewer reaches it at> given",
      false,
      process.argv.slice(2).join(" ")
    );
    return;
  }
  if (
    !kit.check(
      `run on ${machine} (this machine is ${machineHostname()})`,
      machine === machineHostname()
    )
  ) {
    return;
  }
  const { browserRuntime } =
    await import("../../../packages/agent/src/browser/browsers");
  const relay = await import("../../../packages/agent/src/browser/relay");
  const runtime = await browserRuntime(true);
  if ("missing" in runtime) {
    kit.check("container runtime found", false, runtime.missing);
    return;
  }
  kit.note(
    `runtime ${runtime.kind} ${runtime.version} (API ${runtime.api}${runtime.rootless ? ", rootless" : ""}${runtime.ownNetwork ? "" : ", in a VM"}) at ${runtime.endpoint}`
  );
  const args: RelayStartArgs = {
    secret: flag("secret") ?? randomBytes(32).toString("base64url"),
    address,
    relayRange: STREAM_RELAY_PORTS.relayRange,
    ...(name ? { hostname: name } : {}),
  };
  // The spec removes what a relay leaves, certificate included: it never
  // runs over a relay this machine already has.
  const before = await relayLeft(relay, runtime);
  if (
    !kit.check(
      `no relay on ${machine} before this spec (container ${relay.RELAY_CONTAINER} ${before.container ? "present" : "absent"}, volume ${relay.CERTS_VOLUME} ${before.volume ? "present" : "absent"}): remove one in Settings › Browsers first`,
      !(before.container || before.volume)
    )
  ) {
    return;
  }
  let certified = false;
  try {
    // A name's certificate is issued over HTTP, on port 80.
    const lowest = name ? 80 : 443;
    const { need } = await relay.relayRuntimeRead(lowest);
    if (need?.kind === "low-ports") {
      await refusedLegs(
        kit,
        relay,
        runtime,
        args,
        RELAY_FAILURES.lowPort(machineHostname(), lowest)
      );
    } else if (need) {
      // A VM runtime short of a setting: the start refuses with its command,
      // no container made, and the run ends there until it is changed.
      const thrown = await relay.startRelay(args).then(
        () => "started",
        (error: unknown) => said(error)
      );
      kit.check(
        `the runtime needs a setting first (${need.kind}): run \`${need.command}\` on ${machine}, then this spec again ("${thrown}")`,
        false,
        need.why
      );
    } else {
      await relayLegs(kit, relay, runtime, args);
      certified = !!name;
    }
    await removeLegs(kit, relay, runtime, certified);
  } finally {
    await relay.removeRelay().catch(() => undefined);
    for (const one of [PROBE_CONTAINER, UCLIENT_CONTAINER]) {
      // biome-ignore lint/performance/noAwaitInLoops: two containers, in turn.
      await runtime.docker
        .getContainer(one)
        .remove({ force: true })
        .catch(() => undefined);
    }
  }
};

const spec: Spec = {
  name: "browser-relay",
  run: relaySpec,
};

export default spec;
