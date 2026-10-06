import { existsSync, readFileSync, realpathSync } from "node:fs";
import { chmod, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import type { AgentRow } from "@cawco/core";
import { CAWCO_ENV, CAWCO_HUB_PORT, readEnv } from "@cawco/core";
import { standalone } from "@cawco/core/runtime";
import { sessiondEndpoint } from "@cawco/core/sessiond";

/**
 * The whole stack, as four services this machine can run for you, in the order
 * they should come up. A machine runs whichever of them it is for: a worker
 * wants `sessiond` and `agent`, and the box you point a browser at wants all
 * four. `sessiond` sits before `agent` on purpose — it owns the harness
 * children, so the daemon that talks to it comes up second (design §11).
 */
export type ServiceId = "hub" | "dashboard" | "sessiond" | "agent";

export const SERVICE_IDS: readonly ServiceId[] = [
  "hub",
  "dashboard",
  "sessiond",
  "agent",
];

export const isServiceId = (value: string): value is ServiceId =>
  SERVICE_IDS.includes(value as ServiceId);

export type ServiceAction =
  | "install"
  | "uninstall"
  | "restart"
  | "status"
  | "logs";

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
 * Which flavour of the stack a machine is running: the built artefacts, or the
 * checkout as you are editing it. Only the hub and the dashboard have a dev
 * flavour — see {@link DEV}.
 */
export type ServiceMode = "prod" | "dev";

/**
 * Written into a dev unit and read back out of it by `status`, which is the only
 * record of how a service was installed. Never set in prod, so a unit without it
 * is a prod install.
 */
const MODE_ENV = CAWCO_ENV.serviceMode;

/** Thrown for anything the caller can fix — a wrong platform, a failed launchctl. */
export class ServiceError extends Error {}

/** systemd wants a name, launchd wants a reverse-DNS label; they are one service. */
const unitName = (id: ServiceId): string => `cawco-${id}.service`;
const label = (id: ServiceId): string => `dev.cawco.${id}`;

const SYSTEMD_DIR = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "systemd",
  "user"
);

const systemdPath = (id: ServiceId): string => join(SYSTEMD_DIR, unitName(id));

/** The listening socket systemd holds for a socket-activated service. */
const socketName = (id: ServiceId): string => `cawco-${id}.socket`;
const socketPath = (id: ServiceId): string => join(SYSTEMD_DIR, socketName(id));
const launchAgentPath = (id: ServiceId): string =>
  join(homedir(), "Library", "LaunchAgents", `${label(id)}.plist`);
const launchAgentLog = (id: ServiceId): string =>
  join(homedir(), "Library", "Logs", `cawco-${id}.log`);

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
  readonly sessiond: Launch;
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
      (JSON.parse(readFileSync(manifest, "utf8")) as { workspaces?: unknown })
        .workspaces
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
      sessiond: launch("sessiond"),
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

const LISTEN_STREAM = /^ListenStream=(.+):(\d+)$/m;
const SOCK_NODE = /<key>SockNodeName<\/key>\s*<string>([^<]*)<\/string>/;
const SOCK_SERVICE = /<key>SockServiceName<\/key>\s*<string>([^<]*)<\/string>/;

/**
 * The address the installed dashboard socket already listens on, read back out
 * of its socket unit or its plist. The deploy poller reinstalls the dashboard's
 * units on every deploy that reaches it, from a daemon whose environment has no
 * PORT or HOST in it; without this, a dashboard installed on another port
 * would be moved back to 3000 by the next deploy.
 */
const installedDashboardAddress = ():
  | { host: string; port: string }
  | undefined => {
  if (platform() === "darwin") {
    const path = launchAgentPath("dashboard");
    const text = existsSync(path) ? readFileSync(path, "utf8") : "";
    const host = SOCK_NODE.exec(text)?.[1];
    const port = SOCK_SERVICE.exec(text)?.[1];
    return host && port ? { host, port } : undefined;
  }
  const path = socketPath("dashboard");
  const listen = existsSync(path)
    ? LISTEN_STREAM.exec(readFileSync(path, "utf8"))
    : null;
  return listen?.[1] && listen[2]
    ? { host: listen[1], port: listen[2] }
    : undefined;
};

/**
 * Where the dashboard listens. Read from the installing shell so a second
 * machine can differ, then from the socket already installed, with the
 * defaults this one's browser expects.
 */
const DASHBOARD_PORT =
  process.env.PORT ?? installedDashboardAddress()?.port ?? "3000";
const DASHBOARD_HOST =
  process.env.HOST ?? installedDashboardAddress()?.host ?? "0.0.0.0";

/**
 * The PATH the installing shell had. A launchd job otherwise inherits a nearly
 * empty one, and the daemon shells out to `git`, `gh` and `tailscale` — found
 * the hard way on a Mac where `node` was missing from the service's PATH and
 * the Claude Code shim would not start.
 */
const servicePath = (): string => {
  const inherited = (process.env.PATH ?? "").split(":").filter(Boolean);
  // Installing over SSH inherits a thin PATH with no Homebrew, so a service
  // installed remotely would lose git, gh and node. Union the usual homes with
  // whatever the installing shell had, keeping the shell's order first.
  // `~/.local/bin` is where Claude Code's own installer puts `claude`.
  const usual = [
    `${homedir()}/.local/bin`,
    `${homedir()}/.bun/bin`,
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ];
  return [...new Set([...inherited, ...usual])].join(":");
};

/**
 * Where the hub's sqlite file lives by default now (C9, our choice): per-user,
 * created with no sudo, and outside any git checkout — so `git clean -fdx` in a
 * dev tree or a deploy clone can never again reach the fleet's whole memory.
 * `XDG_DATA_HOME` is honoured the same way `SYSTEMD_DIR` honours
 * `XDG_CONFIG_HOME` above.
 */
const dataDir = (): string =>
  platform() === "darwin"
    ? join(homedir(), "Library", "Application Support", "cawco")
    : join(
        process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
        "cawco"
      );

const DEFAULT_DB_PATH =
  readEnv(CAWCO_ENV.dbPath) ?? join(dataDir(), "cawco.db");

/** Where the hub this machine runs keeps its database: what its unit is given. */
export const hubDbPath = (): string => DEFAULT_DB_PATH;

/** How long a liveness probe is worth waiting for before it has said enough. */
const PROBE_TIMEOUT_MS = 2000;

const hubOrigin = (): string =>
  `http://127.0.0.1:${readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT}`;

