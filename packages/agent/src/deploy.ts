/**
 * The deployment channel (PLAN.md contract C8): every machine's services run out
 * of a dedicated clean clone that tracks `origin/main`, and this daemon watches
 * that clone for new commits.
 *
 * The problem it exists for, measured rather than imagined: the services on this
 * fleet have been running straight out of a dev working tree that many agent
 * sessions edit at once, so a restart deploys whatever was half-written at that
 * second, and {@link import('./update').updateCheckout} rightly refuses a dirty
 * checkout — which means the machine could never catch itself up. Meanwhile the
 * Mac's daemon ran for 21 days without ever learning that main had moved,
 * because nothing looked.
 *
 * The guard is the marker. A checkout with no `.cawco-deploy` in it is not a
 * deployment clone, and this module will not so much as *fetch* in one, let
 * alone pull. That is deliberately the first thing every path here checks: a dev
 * tree must be structurally unable to auto-pull, and "we remembered to check"
 * is not a structure.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import type {
  AgentRestartReadiness,
  DeployInfo,
  UpdateReport,
} from "@cawco/core";
import { CAWCO_ENV, readEnv } from "@cawco/core";
import { describeRestartHolds, retireAgent } from "./restart";

/**
 * The marker file, relative to the clone's root. Its presence — and nothing
 * else — is what licenses an automatic pull.
 */
export const DEPLOY_MARKER = ".cawco-deploy";

/**
 * Where a machine's deployment clone lives. Our choice: per-user so it needs no
 * sudo, under a dotdir so it is nobody's working copy, and deliberately outside
 * every dev checkout so `git clean -fdx` in one cannot reach it.
 *
 * `CAWCO_DEPLOY_ROOT` overrides it — that is how the tests point at a scratch
 * directory, and how a machine with a different home layout is accommodated.
 */
export const deployRoot = (): string =>
  readEnv(CAWCO_ENV.deployRoot) ?? join(homedir(), ".cawco", "app");

/** The branch a deployment clone follows. Push to it and the fleet deploys. */
export const DEPLOY_BRANCH = "main";

/**
 * How often the daemon asks whether main has moved. Our choice, 60 s: a fetch
 * of one branch is a few KiB and costs the remote nothing at fleet scale, and a
 * minute is under the time it takes an operator to walk to the machine and
 * wonder why it has not picked the push up.
 */
export const DEPLOY_POLL_MS = 60_000;

/** What `cawco deploy init` wrote, read back. */
export interface DeployMarker {
  /** The branch it tracks — {@link DEPLOY_BRANCH}. */
  readonly branch: string;
  /** ISO 8601, when init ran. */
  readonly createdAt: string;
  /** What wrote it, so a person finding the file knows what to ask. */
  readonly createdBy: string;
  /** The remote it was cloned from. */
  readonly origin: string;
  /** The clone's root, as init resolved it. */
  readonly root: string;
}

export const markerPath = (root: string): string => join(root, DEPLOY_MARKER);

/**
 * The marker, or nothing. A file that is there but unreadable, or that does not
 * carry the fields init writes, is treated as no marker at all: the guard fails
 * closed, because the failure it is guarding against is pulling into somebody's
 * unfinished work.
 */
export const readDeployMarker = async (
  root: string = deployRoot()
): Promise<DeployMarker | undefined> => {
  const parsed = (await Bun.file(markerPath(root))
    .json()
    .catch(() => undefined)) as Partial<DeployMarker> | undefined;
  if (!parsed || typeof parsed !== "object") {
    return undefined;
  }
  const { root: markedRoot, origin, branch, createdAt, createdBy } = parsed;
  if (
    typeof markedRoot !== "string" ||
    typeof origin !== "string" ||
    typeof branch !== "string" ||
    typeof createdAt !== "string" ||
    typeof createdBy !== "string"
  ) {
    return undefined;
  }
  return { root: markedRoot, origin, branch, createdAt, createdBy };
};

export const isDeployClone = async (
  root: string = deployRoot()
): Promise<boolean> => (await readDeployMarker(root)) !== undefined;

/**
 * Where a checkout stands against the branch it deploys from. Every kind but
 * `behind` means *do not pull*, and each says why in terms someone reading the
 * board can act on.
 */
