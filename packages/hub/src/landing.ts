/**
 * Hub-owned landing: once a work item finishes, the hub, not the delegate,
 * puts the workspace's commits on the base branch. Before this, a line in
 * the brief asked the delegate to fetch, rebase and push, so "done" never
 * meant the work was on the base branch
 * (`.design-foundations/plans/2026-10-06-projects.md`, P0).
 *
 * The landing gate runs on HEAD's tree, so the working tree must equal HEAD
 * before anything is pushed: uncommitted changes, new files included
 * (ignored ones are not), go back to the delegate rather than leaving the
 * branch without them.
 *
 * An item gates before it takes a turn: fetch, rebase onto the branch as it
 * is now (a conflict is undone and goes back to the delegate), and run the
 * landing gate on that tree (the repository's {@link LAND_GATE_SCRIPTS}, and
 * the iOS build when the item changes what the Swift build reads:
 * work-items.ts `gateSteps`), outside the queue, each step waiting there for
 * whatever machine slot or pause it needs. No session writes it. Only a
 * gated item joins the queue.
 *
 * One landing at a time per repository and branch, and a turn never waits:
 * fetch, rebase onto the branch again, run again only the commands whose
 * inputs the rebase changed, push, and, while someone keeps pushing in
 * between, the same again, three tries in all. A command due in the turn that
 * would wait for a machine slot or a pause, or run on another machine (the
 * Apple build), does not: the item steps out of the turn (`busy`), gates
 * again on the newer branch, and queues again, so the next ready item lands
 * (2026-10-16: an item that had passed sat 13 minutes behind one waiting for
 * the Mac's one build slot). Nothing ahead of the branch counts as landed,
 * so running this again after a hub restart is safe.
 *
 * Every tree pushed is gated on top of the branch it lands on: the turn's
 * own rebase is the last, and the steps the turn asks for (`check(true)`)
 * pass on that tree or on the inputs each reads there. The gate is asked on
 * every landing, rebased or not: a clean rebase can still break lint or
 * typecheck (23da40303 sorted boundary.ts's imports, and ded95f4d2 formatted
 * SessionHover's, after rebases had landed them unlinted on main), and a wire
 * change can break the iOS app (312b43065). One command runs at most once on
 * one set of inputs: the caller skips a command that already passed, or one
 * {@link GATE_COVERS} names did, on the tree about to be pushed, or, for a
 * command that declares the paths it reads, on the same trees of those paths
 * (work-items.ts `gateOnce`), and runs every other.
 *
 * A work item that lands `branch` or `pr` goes to a branch of its own
 * instead ({@link pushBranch}): HEAD as it is, replacing only what the hub
 * read there a moment before; `pr` then opens a pull request for it with
 * `gh`, or finds the one already open ({@link openPullRequest}).
 */
import type { CommandResult } from "@cawco/core";
import { detach } from "@cawco/core/detach";
import { WouldWait } from "./machine-pause";

/**
 * Why git turned a landing down: the step it was on, the end of what git
 * said, and `cause` when the words name it. `auth` is the remote refusing the
 * login (no credential reached git, or a bad one); `race` is a push that was
 * still behind the branch after every try, someone else pushing between the
 * hub's fetch and its push each time.
 */
export interface Refusal {
  cause?: "auth" | "race";
  detail: string;
  kind: "refused";
  step: "read" | "fetch" | "push" | "pull request";
  /** The pushes made, for a `race`. */
  tries?: number;
}

/** What a landing came to. `F` is how the caller describes a failed gate. */
export type LandingOutcome<F> =
  | { kind: "landed"; sha: string; rebased: boolean }
  | { kind: "nothing" }
  | { kind: "no-remote" }
  | { kind: "dirty"; files: string }
  | { kind: "conflict"; files: string }
  | Failed<F>
  | Refusal;

/** The landing gate, failed on the rebased tree. */
export interface Failed<F> {
  failing: F;
  kind: "gate-failed";
}

/**
 * A turn the item stepped out of: a command due there would have waited
 * (`words`, {@link WouldWait}'s), so it gates again.
 */
interface Busy {
  kind: "busy";
  words: string;
}

