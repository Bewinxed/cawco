#!/usr/bin/env bun
import { CONFIG_PATH, readConfig } from "@cawco/agent";
import type { AgentRow, AuthState } from "@cawco/core";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CAWCO_MDNS_TYPE,
  readEnv,
} from "@cawco/core";
import { protocolRange, runtimeCommit } from "@cawco/core/runtime";
import { discoverHub, type Hub } from "./discover";
import { clearToken, LoginError, login, saveToken } from "./login";
import {
  isServiceAction,
  isServiceId,
  SERVICE_ACTIONS,
  SERVICE_IDS,
  ServiceError,
  service,
} from "./service";

/** Reported by `--version`; keep in sync with package.json. */
/**
 * Injected by the release build from `packages/cli/package.json`, so the
 * binary cannot claim a version the manifest does not. `0.0.0-dev` is what a
 * checkout reports, which is true: a checkout is not a release.
 */
declare const __CAWCO_VERSION__: string | undefined;
const CLI_VERSION =
  typeof __CAWCO_VERSION__ === "string" ? __CAWCO_VERSION__ : "0.0.0-dev";

const HELP = `cawco ${CLI_VERSION} — join this machine to a cawco fleet

Usage
  cawco up [--hub <url>] [--verbose]      run the agent daemon on this machine
  cawco hub [--verbose]                   run the hub here
  cawco sessiond                          run this machine's session keeper
  cawco dashboard                         serve the built dashboard on its inherited socket
  cawco capabilities                      report optional machine tools and install commands
  cawco status [--hub <url>] [--verbose]  print the hub it found, and the fleet
  cawco service <${SERVICE_ACTIONS.join("|")}> [service...]
                                            run cawco as per-user services
  cawco binary-install <hub|agent> ...    setup step of the install script; not run by hand
  cawco login [--token <token>]           give this machine a Claude Code token
  cawco logout                            forget it

Services
  ${SERVICE_IDS.join(", ")} — each its own per-user service, started by systemd or
  launchd and kept up across reboots. \`install\`, \`uninstall\`, \`restart\` and
  \`status\` take any of them and act on all three when given none; \`logs\` takes
  exactly one. A machine nobody points a browser at wants \`agent\` alone.

  \`install --dev\` runs them out of the checkout instead of the build: the hub
  watches its own source and restarts itself on every edit, which costs nothing
  because the sessions live in the daemons and reconnect; the dashboard runs
  vite, which reloads an edited file without restarting at all. The agent is
  never watched in either mode — it hosts your sessions, and a restart ends
  whatever turn is in flight. \`status\` reads the mode back out of the unit.

  \`restart agent\` is therefore always deliberate: it asks the hub how many of
  this machine's sessions are mid-turn and refuses while any are. \`--when-idle\`
  waits up to five minutes for those turns to finish and then restarts; \`--force\`
  restarts regardless, and is also the only way through when the hub cannot be
  reached to answer the question at all.

Updating
  A machine updates itself from the app: automatically once it is idle, when
  auto-update is on, or when a person presses Install now. There is no update
  command, and running the install script again on an installed machine only
  reports what is installed.

Options
  --hub <url>     hub to use, as http://host:port or ws://host:port/ws
  --token <token> a \`claude setup-token\` token, for \`login\` without a terminal
  --dev           for \`service install\`: run from the checkout, watching it
  --when-idle     for \`service restart\`: wait for this machine's sessions first
  --force         for \`service restart\`: restart the agent mid-turn anyway
  --follow, -f    keep printing, for \`service logs\`
  --verbose       narrate the discovery ladder
  --help          this
  --version       print the version

Signing in
  The daemon runs Claude Code as you, so it needs the credentials you logged in
  with. Run it as a service — \`cawco service install\` — and on macOS it
  inherits your desktop session and reads them from the login keychain, which is
  the whole fix. A daemon started over SSH cannot: the keychain refuses a process
  with no GUI session, and every turn comes back "Not logged in".

  Where that is not possible — a headless box — \`cawco login\` mints a token
  instead, kept in ${CONFIG_PATH} at mode 0600 and exported to the daemon as
  CLAUDE_CODE_OAUTH_TOKEN, which skips the keychain entirely.

Finding the hub, in order — the first that answers wins
  1. --hub, then ${CAWCO_ENV.hubUrl}
  2. the last hub that answered, remembered in ${CONFIG_PATH}
  3. mDNS on the local link (_${CAWCO_MDNS_TYPE}._tcp)
  4. online Tailscale peers, on ${CAWCO_ENV.hubPort} (default ${CAWCO_HUB_PORT})
  5. http://localhost:${CAWCO_HUB_PORT}

  Step 3 only ever sees the local link. mDNS is multicast, and multicast does
  not travel over Tailscale — a hub on the far side of a tailnet is found by
  step 4, never by step 3.

Environment
  ${CAWCO_ENV.hubUrl}    hub to use, same as --hub
  ${CAWCO_ENV.hubPort}   port the probes try (default ${CAWCO_HUB_PORT})
  ${CAWCO_ENV.noMdns}=1  stop \`cawco hub\` advertising itself
`;