/** A probe answers or it does not; nothing it finds is worth throwing over. */
const probeJson = async <T>(url: string): Promise<T | undefined> => {
  const answer = await fetch(url, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }).catch(() => undefined);
  if (!answer?.ok) {
    return undefined;
  }
  return (await answer.json().catch(() => undefined)) as T | undefined;
};

const probeHub = async (): Promise<string> => {
  const health = await probeJson<{ version: string }>(`${hubOrigin()}/health`);
  return health
    ? `${hubOrigin()} answers /health (hub ${health.version})`
    : `no answer from ${hubOrigin()}/health`;
};

const probeDashboard = async (): Promise<string> => {
  const url = `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}/`;
  const answer = await fetch(url, {
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  }).catch(() => undefined);
  return answer
    ? `${url} answers (HTTP ${answer.status})`
    : `no answer from ${url}`;
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
  const { readConfig } = await import("@cawco/agent");
  return (await readConfig())?.hubUrl || undefined;
};

const probeAgent = async (): Promise<string | undefined> => {
  const hub = await joinedHub();
  const agents = hub
    ? await probeJson<AgentRow[]>(`${hub}/api/agents`)
    : undefined;
  if (!(hub && agents)) {
    return undefined;
  }
  const { machineId } = await import("@cawco/agent");
  const id = await machineId();
  const self = agents.find((agent) => agent.machineId === id);
  return self
    ? `registered with ${hub} as ${self.hostname} (${self.status})`
    : `not registered with ${hub}`;
};

/**
 * Where sessiond listens, as this machine derives it (`@cawco/core/sessiond`,
 * design §12), with the same override the daemon's entry point honours.
 */
const sessiondSocket = (): string =>
  process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint();

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

/** The browser address corresponding to the socket we install. */
export const dashboardUrl = (): string => {
  const host =
    DASHBOARD_HOST === "0.0.0.0" || DASHBOARD_HOST === "::"
      ? "localhost"
      : DASHBOARD_HOST;
  return `http://${host.includes(":") ? `[${host}]` : host}:${DASHBOARD_PORT}`;
};

const READY_TIMEOUT_MS = 90_000;

/** A first machine is ready only when its complete local stack is usable. */
export const awaitFirstMachineReady = async (
  hub: string,
  note: (line: string) => void
): Promise<void> => {
  const { machineId } = await import("@cawco/agent");
  const id = await machineId();
  const checks: readonly [ServiceId, () => Promise<boolean>][] = [
    [
      "hub",
      async () =>
        (await probeJson<{ ok: boolean }>(`${hub}/health`))?.ok === true,
    ],
    [
      "sessiond",
      async () =>
        (await probeSessiond())?.endsWith("accepts connections") === true,
    ],
    [
      "agent",
      async () => {
        const agents = await probeJson<AgentRow[]>(`${hub}/api/agents`);
        return (
          agents?.some(
            (agent) => agent.machineId === id && agent.status === "online"
          ) === true
        );
      },
    ],
    [
      "dashboard",
      async () => {
        const response = await fetch(dashboardUrl(), {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        }).catch(() => undefined);
        await response?.body?.cancel();
        return response?.ok === true;
      },
    ],
  ];
  note("waiting for hub, sessiond, this machine's agent and dashboard…");
  const deadline = Date.now() + READY_TIMEOUT_MS;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: a fresh snapshot of all four services on each readiness poll
    const ready = await Promise.all(checks.map(([, check]) => check()));
    const failed = checks.find((_, index) => !ready[index]);
    if (!failed) {
      return;
    }
    if (Date.now() >= deadline) {
      const [serviceId] = failed;
      const logs =
        platform() === "darwin"
          ? `tail -n 50 "${launchAgentLog(serviceId)}"`
          : `journalctl --user -u cawco-${serviceId} -n 50`;
      throw new ServiceError(
        `${serviceId} did not become ready within ${READY_TIMEOUT_MS / 1000}s. Read why with: ${logs}`
      );
    }
    await Bun.sleep(1000);
  }
};

