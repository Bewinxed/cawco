/**
 * The fleet's stream relay on this machine (Projects spec §5.11, build item
 * 5): the agent's own `relay.start` (agent browser/relay.ts) run here, as the
 * daemon runs it for the hub, with a secret this spec makes, and then checked
 * from outside it the way a viewer reaches it:
 *
 * - coturn pulled, its container `cawco-relay` live on the host network;
 * - a STUN binding answered on UDP 3478, TCP 3478 and TCP 443, through the
 *   hub's own health check (hub stream-relay.ts `probeRelay`);
 * - a TURN allocation with a credential the hub's `mintCredential` made
 *   succeeds, over UDP 3478 and over TCP 443 (coturn's second plain port,
 *   check C10), and one whose username's timestamp has passed is refused 401;
 * - a permission to 10.0.0.5 is refused 403 (`denied-peer-ip`);
 * - with `--hostname`: the certificate issued, and TLS on 443 and 5349
 *   answering with the Let's Encrypt chain;
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
 * second plain port moved from 443 to 3479, and says so on each line.
 *
 * Run on the host, outside every workspace boundary (a boundary hides the
 * runtime's socket), on the machine named, with the address a viewer reaches
 * it at (its public address; obelisk's LAN address for now):
 *
 *   bun scripts/probe-kit/run.ts browser-relay --machine <name> --address <a> [--hostname <dns name>]
 */
import { randomBytes } from "node:crypto";
import { hostname as machineHostname } from "node:os";
import { connect as tlsConnect } from "node:tls";
import { connect, getPublicIP } from "turn-server";
import type { Runtime } from "../../../packages/agent/src/browser/runtime";
import type {
  RelayFailure,
  RelayStartArgs,
} from "../../../packages/core/src/stream-relay";
import { STREAM_RELAY_PORTS } from "../../../packages/core/src/stream-relay";
import type { Kit, Spec } from "../kit";

type Relay = typeof import("../../../packages/agent/src/browser/relay");

/** Where this spec's own coturn listens instead of 443, where 443 is refused. */
const MOVED_ALT = 3479;
const PROBE_CONTAINER = "cawco-relay-probe";
const TURN_MS = 8000;
/** A private peer `denied-peer-ip` must refuse. */
const PRIVATE_PEER = "10.0.0.5";
/** The fix the relay's refusal names. */
const SYSCTL =
  /^sudo sysctl -w net\.ipv4\.ip_unprivileged_port_start=(?:443|80)$/;

const flag = (name: string): string | undefined => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};

const said = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** One TURN exchange: allocate with `user`, then (when asked) a permission to `peer`; what each answered. */
const turn = (
  url: string,
  user: { username: string; credential: string },
  peer?: string
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

/** One STUN binding over `url`: answered, or why not. */
const binding = (url: string): Promise<string> =>
  new Promise((resolve) => {
    getPublicIP(url, { timeout: 3000 }, (error, address) =>
      resolve(
        error
          ? `down (${error.message})`
          : `up (${address?.ip}:${address?.port})`
      )
    );
  });

/** The issuer a TLS handshake on `port` shows, the name checked against the certificate. */
const issuerOn = (name: string, port: number): Promise<string> =>
  new Promise((resolve) => {
    const socket = tlsConnect({ host: name, port, servername: name }, () => {
      const issuer = socket.getPeerCertificate().issuer as
        { O?: string } | undefined;
      socket.end();
      resolve(
        `${socket.authorized ? "verified" : "unverified"} by ${issuer?.O ?? "nobody"}`
      );
    });
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve("no handshake within 5 s");
    });
    socket.on("error", (error) => resolve(`refused (${error.message})`));
  });

/** The TURN checks against a relay listening on `address`, its second plain port `alt`. */
const turnChecks = async (
  kit: Kit,
  args: RelayStartArgs,
  alt: number,
  where: string
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
  const host = args.address.includes(":") ? `[${args.address}]` : args.address;
  const udp = await turn(
    `turn:${host}:3478?transport=udp`,
    fresh,
    PRIVATE_PEER
  );
  const tcp = await turn(`turn:${host}:${alt}?transport=tcp`, fresh);
  const expired = await turn(`turn:${host}:3478?transport=udp`, lapsed);
  kit.check(
    `TURN allocation with a minted credential succeeds (udp 3478 relayed ${udp.relayed}, tcp ${alt} relayed ${tcp.relayed}); with an expired username (${lapsed.username.split(":")[0]}, in the past) 401${where}`,
    udp.allocated && tcp.allocated && expired.allocateCode === 401,
    JSON.stringify({ udp, tcp, expired })
  );
  kit.check(
    `allocation permission to ${PRIVATE_PEER} refused (denied-peer-ip): ${udp.permissionCode}${where}`,
    udp.permissionCode === 403,
    JSON.stringify(udp)
  );
};

