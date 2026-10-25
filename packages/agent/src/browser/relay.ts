/**
 * The fleet's stream relay on this machine (Projects spec §5.11, build item
 * 5): coturn in its container `cawco-relay`, run through the machine's
 * container runtime (runtime.ts) with the hub's shared secret. With a DNS
 * name, a certbot container issues the name's Let's Encrypt certificate
 * first (`relay.certify`, the journey's certificate step), kept on the volume
 * `cawco-relay-certs`, and coturn answers TLS on TCP 5349 beside plain UDP
 * and TCP on 3478.
 *
 * One topology on every runtime, native Linux and VM alike: coturn's
 * container joins the runtime's media network (media-network.ts) at .2, its
 * listeners, UDP and TCP 3478 and with a certificate TCP 5349, published on
 * every address of the machine (a VM's forwarder carries them to the
 * machine: Colima forwards a guest's 0.0.0.0 port to the host's 0.0.0.0, TCP
 * and UDP alike). Every one is above 1024, so no runtime, rootless or in a
 * VM, needs root or a sysctl to bind it. Its UDP relay range stays inside its
 * container: nothing is published for it.
 *
 * Every relayed stream is relay to relay inside the one coturn: a viewer and a
 * browser each hold an allocation, and their pair has both relayed addresses
 * on the relay's public address P. `--external-ip=P/<.2>` maps P to coturn's
 * own address as each peer address is read, before any check, and whitelists
 * that one address (coturn 4.18.0 mainrelay.c, "Whitelisting external-ip
 * private part"); every allocation relays from `--relay-ip=<.2>`, the one
 * relay address, so a permission for P:port is a permission for a sibling
 * allocation's socket and the packet is delivered inside coturn's own
 * network namespace. Every other destination is denied: the private, CGNAT,
 * loopback, link-local and multicast ranges, and the machine's other public
 * addresses. A VM forwarder that erases sources ("Docker Desktop on macOS
 * erases source addresses by design", vdaluz.com) changes nothing: no packet
 * from outside ever enters a relay socket, which needs a permission for its
 * source (no `server-relay`). TCP relaying is off (`no-tcp-relay`).
 *
 * The certificate is issued only by DNS at Cloudflare, with the person's
 * token the hub hands (certbot's `dns-cloudflare` plugin: "The Token needed
 * by Certbot requires `Zone:DNS:Edit` permissions for only the zones you need
 * certificates for", certbot-dns-cloudflare.readthedocs.io): no port of the
 * machine is opened for it. The token reaches certbot only as a file mounted
 * 0600 for the one run, and is never logged.
 *
 * Nothing starts where it could not run: with no runtime, on a runtime short
 * of a setting the relay needs (`relay.runtime`, the journey's runtime step:
 * a VM's forwarder carrying less than UDP and TCP), or with one of its ports
 * held by
 * another process, the start fails with the sentence that names the fix,
 * before any container is made. The container is the record: its labels
 * carry the settings it was made with and its DNS name, so a daemon that
 * restarts reads the relay back from it.
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
  RelayPorts,
  RelayReach,
  RelayRenewArgs,
  RelayRenewed,
  RelayRuntimeNeed,
  RelayRuntimeRead,
  RelayStartArgs,
} from "@cawco/core/stream-relay";
import {
  RELAY_DNS_NAME,
  RELAY_FAILURES,
  type RelayFailure,
  STREAM_RELAY_PORT,
  STREAM_RELAY_TLS_PORT,
} from "@cawco/core/stream-relay";
import type Docker from "dockerode";
import { browserRuntime } from "./browsers";
import { pullImage } from "./image";
import {
  forwardingReader,
  machineAddresses,
  mediaForwarding,
} from "./media-forwarding";
import {
  ensureMediaNetwork,
  insidePrefix,
  onMediaNetwork,
  relayMediaAddress,
} from "./media-network";
import { type Runtime, runtimeInstallCommand } from "./runtime";

/** coturn's immutable alpine tag ("Once built, it's never updated", its docker README). */
export const RELAY_IMAGE = "coturn/coturn:4.18.0-r0-alpine";
/**
 * certbot's newest release on Docker Hub with its Cloudflare DNS plugin
 * ("Official build of EFF's Certbot with its plugin for doing DNS challenges
 * using Cloudflare", hub.docker.com/r/certbot/dns-cloudflare), pinned. One
 * image for every certbot run: the DNS challenge, the renewal and the
 * certificate's read are the same certbot.
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

/**
 * How long coturn has to bind its ports once started, and its runtime's
 * forwarder to bind them on the machine (Lima's guest agent reads the
 * guest's ports every 3 s, media-forwarding.ts).
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
  udp: false,
  tcp: false,
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

/** One port held by someone, in words: "TCP 3478 is held by caddy (pid 917)". */
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

