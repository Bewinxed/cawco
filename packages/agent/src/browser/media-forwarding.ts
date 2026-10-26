/**
 * What the machine's container runtime forwards from the host to a
 * container's published port: UDP and TCP, TCP alone, or nothing. That
 * decides what a browser's media port is published and advertised for.
 *
 * Known before a container runs from Colima's settings: its VM forwards what
 * its port forwarder carries (colima.yaml: "ssh is more stable but supports
 * only TCP. grpc supports both TCP and UDP, but is experimental.",
 * "Default: ssh"). Every other runtime is taken to forward both until a
 * container's media port is measured: after each start, what actually
 * reaches it (see {@link measureMedia}). A measurement short of what the
 * container was published for is kept per runtime endpoint
 * (`<data>/browsers/media/<endpoint hash>.json`) for as long as the
 * endpoint's socket is the same one, so a restarted runtime, which may
 * forward differently, is measured afresh.
 *
 * Read fresh where it is used (each container start, each capability probe),
 * never kept on the runtime: `colima restart` changes it under a runtime
 * already found. Colima's facts below are from its source, abiosoft/colima.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, realpath, stat } from "node:fs/promises";
import { connect } from "node:net";
import { homedir, networkInterfaces, platform } from "node:os";
import { basename, dirname, join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import type { MediaPath } from "@cawco/core/capabilities";
import { reachableLinks } from "@cawco/core/reachable-links";
import { hostEnvironment } from "@cawco/core/session-env";
import {
  isDamagedRecord,
  readRecord,
  writeStateFile,
} from "@cawco/core/state-file";
import { parse } from "yaml";
import type { Runtime } from "./runtime";
import { browsersDir } from "./state";
import { MediaMeasurementSchema } from "../stored-shapes";

/** What the runtime forwards to a browser's media port, and when that is short of both, what to tell the person. */
export interface MediaForwarding {
  /** What the browser streams over instead of UDP and TCP, and how to get them: shown to the person. Absent for `udp+tcp`. */
  advice?: string;
  /** The one terminal line that makes the runtime forward UDP and TCP, where its settings say which (Colima's). */
  command?: string;
  media: MediaPath;
  /** The runtime by name, as the person knows it, where its settings were read (`Colima`). */
  runtime?: string;
}

/** A measurement kept for a runtime endpoint. */
interface MediaMeasurement {
  /** When it was measured (ms epoch). */
  at: number;
  /** The runtime endpoint it was measured through. */
  endpoint: string;
  media: MediaPath;
  /** The endpoint's socket it was measured on: `<dev>:<ino>:<ctime ms>`. */
  socket: string;
}

const RANK: Record<MediaPath, number> = { none: 0, tcp: 1, "udp+tcp": 2 };

/** Whether `a` carries less than `b`. */
export const carriesLess = (a: MediaPath, b: MediaPath): boolean =>
  RANK[a] < RANK[b];

/** The protocols a media port is published for. */
export const mediaProtocols = (media: MediaPath): ("udp" | "tcp")[] => {
  switch (media) {
    case "udp+tcp":
      return ["udp", "tcp"];
    case "tcp":
      return ["tcp"];
    case "none":
      return [];
    default: {
      const unhandled: never = media;
      throw new Error(`unhandled media: ${String(unhandled)}`);
    }
  }
};

/**
 * Colima's home, found as Colima finds it (config/files.go `configBaseDir`):
 * `$COLIMA_HOME` when it exists, then `~/.colima` when it exists, then
 * `$XDG_CONFIG_HOME/colima` when that is set, then `~/.config/colima` when it
 * exists, then `~/.colima` on a Mac and `~/.config/colima` elsewhere.
 */
export const colimaHome = (): string => {
  const home = homedir();
  const explicit = process.env.COLIMA_HOME;
  const dotColima = join(home, ".colima");
  const xdg = process.env.XDG_CONFIG_HOME;
  const xdgColima = join(xdg || join(home, ".config"), "colima");
  if (explicit && existsSync(explicit)) {
    return explicit;
  }
  if (existsSync(dotColima)) {
    return dotColima;
  }
  if (xdg || existsSync(xdgColima)) {
    return xdgColima;
  }
  return platform() === "darwin" ? dotColima : xdgColima;
};

/** A Colima profile an Engine API socket belongs to. */
interface ColimaProfile {
  home: string;
  /** The profile's short name: `default`, or what `--profile` named. */
  name: string;
}

/**
 * The Colima profile whose Docker socket `socket` is, if any: its real path
 * is `<home>/<profile>/docker.sock` (docker.HostSocketFile), or the default
 * profile's `<home>/docker.sock` (LegacyDefaultHostSocketFile, forwarded "for
 * backward compatibility"). A home is Colima's when it is the one this
 * machine's Colima uses, or it holds Colima's `_lima` (a daemon started
 * without the shell's `COLIMA_HOME` still knows the socket it names).
 */
