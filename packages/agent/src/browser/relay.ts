/**
 * The fleet's stream relay on this machine (Projects spec §5.11, build item
 * 5): coturn in its container `cawco-relay`, run through the machine's
 * container runtime (runtime.ts) with the hub's shared secret. With a DNS
 * name, a certbot container issues the name's Let's Encrypt certificate
 * first (`relay.certify`, the journey's certificate step), kept on the volume
 * `cawco-relay-certs`, and coturn answers TLS on its one listener, 443,
 * beside plain UDP and TCP.
 *
 * One relay, met to the network as its runtime has it (core `RelayNetwork`):
 * - `host`, a native engine on Linux: coturn on the host network, which is
 *   the machine's own (coturn's README: "Or just use the host network
 *   directly (recommended, as Docker performs badly with large port
 *   ranges)");
 * - `published`, an engine in a VM (every Mac runtime; Colima or Docker
 *   Desktop on Linux): its host network is the VM's, so UDP and TCP 443 and
 *   the UDP relay range are published through the VM's port forwarder on
 *   every address of the machine (a Mac lets a process bind a port under
 *   1024 on every address without root: "iOS never had this restriction and
 *   we've now lifted it on macOS", Apple DTS, developer.apple.com/forums/
 *   thread/674179; Colima forwards a guest's 0.0.0.0 port to the host's
 *   0.0.0.0, TCP and UDP alike: "handle port forwarding to allow listening
 *   on 0.0.0.0", its environment/vm/lima/yaml.go). Every packet comes in
 *   through that one listener, a screen's from outside as this machine's
 *   own, so the address read from here is the one every peer arrives
 *   with. That forwarder rewrites every peer's address to its own
 *   ("Docker Desktop on macOS erases source addresses by design",
 *   vdaluz.com; OrbStack's issue 2333, "Orbstack not passing source IP to
 *   containers"), so coturn reports the machine's public address as its
 *   relay's (`external-ip`), takes a peer's packets without the address
 *   check the forwarder defeats (`server-relay`: "This option eliminates the
 *   IP permissions check on the packets incoming to the relay endpoints"),
 *   and lets the forwarder's own address through the private ranges it
 *   otherwise denies (`allowed-peer-ip`: "If an ip address is specified as
 *   both allowed and denied, then the ip address is considered to be
 *   allowed", coturn's turnserver.conf), that address read by a STUN binding
 *   through the published listener as each start comes up.
 *
 * Either way coturn refuses every private and CGNAT peer but this machine's
 * own browsers: the machine's addresses their candidates name are let
 * through (`allowed-peer-ip`), read at each start, so a viewer the relay
 * alone reaches gets a browser of the relay's machine. coturn lets a peer
 * through by address alone, so TCP relaying is off (`no-tcp-relay`) and the
 * exception carries UDP only, which is all a viewer's media takes.
 *
 * The certificate is issued by DNS at Cloudflare when the hub hands the
 * person's token (certbot's `dns-cloudflare` plugin: "The Token needed by
 * Certbot requires `Zone:DNS:Edit` permissions for only the zones you need
 * certificates for", certbot-dns-cloudflare.readthedocs.io), else over HTTP
 * on port 80 (certbot standalone). The token reaches certbot only as a file
 * mounted 0600 for the one run, and is never logged.
 *
 * Nothing starts where it could not run: with no runtime, on a runtime short
 * of a setting the relay needs (`relay.runtime`, the journey's runtime step:
 * a rootless Linux engine's low ports, a VM's forwarder carrying less than
 * UDP and TCP, a VM's rootless engine), or with one of its ports held by
 * another process, the start fails with the sentence that names the fix,
 * before any container is made. The container is the record: its labels
 * carry the settings it was made with, its DNS name and its forwarder's
 * address, so a daemon that restarts reads the relay back from it.
 */
import { createHash } from "node:crypto";
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { isPublicAddress } from "@cawco/core/public-address";
import type {
  RelayCertified,
  RelayCertifyArgs,
  RelayFrame,
  RelayNetwork,
  RelayPorts,
  RelayRenewed,
  RelayRuntimeNeed,
  RelayRuntimeRead,
  RelayStartArgs,
} from "@cawco/core/stream-relay";
import {
  lowPortsCommand,
  RELAY_DNS_NAME,
  RELAY_FAILURES,
  RELAY_HTTP_PORT,
  type RelayFailure,
  STREAM_RELAY_PORT,
  STREAM_RELAY_PORTS,
} from "@cawco/core/stream-relay";
import type Docker from "dockerode";
import { browserRuntime } from "./browsers";
import { pullImage } from "./image";
import {
  forwardingReader,
  machineAddresses,
  mediaForwarding,
} from "./media-forwarding";
import { lanAddress, mappedBy } from "./relay-reach";
import { type Runtime, runtimeInstallCommand } from "./runtime";

/** coturn's immutable alpine tag ("Once built, it's never updated", its docker README). */
export const RELAY_IMAGE = "coturn/coturn:4.18.0-r0-alpine";
/**
 * certbot's newest release on Docker Hub with its Cloudflare DNS plugin
 * ("Official build of EFF's Certbot with its plugin for doing DNS challenges
 * using Cloudflare", hub.docker.com/r/certbot/dns-cloudflare), pinned. One
 * image for every certbot run: the DNS challenge, standalone over HTTP, the
 * renewal and the certificate's read are the same certbot.
 */
export const CERTBOT_IMAGE = "certbot/dns-cloudflare:v5.8.0";
/** The relay's container on the runtime. */
export const RELAY_CONTAINER = "cawco-relay";
/** Where the certificate lives, mounted at `/etc/letsencrypt`. */
export const CERTS_VOLUME = "cawco-relay-certs";
/** The label the relay's container carries: the hash of the settings it was made with. */
const RELAY_LABEL = "dev.cawco.relay";
/** The label naming the DNS name it was made for, when it has one. */
const HOSTNAME_LABEL = "dev.cawco.relay.hostname";
/** The label naming the address a published relay's forwarder hands every peer, when it was let through. */
const FORWARDER_LABEL = "dev.cawco.relay.forwarder";

