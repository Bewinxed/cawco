import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import {
  bindSockets,
  failed,
  installLaunchAgents,
  installSystemdUnits,
  launchAgentLogs,
  loadLaunchAgent,
  restartLaunchAgent,
  restartSystemdUnit,
  run,
  ServiceError,
  systemdLogs,
  uninstallLaunchAgents,
  uninstallSystemdUnits,
  writeSocketUnits,
  writeUnit,
} from "@cawco/agent/service-manager/install";
import {
  label,
  launchAgentPath,
  socketName,
  socketPath,
  systemdPath,
  unitName,
} from "@cawco/agent/service-manager/names";
import {
  listenAddress,
  MODE_ENV,
  plist,
  type ServiceMode,
  type ServiceSpec,
  type SocketSpec,
  unit,
} from "@cawco/agent/service-manager/units";
import { SERVICE_IDS, type ServiceId } from "@cawco/core/binary-installation";
import { holdPhrases, type RestartReadiness } from "@cawco/core/binary-updates";
import { type Bounded, Gone, readWithin } from "@cawco/core/bounded";
import { CAWCO_ENV, readEnv } from "@cawco/core/cawco-env";
import { hubRequest } from "@cawco/core/hub-request";
import { keeperEndpoint, keeperService } from "@cawco/core/keepers";
import {
  launchdEnded,
  launchdJob,
  launchdLog,
  launchdLogsDir,
} from "@cawco/core/launchd";
import { hubDbPath } from "@cawco/core/paths/hub";
import {
  CAWCO_HUB_PORT,
  localDashboardPort,
  mcpGatewayPort,
} from "@cawco/core/ports";
import type { AgentRow } from "@cawco/core/protocol";
import { runtimeVersion, standalone } from "@cawco/core/runtime";
import { sessiondEndpointPath } from "@cawco/core/sessiond";
import { unhandled } from "@cawco/core/unhandled";
import { z } from "zod";

/**
 * The machine's keeper endpoint, as this machine derives it
 * (`@cawco/core/sessiond`, design §12), with the same override the daemon's
 * entry point honours: what names the current keeper (core keepers.ts). Its
 * path alone: this module's layout reads it as any command starts, and on
 * macOS a short name made there for a HOME that goes after the command
 * (the release's signing run of `cawco --version`) stayed behind in the
 * socket root. sessiond makes its short name itself as it starts.
 */
const sessiondSocket = (): string =>
  process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpointPath();

export type ServiceAction =
  "install" | "uninstall" | "restart" | "status" | "logs";

export const SERVICE_ACTIONS: readonly ServiceAction[] = [
  "install",
  "uninstall",
  "restart",
  "status",
  "logs",
];

export const isServiceAction = (
  value: string | undefined
): value is ServiceAction => SERVICE_ACTIONS.includes(value as ServiceAction);

/**
 * The node the dashboard's server runs under, found on the installing shell's
 * PATH and named in the unit outright — `ExecStart=` is not a shell. The prod
 * server is node rather than the Bun running this CLI because it serves on the
 * socket its service manager passes it, and Bun 1.4.0's node:http accepts
 * `listen({ fd })` without ever answering on that socket; node does.
 */
const NODE = Bun.which("node");

/**
 * How a unit starts its process: the argv `ExecStart=` runs, and the file that
 * argv cannot start without.
 */
interface Launch {
  readonly command: readonly string[];
  readonly needs: string;
}

/**
 * The session keeper a set of units runs: its launch, the service name its
 * unit and label carry, and the endpoint it listens on. A checkout's keeper
 * is `sessiond`, on the machine's endpoint itself; a build's is
 * `sessiond-<version>`, on its own endpoint beside it, which it makes the
 * machine's when it is the current one (core keepers.ts).
 */
interface KeeperLaunch extends Launch {
  readonly endpoint: string;
  readonly name: string;
}

/** A build's own keeper, run from `executable` (core keepers.ts). */
const buildKeeper = (version: string, executable: string): KeeperLaunch => {
  const keeper = { kind: "build", version } as const;
  return {
    command: [executable, "sessiond"],
    needs: executable,
    name: keeperService(keeper),
    endpoint: keeperEndpoint(keeper, sessiondSocket()),
  };
};

/**
 * Every command and path a set of units names, derived from one root. A
 * checkout runs each service from its own source; the standalone executable
 * runs each of them as a verb of itself.
 */
interface Layout {
  readonly agent: Launch;
  readonly dashboard: Launch;
  /** What the dashboard's server imports — the adapter-node output, and the part that can be missing. */
  readonly dashboardBuild: string;
  /** The dashboard unit's working directory. */
  readonly dashboardCwd: string;
  /** What `--dev` runs from. Only a checkout has source to run, so a release has none. */
  readonly dev?: {
    readonly dashboardDir: string;
    readonly hubEntry: string;
    /**
     * The dashboard's `dev` script is `vite dev`, and this is that vite. Named
     * outright because `ExecStart=` is not a shell: it cannot resolve a `.bin`
     * entry off PATH, and going through `bun run --filter` would put the port
     * back under vite.config.ts, where `status` cannot follow it.
     */
    readonly vite: string;
  };
  readonly hub: Launch;
  readonly root: string;
  readonly sessiond: KeeperLaunch;
}

const checkoutLayout = (
  root: string,
  cliEntry: string = join(root, "packages", "cli", "src", "cli.ts")
): Layout => {
  const hubEntry = join(root, "packages", "hub", "src", "index.ts");
  const sessiondEntry = join(root, "packages", "sessiond", "src", "main.ts");
  const dashboardEntry = join(root, "apps", "dashboard", "serve.js");
  return {
    root,
    hub: { command: [process.execPath, hubEntry], needs: hubEntry },
    sessiond: {
      command: [process.execPath, sessiondEntry],
      needs: sessiondEntry,
      name: "sessiond",
      endpoint: sessiondSocket(),
    },
    agent: { command: [process.execPath, cliEntry, "up"], needs: cliEntry },
    dashboard: {
      command: [NODE ?? "node", dashboardEntry],
      needs: dashboardEntry,
    },
    dashboardBuild: join(root, "apps", "dashboard", "build", "handler.js"),
    dashboardCwd: root,
    dev: {
      hubEntry,
      dashboardDir: join(root, "apps", "dashboard"),
      vite: join(
        root,
        "apps",
        "dashboard",
        "node_modules",
        "vite",
        "bin",
        "vite.js"
      ),
    },
  };
};

const isCheckout = (dir: string): boolean => {
  const manifest = join(dir, "package.json");
  return (
    existsSync(manifest) &&
    Boolean(
      z
        .object({ workspaces: z.unknown().optional() })
        .parse(JSON.parse(readFileSync(manifest, "utf8"))).workspaces
    )
  );
};

/**
 * What this CLI is running from. A release when `dashboard/serve.js` sits
 * beside the running `cli.js` — asked first, and of the resolved path, because
 * a release runs through the link bun puts in its global bin directory. A
 * checkout when a workspace manifest is found walking up; there `Bun.main`
 * rather than the derived cli.ts, so that installing from a branch installs
 * this very process's entry point, which is what testing a branch means.
 */
const here = (): Layout => {
  if (standalone) {
    const executable = realpathSync(process.execPath);
    const launch = (verb: string): Launch => ({
      command: [executable, verb],
      needs: executable,
    });
    return {
      root: dirname(executable),
      hub: launch("hub"),
      agent: launch("up"),
      sessiond: buildKeeper(runtimeVersion, executable),
      dashboard: launch("dashboard"),
      dashboardBuild: executable,
      dashboardCwd: homedir(),
    };
  }
  const main = realpathSync(Bun.main);
  let dir = dirname(main);
  while (dir !== dirname(dir)) {
    if (isCheckout(dir)) {
      return checkoutLayout(dir, Bun.main);
    }
    dir = dirname(dir);
  }
  throw new ServiceError(
    `${main} is in neither a cawco checkout (no package.json with workspaces above it) nor a standalone cawco executable`
  );
};

