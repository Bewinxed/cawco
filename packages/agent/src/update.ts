/**
 * Turning this machine's checkout into the current one (NEW.md §12): pull,
 * install, rebuild the dashboard, restart the services running out of it. The
 * fleet is edited while it runs, so this is how a machine that fell behind is
 * caught up — without a terminal on it, and without clobbering a dev machine
 * that is mid-edit.
 */

import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import type { UpdateReport } from "@cawco/core";
import { CAWCO_ENV, CAWCO_HUB_PORT, readEnv } from "@cawco/core";
import { buildInfo, REPO_ROOT } from "./build";
import {
  checkDeploy,
  DEPLOY_BRANCH,
  DeployBlocked,
  type DeployPoller,
  type DeployState,
  type DeployWatcherOptions,
  deployRoot,
  describeDeploy,
  startDeployPoller,
} from "./deploy";
import { toolEnv } from "./tools";

export interface UpdateOptions {
  /**
   * Pull from `origin/<branch>` by name rather than from whatever upstream the
   * checkout has configured. The deployment poller and the manual
   * `updateCawco` control both pass {@link DEPLOY_BRANCH} (C8/G3): a
   * fast-forward onto a branch nobody named is how a clone quietly starts
   * following something else.
   */
  branch: string;
  /**
   * How many turns this daemon is carrying. Filled in by the supervisor, which
   * is the only thing that knows — never read off the wire.
   */
  busy?: number;
  /** Pull onto a dirty checkout, and restart the agent mid-turn. Both are refusals. */
  force?: boolean;
  /** Restart this daemon too, once everything else is up — and only when idle. */
  restartAgent?: boolean;
  /**
   * Which checkout to update. Defaults to the one this daemon is running out of
   * — which is the whole of what the manual `updateCawco` control ever meant.
   * The deployment poller passes the marked clone explicitly (C8), because
   * "wherever this file happens to sit" is not a thing to pull into.
   */
  root?: string;
}

/** The end of a command's output: enough to name what happened, not a wall of it. */
const TAIL_LINES = 4;

const tail = (output: string): string =>
  output.trim().split("\n").slice(-TAIL_LINES).join("\n");

/** Bounds, in the order the steps run. A step that will not end must not hold the rest. */
const GIT_TIMEOUT_MS = 60_000;
const INSTALL_TIMEOUT_MS = 5 * 60_000;
const BUILD_TIMEOUT_MS = 10 * 60_000;
const SERVICE_TIMEOUT_MS = 30_000;

export interface Ran {
  code: number;
  ok: boolean;
  /** Everything it wrote, stderr then stdout, uncut: what a failure reports. */
  output: string;
  /** The tail of what it said: what it printed, or what it failed with. */
  said: string;
}

/**
 * One step, in the checkout and with the daemon's PATH. Killed rather than left
 * running if it hangs: a pull against an unreachable remote would otherwise hold
 * the control open forever, and the hub would never hear how the update went.
 */
export const run = async (
  argv: string[],
  timeoutMs: number,
  cwd: string = REPO_ROOT
): Promise<Ran> => {
  const child = Bun.spawn(argv, {
    cwd,
    env: toolEnv(),
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
  });
  const [stdout, stderr] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const code = await child.exited;
  if (child.signalCode) {
    const timedOut = `timed out after ${timeoutMs / 1000}s`;
    return { ok: false, code, output: timedOut, said: timedOut };
  }
  const ok = code === 0;
  return {
    ok,
    code,
    output: [stderr.trim(), stdout.trim()].filter(Boolean).join("\n"),
    said: ok ? tail(stdout) || tail(stderr) : tail(stderr) || tail(stdout),
  };
};

const git = (args: string[], cwd?: string): Promise<Ran> =>
  run(["git", ...args], GIT_TIMEOUT_MS, cwd);

/** A failed step, carrying every line it wrote — never a tail of it. */
export const failed = (step: string, ran: Ran): Error =>
  new Error(`${step} failed:\n${ran.output || `exited ${ran.code}`}`);