/** The relay's own start, its STUN ports through the hub's health check, its TURN, and TLS with a name. */
const relayLegs = async (
  kit: Kit,
  relay: Relay,
  runtime: Runtime,
  args: RelayStartArgs
): Promise<void> => {
  const frame = await relay.startRelay(args);
  const inspected = await runtime.docker
    .getContainer(relay.RELAY_CONTAINER)
    .inspect();
  kit.check(
    `${relay.RELAY_IMAGE} pulled; container ${relay.RELAY_CONTAINER} ${frame.state}, network ${inspected.HostConfig.NetworkMode}`,
    frame.state === "live" &&
      inspected.State.Running &&
      inspected.HostConfig.NetworkMode === "host" &&
      inspected.Config.Image === relay.RELAY_IMAGE,
    JSON.stringify(frame)
  );
  const { probeRelay } = await import("../../../packages/hub/src/stream-relay");
  const health = await probeRelay(args.address, null);
  kit.check(
    `STUN binding answered on ${health.map((port) => `${port.port} ${port.up ? "up" : `down (${port.error})`}`).join(", ")} (the hub's health check)`,
    health.length === 3 && health.every((port) => port.up),
    JSON.stringify(health)
  );
  await turnChecks(kit, args, 443, "");
  if (args.hostname) {
    const on443 = await issuerOn(args.hostname, 443);
    const on5349 = await issuerOn(args.hostname, 5349);
    kit.check(
      `with --hostname ${args.hostname}: certificate issued, ${frame.ports.tls ? "tls stands" : "no tls"}; turns:${args.hostname}:443 ${on443}; :5349 ${on5349}`,
      frame.ports.tls &&
        on443.startsWith("verified by Let's Encrypt") &&
        on5349.startsWith("verified by Let's Encrypt"),
      JSON.stringify(frame.ports)
    );
  }
};

/**
 * Where the runtime may not bind 443: the relay's start refused with the
 * sysctl sentence before any container, then coturn on the relay's own
 * arguments with its second plain port on {@link MOVED_ALT}.
 */
const refusedLegs = async (
  kit: Kit,
  relay: Relay,
  runtime: Runtime,
  args: RelayStartArgs,
  refusal: RelayFailure
): Promise<void> => {
  const start = await (
    await import("node:fs/promises")
  ).readFile("/proc/sys/net/ipv4/ip_unprivileged_port_start", "utf8");
  const thrown = await relay.startRelay(args).then(
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
    `rootless with ip_unprivileged_port_start=${start.trim()}: failed with the sysctl sentence, its command beside it, no container started ("${thrown.said}"; command "${thrown.command}")`,
    thrown.said === refusal.why &&
      thrown.command === refusal.command &&
      SYSCTL.test(thrown.command ?? "") &&
      !made,
    `container ${relay.RELAY_CONTAINER} ${made ? "exists" : "absent"}`
  );
  const where = ` (443 refused here: coturn started by this spec with the relay's arguments, its second plain port on ${MOVED_ALT})`;
  const held = await relay.heldPorts([
    { proto: "udp", port: 3478 },
    { proto: "tcp", port: 3478 },
    { proto: "udp", port: MOVED_ALT },
    { proto: "tcp", port: MOVED_ALT },
  ]);
  if (
    !kit.check(
      `UDP and TCP 3478 and ${MOVED_ALT} free for this spec's coturn: ${held.map((one) => one.said).join("; ") || "all free"}`,
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
  await docker
    .getContainer(PROBE_CONTAINER)
    .remove({ force: true })
    .catch(() => undefined);
  const cmd = relay
    .coturnArgs(args, false)
    .map((arg) =>
      arg === "--alt-listening-port=443"
        ? `--alt-listening-port=${MOVED_ALT}`
        : arg
    );
  const container = await docker.createContainer({
    name: PROBE_CONTAINER,
    Image: relay.RELAY_IMAGE,
    Cmd: cmd,
    HostConfig: { NetworkMode: "host" },
  });
  try {
    await container.start();
    await Bun.sleep(1500);
    const host = args.address.includes(":")
      ? `[${args.address}]`
      : args.address;
    const answers = {
      "udp 3478": await binding(`stun:${host}:3478?transport=udp`),
      "tcp 3478": await binding(`stun:${host}:3478?transport=tcp`),
      [`tcp ${MOVED_ALT}`]: await binding(
        `stun:${host}:${MOVED_ALT}?transport=tcp`
      ),
    };
    kit.check(
      `STUN binding answered on ${Object.entries(answers)
        .map(([port, answer]) => `${port} ${answer}`)
        .join(", ")}${where}`,
      Object.values(answers).every((answer) => answer.startsWith("up")),
      JSON.stringify(answers)
    );
    await turnChecks(kit, args, MOVED_ALT, where);
  } finally {
    await container.remove({ force: true }).catch(() => undefined);
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

const run = async (kit: Kit): Promise<void> => {
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
    `runtime ${runtime.kind} ${runtime.version} (API ${runtime.api}${runtime.rootless ? ", rootless" : ""}) at ${runtime.endpoint}`
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
    const refusal = await relay.lowPortsRefusal(runtime, !!name);
    if (refusal) {
      await refusedLegs(kit, relay, runtime, args, refusal);
    } else {
      await relayLegs(kit, relay, runtime, args);
      certified = !!name;
    }
    await removeLegs(kit, relay, runtime, certified);
  } finally {
    await relay.removeRelay().catch(() => undefined);
  }
};

const spec: Spec = {
  name: "browser-relay",
  run,
};

export default spec;