export interface ServiceSpec {
  /** systemd ordering only — launchd has none, see {@link plist}. */
  readonly after: readonly string[];
  /**
   * Asked before anything is written. A throw refuses the install outright: a
   * unit that could only crash-loop is never written.
   */
  readonly check?: () => void;
  readonly command: readonly string[];
  /** systemd `Description=`. */
  readonly description: string;
  /** On top of PATH, which every service gets. */
  readonly environment: Readonly<Record<string, string>>;
  readonly id: ServiceId;
  /** Printed after a LaunchAgent install, for the one service that has more to say. */
  readonly launchAgentNote?: readonly string[];
  readonly mode: ServiceMode;
  /**
   * Writes systemd's `OOMPolicy=continue`, for a service whose processes are
   * not one piece of work. Absent, systemd's default `stop` ends every process
   * of the unit when the kernel kills one of them for memory. launchd has no
   * counterpart.
   */
  readonly oomContinue?: true;
  /** Whether the service is really up, which the init system does not know. */
  readonly probe: () => Promise<string | undefined>;
  /**
   * Hard dependencies: systemd `Requires=`. A unit here is one the service
   * genuinely cannot work without, so its failure must take this one down
   * rather than leave it up and broken. Distinct from {@link wants}, which is
   * "start it too, but carry on without it".
   */
  readonly requires?: readonly string[];
  /**
   * Whether a clean exit is still a fault. It is for a server, which has no
   * reason to stop; it is not for the daemon, which exits 0 when it is
   * deliberately drained and must then stay down.
   */
  readonly restartOnSuccess: boolean;
  readonly restartSec: number;
  /**
   * A listening socket the init system opens and keeps open, handing it to the
   * service at every start (systemd `.socket` unit, launchd `Sockets`). A
   * connection that arrives while the service restarts waits in the socket's
   * backlog for the new process rather than being refused. `name` is what the
   * service collects it by.
   */
  readonly socket?: {
    readonly host: string;
    readonly name: string;
    readonly port: string;
  };
  readonly wants: readonly string[];
  readonly workingDirectory: string;
}

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
        // The hub's DB_PATH defaults to `./cawco.db` — relative to wherever it
        // was started. A unit that leaves this unset opens a second, empty
        // database in whatever directory the init system chose, and the fleet
        // comes up blank with nothing to say why. Point it at the platform data
        // dir (C9: ~/.local/share/cawco on linux, ~/Library/Application
        // Support/cawco on darwin) rather than the checkout: the hub's own
        // boot migration (see packages/hub/src/index.ts) carries an existing
        // in-tree database there the first time it finds one.
        [CAWCO_ENV.dbPath]: DEFAULT_DB_PATH, // ~/.local/share/cawco or ~/Library/Application Support/cawco
        [CAWCO_ENV.previewPort]:
          readEnv(CAWCO_ENV.previewPort) ??
          String(Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT) + 1),
      },
      workingDirectory: LAYOUT_ROOT,
      after: ["network-online.target"],
      wants: [],
      restartOnSuccess: true,
      restartSec: 2,
      check: needs(layout.hub, "hub"),
      probe: probeHub,
    },

    dashboard: {
      id: "dashboard",
      mode: "prod",
      description: "CawCo dashboard",
      command: layout.dashboard.command,
      environment: {
        [CAWCO_ENV.hubUrl]: readEnv(CAWCO_ENV.hubUrl) ?? hubOrigin(),
        [CAWCO_ENV.previewPort]:
          readEnv(CAWCO_ENV.previewPort) ??
          String(Number(readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT) + 1),
      },
      // serve.js collects this socket by name and never binds the port itself,
      // so a deploy's restart leaves the port open the whole time.
      socket: { name: "dashboard", host: DASHBOARD_HOST, port: DASHBOARD_PORT },
      workingDirectory: layout.dashboardCwd,
      after: [unitName("hub"), socketName("dashboard")],
      wants: [unitName("hub")],
      requires: [socketName("dashboard")],
      restartOnSuccess: true,
      restartSec: 2,
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
     * children live over here — its restart is free by construction. So
     * {@link unit} emits no `KillMode=` for anybody, and that absence is the
     * decision, not an oversight.
     */
    sessiond: {
      id: "sessiond",
      mode: "prod",
      description: "CawCo sessiond",
      command: layout.sessiond.command,
      environment: { [CAWCO_ENV.sessiondEndpoint]: sessiondSocket() },
      // Not the checkout: sessiond spawns children with a cwd the agent hands it
      // per child, and nothing it does resolves against its own.
      workingDirectory: homedir(),
      // No hub, no network: sessiond talks to one unix socket on this machine and
      // to the processes it owns. It is the one service that can come up alone.
      after: [],
      wants: [],
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
      check: needs(layout.sessiond, "sessiond"),
      probe: probeSessiond,
    },

    agent: {
      id: "agent",
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
      // outage. sessiond is NOT — since the claude bridge became the only spawn
      // path (C7: no flag, no in-process fallback), a daemon without it is up and
      // unable to start a single session, failing one spawn at a time. That is
      // the quiet failure this build exists to remove, so sessiond is
      // `Requires=`: if it cannot start, the agent does not either, and systemd
      // says why in one place instead of the operator finding out per session.
      after: [unitName("hub"), unitName("sessiond")],
      wants: [unitName("hub")],
      requires: [unitName("sessiond")],
      restartOnSuccess: false,
      restartSec: 5,
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
 * daemon is deliberately absent: it hosts the sessions, so a restart lands in
 * the middle of somebody's turn and loses it. Restarting the hub costs nothing
 * by comparison — the sessions live in the daemons, which reconnect with
 * backoff, and everything the hub knows is already on disk. The dashboard is in
 * here only because the built bundle cannot reload itself; vite's dev server
 * picks up an edited source file without any restart at all.
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
        DASHBOARD_PORT,
        "--host",
        DASHBOARD_HOST,
      ],
      // vite binds its own port, so the dev flavour has no socket to wait on.
      socket: undefined,
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
    mode,
    description: `${base.description} (dev)`,
  };
};

const environment = (spec: ServiceSpec): [string, string][] =>
  Object.entries({
    PATH: servicePath(),
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    XDG_DATA_HOME:
      process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    ...spec.environment,
    ...(spec.mode === "dev" ? { [MODE_ENV]: spec.mode } : {}),
  });

const xml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * launchd has no ordering: each service is bootstrapped on its own, and the hub
 * may well not be up when the dashboard or the daemon starts. That costs
 * nothing, because every service already tolerates the others being absent —
 * the daemon reconnects with backoff, the dashboard proxies on demand — which
 * is also why systemd gets `Wants=` rather than `Requires=`.
 *
 * launchd having no ordering primitive does not make the ordering untrue, so a
 * spec that has one records it as an XML comment: launchd ignores it, and the
 * person reading `~/Library/LaunchAgents` to work out why the daemon started
 * before sessiond finds the answer written down where they are already looking.
 * It is documentation in the artefact, never enforcement.
 */
const CAWCO_SIBLING_SERVICE = /^cawco-(.+)\.service$/;

const orderingComment = (spec: ServiceSpec): string => {
  // Only sibling cawco services mean anything under launchd; systemd targets
  // like `network-online.target` have no launchd counterpart to name.
  const siblings = spec.after
    .map((target) => CAWCO_SIBLING_SERVICE.exec(target)?.[1])
    .filter((id): id is string => id !== undefined && isServiceId(id))
    .map((id) => label(id as ServiceId));
  if (siblings.length === 0) {
    return "";
  }
  return `\n  <!-- ordering: starts after ${siblings.join(", ")} — launchd has no ordering, so this is recorded, not enforced -->`;
};

const plist = (
  spec: ServiceSpec
): string => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>${orderingComment(spec)}
  <key>Label</key>
  <string>${xml(label(spec.id))}</string>
  <key>ProgramArguments</key>
  <array>
${spec.command.map((argument) => `    <string>${xml(argument)}</string>`).join("\n")}
  </array>
${
  spec.socket
    ? `  <key>Sockets</key>
  <dict>
    <key>${xml(spec.socket.name)}</key>
    <dict>
      <key>SockNodeName</key>
      <string>${xml(spec.socket.host)}</string>
      <key>SockServiceName</key>
      <string>${xml(spec.socket.port)}</string>
    </dict>
  </dict>
`
    : ""
}  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
${
  spec.restartOnSuccess
    ? "  <true/>"
    : `  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>`
}
  <key>EnvironmentVariables</key>
  <dict>
${environment(spec)
  .map(
    ([key, value]) =>
      `    <key>${xml(key)}</key>\n    <string>${xml(value)}</string>`
  )
  .join("\n")}
  </dict>
  <key>WorkingDirectory</key>
  <string>${xml(spec.workingDirectory)}</string>
  <key>StandardOutPath</key>
  <string>${xml(launchAgentLog(spec.id))}</string>
  <key>StandardErrorPath</key>
  <string>${xml(launchAgentLog(spec.id))}</string>