export interface LandingDeps<F> {
  /**
   * The landing gate on the tree the workspace holds now (rebased onto the
   * branch), each step skipped that
   * passed, or one covering it did, on its inputs as they are there:
   * undefined when all pass. `inTurn` false is the gate before the queue,
   * where a command waits for what it needs; true is the landing turn, where
   * a command that would wait for a machine slot or a pause, or run on
   * another machine, throws {@link WouldWait} instead of running.
   */
  check: (inTurn: boolean) => Promise<Failed<F> | undefined>;
  /**
   * The landing stepped out of its turn to gate again: the words of what a
   * command due there would have waited for.
   */
  onStepOut?: (words: string) => void;
  /** Serialises landings that share a key. */
  queue: LandingQueue;
  /**
   * The name every machine's clone of the repository shares (the item's
   * project), keying the queue: clones can spell their remote differently (a
   * renamed GitHub repository answers to its old name too), and their
   * landings on one branch must still take turns. Unset, the remote's URL.
   */
  repo?: string;
  /**
   * Runs a shell command in the workspace's checkout; `noWait`, in the turn,
   * throws {@link WouldWait} rather than wait for its machine's pause or a
   * slot (machine-pause.ts `noWait`).
   */
  run: (
    cmd: string,
    timeoutMs: number,
    noWait?: boolean
  ) => Promise<CommandResult>;
  /**
   * Paths the uncommitted-work check passes over: the item's outputs, which
   * the hub collects rather than lands, committed or not.
   */
  skip?: string[];
  /** This landing in the queue: how others name it, and how it hears its wait. */
  turn?: LandingTurn;
}

/**
 * One landing in a {@link LandingQueue}: how a landing queued behind it names
 * it, and how it hears its own wait for its turn.
 */
export interface LandingTurn {
  /** Each change of its wait: the words while it waits its turn, null once it runs. */
  onWait?: (words: string | null) => void;
  /** The landing as a waiter's words name it: `“Fix the tray” (153fd0db)`. */
  who: string;
}

export type LandingQueue = <T>(
  key: string,
  run: () => Promise<T>,
  turn?: LandingTurn
) => Promise<T>;

/**
 * What a landing waiting its turn says: the branch, the landing running now,
 * and how many more are ahead of it.
 */
export const turnWords = (branch: string, ahead: LandingTurn[]): string =>
  `queued to land on ${branch} behind ${ahead[0]?.who ?? "another landing"}${ahead.length > 1 ? ` and ${ahead.length - 1} more` : ""}`;

/**
 * One chain of landings per key; a failed landing never blocks the next. A
 * landing that waits its turn says so, naming the one running and how many
 * more are ahead (`turn.onWait`), each time that changes (2026-10-15: items
 * sat for half an hour with nothing to say what held them). A
 * turn waits for nothing ({@link land}): it is a fetch, a rebase, the
 * commands whose inputs that rebase changed, and a push.
 */
export function landingQueue(): LandingQueue {
  const tails = new Map<string, Promise<void>>();
  /** Per key: the landing running now and those waiting behind it, in order. */
  const lines = new Map<
    string,
    { running: LandingTurn | undefined; waiting: LandingTurn[] }
  >();
  /** Tells each waiting landing of `key` who is ahead of it now. */
  const sayWaits = (key: string): void => {
    const line = lines.get(key);
    if (!line) {
      return;
    }
    const branch = key.slice(key.lastIndexOf("#") + 1);
    const ahead = line.running ? [line.running] : [];
    for (const turn of line.waiting) {
      turn.onWait?.(turnWords(branch, ahead));
      ahead.push(turn);
    }
  };
  return <T>(
    key: string,
    run: () => Promise<T>,
    turn: LandingTurn = { who: "another landing" }
  ): Promise<T> => {
    const line = lines.get(key) ?? { running: undefined, waiting: [] };
    lines.set(key, line);
    const queued = line.running !== undefined || line.waiting.length > 0;
    line.waiting.push(turn);
    if (queued) {
      sayWaits(key);
    }
    const result = (tails.get(key) ?? Promise.resolve()).then(async () => {
      line.waiting = line.waiting.filter((each) => each !== turn);
      line.running = turn;
      if (queued) {
        turn.onWait?.(null);
      }
      sayWaits(key);
      try {
        return await run();
      } finally {
        line.running = undefined;
      }
    });
    const tail = result.then(
      () => undefined,
      () => undefined
    );
    tails.set(key, tail);
    // Cleanup only; the caller awaits `result`.
    detach(
      tail.then(() => {
        if (tails.get(key) === tail) {
          tails.delete(key);
          lines.delete(key);
        }
      }),
      "landing queue"
    );
    return result;
  };
}