const HERE = here();
const ROOT = HERE.root;

const LISTEN_STREAM = /^ListenStream=(.+):\d+$/mu;
/** An IPv6 host as `ListenStream=` writes it, in brackets (`listenAddress`). */
const BRACKETED = /^\[(.*)\]$/u;
const SOCK_NODE = /<key>SockNodeName<\/key>\s*<string>([^<]*)<\/string>/u;

/**
 * The host the installed dashboard socket already listens on, read back out
 * of its socket unit or its plist. Every binary update rewrites the dashboard's
 * units from the incoming build (`refreshServices`, run as `cawco binary-units
 * --services`), in a process with no HOST in its environment; without this, a
 * dashboard installed on one address would be moved back to every interface
 * by the next update.
 */
const installedDashboardHost = (): string | undefined => {
  if (platform() === "darwin") {
    const path = launchAgentPath("dashboard");
    const text = existsSync(path) ? readFileSync(path, "utf8") : "";
    return SOCK_NODE.exec(text)?.[1] || undefined;
  }
  const path = socketPath("dashboard");
  const listen = existsSync(path)
    ? LISTEN_STREAM.exec(readFileSync(path, "utf8"))
    : null;
  return listen?.[1]?.replace(BRACKETED, "$1") || undefined;
};

/**
 * Where the dashboard listens: its port is the dashboard's everywhere (core
 * `localDashboardPort`, 3455, which the hub's unit records, so an update
 * keeps it), and its host is the installing shell's HOST, then the socket
 * already installed's, then every interface. Read as each unit is written: an
 * update's refresh clears HOST (`asInstalled`), so the socket keeps the host
 * it has.
 */
const dashboardAddress = (): { host: string; port: string } => ({
  port: String(localDashboardPort()),
  host: process.env.HOST ?? installedDashboardHost() ?? "0.0.0.0",
});

/**
 * The loopback addresses a listener on `host` already answers: the IPv4
 * wildcard takes 127.0.0.1 and a loopback address itself; `::` is left to
 * name each, since an IPv6 wildcard takes IPv4 only where the system maps it.
 */
const coveredLoopback = (host: string): string[] => {
  if (host === "0.0.0.0") {
    return ["127.0.0.1"];
  }
  return host === "127.0.0.1" || host === "::1" ? [host] : [];
};

/**
 * The dashboard's sockets, on its one port (core `localDashboardPort`,
 * 3455): where the network reaches it (required, its own unit,
 * `cawco-dashboard.socket`; installedDashboardHost reads it back), and each
 * loopback address that one does not already answer
 * ({@link coveredLoopback}), so `http://localhost:3455` is the dashboard
 * here by either family as it is on every computer whose agent carries it
 * (agent hub-loopback.ts). On the hub's computer the agent carries nothing,
 * so these are the only listeners on the port. Under the default HOST
 * (0.0.0.0) that is `::1` alone, where this computer has an IPv6 loopback
 * ({@link hasIpv6Loopback}); none is a unit of none.
 *
 * The loopback is a unit of its own, `cawco-dashboard-local.socket`, wanted
 * and not required: systemd fails a whole socket unit on one address it
 * cannot open, closing the rest (src/core/socket.c `socket_open_fds`: `p->fd
 * = socket_address_listen_in_cgroup(…); if (p->fd < 0) return p->fd;`, then
 * "Failed to listen on sockets"), so a loopback address something else
 * holds would take the network's down with it in one unit. Apart, the
 * service gets the loopback's descriptors only when it opened
 * (src/core/service.c `service_collect_fds`: a socket with none, `if (cn_fds
 * == 0) continue;`), and starts on the network's alone otherwise.
 */
const dashboardSockets = (): SocketSpec[] => {
  const network = dashboardAddress();
  const covered = coveredLoopback(network.host);
  const loopback = ["127.0.0.1", ...(hasIpv6Loopback() ? ["::1"] : [])]
    .filter((host) => !covered.includes(host))
    .map((host) => ({ host, port: network.port }));
  return [
    {
      unit: "dashboard",
      name: "dashboard",
      listens: [network],
      required: true,
    },
    ...(loopback.length === 0
      ? []
      : [
          {
            unit: "dashboard-local",
            name: "dashboard-local",
            listens: loopback,
            required: false,
          },
        ]),
  ];
};

/**
 * Whether this computer can listen on `::1` now. A container or host with no
 * IPv6 loopback (`::1` absent, or no IPv6 at all) gets no `[::1]` listen:
 * one address the loopback socket cannot open fails it whole. Every update
 * writes the sockets again (`refreshServices`), so one that gains `::1`
 * listens there from its next update.
 */
const hasIpv6Loopback = (): boolean => {
  try {
    Bun.serve({
      hostname: "::1",
      port: 0,
      fetch: () => new Response(null),
    }).stop(true);
    return true;
  } catch {
    // EADDRNOTAVAIL (no `::1`) or EAFNOSUPPORT (no IPv6): none here.
    return false;
  }
};

/** How long a liveness probe is worth waiting for before it has said enough. */
const PROBE_TIMEOUT_MS = 2000;

const hubOrigin = (): string =>
  `http://127.0.0.1:${readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT}`;

/** What a probe's answer came to: its body, or what it said instead. */
type Said<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly status: number; readonly said: string };

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * One probe read, given {@link PROBE_TIMEOUT_MS} to answer. A request nothing
 * is listening for ended before it answered (`Gone`, reason "dead"); `read`
 * takes the response, the body within the same time.
 */
const probe = <T>(
  url: string,
  read: (response: Response) => Promise<T>,
  init: RequestInit = {},
  via: Fetcher = (target, options) => fetch(target, options)
): Promise<Bounded<T>> =>
  readWithin(PROBE_TIMEOUT_MS, async (signal) => {
    const response = await via(url, { ...init, signal }).catch(
      (error: unknown) => {
        throw signal.aborted
          ? error
          : new Gone(
              `${url}: ${error instanceof Error ? error.message : String(error)}`
            );
      }
    );
    return read(response);
  });

/** A 2xx answer's JSON body, or the status that refused it. */
const jsonBody =
  <T>() =>
  async (response: Response): Promise<Said<T>> => {
    if (!response.ok) {
      await response.body?.cancel();
      return {
        ok: false,
        status: response.status,
        said: `HTTP ${response.status}`,
      };
    }
    try {
      return { ok: true, value: (await response.json()) as T };
    } catch {
      return {
        ok: false,
        status: response.status,
        said: `HTTP ${response.status} with a body that is not JSON`,
      };
    }
  };

/** What a probe that got no answer says about `url`. */
const noAnswer = (
  url: string,
  missed: Extract<Bounded<unknown>, { kind: "unanswered" }>
): string =>
  missed.reason === "timeout"
    ? `no answer from ${url} within ${(missed.after / 1000).toFixed(1)}s`
    : `nothing answers at ${url}`;

/** As this machine (core machine-key.ts): a hub that requires paired devices answers what machines read to an admitted machine. */
const asMachine: Fetcher = async (url, init) => {
  const { machineFetch } = await import("@cawco/core/machine-key");
  return machineFetch(url, init);
};

const probeJson = <T>(url: string): Promise<Bounded<Said<T>>> =>
  probe(url, jsonBody<T>(), {}, asMachine);

/** The HTTP status `url` answers with, its body left unread. */
const probeStatus = (url: string): Promise<Bounded<number>> =>
  probe(url, async (response) => {
    await response.body?.cancel();
    return response.status;
  });

const probeHub = async (): Promise<string> => {
  const url = `${hubOrigin()}${hubRequest("GET /health").path}`;
  const health = await probeJson<{ version: string }>(url);
  switch (health.kind) {
    case "unanswered":
      return noAnswer(url, health);
    case "answered":
      return health.value.ok
        ? `${hubOrigin()} answers /health (hub ${health.value.value.version})`
        : `${url} answered ${health.value.said}`;
    default:
      unhandled("read", health);
  }
};

