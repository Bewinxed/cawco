/**
 * The fleet's stream relay on this machine (Projects spec §5.11, build item
 * 5): the agent's own `relay.start` (agent browser/relay.ts) run here, as the
 * daemon runs it for the hub, with a secret this spec makes, and then checked
 * from outside it the way a viewer reaches it. The relay listens on one port,
 * 443: plain UDP and TCP always, TLS on the same listener with a name.
 *
 * - coturn pulled, its container `cawco-relay` live on the host network
 *   where the runtime's is the machine's own (a native engine on Linux), else
 *   its ports published through the runtime's VM forwarder (a Mac's runtime,
 *   Colima or Docker Desktop on Linux) with the forwarder's address let
 *   through; a runtime short of a setting the relay needs (Colima's ssh
 *   forwarder, a VM's rootless Podman) refuses the start with the command
 *   that changes it, and the run stops there;
 * - a STUN binding answered on UDP and TCP 443 (and TLS on 443 with a name)
 *   through the hub's own health check (hub stream-relay.ts `probeRelay`);
 * - a TURN allocation with a credential the hub's `mintCredential` made
 *   succeeds over UDP and TCP 443 (and TLS on 443 with a name), and one whose
 *   username's timestamp has passed is refused 401;
 * - a permission to 10.0.0.5 is refused 403 (`denied-peer-ip`);
 * - with `--hostname`: the certificate issued, and TLS on 443 answering with
 *   the Let's Encrypt chain;
 * - on the host network, the ports coturn binds beside its listener, read
 *   from `ss`, each one in `STREAM_RELAY_PORTS`; without a name nothing
 *   listens on TCP 5349 (published, the machine binds only what is
 *   published);
 * - Stop relay keeps the certificate volume; Remove relay takes the
 *   container and then the volume, so nothing of the relay stays.
 *
 * It runs only where the machine has no relay yet (no `cawco-relay`
 * container, no `cawco-relay-certs` volume): its Remove would delete them.
 *
 * On a rootless runtime whose `ip_unprivileged_port_start` is above the
 * lowest port the relay needs (obelisk: rootless Podman, 1024), the start
 * fails with the sysctl sentence and no container is made; the rest is then
 * run against coturn started by this spec with the relay's own arguments, its
 * listener moved from 443 to a stand-in port free at run time (and the one
 * after it, coturn's alt UDP side), outside the hub's preview ports, and says
 * so on each line. It settles the four checks the port revision left to a
 * run, one line each:
 *
 * 1. TLS on the plain listener: coturn with a certificate and no
 *    `tls-listening-port` answers a `stuns:` binding and a `turns:`
 *    allocation on the stand-in, and plain TCP on that same port. The
 *    certificate is a self-signed one this spec makes with openssl for
 *    `relay.cawco-probe.test`, bind-mounted where coturn's arguments read a
 *    Let's Encrypt one; the name is mapped by connecting to the address with
 *    that name as the TLS server name and the certificate as the only CA, so
 *    no DNS is involved. Where TLS is refused there, coturn is started again
 *    in the revision's other shape (`--listening-port=<stand-in>
 *    --tls-listening-port=<stand-in + 2>`) and the line names which shape
 *    answered.
 * 2. UDP on the listener: a STUN binding and an allocation.
 * 3. `--no-tls`: coturn starts, the listener answers, nothing listens on
 *    TCP 5349, and its log has no "cannot start TLS" warning.
 * 4. The ports coturn binds beside the listener, with and without a
 *    certificate (`ss`, before and after it starts), each in
 *    `STREAM_RELAY_PORTS`, the stand-in read as 443 and the one after it as
 *    444.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket), on the machine named, with the address a viewer reaches
 * it at (its public address; obelisk's LAN address for now):
 *
 *   bun scripts/probe-kit/run.ts browser-relay --machine <name> --address <a> [--hostname <dns name>]
 */