/**
 * `cmd` run to its end in a certbot container with the certificate volume,
 * and the token's folder at {@link CLOUDFLARE_DIR} when given: its exit code
 * and what it said. On the runtime's default network, no port published: the
 * DNS challenge needs none, and a read of the volume neither.
 */
const runCertbot = async (
  docker: Docker,
  cmd: string[],
  tokenDir?: string
): Promise<{ code: number; said: string }> => {
  const container = await docker.createContainer({
    Image: CERTBOT_IMAGE,
    Cmd: cmd,
    Labels: { [RELAY_LABEL]: "certbot" },
    HostConfig: {
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
      throw new RelayFailed(RELAY_FAILURES.certbotSlow(CERTBOT_MS / 1000));
    }
    return { code: ended.value.StatusCode, said: await logsOf(container) };
  } finally {
    await container.remove({ force: true }).catch(() => undefined);
  }
};

/**
 * `work` with the person's Cloudflare token in a folder of its own: the ini
 * certbot's plugin reads (`dns_cloudflare_api_token = …`), 0600 in a 0700
 * folder, removed as soon as `work` ends.
 */
const withToken = async <T>(
  token: string,
  work: (dir: string) => Promise<T>
): Promise<T> => {
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
  const { code, said } = await runCertbot(docker, [
    "certificates",
    "--cert-name",
    name,
  ]);
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

/**
 * certbot's challenge flags, at issue and at each renewal alike: Cloudflare's
 * DNS with the token's ini. Given to `renew` too, so a renewal never falls
 * back on whatever challenge a renewal conf names ("The same plugin and
 * options that were used at the time the certificate was originally issued
 * will be used for the renewal attempt, unless you specify other plugins or
 * options", eff-certbot.readthedocs.io/en/stable/using.html).
 */
const DNS_CHALLENGE = [
  "--dns-cloudflare",
  "--dns-cloudflare-credentials",
  CLOUDFLARE_INI,
  "--dns-cloudflare-propagation-seconds",
  String(PROPAGATION_S),
];

/**
 * Where coturn sits: its own address on the runtime's media network
 * (media-network.ts `relayMediaAddress`), its one listening and relay
 * address, and the machine's public addresses other than the relay's, each
 * denied ({@link otherPublic}).
 */
export interface RelaySeat {
  media: string;
  otherPublic: string[];
}

/**
 * coturn's arguments for `args` in `seat`: its plain listener on 3478, UDP
 * and TCP, and with the certificate's paths its TLS listener on 5349, each
 * named though each is coturn's default (turnserver.conf: "TURN listener port
 * for UDP and TCP (Default: 3478)", "TURN listener port for TLS (Default:
 * 5349)"); without a certificate `--no-tls` starts no TLS listener at all.
 * The relay's public address maps to its one relay address, the only peer it
 * lets through; every range below is denied, as the module's header says.
 */
export const coturnArgs = (
  args: RelayStartArgs,
  certified: boolean,
  seat: RelaySeat
): string[] => [
  "-n",
  "--log-file=stdout",
  `--listening-ip=${seat.media}`,
  `--listening-port=${STREAM_RELAY_PORT}`,
  `--relay-ip=${seat.media}`,
  `--external-ip=${args.address}/${seat.media}`,
  `--min-port=${args.relayRange[0]}`,
  `--max-port=${args.relayRange[1]}`,
  "--fingerprint",
  "--use-auth-secret",
  `--static-auth-secret=${args.secret}`,
  "--realm=cawco",
  "--no-multicast-peers",
  // No TCP relay endpoints (RFC 6062, on by default: "By default TCP relay
  // endpoints are enabled"): a viewer's media relays over UDP alone.
  "--no-tcp-relay",
  "--no-software-attribute",
  // This network, the private and CGNAT ranges, loopback, link-local and
  // multicast: the relay reaches no machine of the owner's networks, not its
  // own host, not its VM.
  "--denied-peer-ip=0.0.0.0-0.255.255.255",
  "--denied-peer-ip=10.0.0.0-10.255.255.255",
  "--denied-peer-ip=100.64.0.0-100.127.255.255",
  "--denied-peer-ip=127.0.0.0-127.255.255.255",
  "--denied-peer-ip=169.254.0.0-169.254.255.255",
  "--denied-peer-ip=172.16.0.0-172.31.255.255",
  "--denied-peer-ip=192.168.0.0-192.168.255.255",
  "--denied-peer-ip=224.0.0.0-255.255.255.255",
  ...seat.otherPublic.map((one) => `--denied-peer-ip=${one}`),
  ...(certified && args.hostname
    ? [
        `--tls-listening-port=${STREAM_RELAY_TLS_PORT}`,
        `--cert=${LETSENCRYPT}/live/${args.hostname}/fullchain.pem`,
        `--pkey=${LETSENCRYPT}/live/${args.hostname}/privkey.pem`,
      ]
    : ["--no-tls"]),
];

/** This machine's public IPv4 addresses other than `address`, the relay's: a machine with two public interfaces relays to neither. */
const otherPublic = async (address: string): Promise<string[]> =>
  (await machineAddresses()).filter(
    (one) => !one.includes(":") && isPublicAddress(one) && one !== address
  );

/** coturn's seat on `docker`'s media network for a relay reached at `address`, the network made when absent. */
export const relaySeat = async (
  docker: Docker,
  address: string
): Promise<RelaySeat & { network: string }> => {
  const network = await ensureMediaNetwork(docker);
  return {
    network: network.name,
    media: relayMediaAddress(network),
    otherPublic: await otherPublic(address),
  };
};

/** The settings a container was made with, as its label carries them. */
const settingsHash = (
  args: RelayStartArgs,
  certified: boolean,
  seat: RelaySeat
): string =>
  createHash("sha256")
    .update(JSON.stringify(coturnArgs(args, certified, seat)))
    .digest("hex")
    .slice(0, 16);

/** A tailnet's addresses: 100.64.0.0/10. */
const TAILNET = "100.64.0.0/10";
const PRIVATE_V4 = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];

/** This machine's own LAN and tailnet IPv4 addresses, read now: where another fleet machine's browser reaches the relay first (relay-urls.ts). */
const reachNow = async (): Promise<RelayReach> => {
  const v4 = (await machineAddresses()).filter((one) => !one.includes(":"));
  return {
    lan: v4.filter((one) => PRIVATE_V4.some((cidr) => insidePrefix(one, cidr))),
    tailnet: v4.filter((one) => insidePrefix(one, TAILNET)),
  };
};

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

/**
 * The relay's listeners as the machine carries them now, read as a browser's
 * media port is (media-forwarding.ts `forwardingReader`): what is bound on
 * every address where a process forwards (a VM's forwarder, rootlesskit or
 * pasta), else a TCP connection through a rootful engine's NAT. TLS is its
 * own listener, read on its own port while a certificate stands.
 */
const listenerBound = async (
  runtime: Runtime,
  tls: boolean
): Promise<RelayPorts> => {
  const reader = forwardingReader(runtime);
  const [plain, secure] = await Promise.all([
    reader?.read(STREAM_RELAY_PORT) ?? "none",
    tls ? (reader?.read(STREAM_RELAY_TLS_PORT) ?? "none") : "none",
  ]);
  return {
    udp: plain === "udp+tcp",
    tcp: plain !== "none",
    tls: secure !== "none",
  };
};

/** Waits until coturn's UDP and TCP 3478 (and with a certificate TCP 5349) are carried on the machine, or throws with its last lines. */
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
    if (ports.udp && ports.tcp && (!tls || ports.tls)) {
      return ports;
    }
    await Bun.sleep(LIVE_POLL_MS);
  }
  const missing = [
    ports.udp ? null : `UDP ${STREAM_RELAY_PORT}`,
    ports.tcp ? null : `TCP ${STREAM_RELAY_PORT}`,
    !tls || ports.tls ? null : `TCP ${STREAM_RELAY_TLS_PORT}`,
  ].filter((port): port is string => port !== null);
  throw new RelayFailed(
    runtime.ownNetwork
      ? RELAY_FAILURES.coturnUnbound(hostname(), missing, LIVE_MS / 1000)
      : RELAY_FAILURES.unforwarded(hostname(), missing, LIVE_MS / 1000)
  );
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