export type DeployState =
  /** No marker: this is somebody's working tree, and nothing here touches it. */
  | { readonly kind: "unmarked"; readonly root: string }
  /** The marker is there but the checkout is not usable — no git, no remote. */
  | {
      readonly kind: "unreachable";
      readonly root: string;
      readonly reason: string;
    }
  /** Level with the branch; running services may still owe deploy steps. */
  | { readonly kind: "current"; readonly root: string; readonly head: string }
  /** New commits upstream and none of our own: the one state that deploys. */
  | {
      readonly kind: "behind";
      readonly root: string;
      readonly head: string;
      readonly target: string;
      readonly behind: number;
    }
  /**
   * Commits here that the branch does not have. Nothing to pull, so nothing
   * fails — but it is reported, because a deployment clone growing local
   * commits is somebody having debugged on the wrong machine.
   */
  | {
      readonly kind: "ahead";
      readonly root: string;
      readonly head: string;
      readonly target: string;
      readonly ahead: number;
    }
  /**
   * Both sides moved. This is the refusal the contract is most insistent
   * about: never reset, never force-pull, never rebase. Losing an operator's
   * divergence silently is worse than not deploying, so the clone stays exactly
   * as it is and the skew is surfaced until a person resolves it.
   */
  | {
      readonly kind: "diverged";
      readonly root: string;
      readonly head: string;
      readonly target: string;
      readonly ahead: number;
      readonly behind: number;
    };

/** One command's outcome, in the shape the checks below want to read it. */
interface Ran {
  readonly err: string;
  readonly ok: boolean;
  readonly out: string;
}

/** How long a git call gets before it has plainly hung — a fetch to a dead remote. */
const GIT_TIMEOUT_MS = 60_000;
const WHITESPACE = /\s+/;

export type GitRunner = (root: string, args: readonly string[]) => Promise<Ran>;

const runGit: GitRunner = async (root, args) => {
  const child = Bun.spawn(["git", "-C", root, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: GIT_TIMEOUT_MS,
  });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const code = await child.exited;
  if (child.signalCode) {
    return {
      ok: false,
      out: "",
      err: `git ${args[0]} timed out after ${GIT_TIMEOUT_MS / 1000}s`,
    };
  }
  return { ok: code === 0, out: out.trim(), err: err.trim() };
};

export interface DeployCheckOptions {
  /** Injected by the tests, which drive a bare repo in a scratch directory. */
  readonly git?: GitRunner;
  readonly root?: string;
}

/**
 * `git rev-list --left-right --count HEAD...origin/main` prints "ahead\tbehind"
 * — the two-sided question in one call, which is what tells `behind` (safe to
 * fast-forward) apart from `diverged` (never).
 */
const countRange = (
  output: string
): { ahead: number; behind: number } | undefined => {
  const [ahead, behind] = output.trim().split(WHITESPACE).map(Number);
  if (
    ahead === undefined ||
    behind === undefined ||
    !Number.isFinite(ahead) ||
    !Number.isFinite(behind)
  ) {
    return undefined;
  }
  return { ahead, behind };
};

/**
 * Where this checkout stands, right now. The marker is checked *before* any git
 * runs at all: in an unmarked tree not even a fetch happens, so the poller has
 * no side effect whatsoever on a machine that was never deployed to.
 */