import { randomBytes } from "node:crypto";
import { createSocket } from "node:dgram";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { type AddressInfo, createServer } from "node:net";
import { hostname as machineHostname, tmpdir } from "node:os";
import { join } from "node:path";
import { connect as tlsConnect } from "node:tls";
import { connect, getPublicIP } from "turn-server";
import type { Runtime } from "../../../packages/agent/src/browser/runtime";
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

const PROBE_CONTAINER = "cawco-relay-probe";
/** This spec's own coturn runs, on a rootless Linux engine's host network (`refusedLegs`). */
const HOST = { kind: "host" } as const;
const TURN_MS = 8000;
/** How long this spec's own coturn has to bind its listener. */
const BIND_MS = 10_000;
/** A private peer `denied-peer-ip` must refuse. */
const PRIVATE_PEER = "10.0.0.5";
/** The name the stand-in's self-signed certificate is for. */
const PROBE_NAME = "relay.cawco-probe.test";
/** coturn's default TLS listener, which only a certificate starts. */
const TLS_DEFAULT = 5349;
/** The fix the relay's refusal names: the value set live and kept over a reboot, in one line. */
const SYSCTL =
  /^sudo sh -c 'sysctl -w net\.ipv4\.ip_unprivileged_port_start=(443|80) && echo net\.ipv4\.ip_unprivileged_port_start=\1 > \/etc\/sysctl\.d\/90-cawco-relay\.conf'$/;
/** coturn's words when it starts no TLS listener for want of a certificate. */
const NO_TLS_WARNING = /cannot start TLS/i;

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const bracketed = (address: string): string =>
  address.includes(":") ? `[${address}]` : address;

/** TLS to a listener: the name its certificate is checked for, and the CA it is checked against (the system's when absent). */
interface TlsTo {
  ca?: string;
  servername: string;
}