const probeDashboard = async (): Promise<string> => {
  const { host, port } = dashboardAddress();
  const url = `http://${host}:${port}/`;
  const answer = await probeStatus(url);
  switch (answer.kind) {
    case "unanswered":
      return noAnswer(url, answer);
    case "answered":
      return `${url} answers (HTTP ${answer.value})`;
    default:
      unhandled("read", answer);
  }
};

/**
 * The hub this machine's agent talks to: the one `up` and `join` saved. A
 * worker's hub is on another machine, so asking 127.0.0.1 about the agent
 * asks the wrong hub — or none at all. Undefined on a machine that has never
 * joined one, which the callers read as "cannot say".
 */
const joinedHub = async (): Promise<string | undefined> => {
  // Imported here rather than at the top so the verbs that never ask about
  // the agent never pay for the agent package.
  const { readConfig } = await import("@cawco/agent/config");
  return (await readConfig())?.hubUrl || undefined;
};

/**
 * This machine's own row at its hub, as this machine (core machine-key.ts):
 * the row, `null` when the hub answered it knows no such machine (404), or
 * what was said instead of an answer. The fleet's list is the person's (hub
 * hub-auth.ts).
 */
const ownRow = async (hub: string): Promise<AgentRow | null | string> => {
  const { machineId } = await import("@cawco/core/machine-id");
  const row = jsonBody<AgentRow>();
  const self = await probe(
    `${hub}${
      hubRequest("GET /api/agents/:machineId", {
        path: { machineId: await machineId() },
      }).path
    }`,
    async (response): Promise<Said<AgentRow | null>> => {
      if (response.status === 404) {
        await response.body?.cancel();
        return { ok: true, value: null };
      }
      return row(response);
    },
    {},
    asMachine
  );
  switch (self.kind) {
    case "unanswered":
      return noAnswer(hub, self);
    case "answered":
      return self.value.ok
        ? self.value.value
        : `${hub} answered ${self.value.said} for this machine's row`;
    default:
      unhandled("read", self);
  }
};

const probeAgent = async (): Promise<string | undefined> => {
  const hub = await joinedHub();
  if (!hub) {
    return undefined;
  }
  const self = await ownRow(hub);
  if (typeof self === "string") {
    return self;
  }
  return self
    ? `registered with ${hub} as ${self.hostname} (${self.status})`
    : `not registered with ${hub}`;
};

/**
 * A unix socket that is merely *there* proves nothing — a sessiond killed with
 * SIGKILL leaves the node behind — so the probe actually connects and hangs up.
 * Windows named pipes are not reachable this way and this whole file refuses
 * win32 anyway, so the question is simply not asked there.
 */
const probeSessiond = async (): Promise<string | undefined> => {
  const endpoint = sessiondSocket();
  if (platform() === "win32") {
    return undefined;
  }
  if (!existsSync(endpoint)) {
    return `no socket at ${endpoint}`;
  }
  const socket = await Bun.connect({
    unix: endpoint,
    socket: {
      data: () => {
        // unread: this connect is only a liveness probe, nothing is sent back
      },
    },
  }).catch(() => undefined);
  if (!socket) {
    return `stale socket at ${endpoint} — nothing is listening`;
  }
  socket.end();
  return `${endpoint} accepts connections`;
};

/** The browser address of a socket listening at `address`. */
const browserUrl = ({
  host: listening,
  port,
}: {
  host: string;
  port: string;
}): string => {
  const host =
    listening === "0.0.0.0" || listening === "::" ? "localhost" : listening;
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
};

/** The browser address corresponding to the socket we install. */
export const dashboardUrl = (): string => browserUrl(dashboardAddress());

const READY_TIMEOUT_MS = 90_000;

/** A first machine is ready only when its complete local stack is usable. */
export const awaitFirstMachineReady = async (
  hub: string,
  note: (line: string) => void
): Promise<void> => {
  // Each check: undefined once the service is ready, else what it last said.
  // A probe with no answer is waited on like one not ready yet.
  const checks: readonly [ServiceId, () => Promise<string | undefined>][] = [
    [
      "hub",
      async () => {
        const url = `${hub}${hubRequest("GET /health").path}`;
        const health = await probeJson<{ ok: boolean }>(url);
        switch (health.kind) {
          case "unanswered":
            return noAnswer(url, health);
          case "answered":
            if (!health.value.ok) {
              return `${url} answered ${health.value.said}`;
            }
            return health.value.value.ok === true
              ? undefined
              : `${url} answered not ok`;
          default:
            unhandled("read", health);
        }
      },
    ],
    [
      "sessiond",
      async () => {
        const said = await probeSessiond();
        return said?.endsWith("accepts connections")
          ? undefined
          : (said ?? "not asked on this platform");
      },
    ],
    [
      "agent",
      async () => {
        const self = await ownRow(hub);
        if (typeof self === "string") {
          return self;
        }
        return self?.status === "online"
          ? undefined
          : `this machine's row is ${self?.status ?? "not there yet"}`;
      },
    ],
    [
      "dashboard",
      async () => {
        const url = dashboardUrl();
        const answer = await probeStatus(url);
        switch (answer.kind) {
          case "unanswered":
            return noAnswer(url, answer);
          case "answered":
            return answer.value >= 200 && answer.value < 300
              ? undefined
              : `${url} answered HTTP ${answer.value}`;
          default:
            unhandled("read", answer);
        }
      },
    ],
  ];
  note("waiting for hub, sessiond, this machine's agent and dashboard…");
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    const standing = await Promise.all(checks.map(([, check]) => check()));
    const index = standing.findIndex((said) => said !== undefined);
    if (index === -1) {
      return;
    }
    if (Date.now() >= deadline) {
      const [serviceId] = checks[index] as (typeof checks)[number];
      const last = standing[index];
      // A build's keeper is `sessiond-<version>`: the pattern names it too.
      const logs =
        platform() === "darwin"
          ? `tail -n 50 "${join(launchdLogsDir(), `cawco-${serviceId}`)}"*.log`
          : `journalctl --user -u 'cawco-${serviceId}*' -n 50`;
      throw new ServiceError(
        `${serviceId} did not become ready within ${READY_TIMEOUT_MS / 1000}s (${last}). Read why with: ${logs}`
      );
    }
    await Bun.sleep(1000);
  }
};

/**
 * The CPU weight of CawCo's own services, the agent, the hub and the
 * dashboard, the board every session and the phone are answered through:
 * against the keeper's unit at 20, which holds every session and every
 * build, probe and scratch fleet a delegate runs (sessiond's `cpuWeight`),
 * and the person's own units at the kernel's 100. systemd.resource-control(5),
 * CPUWeight=: "The allowed range is 1 to 10000. Defaults to unset, but the
 * kernel default is 100 … The available CPU time is split up among all
 * units within one slice relative to their CPU time weight. A higher weight
 * means more CPU time" (freedesktop.org/software/systemd/man/latest/
 * systemd.resource-control.html). They use little CPU, so the weight buys
 * them their turn when they need one: on obelisk (48 cores, 2026-10-25) the
 * agent's loop was held for seconds at a time at load 140–194 from
 * delegates' work. Fifty to one against the fleet is our call. launchd has no
 * weights: there these run `Interactive` ({@link ServiceSpec.processType}),
 * not throttled, and the keeper's children inherit its `Interactive` with
 * nothing below it.
 */
const OWN_CPU_WEIGHT = 1000;

