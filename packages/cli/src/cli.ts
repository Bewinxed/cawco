#!/usr/bin/env bun
// What every verb loads is the agent's two leaf modules, never its index: the
// index brings the daemon and its harnesses, and pi's harness brings
// `proper-lockfile`, whose `signal-exit` takes SIGTERM into JavaScript the
// moment it loads. A `cawco hub` holding that could not be stopped while its
// event loop was busy (nightly 2069, killed by systemd after 90s). The daemon
// and the harnesses load inside the verbs that run them.
import { CONFIG_PATH } from "@cawco/agent/config";
import { toHttpBase } from "@cawco/agent/discovery";
import type { AgentRow, AuthState } from "@cawco/core";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CAWCO_MDNS_TYPE,
  readEnv,
} from "@cawco/core";
import { protocolRange, runtimeCommit } from "@cawco/core/runtime";
import { discoverHub, findExistingHub, type Hub } from "./discover";
import {
  isServiceAction,
  isServiceId,
  SERVICE_ACTIONS,
  SERVICE_IDS,
  ServiceError,
  service,
} from "./service";
import { callTool, listTools, sessionOf, ToolError, toolDoor } from "./tools";

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
  cawco tools [--session <id>]            list the cawco tools that session's role has
  cawco tool <name> [json] [--session <id>]
                                          call one, under the same role checks as MCP
                                          (session: --session or CAWCO_INSTANCE_ID;
                                          credential: CAWCO_SESSION_CREDENTIAL)
  cawco git-credential <get|store|erase>  git's credential helper for the hub's git
                                          remote, as this session; set up for every
                                          session, not run by hand

