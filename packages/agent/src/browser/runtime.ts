/**
 * The machine's container runtime: Docker, OrbStack, Colima or Podman,
 * reached through its Engine API socket with dockerode. Found in Docker's
 * own order (`DOCKER_HOST`, then the current context) and then at each
 * runtime's usual socket. A socket that is there but refuses this user
 * (obelisk's `/var/run/docker.sock`, a link to root Podman's) is skipped with
 * a line in the log, and the next is tried. None answering, the browser runs
 * as a local Chromium and `missing` names the install.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { errnoCode } from "@cawco/core/absent";
import Docker from "dockerode";
import { z } from "zod";
import { colimaHome, colimaProfileOf } from "./colima";

/** A container runtime that answered. */
export interface Runtime {
  /** The Engine API version it speaks. */
  api: string;
  docker: Docker;
  /** The socket it answered on. */
  endpoint: string;
  kind: "docker" | "podman";
  /**
   * Its engine's host network is this machine's own: a native engine on
   * Linux. False for an engine in a VM (every Mac runtime; Colima or Docker
   * Desktop on Linux: "Docker Desktop always runs the Docker Engine in a Linux
   * utility vm (even on Linux!)", forums.docker.com), whose host network is
   * the VM's and whose ports reach the machine through the VM's forwarder.
   */
  ownNetwork: boolean;
  /** Runs without root: ports under 1024 need the host's leave. */
  rootless: boolean;
  /**
   * A rootless Podman's network command, which makes each rootless network
   * namespace (libpod `/info`'s `host.rootlessNetworkCmd`); unread for any
   * other runtime. Where containers stand follows it (egress.ts).
   */
  rootlessNetwork?: "pasta" | "slirp4netns";
  /** The engine's own version. */
  version: string;
}

/** What one endpoint came to. */
type EndpointAnswer =
  { runtime: Runtime } | { refused: string } | { absent: true };

/** How long one endpoint has to answer `/_ping`. */
const PING_MS = 3000;

/** The sentence a machine with no runtime shows, by OS. */
export const runtimeMissing = (): string =>
  platform() === "darwin"
    ? "Install OrbStack (`brew install --cask orbstack`), Colima (`brew install colima && colima start`) or Docker Desktop, then open the browser again."
    : "Install Docker Engine (`apt install docker.io`, then add this user to the `docker` group) or Podman (`apt install podman`, then `systemctl --user enable --now podman.socket`), then open the browser again.";

/** The one command the capability report offers for it. */
export const runtimeInstallCommand = (): string =>
  platform() === "darwin"
    ? "brew install --cask orbstack"
    : "sudo apt install podman && systemctl --user enable --now podman.socket";

const UNIX = "unix://";

/** The endpoint the current Docker context names, when one other than `default` is set: its name and host. */
export const contextEndpoint = async (): Promise<
  { name: string; host: string } | undefined
> => {
  const configDir = process.env.DOCKER_CONFIG ?? join(homedir(), ".docker");
  let name = process.env.DOCKER_CONTEXT;
  if (!name) {
    const config = await readFile(join(configDir, "config.json"), "utf8")
      .then((text) =>
        z
          .object({ currentContext: z.string().optional() })
          .parse(JSON.parse(text))
      )
      .catch(() => undefined);
    name = config?.currentContext;
  }
  if (!name || name === "default") {
    return;
  }
  const id = createHash("sha256").update(name).digest("hex");
  const meta = await readFile(
    join(configDir, "contexts", "meta", id, "meta.json"),
    "utf8"
  )
    .then((text) =>
      z
        .object({
          Endpoints: z
            .object({
              docker: z.object({ Host: z.string().optional() }).optional(),
            })
            .optional(),
        })
        .parse(JSON.parse(text))
    )
    .catch(() => undefined);
  const host = meta?.Endpoints?.docker?.Host;
  return host ? { name, host } : undefined;
};

/** The unix socket the current Docker context names, when it names one. */
const contextSocket = async (): Promise<string | undefined> => {
  const context = await contextEndpoint();
  return context?.host.startsWith(UNIX)
    ? context.host.slice(UNIX.length)
    : undefined;
};