const servicesFor = (layout: Layout): Record<ServiceId, ServiceSpec> => {
  const { root: LAYOUT_ROOT, dashboardBuild: DASHBOARD_BUILD } = layout;
  /** A unit whose process cannot start is refused, naming what is missing. */
  const needs = (launch: Launch, what: string) => (): void => {
    if (!existsSync(launch.needs)) {
      throw new ServiceError(
        `no ${what} at ${launch.needs} — is ${LAYOUT_ROOT} a cawco checkout or release?`
      );
    }
  };
  return {
    hub: {
      id: "hub",
      name: "hub",
      mode: "prod",
      description: "CawCo hub",
      // `bun run --filter '@cawco/hub' start` needs a shell for the quoting and
      // a cwd for the workspace lookup; the entry point needs neither and boots
      // the same process.
      command: layout.hub.command,
      environment: {
        [CAWCO_ENV.hubPort]: String(
          readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT
        ),
        // The database the CLI resolved (core `hubDbPath`), written into the
        // unit so the hub opens the same file whatever environment the init
        // system gives it: the platform data dir (C9: ~/.local/share/cawco on
        // linux, ~/Library/Application Support/cawco on darwin), or the
        // CAWCO_DB_PATH the operator set. The hub's own boot migration
        // (packages/hub/src/index.ts) carries an existing in-tree database
        // there the first time it finds one. Read as the unit is written, so
        // an update's refresh writes the path the unit already names
        // (`refreshServices`). Where the file lives (C9, our choice):
        // per-user, created with no sudo, and outside any git checkout — so
        // `git clean -fdx` in a dev tree or a deploy clone can never again
        // reach the fleet's whole memory. Every workspace boundary hides the
        // dir (`credentialStores`).
        [CAWCO_ENV.dbPath]: hubDbPath(),
        // Its preview listeners' ports: the operator's range, else the
        // hundred after the hub's own (hub config.ts `PREVIEW_PORTS`).
        ...(readEnv(CAWCO_ENV.previewPorts)
          ? { [CAWCO_ENV.previewPorts]: readEnv(CAWCO_ENV.previewPorts) }
          : {}),
        // The dashboard's port, the one its sockets listen on here
        // (`dashboardSockets`) and the hub names to every agent; the hub's
        // preview ports never take it (hub config.ts `FLEET_PORTS`).
        [CAWCO_ENV.localDashboardPort]: String(localDashboardPort()),
      },
      workingDirectory: LAYOUT_ROOT,
      // Nothing to wait for: a user unit cannot order itself after the
      // system's network-online.target (podman-systemd.unit(5), "Implicit
      // network dependencies"). Containers follow the machine's network
      // instead (agent browser/egress.ts).
      after: [],
      wants: [],
      restartOnSuccess: true,
      restartSec: 2,
      cpuWeight: OWN_CPU_WEIGHT,
      processType: "Interactive",
      check: needs(layout.hub, "hub"),
      probe: probeHub,
    },

    dashboard: {
      id: "dashboard",
      name: "dashboard",
      mode: "prod",
      description: "CawCo dashboard",
      command: layout.dashboard.command,
      environment: {
        [CAWCO_ENV.hubUrl]: readEnv(CAWCO_ENV.hubUrl) ?? hubOrigin(),
      },
      // serve.js collects these sockets by name and never binds a port itself,
      // so a deploy's restart leaves the ports open the whole time.
      sockets: dashboardSockets(),
      workingDirectory: layout.dashboardCwd,
      after: [unitName("hub"), socketName("dashboard")],
      wants: [unitName("hub")],
      requires: [socketName("dashboard")],
      restartOnSuccess: true,
      restartSec: 2,
      cpuWeight: OWN_CPU_WEIGHT,
      processType: "Interactive",
      // A unit without its build can only crash-loop, so none is written. What
      // is checked is the BUILD as well as the entry: `serve.js` is there in any
      // checkout or release, and the thing that can actually be absent is the
      // `build/handler.js` it imports.
      check: (): void => {
        if (!(standalone || NODE)) {
          throw new ServiceError(
            "the dashboard's server runs under node, and there is no node on PATH."
          );
        }
        needs(layout.dashboard, "dashboard server")();
        if (!existsSync(DASHBOARD_BUILD)) {
          throw new ServiceError(
            `no dashboard build at ${DASHBOARD_BUILD}, so its service could only restart until there is one. Build it with \`bun run --filter '@cawco/dashboard' build\`, then install again.`
          );
        }
      },
      probe: probeDashboard,
    },

    /**
     * The per-machine process keeper. It is listed before the daemon because the
     * daemon dials it; under service management the daemon must never spawn one
     * itself (design §11 — a self-spawned sessiond lands in the *agent's* cgroup
     * and dies with the next agent restart).
     *
     * `KillMode` is deliberately left at systemd's default of `control-group`:
     * this is the one unit whose children must die with it. sessiond holds their
     * pipe ends, so a dead sessiond leaves claude processes that nobody can read,
     * write to, or reattach — orphans still burning tokens against a full, unread
     * stdout pipe, which is strictly worse than dead children. The cgroup kill is
     * also what makes recovery simple: systemd tears down the remainder, the
     * fresh sessiond starts on a new epoch with an empty register, and `restore()`
     * runs. `cawco-agent.service` needs no KillMode tuning at all once the
     * children live over here — its restart kills no child by construction,
     * and cuts only what the agent carries itself ({@link clearToRestart}). So
     * {@link unit} emits no `KillMode=` for anybody, and that absence is the
     * decision, not an oversight.
     *
     * A build's keeper is a unit of its own, `cawco-sessiond-<version>`, so
     * the keeper of the next build starts beside it and the sessions it holds
     * run on (core keepers.ts). Which one starts with the machine is which
     * one is enabled: the current one.
     */
    sessiond: {
      id: "sessiond",
      name: layout.sessiond.name,
      mode: "prod",
      description:
        layout.sessiond.name === "sessiond"
          ? "CawCo sessiond"
          : `CawCo sessiond ${layout.sessiond.name.slice("sessiond-".length)}`,
      command: layout.sessiond.command,
      environment: {
        [CAWCO_ENV.sessiondEndpoint]: layout.sessiond.endpoint,
      },
      // Not the checkout: sessiond spawns children with a cwd the agent hands it
      // per child, and nothing it does resolves against its own.
      workingDirectory: homedir(),
      // No hub, no network: sessiond talks to one unix socket on this machine and
      // to the processes it owns. It is the one service that can come up alone.
      after: [],
      wants: [],
      // The agent dials it, so it starts first. Since the claude bridge became
      // the only spawn path (C7: no flag, no in-process fallback), an agent
      // without a keeper is up and unable to start a single session, failing
      // one spawn at a time: so the agent requires it, and if it cannot
      // start, the agent does not either, and systemd says why in one place.
      // Said here, on the keeper's side, so the requirement goes with the
      // keeper that is enabled: a retiring keeper, disabled, is required by
      // nothing, and its end stops nothing.
      before: [unitName("agent")],
      requiredBy: [unitName("agent")],
      // Draining on SIGTERM and exiting 0 is sessiond doing as it was told; only a
      // crash is worth restarting for (design §11: `Restart=on-failure`).
      restartOnSuccess: false,
      restartSec: 2,
      // Every session on the machine runs in this one unit. Under systemd's
      // default, the kernel killing one process of it for memory ends the
      // unit: one browser tab chosen by the OOM killer took every session
      // down with it ("Failed with result 'oom-kill'", 2026-10-04). The
      // manual, systemd.service(5): "If set to continue and a process in the
      // unit is killed by the OOM killer, this is logged but the unit
      // continues running."
      oomContinue: true,
      // The keeper's children count against the unit's task limit, and a Bun
      // process that cannot create a thread aborts, taking every child with
      // it. With the pids controller delegated, the keeper keeps its children
      // in a cgroup of their own whose limit stops short of its reserve, and
      // each child in a cgroup of its own under its own task limit, so one
      // runaway stops inside its own child (sessiond/src/cgroup.ts). memory
      // and cpu are delegated for the session limits an operator sets on the
      // hub, which the keeper turns on only when one is set.
      // systemd.resource-control(5), Delegate=:
      // "Units where this is enabled may create and manage their own private
      // subhierarchy of control groups below the control group of the unit
      // itself"; DelegateSubgroup= (systemd 254+): "it's almost always
      // necessary to run the main ("supervising") process of a unit that has
      // delegation turned on in a subgroup".
      delegate: { controllers: "pids memory cpu", subgroup: "keeper" },
      // Every session, and every build, typecheck and scratch fleet a session
      // runs, is in this unit, so under contention it yields the CPU to the
      // person's own apps. systemd.resource-control(5), CPUWeight=: "Defaults
      // to unset, but the kernel default is 100 … The available CPU time is
      // split up among all units within one slice relative to their CPU time
      // weight". At 20 each of the person's units in app.slice outweighs the
      // fleet 5 to 1 (our call); with the CPU idle the fleet still takes all
      // of it. Inside the unit the keeper's leaf weighs more than the
      // sessions' group (sessiond cgroup.ts `KEEPER_CPU_WEIGHT`), so the relay
      // stays ahead of the work it relays. No IOWeight=: the user manager
      // delegates only cpu, memory and pids, so it would do nothing.
      cpuWeight: 20,
      // Every session's welcome and every turn's bytes pass through the
      // keeper, so a throttled keeper is a stalled board. Measured on the Mac
      // (load-matched A/B, 2026-10-09, three counted pairs): the worst welcome
      // was 600, 2,693 and 609 ms unset against 225, 27 and 201 ms Interactive.
      processType: "Interactive",
      check: needs(layout.sessiond, "sessiond"),
      probe: probeSessiond,
    },

    agent: {
      id: "agent",
      name: "agent",
      mode: "prod",
      description: "CawCo agent",
      /**
       * This same CLI, `up`, under the same Bun that is running right now.
       * Installing from a checkout therefore installs that checkout, which is
       * what someone testing a branch means by it.
       */
      command: layout.agent.command,
      environment: {
        [CAWCO_ENV.sessiondEndpoint]: sessiondSocket(),
        ...(readEnv(CAWCO_ENV.hubUrl)
          ? { [CAWCO_ENV.hubUrl]: readEnv(CAWCO_ENV.hubUrl) as string }
          : {}),
      },
      workingDirectory: homedir(),
      // The hub is soft: the daemon reconnects with backoff and works through an
      // outage. The session keeper is not, and requires this unit from its own
      // side (`RequiredBy=`, above), whichever keeper is the machine's now.
      after: [unitName("hub")],
      wants: [unitName("hub")],
      restartOnSuccess: false,
      restartSec: 5,
      cpuWeight: OWN_CPU_WEIGHT,
      processType: "Interactive",
      launchAgentNote: [
        "A LaunchAgent runs inside your desktop session, so it can read the login",
        "keychain Claude Code keeps its credentials in. No token needed.",
      ],
      probe: probeAgent,
    },
  };
};