</dict>
</plist>
`;

/**
 * `StartLimitIntervalSec=0` because the default gives up after five restarts in
 * ten seconds and leaves the unit wedged until someone runs `reset-failed` — a
 * crash loop should stay a crash loop, visible and still trying, rather than
 * quietly become a stopped service.
 */
const unit = (spec: ServiceSpec): string => `[Unit]
Description=${spec.description}
${[
  // A service with neither — sessiond — would otherwise contribute a blank line.
  ...(spec.requires ?? []).map((target) => `Requires=${target}`),
  ...spec.wants.map((target) => `Wants=${target}`),
  ...spec.after.map((target) => `After=${target}`),
  "StartLimitIntervalSec=0",
].join("\n")}

[Service]
ExecStart=${spec.command.join(" ")}
WorkingDirectory=${spec.workingDirectory}
${environment(spec)
  .map(([key, value]) => `Environment=${key}=${value}`)
  .join("\n")}
Restart=${spec.restartOnSuccess ? "always" : "on-failure"}
RestartSec=${spec.restartSec}${spec.oomContinue ? "\nOOMPolicy=continue" : ""}

[Install]
WantedBy=default.target
`;

/**
 * The listening socket systemd holds for a socket-activated service. The
 * service unit of the same name is the one it starts; `FileDescriptorName=` is
 * what the service collects it by. `NoDelay=` because every byte on it is an
 * interactive page load.
 */
const socketUnit = (
  spec: ServiceSpec,
  socket: NonNullable<ServiceSpec["socket"]>
): string => `[Unit]
Description=${spec.description} socket

[Socket]
ListenStream=${socket.host}:${socket.port}
FileDescriptorName=${socket.name}
NoDelay=true

[Install]
WantedBy=sockets.target
`;

const run = async (argv: string[]) =>
  Bun.$`${argv}`
    .env({
      ...process.env,
      // logind owns this directory; su shells need not inherit its location.
      ...(platform() === "linux"
        ? {
            XDG_RUNTIME_DIR:
              process.env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid?.()}`,
          }
        : {}),
    })
    .quiet()
    .nothrow();

const failed = (
  what: string,
  result: Awaited<ReturnType<typeof run>>
): ServiceError =>
  new ServiceError(
    `${what} failed: ${result.stderr.toString().trim() || `exit ${result.exitCode}`}`
  );

const guiDomain = (): string => `gui/${process.getuid?.() ?? 0}`;

/**
 * `bootstrap` and `kickstart` replaced `load` in the launchd rewrite, and `load`
 * is still there as a deprecated alias on the systems that have both — so which
 * one exists is asked rather than assumed from the OS version.
 */
const launchctlHas = async (subcommand: string): Promise<boolean> => {
  // `launchctl help` writes its subcommand list to stderr on some releases.
  const help = await run(["launchctl", "help"]);
  return `${help.stdout.toString()}${help.stderr.toString()}`.includes(
    subcommand
  );
};

const hasBootstrap = (): Promise<boolean> => launchctlHas("bootstrap");

/**
 * A service definition someone else can rewrite is a service someone else can
 * run as you, so it is written owner-only — and set on the way out, because a
 * file that already existed keeps the mode it had.
 */
const writeUnit = async (path: string, contents: string): Promise<void> => {
  await Bun.write(path, contents);
  await chmod(path, 0o600);
};

/**
 * Puts whatever the plist now says in front of launchd, replacing whatever it
 * was running under that label — which is both what an install over a running
 * service means and what a restart means on a launchctl too old for `kickstart`.
 */
/** How long a booted-out LaunchAgent gets to finish exiting. */
const BOOTOUT_WAIT_MS = 60_000;

const loadLaunchAgent = async (
  spec: ServiceSpec,
  bootstrap: boolean,
  note: (line: string) => void
): Promise<void> => {
  const path = launchAgentPath(spec.id);
  const target = `${guiDomain()}/${label(spec.id)}`;
  // launchd refuses to bootstrap a label it already knows.
  await run(["launchctl", "bootout", target]);
  // …and `bootout` returns before the label is gone: a service that drains on
  // SIGTERM (sessiond, taking its children down) is still being torn down,
  // and bootstrapping it then fails with "5: Input/output error" and leaves it
  // stopped. So the label is waited out first.
  const deadline = Date.now() + BOOTOUT_WAIT_MS;
  // biome-ignore lint/performance/noAwaitInLoops: a poll — each check must see launchd after the previous wait
  while ((await run(["launchctl", "print", target])).exitCode === 0) {
    if (Date.now() > deadline) {
      throw new ServiceError(
        `${target} was still loaded ${BOOTOUT_WAIT_MS / 1000}s after launchctl bootout, so it was not started again from the new plist. Check it with \`launchctl print ${target}\`, then run this again.`
      );
    }
    await Bun.sleep(250);
  }

  if (bootstrap) {
    const bootstrapped = await run([
      "launchctl",
      "bootstrap",
      guiDomain(),
      path,
    ]);
    if (bootstrapped.exitCode !== 0) {
      throw failed("launchctl bootstrap", bootstrapped);
    }
    note(`bootstrapped into ${guiDomain()}`);
  } else {
    const loaded = await run(["launchctl", "load", "-w", path]);
    if (loaded.exitCode !== 0) {
      throw failed("launchctl load", loaded);
    }
    note("loaded (legacy launchctl)");
  }
};

/**
 * Writes and bootstraps LaunchAgents into the logged-in user's GUI domain.
 * Exported so a throwaway probe can go through this exact path to show what a
 * service the installer starts can do on a given Mac.
 */
export const installLaunchAgents = async (
  specs: ServiceSpec[],
  note: (line: string) => void
): Promise<void> => {
  const bootstrap = await hasBootstrap();
  // launchd opens stdout/stderr before any process can create its log folder.
  await mkdir(dirname(launchAgentLog("hub")), { recursive: true });

  for (const [index, spec] of specs.entries()) {
    if (index > 0) {
      note("");
    }
    const path = launchAgentPath(spec.id);
    const text = plist(spec);
    // A job launchd holds a socket for keeps it only while it stays loaded:
    // booting it out closes the socket, and a page load in that gap is refused.
    // So an unchanged, loaded one is left running — a deploy restarts it with
    // `kickstart -k`, which keeps the socket.
    if (
      spec.socket &&
      // biome-ignore lint/performance/noAwaitInLoops: services install one at a time so each one's notes print in its own order and a failure is attributable to the service that caused it.
      (await Bun.file(path)
        .text()
        .catch(() => "")) === text &&
      (await run(["launchctl", "print", `${guiDomain()}/${label(spec.id)}`]))
        .exitCode === 0
    ) {
      note(`${path} is unchanged and loaded, so its socket stays open`);
      continue;
    }
    await writeUnit(path, text);
    note(`wrote ${path}`);

    await loadLaunchAgent(spec, bootstrap, note);

    note(`logs ${launchAgentLog(spec.id)}`);
    if (spec.launchAgentNote) {
      note("");
      for (const line of spec.launchAgentNote) {
        note(line);
      }
    }
  }
};