/** Each runtime's usual socket, in the order they are tried. */
const usualSockets = (): string[] => {
  const home = homedir();
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  return [
    ...(runtimeDir ? [join(runtimeDir, "podman", "podman.sock")] : []),
    join(colimaHome(), "default", "docker.sock"),
    join(home, ".orbstack", "run", "docker.sock"),
    join(home, ".docker", "run", "docker.sock"),
    "/var/run/docker.sock",
    join(
      home,
      ".local",
      "share",
      "containers",
      "podman",
      "machine",
      "podman.sock"
    ),
  ];
};

/**
 * Every socket {@link findRuntime} may dial on this machine: `DOCKER_HOST`'s
 * unix path, the current Docker context's and each runtime's usual one
 * (Colima's under {@link colimaHome}), wherever each lives. The boundary
 * keeps every workspace from connecting to any of them (boundary/runner.ts
 * `containerSockets`): a command that reached one would run a container of
 * its own beside a project's browser, or into it.
 */
export const runtimeSockets = async (): Promise<string[]> => {
  const host = process.env.DOCKER_HOST;
  const context = await contextSocket();
  return [
    ...new Set([
      ...(host?.startsWith(UNIX) ? [host.slice(UNIX.length)] : []),
      ...(context ? [context] : []),
      ...usualSockets(),
    ]),
  ];
};

/**
 * The variables docker-modem reads as it is made (5.0.7 lib/modem.js
 * `defaultOpts`): with `DOCKER_HOST` naming a TCP endpoint it sets `host`,
 * and a modem with a host drops the socket it was given ("var opts =
 * Object.assign({}, optDefaults, options); this.host = opts.host; if
 * (!this.host) { this.socketPath = opts.socketPath; }"), dialling that
 * endpoint instead, with the certificates `DOCKER_CERT_PATH` names.
 */
const MODEM_ENV = [
  "DOCKER_HOST",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
  "DOCKER_PATH_PREFIX",
  "DOCKER_CLIENT_TIMEOUT",
] as const;

/**
 * A client of the runtime at `socketPath` and nowhere else: made with
 * {@link MODEM_ENV} out of the environment for the moment it is made (the
 * modem reads it then, and never after), so nothing the environment says
 * reaches it. The one way a Docker client is made (`bun run check`,
 * scripts/docker-client-check.ts).
 */
const dockerAt = (socketPath: string, timeout?: number): Docker => {
  const held = MODEM_ENV.map((name) => [name, process.env[name]] as const);
  for (const [name] of held) {
    Reflect.deleteProperty(process.env, name);
  }
  try {
    return new Docker({ socketPath, ...(timeout ? { timeout } : {}) });
  } finally {
    for (const [name, value] of held) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }
  }
};

/** The engine's `/info` answer, as far as the runtime is told apart by it. */
const EngineInfo = z.object({
  OperatingSystem: z.string().optional(),
  Rootless: z.boolean().optional(),
  SecurityOptions: z.array(z.string()).optional(),
});

/** What libpod's `/info` says of its rootless network (libpod/define/info.go `HostInfo.RootlessNetworkCmd`). */
const LibpodInfoShape = z.object({
  host: z
    .object({
      rootlessNetworkCmd: z.enum(["pasta", "slirp4netns"]).optional(),
    })
    .optional(),
});

/**
 * libpod's `/info`, at a versioned path: Podman registers its libpod routes
 * only under `/v{version}/` (pkg/api/server/register_info.go
 * `VersionedPath("/libpod/info")`; the bare path answers 404, as Podman 5.7
 * did on obelisk), and dockerAt's client names no version, so docker-modem
 * sends the path as given. 4.0.0 is libpod's oldest API level from Podman 4
 * through 6 (version/version.go `MinimalAPI`), so every Podman that can run
 * a container in a namespace of its own (5.3 on, egress.ts) takes it, and a
 * handler that checks the range (`SupportedVersionWithDefaults`) admits it.
 * Matching `/version`'s own would gain nothing for the one field read here.
 */
const LIBPOD_INFO = "/v4.0.0/libpod/info";