export const colimaProfileOf = async (
  socket: string
): Promise<ColimaProfile | undefined> => {
  // A socket that went between the ping and this read is judged by its name.
  const real = await realpath(socket).catch(() => socket);
  if (basename(real) !== "docker.sock") {
    return;
  }
  const machines = colimaHome();
  const isHome = (dir: string): boolean =>
    dir === machines || existsSync(join(dir, "_lima"));
  const profileDir = dirname(real);
  if (isHome(dirname(profileDir))) {
    return { home: dirname(profileDir), name: basename(profileDir) };
  }
  if (isHome(profileDir)) {
    return { home: profileDir, name: "default" };
  }
};

/** `~/…` for a path under the home directory, as the person would type it. */
const tilde = (path: string): string => {
  const home = homedir();
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};

/**
 * What the Colima profile's running VM forwards. Its settings as started are
 * the instance's state file, `<lima dir>/<instance>/colima.yaml`
 * (Profile.StateFile, written at every start: "preserve state"); the
 * profile's own colima.yaml is only what the next start reads. The Lima dir
 * is `$LIMA_HOME`, else `<home>/_lima`; the instance is `colima`, or
 * `colima-<profile>`. Colima starts Lima's ssh forwarder for every value but
 * grpc (`useSSHPortForwarder := conf.PortForwarder != "grpc"`), an empty one
 * is ssh, and `none` ignores every port. Unreadable, no UDP is published
 * until it can be read: UDP only where it is known to be forwarded.
 */
const colimaForwarding = async (
  profile: ColimaProfile
): Promise<MediaForwarding> => {
  const instance =
    profile.name === "default" ? "colima" : `colima-${profile.name}`;
  const state = join(
    process.env.LIMA_HOME || join(profile.home, "_lima"),
    instance,
    "colima.yaml"
  );
  const config = tilde(join(profile.home, profile.name, "colima.yaml"));
  const fix = `set \`portForwarder: grpc\` in ${config}, then run \`colima restart\`.`;
  // The same switch as one line: `colima start --port-forwarder grpc` saves
  // the flag to the profile's colima.yaml (`--save-config`, "persist and
  // overwrite config file with (newly) specified flags", default true), and
  // a running Colima ignores start ("already running, ignoring"), so it
  // stops first (abiosoft/colima cmd/start.go).
  const named = profile.name === "default" ? "" : ` ${profile.name}`;
  const known = {
    runtime: "Colima",
    command: `colima stop${named} && colima start${named} --port-forwarder grpc`,
  };
  let forwarder: unknown;
  try {
    const settings = parse(await readFile(state, "utf8")) as {
      portForwarder?: unknown;
    } | null;
    forwarder = settings?.portForwarder || "ssh";
  } catch (error) {
    const why =
      (error as NodeJS.ErrnoException).code ??
      (error instanceof Error ? error.message : String(error));
    return {
      ...known,
      media: "tcp",
      advice: `Colima's running settings at ${tilde(state)} could not be read (${why}), so this machine's browser streams over TCP alone. To stream over UDP, ${fix}`,
    };
  }
  if (forwarder === "grpc") {
    return { ...known, media: "udp+tcp" };
  }
  if (forwarder === "none") {
    return {
      ...known,
      media: "none",
      advice: `Colima forwards no ports (\`portForwarder: none\`), so a screen reaches this machine's browser only through a stream relay. To stream directly, ${fix}`,
    };
  }
  return {
    ...known,
    media: "tcp",
    advice: `Colima forwards only TCP, so this machine's browser streams over TCP, which stutters on weak networks. To stream over UDP, ${fix}`,
  };
};

/**
 * The sentence for a measurement short of what the runtime was taken to
 * forward. Lima's fix is its docs' (lima-vm.io/docs/config/port: the SSH
 * forwarder "Doesn't support UDP based port forwarding"; "To enable this
 * feature, set `LIMA_SSH_PORT_FORWARDER` to `false`").
 */
const measuredAdvice = (endpoint: string, media: MediaPath): string => {
  const runtime = `The container runtime at ${tilde(endpoint)}`;
  const fix =
    "switch the runtime to a port forwarder that carries UDP and TCP (Lima: start it with `LIMA_SSH_PORT_FORWARDER=false`), restart it, then start the browser again.";
  return media === "none"
    ? `${runtime} forwarded none of the browser's media port when the browser last started, so a screen reaches this machine's browser only through a stream relay. To stream directly, ${fix}`
    : `${runtime} forwarded the browser's media port for TCP alone when the browser last started, so this machine's browser streams over TCP, which stutters on weak networks. To stream over UDP, ${fix}`;
};

/** Where measurements are kept: one file per runtime endpoint, each written whole, so two starts never lose each other's. */
const measurementsDir = (): string => join(browsersDir(), "media");