const LETSENCRYPT = "/etc/letsencrypt";
/**
 * Where certbot reads the Cloudflare token's ini inside its container. The
 * same path at issue and at each renewal: the renewal conf certbot writes
 * names it (`dns_cloudflare_credentials`).
 */
const CLOUDFLARE_DIR = "/run/cawco";
const CLOUDFLARE_INI = `${CLOUDFLARE_DIR}/cloudflare.ini`;
/** How long the DNS challenge's TXT record has to reach Cloudflare's servers before Let's Encrypt asks (the plugin's default is 10 s). */
const PROPAGATION_S = 20;
/** The proc file a rootless runtime's low ports depend on (podman rootless.md). */
const UNPRIVILEGED = "/proc/sys/net/ipv4/ip_unprivileged_port_start";

/**
 * How long coturn has to bind its ports once started, and on a published
 * relay its forwarder to bind them on the machine (Lima's guest agent reads
 * the guest's ports every 3 s, media-forwarding.ts).
 */
const LIVE_MS = 20_000;
const LIVE_POLL_MS = 250;
/** How long a certbot run may take. */
const CERTBOT_MS = 180_000;

/**
 * coturn's image runs as `USER nobody:nogroup` (its alpine Dockerfile) and
 * certbot writes the private key 0600 for root, so the hook certbot runs on
 * each issue opens the key and its folders to coturn, inside the volume.
 */
const DEPLOY_HOOK = `chmod 0755 ${LETSENCRYPT}/live ${LETSENCRYPT}/archive && chmod 0644 ${LETSENCRYPT}/archive/*/privkey*.pem`;

/** certbot's `certificates` line: `Expiry Date: 2027-01-17 10:00:00+00:00 (VALID: 89 days)`. */
const EXPIRY = /Expiry Date: (\S+ \S+)/;

const NO_PORTS: RelayPorts = {
  udp443: false,
  tcp443: false,
  tls: false,
};

let sink: (frame: RelayFrame) => void = () => undefined;
let machineId = "";
let lastSent = "";
let current: Omit<RelayFrame, "kind" | "machineId"> = {
  state: "stopped",
  ports: NO_PORTS,
};
/** One relay command at a time. */
let queue: Promise<unknown> = Promise.resolve();

/** Where the daemon sends the relay's frames, and the machine they are of. */
export const setRelaySink = (
  id: string,
  send: (frame: RelayFrame) => void
): void => {
  machineId = id;
  sink = send;
};

const tell = (next: Omit<RelayFrame, "kind" | "machineId">): void => {
  current = next;
  const frame: RelayFrame = { kind: "stream_relay", machineId, ...next };
  const text = JSON.stringify(frame);
  if (text !== lastSent) {
    lastSent = text;
    sink(frame);
  }
};

const why = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** A relay failure thrown: its sentence as the message, its command kept beside it. */
export class RelayFailed extends Error {
  readonly command: string | undefined;
  constructor(failure: RelayFailure) {
    super(failure.why);
    this.command = failure.command;
  }
}

/** Runs `work` after every relay command before it. */
const serial = <T>(work: () => Promise<T>): Promise<T> => {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
};

/** The runtime's not-found answer. */
const notFound = (error: unknown): boolean =>
  (error as { statusCode?: number }).statusCode === 404;

/* ------------------------------------------------------------------ */
/* Who holds a port: the kernel's socket tables and each process's fds */
/* ------------------------------------------------------------------ */

/** One bound socket of /proc/net/{tcp,udp}{,6}. */
interface BoundSocket {
  inode: string;
  port: number;
  proto: "tcp" | "udp";
  uid: number;
}

/** TCP's LISTEN state in /proc/net/tcp (include/net/tcp_states.h `TCP_LISTEN`). */
const TCP_LISTEN = "0A";
const FIELDS = /\s+/;
const PID = /^\d+$/;
const SOCKET_LINK = /^socket:\[(\d+)\]$/;
/** The lines of certbot's that say why it failed. */
const CERTBOT_ERROR =
  /^(?:Detail|Type|Error|An unexpected error)|Problem|error/i;

/** Every socket of `proto` bound to a local port: TCP listening, UDP bound. */
const boundSockets = async (proto: "tcp" | "udp"): Promise<BoundSocket[]> => {
  const tables = await Promise.all(
    [proto, `${proto}6`].map((name) =>
      readFile(join("/proc/net", name), "utf8").catch(() => "")
    )
  );
  return tables.flatMap((table) =>
    table
      .split("\n")
      .slice(1)
      .flatMap((line): BoundSocket[] => {
        // sl local_address rem_address st tx:rx tr:tm retrnsmt uid timeout inode
        const [, local, , state, , , , uid, , inode] = line
          .trim()
          .split(FIELDS);
        if (!(local && state && inode) || inode === "0") {
          return [];
        }
        if (proto === "tcp" && state !== TCP_LISTEN) {
          return [];
        }
        const port = Number.parseInt(local.split(":")[1] ?? "", 16);
        return [{ proto, port, uid: Number(uid), inode }];
      })
  );
};

/** The process holding each socket inode it can see: this user's processes' fds. */
const processesOf = async (
  inodes: Set<string>
): Promise<Map<string, { pid: number; command: string }>> => {
  const found = new Map<string, { pid: number; command: string }>();
  const pids = (await readdir("/proc").catch(() => [])).filter((name) =>
    PID.test(name)
  );
  await Promise.all(
    pids.map(async (pid) => {
      const fds = await readdir(join("/proc", pid, "fd")).catch(() => []);
      for (const fd of fds) {
        // biome-ignore lint/performance/noAwaitInLoops: one process's fds, read in turn.
        const target = await readlink(join("/proc", pid, "fd", fd)).catch(
          () => ""
        );
        const inode = SOCKET_LINK.exec(target)?.[1];
        if (inode && inodes.has(inode) && !found.has(inode)) {
          const command = (
            await readFile(join("/proc", pid, "comm"), "utf8").catch(() => "")
          ).trim();
          found.set(inode, { pid: Number(pid), command });
        }
      }
    })
  );
  return found;
};