export const checkDeploy = async ({
  root = deployRoot(),
  git = runGit,
}: DeployCheckOptions = {}): Promise<DeployState> => {
  const marker = await readDeployMarker(root);
  if (!marker) {
    return { kind: "unmarked", root };
  }

  const branch = marker.branch || DEPLOY_BRANCH;
  const remote = `origin/${branch}`;

  const head = await git(root, ["rev-parse", "--short", "HEAD"]);
  if (!head.ok) {
    return {
      kind: "unreachable",
      root,
      reason: head.err || `${root} is not a git checkout`,
    };
  }

  const fetched = await git(root, ["fetch", "origin", branch]);
  if (!fetched.ok) {
    return {
      kind: "unreachable",
      root,
      reason: fetched.err || `git fetch origin ${branch} failed`,
    };
  }

  const target = await git(root, ["rev-parse", "--short", remote]);
  if (!target.ok) {
    return {
      kind: "unreachable",
      root,
      reason: target.err || `no ${remote} in ${root}`,
    };
  }

  const counted = await git(root, [
    "rev-list",
    "--left-right",
    "--count",
    `HEAD...${remote}`,
  ]);
  const range = counted.ok ? countRange(counted.out) : undefined;
  if (!range) {
    return {
      kind: "unreachable",
      root,
      reason: counted.err || `could not compare HEAD with ${remote} in ${root}`,
    };
  }

  const { ahead, behind } = range;
  if (ahead > 0 && behind > 0) {
    return {
      kind: "diverged",
      root,
      head: head.out,
      target: target.out,
      ahead,
      behind,
    };
  }
  if (behind > 0) {
    return { kind: "behind", root, head: head.out, target: target.out, behind };
  }
  if (ahead > 0) {
    return { kind: "ahead", root, head: head.out, target: target.out, ahead };
  }
  return { kind: "current", root, head: head.out };
};

/** One sentence per state, for a log line and for the board's tooltip alike. */
export const describeDeploy = (state: DeployState): string => {
  switch (state.kind) {
    case "unmarked":
      return `${state.root} carries no ${DEPLOY_MARKER}, so it is a working tree and will never be auto-updated`;
    case "unreachable":
      return `${state.root} could not be compared with its branch: ${state.reason}`;
    case "current":
      return `${state.root} is level with origin at ${state.head}`;
    case "behind":
      return `${state.root} is ${state.behind} commit(s) behind origin: ${state.head} → ${state.target}`;
    case "ahead":
      return `${state.root} has ${state.ahead} local commit(s) origin does not, so there is nothing to pull (head ${state.head})`;
    case "diverged":
      return `${state.root} has DIVERGED from origin — ${state.ahead} local commit(s) and ${state.behind} upstream, head ${state.head} vs ${state.target}. Refusing to update: a reset here would destroy work nobody has a copy of. Resolve it by hand.`;
    default:
      // Exhaustive over DeployState["kind"]; TypeScript enforces every case above.
      return state;
  }
};

/** Whether a state is something an operator should be shown rather than ignore. */
export const isDeploySkew = (state: DeployState): boolean =>
  state.kind === "diverged" ||
  state.kind === "ahead" ||
  state.kind === "unreachable";

/** What one poll did, beyond what the state alone says. */
export interface DeployTick {
  /** What the update flow threw, if it threw. */
  readonly failure?: string;
  readonly state: DeployState;
  /** Whether the update flow was invoked on this tick. */
  readonly updated: boolean;
}

/**
 * A tick, flattened onto the shape the wire and the board share
 * ({@link DeployInfo} in `@cawco/core`). Everything the fuller
 * {@link DeployState} carries — heads, targets, the two counts — is already in
 * the sentence {@link describeDeploy} writes, so the wire carries one kind and
 * one sentence rather than six shapes the reader would have to re-narrate.
 */
export const deployInfo = (tick: DeployTick): DeployInfo => ({
  kind: tick.state.kind,
  detail: describeDeploy(tick.state),
  ...(tick.updated ? { updated: true } : {}),
  ...(tick.failure ? { failure: tick.failure } : {}),
});

/**
 * The most recent tick any watcher in this process produced, and `undefined`
 * until one has. Module-scoped on purpose: the register and the 15s heartbeat
 * are written in `daemon.ts`, which must not own — or start — a poller to be
 * able to say what the last one saw. Nothing here ever polls: a process that
 * never starts a watcher reports no deploy state at all, and the board renders
 * nothing, which is exactly what a machine outside the deployment channel
 * should show.
 */
let latest: DeployInfo | undefined;

export const latestDeploy = (): DeployInfo | undefined => latest;

/** Test seam, and the reset every test that touches {@link latestDeploy} owes the next one. */
export const forgetLatestDeploy = (): void => {
  latest = undefined;
};