/** The three services `cawco service install` puts on a machine, in start order. */
export type Service = "hub" | "dashboard" | "agent";

/**
 * The workspace package each service runs, as the installer's units start it
 * (`packages/cli/src/service.ts`): the hub runs `packages/hub/src/index.ts`,
 * the dashboard `apps/dashboard/serve.js`, the agent `packages/cli/src/cli.ts
 * up`. What else each one runs is read from the package.json files, not
 * listed here.
 */
const SERVICE_PACKAGES: Record<Service, string> = {
  hub: "packages/hub",
  dashboard: "apps/dashboard",
  agent: "packages/cli",
};

export const SERVICES = Object.keys(SERVICE_PACKAGES) as Service[];

/** Checkout-root files every service installs from: a change to either reaches all of them. */
const SHARED_MANIFESTS = new Set(["package.json", "bun.lock"]);

interface Manifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  name: string;
}

/**
 * The directories whose code each service runs: its own package and every
 * workspace package it depends on, transitively, as the manifests on disk
 * declare them. Dev dependencies count, because the dashboard's build takes
 * its workspace packages that way.
 */
const serviceDirs = async (
  root: string
): Promise<Record<Service, string[]>> => {
  const { workspaces } = (await Bun.file(
    join(root, "package.json")
  ).json()) as {
    workspaces: string[];
  };
  const paths = (
    await Promise.all(
      workspaces.map((pattern) =>
        Array.fromAsync(
          new Bun.Glob(`${pattern}/package.json`).scan({ cwd: root })
        )
      )
    )
  ).flat();
  const manifests = await Promise.all(
    paths.map(async (path) => ({
      dir: dirname(path),
      manifest: (await Bun.file(join(root, path)).json()) as Manifest,
    }))
  );
  const packages = new Map(
    manifests.map(({ dir, manifest }) => [
      manifest.name,
      {
        dir,
        deps: Object.entries({
          ...manifest.dependencies,
          ...manifest.devDependencies,
        })
          .filter(([, version]) => version.startsWith("workspace:"))
          .map(([name]) => name),
      },
    ])
  );
  const workspace = (name: string) => {
    const entry = packages.get(name);
    if (!entry) {
      throw new Error(`${name} is not a workspace package in ${root}`);
    }
    return entry;
  };
  const named = new Map(
    [...packages].map(([name, { dir }]) => [dir, name] as const)
  );
  const closure = (service: Service): string[] => {
    const start = named.get(SERVICE_PACKAGES[service]);
    if (!start) {
      throw new Error(
        `${SERVICE_PACKAGES[service]} is not a workspace package in ${root}`
      );
    }
    const seen = new Set([start]);
    const queue = [start];
    for (let name = queue.pop(); name; name = queue.pop()) {
      for (const dep of workspace(name).deps) {
        if (!seen.has(dep)) {
          seen.add(dep);
          queue.push(dep);
        }
      }
    }
    return [...seen].map((name) => workspace(name).dir);
  };
  return {
    hub: closure("hub"),
    dashboard: closure("dashboard"),
    agent: closure("agent"),
  };
};

/**
 * The services a pulled range reaches: each one whose directories
 * ({@link serviceDirs}) hold a file the range changed, and all of them when a
 * shared manifest changed. A deploy rebuilds and restarts exactly these. It
 * used to restart the hub on every deploy, and a restarted hub reads every
 * machine offline until its daemon registers again, so a day of
 * dashboard-only pushes kept flashing the whole fleet offline.
 */
export const changedServices = async (
  root: string,
  from: string,
  to: string
): Promise<Service[]> => {
  const files = (
    await Bun.$`git diff --name-only ${`${from}..${to}`}`
      .cwd(root)
      .quiet()
      .text()
  )
    .split("\n")
    .filter(Boolean);
  if (files.some((file) => SHARED_MANIFESTS.has(file))) {
    return SERVICES;
  }
  const dirs = await serviceDirs(root);
  return SERVICES.filter((service) =>
    files.some((file) =>
      dirs[service].some((dir) => file.startsWith(`${dir}/`))
    )
  );
};