const NO_HUB = `cawco: no hub found.

Start one with \`cawco hub\`, or point this machine at an existing one with
\`cawco up --hub http://host:${CAWCO_HUB_PORT}\`. Run again with --verbose to
see what each step tried.`;

interface Args {
  /** The verb after the command, for the one command that takes one: `service`. */
  action?: string;
  ask: boolean;
  autoUpdate: boolean;
  channel?: "stable" | "nightly";
  command?: string;
  dev: boolean;
  follow: boolean;
  force: boolean;
  held?: number;
  help: boolean;
  hub?: string;
  releaseHost?: string;
  /** Everything after the verb — the services `service` acts on. */
  rest: string[];
  token?: string;
  verbose: boolean;
  version: boolean;
  whenIdle: boolean;
}

class UsageError extends Error {}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch over every flag and positional this CLI accepts
const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    rest: [],
    ask: false,
    autoUpdate: false,
    dev: false,
    whenIdle: false,
    force: false,
    follow: false,
    verbose: false,
    help: false,
    version: false,
  };
  // The loop advances `index` an extra step inside the body to consume each flag's value argument.
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    switch (arg) {
      case "--channel": {
        index += 1;
        const value = argv[index];
        if (value !== "stable" && value !== "nightly") {
          throw new UsageError("--channel needs stable or nightly");
        }
        args.channel = value;
        break;
      }
      case "--ask":
        args.ask = true;
        break;
      case "--held": {
        index += 1;
        const held = Number(argv[index]);
        if (!Number.isInteger(held) || held < 0) {
          throw new UsageError("--held needs a count of held children");
        }
        args.held = held;
        break;
      }
      case "--release-host":
        index += 1;
        args.releaseHost = argv[index];
        if (!args.releaseHost) {
          throw new UsageError("--release-host needs a URL");
        }
        break;
      case "--auto-update":
        args.autoUpdate = true;
        break;
      case "--hub":
        index += 1;
        args.hub = argv[index];
        if (!args.hub) {
          throw new UsageError("--hub needs a URL");
        }
        break;
      case "--token":
        index += 1;
        args.token = argv[index];
        if (!args.token) {
          throw new UsageError("--token needs a token");
        }
        break;
      case "--dev":
        args.dev = true;
        break;
      case "--when-idle":
        args.whenIdle = true;
        break;
      case "--force":
        args.force = true;
        break;
      case "--follow":
      case "-f":
        args.follow = true;
        break;
      case "--verbose":
      case "-v":
        args.verbose = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
        args.version = true;
        break;
      default:
        if (arg.startsWith("-")) {
          throw new UsageError(`unknown option ${arg}`);
        }
        if (!args.command) {
          args.command = arg;
        } else if (args.action) {
          args.rest.push(arg);
        } else {
          args.action = arg;
        }
    }
  }
  return args;
};

const note = (line: string): void => console.error(line);

const resolve = async (args: Args): Promise<Hub | undefined> =>
  discoverHub({ hub: args.hub, log: args.verbose ? note : undefined });