export interface DeployWatcherOptions {
  readonly git?: GitRunner;
  /**
   * Agent-owned transactions that retirement would cut. Required: absence is
   * never interpreted as safe. Provider turns do not participate in this read.
   */
  readonly readiness: () => Promise<AgentRestartReadiness>;
  /**
   * Where a tick goes. The default logs; the hub-facing surface (leaf C2)
   * subscribes here rather than reaching into this module.
   */
  readonly report?: (tick: DeployTick) => void;
  /**
   * Fires the agent restart a prior pull left owed, once {@link readiness} says it
   * is safe to. Separate from {@link update} for the same reason `update` is
   * injectable at all: a test must be able to prove the retry-until-idle
   * decision without a real `systemctl restart` behind it. Returns whether
   * it actually restarted anything (`false` on a machine that runs no agent
   * service, e.g. a dev checkout with no unit installed).
   */
  readonly restartAgent?: (root: string, commit: string) => Promise<boolean>;
  readonly root?: string;
  /**
   * The update flow. Left injectable for exactly one reason: this thing pulls
   * and restarts services, and a test must be able to prove the *decision*
   * without performing it. Must not restart the agent itself — see
   * {@link restartAgent}, which owns that half now.
   */
  readonly update: (
    state: Extract<DeployState, { kind: "behind" | "current" }>
  ) => Promise<Pick<UpdateReport, "changed" | "to">>;
}

const say = (line: string): void => console.error(`cawco deploy: ${line}`);

/**
 * The default report: every skew and every deploy is spoken once, and a state
 * that has not changed is not spoken again. A minute-by-minute poller that
 * printed its verdict every time would bury the one line that matters under
 * 1,440 identical ones a day, which is the same as not surfacing it.
 */
const defaultReport = (() => {
  let last = "";
  return (tick: DeployTick): void => {
    const signature = `${tick.state.kind}:${"target" in tick.state ? tick.state.target : ""}:${tick.failure ?? ""}`;
    if (signature === last) {
      return;
    }
    last = signature;
    if (tick.failure) {
      say(`update failed: ${tick.failure}`);
    } else if (tick.updated || isDeploySkew(tick.state)) {
      say(describeDeploy(tick.state));
    }
  };
})();

/**
 * An update that never started, because the machine was not in a state to take
 * one — as opposed to one that ran and went wrong.
 *
 * The distinction is the whole point: a commit that fails to BUILD is a fact
 * about that commit, and retrying it every minute would loop on something only
 * a new push can fix. A checkout that refuses to PULL is a fact about the
 * checkout — nothing was wrong with the target, and the blocker (somebody
 * mid-edit in the deployment clone) clears on its own. Collapsing the two meant
 * a clone that was blocked once stayed pinned to the commit before it for the
 * life of the daemon, still polling, still finding itself behind, and never
 * trying again because it had already "attempted" that head.
 */
export class DeployBlocked extends Error {}

/**
 * The poller's state machine, with no timer in it. Every decision this leaf
 * cares about is a `tick()` away, so the tests exercise the real thing without
 * anything running on a schedule.
 */
export class DeployWatcher {
  readonly #options: DeployWatcherOptions;
  /** A poll is skipped outright while an update is still running. */
  #busy = false;
  #last?: DeployTick;
  /**
   * The commit a pull already landed, whose agent restart is still owed —
   * set the moment `#options.update()` succeeds, cleared only once the
   * restart actually fires (or once nothing here is wired to fire it at
   * all). Deliberately not derived from `state`: the very next tick after a
   * successful pull, `state.kind` is already `"current"`, and nothing about
   * that says a restart is still pending — which is exactly the bug this
   * field exists to not repeat (a restart skipped once, for a checkout no
   * longer behind anything, that nobody ever asked about again).
   */
  #agentRestartOwedFor?: string;
  readonly #held = new Map<string, number>();

  #hold(reason: string): void {
    const now = Date.now();
    if (now - (this.#held.get(reason) ?? 0) >= DEPLOY_POLL_MS) {
      say(reason);
      this.#held.set(reason, now);
    }
  }

  constructor(options: DeployWatcherOptions) {
    this.#options = options;
  }

  get last(): DeployTick | undefined {
    return this.#last;
  }