/**
 * Where that install left them — the same two paths it writes, named here
 * because the daemon cannot depend on the CLI that owns them. The unit names
 * must stay identical to the installer's in `packages/cli`.
 */
const unitPath = (id: Service): string =>
  platform() === "darwin"
    ? join(homedir(), "Library", "LaunchAgents", `dev.cawco.${id}.plist`)
    : join(
        process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
        "systemd",
        "user",
        `cawco-${id}.service`
      );

/** A service nobody installed here is not this machine's to restart. */
const isInstalled = (id: Service): Promise<boolean> =>
  Bun.file(unitPath(id)).exists();

const restartCommand = (id: Service): string[] =>
  platform() === "darwin"
    ? [
        "launchctl",
        "kickstart",
        "-k",
        `gui/${process.getuid?.() ?? 0}/dev.cawco.${id}`,
      ]
    : ["systemctl", "--user", "restart", `cawco-${id}.service`];

/** How long the reply gets to reach the hub before this daemon goes down with it. */
const RESTART_DELAY_S = 1;

/**
 * Neither the agent nor the hub can restart in front of whoever asked: the
 * report they owe is still on its way through the socket the restart kills.
 * Handed to a shell that waits a second first — every argument is a unit name
 * or a launchd label, so joining them is safe.
 */
const scheduleRestart = (id: "agent" | "hub"): void => {
  const command = `sleep ${RESTART_DELAY_S}; exec ${restartCommand(id).join(" ")}`;
  Bun.spawn(["sh", "-c", command], {
    stdio: ["ignore", "ignore", "ignore"],
  }).unref();
};

/** Where "an agent restart is owed for commit X" lives, next to the deploy marker it complements. */
const restartMarkerPath = (root: string): string =>
  join(root, ".cawco-restart-pending.json");

/**
 * Written by the process about to restart itself, right before it does —
 * read back by the process that comes up in its place ({@link
 * consumeRestartMarker}, called from the fresh daemon's own startup). A live
 * socket send here would race the `exec` that kills this process: the next
 * heartbeat carrying it might be up to `HEARTBEAT_INTERVAL` away, and this
 * process will not live that long. A file the next process reads at its own
 * `register` cannot lose that race — there is no clock to beat.
 */
const writeRestartMarker = (root: string, commit: string): Promise<number> =>
  Bun.write(
    restartMarkerPath(root),
    JSON.stringify({ commit, at: Date.now() })
  );

/** How long a marker is trusted before it reads as stale leftover from some earlier, unrelated restart rather than this one. */
const RESTART_MARKER_FRESH_MS = 2 * 60_000;

/**
 * Consumed exactly once, by the process that just came up: `true` only when
 * this process's own build commit matches the one the marker names, and the
 * marker is fresh enough to be THIS restart rather than a stale leftover.
 * Deletes the marker either way, so a later restart of the same commit — a
 * crash, a manual `service restart` — never re-announces one that already
 * happened.
 */
export const consumeRestartMarker = async (
  root: string,
  commit: string
): Promise<boolean> => {
  const path = restartMarkerPath(root);
  const marker = (await Bun.file(path)
    .json()
    .catch(() => undefined)) as { at?: number; commit?: string } | undefined;
  await Bun.file(path)
    .delete()
    .catch(() => {
      // best effort: nothing to consume
    });
  return (
    marker?.commit === commit &&
    typeof marker.at === "number" &&
    Date.now() - marker.at < RESTART_MARKER_FRESH_MS
  );
};

/**
 * The idle-gated half of the deploy channel (unifying C8 with the CLI's own
 * `--when-idle` restart, `packages/cli/src/service.ts`): called by the deploy
 * poller only once IT has already established the machine is idle enough to
 * interrupt. This function itself never checks busy — it is exactly as safe,
 * and exactly as blunt, as `restartStack`'s own `scheduleRestart("agent")`
 * call — the busy gate is the caller's job precisely so it can be asked again
 * on the next tick instead of asked once and given up on.
 */