/**
 * What the runtime must change before the relay runs, read now; null when
 * nothing must. Every port it takes is above 1024, so an engine on the
 * machine itself, rootless or rootful, carries it as it is. A VM's forwarder
 * must carry UDP as well as TCP: Colima's ssh one carries TCP alone
 * (media-forwarding.ts), its grpc one both.
 */
const runtimeNeed = async (
  runtime: Runtime
): Promise<RelayRuntimeNeed | null> => {
  if (runtime.ownNetwork) {
    return null;
  }
  const forwarding = await mediaForwarding(runtime.endpoint);
  if (forwarding.media === "udp+tcp" || !forwarding.command) {
    return null;
  }
  return {
    why: `${forwarding.runtime ?? "The container runtime"} forwards ${forwarding.media === "none" ? "no ports" : "only TCP"} from its VM, and the stream relay needs UDP and TCP ${STREAM_RELAY_PORT}: switch it to its forwarder that carries both.`,
    command: forwarding.command,
  };
};

/**
 * `relay.runtime`: whether the runtime's step applies (its engine runs in a
 * VM) and what its forwarder must change first, read on each ask (the hub
 * asks every 2 s while the journey's runtime step stands). No runtime
 * answers as the start would refuse.
 */
export const relayRuntimeRead = async (): Promise<RelayRuntimeRead> => {
  const runtime = await relayRuntime();
  return {
    need: await runtimeNeed(runtime),
    stepApplies: !runtime.ownNetwork,
  };
};