/** Git that talks to the remote may wait on the network. */
const NETWORK_MS = 300_000;
const LOCAL_MS = 60_000;
/** Pushes that lost a race, as git words them. */
const LOST_RACE = /non-fast-forward|\[rejected\]|fetch first|stale info/;
/**
 * A remote that refused the login, as git and GitHub word it: no credential
 * reached git (it then asks a terminal that is not there), or one it turned
 * down.
 */
const NOT_AUTHORISED =
  /could not read (Username|Password)|terminal prompts disabled|Authentication failed|No anonymous write access|Invalid username or password|Permission denied \(publickey|Permission to \S+ denied|Write access to repository not granted|returned error: 40[13]/i;
const CONFLICT_MARK = "cawco-conflict";
/**
 * Tries when someone else pushes between our fetch and our push. Each try
 * after the first rebases onto the newer branch and runs the steps whose
 * inputs moved again, so the window is theirs: a busy branch can win it twice.
 */
const ATTEMPTS = 3;

/** A command git refused at `step`, its words and, when they name it, the cause. */
const refusal = (step: Refusal["step"], result: CommandResult): Refusal => {
  const detail = detailOf(result);
  return NOT_AUTHORISED.test(`${result.stderr}\n${result.stdout}`)
    ? { kind: "refused", step, detail, cause: "auth" }
    : { kind: "refused", step, detail };
};

/** One shell word, whatever the branch is called. */
export const quote = (word: string): string =>
  `'${word.replaceAll("'", `'\\''`)}'`;

/** The end of a failed command, as one paragraph a person can read. */
const detailOf = (result: CommandResult): string =>
  (result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`)
    .split("\n")
    .slice(-12)
    .join("\n");

/**
 * The command that lists uncommitted work, passing over `skip`: an output
 * need not be committed, so it never counts as work left behind.
 */
export const statusCommand = (skip: string[] = []): string =>
  skip.length === 0
    ? "git status --porcelain"
    : `git status --porcelain -- . ${skip.map((path) => quote(`:(exclude,literal)${path}`)).join(" ")}`;

/**
 * The landing gate's scripts: these of the repository's root package.json,
 * each run as `bun run <name>` in the workspace, inside its boundary, on the
 * commit about to be pushed. The repository says what they check; a
 * repository whose package.json defines neither runs none. The cockpit's
 * pre-push hook (scripts/git-hooks/pre-push) runs the same two for a push
 * to main by hand.
 */
export const LAND_GATE_SCRIPTS = ["lint:changed", "typecheck"] as const;

/**
 * The commands whose pass on a tree covers another's there, by the command
 * covered. `bun run lint` covers `bun run lint:changed`: the root
 * package.json runs the same css-scope and mark-line checks in both, then
 * `fmt.ts --check` over every file where lint:changed passes `--changed`, and
 * `ultracite check` (ultracite 7: `biome check --no-errors-on-unmatched ./`)
 * where lint:changed runs `biome check --no-errors-on-unmatched` on the files
 * changed since the merge-base with origin/main.
 */
export const GATE_COVERS: Readonly<Record<string, readonly string[]>> = {
  "bun run lint:changed": ["bun run lint"],
};

/**
 * Prints, one per line, the {@link LAND_GATE_SCRIPTS} the checkout's root
 * package.json defines; nothing without a package.json.
 */