const SERVICES = servicesFor(HERE);

/**
 * What `--dev` changes, per service. Only what is here is watched, and the
 * daemon is deliberately absent: every edit would restart it, and a restart
 * cuts what it carries itself (the tool calls it relays, the image
 * generations and commands it runs). The turns are not cut — the keeper runs
 * them and the next agent takes them over — but that is still not something
 * a saved file should do. Restarting the hub costs little by comparison: the
 * sessions live in the daemons, which reconnect with backoff, everything the
 * hub knows is already on disk, and only the tool calls it is answering at
 * that moment are cut. The dashboard is in here only because the built bundle
 * cannot reload itself; vite's dev server picks up an edited source file
 * without any restart at all.
 */
// sessiond is absent for the same reason and more sharply: restarting it kills
// every harness child in its cgroup, so a source edit must never bounce it.
const devFor = (
  dev: NonNullable<Layout["dev"]>
): Partial<Record<ServiceId, Partial<ServiceSpec>>> => {
  const {
    hubEntry: HUB_ENTRY,
    dashboardDir: DASHBOARD_DIR,
    vite: DASHBOARD_VITE,
  } = dev;
  return {
    hub: {
      command: [process.execPath, "--watch", HUB_ENTRY],
    },
    dashboard: {
      // vite reads its config out of the working directory, which is the app, not
      // the workspace root; `--port`/`--host` then override what that config says
      // so the dev flavour answers where the prod one did. Vite runs under node,
      // not Bun: under Bun its `ws: true` proxy never completes the upgrade, so
      // the dashboard socket hangs in CONNECTING and the UI reads as an empty
      // fleet — node is also what `bun run dev` always gave it via the shebang.
      command: [
        NODE ?? "node",
        DASHBOARD_VITE,
        "dev",
        "--port",
        dashboardAddress().port,
        "--host",
        dashboardAddress().host,
      ],
      // A vite server reads its hub from this variable alone and refuses to
      // start without it (vite.config.ts). This unit is the one vite server
      // meant to drive the machine's own hub, so it names that hub here.
      environment: {
        [CAWCO_ENV.devHubUrl]: readEnv(CAWCO_ENV.hubUrl) ?? hubOrigin(),
        // systemd starts this vite outside every CawCo entry (core no-huge-pages.ts), and its rolldown's mimalloc madvises its arenas MADV_HUGEPAGE: "When set to 0, THP is disabled for the process that mimalloc runs in" (microsoft.github.io/mimalloc/environment.html).
        MIMALLOC_ALLOW_THP: "0",
      },
      // vite binds its own port, so the dev flavour has no socket to wait on.
      sockets: undefined,
      after: [unitName("hub")],
      requires: undefined,
      workingDirectory: DASHBOARD_DIR,
      check: (): void => {
        if (!existsSync(DASHBOARD_VITE)) {
          throw new ServiceError(
            `no vite at ${DASHBOARD_VITE} — run \`bun install\` in ${ROOT} first.`
          );
        }
        if (!NODE) {
          throw new ServiceError(
            `vite's dev server needs node on PATH, and there is none.`
          );
        }
      },
    },
  };
};

const DEV = HERE.dev ? devFor(HERE.dev) : {};

/** Whether `--dev` makes this service watch its own source. */
const watches = (id: ServiceId): boolean => id in DEV;

const specFor = (
  id: ServiceId,
  mode: ServiceMode,
  layout: Layout = HERE
): ServiceSpec => {
  const services = layout === HERE ? SERVICES : servicesFor(layout);
  const base = services[id];
  if (mode === "prod") {
    return base;
  }
  if (!layout.dev) {
    throw new ServiceError(
      `--dev runs the services from a checkout's source, and ${layout.root} is the published package, which has none. Install without --dev, or from a checkout.`
    );
  }
  // The daemon has no dev flavour to merge, and still carries the mode: it was
  // installed by the same command, and `status` should say so.
  const dev = layout === HERE ? DEV : devFor(layout.dev);
  return {
    ...base,
    ...dev[id],
    environment: { ...base.environment, ...dev[id]?.environment },
    mode,
    description: `${base.description} (dev)`,
  };
};

/** What the hub reports for one machine's daemon. */
interface BusyReport {
  /** Sessions on this machine with a turn in flight. */
  busy: number;
  instances: string[];
  ready: boolean;
}

/**
 * How many of this machine's sessions are mid-turn, in words, or why that is
 * unknown: the hub did not answer, or answered without saying (it is old
 * enough not to have the route). A hub that cannot answer is never read as an
 * idle one. What a restart of the session keeper waits on: it kills the turns.
 */