/**
 * The relay's listeners held by another process of the machine, as their
 * failure; undefined when UDP and TCP 3478 (and with a certificate TCP 5349)
 * are free, or the machine has no socket tables to read (a Mac: there the
 * runtime refuses a start whose port is held, in its own words). The alt
 * ports coturn opens beside them (3479, 5350) stay inside its container.
 */
const portsRefusal = async (
  tls: boolean
): Promise<RelayFailure | undefined> => {
  const held = await heldPorts([
    { proto: "udp", port: STREAM_RELAY_PORT },
    { proto: "tcp", port: STREAM_RELAY_PORT },
    ...(tls ? [{ proto: "tcp" as const, port: STREAM_RELAY_TLS_PORT }] : []),
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
  const need = await runtimeNeed(runtime);
  if (need) {
    throw new RelayFailed(RELAY_FAILURES.runtimeNeed(hostname(), need));
  }
  return runtime;
};

/**
 * The relay's ports while `kept` runs with these very settings; undefined
 * otherwise. A container whose label hash differs (made before, or the
 * machine's public addresses changed since) is made again.
 */
const runningAsAsked = async (
  runtime: Runtime,
  kept: Docker.ContainerInspectInfo | null,
  args: RelayStartArgs,
  seat: RelaySeat
): Promise<{ ports: RelayPorts; tls: boolean } | undefined> => {
  const tls =
    !!args.hostname && kept?.Config.Labels?.[HOSTNAME_LABEL] === args.hostname;
  if (
    !kept?.State.Running ||
    kept.Config.Labels?.[RELAY_LABEL] !== settingsHash(args, tls, seat)
  ) {
    return;
  }
  return { ports: await listenerBound(runtime, tls), tls };
};

/**
 * The machine's network changed: a live relay's frame told again with the
 * machine's own addresses read now, so the hub mints every browser's
 * credential with the reach the relay has (relay-urls.ts). Nothing is told
 * while the relay is not live, or when its addresses are the same (`tell`
 * sends a frame only when it changed).
 */
export const relayReachChanged = (): Promise<void> =>
  serial(async () => {
    if (current.state !== "live") {
      return;
    }
    tell({ ...current, reach: await reachNow() });
  });

/** The relay live: told with the machine's own addresses, and answered as its frame. */
const liveFrame = async (
  ports: RelayPorts,
  tls: boolean,
  name: string | undefined
): Promise<RelayFrame> => {
  tell({
    state: "live",
    ports,
    reach: await reachNow(),
    ...(tls && name ? { hostname: name } : {}),
  });
  return { kind: "stream_relay", machineId, ...current };
};

/**
 * `relay.certify`: the relay's certificate for `hostname`, issued (or kept,
 * when one stands and is not due) by DNS at Cloudflare with the person's
 * token; its end answered. The relay itself is not touched: the journey's
 * start step runs it on the certificate after.
 */
export const certifyRelay = (args: RelayCertifyArgs): Promise<RelayCertified> =>
  serial(async () => {
    const name = args.hostname;
    if (!RELAY_DNS_NAME.test(name)) {
      throw new RelayFailed(RELAY_FAILURES.notDnsName(hostname(), name));
    }
    const { docker } = await relayRuntime();
    await pullImage(docker, CERTBOT_IMAGE, () => undefined);
    await ensureVolume(docker);
    const { code, said } = await withToken(args.cloudflareToken, (dir) =>
      runCertbot(
        docker,
        [
          "certonly",
          ...DNS_CHALLENGE,
          "--non-interactive",
          "--agree-tos",
          "--register-unsafely-without-email",
          "--keep-until-expiring",
          "--deploy-hook",
          DEPLOY_HOOK,
          "-d",
          name,
        ],
        dir
      )
    );
    if (code !== 0) {
      throw new RelayFailed(
        RELAY_FAILURES.certificateDns(name, certbotWords(said))
      );
    }
    const expiresAt = await certificateEnd(docker, name);
    if (expiresAt === undefined) {
      throw new RelayFailed(
        RELAY_FAILURES.certificateDns(
          name,
          "certbot exited 0 and no certificate stands in its volume"
        )
      );
    }
    console.info(
      `[relay] certificate for ${name} stands (DNS at Cloudflare), ends ${new Date(expiresAt).toISOString()}`
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
      const seat = await relaySeat(docker, args.address);
      const running = await runningAsAsked(runtime, kept, args, seat);
      if (running) {
        return await liveFrame(running.ports, running.tls, args.hostname);
      }
      await removeRelayContainer(docker);
      const refused = await portsRefusal(!!args.hostname);
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
      await createRelay(docker, args, tls, seat);
      const ports = await waitLive(docker, runtime, tls);
      console.info(
        `[relay] live at ${args.address}, coturn at ${seat.media} on ${seat.network}${tls ? ` with TLS for ${args.hostname}` : ""}`
      );
      return await liveFrame(ports, tls, args.hostname);
    } catch (error) {
      return failed(error);
    }
  });

/**
 * coturn's published listeners on every address of the machine, each to the
 * same port inside its container: UDP and TCP 3478, and with `tls` TCP 5349.
 * A probe names its stand-in ports (`host`). The relay range is never
 * published.
 */
export const listenerPublished = (
  tls: boolean,
  host: { plain: number; tls: number } = {
    plain: STREAM_RELAY_PORT,
    tls: STREAM_RELAY_TLS_PORT,
  }
): { exposed: Record<string, object>; bindings: Docker.PortMap } => {
  const ports: [string, number][] = [
    [`${STREAM_RELAY_PORT}/udp`, host.plain],
    [`${STREAM_RELAY_PORT}/tcp`, host.plain],
    ...(tls
      ? [[`${STREAM_RELAY_TLS_PORT}/tcp`, host.tls] as [string, number]]
      : []),
  ];
  return {
    exposed: Object.fromEntries(ports.map(([one]) => [one, {}])),
    bindings: Object.fromEntries(
      ports.map(([one, port]) => [
        one,
        [{ HostIp: "0.0.0.0", HostPort: String(port) }],
      ])
    ),
  };
};

/** coturn's container, made and started at its seat on the media network, its listener published. */
const createRelay = async (
  docker: Docker,
  args: RelayStartArgs,
  tls: boolean,
  seat: RelaySeat & { network: string }
): Promise<void> => {
  const published = listenerPublished(tls);
  const placed = onMediaNetwork(seat.network, seat.media);
  const container = await docker.createContainer({
    name: RELAY_CONTAINER,
    Image: RELAY_IMAGE,
    Cmd: coturnArgs(args, tls, seat),
    Labels: {
      [RELAY_LABEL]: settingsHash(args, tls, seat),
      ...(tls && args.hostname ? { [HOSTNAME_LABEL]: args.hostname } : {}),
    },
    ExposedPorts: published.exposed,
    NetworkingConfig: placed.NetworkingConfig,
    HostConfig: {
      NetworkMode: placed.NetworkMode,
      PortBindings: published.bindings,
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
 * shortens its certificates to 64 and then 45 days. It renews by DNS with the
 * token the hub hands again, its ini at the path the renewal conf names.
 */
export const renewRelay = (args: RelayRenewArgs): Promise<RelayRenewed> =>
  serial(async () => {
    const runtime = await relayRuntime();
    const { docker } = runtime;
    const kept = await relayContainer(docker);
    const name = kept?.Config.Labels?.[HOSTNAME_LABEL];
    if (!(kept && name)) {
      throw new RelayFailed(RELAY_FAILURES.renewNone(hostname()));
    }
    const before = await certificateEnd(docker, name);
    const { code, said } = await withToken(args.cloudflareToken, (dir) =>
      runCertbot(
        docker,
        [
          "renew",
          ...DNS_CHALLENGE,
          "--non-interactive",
          "--cert-name",
          name,
          "--deploy-hook",
          DEPLOY_HOOK,
        ],
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
      await liveFrame(ports, true, name);
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
      await liveFrame(ports, !!name, name);
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
