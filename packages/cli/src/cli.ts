#!/usr/bin/env bun
import { platform } from "node:os";
import { CONFIG_PATH, readConfig, toHttpBase } from "@cawco/agent";
import type { AgentRow, AuthState } from "@cawco/core";
import {
  CAWCO_ENV,
  CAWCO_HUB_PORT,
  CAWCO_MDNS_TYPE,
  INSTALL_STEP_PREFIX,
  readEnv,
} from "@cawco/core";
import { discoverHub, type Hub } from "./discover";
import { clearToken, LoginError, login, saveToken } from "./login";
import {
  awaitFirstMachineReady,
  CHECKOUT_ROOT,
  DEPLOY_BRANCH,
  DEPLOY_MARKER,
  dashboardUrl,
  deployInit,
  deployRoot,
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
  cawco status [--hub <url>] [--verbose]  print the hub it found, and the fleet
  cawco service <${SERVICE_ACTIONS.join("|")}> [service...]
                                            run cawco as per-user services
  cawco update [--check] [--to <version>] install the newest release and restart
  cawco deploy init [--origin <url>] [--hub <url>]
                                             developer mode: run from a git clone
  cawco join --hub <url>                  add this machine to that hub's fleet
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
  never watched in either mode — an agent restart detaches and sessions carry on;
  restarting sessiond ends them. \`status\` reads the mode back out of the unit.

  \`restart agent\` asks the running agent which requests retirement would cut.
  \`--when-idle\` waits up to five minutes for those requests; sessions carry on.
  \`restart sessiond\` still waits for turns, because it ends harness processes.
  \`--force\` overrides that sessiond gate only; it never overrides agent holds.

Deploying
  \`cawco deploy init\` clones ${DEPLOY_BRANCH} into ${deployRoot()} — a checkout
  that is nobody's working copy — installs it, builds the dashboard, writes a
  ${DEPLOY_MARKER} marker and installs the services pointing at that clone
  instead of at your editor's checkout. From then on the daemon fetches
  ${DEPLOY_BRANCH} every minute and, when the clone is strictly behind, pulls
  \`--ff-only\`, reinstalls, rebuilds and restarts. Pushing to ${DEPLOY_BRANCH} is
  the fleet deploy.

  The marker is the whole safety story: a checkout without one is never fetched
  and never pulled, so a dev tree cannot auto-update no matter what is running
  in it. A clone that has diverged from origin refuses loudly and is left
  exactly as it is — resetting it would destroy work nobody else has a copy of.

Joining
  \`cawco join --hub <url>\` is what the hub's install script runs, from the
  clone it made at ${deployRoot()}: it saves the hub, makes that clone this
  machine's deployment clone, installs sessiond and the agent (no hub, no
  dashboard), turns on lingering on Linux so they outlive the SSH session, and
  waits for the hub to register the machine. It never prompts. The dashboard's
  Connect a machine dialog does all of it for you, over SSH or as one command.

  On a machine that already runs them, \`join\` and \`deploy init\` leave a
  service alone when nothing about it changed, and replace one that did only
  the way \`service restart --when-idle\` would: the hub is asked, and the
  machine's sessions get five minutes to finish their turns first.

Options
  --hub <url>     hub to use, as http://host:port or ws://host:port/ws
  --token <token> a \`claude setup-token\` token, for \`login\` without a terminal
  --dev           for \`service install\`: run from the checkout, watching it
  --check         for \`update\`: say what is available, install nothing
  --to <version>  for \`update\`: a named release instead of the newest
  --origin <url>  for \`deploy init\`: the remote to clone (default this one's)
  --when-idle     for \`service restart\`: wait for this machine's sessions first
   --force         for \`service restart sessiond\`, \`join\` and \`deploy init\`:
                   override the destructive sessiond restart gate
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
  /** `update --check`: report what is available and change nothing. */
  check: boolean;
  command?: string;
  dev: boolean;
  follow: boolean;
  force: boolean;
  help: boolean;
  hub?: string;
  origin?: string;
  /** Everything after the verb — the services `service` acts on. */
  rest: string[];
  /** `update --to <version>`: a specific release rather than the newest. */
  to?: string;
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
    check: false,
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
      case "--origin":
        index += 1;
        args.origin = argv[index];
        if (!args.origin) {
          throw new UsageError("--origin needs a git URL");
        }
        break;
      case "--to":
        index += 1;
        args.to = argv[index];
        if (!args.to) {
          throw new UsageError("--to needs a version");
        }
        break;
      case "--check":
        args.check = true;
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
  const { currentRestartReadiness, runDaemon, watchDeployment } = await import(
    "@cawco/agent"
  );
  // A hub the operator named is never swapped; only a discovered one may be
  // rediscovered on sustained reconnect failure.
  runDaemon(auth, hub.source !== "flag" && hub.source !== "env");
  // The git-pull path is DEVELOPER MODE now, and off unless asked for.
  //
  // It used to run unconditionally: a machine with a deployment clone tracked
  // `main` and pulled whatever landed there. That is a fine way for the author
  // to run their own fleet and the wrong thing to ship — it makes every commit
  // a release, with no version to name, nothing to roll back to, and no gate
  // between a push and somebody else's machine. Users update from the registry
  // (`cawco update`), where a release is a published version that was built
  // once and can be pinned.
  //
  // Kept, rather than deleted, because running the fleet straight from a
  // checkout is genuinely how this gets developed. It simply has to be chosen:
  // CAWCO_DEPLOY_POLL=1, or a clone that says so in its own marker.
  if (readEnv(CAWCO_ENV.deployPoll) === "1") {
    // One readiness/fence policy protects agent-owned requests. Session turns
    // are not a hold: their processes remain in sessiond across retirement.
    watchDeployment({
      readiness: currentRestartReadiness,
      root: CHECKOUT_ROOT,
      dashboardUrl: dashboardUrl(),
    });
  }
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

/**
 * `cawco deploy init` (PLAN.md C8). One verb, and deliberately only one: the
 * clone is created here, and every deploy after it is a push to the deploy
 * branch that the daemon's poller picks up.
 */
/**
 * What this machine is running, and what it could be.
 *
 * `--check` answers without changing anything, which is what a fleet view and
 * a nervous operator both want first. Without it, the newest release is
 * installed and the services come back on it.
 */
const runUpdate = async (args: Args): Promise<number> => {
  const { checkVersion, registryUpdate } = await import("@cawco/agent");
  const state = await checkVersion(CLI_VERSION);

  if (state.latest === null) {
    console.error(
      `cawco: could not reach the registry — ${state.reason ?? "no reason given"}`
    );
    console.error(`cawco: this machine stays on ${state.installed}.`);
    return 1;
  }

  const wanted = args.to;
  if (!(wanted || state.behind)) {
    console.log(`cawco ${state.installed} is the newest release.`);
    return 0;
  }
  if (args.check) {
    console.log(
      `cawco ${state.installed} installed; ${state.latest} available.`
    );
    console.log("Run `cawco update` to install it.");
    return 0;
  }

  console.log(`cawco: ${state.installed} → ${wanted ?? state.latest}`);
  const report = await registryUpdate({
    installed: state.installed,
    ...(wanted ? { to: wanted } : {}),
    restartAgent: false,
  });
  await service("restart", {
    ids: ["agent"],
    mode: "prod",
    follow: false,
    whenIdle: true,
    force: args.force,
    note: console.log,
  });
  console.log(`installed ${report.to}`);
  if (report.restarted.length > 0) {
    console.log(`restarted ${report.restarted.join(", ")}`);
  }
  if (report.skipped) {
    console.log(`skipped   ${report.skipped}`);
  }
  return 0;
};

const runDeploy = async (args: Args): Promise<number> => {
  if (args.action !== "init") {
    throw new UsageError("cawco deploy takes one verb: init");
  }
  if (args.hub) {
    if (!toHttpBase(args.hub)) {
      throw new UsageError(`--hub ${args.hub} is not a URL`);
    }
    // Save the first machine's own hub before its agent starts discovering.
    await discoverHub({ hub: args.hub });
    process.env[CAWCO_ENV.hubUrl] = toHttpBase(args.hub) as string;
  }
  const result = await deployInit({
    ...(args.origin === undefined ? {} : { origin: args.origin }),
    force: args.force,
    note: (line) => console.log(line),
  });
  if (args.hub) {
    await awaitFirstMachineReady(toHttpBase(args.hub) as string, (line) =>
      console.log(`${INSTALL_STEP_PREFIX}${line}`)
    );
  }
  console.log("");
  console.log(
    `clone    ${result.root} (${result.origin}, ${result.branch}) at ${result.head}`
  );
  console.log(`marker   ${result.root}/${DEPLOY_MARKER}`);
  for (const generated of result.units) {
    console.log(`unit     ${generated.path}`);
  }
  console.log("");
  console.log(`This machine now deploys on every push to ${result.branch}.`);
  return 0;
};

/**
 * How long `join` waits for the hub to list this machine online once its
 * services are up. A fresh agent registers within seconds; the margin covers
 * a slow first start (the SDK loading cold off a new install).
 */
const JOIN_REGISTER_MS = 90_000;

/**
 * Waits for the hub to hold a live socket from `machineId`: the one thing that
 * makes the join true, as opposed to the services merely having started.
 */
const awaitRegistration = async (
  httpUrl: string,
  machineId: string
): Promise<void> => {
  const deadline = Date.now() + JOIN_REGISTER_MS;
  while (Date.now() < deadline) {
    // biome-ignore lint/performance/noAwaitInLoops: a poll — each read must see the hub after the previous one
    const agents = await fetch(`${httpUrl}/api/agents`, {
      signal: AbortSignal.timeout(5000),
    })
      .then((response) =>
        response.ok ? (response.json() as Promise<AgentRow[]>) : undefined
      )
      .catch(() => undefined);
    if (
      agents?.some(
        (agent) => agent.machineId === machineId && agent.status === "online"
      )
    ) {
      return;
    }
    await Bun.sleep(1000);
  }
  const logs =
    platform() === "darwin"
      ? "tail -n 50 ~/Library/Logs/cawco-agent.log"
      : "journalctl --user -u cawco-agent -n 50";
  throw new ServiceError(
    `the agent is installed, but ${httpUrl} has not listed ${machineId} online after ${JOIN_REGISTER_MS / 1000}s. Read why with: ${logs}`
  );
};

/**
 * `cawco join --hub <url>`: this machine, into that hub's fleet, in one
 * unattended run. It is `deploy init` for a worker — the same code path, with
 * sessiond and the agent only and lingering required — preceded by saving the
 * hub and followed by waiting for the hub to see the machine.
 */
const runJoin = async (args: Args): Promise<number> => {
  if (!args.hub) {
    throw new UsageError("cawco join needs --hub <url>, the hub to join");
  }
  if (!toHttpBase(args.hub)) {
    throw new UsageError(`--hub ${args.hub} is not a URL`);
  }
  const say = (line: string): void =>
    console.log(`${INSTALL_STEP_PREFIX}${line}`);

  // Through discovery, so the hub is saved exactly as `up` saves one it was
  // told — the agent unit's `up` finds it there on every start.
  const hub = (await discoverHub({ hub: args.hub })) as Hub;
  process.env[CAWCO_ENV.hubUrl] = hub.httpUrl;
  say(`saved hub ${hub.httpUrl}`);

  say(`setting up ${deployRoot()} as this machine's deployment clone`);
  await deployInit({
    command: "cawco join",
    force: args.force,
    // The clone moved under this process: the join it pulled finishes the run.
    onPulled: async () => {
      say("running the cawco join it just pulled");
      const next = Bun.spawn(
        [process.execPath, Bun.main, ...Bun.argv.slice(2)],
        {
          stdio: ["inherit", "inherit", "inherit"],
        }
      );
      process.exit(await next.exited);
    },
    ids: ["sessiond", "agent"],
    requireLinger: true,
    // deployInit's steps are the lines that end in an ellipsis ("bun
    // install…"); those are progress, and everything else is detail.
    note: (line) =>
      console.log(line.endsWith("…") ? `${INSTALL_STEP_PREFIX}${line}` : line),
  });

  const { machineId } = await import("@cawco/agent");
  const id = await machineId();
  say(`waiting for ${hub.httpUrl} to list ${id} online`);
  await awaitRegistration(hub.httpUrl, id);
  say(`joined as ${id}`);
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
    case "update":
      return runUpdate(args);
    case "deploy":
      return runDeploy(args);
    case "join":
      return runJoin(args);
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