const sessionsMidTurn = async (): Promise<Cut> => {
  const hub = await joinedHub();
  if (!hub) {
    return { unknown: "this machine has joined no hub to ask" };
  }
  // Imported here rather than at the top so no other verb pays for the agent SDK.
  const { machineId } = await import("@cawco/core/machine-id");
  const url = `${hub}${
    hubRequest("GET /api/agents/:machineId/busy", {
      path: { machineId: await machineId() },
    }).path
  }`;
  const answer = await probeJson<BusyReport>(url);
  switch (answer.kind) {
    case "unanswered":
      return { unknown: noAnswer(url, answer) };
    case "answered": {
      if (!answer.value.ok) {
        return { unknown: `the hub answered ${answer.value.said} at ${url}` };
      }
      const report = answer.value.value;
      if (!(report.ready === true && typeof report.busy === "number")) {
        return { unknown: "the hub does not know yet" };
      }
      return report.busy > 0
        ? [`${report.busy} session${report.busy === 1 ? "" : "s"} mid-turn`]
        : [];
    }
    default:
      unhandled("read", answer);
  }
};

/**
 * Where this machine's agent says what its restart would cut: its own
 * loopback gateway, so the answer needs no hub and comes from the one process
 * that knows. The same setting the agent serves it on ({@link mcpGatewayPort}).
 */
const agentGateway = (): string => `http://127.0.0.1:${mcpGatewayPort()}`;

/**
 * What restarting the agent would cut now, in words, or why that is unknown:
 * the agent did not answer, or answered without saying. With `fenceMs` the
 * agent first raises its fence for that long (0 lowers it), so the answer
 * holds until the restart: nothing new that a restart would cut starts behind
 * it.
 */
const agentCut = async (fenceMs?: number): Promise<Cut> => {
  const url = `${agentGateway()}${fenceMs === undefined ? "/restart" : "/restart/fence"}`;
  const answer = await probe(
    url,
    jsonBody<RestartReadiness>(),
    fenceMs === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ms: fenceMs }),
        }
  );
  switch (answer.kind) {
    case "unanswered":
      return { unknown: noAnswer(url, answer) };
    case "answered":
      if (!answer.value.ok) {
        return { unknown: `${url} answered ${answer.value.said}` };
      }
      return Array.isArray(answer.value.value.holds)
        ? holdPhrases(answer.value.value.holds)
        : { unknown: `${url} answered without saying what it holds` };
    default:
      unhandled("read", answer);
  }
};

/**
 * What a restart would cut now, in words: empty when nothing, `unknown` with
 * why when nobody could say. For the agent, the work it carries itself; for
 * sessiond, the sessions mid-turn.
 */
type Cut = readonly string[] | { readonly unknown: string };

interface RestartRequest {
  readonly cut: Cut;
  readonly force: boolean;
  /** Which session-hosting service is being restarted: what that costs differs. */
  readonly id: "agent" | "sessiond";
  readonly whenIdle: boolean;
}

type RestartDecision =
  | { readonly kind: "go" }
  | { readonly kind: "wait"; readonly cut: readonly string[] }
  | { readonly kind: "refuse"; readonly reason: string };

/**
 * What restarting each session-hosting service actually costs, said in the
 * refusal. They are not the same sentence. A turn outlives the agent: its
 * harness child runs it under the session keeper and the next agent takes it
 * over, so an agent restart cuts only what the agent carries itself. sessiond
 * takes the harness children down with it — the `KillMode=control-group` on
 * its own unit, doing exactly what it is for.
 */
const RESTART_COST: Record<"agent" | "sessiond", string> = {
  agent:
    "the agent carries that work itself, so a restart ends it (the turns run on in the session keeper, and the next agent takes them over)",
  sessiond:
    "a restart of the session keeper kills every harness child in its cgroup, and those turns end where they stand",
};

/**
 * Whether restarting a session-hosting service now may cut what it is doing.
 * The only way to restart one while it would cut something — or while nobody
 * can say — is to ask for that outright.
 */
const restartDecision = ({
  cut,
  whenIdle,
  force,
  id,
}: RestartRequest): RestartDecision => {
  if (force) {
    return { kind: "go" };
  }
  if ("unknown" in cut) {
    return {
      kind: "refuse",
      reason:
        id === "agent"
          ? `this machine's agent did not say what a restart would cut (${cut.unknown}), so it was left alone: work it carries itself, such as a session takeover after an update, would end. Restart anyway with --force.`
          : `could not ask the hub whether this machine's sessions are mid-turn (${cut.unknown}), and ${RESTART_COST.sessiond}. Restart anyway with --force.`,
    };
  }
  if (cut.length === 0) {
    return { kind: "go" };
  }
  if (whenIdle) {
    return { kind: "wait", cut };
  }
  return {
    kind: "refuse",
    reason: `restarting the ${id} now would cut ${cut.join(", ")}: ${RESTART_COST[id]}. Wait for it to end with --when-idle, or restart anyway with --force.`,
  };
};

/** How often `--when-idle` asks again, and how long it keeps asking. */
const IDLE_POLL_MS = 2000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * How long the agent's fence stands for the restart this verb is about to
 * make: past the service manager's stop and start, and it lapses by itself
 * should the restart never come.
 */
const RESTART_FENCE_MS = 60_000;

/**
 * One line that rewrites itself, so a five-minute wait leaves one line behind
 * rather than 150. There is nothing to rewrite without a terminal, so there each
 * count is its own line.
 */
const waiting = (line: string): void => {
  if (process.stdout.isTTY) {
    process.stdout.write(`\r\u001b[2K${line}`);
  } else {
    console.log(line);
  }
};

/**
 * The services that hold the user's work, and so the ones whose restart has to
 * be asked for. The hub and the dashboard hold nothing of this machine's that a
 * restart can interrupt; the daemon carries what it relays and runs, and
 * sessiond owns the processes running the turns.
 */
const HOSTS_SESSIONS: readonly ServiceId[] = ["sessiond", "agent"];

/**
 * The agent's second look, behind its fence. Clear: the fence stands for the
 * restart. Work started since the first look: the fence comes down, and that
 * work is the answer, a refusal or more waiting.
 */
const fencedLook = async (whenIdle: boolean): Promise<boolean> => {
  const behind = await agentCut(RESTART_FENCE_MS);
  if (!("unknown" in behind) && behind.length === 0) {
    return true;
  }
  await agentCut(0);
  const again = restartDecision({
    cut: behind,
    whenIdle,
    force: false,
    id: "agent",
  });
  if (again.kind === "refuse") {
    throw new ServiceError(again.reason);
  }
  return false;
};

/**
 * Asked before a session-hosting service is restarted: a restart that would
 * cut nothing, or the person's `--force`, goes ahead; `--when-idle` waits up to
 * five minutes for that. The agent's last look is taken behind its fence
 * (check, raise, check), so nothing new that the restart would cut starts
 * between that look and the restart. Answers whether the fence went up, for
 * the caller to lower should the restart then fail.
 */
const clearToRestart = async (
  spec: ServiceSpec,
  { whenIdle, force }: Pick<RestartRequest, "whenIdle" | "force">,
  note: (line: string) => void
): Promise<boolean> => {
  if (!HOSTS_SESSIONS.includes(spec.id)) {
    return false;
  }
  const id = spec.id as "agent" | "sessiond";
  const read = id === "agent" ? () => agentCut() : sessionsMidTurn;
  const deadline = Date.now() + IDLE_TIMEOUT_MS;
  let waited = false;
  try {
    for (;;) {
      const decision = restartDecision({
        cut: await read(),
        whenIdle,
        force,
        id,
      });
      if (decision.kind === "refuse") {
        throw new ServiceError(decision.reason);
      }
      if (decision.kind === "wait") {
        waiting(`waiting for ${decision.cut.join(", ")} to end…`);
      } else if (force || id !== "agent") {
        return false;
      } else if (await fencedLook(whenIdle)) {
        if (waited) {
          note("nothing left that a restart would cut");
        }
        return true;
      }
      waited = true;
      if (Date.now() > deadline) {
        throw new ServiceError(
          `the ${id} would still cut work in flight after ${IDLE_TIMEOUT_MS / 60_000} minutes, so it was left alone. Try again, or restart anyway with --force.`
        );
      }
      await Bun.sleep(IDLE_POLL_MS);
    }
  } finally {
    // Whatever happened, the line that was rewriting itself is finished with.
    if (waited && process.stdout.isTTY) {
      process.stdout.write("\n");
    }
  }
};

