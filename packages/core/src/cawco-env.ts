/**
 * CawCo's environment variables, by name ({@link CAWCO_ENV}): a file of its
 * own that imports nothing, so a process that must not load core's index
 * (the srt host a workspace's boundary runs, agent boundary-host.ts, through
 * session-env.ts) reads the same registry. Core's index re-exports it.
 */

/**
 * Every environment variable cawco reads, by the name it is spelled on a
 * machine. This is the inventory: a variable that is not in here is one nobody
 * will find next time, so add it here first and read it through
 * {@link readEnv}.
 *
 * Four call sites read a name below as a bare literal, and are meant to. Each
 * runs somewhere this module cannot be imported, not somewhere the registry
 * does not apply — being listed here is what keeps them findable:
 * `packages/hub/drizzle.config.ts` (drizzle-kit bundles it with its own loader
 * and never resolves workspace TypeScript), `apps/dashboard/serve.js` and
 * `vite.config.ts` (outside the app bundle), and the opencode handoff plugin
 * source in `packages/agent/src/harnesses/opencode.ts` (a string executed in
 * the opencode child process).
 */
export const CAWCO_ENV = {
  hubUrl: "CAWCO_HUB_URL",
  /**
   * The hub the dashboard's `vite dev` server talks to, and the only one: a
   * dev server reads no other variable and has no default, and refuses to
   * start without it. The fleet exports `CAWCO_HUB_URL` into every session's
   * shell and never this, so a leaf's test pages reach the live hub only
   * when the leaf names it here on purpose. The `--dev` service unit does.
   */
  devHubUrl: "CAWCO_DEV_HUB_URL",
  hubPort: "CAWCO_HUB_PORT",
  /**
   * The ports the hub's preview listeners take, `first-last` (default: the
   * hundred after the hub's own port): one per session whose preview or
   * canvas is in use, so each preview is an origin of its own; in host mode
   * the first one routes every preview by its Host.
   */
  previewPorts: "CAWCO_PREVIEW_PORTS",
  machineId: "CAWCO_MACHINE_ID",
  /** `1` stops the hub advertising itself over mDNS. */
  noMdns: "CAWCO_NO_MDNS",
  /**
   * `1` turns on the hub's debug log lines: per-frame traces a production
   * log should not carry: routines.ts's run sessions' frames, suggest.ts's
   * and meaning.ts's per-call Jev lines, git-remote.ts's per-object LFS
   * lines. Scratch fleets run their hub with it on.
   */
  debug: "CAWCO_DEBUG",
  /**
   * Overrides the socket `sessiondEndpoint()` derives — the daemon listens on
   * it and every client dials it, so both ends must read the same variable.
   */
  sessiondEndpoint: "CAWCO_SESSIOND_ENDPOINT",
  /**
   * Set by sessiond in each child it starts, a value of that child's own,
   * and inherited by everything the child starts: when the child ends, every
   * process still carrying it is ended with it, wherever it went (sessiond
   * server.ts `readTree`). Read by sessiond alone, from other processes'
   * environments.
   */
  sessiondTree: "CAWCO_SESSIOND_TREE",
  /** Where the links the hub hands out point. */
  dashboardUrl: "CAWCO_DASHBOARD_URL",
  /**
   * The dashboard's port on the hub's machine when it is not
   * {@link localDashboardPort}: a scratch fleet's, which serves its
   * dashboard on a port of its own beside the loopback port its agents
   * carry. The installer writes none (hub config.ts `DASHBOARD_PORT`).
   */
  dashboardPort: "CAWCO_DASHBOARD_PORT",
  /** The dashboard's port, on the hub's machine and every computer's loopback ({@link localDashboardPort}). */
  localDashboardPort: "CAWCO_LOCAL_DASHBOARD_PORT",
  /** The loopback port the hub's relay receiver listens on (default: one the OS picks free). */
  relayPort: "CAWCO_RELAY_PORT",
  /**
   * Days a project's fact line may go unused (no brief admitted it, no note
   * corroborated it) before the curator's run proposes moving it to
   * `knowledge/archive/` (hub memory.ts). Default in hub config.ts.
   */
  memoryArchiveDays: "CAWCO_MEMORY_ARCHIVE_DAYS",
  /**
   * A knowledge file's budget in characters: what one brief carries of it,
   * and the size at which the curator's run is asked to fold it (hub
   * memory.ts). Default in hub config.ts.
   */
  memoryFileChars: "CAWCO_MEMORY_FILE_CHARS",
  /** Where the hub's SQLite file lives, overriding the default data dir. */
  dbPath: "CAWCO_DB_PATH",
  /**
   * The session a shell belongs to, and its own credential: set in every
   * session's shell, so `cawco tool` there acts as that session and no other.
   */
  instanceId: "CAWCO_INSTANCE_ID",
  sessionCredential: "CAWCO_SESSION_CREDENTIAL",
  /**
   * Inside a workspace's boundary, which reaches none of the owner's
   * machines: the unix socket of the agent's door to the hub's two tool
   * routes, which `cawco tools` and `cawco tool` go through instead of the hub.
   */
  toolSocket: "CAWCO_TOOL_SOCKET",
  /**
   * The workspace whose Linux view an OpenCode server runs in (agent
   * opencode.ts, layer.ts): CawCo's plugin there takes every session of the
   * server as that workspace's, since views of one folder share its path.
   */
  viewWorkspace: "CAWCO_VIEW_WORKSPACE",
  /** Which service manager the installer targets: `systemd`, `launchd`, … */
  serviceMode: "CAWCO_SERVICE_MODE",
  /**
   * The port of the agent's MCP gateway ({@link mcpGatewayPort}). Unset on
   * every installed machine; a second agent on one host (a rig, a dev
   * checkout) names its own.
   */
  mcpPort: "CAWCO_MCP_PORT",
  /**
   * The port of the agent's DevTools gate (browser.ts `browserGatePort`).
   * Unset on every installed machine; a second agent on one host (a rig, a
   * scratch fleet) names its own.
   */
  browserGatePort: "CAWCO_BROWSER_GATE_PORT",
  /**
   * The stream relay journey's stand-ins (hub relay-journey.ts, agent
   * browser/relay.ts), each unset on every installed machine; a scratch
   * fleet names its own so no request leaves the machine: Cloudflare's API
   * origin (`https://api.cloudflare.com/client/v4`), the page listing
   * Cloudflare's IPv4 ranges, the DNS server the name check asks
   * (`host:port`) in place of the system's, the STUN server the agent asks
   * for its router's address.
   */
  cloudflareApi: "CAWCO_CLOUDFLARE_API",
  cloudflareIps: "CAWCO_CLOUDFLARE_IPS",
  relayDns: "CAWCO_RELAY_DNS",
  stunServer: "CAWCO_STUN_SERVER",
} as const;

/** One of {@link CAWCO_ENV}'s variable names. */
export type CawcoEnvVar = (typeof CAWCO_ENV)[keyof typeof CAWCO_ENV];

/**
 * Reads one of cawco's environment variables. Typed to the registry so a
 * variable cannot escape it as a bare literal again — which is how five of
 * them escaped in the first place.
 *
 * `env` is a parameter so callers that hold a child's environment — the
 * spawner, the installer's rendered unit — can resolve against it too.
 */
export const readEnv = (
  name: CawcoEnvVar,
  env: Record<string, string | undefined> = process.env
): string | undefined => env[name];