/** One TURN exchange: allocate with `user`, then (when asked) a permission to `peer`; what each answered. */
export const turn = (
  url: string,
  user: { username: string; credential: string },
  peer?: string,
  tls?: TlsTo
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
          connected.createPermission({ ip: peer, port: 5000 });
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
        connected.allocate();
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
 * Where this spec's own coturn listens instead of 443, where 443 is refused:
 * a port free on TCP and UDP at run time with the two after it free too
 * (coturn's alt UDP side, and the other shape's TLS port), all outside the
 * hub's preview ports and the relay's own; `tries` more ports are asked for
 * when one is not.
 */
export const freeStandIn = async (tries = 20): Promise<number | undefined> => {
  if (tries === 0) {
    return;
  }
  const { PREVIEW_PORTS } = await import("../../../packages/hub/src/config");
  const port = await bindPort("tcp");
  if (port === undefined) {
    return freeStandIn(tries - 1);
  }
  const run = [port, port + 1, port + 2];
  const outside = run.every(
    (one) =>
      !isStreamRelayPort(one) &&
      (one < PREVIEW_PORTS.first || one > PREVIEW_PORTS.last)
  );
  if (!outside) {
    return freeStandIn(tries - 1);
  }
  for (const one of run) {
    // biome-ignore lint/performance/noAwaitInLoops: each port asked in turn, the first refusal ends it.
    if ((await bindPort("udp", one)) !== one) {
      return freeStandIn(tries - 1);
    }
    if (one !== port && (await bindPort("tcp", one)) !== one) {
      return freeStandIn(tries - 1);
    }
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
/* What listens: ss before and after coturn starts                      */
/* ------------------------------------------------------------------ */

/** One listening socket as `ss` shows it. */
interface Listening {
  address: string;
  port: number;
  proto: "tcp" | "udp";
}

const SS_LINE = /\s+/;

/** Every listening TCP socket and bound UDP socket on the host, from `ss -Hlnt` / `ss -Hlnu`. */
const listening = async (): Promise<Listening[]> => {
  const read = async (proto: "tcp" | "udp"): Promise<Listening[]> => {
    const child = Bun.spawn(["ss", proto === "tcp" ? "-Hlnt" : "-Hlnu"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const text = await new Response(child.stdout).text();
    await child.exited;
    return text.split("\n").flatMap((line): Listening[] => {
      // State Recv-Q Send-Q Local-Address:Port Peer-Address:Port
      const [, , , local] = line.trim().split(SS_LINE);
      if (!local) {
        return [];
      }
      const at = local.lastIndexOf(":");
      const port = Number(local.slice(at + 1));
      return Number.isInteger(port)
        ? [{ proto, address: local.slice(0, at), port }]
        : [];
    });
  };
  return [...(await read("tcp")), ...(await read("udp"))];
};

const key = (one: Listening): string =>
  `${one.proto}:${one.address}:${one.port}`;

/** What `after` holds that `before` did not. */
const added = (before: Listening[], after: Listening[]): Listening[] => {
  const was = new Set(before.map(key));
  return after.filter((one) => !was.has(key(one)));
};

const LOOPBACK = /^(?:127\.|\[?::1\]?$|\[::ffff:127\.)/;

/** Whether `port` is bound on UDP and listening on TCP now. */
const bothUp = async (port: number): Promise<boolean> => {
  const now = await listening();
  return (["udp", "tcp"] as const).every((proto) =>
    now.some((one) => one.proto === proto && one.port === port)
  );
};

/**
 * The ports coturn opened, in the relay's own numbering (the stand-in read as
 * 443, the one after it as 444), each against `STREAM_RELAY_PORTS`; loopback
 * ones (coturn's CLI) apart, as nothing outside reaches them.
 */
const portsOpened = (
  opened: Listening[],
  standIn: number
): {
  outside: { proto: "tcp" | "udp"; port: number; reserved: boolean }[];
  loopback: string[];
} => {
  const asRelay = (port: number): number => {
    if (port === standIn) {
      return STREAM_RELAY_PORT;
    }
    return port === standIn + 1 ? STREAM_RELAY_PORT + 1 : port;
  };
  const outside = new Map<
    string,
    { proto: "tcp" | "udp"; port: number; reserved: boolean }
  >();
  const loopback: string[] = [];
  for (const one of opened) {
    if (LOOPBACK.test(one.address)) {
      loopback.push(`${one.proto} ${one.address}:${one.port}`);
      continue;
    }
    const port = asRelay(one.port);
    outside.set(`${one.proto}:${port}`, {
      proto: one.proto,
      port,
      reserved: (STREAM_RELAY_PORTS[one.proto] as readonly number[]).includes(
        port
      ),
    });
  }
  return { outside: [...outside.values()], loopback };
};

/* ------------------------------------------------------------------ */
/* The checks against a listener                                        */
/* ------------------------------------------------------------------ */

/** A listener to check: where it is reached, and how TLS on it is reached, when a certificate stands. */
interface Listener {
  /** The address plain URLs name. */
  host: string;
  port: number;
  tls?: TlsTo & { host: string };
  /** Said after every line: why the port is not 443, where it is not. */
  where: string;
}

/** Check 2 and the credentials: UDP binding and allocation (permission to a private peer refused), an expired username refused. */
const udpChecks = async (
  kit: Kit,
  args: RelayStartArgs,
  on: Listener
): Promise<void> => {
  const { mintCredential } =
    await import("../../../packages/hub/src/stream-relay");
  const relay = { secret: args.secret, address: args.address, hostname: null };
  const fresh = mintCredential(relay, "probe:browser-relay", 10 * 60_000);
  const lapsed = mintCredential(
    relay,
    "probe:browser-relay",
    10 * 60_000,
    Date.now() - 2 * 60 * 60_000
  );
  const url = `turn:${on.host}:${on.port}?transport=udp`;
  const stun = await binding(`stun:${on.host}:${on.port}?transport=udp`);
  const udp = await turn(url, fresh, PRIVATE_PEER);
  const expired = await turn(url, lapsed);
  kit.check(
    `check 2 · UDP on the listener: STUN binding on udp ${on.port} ${stun}; allocation with a minted credential relayed ${udp.relayed ?? `nothing (${udp.error ?? udp.allocateCode})`}${on.where}`,
    stun.startsWith("up") && udp.allocated,
    JSON.stringify({ stun, udp })
  );
  kit.check(
    `an expired username (${lapsed.username.split(":")[0]}, in the past) refused: ${expired.allocateCode}${on.where}`,
    expired.allocateCode === 401,
    JSON.stringify(expired)
  );
  kit.check(
    `allocation permission to ${PRIVATE_PEER} refused (denied-peer-ip): ${udp.permissionCode}${on.where}`,
    udp.permissionCode === 403,
    JSON.stringify(udp)
  );
};

/** Plain TCP on the listener, and with a certificate TLS on it too (check 1): a binding and an allocation each. */
const streamChecks = async (
  kit: Kit,
  args: RelayStartArgs,
  on: Listener
): Promise<boolean> => {
  const { mintCredential } =
    await import("../../../packages/hub/src/stream-relay");
  const fresh = mintCredential(
    { secret: args.secret, address: args.address, hostname: null },
    "probe:browser-relay",
    10 * 60_000
  );
  const plainStun = await binding(`stun:${on.host}:${on.port}?transport=tcp`);
  const plain = await turn(`turn:${on.host}:${on.port}?transport=tcp`, fresh);
  const plainUp = plainStun.startsWith("up") && plain.allocated;
  if (!on.tls) {
    kit.check(
      `plain TCP on the listener: STUN binding on tcp ${on.port} ${plainStun}; allocation relayed ${plain.relayed ?? `nothing (${plain.error ?? plain.allocateCode})`}${on.where}`,
      plainUp,
      JSON.stringify({ plainStun, plain })
    );
    return plainUp;
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
  const tlsUp =
    handshake.startsWith("verified") &&
    tlsStun.startsWith("up") &&
    secure.allocated;
  kit.check(
    `check 1 · TLS on the plain listener: handshake on tcp ${on.port} for ${tls.servername} ${handshake}; stuns binding ${tlsStun}; turns allocation relayed ${secure.relayed ?? `nothing (${secure.error ?? secure.allocateCode})`}; plain TCP on the same port: binding ${plainStun}, allocation relayed ${plain.relayed ?? `nothing (${plain.error ?? plain.allocateCode})`}${on.where}`,
    tlsUp && plainUp,
    JSON.stringify({ handshake, tlsStun, secure, plainStun, plain })
  );
  return tlsUp;
};

/* ------------------------------------------------------------------ */
/* The relay's own start, where 443 may be bound                        */
/* ------------------------------------------------------------------ */

/** The relay's own start, its ports through the hub's health check, its TURN, TLS with a name, and what it binds. */
const relayLegs = async (
  kit: Kit,
  relay: Relay,
  runtime: Runtime,
  args: RelayStartArgs
): Promise<void> => {
  // What coturn binds is read with `ss` on the host network alone: published,
  // its sockets are the VM's, and the machine binds only what is published.
  const before = runtime.ownNetwork ? await listening() : [];
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
  const opened = runtime.ownNetwork ? added(before, await listening()) : [];
  const inspected = await runtime.docker
    .getContainer(relay.RELAY_CONTAINER)
    .inspect();
  const bindings = inspected.HostConfig.PortBindings ?? {};
  const [first, last] = args.relayRange;
  const range = Array.from(
    { length: last - first + 1 },
    (_, at) => `${first + at}/udp`
  );
  const shape = runtime.ownNetwork
    ? inspected.HostConfig.NetworkMode === "host"
    : [`${STREAM_RELAY_PORT}/udp`, `${STREAM_RELAY_PORT}/tcp`, ...range].every(
        (port) => bindings[port]?.[0]?.HostIp === "0.0.0.0"
      ) && inspected.Config.Cmd.includes("--server-relay");
  kit.check(
    `${relay.RELAY_IMAGE} pulled; container ${relay.RELAY_CONTAINER} ${frame.state}, ${runtime.ownNetwork ? `network ${inspected.HostConfig.NetworkMode}` : `published through ${runtime.endpoint}: ${Object.keys(bindings).length} ports on every address (UDP and TCP ${STREAM_RELAY_PORT}, UDP ${first}–${last}), ${inspected.Config.Cmd.filter((arg) => arg.startsWith("--external-ip") || arg === "--server-relay" || arg.startsWith("--allowed-peer-ip")).join(" ")}`}`,
    frame.state === "live" &&
      inspected.State.Running &&
      shape &&
      inspected.Config.Image === relay.RELAY_IMAGE,
    JSON.stringify(frame)
  );
  const { probeRelay } = await import("../../../packages/hub/src/stream-relay");
  const name = args.hostname ?? null;
  const health = await probeRelay(args.address, name);
  kit.check(
    `STUN binding answered on ${health.map((port) => `${port.port} ${port.up ? "up" : `down (${port.error})`}`).join(", ")} (the hub's health check)`,
    health.length === (name ? 3 : 2) && health.every((port) => port.up),
    JSON.stringify(health)
  );
  const on: Listener = {
    host: bracketed(args.address),
    port: STREAM_RELAY_PORT,
    where: "",
    ...(name ? { tls: { host: name, servername: name } } : {}),
  };
  await udpChecks(kit, args, on);
  await streamChecks(kit, args, on);
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
  if (runtime.ownNetwork) {
    bindsCheck(
      kit,
      [{ shape: name ? "with a certificate" : "with --no-tls", opened }],
      STREAM_RELAY_PORT,
      ""
    );
  }
};

/** Check 4: what coturn opened beside its listener in each shape, every outside port one `STREAM_RELAY_PORTS` reserves; check 3's 5349 with it. */
const bindsCheck = (
  kit: Kit,
  runs: { shape: string; opened: Listening[] }[],
  standIn: number,
  where: string
): void => {
  const read = runs.map((run) => ({
    shape: run.shape,
    ...portsOpened(run.opened, standIn),
  }));
  const seen = new Set(
    read.flatMap((run) => run.outside.map((one) => `${one.proto}:${one.port}`))
  );
  const unseen = (["udp", "tcp"] as const).flatMap((proto) =>
    STREAM_RELAY_PORTS[proto]
      .filter((port) => !seen.has(`${proto}:${port}`))
      .map((port) => `${proto} ${port}`)
  );
  kit.check(
    `check 4 · ports coturn binds (ss): ${read
      .map(
        (run) =>
          `${run.shape}: ${run.outside.map((one) => `${one.proto} ${one.port}${one.reserved ? "" : " (NOT reserved)"}`).join(", ") || "none"}${run.loopback.length > 0 ? `, loopback ${run.loopback.join(", ")}` : ""}`
      )
      .join(
        "; "
      )}; reserved (STREAM_RELAY_PORTS) udp ${STREAM_RELAY_PORTS.udp.join(", ")}, tcp ${STREAM_RELAY_PORTS.tcp.join(", ")}${unseen.length > 0 ? `, listed but not seen: ${unseen.join(", ")}` : ""}${where}`,
    read.every((run) => run.outside.every((one) => one.reserved)),
    JSON.stringify(read)
  );
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

/** What one container said, its stdout and stderr (the stream's frame headers left in; only searched). */
const saidBy = async (container: Container): Promise<string> =>
  (
    (await container.logs({
      stdout: true,
      stderr: true,
      follow: false,
    })) as unknown as Buffer
  ).toString("utf8");

/** This spec's coturn with `cmd`, and the certificate folder at /etc/letsencrypt when given; its listener on `port` bound, or why not. */
const startProbe = async (
  docker: Docker,
  image: string,
  cmd: string[],
  port: number,
  certs?: string
): Promise<{
  container: Container;
  opened: Listening[];
  bound: boolean;
}> => {
  await docker
    .getContainer(PROBE_CONTAINER)
    .remove({ force: true })
    .catch(() => undefined);
  const before = await listening();
  const container = await docker.createContainer({
    name: PROBE_CONTAINER,
    Image: image,
    Cmd: cmd,
    HostConfig: {
      NetworkMode: "host",
      ...(certs ? { Binds: [`${certs}:/etc/letsencrypt:ro,z`] } : {}),
    },
  });
  await container.start();
  const until = Date.now() + BIND_MS;
  let bound = false;
  while (!bound && Date.now() < until) {
    // biome-ignore lint/performance/noAwaitInLoops: polling a server that is starting.
    bound = await bothUp(port);
    if (!bound) {
      await Bun.sleep(250);
    }
  }
  return { container, bound, opened: added(before, await listening()) };
};

/** `arg` with the relay's 443 moved to `port`. */
export const onPort =
  (port: number) =>
  (arg: string): string =>
    arg === `--listening-port=${STREAM_RELAY_PORT}`
      ? `--listening-port=${port}`
      : arg;

/**
 * Where the runtime may not bind 443: the relay's start refused with the
 * sysctl sentence before any container, then coturn on the relay's own
 * arguments with its listener on a stand-in {@link freeStandIn} picks: once
 * with a certificate (checks 1, 2, 4) and once with `--no-tls` (checks 3, 4).
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
      `a stand-in for 443 free on UDP and TCP with the two ports after it, outside the hub's preview ports and the relay's: ${standIn ?? "none found"}`,
      standIn !== undefined
    ) ||
    standIn === undefined
  ) {
    return;
  }
  const where = ` (443 refused here: coturn started by this spec with the relay's arguments, its listener on ${standIn})`;
  const held = await relay.heldPorts(
    [standIn, standIn + 1, standIn + 2, TLS_DEFAULT, TLS_DEFAULT + 1].flatMap(
      (port) => [
        { proto: "udp" as const, port },
        { proto: "tcp" as const, port },
      ]
    )
  );
  if (
    !kit.check(
      `UDP and TCP ${standIn}–${standIn + 2}, ${TLS_DEFAULT} and ${TLS_DEFAULT + 1} free for this spec's coturn: ${held.map((one) => one.said).join("; ") || "all free"}`,
      held.length === 0
    )
  ) {
    return;
  }
  const { docker } = runtime;
  const { pullImage } =
    await import("../../../packages/agent/src/browser/image");
  await pullImage(docker, relay.RELAY_IMAGE, (step) =>
    kit.note(`${relay.RELAY_IMAGE}: ${step.done}/${step.total} layers`)
  );
  const host = bracketed(args.address);
  const { dir, cert } = await selfSigned();
  const runs: { shape: string; opened: Listening[] }[] = [];
  try {
    // With a name: the relay's own arguments with a certificate standing.
    const named = { ...args, hostname: PROBE_NAME };
    const withCert = await startProbe(
      docker,
      relay.RELAY_IMAGE,
      relay.coturnArgs(named, true, HOST).map(onPort(standIn)),
      standIn,
      dir
    );
    let tlsOnPlain = false;
    try {
      kit.check(
        `coturn with a certificate bound udp and tcp ${standIn} within ${BIND_MS / 1000} s${where}`,
        withCert.bound,
        (await saidBy(withCert.container)).slice(-2000)
      );
      runs.push({ shape: "with a certificate", opened: withCert.opened });
      const on: Listener = {
        host,
        port: standIn,
        where,
        tls: { host, servername: PROBE_NAME, ca: cert },
      };
      tlsOnPlain = await streamChecks(kit, args, on);
      await udpChecks(kit, args, on);
    } finally {
      await withCert.container.remove({ force: true }).catch(() => undefined);
    }
    if (tlsOnPlain) {
      kit.note(
        "branch: one listener, TLS on the plain port (--listening-port=443 with --cert/--pkey), as shipped"
      );
    } else {
      await otherShape(kit, relay, docker, named, standIn, dir, cert, where);
    }
    // Without a name: `--no-tls`.
    const plain = await startProbe(
      docker,
      relay.RELAY_IMAGE,
      relay.coturnArgs(args, false, HOST).map(onPort(standIn)),
      standIn
    );
    try {
      const log = await saidBy(plain.container);
      const running = (await plain.container.inspect()).State.Running === true;
      const udp = await binding(`stun:${host}:${standIn}?transport=udp`);
      const tcp = await binding(`stun:${host}:${standIn}?transport=tcp`);
      const now = await listening();
      const on5349 = now.filter(
        (one) => one.proto === "tcp" && one.port === TLS_DEFAULT
      );
      const warned = NO_TLS_WARNING.test(log);
      kit.check(
        `check 3 · --no-tls: coturn ${running ? "running" : "not running"}, udp ${standIn} ${udp}, tcp ${standIn} ${tcp}, TCP ${TLS_DEFAULT} ${on5349.length === 0 ? "free" : `held (${on5349.map(key).join(", ")})`}, ${warned ? "a" : "no"} "cannot start TLS" warning in its log${where}`,
        running &&
          plain.bound &&
          udp.startsWith("up") &&
          tcp.startsWith("up") &&
          on5349.length === 0 &&
          !warned,
        log.slice(-2000)
      );
      runs.push({ shape: "with --no-tls", opened: plain.opened });
    } finally {
      await plain.container.remove({ force: true }).catch(() => undefined);
    }
    bindsCheck(kit, runs, standIn, where);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

/**
 * The revision's other shape for a name, run only where TLS was refused on
 * the plain listener: plain on its own port, TLS on another
 * (`--listening-port=<stand-in> --tls-listening-port=<stand-in + 2>`, the
 * stand-ins for 3478 and 443). Its line names which shape answered.
 */
const otherShape = async (
  kit: Kit,
  relay: Relay,
  docker: Docker,
  named: RelayStartArgs,
  standIn: number,
  dir: string,
  cert: string,
  where: string
): Promise<void> => {
  const tlsPort = standIn + 2;
  const run = await startProbe(
    docker,
    relay.RELAY_IMAGE,
    [
      ...relay.coturnArgs(named, true, HOST).map(onPort(standIn)),
      `--tls-listening-port=${tlsPort}`,
    ],
    standIn,
    dir
  );
  try {
    const host = bracketed(named.address);
    const tls: TlsTo = { servername: PROBE_NAME, ca: cert };
    const handshake = await issuerOn(host, tlsPort, tls);
    const stun = await binding(`stuns:${host}:${tlsPort}?transport=tcp`, tls);
    const answered = handshake.startsWith("verified") && stun.startsWith("up");
    kit.note(
      `branch: ${answered ? "TLS on its own port: --listening-port=3478 --tls-listening-port=443 for a name (the revision's other shape answered" : "neither shape answered TLS (the other shape too was refused"}: handshake on tcp ${tlsPort} ${handshake}, stuns binding ${stun})${where}`
    );
  } finally {
    await run.container.remove({ force: true }).catch(() => undefined);
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
    `runtime ${runtime.kind} ${runtime.version} (API ${runtime.api}${runtime.rootless ? ", rootless" : ""}${runtime.ownNetwork ? "" : ", in a VM: the relay published"}) at ${runtime.endpoint}`
  );
  const args: RelayStartArgs = {
    secret: randomBytes(32).toString("base64url"),
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
    await runtime.docker
      .getContainer(PROBE_CONTAINER)
      .remove({ force: true })
      .catch(() => undefined);
  }
};

const spec: Spec = {
  name: "browser-relay",
  run: relaySpec,
};

export default spec;