export const landGateProbe = `if [ -f package.json ]; then bun -e ${quote(
  `const scripts = JSON.parse(require("node:fs").readFileSync("package.json", "utf8")).scripts ?? {}; for (const name of ${JSON.stringify(LAND_GATE_SCRIPTS)}) { if (typeof scripts[name] === "string") { console.log(name); } }`
)}; fi`;

/**
 * One step of the landing gate, which the hub alone writes: a shell command
 * run in the item's workspace (or, with `machine`, in its gate workspace on
 * that machine, at its last commit), passing when it exits 0.
 */
export interface GateStep {
  command: string;
  /** The machine it runs on, by machineId, when not the workspace's own: the iOS build's Mac. */
  machine?: string;
  /** What the report calls it: the command, or "iOS build compiles". */
  name: string;
  /** Seconds before the command is killed; 600 when not given. */
  timeoutSec?: number;
}

/**
 * The gate's script steps for the workspace `run` reaches, in {@link
 * LAND_GATE_SCRIPTS}' order. Throws with the probe's words when the
 * package.json could not be read.
 */
export async function landGateSteps(
  run: LandingDeps<unknown>["run"]
): Promise<GateStep[]> {
  const probe = await run(landGateProbe, LOCAL_MS);
  if (probe.exitCode !== 0) {
    throw new Error(
      `the landing gate's scripts could not be read from package.json:\n${detailOf(probe)}`
    );
  }
  const defined = new Set(probe.stdout.split("\n").map((line) => line.trim()));
  return LAND_GATE_SCRIPTS.filter((name) => defined.has(name)).map((name) => ({
    name: `bun run ${name}`,
    command: `bun run ${name}`,
  }));
}

/**
 * Lands HEAD of the workspace on `base`: gated on top of it outside the
 * queue, then its turn; one that steps out of its turn gates again on the
 * newer branch and queues again.
 */
export async function land<F>(
  base: string,
  deps: LandingDeps<F>
): Promise<LandingOutcome<F>> {
  const start = await ready(deps.run, deps.skip);
  if (start.kind !== "ready") {
    return start;
  }
  const key = `${deps.repo ?? start.remote}#${base}`;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: an item that stepped out of its turn gates again before it queues again
    const gated = await onBase(base, deps, false);
    if (gated.kind !== "on-base") {
      return gated;
    }
    const turn = await deps.queue(
      key,
      () => attempt(base, deps, 1).catch(steppedOut),
      deps.turn
    );
    if (turn.kind !== "busy") {
      return turn;
    }
    deps.onStepOut?.(turn.words);
  }
}

/**
 * A turn's command that would have waited ({@link WouldWait}) ends the turn
 * as `busy`, in its words; any other error is the landing's.
 */
const steppedOut = (error: unknown): Busy => {
  if (error instanceof WouldWait) {
    return { kind: "busy", words: error.message };
  }
  throw error;
};

/**
 * The workspace's commits rebased onto origin's `base` as it is now, and
 * {@link LandingDeps.check} on that tree: `on-base` once they pass, with
 * whether the rebase moved HEAD and where HEAD is. In the turn (`inTurn`)
 * every command it runs throws {@link WouldWait} rather than wait.
 */
async function onBase<F>(
  base: string,
  deps: LandingDeps<F>,
  inTurn: boolean
): Promise<
  | { kind: "on-base"; head: string; rebased: boolean }
  | Exclude<LandingOutcome<F>, { kind: "landed" | "dirty" | "no-remote" }>
> {
  const run = (cmd: string, timeoutMs: number) =>
    deps.run(cmd, timeoutMs, inTurn);
  const target = quote(`origin/${base}`);
  const fetched = await run(`git fetch origin ${quote(base)}`, NETWORK_MS);
  if (fetched.exitCode !== 0) {
    return refusal("fetch", fetched);
  }
  const ahead = await run(`git rev-list --count ${target}..HEAD`, LOCAL_MS);
  if (ahead.exitCode !== 0) {
    return refusal("read", ahead);
  }
  if (Number(ahead.stdout.trim()) === 0) {
    return { kind: "nothing" };
  }
  const before = (await run("git rev-parse HEAD", LOCAL_MS)).stdout.trim();
  const rebase = await run(
    `git rebase ${target} || { files=$(git diff --name-only --diff-filter=U); git rebase --abort; printf '${CONFLICT_MARK}\\n%s\\n' "$files"; exit 1; }`,
    LOCAL_MS
  );
  if (rebase.exitCode !== 0) {
    const at = rebase.stdout.lastIndexOf(CONFLICT_MARK);
    return {
      kind: "conflict",
      files:
        at >= 0
          ? rebase.stdout.slice(at + CONFLICT_MARK.length).trim()
          : detailOf(rebase),
    };
  }
  const head = (await run("git rev-parse HEAD", LOCAL_MS)).stdout.trim();
  return (
    (await deps.check(inTurn)) ?? {
      kind: "on-base",
      head,
      rebased: head !== before,
    }
  );
}

