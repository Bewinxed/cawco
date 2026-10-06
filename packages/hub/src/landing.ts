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
 */
import type { CommandResult } from "@cawco/core";

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
    // biome-ignore lint/complexity/noVoid: cleanup only; the caller awaits `result`.
    void tail.then(() => {
      if (tails.get(key) === tail) {
        tails.delete(key);
      }
    });
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
const quote = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/** The end of a failed command, as one paragraph a person can read. */
const detailOf = (result: CommandResult): string =>
  (result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`)
    .split("\n")
    .slice(-12)
    .join("\n");

/** Lands HEAD of the workspace on `base`. */
export async function land<F>(
  base: string,
  deps: LandingDeps<F>
): Promise<LandingOutcome<F>> {
  const { run } = deps;
  const status = await run("git status --porcelain", LOCAL_MS);
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
  return await deps.queue(`${remote.stdout.trim()}#${base}`, () =>
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