const seen = (at: AgentRow["lastSeenAt"]): string => {
  if (!at) {
    return "never";
  }
  const seconds = Math.round((Date.now() - new Date(at).getTime()) / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m ago`;
  }
  return `${Math.round(seconds / 3600)}h ago`;
};

const signedInLabel = (auth: AgentRow["auth"]): string => {
  if (auth === "authenticated") {
    return "yes";
  }
  return auth === "unknown" ? "?" : "NO";
};

const printFleet = (agents: AgentRow[]): void => {
  if (agents.length === 0) {
    console.log("\nfleet    empty — nothing has registered yet");
    return;
  }
  const rows = agents.map((agent) => [
    agent.hostname,
    agent.status,
    signedInLabel(agent.auth),
    agent.os,
    seen(agent.lastSeenAt),
    agent.machineId,
  ]);
  const headers = ["MACHINE", "STATUS", "SIGNED IN", "OS", "LAST SEEN", "ID"];
  const widths = headers.map((header, column) =>
    Math.max(
      header.length,
      ...rows.map((row) => (row[column] as string).length)
    )
  );
  const line = (cells: string[]): string =>
    cells
      .map((cell, column) => cell.padEnd(widths[column] as number))
      .join("  ")
      .trimEnd();
  console.log(`\n${line(headers)}`);
  for (const row of rows) {
    console.log(line(row));
  }
};

const status = async (args: Args): Promise<number> => {
  const hub = await resolve(args);
  if (!hub) {
    console.error(NO_HUB);
    return 1;
  }

  console.log(`hub      ${hub.httpUrl}`);
  console.log(`socket   ${hub.wsUrl}`);
  console.log(`found    ${hub.source}`);
  console.log(`config   ${CONFIG_PATH}`);

  const agents = await fetch(`${hub.httpUrl}/api/agents`)
    .then((response) =>
      response.ok ? (response.json() as Promise<AgentRow[]>) : undefined
    )
    .catch(() => undefined);
  if (!agents) {
    console.error(`\ncawco: ${hub.httpUrl} did not answer /api/agents`);
    return 1;
  }
  printFleet(agents);
  return 0;
};

/**
 * Hands the daemon the stored token, unless the environment already names one —
 * whoever set that meant it. Returns whether the SDK will find a token; the
 * value itself is never logged, framed, or written anywhere but the config.
 */
const applyToken = async (): Promise<boolean> => {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return true;
  }
  const token = (await readConfig())?.claudeToken;
  if (!token) {
    return false;
  }
  process.env.CLAUDE_CODE_OAUTH_TOKEN = token;
  return true;
};

/**
 * What a machine that cannot reach its credentials should be told, and how it
 * differs by why. The macOS case is the one worth spelling out: the credentials
 * are there and correct, so "log in again" is the one thing that will not work.
 */
const authNote = (state: Exclude<AuthState, "authenticated">): string =>
  state === "unreadable-credentials"
    ? `cawco: this machine has Claude Code credentials, but this process cannot read them.
They live in your login keychain, and the keychain only opens for a process
inside your desktop session — a daemon started over SSH is not one, so sessions
will start and then answer "Not logged in". Logging in again will not change it.`
    : `cawco: nobody is signed in to Claude Code on this machine, so sessions will
start and then answer "Not logged in".`;

/**
 * Asked before registering, because a machine that cannot start a session should
 * say so rather than sit in the fleet looking ready. With a terminal this offers
 * the fix; without one it prints it and carries on — a daemon under launchd or
 * systemd has nobody to ask, and blocking on stdin there is a hang, not a prompt.
 */
const preflight = async (): Promise<AuthState> => {
  // Loaded here rather than at the top so `status` never pays for the agent SDK.
  const { probeAuth } = await import("@cawco/agent");
  const state = await probeAuth();
  if (state === "authenticated") {
    return state;
  }

  console.error(authNote(state));

  if (!process.stdin.isTTY) {
    console.error(`
Fix it from this machine with \`cawco login\`, or run the daemon as a service
— \`cawco service install\` — which on macOS is enough on its own. Starting
anyway; the fleet will show this machine as needing sign-in.`);
    return state;
  }

  // biome-ignore lint/suspicious/noAlert: this is a terminal CLI; Bun's global prompt() reads a line from stdin, not a browser dialog
  const answer = prompt("\nRun `claude setup-token` now to fix it? [Y/n]")
    ?.trim()
    .toLowerCase();
  if (answer && answer !== "y" && answer !== "yes") {
    return state;
  }

  await login();
  // The token the flow produced is loaded like any other, so `up` continues with
  // exactly what a later start would have.
  return (await applyToken()) ? "authenticated" : state;
};

const up = async (args: Args): Promise<number> => {
  const hub = await resolve(args);
  if (!hub) {
    console.error(NO_HUB);
    return 1;
  }
  console.log(`cawco: hub ${hub.httpUrl} (found by ${hub.source})`);

  await applyToken();
  const auth = await preflight();
  if (process.stdin.isTTY) {
    console.log(
      "cawco: `cawco service install` runs this in the background instead."
    );
  }

  // The daemon reads its hub from the environment, so this is the handoff.
  process.env[CAWCO_ENV.hubUrl] = hub.wsUrl;
  const { runDaemon } = await import("@cawco/agent");
  // A hub the operator named is never swapped; only a discovered one may be
  // rediscovered on sustained reconnect failure.
  runDaemon(auth, hub.source !== "flag" && hub.source !== "env");
  return 0;
};