Services
  ${SERVICE_IDS.join(", ")} — each its own per-user service, started by systemd or
  launchd and kept up across reboots. \`install\`, \`uninstall\`, \`restart\` and
  \`status\` take any of them and act on all three when given none; \`logs\` takes
  exactly one. A machine nobody points a browser at wants \`agent\` alone.

  \`install --dev\` runs them out of the checkout instead of the build: the hub
  watches its own source and restarts itself on every edit, which costs little
  because the sessions live in the daemons and reconnect (only the tool calls
  it is answering then are cut); the dashboard runs vite, which reloads an
  edited file without restarting at all. The agent is never watched in either
  mode. \`status\` reads the mode back out of the unit.

  A turn outlives an agent restart: the session keeper runs it and the next
  agent takes it over. What the restart does cut is what the agent carries
  itself — tool calls it relays to the hub, image generations, commands the
  hub asked it to run, a session it is starting, a message it is handing over.
  So \`restart agent\` asks the agent what it would cut now and refuses while
  anything; \`restart sessiond\` asks the hub whether this machine's sessions
  are mid-turn and refuses while any are, since the keeper's restart kills
  them. \`--when-idle\` waits up to five minutes for that to clear and then
  restarts; \`--force\` restarts regardless, and is also the only way through
  when the question cannot be answered at all.

Updating
  A machine updates itself from the app: automatically when auto-update is on,
  or when a person presses Install now. An update waits for what its restart
  would cut, as \`restart agent\` does (on the hub's machine, also the tool calls
  the hub is answering for every machine): up to 45 seconds for Install now,
  which then installs anyway, and up to 30 minutes for auto-update. There is no
  update command, and running the install script again on an installed machine
  only reports what is installed.

Options
  --hub <url>     hub to use, as http://host:port or ws://host:port/ws
  --dev           for \`service install\`: run from the checkout, watching it
  --when-idle     for \`service restart\`: wait until the restart would cut nothing
  --force         for \`service restart\`: restart now, cutting what is in flight
  --follow, -f    keep printing, for \`service logs\`
  --verbose       narrate the discovery ladder
  --help          this
  --version       print the version

Signing in
  The daemon runs Claude Code as you, so it uses the login Claude Code keeps on
  this machine. Log a machine in from the dashboard — Log in… in its machine
  menu — which runs \`claude auth login\` there and takes the code you paste
  back, or run \`claude auth login\` on the machine yourself.

  On macOS, run the daemon as a service — \`cawco service install\` — so it
  inherits your desktop session and can read the login keychain. A daemon
  started over SSH cannot, and every turn comes back "Not logged in" until the
  machine is logged in from the dashboard, which keeps that login in a file the
  daemon can read.

Finding the hub, in order — the first that answers wins
  1. --hub, then ${CAWCO_ENV.hubUrl}
  2. the last hub steps 3-5 found, remembered in ${CONFIG_PATH} (a hub named
     by --hub, ${CAWCO_ENV.hubUrl} or ${CAWCO_ENV.hubPort} is used for that run, never saved)
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
  /** `binary-apply --commanded`: a person's Install now asked for this build. */
  commanded: boolean;
  dev: boolean;
  follow: boolean;
  force: boolean;
  held?: number;
  help: boolean;
  hub?: string;
  keeperOnly: boolean;
  releaseHost?: string;
  /** Everything after the verb — the services `service` acts on. */
  rest: string[];
  /** `binary-apply --resume`: decide the update trial a helper left open. */
  resume: boolean;
  /** The session `tools` and `tool` act as. */
  session?: string;
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
    keeperOnly: false,
    commanded: false,
    resume: false,
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
      case "--keeper-only":
        args.keeperOnly = true;
        break;
      case "--commanded":
        args.commanded = true;
        break;
      case "--resume":
        args.resume = true;
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
      case "--session":
        index += 1;
        args.session = argv[index];
        if (!args.session) {
          throw new UsageError("--session needs a session id");
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
 * Asked before registering, because a machine that cannot start a Claude
 * session should say so rather than sit in the fleet looking ready. It reads
 * only the CawCo account dirs here (`~/.cawco/accounts/<id>/claude`), says
 * nothing while one is signed in, and otherwise prints the one sentence and
 * carries on: the fix is signing an account in from the dashboard, once this
 * daemon is up. The daemon is handed the answer and does not say it again.
 */
const preflight = async (): Promise<AuthState> => {
  // Loaded here rather than at the top so `status` never pays for the agent SDK.
  const { claudeAuthNote, machineClaudeAuth } = await import("@cawco/agent");
  const state = await machineClaudeAuth();
  const said = claudeAuthNote(state);
  if (said) {
    console.error(`cawco: ${said}`);
  }
  return state;
};

const up = async (args: Args): Promise<number> => {
  const hub = await resolve(args);
  if (!hub) {
    console.error(NO_HUB);
    return 1;
  }
  console.log(`cawco: hub ${hub.httpUrl} (found by ${hub.source})`);

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
  // On a binary install every unit starts through the wrapper, never a build's own path, or an
  // update would restart the build it was meant to replace.
  const { readInstallation } = await import("@cawco/core/binary-installation");
  const { binaryLayout } = await import("./binary-install");
  await service(args.action, {
    ...((await readInstallation()) ? { binaryLayout: binaryLayout() } : {}),
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
  if (args.resume) {
    const { resumeBinary } = await import("./binary-apply");
    await resumeBinary();
    return 0;
  }
  if (!args.action || args.held === undefined) {
    throw new UsageError(
      "binary-apply needs a staged version and --held <count>"
    );
  }
  const { applyBinary } = await import("./binary-apply");
  await applyBinary(args.action, args.held, args.keeperOnly, args.commanded);
  return 0;
};

/**
 * `cawco git-credential <get|store|erase>`: git's credential helper for the
 * hub's git remote (git-credential(1), "custom helpers"), which each session
 * is configured with through env-only git config (agent git-credential.ts).
 * `get` answers with the session's own identity, its instance id and session
 * credential, from the environment the session's shell runs in; `store` and
 * `erase` keep nothing. git hands the request on stdin and closes it.
 */
const gitCredential = async (args: Args): Promise<number> => {
  await Bun.stdin.text();
  if (args.action !== "get") {
    return 0;
  }
  const instanceId = readEnv(CAWCO_ENV.instanceId);
  const credential = readEnv(CAWCO_ENV.sessionCredential);
  if (!(instanceId && credential)) {
    console.error(
      "cawco: this shell is no CawCo session's, so it has no credential for the hub's git remote."
    );
    return 1;
  }
  process.stdout.write(`username=${instanceId}\npassword=${credential}\n`);
  return 0;
};

/** `cawco tools` and `cawco tool <name> [json]`: the session's MCP tools, under its role. */
const runTool = async (args: Args): Promise<number> => {
  // Inside a workspace's boundary the tool door is the way in: no hub is reachable.
  const at = toolDoor() ? undefined : (await resolve(args))?.httpUrl;
  if (!(at || toolDoor())) {
    console.error(NO_HUB);
    return 1;
  }
  const instanceId = sessionOf(args.session);
  if (args.command === "tools") {
    console.log(await listTools(at, instanceId));
    return 0;
  }
  if (!args.action) {
    throw new UsageError("tool needs a tool name, then its arguments as JSON");
  }
  console.log(await callTool(at, instanceId, args.action, args.rest[0]));
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
    case "binary-rejoin": {
      if (!args.hub) {
        throw new UsageError("binary-rejoin needs --hub <url>");
      }
      const { rejoinBinary } = await import("./binary-install");
      await rejoinBinary(toHttpBase(args.hub) ?? args.hub);
      return 0;
    }
    case "binary-units": {
      // A verified update's step before the keeper moves, run from that build: the
      // session keeper's unit as this build writes it. Only that unit: the
      // others carry what the installing shell knew (the hub's address, the
      // dashboard's port), which this process may not.
      const { binaryLayout } = await import("./binary-install");
      const { refreshUnits } = await import("./service");
      await refreshUnits(["sessiond"], binaryLayout(), (line) =>
        console.log(`units: ${line}`)
      );
      return 0;
    }
    case "binary-find-hub": {
      const url = await findExistingHub();
      if (url) {
        console.log(url);
      }
      return 0;
    }
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
    case "capabilities": {
      const { probeCapabilities } = await import("@cawco/agent/capabilities");
      console.log(JSON.stringify(await probeCapabilities(), null, 2));
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
    case "tools":
    case "tool":
      return runTool(args);
    case "git-credential":
      return gitCredential(args);
    case "service":
      return runService(args);
    default:
      throw new UsageError(`unknown command ${args.command}`);
  }
};

const code = await run(Bun.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`cawco: ${error.message}\n\nRun \`cawco --help\`.`);
    return 2;
  }
  if (error instanceof ServiceError || error instanceof ToolError) {
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