const uninstallLaunchAgents = async (
  specs: ServiceSpec[],
  note: (line: string) => void
): Promise<void> => {
  const bootstrap = await hasBootstrap();
  for (const spec of specs) {
    const path = launchAgentPath(spec.id);
    if (bootstrap) {
      // biome-ignore lint/performance/noAwaitInLoops: services uninstall one at a time so each one's notes print in its own order and a failure is attributable to the service that caused it.
      await run(["launchctl", "bootout", `${guiDomain()}/${label(spec.id)}`]);
    } else {
      await run(["launchctl", "unload", "-w", path]);
    }
    await Bun.file(path)
      .delete()
      .catch(() => {
        // best effort: the plist may already be gone
      });
    note(`removed ${path}`);
  }
};

/**
 * Without lingering, systemd tears the user manager down at logout and takes the
 * services with it — the same "it dies when I disconnect" they are meant to
 * fix. Only worth saying when it is actually off.
 */
const lingerHint = async (note: (line: string) => void): Promise<void> => {
  const user = process.env.USER ?? "";
  const shown = await run(["loginctl", "show-user", user, "--property=Linger"]);
  if (shown.exitCode !== 0 || shown.stdout.toString().includes("Linger=yes")) {
    return;
  }
  note("");
  note(
    "This user has no persistent session, so the services stop at logout. Fix with:"
  );
  note(`  sudo loginctl enable-linger ${user}`);
};

/**
 * Lingering must already be on for this user: the installer turns it on before
 * placing anything, and a machine whose services stop at logout has not joined
 * anything, so this says exactly what is missing rather than guess.
 */
export const requireLinger = async (
  note: (line: string) => void
): Promise<void> => {
  // sd_booted(3): systemd as PID 1 is exactly when this directory exists.
  // Without it there is no user manager to linger and no unit to install, so
  // the answer is what the machine is missing, not a loginctl command that
  // cannot work there.
  note("checking for systemd…");
  if (!existsSync("/run/systemd/system")) {
    throw new ServiceError(
      "this machine is not running systemd (no /run/systemd/system), and cawco's services are systemd user units, so there is nothing here to install them into. Add a machine whose init is systemd."
    );
  }
  // The name comes from the system, never from an environment variable.
  const name = (await run(["id", "-un"])).stdout.toString().trim();
  const current = await run([
    "loginctl",
    "show-user",
    name,
    "--property=Linger",
    "--value",
  ]);
  if (current.exitCode !== 0 || current.stdout.toString().trim() !== "yes") {
    throw new ServiceError(
      `lingering is off for ${name}, so systemd would stop this machine's services when its last session closes. Turn it on, then run this again:\n  loginctl enable-linger ${name}\nIf that is refused, ask an administrator to run:\n  sudo loginctl enable-linger ${name}`
    );
  }
};

/**
 * Puts a service's listening socket in front of systemd, and says whether that
 * socket has to be (re)bound: it is not listening yet, or it is listening on an
 * address the unit no longer names. Called before the daemon-reload, so the
 * text on disk is still the one systemd is running.
 */
const writeSocketUnit = async (
  spec: ServiceSpec,
  socket: NonNullable<ServiceSpec["socket"]>,
  note: (line: string) => void
): Promise<boolean> => {
  const path = socketPath(spec.id);
  const text = socketUnit(spec, socket);
  const before = await Bun.file(path)
    .text()
    .catch(() => "");
  await writeUnit(path, text);
  note(`wrote ${path}`);
  const active = await run([
    "systemctl",
    "--user",
    "is-active",
    socketName(spec.id),
  ]);
  return active.stdout.toString().trim() !== "active" || before !== text;
};

/**
 * Binds a service's socket. The service is stopped first: whatever holds the
 * port while the socket is down is that service binding it itself — an install
 * from before it was socket-activated — and a socket cannot bind a port that
 * is taken. Only ever run when the socket is down or moving, so a service
 * already serving on its socket is never stopped here.
 */
const bindSocket = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  const stopped = await run(["systemctl", "--user", "stop", unitName(spec.id)]);
  if (stopped.exitCode !== 0) {
    throw failed("systemctl --user stop", stopped);
  }
  const bound = await run([
    "systemctl",
    "--user",
    "restart",
    socketName(spec.id),
  ]);
  if (bound.exitCode !== 0) {
    throw failed("systemctl --user restart", bound);
  }
  const enabled = await run([
    "systemctl",
    "--user",
    "enable",
    socketName(spec.id),
  ]);
  if (enabled.exitCode !== 0) {
    throw failed("systemctl --user enable", enabled);
  }
  note(`listening on ${socketName(spec.id)}`);
};

const installSystemdUnits = async (
  specs: ServiceSpec[],
  note: (line: string) => void
): Promise<void> => {
  const rebind = new Set<ServiceId>();
  for (const spec of specs) {
    // biome-ignore lint/performance/noAwaitInLoops: units write one at a time so each one's note prints in its own order and a failure is attributable to the unit that caused it.
    if (spec.socket && (await writeSocketUnit(spec, spec.socket, note))) {
      rebind.add(spec.id);
    }
    await writeUnit(systemdPath(spec.id), unit(spec));
    note(`wrote ${systemdPath(spec.id)}`);
  }

  // Once for the set: systemd re-reads every file it was handed, and enabling a
  // unit it has not read yet is what makes an install look like it did nothing.
  const reloaded = await run(["systemctl", "--user", "daemon-reload"]);
  if (reloaded.exitCode !== 0) {
    throw failed("systemctl --user daemon-reload", reloaded);
  }

  for (const spec of specs) {
    if (rebind.has(spec.id)) {
      // biome-ignore lint/performance/noAwaitInLoops: units enable one at a time, each socket listening before its service starts, so each one's notes print in its own order and a failure is attributable to the unit that caused it.
      await bindSocket(spec, note);
    }
    const enabled = await run([
      "systemctl",
      "--user",
      "enable",
      "--now",
      unitName(spec.id),
    ]);
    if (enabled.exitCode !== 0) {
      throw failed("systemctl --user enable --now", enabled);
    }
    note(`enabled and started ${unitName(spec.id)}`);
    note(`logs journalctl --user -u ${unitName(spec.id)} -f`);
  }

  await lingerHint(note);
};