export const restartAgentNow = async (
  root: string,
  commit: string
): Promise<boolean> => {
  if (!(await isInstalled("agent"))) {
    return false;
  }
  await writeRestartMarker(root, commit);
  scheduleRestart("agent");
  return true;
};

/** What the dashboard service serves, and the sign that this machine builds it. */
const dashboardBuild = (root: string): string =>
  join(root, "apps", "dashboard", "build", "index.js");

/**
 * The commit the dashboard on disk was built from: the build stamps it into
 * `_app/version.json` (apps/dashboard/svelte.config.js, `kit.version.name`),
 * the same short hash `git rev-parse --short HEAD` gives. No build, no commit.
 */
const builtCommit = async (root: string): Promise<string | undefined> => {
  const stamp = (await Bun.file(
    join(root, "apps", "dashboard", "build", "client", "_app", "version.json")
  )
    .json()
    .catch(() => undefined)) as { version?: string } | undefined;
  return stamp?.version;
};

const probeCommit = async (
  url: string,
  service: "hub" | "dashboard"
): Promise<string | undefined> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const body = (await response.json()) as {
      build?: { commit?: string };
      version?: string;
    };
    return service === "hub" ? body.build?.commit : body.version;
  } catch (error) {
    console.error(
      `cawco deploy: ${service} running commit unavailable: ${String(error)}; restart still owed`
    );
    return undefined;
  }
};

/** Runtime commits, not the range of the last pull, survive an interrupted deploy. */
const owedServices = async (
  root: string,
  head: string,
  dashboardUrl?: string
): Promise<Service[]> => {
  const owed = await Promise.all(
    SERVICES.map(async (service) => {
      if (!(await isInstalled(service))) {
        return;
      }
      if (service === "dashboard" && !dashboardUrl) {
        throw new Error(
          "dashboard running-commit probe owed: no installed dashboard address supplied"
        );
      }
      const running =
        service === "agent"
          ? (await buildInfo()).commit
          : await probeCommit(
              service === "hub"
                ? `http://127.0.0.1:${readEnv(CAWCO_ENV.hubPort) ?? CAWCO_HUB_PORT}/health`
                : `${dashboardUrl}/_app/running-version.json`,
              service
            );
      if (running === head) {
        return;
      }
      if (
        !running ||
        (await changedServices(root, running, head)).includes(service)
      ) {
        console.error(
          `cawco deploy: ${service} owed ${running ?? "unknown"} → ${head}`
        );
        return service;
      }
    })
  );
  return owed.filter((service): service is Service => service !== undefined);
};

/**
 * Whether a dashboard build is this machine's business. A worker running only
 * the daemon has no reason to spend minutes on a bundle nobody will serve, and
 * a machine that has one already is one that serves it.
 */
const buildsDashboard = async (root: string): Promise<boolean> =>
  (await Bun.file(dashboardBuild(root)).exists()) ||
  (await isInstalled("dashboard"));

/**
 * A restart re-runs whatever the installed unit says, so a change to HOW the
 * dashboard is served (its runtime, the socket it is handed) reaches this
 * machine only once the unit says so. The units are written by the CLI that
 * just arrived — the pulled checkout's `cli.ts`, or the freshly installed
 * release's `cli.js` — not by this daemon, which is still running the code
 * from before the update and knows only the old units. `cli` is that entry
 * point, run from `cwd`, the root of what arrived. An update that did not
 * reach the dashboard, and a machine that never installed it, are left alone.
 */
export const installDashboardUnits = async (
  changed: UpdateReport["changed"],
  cli: string,
  cwd: string
): Promise<void> => {
  if (!(changed.includes("dashboard") && (await isInstalled("dashboard")))) {
    return;
  }
  const units = await run(
    [process.execPath, cli, "service", "install", "dashboard"],
    SERVICE_TIMEOUT_MS,
    cwd
  );
  if (!units.ok) {
    throw failed("installing the dashboard's units", units);
  }
};