const measurementFile = (endpoint: string): string =>
  join(
    measurementsDir(),
    `${createHash("sha256").update(endpoint).digest("hex").slice(0, 16)}.json`
  );

/** The endpoint's socket as it is now: a runtime that restarts makes it anew. */
const socketIdentity = (endpoint: string): Promise<string | undefined> =>
  stat(endpoint).then(
    (one) => `${one.dev}:${one.ino}:${Math.round(one.ctimeMs)}`,
    () => undefined
  );

/** The measurement kept for `endpoint`, while its socket is the one it was taken on. */
const measurementOf = async (
  endpoint: string
): Promise<MediaMeasurement | undefined> => {
  const [kept, socket] = await Promise.all([
    readRecord(measurementFile(endpoint), MediaMeasurementSchema).catch(
      (error: unknown) => {
        if (isDamagedRecord(error)) {
          console.warn(`[browser] ${error.message}; media is measured afresh`);
          return;
        }
        throw error;
      }
    ),
    socketIdentity(endpoint),
  ]);
  return kept && kept.endpoint === endpoint && socket && kept.socket === socket
    ? kept
    : undefined;
};

/** Keeps `media` as what `endpoint` forwards, for as long as its socket is this one. */
export const recordMeasurement = async (
  endpoint: string,
  media: MediaPath
): Promise<void> => {
  const socket = await socketIdentity(endpoint);
  if (!socket) {
    return;
  }
  const measurement: MediaMeasurement = {
    endpoint,
    media,
    socket,
    at: Date.now(),
  };
  await mkdir(measurementsDir(), { recursive: true, mode: 0o700 });
  await writeStateFile(
    measurementFile(endpoint),
    `${JSON.stringify(measurement, null, 2)}\n`,
    { mode: 0o600 }
  );
};

/**
 * What the runtime answering on `endpoint` forwards to a browser's media
 * port, read now: its kept measurement where that is short of what Colima's
 * settings (or, for any other runtime, both protocols) promise.
 */
export const mediaForwarding = async (
  endpoint: string
): Promise<MediaForwarding> => {
  const [measured, profile] = await Promise.all([
    measurementOf(endpoint),
    colimaProfileOf(endpoint),
  ]);
  const promised: MediaForwarding = profile
    ? await colimaForwarding(profile)
    : { media: "udp+tcp" };
  return measured && carriesLess(measured.media, promised.media)
    ? {
        media: measured.media,
        advice: measuredAdvice(endpoint, measured.media),
      }
    : promised;
};

/**
 * The machine's addresses a screen may reach it on: on the links another
 * device reaches it on (core reachable-links.ts: no container or VM bridge,
 * veth or bridge port), every IPv4 address (LAN and tailnet) and every
 * global IPv6 one.
 */
export const machineAddresses = async (): Promise<string[]> => {
  const reachable = new Set((await reachableLinks()).map((link) => link.name));
  return Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    reachable.has(name)
      ? (addresses ?? [])
          .filter(
            (one) =>
              !one.internal &&
              (one.family === "IPv4" ||
                !(
                  one.address.startsWith("fe80") ||
                  one.address.startsWith("fc") ||
                  one.address.startsWith("fd")
                ))
          )
          .map((one) => one.address)
      : []
  );
};

/**
 * How long a live container's media port has to show up forwarded. Lima's
 * guest agent reads the guest's listening ports every 3 s (lima-guestagent's
 * `--tick`, "Tick for polling events", default 3s) and the host binds after
 * it, so four ticks.
 */
const MEASURE_MS = 15_000;
const MEASURE_POLL_MS = 250;
/** How long `netstat` has to answer, and a connection to be taken. */
const READ_MS = 5000;
const WHITESPACE = /\s+/u;
/** A /proc/net address bound on every address: all zeros, IPv4 or IPv6. */
const EVERY_ADDRESS = /^0+$/u;

/** Whether `/proc/net/<proto>{,6}` holds a socket bound on every address at `port` (TCP: listening), whoever owns it. */
const procBinds = async (proto: "udp" | "tcp", port: number) => {
  const tables = await Promise.all(
    [proto, `${proto}6`].map((name) =>
      readFile(join("/proc/net", name), "utf8").catch((error: unknown) => {
        // No IPv6 in this kernel: no tcp6/udp6 table.
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return "";
        }
        throw error;
      })
    )
  );
  return tables.some((table) =>
    table
      .split("\n")
      .slice(1)
      .some((line) => {
        // sl local_address rem_address st …; local_address is <hex ip>:<hex port>.
        const [, local, , state] = line.trim().split(WHITESPACE);
        const [address, hex] = (local ?? "").split(":");
        return (
          !!address &&
          !!hex &&
          Number.parseInt(hex, 16) === port &&
          EVERY_ADDRESS.test(address) &&
          (proto === "udp" || state === "0A")
        );
      })
  );
};