const uninstallSystemdUnits = async (
  specs: ServiceSpec[],
  note: (line: string) => void
): Promise<void> => {
  for (const spec of specs) {
    // biome-ignore lint/performance/noAwaitInLoops: units uninstall one at a time so each one's notes print in its own order and a failure is attributable to the unit that caused it.
    await run(["systemctl", "--user", "disable", "--now", unitName(spec.id)]);
    await Bun.file(systemdPath(spec.id))
      .delete()
      .catch(() => {
        // best effort: the unit file may already be gone
      });
    note(`removed ${systemdPath(spec.id)}`);
    if (spec.socket) {
      await run([
        "systemctl",
        "--user",
        "disable",
        "--now",
        socketName(spec.id),
      ]);
      await Bun.file(socketPath(spec.id))
        .delete()
        .catch(() => {
          // best effort: the socket unit may already be gone
        });
      note(`removed ${socketPath(spec.id)}`);
    }
  }
  await run(["systemctl", "--user", "daemon-reload"]);
};

/** What the hub reports for one machine's daemon. */
interface BusyReport {
  /** Sessions on this machine with a turn in flight. */
  busy: number;
  instances: string[];
  ready: boolean;
}

/**
 * How many of this machine's sessions are mid-turn, or `unknown` when the hub
 * could not be asked at all — it is down, or it is old enough not to have the
 * route. A hub that cannot answer is never read as an idle one.
 */
const agentBusy = async (): Promise<number | "unknown"> => {
  const hub = await joinedHub();
  if (!hub) {
    return "unknown";
  }
  // Imported here rather than at the top so no other verb pays for the agent SDK.
  const { machineId } = await import("@cawco/agent");
  const report = await probeJson<BusyReport>(
    `${hub}/api/agents/${await machineId()}/busy`
  );
  return report?.ready === true && typeof report.busy === "number"
    ? report.busy
    : "unknown";
};

export interface RestartRequest {
  /** What {@link agentBusy} found, or `0` for a service that hosts no sessions. */
  readonly busy: number | "unknown";
  readonly force: boolean;
  /**
   * Which session-hosting service is being restarted. Only the wording of a
   * refusal depends on it — the gate itself is the same one, which is the
   * point: sessiond earns the daemon's protection by going through here.
   */
  readonly id?: "agent" | "sessiond";
  readonly whenIdle: boolean;
}

export type RestartDecision =
  | { readonly kind: "go" }
  | { readonly kind: "wait"; readonly busy: number }
  | { readonly kind: "refuse"; readonly reason: string };

const sessions = (count: number): string =>
  `${count} session${count === 1 ? "" : "s"}`;

/**
 * What restarting each session-hosting service actually costs, said in the
 * refusal. They are not the same sentence: the daemon loses the turn it is
 * relaying, while sessiond takes the harness children down with it — the
 * `KillMode=control-group` on its own unit, doing exactly what it is for.
 */
const RESTART_COST: Record<"agent" | "sessiond", string> = {
  agent: "a restart ends that work",
  sessiond:
    "a restart kills the harness children in its cgroup and ends that work",
};

/**
 * Whether restarting the daemon now is allowed to interrupt what it is doing.
 * The daemon is the one service that hosts the user's work, so the only way to
 * restart it while it is busy — or while nobody can say whether it is — is to
 * ask for that outright.
 */
export const restartDecision = ({
  busy,
  whenIdle,
  force,
  id = "agent",
}: RestartRequest): RestartDecision => {
  if (force) {
    return { kind: "go" };
  }
  if (busy === "unknown") {
    return {
      kind: "refuse",
      reason: `could not ask the hub whether this machine is busy, and restarting the ${id} blind ends whatever turn is in flight. Restart anyway with --force.`,
    };
  }
  if (busy === 0) {
    return { kind: "go" };
  }
  if (whenIdle) {
    return { kind: "wait", busy };
  }
  return {
    kind: "refuse",
    reason: `the ${id} on this machine is mid-turn in ${sessions(busy)}, and ${RESTART_COST[id]}. Wait for it to finish with --when-idle, or restart anyway with --force.`,
  };
};

/** How often `--when-idle` asks again, and how long it keeps asking. */
const IDLE_POLL_MS = 2000;
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;

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

const waitForIdle = async (
  busy: number,
  note: (line: string) => void
): Promise<void> => {
  const deadline = Date.now() + IDLE_TIMEOUT_MS;
  let outstanding = busy;
  try {
    for (;;) {
      waiting(`waiting for ${sessions(outstanding)} to finish…`);
      // biome-ignore lint/performance/noAwaitInLoops: a retry poll — each wait must see the effect of the previous one before deciding whether to keep polling.
      await Bun.sleep(IDLE_POLL_MS);
      const now = await agentBusy();
      // The hub going away mid-wait is the same not-knowing as never reaching it.
      if (now === "unknown") {
        throw new ServiceError(
          "the hub stopped answering while waiting, so the agent was left alone. Restart anyway with --force."
        );
      }
      if (now === 0) {
        break;
      }
      outstanding = now;
      if (Date.now() > deadline) {
        throw new ServiceError(
          `${sessions(outstanding)} still mid-turn after ${IDLE_TIMEOUT_MS / 60_000} minutes, so the agent was left alone. Try again, or restart anyway with --force.`
        );
      }
    }
  } finally {
    // Whatever happened, the line that was rewriting itself is finished with.
    if (process.stdout.isTTY) {
      process.stdout.write("\n");
    }
  }
  note("every session finished");
};

/**
 * The services that hold the user's work, and so the ones whose restart has to
 * be asked for. The hub and the dashboard hold nothing a restart can interrupt;
 * the daemon is relaying live turns, and sessiond owns the processes producing
 * them.
 */
const HOSTS_SESSIONS: readonly ServiceId[] = ["sessiond", "agent"];

/**
 * Asked before a session-hosting service is restarted. One machine's busy count
 * answers for both of them: they are the two ends of the same sessions, so
 * `--when-idle` and `--force` mean the same thing on either.
 */
