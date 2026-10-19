/**
 * The fleet's stream relay on this machine (Projects spec §5.11, build item
 * 5): coturn on the host network, its container `cawco-relay`, run through
 * the machine's container runtime (runtime.ts) with the hub's shared secret.
 * coturn's own README: "Or just use the host network directly (recommended,
 * as Docker performs badly with large port ranges)". With a DNS name, a
 * certbot container issues the name's Let's Encrypt certificate first
 * (`relay.certify`, the journey's certificate step), kept on the volume
 * `cawco-relay-certs`, and coturn answers TLS on its one listener, 443,
 * beside plain UDP and TCP.
 *
 * The certificate is issued by DNS at Cloudflare when the hub hands the
 * person's token (certbot's `dns-cloudflare` plugin: "The Token needed by
 * Certbot requires `Zone:DNS:Edit` permissions for only the zones you need
 * certificates for", certbot-dns-cloudflare.readthedocs.io), else over HTTP
 * on port 80 (certbot standalone). The token reaches certbot only as a file
 * mounted 0600 for the one run, and is never logged.
 *
 * Nothing starts where it could not run: on a machine that is not Linux (a
 * Mac's runtime has a VM's host network, which nothing outside reaches), with
 * no runtime, on a rootless runtime whose `ip_unprivileged_port_start` is
 * above the lowest port it needs, or with one of its ports held by another
 * process, the start fails with the sentence that names the fix, before any
 * container is made. The container is the record: its labels carry the
 * settings it was made with and its DNS name, so a daemon that restarts reads
 * the relay back from it.
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
import { hostname, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import type {
  RelayCertified,
  RelayCertifyArgs,
  RelayFrame,
  RelayLowPorts,
  RelayPorts,
  RelayRenewed,
  RelayStartArgs,
} from "@cawco/core/stream-relay";
import {
  RELAY_DNS_NAME,
  RELAY_FAILURES,
  RELAY_HTTP_PORT,
  type RelayFailure,
  STREAM_RELAY_PORT,
} from "@cawco/core/stream-relay";
import type Docker from "dockerode";
import { browserRuntime } from "./browsers";
import { pullImage } from "./image";
import { unmapRelayPorts } from "./relay-router";
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

/** How long coturn has to bind its ports once started. */
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