/**
 * How the checkout is moved forward, and the one line of this file that the
 * deployment channel's safety rests on (C8/G3).
 *
 * `--ff-only` always: a pull that cannot fast-forward fails loudly and leaves
 * the checkout exactly as it was. There is no merge, no rebase and no reset
 * anywhere in this module — a diverged deployment clone is a thing for a person
 * to look at, because the commits it has that origin does not may be the only
 * copy in existence.
 *
 * The remote and ref are always given explicitly, so the fast-forward can only
 * ever be onto `origin/<branch>` rather than onto whatever upstream the
 * checkout has picked up since.
 */
export const pullArgs = (branch: string): string[] => [
  "pull",
  "--ff-only",
  "origin",
  branch,
];

/**
 * The tail of the update queue. Git refuses two pulls in one checkout at once
 * ("fatal: Cannot fast-forward…"), and the deployment poller and the manual
 * `updateCawco` control both pull, on their own clocks. Every update in this
 * process runs after the one before it has finished; one that queued behind a
 * pull finds nothing left to fetch and reports the commit it is already on.
 */
let updateQueue: Promise<unknown> = Promise.resolve();

const installCheckout = async (
  root: string,
  commit: string,
  automatic: boolean
): Promise<boolean> => {
  const path = await git(
    ["rev-parse", "--path-format=absolute", "--git-path", "cawco-installed"],
    root
  );
  if (!path.ok) {
    throw failed("finding the install receipt", path);
  }
  const installedCommit = await Bun.file(path.said)
    .text()
    .catch(() => "");
  if (automatic && installedCommit === commit) {
    return false;
  }
  console.error(`cawco deploy: install owed for ${commit}`);
  const installed = await run(
    [process.execPath, "install", "--frozen-lockfile"],
    INSTALL_TIMEOUT_MS,
    root
  );
  if (!installed.ok) {
    throw failed("bun install", installed);
  }
  await Bun.write(path.said, commit);
  return true;
};

/**
 * Everything the `updateCawco` control does, in the order it has to happen.
 * Every field of the report is what actually took place: a step that was
 * asked for and did not run says why in `skipped` rather than reading as done.
 */
export const updateCheckout = (
  options: UpdateOptions
): Promise<UpdateReport> => {
  const update = updateQueue.then(() => pullAndRestart(options));
  updateQueue = update.catch(() => undefined);
  return update;
};

/** Include a build interrupted before a service restart, even across later pulls. */
const includeDashboardDebt = async (
  root: string,
  report: UpdateReport
): Promise<void> => {
  if (!report.to) {
    throw new Error("dashboard reconciliation requires the checkout HEAD");
  }
  const stamped = await builtCommit(root);
  if (
    stamped &&
    stamped !== report.to &&
    !report.changed.includes("dashboard") &&
    (await changedServices(root, stamped, report.to)).includes("dashboard")
  ) {
    report.changed = [...report.changed, "dashboard"];
  }
};

