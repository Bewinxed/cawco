/**
 * How many commits a workspace's clone holds that are nowhere else: one
 * reckoning, run by the machine's host git once the boundary is closed
 * (agent workspace.ts `holding`, what retires or holds a workspace) and by
 * the hub inside a live boundary (work-items.ts `unlandedOf`, what a cold
 * follow-up and a stop say it holds).
 *
 * A commit counts when HEAD or a local branch has it and no ref of `origin`
 * does (`git rev-list HEAD --branches --not --remotes=origin`: landed work
 * was pushed, onto the base or to a branch of its own), past the commits
 * `landed` reaches (hub work-items.ts `vouchLanded`), unless a commit on
 * `origin/<base>` that the clone does not have carries the same change
 * (`git patch-id --stable`, as `git cherry` matches them). On 2026-10-23
 * two workspaces whose landing failed at the gate's Mac step stayed held
 * with 1 and 2 commits after the same patches landed on main under other
 * hashes (1371cdb71, 08f67aee5, d8b6e00c8): `git cherry origin/main HEAD`
 * named every one present.
 *
 * Only the commits on `origin/<base>` touching a path one of the clone's own
 * commits touches are read (a change can only be the same when its paths
 * are): a clone cut weeks ago reads that much, never all of main since. A
 * merge or an empty commit has no patch id and always counts, and so does a
 * commit whose change landed altered (a conflict resolved on the way):
 * those are the parent's to decide.
 */

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** A full commit id: what `landed` holds, never an option. */
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;

/**
 * The shell steps, run in the clone after `SAFE_GIT_SHELL` (safe-git.ts:
 * every `git` in them is the safe one), that print the count of its own
 * commits on one line and nothing else, in a subshell of their own (so they
 * sit inside `$( … )` as they are); a git that fails ends them non-zero.
 * `base` is the branch the workspace lands on, read as `origin`'s
 * remote-tracking ref (none: no patch is matched).
 */
export const ownCommitsShell = (
  base: string | undefined,
  landed: readonly string[] = []
): string => {
  const bad = landed.find((sha) => !COMMIT.test(sha));
  if (bad !== undefined) {
    throw new Error(`"${bad}" is not a commit id`);
  }
  const upstream = base ? quote(`refs/remotes/origin/${base}`) : "";
  const matched = upstream
    ? `if [ "$n" -gt 0 ] && git rev-parse -q --verify ${upstream} > /dev/null; then
  mine=$(printf '%s\\n' "$own" | git diff-tree --stdin --root -r -p --no-color | git patch-id --stable) || exit 1
  paths=$(printf '%s\\n' "$own" | git diff-tree --stdin --root -r --no-commit-id --name-only --no-renames) || exit 1
  if [ -n "$mine" ] && [ -n "$paths" ]; then
    theirs=$({ echo --; printf '%s\\n' "$paths"; } | git --literal-pathspecs rev-list --stdin --no-merges --full-history ${upstream} --not HEAD --branches | git diff-tree --stdin --root -r -p --no-color | git patch-id --stable) || exit 1
    same=$({ printf '%s\\n' "$theirs"; echo ---; printf '%s\\n' "$mine"; } | awk '$0 == "---" { mine = 1; next } !mine { if ($1 != "") there[$1] = 1; next } ($1 in there) { n++ } END { print n + 0 }')
    n=$((n - same))
  fi
fi
`
    : "";
  return `(
own=$(git rev-list HEAD --branches --not --remotes=origin ${landed.join(" ")}) || exit 1
n=$(printf '%s' "$own" | grep -c . || true)
${matched}echo "$n"
)`;
};