  async tick(): Promise<DeployTick> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: concurrent interval ticks read #busy while an earlier tick awaits.
    if (this.#busy) {
      this.#hold(
        "tick held: install/build/restart reconciliation is still running"
      );
      // Not a state read: an install-and-build can outlast several intervals,
      // and re-entering it would run two `bun install`s over one node_modules.
      return (
        this.#last ?? {
          state: { kind: "unmarked", root: this.#root },
          updated: false,
        }
      );
    }
    this.#busy = true;
    try {
      const state = await checkDeploy({
        root: this.#options.root,
        git: this.#options.git,
      });
      let tick = await this.#act(state);
      // Independent of whether THIS tick pulled anything: an earlier pull may
      // still be waiting on the machine going idle, and every tick is another
      // chance to ask — the whole point of unifying this with `--when-idle`
      // instead of asking once and giving up.
      try {
        if (!tick.failure) {
          await this.#drainPendingRestart();
        }
      } catch (error) {
        const failure = `agent restart owed: ${error instanceof Error ? error.message : String(error)}`;
        this.#hold(failure);
        tick = { ...tick, failure };
      }
      this.#last = tick;
      // Recorded before the report runs, and regardless of which report it is: a
      // caller that injects its own `report` (the tests do) must not thereby
      // silence the wire, and a report that throws must not lose the state.
      latest = deployInfo(tick);
      (this.#options.report ?? defaultReport)(tick);
      return tick;
    } finally {
      this.#busy = false;
    }
  }

  get #root(): string {
    return this.#options.root ?? deployRoot();
  }

  /**
   * The transaction-gated half of the channel: an agent restart a pull left owed,
   * retried every tick — forever, no timeout, because nobody is at a
   * terminal waiting on this one — until agent-owned work has settled.
   * Every held reason is logged at most once per minute, with its operation ids.
   */
  async #drainPendingRestart(): Promise<void> {
    const commit = this.#agentRestartOwedFor;
    if (!commit) {
      return;
    }
    const restart = this.#options.restartAgent;
    if (!restart) {
      this.#hold(`agent restart to ${commit} owed: no restart handler`);
      return;
    }
    const decision = await retireAgent(this.#options.readiness, () =>
      restart(this.#root, commit)
    );
    if (!decision.ready) {
      this.#hold(
        `agent restart to ${commit} held: ${describeRestartHolds(decision)}`
      );
      return;
    }
    if (decision.scheduled) {
      say(
        `agent restart to ${commit} scheduled (transactions settled; sessions retained)`
      );
      this.#agentRestartOwedFor = undefined;
    } else {
      this.#hold(`agent restart to ${commit} owed: no installed agent service`);
    }
  }

  async #act(state: DeployState): Promise<DeployTick> {
    if (state.kind !== "behind" && state.kind !== "current") {
      this.#hold(`reconciliation skipped: ${describeDeploy(state)}`);
      return { state, updated: false };
    }
    try {
      const { changed, to } = await this.#options.update(state);
      // The bits landed. The agent owes a restart only when they reach code it
      // runs, or when it already owed one for an earlier pull, which now moves
      // to this head. Whether it takes it this instant or has to wait for the
      // machine to go idle is `#drainPendingRestart`'s call, asked on every
      // tick from here on — not this one's.
      if (changed.includes("agent") || this.#agentRestartOwedFor) {
        this.#agentRestartOwedFor = to;
      }
      return { state, updated: state.kind === "behind" || changed.length > 0 };
    } catch (error) {
      this.#hold(
        `reconciliation owed: ${error instanceof Error ? error.message : String(error)}`
      );
      return {
        state,
        updated: false,
        failure: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export interface DeployPoller {
  stop: () => void;
  readonly watcher: DeployWatcher;
}

/**
 * Starts the 60 s poll. `unref` so a daemon that is otherwise finished is not
 * held alive by a timer waiting to ask git a question.
 */
export const startDeployPoller = (
  options: DeployWatcherOptions & { readonly intervalMs?: number }
): DeployPoller => {
  const watcher = new DeployWatcher(options);
  const timer = setInterval(() => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the interval callback doesn't await its own tick
    void watcher.tick();
  }, options.intervalMs ?? DEPLOY_POLL_MS);
  timer.unref?.();
  return { watcher, stop: () => clearInterval(timer) };
};