const pullAndRestart = async (
  { restartAgent, force, busy = 0, root = REPO_ROOT, branch }: UpdateOptions,
  deployment?: {
    state: Extract<DeployState, { kind: "behind" | "current" }>;
    dashboardUrl?: string;
  }
): Promise<UpdateReport> => {
  const head = await git(["rev-parse", "--short", "HEAD"], root);
  if (!head.ok) {
    throw new Error(
      `${root} is not a git checkout, so there is nothing to pull`
    );
  }

  const dirty = await git(["status", "--porcelain"], root);
  if (!dirty.ok) {
    throw failed("git status", dirty);
  }
  if (dirty.said && !force) {
    // Blocked, not failed: the pull has not been tried, and the same head is
    // worth trying again the moment the tree is clean.
    throw new DeployBlocked(
      "the checkout has uncommitted changes; refusing to pull"
    );
  }

  const args = pullArgs(branch);
  const pulled =
    deployment?.state.kind === "current"
      ? { ok: true, said: "checkout already current" }
      : await git(args, root);
  if (!pulled.ok) {
    throw failed(`git ${args.join(" ")}`, pulled as Ran);
  }
  const moved = await git(["rev-parse", "--short", "HEAD"], root);
  if (!moved.ok) {
    throw failed("git rev-parse", moved);
  }

  const report: UpdateReport = {
    from: head.said,
    to: moved.said,
    pulled: pulled.said,
    installed: false,
    built: false,
    restarted: [],
    // Nothing arrived, so nothing to install and nothing to build, but every
    // service is still restarted, because being asked to update a machine that
    // is already current is how a wedged one gets picked up off the floor.
    changed:
      moved.said === head.said
        ? SERVICES
        : await changedServices(root, head.said, moved.said),
  };
  if (deployment) {
    report.changed = await owedServices(
      root,
      moved.said,
      deployment.dashboardUrl
    );
  }
  const skipped: string[] = [];

  // The dashboard on disk can be older than this pull's range. An update cut
  // short after its pull (the agent restarted under the build it was running)
  // leaves the checkout current and the build behind, and no later range
  // names the commits in between, so the build it was stamped from decides.
  await includeDashboardDebt(root, report);

  // Every step below is decided by what is on disk, not by whether this pull
  // moved HEAD: a deploy that failed partway is retried with nothing left to
  // pull, and it has to finish the steps that did not happen then.
  //
  // Frozen, so a commit whose bun.lock disagrees with its package.json files
  // fails this one deploy instead of rewriting bun.lock and leaving the clone
  // dirty, which would refuse every later pull. With nothing new it is a no-op.
  report.installed = await installCheckout(
    root,
    moved.said,
    Boolean(deployment)
  );

  // The units go in before the build: the build overwrites the assets the
  // running dashboard's pages point at, so anything that can fail between the
  // build and the restart leaves the live dashboard serving pages whose
  // scripts are gone. A units step that fails here leaves the old build whole.
  await installDashboardUnits(
    report.changed,
    join(root, "packages", "cli", "src", "cli.ts"),
    root
  );

  // A range that changed nothing the dashboard runs builds nothing; the
  // restart skip in `restartStack` says so for both.
  if (report.changed.includes("dashboard")) {
    if (!(await buildsDashboard(root))) {
      skipped.push("this machine serves no dashboard, so none was built");
    } else if ((await builtCommit(root)) === report.to) {
      skipped.push(`the dashboard is already built from ${report.to}`);
    } else {
      console.error(`cawco deploy: dashboard build owed for ${report.to}`);
      const built = await run(
        [process.execPath, "run", "--filter", "@cawco/dashboard", "build"],
        BUILD_TIMEOUT_MS,
        root
      );
      if (!built.ok) {
        throw failed("the dashboard build", built);
      }
      report.built = true;
    }
  }

  const result = await restartStack(
    report,
    { restartAgent, force, busy },
    skipped
  );
  if (deployment && result.skipped && result.changed.length > 0) {
    console.error(`cawco deploy: skipped: ${result.skipped}`);
  }
  return result;
};

/**
 * Bring the services onto whatever code is now on disk.
 *
 * Split out from the git flow because the interesting part of an update is not
 * how the bytes arrived — it is the order the stack comes back in, and which
 * pieces are allowed to go down while somebody is waiting on the answer. That
 * reasoning is identical whether the new code came from a pull or from a
 * registry install, and it is the part that is easy to get subtly wrong.
 */
