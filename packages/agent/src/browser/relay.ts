/**
 * The fleet's stream relay on this machine (Projects spec §5.11, build item
 * 5): coturn on the host network, its container `cawco-relay`, run through
 * the machine's container runtime (runtime.ts) with the hub's shared secret.
 * coturn's own README: "Or just use the host network directly (recommended,
 * as Docker performs badly with large port ranges)". With a DNS name, a
 * certbot container issues the name's Let's Encrypt certificate first, kept
 * on the volume `cawco-relay-certs`, and coturn answers TLS on 443 and 5349.
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
import { readdir, readFile, readlink } from "node:fs/promises";
import { hostname, platform } from "node:os";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import type {
  RelayFrame,
  RelayPorts,
  RelayRenewed,
  RelayStartArgs,
} from "@cawco/core/stream-relay";
import {
  RELAY_FAILURES,
  type RelayFailure,
  STREAM_RELAY_PORTS,
} from "@cawco/core/stream-relay";
import type Docker from "dockerode";
import { browserRuntime } from "./browsers";
import { pullImage } from "./image";
import { type Runtime, runtimeInstallCommand } from "./runtime";

/** coturn's immutable alpine tag ("Once built, it's never updated", its docker README). */
export const RELAY_IMAGE = "coturn/coturn:4.18.0-r0-alpine";
/** certbot's newest release on Docker Hub, pinned. */
export const CERTBOT_IMAGE = "certbot/certbot:v5.8.0";
/** The relay's container on the runtime. */
export const RELAY_CONTAINER = "cawco-relay";
/** Where the certificate lives, mounted at `/etc/letsencrypt`. */
export const CERTS_VOLUME = "cawco-relay-certs";
/** The label the relay's container carries: the hash of the settings it was made with. */
const RELAY_LABEL = "dev.cawco.relay";
/** The label naming the DNS name it was made for, when it has one. */
const HOSTNAME_LABEL = "dev.cawco.relay.hostname";

const LETSENCRYPT = "/etc/letsencrypt";
/** The proc file a rootless runtime's low ports depend on (podman rootless.md). */
const UNPRIVILEGED = "/proc/sys/net/ipv4/ip_unprivileged_port_start";
/** The port certbot's standalone challenge answers on. */
const HTTP_PORT = 80;

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
/** A DNS name certbot is given: labels of letters, digits and hyphens. */
const DNS_NAME =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/i;

