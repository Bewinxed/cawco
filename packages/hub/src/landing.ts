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
 * when the branch had moved, push, and try once more when someone pushed in
 * between. Nothing ahead of the branch counts as landed, so running this
 * again after a hub restart is safe.
 *
 * A work item that lands `branch` or `pr` goes to a branch of its own
 * instead ({@link pushBranch}): HEAD as it is, replacing only what the hub
 * read there a moment before; `pr` then opens a pull request for it with
 * `gh`, or finds the one already open ({@link openPullRequest}).
 */
import type { CommandResult } from "@cawco/core";
import { detach } from "@cawco/core/detach";

/** What a landing came to. `F` is how the caller describes failing checks. */
export type LandingOutcome<F> =
  | { kind: "landed"; sha: string; rebased: boolean }
  | { kind: "nothing" }
  | { kind: "no-remote" }
  | { kind: "dirty"; files: string }
  | { kind: "conflict"; files: string }
  | { kind: "recheck-failed"; failing: F }
  | { kind: "refused"; detail: string };

export interface LandingDeps<F> {
  /** Serialises landings that share a key. */
  queue: LandingQueue;
  /** The item's checks again, after a rebase moved HEAD: undefined when all pass. */
  recheck: () => Promise<F | undefined>;
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
const CONFLICT_MARK = "cawco-conflict";
/** Tries when someone else pushes between our fetch and our push. */
const ATTEMPTS = 2;

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
  return await deps.queue(`${start.remote}#${base}`, () =>
    attempt(base, deps, 1)
  );
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
    return { kind: "refused", detail: detailOf(fetched) };
  }
  const ahead = await run(`git rev-list --count ${target}..HEAD`, LOCAL_MS);
  if (ahead.exitCode !== 0) {
    return { kind: "refused", detail: detailOf(ahead) };
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
  if (pushed.exitCode === 0) {
    return { kind: "landed", sha: after, rebased };
  }
  if (n < ATTEMPTS && LOST_RACE.test(`${pushed.stderr}\n${pushed.stdout}`)) {
    return await attempt(base, deps, n + 1);
  }
  return { kind: "refused", detail: detailOf(pushed) };
}

/** What pushing a workspace's HEAD to a branch of its own came to. */
export type BranchOutcome =
  | { kind: "pushed"; sha: string }
  | { kind: "nothing" }
  | { kind: "no-remote" }
  | { kind: "dirty"; files: string }
  | { kind: "refused"; detail: string };

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
    return { kind: "refused", detail: detailOf(status) };
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
  deps: Pick<LandingDeps<unknown>, "queue" | "run" | "skip">
): Promise<BranchOutcome> {
  const { run } = deps;
  const start = await ready(run, deps.skip);
  if (start.kind !== "ready") {
    return start;
  }
  return await deps.queue(`${start.remote}#${branch}`, async () => {
    const fetched = await run(`git fetch origin ${quote(base)}`, NETWORK_MS);
    if (fetched.exitCode !== 0) {
      return { kind: "refused", detail: detailOf(fetched) };
    }
    const ahead = await run(
      `git rev-list --count ${quote(`origin/${base}`)}..HEAD`,
      LOCAL_MS
    );
    if (ahead.exitCode !== 0) {
      return { kind: "refused", detail: detailOf(ahead) };
    }
    if (Number(ahead.stdout.trim()) === 0) {
      return { kind: "nothing" };
    }
    const sha = (await run("git rev-parse HEAD", LOCAL_MS)).stdout.trim();
    const refused = await leasedPush(run, `refs/heads/${branch}`, 1);
    return refused ?? { kind: "pushed", sha };
  });
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
): Promise<Extract<BranchOutcome, { kind: "refused" }> | undefined> {
  const there = await run(`git ls-remote origin ${quote(ref)}`, NETWORK_MS);
  if (there.exitCode !== 0) {
    return { kind: "refused", detail: detailOf(there) };
  }
  const held = there.stdout.trim().split(SPACE)[0] ?? "";
  const pushed = await run(
    `git push --force-with-lease=${quote(`${ref}:${held}`)} origin ${quote(`HEAD:${ref}`)}`,
    NETWORK_MS
  );
  if (pushed.exitCode === 0) {
    return;
  }
  if (n < ATTEMPTS && LOST_RACE.test(`${pushed.stderr}\n${pushed.stdout}`)) {
    return await leasedPush(run, ref, n + 1);
  }
  return { kind: "refused", detail: detailOf(pushed) };
}

/** What asking GitHub for a pull request came to. */
export type PullRequestOutcome =
  | { kind: "opened" | "open"; url: string }
  | { kind: "refused"; detail: string };

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
  return { kind: "refused", detail: detailOf(created) };
}