/**
 * Whether origin's `ref` is at `sha` now. A push that did not answer 0 may
 * still have landed (its command cut off after the remote took it), and a
 * ref at the commit pushed is landed whatever the command said.
 */
async function holds(
  run: LandingDeps<unknown>["run"],
  ref: string,
  sha: string
): Promise<boolean> {
  const there = await run(`git ls-remote origin ${quote(ref)}`, NETWORK_MS);
  return there.exitCode === 0 && there.stdout.trim().split(SPACE)[0] === sha;
}

/**
 * The turn: fetch, rebase, the commands whose inputs that moved, push; once
 * more if the push lost a race. Nothing in it waits: a command that would
 * throws {@link WouldWait}, which steps the item out ({@link land}).
 */
async function attempt<F>(
  base: string,
  deps: LandingDeps<F>,
  n: number
): Promise<LandingOutcome<F>> {
  const run = (cmd: string, timeoutMs: number) =>
    deps.run(cmd, timeoutMs, true);
  const gated = await onBase(base, deps, true);
  if (gated.kind !== "on-base") {
    return gated;
  }
  const { head: after, rebased } = gated;
  const pushed = await run(
    `git push origin ${quote(`HEAD:refs/heads/${base}`)}`,
    NETWORK_MS
  );
  if (
    pushed.exitCode === 0 ||
    (await holds(run, `refs/heads/${base}`, after))
  ) {
    return { kind: "landed", sha: after, rebased };
  }
  const said = `${pushed.stderr}\n${pushed.stdout}`;
  if (!(LOST_RACE.test(said) && !NOT_AUTHORISED.test(said))) {
    return refusal("push", pushed);
  }
  return n < ATTEMPTS
    ? await attempt(base, deps, n + 1)
    : {
        kind: "refused",
        step: "push",
        detail: detailOf(pushed),
        cause: "race",
        tries: n,
      };
}

/** What pushing a workspace's HEAD to a branch of its own came to. */
export type BranchOutcome =
  | { kind: "pushed"; sha: string }
  | { kind: "nothing" }
  | { kind: "no-remote" }
  | { kind: "dirty"; files: string }
  | Refusal;

/** The workspace's HEAD and its remote, as both landings start: only commits go anywhere. */
async function ready(
  run: LandingDeps<unknown>["run"],
  skip: string[] | undefined
): Promise<
  | { kind: "ready"; remote: string }
  | Extract<BranchOutcome, { kind: "dirty" | "no-remote" | "refused" }>
> {
  const status = await run(statusCommand(skip), LOCAL_MS);
  if (status.exitCode !== 0) {
    return refusal("read", status);
  }
  if (status.stdout.trim()) {
    return { kind: "dirty", files: status.stdout.trim() };
  }
  const remote = await run("git remote get-url origin", LOCAL_MS);
  if (remote.exitCode !== 0 || !remote.stdout.trim()) {
    return { kind: "no-remote" };
  }
  return { kind: "ready", remote: remote.stdout.trim() };
}

/**
 * Pushes the workspace's HEAD to `branch` on origin: its commits as they
 * are, not rebased. Nothing ahead of `base` is nothing to push. The push
 * replaces the branch only if it still holds what `git ls-remote` read just
 * before (or is still missing), so work someone else pushed there is never
 * lost; a push that lost that race is tried once more from the read.
 */