/** What one container that ran to its end said, its stdout and stderr in order. */
const logsOf = async (container: Docker.Container): Promise<string> => {
  const raw = (await container.logs({
    stdout: true,
    stderr: true,
    follow: false,
    tail: 60,
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
 * `cmd` run to its end in a certbot container on the host network with the
 * certificate volume, and the token's folder at {@link CLOUDFLARE_DIR} when
 * given: its exit code and what it said.
 */
const runCertbot = async (
  docker: Docker,
  cmd: string[],
  dns: boolean,
  tokenDir?: string
): Promise<{ code: number; said: string }> => {
  const container = await docker.createContainer({
    Image: CERTBOT_IMAGE,
    Cmd: cmd,
    Labels: { [RELAY_LABEL]: "certbot" },
    HostConfig: {
      NetworkMode: "host",
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
    false
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
  certified: boolean
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
  "--no-software-attribute",
  // The private and CGNAT ranges, so the relay reaches no machine of the
  // owner's networks; loopback peers are refused by coturn's default.
  "--denied-peer-ip=10.0.0.0-10.255.255.255",
  "--denied-peer-ip=172.16.0.0-172.31.255.255",
  "--denied-peer-ip=192.168.0.0-192.168.255.255",
  "--denied-peer-ip=100.64.0.0-100.127.255.255",
  "--denied-peer-ip=169.254.0.0-169.254.255.255",
  ...(certified && args.hostname
    ? [
        `--cert=${LETSENCRYPT}/live/${args.hostname}/fullchain.pem`,
        `--pkey=${LETSENCRYPT}/live/${args.hostname}/privkey.pem`,
      ]
    : ["--no-tls"]),
  ...(args.externalIp ? [`--external-ip=${args.externalIp}`] : []),
];

/** The settings a container was made with, as its label carries them. */
const settingsHash = (args: RelayStartArgs, certified: boolean): string =>
  createHash("sha256")
    .update(JSON.stringify(coturnArgs(args, certified)))
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

/** Waits until coturn has bound UDP and TCP 443, or throws with its last lines. */
const waitLive = async (docker: Docker, tls: boolean): Promise<RelayPorts> => {
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
    ports = await boundNow(tls);
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
    RELAY_FAILURES.coturnUnbound(hostname(), missing, LIVE_MS / 1000)
  );
};

/* ------------------------------------------------------------------ */
/* What must hold before anything starts                               */
/* ------------------------------------------------------------------ */

/** The runtime, on a machine where the relay can run, or the sentence that says why not. */
const relayRuntime = async (): Promise<Runtime> => {
  if (platform() !== "linux") {
    throw new RelayFailed(RELAY_FAILURES.notLinux(hostname()));
  }
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

/**
 * A rootless runtime binds a port under 1024 only from
 * `ip_unprivileged_port_start` up (podman rootless.md: "Podman can not create
 * containers that bind to ports < 1024 … `sysctl
 * net.ipv4.ip_unprivileged_port_start=443` allows rootless Podman containers
 * to bind to ports >= 443"): 443 for coturn, and 80 for a certificate issued
 * over HTTP.
 */
export const lowPortsRefusal = async (
  runtime: Pick<Runtime, "rootless">,
  lowest: number
): Promise<RelayFailure | undefined> => {
  if (!runtime.rootless) {
    return;
  }
  if ((await unprivilegedStart()) <= lowest) {
    return;
  }
  return RELAY_FAILURES.lowPort(hostname(), lowest);
};

/**
 * `relay.low-ports`: whether the runtime may bind `lowest` now, read from
 * the kernel on each ask (the hub asks every 2 s while the journey's step
 * stands). No runtime, or not Linux, answers as the start would refuse.
 */
export const relayLowPorts = async (lowest: number): Promise<RelayLowPorts> => {
  const runtime = await relayRuntime();
  if (!runtime.rootless) {
    return { rootless: false, allowed: true, start: null };
  }
  const start = await unprivilegedStart();
  return { rootless: true, allowed: start <= lowest, start };
};

/**
 * The relay's listener held by another process, as its failure; undefined
 * when UDP and TCP 443 are free. The ports coturn opens beside it (444, 5349,
 * 5350) are only reserved: coturn starts without them.
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
  const lowPorts = await lowPortsRefusal(runtime, STREAM_RELAY_PORT);
  if (lowPorts) {
    throw new RelayFailed(lowPorts);
  }
  return runtime;
};

/** The relay's ports while its container runs with these very settings; undefined otherwise. */
const runningAsAsked = async (
  docker: Docker,
  args: RelayStartArgs
): Promise<{ ports: RelayPorts; tls: boolean } | undefined> => {
  const kept = await relayContainer(docker);
  const tls =
    !!args.hostname && kept?.Config.Labels?.[HOSTNAME_LABEL] === args.hostname;
  if (
    !kept?.State.Running ||
    kept.Config.Labels?.[RELAY_LABEL] !== settingsHash(args, tls)
  ) {
    return;
  }
  return { ports: await boundNow(tls), tls };
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
    if (!dns) {
      const lowPorts = await lowPortsRefusal(runtime, RELAY_HTTP_PORT);
      if (lowPorts) {
        throw new RelayFailed(lowPorts);
      }
      await port80Free((held) =>
        RELAY_FAILURES.certificatePort80(name, held)
      );
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
      const { docker } = await readyToStart(args);
      const running = await runningAsAsked(docker, args);
      if (running) {
        return liveFrame(running.ports, running.tls, args.hostname);
      }
      await removeRelayContainer(docker);
      const refused = await portsRefusal();
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
      await createRelay(docker, args, tls);
      const ports = await waitLive(docker, tls);
      console.info(
        `[relay] live at ${args.address}${tls ? ` with TLS for ${args.hostname}` : ""}`
      );
      return liveFrame(ports, tls, args.hostname);
    } catch (error) {
      return failed(error);
    }
  });

/** coturn's container, made and started. */
const createRelay = async (
  docker: Docker,
  args: RelayStartArgs,
  tls: boolean
): Promise<void> => {
  const container = await docker.createContainer({
    name: RELAY_CONTAINER,
    Image: RELAY_IMAGE,
    Cmd: coturnArgs(args, tls),
    Labels: {
      [RELAY_LABEL]: settingsHash(args, tls),
      ...(tls && args.hostname ? { [HOSTNAME_LABEL]: args.hostname } : {}),
    },
    HostConfig: {
      NetworkMode: "host",
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
 * certificate volume, then the ports it asked the router for, so nothing of
 * it stays behind. Stop keeps them; this is Remove relay's, and a relay
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
    await unmapRelayPorts();
    tell({ state: "stopped", ports: NO_PORTS });
    console.info(
      "[relay] removed, its certificate volume and router mappings with it"
    );
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
    const before = await certificateEnd(docker, name);
    if (!dns) {
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
      const ports = await waitLive(docker, true);
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
  if (platform() !== "linux") {
    return;
  }
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
      const ports = await waitLive(docker, !!name);
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