/**
 * Whether macOS's `netstat -an` shows a socket bound on every address at
 * `port` (TCP: listening). netstat lists every user's sockets without root,
 * where `lsof` sees only this user's processes, so a forwarder running as
 * another user is seen too. Its local address reads `*.<port>` when bound on
 * every address, IPv4 or IPv6.
 */
const netstatBinds = async (proto: "udp" | "tcp", port: number) => {
  const argv = ["netstat", "-an", "-p", proto];
  const read = await readWithin(READ_MS, async (signal) => {
    const child = Bun.spawn(argv, {
      env: hostEnvironment(),
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    return await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
  });
  if (read.kind === "unanswered") {
    throw new Error(
      `${argv.join(" ")} did not answer within ${READ_MS / 1000} s`
    );
  }
  const [out, err, code] = read.value;
  if (code !== 0) {
    throw new Error(`${argv.join(" ")} exited ${code}: ${err.trim()}`);
  }
  return out.split("\n").some((line) => {
    // Proto Recv-Q Send-Q Local-Address Foreign-Address (state)
    const [name, , , local, , state] = line.trim().split(WHITESPACE);
    return (
      !!name?.startsWith(proto) &&
      local === `*.${port}` &&
      (proto === "udp" || state === "LISTEN")
    );
  });
};

/** Whether a TCP connection to `host`:`port` is taken. */
const tcpAnswers = (host: string, port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host, port });
    const done = (answered: boolean) => {
      socket.destroy();
      resolve(answered);
    };
    socket.setTimeout(READ_MS);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });

/**
 * What reaches `port` now through a rootful engine on Linux. It forwards
 * through the kernel's NAT, which binds no socket once its userland proxy is
 * off ("The userland proxy can be disabled in favor of hairpin NAT using the
 * daemon's `--userland-proxy=false` flag", Docker's release notes), so a
 * connection is made instead: to the machine's own address, through the same
 * NAT a screen's connection takes. Those rules publish each protocol of a
 * port alike, so a TCP connection taken is UDP forwarded as well.
 */
const natForwards = async (port: number): Promise<MediaPath> => {
  const addresses = await machineAddresses();
  const host =
    addresses.find((one) => !one.includes(":")) ?? addresses[0] ?? "127.0.0.1";
  return (await tcpAnswers(host, port)) ? "udp+tcp" : "none";
};

/** What the host binds on every address for `port` now. */
const hostBinds = async (port: number): Promise<MediaPath> => {
  const binds = platform() === "darwin" ? netstatBinds : procBinds;
  const [udp, tcp] = await Promise.all([
    binds("udp", port),
    binds("tcp", port),
  ]);
  if (tcp) {
    return udp ? "udp+tcp" : "tcp";
  }
  // No forwarder carries UDP and not TCP (Lima's ssh one carries TCP alone):
  // UDP bound without TCP is TCP not bound yet, and the reading goes on.
  return "none";
};

/** How this machine reads what reaches a port through `runtime`, and the reading. */
export interface ForwardingReader {
  /** `binds`: what the host binds on every address; `nat`: a TCP connection through the kernel's NAT, which carries UDP alike. */
  by: "binds" | "nat";
  read: (port: number) => Promise<MediaPath>;
}

/**
 * The reader for `runtime` here. Where a host process forwards (a VM's
 * forwarder, on a Mac or Colima's on Linux; rootlesskit or pasta on Linux)
 * it holds the port it forwards, so what is bound on every address is read;
 * a rootful engine on Linux's own network is read by {@link natForwards}.
 * Undefined on a platform with neither.
 */
export const forwardingReader = (
  runtime: Pick<Runtime, "ownNetwork" | "rootless">
): ForwardingReader | undefined => {
  const os = platform();
  if (
    os === "darwin" ||
    (os === "linux" && (runtime.rootless || !runtime.ownNetwork))
  ) {
    return { by: "binds", read: hostBinds };
  }
  if (os === "linux") {
    return { by: "nat", read: natForwards };
  }
};

/**
 * What the host forwards for a live container's media port, published for
 * `published`, read until it shows all of `published` or {@link MEASURE_MS}
 * has passed (a VM's forwarder binds a moment after the guest does).
 */
export const measureMedia = async (
  runtime: Runtime,
  port: number,
  published: MediaPath
): Promise<MediaPath | undefined> => {
  const reader = forwardingReader(runtime);
  if (!reader) {
    return;
  }
  const until = Date.now() + MEASURE_MS;
  for (;;) {
    const forwarded = await reader.read(port);
    if (!carriesLess(forwarded, published) || Date.now() > until) {
      return forwarded;
    }
    await Bun.sleep(MEASURE_POLL_MS);
  }
};