const clearToRestart = async (
  spec: ServiceSpec,
  { whenIdle, force }: Pick<RestartRequest, "whenIdle" | "force">,
  note: (line: string) => void
): Promise<void> => {
  if (!HOSTS_SESSIONS.includes(spec.id)) {
    return;
  }
  const busy = await agentBusy();
  const decision = restartDecision({
    busy,
    whenIdle,
    force,
    id: spec.id as "agent" | "sessiond",
  });
  switch (decision.kind) {
    case "go":
      return;
    case "refuse":
      throw new ServiceError(decision.reason);
    case "wait":
      return waitForIdle(decision.busy, note);
    default:
      throw new ServiceError("unreachable: unknown restart decision kind");
  }
};

const restartLaunchAgent = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  if (!existsSync(launchAgentPath(spec.id))) {
    throw new ServiceError(
      `${spec.id} is not installed — \`cawco service install ${spec.id}\` first.`
    );
  }
  if (await launchctlHas("kickstart")) {
    const kicked = await run([
      "launchctl",
      "kickstart",
      "-k",
      `${guiDomain()}/${label(spec.id)}`,
    ]);
    if (kicked.exitCode !== 0) {
      throw failed("launchctl kickstart -k", kicked);
    }
  } else {
    await loadLaunchAgent(spec, await hasBootstrap(), note);
  }
  note(`restarted ${label(spec.id)}`);
};

const restartSystemdUnit = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  if (!existsSync(systemdPath(spec.id))) {
    throw new ServiceError(
      `${spec.id} is not installed — \`cawco service install ${spec.id}\` first.`
    );
  }
  const restarted = await run([
    "systemctl",
    "--user",
    "restart",
    unitName(spec.id),
  ]);
  if (restarted.exitCode !== 0) {
    throw failed("systemctl --user restart", restarted);
  }
  note(`restarted ${unitName(spec.id)}`);
};