/**
 * The mode a service was installed in, read back from the unit it was installed
 * as — nothing else remembers it.
 */
const installedMode = async (
  path: string
): Promise<ServiceMode | undefined> => {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return undefined;
  }
  return (await file.text()).includes(MODE_ENV) ? "dev" : "prod";
};

const modeLine = async (spec: ServiceSpec, path: string): Promise<string> => {
  const installed = await installedMode(path);
  if (!installed) {
    return "not installed";
  }
  if (installed === "prod") {
    return "prod";
  }
  return watches(spec.id) ? "dev (watching)" : "dev (never watched)";
};

const launchAgentStatus = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  const job = await launchdJob(label(spec.name));
  note(`service  ${spec.id} (${label(spec.name)})`);
  note(`unit     ${launchAgentPath(spec.name)}`);
  let state: string;
  if (job === undefined) {
    state = "not loaded";
  } else if (job.pid === undefined) {
    state = `loaded, not running: ${launchdEnded(job) ?? "launchd never ran it"}`;
  } else {
    state = `running (pid ${job.pid})`;
  }
  note(`state    ${state}`);
  note(`mode     ${await modeLine(spec, launchAgentPath(spec.name))}`);
  const live = await spec.probe();
  if (live) {
    note(`live     ${live}`);
  }
  note(`logs     ${launchdLog(spec.name)}`);
};

const systemdStatus = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  const active = await run([
    "systemctl",
    "--user",
    "is-active",
    unitName(spec.name),
  ]);
  const enabled = await run([
    "systemctl",
    "--user",
    "is-enabled",
    unitName(spec.name),
  ]);
  note(`service  ${spec.id} (${unitName(spec.name)})`);
  note(`unit     ${systemdPath(spec.name)}`);
  note(
    `state    ${active.stdout.toString().trim() || "unknown"} (${enabled.stdout.toString().trim() || "not installed"})`
  );
  for (const socket of spec.sockets ?? []) {
    const listening = await run([
      "systemctl",
      "--user",
      "is-active",
      socketName(socket.unit),
    ]);
    note(
      `socket   ${socketName(socket.unit)} ${listening.stdout.toString().trim() || "unknown"} on ${socket.listens.map(listenAddress).join(", ")}`
    );
  }
  note(`mode     ${await modeLine(spec, systemdPath(spec.name))}`);
  const live = await spec.probe();
  if (live) {
    note(`live     ${live}`);
  }
  note(`logs     journalctl --user -u ${unitName(spec.name)} -f`);
};

export interface ServiceOptions {
  /**
   * Verified binary install: the hub, dashboard and agent units start through
   * the wrapper, which picks the build from the `current` link; the session
   * keeper's unit is `keeper`'s own, run from its folder.
   */
  binaryLayout?: {
    /** The build the units run, through `current`: what they run, and where. */
    executable: string;
    /** The build whose session keeper the keeper's unit runs, and its program. */
    keeper: { executable: string; version: string };
    root: string;
    wrapper: string;
  };
  follow: boolean;
  /** `restart` only: cut the work in flight, or restart without knowing whether it will. */
  force: boolean;
  /** Which services the verb acts on. `logs` reads exactly one. */
  ids: readonly ServiceId[];
  /** Which flavour `install` writes. Every other verb reads the mode off disk. */
  mode: ServiceMode;
  note: (line: string) => void;
  /** `restart` only: wait for what the restart would cut to end, rather than refusing. */
  whenIdle: boolean;
}

/** The specs of `ids`, for a binary install (every unit starts through its wrapper) or for this checkout. */
const specsOf = (
  ids: readonly ServiceId[],
  mode: ServiceMode,
  binaryLayout: ServiceOptions["binaryLayout"]
): ServiceSpec[] => {
  const layout: Layout = binaryLayout
    ? {
        root: binaryLayout.root,
        hub: {
          command: [binaryLayout.wrapper, "hub"],
          needs: binaryLayout.executable,
        },
        agent: {
          command: [binaryLayout.wrapper, "up"],
          needs: binaryLayout.executable,
        },
        dashboard: {
          command: [binaryLayout.wrapper, "dashboard"],
          needs: binaryLayout.executable,
        },
        sessiond: buildKeeper(
          binaryLayout.keeper.version,
          binaryLayout.keeper.executable
        ),
        dashboardBuild: binaryLayout.executable,
        dashboardCwd: homedir(),
      }
    : HERE;
  return ids.map((id) => specFor(id, mode, layout));
};

/**
 * Rewrites the units of `ids` this build writes differently from what is on
 * disk, and has systemd reload its unit files once; restarts, starts and
 * enables nothing. A service picks its new definition up at its next start.
 * What a keeper handover runs from the build it hands the keeper to (`cawco
 * binary-units`, binary-apply.ts `handOverKeeper`): that build's keeper's own
 * unit, so a change to it reaches machines installed before it. On macOS the
 * plist is rewritten the same way, and launchd reads it at the job's next
 * load.
 */
export const refreshUnits = async (
  ids: readonly ServiceId[],
  binaryLayout: NonNullable<ServiceOptions["binaryLayout"]>,
  note: (line: string) => void
): Promise<string[]> => {
  const mac = platform() === "darwin";
  const changed: string[] = [];
  for (const spec of specsOf(ids, "prod", binaryLayout)) {
    const [path, text] = mac
      ? [launchAgentPath(spec.name), plist(spec)]
      : [systemdPath(spec.name), unit(spec)];
    const before = await Bun.file(path)
      .text()
      .catch(() => "");
    if (before !== text) {
      await writeUnit(path, text);
      changed.push(path);
      note(`rewrote ${path}`);
    }
  }
  if (changed.length > 0 && !mac) {
    const reloaded = await run(["systemctl", "--user", "daemon-reload"]);
    if (reloaded.exitCode !== 0) {
      throw failed("systemctl --user daemon-reload", reloaded);
    }
    note("systemd reloaded its unit files");
  }
  return changed;
};

const UNIT_ENVIRONMENT = /^Environment=([^=\n]+)=(.*)$/gmu;
const PLIST_ENVIRONMENT =
  /<key>EnvironmentVariables<\/key>\s*<dict>([\s\S]*?)<\/dict>/u;
const PLIST_PAIR = /<key>([^<]*)<\/key>\s*<string>([^<]*)<\/string>/gu;

/** What `xml` escaped, as it was. */
const unxml = (value: string): string =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

/** The environment a unit (systemd) or plist (launchd) was written with. */
const recordedEnvironment = (
  text: string,
  mac: boolean
): Record<string, string> =>
  Object.fromEntries(
    mac
      ? [...(PLIST_ENVIRONMENT.exec(text)?.[1] ?? "").matchAll(PLIST_PAIR)].map(
          ([, name, value]) => [unxml(name ?? ""), unxml(value ?? "")]
        )
      : [...text.matchAll(UNIT_ENVIRONMENT)].map(([, name, value]) => [
          name ?? "",
          value ?? "",
        ])
  );

/**
 * What a unit's text takes from the installing shell's environment: its
 * PATH, its XDG homes and CawCo's settings, and the dashboard's HOST (which
 * no unit records: the socket's own address stands for it,
 * `dashboardAddress`).
 */
const fromShell = (name: string): boolean =>
  name === "HOST" ||
  name === "PATH" ||
  name === "XDG_CONFIG_HOME" ||
  name === "XDG_DATA_HOME" ||
  name.startsWith("CAWCO_");

/**
 * `render`, run as though the installing shell's environment were `recorded`:
 * every variable a unit takes from that shell ({@link fromShell}) is the one
 * the unit recorded, or none, and put back after.
 */