/**
 * A rootless Podman's network command, read from its own API's
 * {@link LIBPOD_INFO} (the Docker-compatible `/info` does not carry it);
 * undefined when it does not answer, does not say, or names one this agent
 * does not know.
 */
const rootlessNetworkOf = async (
  docker: Docker,
  socketPath: string
): Promise<Runtime["rootlessNetwork"]> => {
  try {
    const info = await new Promise<unknown>((resolve, reject) => {
      docker.modem.dial(
        { path: LIBPOD_INFO, method: "GET", statusCodes: { 200: true } },
        (error: unknown, data: unknown) =>
          error ? reject(error) : resolve(data)
      );
    });
    return LibpodInfoShape.safeParse(info).data?.host?.rootlessNetworkCmd;
  } catch (error) {
    console.info(
      `[browser] ${socketPath}: libpod's /info did not answer (${error instanceof Error ? error.message : String(error)}); its containers stay on the media network`
    );
  }
};

/** Asks the runtime at `socketPath` who it is: `/_ping`, `/version`, `/info`, and a rootless Podman's `/libpod/info`. */
const probeEndpoint = async (socketPath: string): Promise<EndpointAnswer> => {
  const docker = dockerAt(socketPath, PING_MS);
  try {
    await docker.ping();
  } catch (error) {
    const code = errnoCode(error);
    if (code === "ENOENT") {
      return { absent: true };
    }
    return {
      refused: code ?? (error instanceof Error ? error.message : String(error)),
    };
  }
  const [version, answered, colima] = await Promise.all([
    docker.version(),
    docker.info(),
    colimaProfileOf(socketPath),
  ]);
  const info = EngineInfo.catch({}).parse(answered);
  const podman = version.Components?.some((one) =>
    one.Name.toLowerCase().includes("podman")
  );
  const rootless = podman
    ? info.Rootless === true
    : (info.SecurityOptions ?? []).some((option) =>
        option.includes("name=rootless")
      );
  const rootlessNetwork =
    podman && rootless
      ? await rootlessNetworkOf(docker, socketPath)
      : undefined;
  const ownNetwork =
    platform() === "linux" &&
    !colima &&
    info.OperatingSystem !== "Docker Desktop";
  return {
    runtime: {
      docker: dockerAt(socketPath),
      endpoint: socketPath,
      kind: podman ? "podman" : "docker",
      version: version.Version,
      api: version.ApiVersion,
      ownNetwork,
      rootless,
      ...(rootlessNetwork ? { rootlessNetwork } : {}),
    },
  };
};

/**
 * The machine's runtime, or why there is none. `DOCKER_HOST`, when set,
 * is the only endpoint tried, as Docker itself treats it.
 */
export const findRuntime = async (): Promise<Runtime | { missing: string }> => {
  const host = process.env.DOCKER_HOST;
  if (host !== undefined) {
    if (!host.startsWith(UNIX)) {
      console.info(
        `[browser] DOCKER_HOST is ${host}; only unix sockets are used`
      );
      return { missing: runtimeMissing() };
    }
    const answer = await probeEndpoint(host.slice(UNIX.length));
    if ("runtime" in answer) {
      return answer.runtime;
    }
    console.info(
      `[browser] DOCKER_HOST ${host} did not answer (${"refused" in answer ? answer.refused : "no such socket"})`
    );
    return { missing: runtimeMissing() };
  }
  const named = await contextEndpoint();
  if (named && !named.host.startsWith(UNIX)) {
    console.info(
      `[browser] Docker context ${named.name} names ${named.host}; only unix sockets are used`
    );
  }
  const context = await contextSocket();
  const tried = new Set<string>();
  for (const socket of [...(context ? [context] : []), ...usualSockets()]) {
    if (tried.has(socket)) {
      continue;
    }
    tried.add(socket);
    const answer = await probeEndpoint(socket);
    if ("runtime" in answer) {
      return answer.runtime;
    }
    if ("refused" in answer) {
      console.info(
        `[browser] ${socket} refused (${answer.refused}) and skipped`
      );
    }
  }
  return { missing: runtimeMissing() };
};