/** Stops one installed service and leaves it stopped. */
export const stopService = async (id: ServiceId): Promise<void> => {
  const stopped =
    platform() === "darwin"
      ? await run(["launchctl", "bootout", `${guiDomain()}/${label(id)}`])
      : await run(["systemctl", "--user", "stop", unitName(id)]);
  if (stopped.exitCode !== 0) {
    throw failed(`stopping ${id}`, stopped);
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

const LAUNCHCTL_PID = /"PID"\s*=\s*(\d+)/;

const launchAgentStatus = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  const listed = await run(["launchctl", "list", label(spec.id)]);
  const pid = LAUNCHCTL_PID.exec(listed.stdout.toString())?.[1];
  note(`service  ${spec.id} (${label(spec.id)})`);
  note(`unit     ${launchAgentPath(spec.id)}`);
  let state: string;
  if (listed.exitCode !== 0) {
    state = "not loaded";
  } else if (pid) {
    state = `running (pid ${pid})`;
  } else {
    state = "loaded, not running";
  }
  note(`state    ${state}`);
  note(`mode     ${await modeLine(spec, launchAgentPath(spec.id))}`);
  const live = await spec.probe();
  if (live) {
    note(`live     ${live}`);
  }
  note(`logs     ${launchAgentLog(spec.id)}`);
};

const systemdStatus = async (
  spec: ServiceSpec,
  note: (line: string) => void
): Promise<void> => {
  const active = await run([
    "systemctl",
    "--user",
    "is-active",
    unitName(spec.id),
  ]);
  const enabled = await run([
    "systemctl",
    "--user",
    "is-enabled",
    unitName(spec.id),
  ]);
  note(`service  ${spec.id} (${unitName(spec.id)})`);
  note(`unit     ${systemdPath(spec.id)}`);
  note(
    `state    ${active.stdout.toString().trim() || "unknown"} (${enabled.stdout.toString().trim() || "not installed"})`
  );
  if (spec.socket) {
    const listening = await run([
      "systemctl",
      "--user",
      "is-active",
      socketName(spec.id),
    ]);
    note(
      `socket   ${socketName(spec.id)} ${listening.stdout.toString().trim() || "unknown"} on ${spec.socket.host}:${spec.socket.port}`
    );
  }
  note(`mode     ${await modeLine(spec, systemdPath(spec.id))}`);
  const live = await spec.probe();
  if (live) {
    note(`live     ${live}`);
  }
  note(`logs     journalctl --user -u ${unitName(spec.id)} -f`);
};

/** How many lines of a service's history are worth reading without asking for more. */
const LOG_TAIL_LINES = 200;

const launchAgentLogs = async (
  spec: ServiceSpec,
  follow: boolean
): Promise<void> => {
  const path = launchAgentLog(spec.id);
  if (!(await Bun.file(path).exists())) {
    throw new ServiceError(`no log yet at ${path} — is the service installed?`);
  }
  const tail = follow
    ? ["tail", "-n", `${LOG_TAIL_LINES}`, "-f"]
    : ["tail", "-n", `${LOG_TAIL_LINES}`];
  await Bun.spawn([...tail, path], { stdio: ["inherit", "inherit", "inherit"] })
    .exited;
};

const systemdLogs = async (
  spec: ServiceSpec,
  follow: boolean
): Promise<void> => {
  const journal = [
    "journalctl",
    "--user",
    "-u",
    unitName(spec.id),
    "-n",
    `${LOG_TAIL_LINES}`,
  ];
  if (follow) {
    journal.push("-f");
  }
  await Bun.spawn(journal, { stdio: ["inherit", "inherit", "inherit"] }).exited;
};

export interface ServiceOptions {
  /** Verified binary install: every unit starts through the wrapper, which picks the build from the `current` and `keeper` links. */
  binaryLayout?: {
    executable: string;
    wrapper: string;
  };
  follow: boolean;
  /** `restart` only: interrupt them, or restart without knowing whether it will. */
  force: boolean;
  /** Which services the verb acts on. `logs` reads exactly one. */
  ids: readonly ServiceId[];
  /** Which flavour `install` writes. Every other verb reads the mode off disk. */
  mode: ServiceMode;
  note: (line: string) => void;
  /** `restart` only: wait for the daemon's sessions rather than refusing. */
  whenIdle: boolean;
}

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
  const layout: Layout = binaryLayout
    ? {
        root: dirname(binaryLayout.executable),
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
        sessiond: {
          command: [binaryLayout.wrapper, "sessiond"],
          needs: binaryLayout.executable,
        },
        dashboardBuild: binaryLayout.executable,
        dashboardCwd: homedir(),
      }
    : HERE;
  const specs = ids.map((id) => specFor(id, mode, layout));
  if (binaryLayout) {
    for (const spec of specs) {
      (spec.environment as Record<string, string>).CAWCO_BINARY_ROOT = dirname(
        dirname(binaryLayout.executable)
      );
    }
  }

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
        : uninstallSystemdUnits(specs, note);
    case "restart":
      for (const [index, spec] of specs.entries()) {
        if (index > 0) {
          note("");
        }
        // Asked per service and not up front, so the two that are safe to bounce
        // are already back up by the time the daemon's question is answered.
        // biome-ignore lint/performance/noAwaitInLoops: services restart one at a time so each one's notes print in its own order and a failure is attributable to the service that caused it.
        await clearToRestart(spec, { whenIdle, force }, note);
        await (mac
          ? restartLaunchAgent(spec, note)
          : restartSystemdUnit(spec, note));
      }
      return;
    case "status":
      for (const [index, spec] of specs.entries()) {
        if (index > 0) {
          note("");
        }
        // biome-ignore lint/performance/noAwaitInLoops: services are checked one at a time so each one's status prints in its own order.
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

/**
 * One child sessiond spawned, as the ad-hoc ledger records it. `startTicks` is
 * the process's start time as its own OS reports it — field 22 of
 * `/proc/<pid>/stat` on linux (`proc_pid_stat(5)`), the `ps -o lstart=` string
 * on darwin. It is carried opaquely: nothing compares two of them for order,
 * only for equality against the same source.
 */
export interface LedgerEntry {
  readonly pid: number;
  readonly startTicks: string;
}

/**
 * The ad-hoc ledger, next to the socket it belongs to (design §11). Only
 * `cawco up` in a terminal ever writes it: under service management the
 * cgroup gives the same guarantee for free, and this file is not consulted.
 */
export const sessiondLedgerPath = (): string =>
  join(dirname(sessiondSocket()), "sessiond-children.json");

export const readSessiondLedger = async (
  path = sessiondLedgerPath()
): Promise<LedgerEntry[]> => {
  const parsed = await Bun.file(path)
    .json()
    .catch(() => undefined);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.filter(
    (entry): entry is LedgerEntry =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as LedgerEntry).pid === "number" &&
      typeof (entry as LedgerEntry).startTicks === "string"
  );
};

export const writeSessiondLedger = async (
  entries: readonly LedgerEntry[],
  path = sessiondLedgerPath()
): Promise<void> => {
  await Bun.write(path, `${JSON.stringify(entries)}\n`);
  await chmod(path, 0o600);
};

/**
 * Field 22 of `/proc/<pid>/stat`, which cannot be had by splitting the line on
 * spaces: field 2 is the executable name in parentheses and may contain both
 * spaces and `)`. Everything up to the *last* `)` is therefore dropped first,
 * after which field 3 is token 0 and field 22 is token 19.
 */
const PROC_STAT_FIELD_SEP = /\s+/;

export const parseProcStartTicks = (stat: string): string | undefined => {
  const close = stat.lastIndexOf(")");
  if (close < 0) {
    return undefined;
  }
  const fields = stat
    .slice(close + 1)
    .trim()
    .split(PROC_STAT_FIELD_SEP);
  return fields[19];
};

/**
 * The start-time marker for a live pid, or `undefined` if nothing is running
 * under it. Reading it is the whole point of the ledger: a pid alone is a
 * number the kernel hands out again, and killing a recycled one is killing a
 * stranger's process.
 */
export const processStartMarker = async (
  pid: number
): Promise<string | undefined> => {
  if (platform() === "darwin") {
    const shown = await run(["ps", "-o", "lstart=", "-p", `${pid}`]);
    if (shown.exitCode !== 0) {
      return undefined;
    }
    return shown.stdout.toString().trim() || undefined;
  }
  const stat = await Bun.file(`/proc/${pid}/stat`)
    .text()
    .catch(() => undefined);
  return stat === undefined ? undefined : parseProcStartTicks(stat);
};

/**
 * Which ledger entries are still the process they were written for. An entry
 * whose pid is gone is nothing; an entry whose pid is back with a different
 * start time is somebody else's process and is left strictly alone. Taking the
 * marker source as an argument is what makes this decision testable without a
 * process to kill.
 */
export const liveOrphans = async (
  entries: readonly LedgerEntry[],
  marker: (pid: number) => Promise<string | undefined> = processStartMarker
): Promise<LedgerEntry[]> => {
  const markers = await Promise.all(entries.map((entry) => marker(entry.pid)));
  return entries.filter((entry, index) => markers[index] === entry.startTicks);
};

/**
 * How long an orphan gets between SIGTERM and SIGKILL. Our choice, matched to
 * the 2 s `RestartSec` the services already use: these are children of a
 * sessiond that is already gone, so there is nobody left to hand their output
 * to and nothing to wait politely for.
 */
const ORPHAN_GRACE_MS = 2000;

const signalOrphan = (entry: LedgerEntry, signal: NodeJS.Signals): boolean => {
  try {
    process.kill(entry.pid, signal);
    return true;
  } catch {
    // Already gone, or not ours to signal. Either way there is nothing to do.
    return false;
  }
};

/**
 * The ad-hoc crash sweep: children a dead sessiond left reparented to PID 1,
 * killed on the next start. Only ever right for the ad-hoc path — a service
 * install gets this from `KillMode=control-group` and must not run it, because
 * under systemd the ledger's contents are already dead and the pids reusable.
 *
 * Returns what it actually killed, and empties the ledger either way: whatever
 * it said is now answered.
 */
export const sweepSessiondOrphans = async (
  note: (line: string) => void,
  path = sessiondLedgerPath()
): Promise<LedgerEntry[]> => {
  const entries = await readSessiondLedger(path);
  if (entries.length === 0) {
    return [];
  }
  const orphans = await liveOrphans(entries);
  for (const orphan of orphans) {
    signalOrphan(orphan, "SIGTERM");
    note(
      `sweeping orphaned child pid ${orphan.pid} left by a previous sessiond`
    );
  }
  if (orphans.length > 0) {
    await Bun.sleep(ORPHAN_GRACE_MS);
    // Re-checked rather than assumed: the pid may have exited on the SIGTERM
    // and been handed straight back out, and the start time is what says so.
    for (const stubborn of await liveOrphans(orphans)) {
      signalOrphan(stubborn, "SIGKILL");
    }
  }
  await Bun.file(path)
    .delete()
    .catch(() => {
      // best effort: the ledger file may already be gone
    });
  return orphans;
};