const runService = async (args: Args): Promise<number> => {
  if (!isServiceAction(args.action)) {
    throw new UsageError(
      `cawco service needs one of: ${SERVICE_ACTIONS.join(", ")}`
    );
  }
  const named = args.rest.map((id) => {
    if (!isServiceId(id)) {
      throw new UsageError(
        `cawco service does not know ${id} — one of: ${SERVICE_IDS.join(", ")}`
      );
    }
    return id;
  });
  // Naming nothing means the whole stack, which is what someone setting a
  // machine up wants; `logs` is the exception and says so itself.
  const ids = named.length > 0 ? named : SERVICE_IDS;
  await service(args.action, {
    ids,
    mode: args.dev ? "dev" : "prod",
    follow: args.follow,
    whenIdle: args.whenIdle,
    force: args.force,
    note: (line) => console.log(line),
  });
  return 0;
};

/** Importing the hub boots it: its entry point listens, and then stays up. */
const hub = async (): Promise<number> => {
  const { startHub } = await import("@cawco/hub");
  await startHub();
  return 0;
};

/**
 * sessiond as a verb, so the published package — one bundled `cli.js`, no
 * source tree — can run it from a unit the way it runs the hub.
 */
const sessiond = async (): Promise<number> => {
  await import("@cawco/sessiond/main");
  return 0;
};

const runBinaryInstall = async (args: Args): Promise<number> => {
  if (args.action !== "hub" && args.action !== "agent") {
    throw new UsageError("binary-install needs hub or agent");
  }
  const { setupBinary } = await import("./binary-install");
  await setupBinary({
    role: args.action,
    hubUrl:
      args.hub ??
      `http://127.0.0.1:${readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT}`,
    policy: {
      channel: args.channel ?? "stable",
      autoUpdate: args.autoUpdate,
    },
    ask: args.ask,
    ...(args.releaseHost ? { releaseHost: args.releaseHost } : {}),
  });
  return 0;
};

const runBinaryApply = async (args: Args): Promise<number> => {
  if (!args.action || args.held === undefined) {
    throw new UsageError(
      "binary-apply needs a staged version and --held <count>"
    );
  }
  const { applyBinary } = await import("./binary-apply");
  await applyBinary(args.action, args.held);
  return 0;
};

const run = async (argv: string[]): Promise<number> => {
  const args = parseArgs(argv);
  if (args.help || !(args.command || args.version)) {
    console.log(HELP);
    return 0;
  }
  if (args.version) {
    console.log(CLI_VERSION);
    return 0;
  }

  switch (args.command) {
    case "binary-install":
      return runBinaryInstall(args);
    case "binary-apply":
      return runBinaryApply(args);
    case "build-info":
      console.log(
        JSON.stringify({
          version: CLI_VERSION,
          commit: runtimeCommit,
          protocol: protocolRange,
        })
      );
      return 0;
    case "verify-release": {
      if (!(args.action && args.rest[0])) {
        throw new UsageError(
          "verify-release needs manifest.json and its signature file, then an optional explicit public-key file"
        );
      }
      const { verifyManifest } = await import("@cawco/core/release-manifest");
      verifyManifest(
        await Bun.file(args.action).json(),
        (await Bun.file(args.rest[0]).text()).trim(),
        args.rest[1] ? await Bun.file(args.rest[1]).text() : undefined
      );
      console.log("Release manifest signature verified");
      return 0;
    }
    case "dashboard":
      await import("../../../apps/dashboard/serve.js");
      return 0;
    case "pi-host":
      await import("@cawco/agent/pi-host");
      return 0;
    case "boundary-hook":
      await import("@cawco/agent/boundary-hook");
      return 0;
    case "capabilities": {
      const { probeCapabilities } = await import("@cawco/agent/capabilities");
      console.log(JSON.stringify(probeCapabilities(), null, 2));
      return 0;
    }
    case "up":
      return up(args);
    case "hub":
      return hub();
    case "sessiond":
      return sessiond();
    case "status":
      return status(args);
    case "service":
      return runService(args);
    case "login":
      if (args.token) {
        await saveToken(args.token);
      } else {
        await login();
      }
      console.log(
        `cawco: token saved to ${CONFIG_PATH}. Restart the daemon to use it.`
      );
      return 0;
    case "logout":
      console.log(
        (await clearToken())
          ? `cawco: token cleared from ${CONFIG_PATH}.`
          : "cawco: no token was stored."
      );
      return 0;
    default:
      throw new UsageError(`unknown command ${args.command}`);
  }
};

const code = await run(Bun.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`cawco: ${error.message}\n\nRun \`cawco --help\`.`);
    return 2;
  }
  if (error instanceof LoginError || error instanceof ServiceError) {
    console.error(`cawco: ${error.message}`);
    return 1;
  }
  throw error;
});

// A command that left something running — the daemon, the hub — keeps the
// process alive on its own; exiting here would cut it off.
if (code !== 0) {
  process.exit(code);
}