/** One port held by someone, in words: "TCP 443 is held by caddy (pid 917)". */
export interface HeldPort {
  port: number;
  proto: "tcp" | "udp";
  said: string;
}

/**
 * The ports of `wanted` some process already holds, each named with its
 * process (or its user, for another user's, whose fds this user can't read).
 */
export const heldPorts = async (
  wanted: { proto: "tcp" | "udp"; port: number }[]
): Promise<HeldPort[]> => {
  const sockets = [
    ...(await boundSockets("tcp")),
    ...(await boundSockets("udp")),
  ].filter((socket) =>
    wanted.some((one) => one.proto === socket.proto && one.port === socket.port)
  );
  if (sockets.length === 0) {
    return [];
  }
  const owners = await processesOf(new Set(sockets.map((one) => one.inode)));
  const said = new Map<string, HeldPort>();
  for (const socket of sockets) {
    const key = `${socket.proto}:${socket.port}`;
    if (said.has(key)) {
      continue;
    }
    const owner = owners.get(socket.inode);
    said.set(key, {
      proto: socket.proto,
      port: socket.port,
      said: `${socket.proto.toUpperCase()} ${socket.port} is held by ${owner ? `${owner.command || "a process"} (pid ${owner.pid})` : `a process of user id ${socket.uid}`}`,
    });
  }
  return [...said.values()];
};

/**
 * Whether the listener is bound now on UDP and TCP 443, by anyone (coturn,
 * once it is up). TLS answers on that same TCP socket, so it has no port of
 * its own to watch: the hub's `stuns:` probe proves it after the start.
 */
const boundNow = async (tls: boolean): Promise<RelayPorts> => {
  const tcp = await boundSockets("tcp");
  const udp = await boundSockets("udp");
  const has = (list: BoundSocket[]) =>
    list.some((one) => one.port === STREAM_RELAY_PORT);
  return {
    udp443: has(udp),
    tcp443: has(tcp),
    tls: tls && has(tcp),
  };
};

/* ------------------------------------------------------------------ */
/* Containers                                                          */
/* ------------------------------------------------------------------ */

/**
 * What a container said, its stdout and stderr in order: its last 60 lines,
 * or every line since `window.since` (s epoch).
 */
export const logsOf = async (
  container: Docker.Container,
  window: { tail: number } | { since: number } = { tail: 60 }
): Promise<string> => {
  const raw = (await container.logs({
    stdout: true,
    stderr: true,
    follow: false,
    ...window,
  })) as unknown as Buffer;
  // The Engine API's multiplexed stream: an 8-byte header (stream, 0, 0, 0,
  // size as uint32 big-endian) before each frame, while the container has no TTY.
  const parts: string[] = [];
  let at = 0;
  while (at + 8 <= raw.length) {
    const size = raw.readUInt32BE(at + 4);
    parts.push(raw.subarray(at + 8, at + 8 + size).toString("utf8"));
    at += 8 + size;
  }
  return at === 0 ? raw.toString("utf8") : parts.join("");
};

/** Port 80 published on every address of the machine, for certbot's HTTP challenge through a VM's forwarder. */
const HTTP_PUBLISHED = {
  ExposedPorts: { [`${RELAY_HTTP_PORT}/tcp`]: {} },
  PortBindings: {
    [`${RELAY_HTTP_PORT}/tcp`]: [
      { HostIp: "0.0.0.0", HostPort: String(RELAY_HTTP_PORT) },
    ],
  },
};

/**
 * `cmd` run to its end in a certbot container with the certificate volume,
 * and the token's folder at {@link CLOUDFLARE_DIR} when given: its exit code
 * and what it said. On the host network, save a challenge over HTTP on a
 * `published` runtime, which answers on port 80 published.
 */
const runCertbot = async (
  docker: Docker,
  cmd: string[],
  dns: boolean,
  network: RelayNetwork,
  tokenDir?: string
): Promise<{ code: number; said: string }> => {
  const http = network === "published" && !dns;
  const container = await docker.createContainer({
    Image: CERTBOT_IMAGE,
    Cmd: cmd,
    Labels: { [RELAY_LABEL]: "certbot" },
    ...(http ? { ExposedPorts: HTTP_PUBLISHED.ExposedPorts } : {}),
    HostConfig: {
      ...(http
        ? { PortBindings: HTTP_PUBLISHED.PortBindings }
        : { NetworkMode: "host" }),
      Mounts: [{ Type: "volume", Source: CERTS_VOLUME, Target: LETSENCRYPT }],
      // `z`: a shared SELinux label, so a rootless Podman on an enforcing
      // host lets the container read the folder.
      ...(tokenDir ? { Binds: [`${tokenDir}:${CLOUDFLARE_DIR}:ro,z`] } : {}),
    },
  });
  try {
    await container.start();
    const ended = await readWithin(
      CERTBOT_MS,
      () => container.wait() as Promise<{ StatusCode: number }>
    );
    if (ended.kind === "unanswered") {
      await container.kill().catch(() => undefined);
      throw new RelayFailed(RELAY_FAILURES.certbotSlow(CERTBOT_MS / 1000, dns));
    }
    return { code: ended.value.StatusCode, said: await logsOf(container) };
  } finally {
    await container.remove({ force: true }).catch(() => undefined);
  }
};

/**
 * `work` with the person's Cloudflare token in a folder of its own: the ini
 * certbot's plugin reads (`dns_cloudflare_api_token = …`), 0600 in a 0700
 * folder, removed as soon as `work` ends. Without a token, `work` alone.
 */
