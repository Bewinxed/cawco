#!/usr/bin/env bun
// What every verb loads is the agent's two leaf modules, never its index: the
// index brings the daemon and its harnesses, and pi's harness brings
// `proper-lockfile`, whose `signal-exit` takes SIGTERM into JavaScript the
// moment it loads. A `cawco hub` holding that could not be stopped while its
// event loop was busy (nightly 2069, killed by systemd after 90s). The daemon
// and the harnesses load inside the verbs that run them.
import { unhandled } from "@cawco/core/unhandled";
import "@cawco/core/no-huge-pages";
import { CONFIG_PATH } from "@cawco/agent/config";
import { toHttpBase } from "@cawco/agent/discovery";
import type { AgentRow } from "@cawco/core";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CAWCO_MDNS_TYPE,
  configurePage,
  pinnedTools,
  readEnv,
} from "@cawco/core";
import { SERVICE_IDS } from "@cawco/core/binary-installation";
import { hubCredentialSocket } from "@cawco/core/paths";
import { protocolRange, runtimeCommit } from "@cawco/core/runtime";
import { AgentRowSchema } from "@cawco/core/stored-shapes";
import { z } from "zod";
import { discoverHub, findExistingHub, type Hub } from "./discover";
import { OwnerApprovalError, ownerFetch } from "./owner";
import { pairingOff } from "./pairing";
import {
  isServiceAction,
  isServiceId,
  SERVICE_ACTIONS,
  service,
} from "./service";
import { callTool, listTools, sessionOf, toolDoor } from "./tools";

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
  cawco browser list                      this machine's container runtime and browsers
  cawco browser <start|stop|remove> <key> start (or wake), stop, or remove with its profile,
                                          the browser of project:<id> or machine:<id>
  cawco status [--hub <url>] [--verbose]  print the hub it found, and the fleet
  cawco service <${SERVICE_ACTIONS.join("|")}> [service...]
                                            run cawco as per-user services
  cawco binary-install <hub|agent> ...    setup step of the install script; not run by hand
  cawco tools [--session <id>]            list the cawco tools that session's role has
  cawco tool <name> [json|-] [--record] [--session <id>]
                                          call one, under the same role checks as MCP;
                                          - reads the JSON from stdin, for large arguments;
                                          --record prints the hub's record as JSON, not
                                          the words, and fails when the tool has none
                                          (session: --session or CAWCO_INSTANCE_ID;
                                          credential: CAWCO_SESSION_CREDENTIAL)
  cawco connections set-key <name> [--hub <url>]
                                          give a connection its key: typed unseen, or
                                          piped (pbpaste | cawco connections set-key x)
                                          straight to the hub, never through a session
  cawco jev set-key [--hub <url>]         give the hub a TypeSafe key for Jev: typed
                                          unseen, or piped (pbpaste | cawco jev set-key);
                                          while held, Jev goes to TypeSafe directly
  cawco jev remove-key [--hub <url>]      forget it: Jev goes through OpenRouter, or is off
  cawco relay on <project> [--provider github|stripe|generic] [--connection <name>]
             [--signature-header <h>] [--timestamp-header <h>] [--id-path <path>] [--yes]
                                          open the project's public webhook path through
                                          Tailscale Funnel (in a session: asks the owner)
  cawco relay off <relay> | list <project>
  cawco relay set-secret <relay>          give a relay its provider's signing secret,
                                          typed unseen or piped, never through a session
  cawco pairing off                       on the hub's machine: stop requiring paired
                                          devices when no paired device is left to
                                          turn it off in Configure › Devices
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

  A session keeper's unit is restarted or uninstalled only while it holds
  nothing but the keeper and what its sessions run: a process someone else
  started that sits in it (a container's conmon from an older session) is
  named, and the keeper is left alone. \`--force\` stops it regardless.

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
  --force         for \`service restart\` and \`uninstall\`: go ahead now, cutting what is in flight
  --follow, -f    keep printing, for \`service logs\`
  --verbose       narrate the discovery ladder
  --help          this
  --version       print the version

Signing in
  Claude sessions run on CawCo's own accounts: add one in the dashboard's
  ${configurePage("accounts")} and sign it in there on each machine. Each keeps its
  login in its own folder on the machine (~/.cawco/accounts/<id>/claude); the
  login Claude Code keeps on the machine itself is not used.

  On macOS, run the daemon as a service — \`cawco service install\` — so it
  inherits your desktop session and can read the login keychain. A daemon
  started over SSH cannot, and every turn comes back "Not logged in" until the
  keychain is unlocked: Unlock keychain… in the machine's menu.

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

/** How long `cawco status` gives the hub to list the fleet. */
const STATUS_ANSWER_MS = 15_000;

interface Args {
  /** The verb after the command, for the one command that takes one: `service`. */
  action?: string;
  ask: boolean;
  autoUpdate: boolean;
  channel?: "stable" | "nightly";
  command?: string;
  connection?: string;
  dev: boolean;
  follow: boolean;
  force: boolean;
  help: boolean;
  hub?: string;
  idPath?: string;
  keeperOnly: boolean;
  /** `relay on`: the provider, its connection, and a generic relay's headers and id path. */
  provider?: string;
  /** `tool --record`: the hub's record as JSON, a program's read, not the words. */
  record: boolean;
  releaseHost?: string;
  /** Everything after the verb — the services `service` acts on. */
  rest: string[];
  /** `binary-apply --resume`: decide the update trial a helper left open. */
  resume: boolean;
  /** `binary-units --services`: the hub's, the dashboard's and the agent's units, not the keeper's. */
  services: boolean;
  /** The session `tools`, `tool` and `relay` act as. */
  session?: string;
  signatureHeader?: string;
  timestampHeader?: string;
  verbose: boolean;
  version: boolean;
  whenIdle: boolean;
  /** `relay on`: open it without asking. */
  yes: boolean;
}

class UsageError extends Error {}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one switch over every flag and positional this CLI accepts
const parseArgs = (argv: string[]): Args => {
  const args: Args = {
    rest: [],
    ask: false,
    keeperOnly: false,
    record: false,
    resume: false,
    services: false,
    autoUpdate: false,
    dev: false,
    whenIdle: false,
    force: false,
    follow: false,
    yes: false,
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
      case "--resume":
        args.resume = true;
        break;
      case "--services":
        args.services = true;
        break;
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
      case "--provider":
      case "--connection":
      case "--signature-header":
      case "--timestamp-header":
      case "--id-path": {
        index += 1;
        const value = argv[index];
        if (!value) {
          throw new UsageError(`${arg} needs a value`);
        }
        const field = {
          "--provider": "provider",
          "--connection": "connection",
          "--signature-header": "signatureHeader",
          "--timestamp-header": "timestampHeader",
          "--id-path": "idPath",
        } as const;
        args[field[arg]] = value;
        break;
      }
      case "--yes":
        args.yes = true;
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
      case "--record":
        args.record = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
        args.version = true;
        break;
      default:
        // A lone `-` is stdin (`cawco tool <name> -`), not an option.
        if (arg.startsWith("-") && arg !== "-") {
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

  // The fleet's list is the person's (hub hub-auth.ts): a hub that requires
  // paired devices asks the person to approve this run (owner.ts).
  const asked = await ownerFetch(
    `${hub.httpUrl}/api/agents`,
    {},
    "cawco status",
    STATUS_ANSWER_MS
  ).catch((error: unknown) => {
    // The person's no is said as it is; a hub that could not be reached, below.
    if (error instanceof OwnerApprovalError) {
      throw error;
    }
    return error instanceof Error ? error.message : String(error);
  });
  if (typeof asked === "string") {
    console.error(`\ncawco: ${hub.httpUrl} could not be reached: ${asked}`);
    return 1;
  }
  switch (asked.kind) {
    case "unanswered":
      console.error(
        `\ncawco: ${hub.httpUrl} did not answer /api/agents within ${Math.round(asked.after / 1000)}s`
      );
      return 1;
    case "answered":
      if (!asked.value.ok) {
        console.error(
          `\ncawco: ${hub.httpUrl} answered /api/agents with HTTP ${asked.value.status}`
        );
        return 1;
      }
      printFleet(z.array(AgentRowSchema).parse(JSON.parse(asked.value.said)));
      return 0;
    default:
      unhandled("read", asked);
  }
};

/**
 * Starts the daemon at once: whether a Claude account is signed in here is
 * read by the daemon once it has registered, and said then in the same
 * sentence (daemon.ts `noteClaudeAuth`). Read here first, it held the start
 * on `claude auth status` for every account dir.
 */
const up = async (args: Args): Promise<number> => {
  const hub = await resolve(args);
  if (!hub) {
    console.error(NO_HUB);
    return 1;
  }
  console.log(`cawco: hub ${hub.httpUrl} (found by ${hub.source})`);

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
  runDaemon(hub.source !== "flag" && hub.source !== "env");
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
  // On a binary install the hub, dashboard and agent units start through the wrapper, never a
  // build's own path, or an update would restart the build it was meant to replace; the session
  // keeper's unit is the current keeper's own, the build the `keeper` link names.
  const { readInstallation, readKeeperVersion } =
    await import("@cawco/core/binary-installation");
  const { binaryLayout } = await import("./binary-install");
  const installation = await readInstallation();
  const keeper = installation ? await readKeeperVersion() : undefined;
  if (installation && !keeper) {
    throw new UsageError(
      `this binary install has no keeper link (${installation.root}/keeper), so which session keeper's unit to act on is not known`
    );
  }
  await service(args.action, {
    ...(keeper ? { binaryLayout: binaryLayout(keeper) } : {}),
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
  if (!args.action) {
    throw new UsageError("binary-apply needs a staged version");
  }
  const { applyBinary } = await import("./binary-apply");
  await applyBinary(args.action, args.keeperOnly);
  return 0;
};

/**
 * `cawco binary-units`: this build's units, as it writes them. `services`:
 * the hub's, the dashboard's and the agent's and the dashboard's socket
 * (service.ts `refreshServices`), and the install's record of where the
 * dashboard answers, which the update's verification probes (core
 * binary-health.ts), as the socket now names it; else its keeper's own unit.
 */
const writeBinaryUnits = async (services: boolean): Promise<void> => {
  const { binaryLayout } = await import("./binary-install");
  const { refreshServices, refreshUnits } = await import("./service");
  const { recordApply } = await import("./apply-record");
  const say = (line: string) => console.log(`units: ${line}`);
  // Each file rewritten, and where the dashboard answers once that moved:
  // the update's record of what this build's units did (apply-record.ts).
  let rewrote: string[];
  let dashboard: { now: string; was: string | null } | null = null;
  if (services) {
    const refreshed = await refreshServices(
      ["hub", "dashboard", "agent"],
      binaryLayout(CLI_VERSION),
      say
    );
    ({ rewrote } = refreshed);
    const { dashboardUrl } = refreshed;
    const { installationPath, readInstallation, writeJsonAtomic } =
      await import("@cawco/core/binary-installation");
    const installation = await readInstallation();
    if (
      dashboardUrl &&
      installation?.role === "hub" &&
      installation.dashboardUrl !== dashboardUrl
    ) {
      await writeJsonAtomic(installationPath(), {
        ...installation,
        dashboardUrl,
      });
      say(
        `the dashboard answers at ${dashboardUrl} (was ${installation.dashboardUrl ?? "not recorded"})`
      );
      dashboard = {
        now: dashboardUrl,
        was: installation.dashboardUrl ?? null,
      };
    }
  } else {
    rewrote = await refreshUnits(["sessiond"], binaryLayout(CLI_VERSION), say);
  }
  await recordApply({
    kind: "units",
    dashboard,
    rewrote,
    services,
    version: CLI_VERSION,
  });
};

/**
 * `cawco binary-pins`, run from this build by the build before it, before the
 * swap (agent binary-update.ts `putOnPins`): this build's pinned harnesses go
 * on, with the methods this build knows, each recorded as it lands. `cawco
 * binary-pins back <build>`, run from the build that runs instead of <build>:
 * what went on for <build> goes back on for this one (agent pin-record.ts).
 * Says what it did on one line; a failure is one sentence on stderr and exit 1,
 * whatever failed: its modules loading as much as the work, so the update
 * records the error and not a report's last line (core cli-failure.ts reads
 * what dies before this runs).
 */
const runBinaryPins = async (args: Args): Promise<number> => {
  const back = args.action === "back" ? args.rest[0] : undefined;
  try {
    if (args.action !== undefined && !back) {
      throw new UsageError(
        "binary-pins takes nothing, or back <the build that will not run>"
      );
    }
    const { pinMoveWords, putOnPins } = await import("@cawco/agent/tools");
    const { putBackPins, recordPinMove } =
      await import("@cawco/agent/pin-record");
    const said = back
      ? await putBackPins(back, CLI_VERSION)
      : (
          await putOnPins(pinnedTools(), CLI_VERSION, (move) =>
            recordPinMove(CLI_VERSION, move)
          )
        ).map(pinMoveWords);
    console.log(said.join(", "));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
};

/**
 * `cawco git-credential <get|store|erase>`: git's credential helper for the
 * hub's git remote (git-credential(1), "custom helpers"), which each session
 * is configured with through env-only git config (agent git-credential.ts).
 * `get` answers with the session's own identity, its instance id and session
 * credential, from the environment the session's shell runs in; outside a
 * session (a checkout whose `origin` is the hub names this helper in its own
 * config), with this machine's, which the agent answers on its credential
 * socket (agent hub-git.ts). `store` and `erase` keep nothing. git hands the
 * request on stdin and closes it.
 */
const gitCredential = async (args: Args): Promise<number> => {
  const request = await Bun.stdin.text();
  if (args.action !== "get") {
    return 0;
  }
  const instanceId = readEnv(CAWCO_ENV.instanceId);
  const credential = readEnv(CAWCO_ENV.sessionCredential);
  if (instanceId && credential) {
    process.stdout.write(`username=${instanceId}\npassword=${credential}\n`);
    return 0;
  }
  const answer = await fetch("http://cawco/", {
    method: "POST",
    body: request,
    unix: hubCredentialSocket(),
  }).catch(() => undefined);
  if (!answer?.ok) {
    console.error(
      "cawco: this machine's agent gave no credential for the hub's git remote: it is not running, not connected to this hub, or its credential socket did not open (its log says why)."
    );
    return 1;
  }
  process.stdout.write(await answer.text());
  return 0;
};

/** `cawco connections set-key <name>`: a connection's key, from this terminal to the hub. */
const runConnections = async (args: Args): Promise<number> => {
  if (args.action !== "set-key") {
    throw new UsageError("connections needs set-key <name>");
  }
  const found = await resolve(args);
  if (!found) {
    console.error(NO_HUB);
    return 1;
  }
  const { setConnectionKey } = await import("./connections");
  const { lines, signedIn } = await setConnectionKey(
    found.httpUrl,
    args.rest[0]
  );
  for (const line of lines) {
    console.log(line);
  }
  return signedIn ? 0 : 1;
};

/** `cawco pairing off`: the hub trusts its network again, from its own machine (pairing.ts). */
const runPairing = (args: Args): Promise<number> => {
  if (args.action !== "off") {
    throw new UsageError("cawco pairing takes one verb: off");
  }
  return pairingOff();
};

/** `cawco jev <set-key|remove-key>`: the TypeSafe key Jev is reached with, from this terminal to the hub. */
const runJev = async (args: Args): Promise<number> => {
  if (args.action !== "set-key" && args.action !== "remove-key") {
    throw new UsageError("jev needs set-key or remove-key");
  }
  const found = await resolve(args);
  if (!found) {
    console.error(NO_HUB);
    return 1;
  }
  const { removeJevKey, setJevKey } = await import("./jev-key");
  const lines =
    args.action === "set-key"
      ? await setJevKey(found.httpUrl)
      : await removeJevKey(found.httpUrl);
  for (const line of lines) {
    console.log(line);
  }
  return 0;
};

/** `cawco relay <on|off|list|set-secret>`: a project's public webhook path. */
const runRelayCommand = async (args: Args): Promise<number> => {
  const { insideBoundary, runRelay } = await import("./relay");
  // Inside a workspace's boundary the tool door is the way in: no hub is reachable.
  const at = insideBoundary() ? undefined : (await resolve(args))?.httpUrl;
  if (!(at || insideBoundary())) {
    console.error(NO_HUB);
    return 1;
  }
  const lines = await runRelay({
    ...args,
    rest: args.rest,
    ...(at ? { hub: at } : {}),
  });
  for (const line of lines) {
    console.log(line);
  }
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
  // `-` reads the arguments from stdin: one argv string stops at 128 KiB
  // (Linux's MAX_ARG_STRLEN), well under what a tool's arguments may weigh.
  const json = args.rest[0] === "-" ? await Bun.stdin.text() : args.rest[0];
  console.log(
    await callTool(
      at,
      instanceId,
      args.action,
      json,
      args.record ? "record" : "words"
    )
  );
  return 0;
};

/** `cawco browser <list|start|stop|remove> [key]`: this machine's browsers (browser.ts). */
const runBrowserCommand = async (args: Args): Promise<number> => {
  const { runBrowser } = await import("./browser");
  for (const line of await runBrowser(args.action, args.rest[0])) {
    console.log(line);
  }
  return 0;
};

/**
 * A pi process the agent starts from this build: a session's host
 * (pi-host.ts), or pi's own `mcp list` (pi-mcp-list.ts), which says how it
 * went in its exit code.
 */
const runPiEntry = async (
  command: "pi-host" | "pi-mcp-list"
): Promise<number> => {
  if (command === "pi-host") {
    await import("@cawco/agent/pi-host");
    return 0;
  }
  await import("@cawco/agent/pi-mcp-list");
  return Number(process.exitCode ?? 0);
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
      // Run by the update helper from the build it installs, as that build
      // writes its units. With `--services`, before the update restarts
      // anything: the hub's, the dashboard's and the agent's units and the
      // dashboard's socket, each from the environment its unit recorded
      // (service.ts `refreshServices`). Without, a keeper handover's first
      // step: that build's own keeper unit (builds before `--services` call
      // it so). A failure is one sentence on stderr, as binary-pins says one.
      try {
        await writeBinaryUnits(args.services);
        return 0;
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        return 1;
      }
    }
    case "binary-pins":
      return runBinaryPins(args);
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
        await Bun.file(args.action).text(),
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
    case "pi-mcp-list":
      return runPiEntry(args.command);
    case "capabilities": {
      const { probeCapabilities } = await import("@cawco/agent/capabilities");
      console.log(JSON.stringify(await probeCapabilities(), null, 2));
      return 0;
    }
    case "browser":
      return runBrowserCommand(args);
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
    case "connections":
      return runConnections(args);
    case "jev":
      return runJev(args);
    case "relay":
      return runRelayCommand(args);
    case "pairing":
      return runPairing(args);
    case "service":
      return runService(args);
    case undefined:
      break;
  }
  throw new UsageError(`unknown command ${args.command}`);
};

/**
 * A failed command as the CLI says it: `cawco: <message>`, then each cause
 * it carries, one line each. Never rethrown: an error that escapes is
 * printed by Bun with the lines of source around where it was thrown, in a
 * binary install the minified bundle's.
 */
const failure = (error: unknown): string => {
  const lines = [
    `cawco: ${error instanceof Error ? error.message : String(error)}`,
  ];
  const said = new Set<unknown>([error]);
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause !== undefined && !said.has(cause)) {
    said.add(cause);
    lines.push(
      `  because: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines.join("\n");
};

const cliArgs = Bun.argv.slice(2);
const code = await run(cliArgs).catch((error: unknown) => {
  if (error instanceof UsageError) {
    console.error(`cawco: ${error.message}\n\nRun \`cawco --help\`.`);
    return 2;
  }
  console.error(failure(error));
  return 1;
});

// A command that left something running — the daemon, the hub — keeps the
// process alive on its own; exiting here would cut it off.
if (code !== 0) {
  process.exit(code);
}