export async function pushBranch(
  base: string,
  branch: string,
  deps: Pick<LandingDeps<unknown>, "queue" | "repo" | "run" | "skip" | "turn">
): Promise<BranchOutcome> {
  const { run } = deps;
  const start = await ready(run, deps.skip);
  if (start.kind !== "ready") {
    return start;
  }
  return await deps.queue(
    `${deps.repo ?? start.remote}#${branch}`,
    async () => {
      const fetched = await run(`git fetch origin ${quote(base)}`, NETWORK_MS);
      if (fetched.exitCode !== 0) {
        return refusal("fetch", fetched);
      }
      const ahead = await run(
        `git rev-list --count ${quote(`origin/${base}`)}..HEAD`,
        LOCAL_MS
      );
      if (ahead.exitCode !== 0) {
        return refusal("read", ahead);
      }
      if (Number(ahead.stdout.trim()) === 0) {
        return { kind: "nothing" };
      }
      const sha = (await run("git rev-parse HEAD", LOCAL_MS)).stdout.trim();
      const refused = await leasedPush(run, `refs/heads/${branch}`, 1);
      return refused && !(await holds(run, `refs/heads/${branch}`, sha))
        ? refused
        : { kind: "pushed", sha };
    }
  );
}

/** Whitespace between `git ls-remote`'s sha and its ref. */
const SPACE = /\s+/;

/**
 * HEAD pushed to `ref`, replacing it only if it still holds what
 * `git ls-remote` read just before (or is still missing); once more from a
 * fresh read when someone pushed in between. Answers why it was refused, or
 * nothing when it was pushed.
 */
async function leasedPush(
  run: LandingDeps<unknown>["run"],
  ref: string,
  n: number
): Promise<Refusal | undefined> {
  const there = await run(`git ls-remote origin ${quote(ref)}`, NETWORK_MS);
  if (there.exitCode !== 0) {
    return refusal("fetch", there);
  }
  const held = there.stdout.trim().split(SPACE)[0] ?? "";
  const pushed = await run(
    `git push --force-with-lease=${quote(`${ref}:${held}`)} origin ${quote(`HEAD:${ref}`)}`,
    NETWORK_MS
  );
  if (pushed.exitCode === 0) {
    return;
  }
  const said = `${pushed.stderr}\n${pushed.stdout}`;
  if (!(LOST_RACE.test(said) && !NOT_AUTHORISED.test(said))) {
    return refusal("push", pushed);
  }
  return n < ATTEMPTS
    ? await leasedPush(run, ref, n + 1)
    : {
        kind: "refused",
        step: "push",
        detail: detailOf(pushed),
        cause: "race",
        tries: n,
      };
}

/** What asking GitHub for a pull request came to. */
export type PullRequestOutcome =
  { kind: "opened" | "open"; url: string } | Refusal;

const PR_URL = /https?:\/\/\S+\/pull\/\d+/;

/**
 * The open pull request from `branch` into `base`, or a new one with `title`
 * and `body`: `gh pr view`, then `gh pr create`, in the workspace (whose
 * boundary exports GH_TOKEN). A branch that already has an open pull request
 * keeps it; the push before this updated it. A create gh turns down answers
 * gh's own words.
 */
export async function openPullRequest(
  request: { base: string; body: string; branch: string; title: string },
  run: LandingDeps<unknown>["run"]
): Promise<PullRequestOutcome> {
  const { base, body, branch, title } = request;
  const open = await run(
    `gh pr view ${quote(branch)} --json url,state,baseRefName --jq ${quote('select(.state == "OPEN") | .url')}`,
    NETWORK_MS
  );
  const existing = PR_URL.exec(open.stdout)?.[0];
  if (open.exitCode === 0 && existing) {
    return { kind: "open", url: existing };
  }
  const created = await run(
    `gh pr create --base ${quote(base)} --head ${quote(branch)} --title ${quote(title)} --body ${quote(body)}`,
    NETWORK_MS
  );
  const url = PR_URL.exec(created.stdout)?.[0];
  if (created.exitCode === 0 && url) {
    return { kind: "opened", url };
  }
  return refusal("pull request", created);
}
