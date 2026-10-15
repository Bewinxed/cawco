/**
 * Hub-owned landing: once a work item's checks pass, the hub, not the
 * delegate, puts the workspace's commits on the base branch. Before this, a
 * line in the brief asked the delegate to fetch, rebase and push, so "done"
 * meant the checks passed, never that the work was on the base branch
 * (`.design-foundations/plans/2026-10-06-projects.md`, P0).
 *
 * The checks ran on the working tree, so it must equal HEAD before anything
 * is pushed: uncommitted changes, new files included (ignored ones are not),
 * go back to the delegate rather than leaving the branch without them.
 *
 * One landing at a time per repository and branch: fetch, rebase onto it
 * (a conflict is undone and goes back to the delegate), run the checks again
 * when the branch had moved, push, and, while someone keeps pushing in
 * between, the same again, three tries in all. Nothing ahead of the branch
 * counts as landed, so running this again after a hub restart is safe.
 *
 * A work item that lands `branch` or `pr` goes to a branch of its own
 * instead ({@link pushBranch}): HEAD as it is, replacing only what the hub
 * read there a moment before; `pr` then opens a pull request for it with
 * `gh`, or finds the one already open ({@link openPullRequest}).
 */
import type { CommandResult } from "@cawco/core";
import { detach } from "@cawco/core/detach";

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

/** What a landing came to. `F` is how the caller describes failing checks. */
export type LandingOutcome<F> =
  | { kind: "landed"; sha: string; rebased: boolean }
  | { kind: "nothing" }
  | { kind: "no-remote" }
  | { kind: "dirty"; files: string }
  | { kind: "conflict"; files: string }
  | { kind: "recheck-failed"; failing: F }
  | Refusal;

export interface LandingDeps<F> {
  /** Serialises landings that share a key. */
  queue: LandingQueue;
  /** The item's checks again, after a rebase moved HEAD: undefined when all pass. */
  recheck: () => Promise<F | undefined>;
  /**
   * The name every machine's clone of the repository shares (the item's
   * project), keying the queue: clones can spell their remote differently (a
   * renamed GitHub repository answers to its old name too), and their
   * landings on one branch must still take turns. Unset, the remote's URL.
   */
  repo?: string;
  /** Runs a shell command in the workspace's checkout. */
  run: (cmd: string, timeoutMs: number) => Promise<CommandResult>;
  /**
   * Paths the uncommitted-work check passes over: the item's outputs, which
   * the hub collects rather than lands, committed or not.
   */
  skip?: string[];
}

export type LandingQueue = <T>(
  key: string,
  run: () => Promise<T>
) => Promise<T>;

/** One chain of landings per key; a failed landing never blocks the next. */
export function landingQueue(): LandingQueue {
  const tails = new Map<string, Promise<void>>();
  return <T>(key: string, run: () => Promise<T>): Promise<T> => {
    const prior = tails.get(key) ?? Promise.resolve();
    const result = prior.then(run);
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
 * after the first rebases onto the newer branch and runs the checks again,
 * so the window is the checks' length: a busy branch can win it twice.
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

/** Lands HEAD of the workspace on `base`. */
export async function land<F>(
  base: string,
  deps: LandingDeps<F>
): Promise<LandingOutcome<F>> {
  const start = await ready(deps.run, deps.skip);
  if (start.kind !== "ready") {
    return start;
  }
  return await deps.queue(`${deps.repo ?? start.remote}#${base}`, () =>
    attempt(base, deps, 1)
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

/** Fetch, rebase, check again if needed, push; once more if the push lost a race. */
async function attempt<F>(
  base: string,
  deps: LandingDeps<F>,
  n: number
): Promise<LandingOutcome<F>> {
  const { run } = deps;
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
  const after = (await run("git rev-parse HEAD", LOCAL_MS)).stdout.trim();
  const rebased = after !== before;
  if (rebased) {
    const failing = await deps.recheck();
    if (failing !== undefined) {
      return { kind: "recheck-failed", failing };
    }
  }
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
  deps: Pick<LandingDeps<unknown>, "queue" | "repo" | "run" | "skip">
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