const asInstalled = <T>(
  recorded: Record<string, string>,
  render: () => T
): T => {
  const before = Object.entries(process.env).filter(([name]) =>
    fromShell(name)
  );
  for (const [name] of before) {
    delete process.env[name];
  }
  Object.assign(process.env, recorded);
  try {
    return render();
  } finally {
    for (const name of Object.keys(recorded)) {
      delete process.env[name];
    }
    Object.assign(process.env, Object.fromEntries(before));
  }
};

/**
 * Service `id`'s unit (or plist) as this build writes it on a machine whose
 * installed one reads `installed`: from the environment that unit recorded,
 * the dashboard's with the loopback port the hub's unit records (`local`).
 */
const renderInstalled = (
  id: ServiceId,
  installed: string,
  at: {
    binaryLayout: NonNullable<ServiceOptions["binaryLayout"]>;
    local: string | undefined;
    mac: boolean;
  }
): { spec: ServiceSpec; text: string } =>
  asInstalled(
    {
      ...recordedEnvironment(installed, at.mac),
      ...(id === "dashboard" && at.local
        ? { [CAWCO_ENV.localDashboardPort]: at.local }
        : {}),
    },
    () => {
      const [spec] = specsOf([id], "prod", at.binaryLayout);
      if (!spec) {
        throw new ServiceError(`no service ${id}`);
      }
      return { spec, text: at.mac ? plist(spec) : unit(spec) };
    }
  );

/** The browser address of the socket-activated service among `specs` (the dashboard), by its network socket. */
const dashboardUrlOf = (
  specs: readonly ServiceSpec[]
): { dashboardUrl?: string } => {
  const network = specs.find((spec) => spec.sockets)?.sockets?.[0]?.listens[0];
  return network ? { dashboardUrl: browserUrl(network) } : {};
};

/**
 * THE UPDATE'S UNIT REFRESH: what a binary update runs from the build it
 * installs (`cawco binary-units --services`, binary-apply.ts), before it
 * restarts anything, so the hub's, the dashboard's and the agent's units, and
 * the dashboard's socket, are what this build's `cawco service install`
 * writes. Only a unit this machine has is refreshed. Each is written as the
 * install wrote it, from the environment it recorded then (the installing
 * shell's PATH, XDG homes and CawCo settings, {@link asInstalled}), with the
 * dashboard's port as the hub's unit records it (its loopback port, which
 * the dashboard's socket listens on too: an install from before that,
 * listening on 3000, moves to it here); the socket's host is read back from
 * the socket itself (`installedDashboardHost`). Only a unit whose text
 * changed is rewritten. Answers each unit file it rewrote, and the
 * dashboard's browser address as its socket now names it, when this machine
 * has the dashboard, for the install's record (cli.ts `writeBinaryUnits`),
 * which the update's verification probes.
 *
 * systemd: one daemon-reload for the set; a socket that changed (or is not
 * listening) is rebound through `bindSockets`, which stops the dashboard and
 * restarts the socket on its new addresses, and the update's restart that
 * follows starts the dashboard on them. A loopback socket that does not open
 * then (an earlier agent still holding its port) is said, never fatal: the
 * dashboard's restart starts it again, as a wanted unit (systemd's
 * transaction.c pulls in `UNIT_ATOM_PULL_IN_START_IGNORED`, i.e. `Wants=`,
 * for `JOB_START` and `JOB_RESTART` alike), by when the update's agent
 * restart has let the port go. launchd: a changed plist is reloaded, which
 * reopens a job's sockets on what it names now.
 */
export const refreshServices = async (
  ids: readonly ServiceId[],
  binaryLayout: NonNullable<ServiceOptions["binaryLayout"]>,
  note: (line: string) => void
): Promise<{ dashboardUrl?: string; rewrote: string[] }> => {
  const mac = platform() === "darwin";
  const rewrote: string[] = [];
  const fileOf = (id: ServiceId) =>
    mac ? launchAgentPath(id) : systemdPath(id);
  const installed = new Map<ServiceId, string>();
  const rendered: ServiceSpec[] = [];
  for (const id of ids) {
    const text = await Bun.file(fileOf(id))
      .text()
      .catch(() => undefined);
    if (text === undefined) {
      note(`${fileOf(id)}: not installed here`);
    } else {
      installed.set(id, text);
    }
  }
  const hub = installed.get("hub");
  const local = hub
    ? recordedEnvironment(hub, mac)[CAWCO_ENV.localDashboardPort]
    : undefined;
  let reload = false;
  let rebind: { moving: SocketSpec[]; spec: ServiceSpec } | undefined;
  for (const [id, before] of installed) {
    const { spec, text } = renderInstalled(id, before, {
      mac,
      local,
      binaryLayout,
    });
    rendered.push(spec);
    const path = fileOf(id);
    if (text !== before) {
      await writeUnit(path, text);
      rewrote.push(path);
      note(`rewrote ${path}`);
      if (mac) {
        await loadLaunchAgent(spec, note);
      } else {
        reload = true;
      }
    }
    // The service's sockets, where its own socket is installed: one an
    // earlier build did not write (the loopback's) is written now.
    const moving =
      !mac && spec.sockets && existsSync(socketPath(id))
        ? await writeSocketUnits(spec, note)
        : [];
    if (moving.length > 0) {
      reload = true;
      rebind = { spec, moving };
    }
  }
  if (reload) {
    const reloaded = await run(["systemctl", "--user", "daemon-reload"]);
    if (reloaded.exitCode !== 0) {
      throw failed("systemctl --user daemon-reload", reloaded);
    }
    note("systemd reloaded its unit files");
  }
  if (rebind) {
    await bindSockets(rebind.spec, rebind.moving, note);
  }
  return { ...dashboardUrlOf(rendered), rewrote };
};

/**
 * Runs one of the service verbs against whichever init system this machine has.
 * Everything it touches is per-user: no sudo, and nothing outside `$HOME`.
 */
export const service = async (
  action: ServiceAction,
  { ids, mode, follow, whenIdle, force, note, binaryLayout }: ServiceOptions
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one branch per service verb (install/uninstall/restart/status/logs), each already delegating its own logic to a named helper.
): Promise<void> => {
  const host = platform();
  if (host !== "darwin" && host !== "linux") {
    throw new ServiceError(
      `cawco service does not know how to manage a service on ${host}`
    );
  }
  const mac = host === "darwin";
  const specs = specsOf(ids, mode, binaryLayout);

  switch (action) {
    case "install": {
      // Every check first, so a refusal costs nothing rather than leaving half
      // the stack installed.
      for (const spec of specs) {
        spec.check?.();
      }
      return mac
        ? installLaunchAgents(specs, note)
        : installSystemdUnits(specs, note);
    }
    case "uninstall":
      return mac
        ? uninstallLaunchAgents(specs, note)
        : uninstallSystemdUnits(specs, force, note);
    case "restart":
      for (const [index, spec] of specs.entries()) {
        if (index > 0) {
          note("");
        }
        // Asked per service and not up front, so the services asked nothing
        // are already back up by the time the daemon's question is answered.
        const fenced = await clearToRestart(spec, { whenIdle, force }, note);
        try {
          await (mac
            ? restartLaunchAgent(spec, note)
            : restartSystemdUnit(spec, force, note));
        } catch (error) {
          // The restart did not happen: the agent takes new work again now, not when its fence lapses.
          if (fenced) {
            await agentCut(0);
          }
          throw error;
        }
      }
      return;
    case "status":
      for (const [index, spec] of specs.entries()) {
        if (index > 0) {
          note("");
        }
        await (mac ? launchAgentStatus(spec, note) : systemdStatus(spec, note));
      }
      return;
    case "logs": {
      const [spec] = specs;
      if (!spec || specs.length > 1) {
        throw new ServiceError(
          `cawco service logs reads one service: ${SERVICE_IDS.join(", ")}`
        );
      }
      return mac ? launchAgentLogs(spec, follow) : systemdLogs(spec, follow);
    }
    default:
      throw new ServiceError("unreachable: unknown service action");
  }
};