const NO_PORTS: RelayPorts = {
  udp3478: false,
  tcp3478: false,
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

/** One port held by someone, in words: "TCP 3478 is held by cawco (pid 4242)". */
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

/** Whether each listening port is bound now, by anyone (coturn, once it is up). */
const boundNow = async (tls: boolean): Promise<RelayPorts> => {
  const tcp = await boundSockets("tcp");
  const udp = await boundSockets("udp");
  const has = (list: BoundSocket[], port: number) =>
    list.some((one) => one.port === port);
  return {
    udp3478: has(udp, 3478),
    tcp3478: has(tcp, 3478),
    tcp443: has(tcp, 443),
    tls: tls && has(tcp, 5349),
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

/** `cmd` run to its end in a container of `image` on the host network with the certificate volume: its exit code and what it said. */
const runOnce = async (
  docker: Docker,
  image: string,
  cmd: string[]
): Promise<{ code: number; said: string }> => {
  const container = await docker.createContainer({
    Image: image,
    Cmd: cmd,
    Labels: { [RELAY_LABEL]: "certbot" },
    HostConfig: {
      NetworkMode: "host",
      Mounts: [{ Type: "volume", Source: CERTS_VOLUME, Target: LETSENCRYPT }],
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
      throw new RelayFailed(
        RELAY_FAILURES.certbotSlow(hostname(), CERTBOT_MS / 1000)
      );
    }
    return { code: ended.value.StatusCode, said: await logsOf(container) };
  } finally {
    await container.remove({ force: true }).catch(() => undefined);
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
  const { code, said } = await runOnce(docker, CERTBOT_IMAGE, [
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

/** Port 80 free for certbot's challenge, or the failure `refusal` words, naming who holds it. */
const port80Free = async (
  refusal: (held: string) => RelayFailure
): Promise<void> => {
  const [held] = await heldPorts([{ proto: "tcp", port: HTTP_PORT }]);
  if (held) {
    throw new RelayFailed(refusal(held.said));
  }
};

/** `name`'s certificate issued (or kept, when one stands and is not due), standalone over port 80. */
const issue = async (docker: Docker, name: string): Promise<void> => {
  await port80Free((held) => RELAY_FAILURES.port80(hostname(), held));
  const { code, said } = await runOnce(docker, CERTBOT_IMAGE, [
    "certonly",
    "--standalone",
    "--non-interactive",
    "--agree-tos",
    "--register-unsafely-without-email",
    "--deploy-hook",
    DEPLOY_HOOK,
    "-d",
    name,
  ]);
  if (code !== 0) {
    throw new RelayFailed(
      RELAY_FAILURES.certificate(hostname(), name, certbotWords(said))
    );
  }
};

/** coturn's arguments for `args`, with the certificate's paths when one stands. */
export const coturnArgs = (
  args: RelayStartArgs,
  certified: boolean
): string[] => [
  "-n",
  "--log-file=stdout",
  "--listening-port=3478",
  "--alt-listening-port=443",
  "--tls-listening-port=5349",
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
    : []),
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

/** Waits until coturn has bound UDP and TCP 3478 and TCP 443, or throws with its last lines. */
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
    if (ports.udp3478 && ports.tcp3478 && ports.tcp443 && (!tls || ports.tls)) {
      return ports;
    }
    await Bun.sleep(LIVE_POLL_MS);
  }
  const missing = [
    ports.udp3478 ? null : "UDP 3478",
    ports.tcp3478 ? null : "TCP 3478",
    ports.tcp443 ? null : "TCP 443",
    !tls || ports.tls ? null : "TCP 5349",
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

/**
 * A rootless runtime binds a port under 1024 only from
 * `ip_unprivileged_port_start` up (podman rootless.md: "Podman can not create
 * containers that bind to ports < 1024 … `sysctl
 * net.ipv4.ip_unprivileged_port_start=443` allows rootless Podman containers
 * to bind to ports >= 443"): 443 always, and 80 while a certificate is issued.
 */
export const lowPortsRefusal = async (
  runtime: Pick<Runtime, "rootless">,
  withCertificate: boolean
): Promise<RelayFailure | undefined> => {
  if (!runtime.rootless) {
    return;
  }
  const start = Number((await readFile(UNPRIVILEGED, "utf8")).trim());
  const lowest = withCertificate ? HTTP_PORT : 443;
  if (start <= lowest) {
    return;
  }
  return RELAY_FAILURES.lowPort(hostname(), lowest);
};

/** The relay's listening ports held by another process, as its failure; undefined when every one is free. */
const portsRefusal = async (): Promise<RelayFailure | undefined> => {
  const held = await heldPorts([
    ...STREAM_RELAY_PORTS.udp.map((port) => ({ proto: "udp" as const, port })),
    ...STREAM_RELAY_PORTS.tcp.map((port) => ({ proto: "tcp" as const, port })),
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
/* The three commands                                                  */
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
  if (args.hostname && !DNS_NAME.test(args.hostname)) {
    throw new RelayFailed(RELAY_FAILURES.notDnsName(hostname(), args.hostname));
  }
  const runtime = await relayRuntime();
  const lowPorts = await lowPortsRefusal(runtime, !!args.hostname);
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

/** `name`'s certificate issued over port 80 (certbot pulled first): whether one stands after. */
const certify = async (docker: Docker, name: string): Promise<boolean> => {
  await pullImage(docker, CERTBOT_IMAGE, (progress) =>
    tell({ state: "pulling", ports: NO_PORTS, progress })
  );
  tell({ state: "starting", ports: NO_PORTS });
  await ensureVolume(docker);
  await issue(docker, name);
  return (await certificateEnd(docker, name)) !== undefined;
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
 * Runs the relay with `args` and answers its frame once its ports are bound.
 * A container made with the same settings and running is kept as it is.
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
      const tls = args.hostname ? await certify(docker, args.hostname) : false;
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
 * certificate volume, so nothing of it stays behind. Stop keeps the volume;
 * this is Remove relay's, and a relay moved to another machine's.
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
 * shortens its certificates to 64 and then 45 days.
 */
export const renewRelay = (): Promise<RelayRenewed> =>
  serial(async () => {
    const runtime = await relayRuntime();
    const { docker } = runtime;
    const kept = await relayContainer(docker);
    const name = kept?.Config.Labels?.[HOSTNAME_LABEL];
    if (!(kept && name)) {
      throw new RelayFailed(RELAY_FAILURES.renewNone(hostname()));
    }
    const before = await certificateEnd(docker, name);
    await port80Free((held) =>
      RELAY_FAILURES.renewPort80(hostname(), name, held)
    );
    const { code, said } = await runOnce(docker, CERTBOT_IMAGE, [
      "renew",
      "--non-interactive",
      "--cert-name",
      name,
      "--deploy-hook",
      DEPLOY_HOOK,
    ]);
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