export const restartStack = async (
  report: UpdateReport,
  {
    restartAgent,
    force,
    busy = 0,
  }: { restartAgent?: boolean; force?: boolean; busy?: number },
  skipped: string[]
): Promise<UpdateReport> => {
  // Only what `report.changed` names comes down: a service whose code the
  // update did not touch is still running exactly what is on disk.
  const untouched = SERVICES.filter(
    (service) => service !== "agent" && !report.changed.includes(service)
  );
  if (untouched.length > 0) {
    skipped.push(
      `nothing the ${untouched.join(" or ")} runs changed, so it was left running`
    );
  }
  // The dashboard restarts in front of whoever asked; the hub cannot. An update
  // is asked for *through* the hub, so restarting it inline kills the socket the
  // reply is still travelling on and the caller reads a timeout for an update
  // that worked. It is scheduled for a second later, exactly as this daemon
  // schedules its own restart, and for exactly the same reason.
  if (
    report.changed.includes("dashboard") &&
    (await isInstalled("dashboard"))
  ) {
    console.error(`cawco deploy: dashboard restart owed for ${report.to}`);
    const restarted = await run(
      restartCommand("dashboard"),
      SERVICE_TIMEOUT_MS
    );
    if (!restarted.ok) {
      throw failed("restarting dashboard", restarted);
    }
    report.restarted.push("dashboard");
  }
  if (report.changed.includes("hub") && (await isInstalled("hub"))) {
    console.error(
      `cawco deploy: hub restart owed for ${report.to}; scheduled in ${RESTART_DELAY_S}s`
    );
    report.restarted.push("hub");
    scheduleRestart("hub");
  }

  // Last, and only when asked: this daemon is hosting the sessions the restart
  // would cut in half. Reported as restarted rather than as scheduled — the
  // second it waits is only there so this report can leave first.
  if (restartAgent) {
    if (!report.changed.includes("agent")) {
      skipped.push("nothing the agent runs changed, so it was left running");
    } else if (busy > 0 && !force) {
      skipped.push(
        `the agent is carrying ${busy} turn(s), so it was left running`
      );
    } else if (await isInstalled("agent")) {
      report.restarted.push("agent");
      scheduleRestart("agent");
    } else {
      skipped.push(
        "the agent runs no service here, so nothing could restart it"
      );
    }
  }

  if (skipped.length > 0) {
    report.skipped = skipped.join("; ");
  }
  return report;
};

/**
 * The deployment trigger (C8): the poller decides *whether*, this decides
 * what. Kept here rather than in `deploy.ts` so that module stays a pure
 * observer — it can be read, and tested, without the ability to pull anything.
 *
 * A daemon that pulled a new commit and kept running the old one has not
 * deployed — but `restartAgent: false`, always, is deliberate: this call
 * always ran with `restartAgent: true` and no busy count, so a push always
 * force-restarted the agent mid-turn, busy or not, and the comment here used
 * to call that "free by construction" because the harness children live in
 * sessiond's cgroup rather than the agent's. Free for the *session* — custody
 * survives it — is not free for whoever was mid-stream on it. `deploy.ts`
 * (`DeployWatcher#drainPendingRestart`) now owns that decision instead, with
 * the real busy count and a retry every tick until idle, rather than a
 * one-shot check against a number this call never even asked for.
 */
export const deployUpdate = (
  state: DeployState,
  dashboardUrl?: string
): Promise<UpdateReport> => {
  if (state.kind !== "behind" && state.kind !== "current") {
    throw new Error(
      `refusing to update a checkout that is ${state.kind}: ${describeDeploy(state)}`
    );
  }
  const update = updateQueue.then(() =>
    pullAndRestart(
      {
        root: state.root,
        branch: DEPLOY_BRANCH,
        restartAgent: false,
      },
      { state, dashboardUrl }
    )
  );
  updateQueue = update.catch(() => undefined);
  return update;
};

export type DeployWatchOptions = Partial<
  Omit<DeployWatcherOptions, "update">
> & {
  readonly intervalMs?: number;
  readonly dashboardUrl?: string;
};

/**
 * What the daemon's entry point starts: poll the deployment clone, and run the
 * reconciliation on every marked, non-diverged tick, even with HEAD already at
 * `origin/main`. On a machine that was never deployed
 * to, the very first thing every tick does is fail the marker check, so the
 * poller is a no-op in a dev tree by construction rather than by configuration.
 */
export const watchDeployment = (
  options: DeployWatchOptions = {}
): DeployPoller =>
  startDeployPoller({
    // The real idle-gated restart, unless a caller (the tests) names its own.
    restartAgent: restartAgentNow,
    ...options,
    update: (state) => deployUpdate(state, options.dashboardUrl),
  });

/**
 * Where this machine stands against the deployment branch, asked once. What
 * `cawco deploy status` prints, and what the daemon can answer with.
 */
export const deploymentState = (
  root: string = deployRoot()
): Promise<DeployState> => checkDeploy({ root });