const withToken = async <T>(
  token: string | undefined,
  work: (dir: string | undefined) => Promise<T>
): Promise<T> => {
  if (!token) {
    return work(undefined);
  }
  const dir = await mkdtemp(join(tmpdir(), "cawco-relay-dns-"));
  try {
    await chmod(dir, 0o700);
    const ini = join(dir, "cloudflare.ini");
    await writeFile(ini, `dns_cloudflare_api_token = ${token}\n`, {
      mode: 0o600,
    });
    return await work(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/** The certificate volume, made when absent. */
const ensureVolume = async (docker: Docker): Promise<void> => {
  await docker
    .getVolume(CERTS_VOLUME)
    .inspect()
    .catch(async (error: unknown) => {
      if (!notFound(error)) {
        throw error;
      }
      await docker.createVolume({
        Name: CERTS_VOLUME,
        Labels: { [RELAY_LABEL]: "certs" },
      });
    });
};

/** When `name`'s certificate in the volume ends (ms epoch), or undefined when none stands. */
const certificateEnd = async (
  docker: Docker,
  name: string
): Promise<number | undefined> => {
  const { code, said } = await runCertbot(
    docker,
    ["certificates", "--cert-name", name],
    false,
    "host"
  );
  const expiry = code === 0 ? EXPIRY.exec(said)?.[1] : undefined;
  return expiry ? Date.parse(expiry.replace(" ", "T")) : undefined;
};

/** certbot's own words for why an issue failed: its error lines, else its last lines. */
const certbotWords = (said: string): string => {
  const lines = said
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const errors = lines.filter((line) => CERTBOT_ERROR.test(line));
  return (errors.length > 0 ? errors : lines.slice(-4)).join(" ");
};

/** Port 80 free for certbot's challenge, or the failure `refusal` words, naming who holds it. */
const port80Free = async (
  refusal: (held: string) => RelayFailure
): Promise<void> => {
  const [held] = await heldPorts([{ proto: "tcp", port: RELAY_HTTP_PORT }]);
  if (held) {
    throw new RelayFailed(refusal(held.said));
  }
};

/** certbot's challenge flags: Cloudflare's DNS with the token's ini, else standalone over port 80. */
const challengeFlags = (dns: boolean): string[] =>
  dns
    ? [
        "--dns-cloudflare",
        "--dns-cloudflare-credentials",
        CLOUDFLARE_INI,
        "--dns-cloudflare-propagation-seconds",
        String(PROPAGATION_S),
      ]
    : ["--standalone"];

/**
 * coturn's arguments for `args`: one listener on 443, plain UDP and TCP, and
 * with the certificate's paths TLS on that same listener (turnserver.conf:
 * "TLS & DTLS sessions can connect to the 'plain' TCP & UDP port(s), too").
 * `tls-listening-port` keeps its default, never forwarded nor minted; without
 * a certificate `--no-tls` starts no TLS listener at all.
 */
export const coturnArgs = (
  args: RelayStartArgs,
  certified: boolean,
  network: RelayNetworkSettings
): string[] => [
  "-n",
  "--log-file=stdout",
  `--listening-port=${STREAM_RELAY_PORT}`,
  "--fingerprint",
  "--use-auth-secret",
  `--static-auth-secret=${args.secret}`,
  "--realm=cawco",
  `--min-port=${args.relayRange[0]}`,
  `--max-port=${args.relayRange[1]}`,
  "--no-multicast-peers",
  // No TCP relay endpoints (RFC 6062, on by default: "By default TCP relay
  // endpoints are enabled"): a viewer's media relays over UDP alone, and the
  // exception for this machine's own addresses below then carries no
  // connection to another service of the machine.
  "--no-tcp-relay",
  "--no-software-attribute",
  // The private and CGNAT ranges, so the relay reaches no machine of the
  // owner's networks; loopback peers are refused by coturn's default.
  "--denied-peer-ip=10.0.0.0-10.255.255.255",
  "--denied-peer-ip=172.16.0.0-172.31.255.255",
  "--denied-peer-ip=192.168.0.0-192.168.255.255",
  "--denied-peer-ip=100.64.0.0-100.127.255.255",
  "--denied-peer-ip=169.254.0.0-169.254.255.255",
  // Except this machine's own browsers: the addresses their candidates name
  // (container-host.ts NAT1TO1), so a viewer the relay alone reaches gets
  // this machine's browser ("If an ip address is specified as both allowed
  // and denied, then the ip address is considered to be allowed").
  ...network.own.map((one) => `--allowed-peer-ip=${one}`),
  ...(certified && args.hostname
    ? [
        `--cert=${LETSENCRYPT}/live/${args.hostname}/fullchain.pem`,
        `--pkey=${LETSENCRYPT}/live/${args.hostname}/privkey.pem`,
      ]
    : ["--no-tls"]),
  ...addressing(args, network),
];

/**
 * How coturn names its relay's address. On the host network: the router's or
 * cloud NAT's mapping (`<public>/<private>`), where there is one. Published:
 * inside the VM coturn holds one address of its own, so the public one alone
 * is the mapping (`-X <ip>`: "that ip will be reported as relay IP address of
 * all allocations of its own address family"), with the forwarder's
 * rewriting met as the module's header says.
 */
const addressing = (
  args: RelayStartArgs,
  network: RelayNetworkSettings
): string[] => {
  if (network.kind === "host") {
    return args.externalIp ? [`--external-ip=${args.externalIp}`] : [];
  }
  return [
    `--external-ip=${args.address}`,
    "--server-relay",
    ...(network.forwarder ? [`--allowed-peer-ip=${network.forwarder}`] : []),
  ];
};

/**
 * How a relay meets the network: on the host's, or published with the
 * address its forwarder hands peers, once read; and `own`, this machine's
 * addresses in the ranges it denies that its browsers' candidates name
 * ({@link ownPeers}).
 */
export type RelayNetworkSettings = { own: string[] } & (
  { kind: "host" } | { kind: "published"; forwarder?: string }
);

/**
 * This machine's own addresses a browser's candidates name (neko's NAT1TO1
 * list, media-forwarding.ts `machineAddresses`: its LAN and tailnet
 * addresses, its global IPv6 ones), read now, those of them coturn's
 * denials cover: a public one needs no exception.
 */
export const ownPeers = async (): Promise<string[]> =>
  (await machineAddresses()).filter((one) => !isPublicAddress(one));

/** The settings a container was made with, as its label carries them. */
const settingsHash = (
  args: RelayStartArgs,
  certified: boolean,
  network: RelayNetworkSettings
): string =>
  createHash("sha256")
    .update(JSON.stringify(coturnArgs(args, certified, network)))
    .digest("hex")
    .slice(0, 16);

/** The relay's container as the runtime has it, or null. */
const relayContainer = async (
  docker: Docker
): Promise<Docker.ContainerInspectInfo | null> =>
  docker
    .getContainer(RELAY_CONTAINER)
    .inspect()
    .catch((error: unknown) => {
      if (notFound(error)) {
        return null;
      }
      throw error;
    });

const removeRelayContainer = async (docker: Docker): Promise<void> => {
  await docker
    .getContainer(RELAY_CONTAINER)
    .remove({ force: true })
    .catch((error: unknown) => {
      if (!notFound(error)) {
        throw error;
      }
    });
};

/** How the relay meets the network on `runtime`: its host network where that is the machine's own, else published through its VM's forwarder. */
const networkOf = (runtime: Runtime): RelayNetwork =>
  runtime.ownNetwork ? "host" : "published";

/**
 * The relay's listener as bound now: on the host network, the machine's own
 * sockets; published, what the runtime's forwarder binds on every address of
 * the machine (media-forwarding.ts `forwardingReader`), TLS on its TCP.
 */
const listenerBound = async (
  runtime: Runtime,
  tls: boolean
): Promise<RelayPorts> => {
  if (networkOf(runtime) === "host") {
    return boundNow(tls);
  }
  const forwarded =
    (await forwardingReader(runtime)?.read(STREAM_RELAY_PORT)) ?? "none";
  const tcp = forwarded !== "none";
  return { udp443: forwarded === "udp+tcp", tcp443: tcp, tls: tls && tcp };
};

/** Waits until coturn has bound UDP and TCP 443 (published: its forwarder has, on the machine), or throws with its last lines. */
const waitLive = async (
  docker: Docker,
  runtime: Runtime,
  tls: boolean
): Promise<RelayPorts> => {
  const until = Date.now() + LIVE_MS;
  let ports = NO_PORTS;
  while (Date.now() < until) {
    // biome-ignore lint/performance/noAwaitInLoops: polling a server that is starting.
    const inspected = await relayContainer(docker);
    if (!inspected?.State.Running) {
      const said = await logsOf(docker.getContainer(RELAY_CONTAINER)).catch(
        () => ""
      );
      throw new RelayFailed(
        RELAY_FAILURES.coturnExited(
          hostname(),
          String(inspected?.State.ExitCode ?? "unknown"),
          said.trim().split("\n").slice(-4).join(" ")
        )
      );
    }
    ports = await listenerBound(runtime, tls);
    if (ports.udp443 && ports.tcp443 && (!tls || ports.tls)) {
      return ports;
    }
    await Bun.sleep(LIVE_POLL_MS);
  }
  const missing = [
    ports.udp443 ? null : `UDP ${STREAM_RELAY_PORT}`,
    ports.tcp443 ? null : `TCP ${STREAM_RELAY_PORT}`,
    !tls || ports.tls ? null : `TLS on ${STREAM_RELAY_PORT}`,
  ].filter((port): port is string => port !== null);
  throw new RelayFailed(
    networkOf(runtime) === "host"
      ? RELAY_FAILURES.coturnUnbound(hostname(), missing, LIVE_MS / 1000)
      : RELAY_FAILURES.unforwarded(hostname(), missing, LIVE_MS / 1000)
  );
};

/** How many STUN bindings the forwarder's address is asked by, each given relay-reach.ts's 3 s. */
const PROBE_TRIES = 3;

/**
 * The address a published relay's forwarder hands every peer, as coturn
 * answers a STUN binding through the published listener from this machine
 * (its XOR-MAPPED-ADDRESS is the source coturn saw), and whether coturn must
 * let it through: one of the private ranges it denies, and not this machine's
 * own address (a forwarder that keeps sources). Undefined when no binding
 * answered.
 */
const forwarderAddress = async (): Promise<
  { address: string; allow: boolean } | undefined
> => {
  const from = lanAddress() ?? "127.0.0.1";
  for (let tried = 0; tried < PROBE_TRIES; tried += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: asked again only when the one before went unanswered.
    const address = await mappedBy(`stun:${from}:${STREAM_RELAY_PORT}`);
    if (address) {
      return { address, allow: !isPublicAddress(address) && address !== from };
    }
  }
};

/* ------------------------------------------------------------------ */
/* What must hold before anything starts                               */
/* ------------------------------------------------------------------ */

/** The runtime the relay runs through, or the sentence that says there is none. */
const relayRuntime = async (): Promise<Runtime> => {
  const found = await browserRuntime(true);
  if ("missing" in found) {
    throw new RelayFailed(
      RELAY_FAILURES.noRuntime(hostname(), runtimeInstallCommand())
    );
  }
  return found;
};

/** `ip_unprivileged_port_start` as the kernel has it now. */
const unprivilegedStart = async (): Promise<number> =>
  Number((await readFile(UNPRIVILEGED, "utf8")).trim());

/** A VM's Podman made rootful (podman-machine-set(1): "To switch the default Podman machine from rootless to rootful: podman machine set --rootful"), restarted so its socket forwards to the rootful one. */
const PODMAN_ROOTFUL =
  "podman machine stop && podman machine set --rootful && podman machine start";

/**
 * What the runtime must change before the relay binds `lowest` (443, or 80
 * for a certificate over HTTP), read now; null when nothing must.
 * - A rootless engine on Linux binds a port under 1024 only from
 *   `ip_unprivileged_port_start` up (podman rootless.md: "Podman can not
 *   create containers that bind to ports < 1024 … `sysctl
 *   net.ipv4.ip_unprivileged_port_start=443` allows rootless Podman
 *   containers to bind to ports >= 443").
 * - A rootless Podman in a VM is held to the VM's own start ("rootlessport
 *   cannot expose privileged port 123 …", containers/podman discussion
 *   20932), which the Mac can't set: it runs rootful instead.
 * - A VM's forwarder must carry UDP as well as TCP: Colima's ssh one carries
 *   TCP alone (media-forwarding.ts), its grpc one both.
 */
const runtimeNeed = async (
  runtime: Runtime,
  lowest: number
): Promise<RelayRuntimeNeed | null> => {
  if (runtime.ownNetwork) {
    if (!runtime.rootless || (await unprivilegedStart()) <= lowest) {
      return null;
    }
    return {
      kind: "low-ports",
      why: `Port ${lowest} is below the range this machine lets a rootless container runtime bind.`,
      command: lowPortsCommand(lowest),
    };
  }
  if (runtime.rootless && runtime.kind === "podman") {
    return {
      kind: "rootful",
      why: `Podman runs rootless inside its VM, which publishes no port under 1024, and the stream relay listens on ${lowest}: run it rootful.`,
      command: PODMAN_ROOTFUL,
    };
  }
  const forwarding = await mediaForwarding(runtime.endpoint);
  if (forwarding.media === "udp+tcp" || !forwarding.command) {
    return null;
  }
  const [first, last] = STREAM_RELAY_PORTS.relayRange;
  return {
    kind: "forwarder",
    why: `${forwarding.runtime ?? "The container runtime"} forwards ${forwarding.media === "none" ? "no ports" : "only TCP"} from its VM, and the stream relay needs UDP and TCP ${STREAM_RELAY_PORT} and UDP ${first}–${last}: switch it to its forwarder that carries both.`,
    command: forwarding.command,
  };
};

/** The runtime's need as the start's failure: the low ports in their own words, any other in its own. */
const needFailure = (need: RelayRuntimeNeed, lowest: number): RelayFailure =>
  need.kind === "low-ports"
    ? RELAY_FAILURES.lowPort(hostname(), lowest)
    : RELAY_FAILURES.runtimeNeed(hostname(), need);

/**
 * `relay.runtime`: how the runtime carries the relay and what it must change
 * first, read on each ask (the hub asks every 2 s while the journey's runtime
 * step stands). No runtime answers as the start would refuse.
 */
export const relayRuntimeRead = async (
  lowest: number
): Promise<RelayRuntimeRead> => {
  const runtime = await relayRuntime();
  const network = networkOf(runtime);
  return {
    network,
    need: await runtimeNeed(runtime, lowest),
    stepApplies: network === "published" || runtime.rootless,
  };
};

/**
 * The relay's listener held by another process on the host network, as its
 * failure; undefined when UDP and TCP 443 are free. The ports coturn opens
 * beside it (444, 5349, 5350) are only reserved: coturn starts without them.
 * A published relay's ports are the forwarder's to bind, and the runtime
 * refuses a start whose port is held, in its own words.
 */
const portsRefusal = async (): Promise<RelayFailure | undefined> => {
  const held = await heldPorts([
    { proto: "udp", port: STREAM_RELAY_PORT },
    { proto: "tcp", port: STREAM_RELAY_PORT },
  ]);
  if (held.length === 0) {
    return;
  }
  return RELAY_FAILURES.held(
    hostname(),
    held.map((one) => one.said)
  );
};

/* ------------------------------------------------------------------ */
/* The commands                                                         */
/* ------------------------------------------------------------------ */

const failed = (error: unknown): never => {
  tell({
    state: "failed",
    ports: NO_PORTS,
    why: why(error),
    ...(error instanceof RelayFailed && error.command
      ? { command: error.command }
      : {}),
  });
  console.warn(`[relay] failed: ${why(error)}`);
  throw error;
};

/** The relay's settings checked and the machine's leave read: its runtime, or the refusal thrown. */
const readyToStart = async (args: RelayStartArgs): Promise<Runtime> => {
  if (args.hostname && !RELAY_DNS_NAME.test(args.hostname)) {
    throw new RelayFailed(RELAY_FAILURES.notDnsName(hostname(), args.hostname));
  }
  const runtime = await relayRuntime();
  const need = await runtimeNeed(runtime, STREAM_RELAY_PORT);
  if (need) {
    throw new RelayFailed(needFailure(need, STREAM_RELAY_PORT));
  }
  return runtime;
};

/**
 * The network settings for `runtime` with this machine's addresses `own`:
 * published, the forwarder's address `kept`'s label names, the first guess
 * until a start reads it again. A container whose label hash differs (the
 * machine's addresses changed since) is made again.
 */
const keptSettings = (
  runtime: Runtime,
  kept: Docker.ContainerInspectInfo | null,
  own: string[]
): RelayNetworkSettings =>
  networkOf(runtime) === "host"
    ? { kind: "host", own }
    : {
        kind: "published",
        forwarder: kept?.Config.Labels?.[FORWARDER_LABEL],
        own,
      };

/** The relay's ports while `kept` runs with these very settings; undefined otherwise. */
const runningAsAsked = async (
  runtime: Runtime,
  kept: Docker.ContainerInspectInfo | null,
  args: RelayStartArgs,
  own: string[]
): Promise<{ ports: RelayPorts; tls: boolean } | undefined> => {
  const tls =
    !!args.hostname && kept?.Config.Labels?.[HOSTNAME_LABEL] === args.hostname;
  const settings = keptSettings(runtime, kept, own);
  if (
    !kept?.State.Running ||
    kept.Config.Labels?.[RELAY_LABEL] !== settingsHash(args, tls, settings)
  ) {
    return;
  }
  // A runtime restarted since may hand peers another address: then the
  // container is made again for it.
  if (settings.kind === "published") {
    const seen = await forwarderAddress();
    if (
      !seen ||
      (seen.allow ? seen.address : undefined) !== settings.forwarder
    ) {
      return;
    }
  }
  return { ports: await listenerBound(runtime, tls), tls };
};

/** The relay live: told, and answered as its frame. */
const liveFrame = (
  ports: RelayPorts,
  tls: boolean,
  name: string | undefined
): RelayFrame => {
  tell({ state: "live", ports, ...(tls && name ? { hostname: name } : {}) });
  return { kind: "stream_relay", machineId, ...current };
};

/**
 * `relay.certify`: the relay's certificate for `hostname`, issued (or kept,
 * when one stands and is not due) by DNS at Cloudflare with the person's
 * token, else standalone over port 80; its end answered. The relay itself is
 * not touched: the journey's start step runs it on the certificate after.
 */
export const certifyRelay = (args: RelayCertifyArgs): Promise<RelayCertified> =>
  serial(async () => {
    const name = args.hostname;
    if (!RELAY_DNS_NAME.test(name)) {
      throw new RelayFailed(RELAY_FAILURES.notDnsName(hostname(), name));
    }
    const dns = !!args.cloudflareToken;
    const runtime = await relayRuntime();
    const { docker } = runtime;
    const network = networkOf(runtime);
    if (!dns) {
      const need = await runtimeNeed(runtime, RELAY_HTTP_PORT);
      if (need) {
        throw new RelayFailed(needFailure(need, RELAY_HTTP_PORT));
      }
      if (network === "host") {
        await port80Free((held) =>
          RELAY_FAILURES.certificatePort80(name, held)
        );
      }
    }
    await pullImage(docker, CERTBOT_IMAGE, () => undefined);
    await ensureVolume(docker);
    const { code, said } = await withToken(args.cloudflareToken, (dir) =>
      runCertbot(
        docker,
        [
          "certonly",
          ...challengeFlags(dns),
          "--non-interactive",
          "--agree-tos",
          "--register-unsafely-without-email",
          "--keep-until-expiring",
          "--deploy-hook",
          DEPLOY_HOOK,
          "-d",
          name,
        ],
        dns,
        network,
        dir
      )
    );
    if (code !== 0) {
      const words = certbotWords(said);
      throw new RelayFailed(
        dns
          ? RELAY_FAILURES.certificateDns(name, words)
          : RELAY_FAILURES.certificateHttp(name, words)
      );
    }
    const expiresAt = await certificateEnd(docker, name);
    if (expiresAt === undefined) {
      throw new RelayFailed(
        RELAY_FAILURES.certificateHttp(
          name,
          "certbot exited 0 and no certificate stands in its volume"
        )
      );
    }
    console.info(
      `[relay] certificate for ${name} stands (${dns ? "DNS at Cloudflare" : "HTTP on port 80"}), ends ${new Date(expiresAt).toISOString()}`
    );
    return { expiresAt };
  });

/**
 * Runs the relay with `args` and answers its frame once its ports are bound.
 * A container made with the same settings and running is kept as it is. With
 * a name, its certificate must stand already (`relay.certify`).
 */
export const startRelay = (args: RelayStartArgs): Promise<RelayFrame> =>
  serial(async () => {
    try {
      const runtime = await readyToStart(args);
      const { docker } = runtime;
      const kept = await relayContainer(docker);
      const own = await ownPeers();
      const running = await runningAsAsked(runtime, kept, args, own);
      if (running) {
        return liveFrame(running.ports, running.tls, args.hostname);
      }
      await removeRelayContainer(docker);
      const network = networkOf(runtime);
      const refused = network === "host" ? await portsRefusal() : undefined;
      if (refused) {
        throw new RelayFailed(refused);
      }
      tell({ state: "pulling", ports: NO_PORTS });
      await pullImage(docker, RELAY_IMAGE, (progress) =>
        tell({ state: "pulling", ports: NO_PORTS, progress })
      );
      if (args.hostname) {
        await pullImage(docker, CERTBOT_IMAGE, (progress) =>
          tell({ state: "pulling", ports: NO_PORTS, progress })
        );
        if ((await certificateEnd(docker, args.hostname)) === undefined) {
          throw new RelayFailed(
            RELAY_FAILURES.noCertificate(hostname(), args.hostname)
          );
        }
      }
      const tls = !!args.hostname;
      tell({ state: "starting", ports: NO_PORTS });
      // Published, the forwarder's address the container before let through
      // is the first guess; the start reads it again and makes the container
      // anew once when it changed.
      const settings = keptSettings(runtime, kept, own);
      await createRelay(docker, args, tls, settings);
      let ports = await waitLive(docker, runtime, tls);
      if (settings.kind === "published") {
        ports = await forwarderLetThrough(runtime, args, tls, settings, ports);
      }
      console.info(
        `[relay] live at ${args.address} (${network})${tls ? ` with TLS for ${args.hostname}` : ""}`
      );
      return liveFrame(ports, tls, args.hostname);
    } catch (error) {
      return failed(error);
    }
  });

/**
 * A published relay, live on `made`, with the address its forwarder hands
 * peers read and let through: the container made again when that address is
 * not the one it was made with. Its ports as live after.
 */
const forwarderLetThrough = async (
  runtime: Runtime,
  args: RelayStartArgs,
  tls: boolean,
  made: RelayNetworkSettings & { kind: "published" },
  ports: RelayPorts
): Promise<RelayPorts> => {
  const seen = await forwarderAddress();
  if (!seen) {
    throw new RelayFailed(
      RELAY_FAILURES.unanswered(hostname(), PROBE_TRIES * 3)
    );
  }
  const forwarder = seen.allow ? seen.address : undefined;
  console.info(
    `[relay] published through ${runtime.endpoint}: coturn sees this machine's binding from ${seen.address}${forwarder ? ", let through its denied ranges" : ""}`
  );
  if (forwarder === made.forwarder) {
    return ports;
  }
  await removeRelayContainer(runtime.docker);
  await createRelay(runtime.docker, args, tls, { ...made, forwarder });
  return waitLive(runtime.docker, runtime, tls);
};

/**
 * coturn's published ports: UDP and TCP 443 and the UDP relay range, on
 * every address of the machine (each relay port to itself, as `external-ip`
 * needs: "relayed port 12345 must be always mapped to the same 'external'
 * port 12345").
 */
const publishedPorts = (
  args: RelayStartArgs
): { exposed: Record<string, object>; bindings: Docker.PortMap } => {
  const ports = [
    `${STREAM_RELAY_PORT}/udp`,
    `${STREAM_RELAY_PORT}/tcp`,
    ...Array.from(
      { length: args.relayRange[1] - args.relayRange[0] + 1 },
      (_, at) => `${args.relayRange[0] + at}/udp`
    ),
  ];
  return {
    exposed: Object.fromEntries(ports.map((port) => [port, {}])),
    bindings: Object.fromEntries(
      ports.map((port) => [
        port,
        [{ HostIp: "0.0.0.0", HostPort: port.split("/")[0] }],
      ])
    ),
  };
};

/** coturn's container, made and started: on the host network, or its ports published. */
const createRelay = async (
  docker: Docker,
  args: RelayStartArgs,
  tls: boolean,
  network: RelayNetworkSettings
): Promise<void> => {
  const published =
    network.kind === "published" ? publishedPorts(args) : undefined;
  const container = await docker.createContainer({
    name: RELAY_CONTAINER,
    Image: RELAY_IMAGE,
    Cmd: coturnArgs(args, tls, network),
    Labels: {
      [RELAY_LABEL]: settingsHash(args, tls, network),
      ...(tls && args.hostname ? { [HOSTNAME_LABEL]: args.hostname } : {}),
      ...(network.kind === "published" && network.forwarder
        ? { [FORWARDER_LABEL]: network.forwarder }
        : {}),
    },
    ...(published ? { ExposedPorts: published.exposed } : {}),
    HostConfig: {
      ...(published
        ? { PortBindings: published.bindings }
        : { NetworkMode: "host" }),
      RestartPolicy: { Name: "unless-stopped" },
      Mounts: tls
        ? [
            {
              Type: "volume",
              Source: CERTS_VOLUME,
              Target: LETSENCRYPT,
              ReadOnly: true,
            },
          ]
        : [],
    },
  });
  await container.start();
};

/** Stops the relay and removes its container; its certificate stays on its volume. */
export const stopRelay = (): Promise<RelayFrame> =>
  serial(async () => {
    const found = await browserRuntime();
    if ("missing" in found) {
      tell({ state: "stopped", ports: NO_PORTS });
      return { kind: "stream_relay", machineId, ...current };
    }
    await removeRelayContainer(found.docker);
    tell({ state: "stopped", ports: NO_PORTS });
    console.info("[relay] stopped");
    return { kind: "stream_relay", machineId, ...current };
  });

/**
 * The relay gone from this machine: its container removed, then its
 * certificate volume, so nothing of it stays behind. Stop keeps them; this is Remove relay's, and a relay
 * moved to another machine's.
 */
export const removeRelay = (): Promise<RelayFrame> =>
  serial(async () => {
    const found = await browserRuntime();
    if (!("missing" in found)) {
      await removeRelayContainer(found.docker);
      await found.docker
        .getVolume(CERTS_VOLUME)
        .remove()
        .catch((error: unknown) => {
          if (!notFound(error)) {
            throw error;
          }
        });
    }
    tell({ state: "stopped", ports: NO_PORTS });
    console.info("[relay] removed, its certificate volume with it");
    return { kind: "stream_relay", machineId, ...current };
  });

/**
 * Renews the relay's certificate when certbot says it is due (`certbot
 * renew` decides by the certificate's own lifetime), and restarts coturn on a
 * new one. Asked every day: a fixed interval does not hold as Let's Encrypt
 * shortens its certificates to 64 and then 45 days. A certificate issued by
 * DNS renews by DNS with the token the hub hands again, its ini at the path
 * the renewal conf names; one issued over HTTP needs port 80 free.
 */
export const renewRelay = (args: {
  cloudflareToken?: string;
}): Promise<RelayRenewed> =>
  serial(async () => {
    const runtime = await relayRuntime();
    const { docker } = runtime;
    const kept = await relayContainer(docker);
    const name = kept?.Config.Labels?.[HOSTNAME_LABEL];
    if (!(kept && name)) {
      throw new RelayFailed(RELAY_FAILURES.renewNone(hostname()));
    }
    const dns = !!args.cloudflareToken;
    const network = networkOf(runtime);
    const before = await certificateEnd(docker, name);
    if (!dns && network === "host") {
      await port80Free((held) =>
        RELAY_FAILURES.renewPort80(hostname(), name, held)
      );
    }
    const { code, said } = await withToken(args.cloudflareToken, (dir) =>
      runCertbot(
        docker,
        [
          "renew",
          "--non-interactive",
          "--cert-name",
          name,
          "--deploy-hook",
          DEPLOY_HOOK,
        ],
        dns,
        network,
        dir
      )
    );
    if (code !== 0) {
      throw new RelayFailed(
        RELAY_FAILURES.renewRefused(hostname(), name, certbotWords(said))
      );
    }
    const after = await certificateEnd(docker, name);
    const renewed = after !== undefined && after !== before;
    if (renewed) {
      await docker.getContainer(RELAY_CONTAINER).restart({ t: 5 });
      const ports = await waitLive(docker, runtime, true);
      tell({ state: "live", ports, hostname: name });
      console.info(`[relay] certificate for ${name} renewed; coturn restarted`);
    }
    return { renewed, expiresAt: after ?? before ?? 0 };
  });

/**
 * The daemon's part as it starts: the relay read back from its container
 * (started again when it is not running, as after a reboot a rootless
 * runtime does not do itself), and its frame told. A machine with no relay
 * container says nothing.
 */
export const watchRelay = async (): Promise<void> => {
  const found = await browserRuntime();
  if ("missing" in found) {
    return;
  }
  const { docker } = found;
  const kept = await relayContainer(docker);
  if (!kept) {
    return;
  }
  const name = kept.Config.Labels?.[HOSTNAME_LABEL];
  await serial(async () => {
    try {
      if (!kept.State.Running) {
        tell({ state: "starting", ports: NO_PORTS });
        await docker.getContainer(RELAY_CONTAINER).start();
      }
      const ports = await waitLive(docker, found, !!name);
      tell({ state: "live", ports, ...(name ? { hostname: name } : {}) });
    } catch (error) {
      tell({
        state: "failed",
        ports: NO_PORTS,
        why: why(error),
        ...(error instanceof RelayFailed && error.command
          ? { command: error.command }
          : {}),
      });
    }
  });
};
