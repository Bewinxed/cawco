/**
 * The paths a workspace's boundary keeps from every command (core
 * clone-denies.ts `cloneDenies`: `.mcp.json`, OpenCode's config, Claude
 * Code's project settings, hooks, commands, agents and placed skills), as
 * git inside it meets them, and the `git` every command there runs first on
 * its PATH, which judges a move of the worktree on them.
 *
 * Inside the boundary git cannot write those paths, so a checkout, switch,
 * reset, merge, rebase, pull or stash that would change one fails on it, or
 * (a checkout without `--force`) prints "unable to create file" and exits 0
 * with the file gone or as it was. The hub's own moves run on the host when
 * they would (hub-command.ts `movedCommand`); a session's go through
 * {@link gitShim}: the same for Claude Code, OpenCode and pi, whose shell
 * commands all run through the workspace's executor, which puts the
 * workspace's read-only bin first on PATH (boundary.ts `execScript`).
 */
import { realpath } from "node:fs/promises";
import { relative } from "node:path";
import type { WorkspaceRef } from "@cawco/core";
import { HARNESS_CONFIG } from "@cawco/core/clone-denies";
import { GIT_VALUED_OPTIONS } from "@cawco/core/safe-git";
import { systemProgram } from "@cawco/core/workspace-needs";
import { workspaceDenies } from "@cawco/core/workspace-policy";

/**
 * Which deny paths: those the boundary keeps from git here (`boundary`: on
 * Linux srt's own names too, `.vscode`, `.gitmodules`, … which it binds
 * read-only; macOS denies only the policy's), or the harness project config
 * alone (`config`: never srt's names), whatever the machine.
 */
export type DenyPaths = "boundary" | "config";

/**
 * The deny paths of `workspace`'s clone a git command there may hit, by path
 * in the clone: every clone-side deny path ({@link DenyPaths}) but those in
 * `.git`, which git tracks none of.
 */
const denyPaths = async (
  workspace: WorkspaceRef,
  which: DenyPaths
): Promise<string[]> => {
  const clone = await realpath(workspace.path);
  return (await workspaceDenies(workspace))
    .filter(
      (deny) =>
        !deny.srt || (which === "boundary" && process.platform === "linux")
    )
    .map((deny) => relative(clone, deny.path))
    .filter((path) => path !== ".git" && !path.startsWith(".git/"));
};

/**
 * {@link denyPaths} as git pathspecs: each a literal path at the clone's
 * root, and for `config` also every name of core's `HARNESS_CONFIG` at any
 * depth and in any letter case (`:(glob,icase)**\/<name>` and the tree
 * under it). srt binds literal paths alone, so a nested copy is writable
 * inside the boundary; it is kept out of every commit that lands or moves a
 * worktree instead ({@link gitShim}, hub-command.ts `ownConfigChanges`).
 * A leading `**\/` matches the root too (gitglossary(7) "pathspec": "A
 * leading `**` followed by a slash means match in all directories").
 */
export const denyPathspecs = async (
  workspace: WorkspaceRef,
  which: DenyPaths
): Promise<string[]> => {
  const literal = (await denyPaths(workspace, which)).map(
    (path) => `:(literal)${path}`
  );
  return which === "config"
    ? [
        ...literal,
        ...HARNESS_CONFIG.flatMap((name) => [
          `:(glob,icase)**/${name}`,
          `:(glob,icase)**/${name}/**`,
        ]),
      ]
    : literal;
};

/** `text` as one shell word. */
const word = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;

/**
 * The git subcommands that move the worktree: those whose target commit the
 * judge reads before they run ({@link MOVES_TO}), and those it judges by
 * what they left.
 */
const MOVES_TO = ["checkout", "switch", "reset", "merge", "rebase"];
const MOVES = [
  ...MOVES_TO,
  "pull",
  "stash",
  "cherry-pick",
  "revert",
  "am",
  "restore",
  "bisect",
];

/**
 * git's subcommands that never move the worktree, by name: a call to one
 * goes straight to git. A name that is neither these nor {@link MOVES} (an
 * alias, a rare command) has the judge look up what it is.
 */
const STILL = [
  "status",
  "log",
  "diff",
  "show",
  "add",
  "commit",
  "branch",
  "fetch",
  "push",
  "rev-parse",
  "ls-files",
  "ls-tree",
  "ls-remote",
  "config",
  "grep",
  "blame",
  "remote",
  "tag",
  "init",
  "clone",
  "worktree",
  "describe",
  "cat-file",
  "rev-list",
  "for-each-ref",
  "symbolic-ref",
  "update-index",
  "update-ref",
  "hash-object",
  "write-tree",
  "mktree",
  "commit-tree",
  "merge-base",
  "show-ref",
  "reflog",
  "shortlog",
  "format-patch",
  "apply",
  "mv",
  "rm",
  "clean",
  "submodule",
  "lfs",
  "help",
  "version",
  "var",
  "check-ignore",
  "check-attr",
  "name-rev",
  "count-objects",
  "gc",
  "fsck",
  "prune",
  "repack",
  "bundle",
  "archive",
  "credential",
  "notes",
  "range-diff",
  "diff-tree",
  "diff-index",
  "diff-files",
  "whatchanged",
  "cherry",
  "stripspace",
  "interpret-trailers",
  "mailinfo",
  "verify-commit",
  "verify-tag",
  "maintenance",
  "sparse-checkout",
];

/**
 * The options of {@link MOVES_TO} whose next word is no target: a branch
 * made (`checkout -b`/`-B`, `switch -c`/`-C`, `--orphan`), a message or
 * file (`merge -m`/`-F`), a strategy and its options (`-s`, `-X`), a
 * command (`rebase -x`). `rebase --onto`'s word is a target, judged.
 */
const OPTION_VALUES = [
  "-b",
  "-B",
  "-c",
  "-C",
  "--orphan",
  "-m",
  "-F",
  "--file",
  "-s",
  "--strategy",
  "-X",
  "--strategy-option",
  "-x",
  "--exec",
];

/**
 * The pathspecs {@link gitShim}'s judge reads a move on: `before`, the
 * target commits are refused on (harness config at any depth and in any
 * letter case, and every path the boundary keeps: {@link denyPathspecs}
 * `config` and `boundary`); `after`, the worktree must hold as HEAD does
 * once a move ends (the boundary's own, which git cannot write here).
 */
export interface ShimPaths {
  readonly after: readonly string[];
  readonly before: readonly string[];
}

/** {@link ShimPaths} for `workspace`. */
export const shimPaths = async (
  workspace: WorkspaceRef
): Promise<ShimPaths> => {
  const after = await denyPathspecs(workspace, "boundary");
  return {
    after,
    before: [
      ...new Set([...after, ...(await denyPathspecs(workspace, "config"))]),
    ],
  };
};

/** The judge's file, beside {@link gitShim}'s in the workspace's read-only bin. */
export const GIT_MOVE = "cawco-git-move";

/**
 * The `git` first on workspace `id`'s commands' PATH, in its read-only bin
 * `bin`, and the judge it hands a move to ({@link GIT_MOVE}). The `git` is
 * POSIX sh with no command of its own: it finds the next git on PATH, reads
 * past git's global options to the subcommand, and runs git at once unless
 * the subcommand moves the worktree or is not one it knows ({@link STILL}),
 * so an ordinary call costs a shell's start and nothing more. The judge, in
 * bash, takes a move in `clone` (the clone's top level alone: a repository a
 * command clones inside it holds no deny path) on `paths` ({@link ShimPaths}):
 *
 * - before {@link MOVES_TO}: each word that names a commit (`git rev-parse
 *   --verify`) is a target; one whose `before` paths differ from HEAD's is
 *   refused, nothing run, the worktree as it was. A `checkout … -- <paths>`
 *   is a checkout of paths, judged after;
 * - after every move that ends 0: the `after` paths must be in the worktree
 *   as HEAD has them (`git diff HEAD`, a missing file among them). One that
 *   is not fails the command, naming them.
 *
 * An alias is looked up (`alias.<name>`): one that runs a move is judged
 * after; a shell alias (`!…`) runs as it is. Each refusal says the way out:
 * the parent lands or cuts it, and the hub runs such a move on the host.
 */
export const gitShim = (
  id: string,
  bin: string,
  clone: string,
  paths: ShimPaths
): { readonly git: string; readonly move: string } => ({
  git: `#!${systemProgram("sh")}
# CawCo workspace ${id}: git, its moves of the worktree judged on the paths the boundary keeps (${GIT_MOVE}).
set -f
self=${word(bin)}
real=
first=
seen=
was=$IFS
IFS=:
for dir in $PATH; do
  if [ "$dir" = "$self" ]; then seen=1; continue; fi
  [ -x "$dir/git" ] || continue
  [ -n "$first" ] || first=$dir/git
  if [ -n "$seen" ]; then real=$dir/git; break; fi
done
IFS=$was
# The next git after this one on PATH: another wrapper before it that looks
# up the next git the same way would hand the call back here forever.
[ -n "$real" ] || real=$first
if [ -z "$real" ]; then
  echo "cawco: no git on this command's PATH" >&2
  exit 127
fi
skip=
for arg in "$@"; do
  if [ -n "$skip" ]; then skip=; continue; fi
  case $arg in
    ${GIT_VALUED_OPTIONS.join(" | ")}) skip=1 ;;
    -*) ;;
    ${STILL.join(" | ")}) exec "$real" "$@" ;;
    *) exec ${word(systemProgram("bash"))} "$self/${GIT_MOVE}" "$real" "$@" ;;
  esac
done
exec "$real" "$@"
`,
  move: `#!${systemProgram("bash")}
# CawCo workspace ${id}: a git move of the worktree, judged on the paths its boundary keeps from every command.
real=$1
shift
globals=()
sub=
while [ $# -gt 0 ]; do
  case $1 in
    ${GIT_VALUED_OPTIONS.join(" | ")}) globals+=("$1" "$2"); shift 2 ;;
    -*) globals+=("$1"); shift ;;
    *) sub=$1; shift; break ;;
  esac
done
g() { "$real" "\${globals[@]}" "$@"; }
run() { exec "$real" "\${globals[@]}" "$sub" "$@"; }
before=(${paths.before.map(word).join(" ")})
after=(${paths.after.map(word).join(" ")})
[ \${#before[@]} -gt 0 ] || run "$@"
top=$(g rev-parse --show-toplevel 2>/dev/null)
[ "$top" = ${word(clone)} ] || run "$@"
named=$sub
case " ${MOVES.join(" ")} " in
  *" $sub "*) ;;
  *)
    alias=$(g config --get "alias.$sub" 2>/dev/null)
    case $alias in
      "" | "!"*) run "$@" ;;
    esac
    named=\${alias%% *}
    case " ${MOVES.join(" ")} " in
      *" $named "*) ;;
      *) run "$@" ;;
    esac
    ;;
esac
way="Ask your parent session to land your commits or to cut a workspace at that commit: the hub runs such a move on the host, where git writes them."
if [ "$named" = "$sub" ] && [[ " ${MOVES_TO.join(" ")} " == *" $sub "* ]] && ! { [ "$sub" = checkout ] && [[ " $* " == *" -- "* ]]; }; then
  value=
  for arg in "$@"; do
    if [ -n "$value" ]; then value=; continue; fi
    [ "$arg" = -- ] && break
    case $arg in
      ${OPTION_VALUES.join(" | ")}) value=1; continue ;;
      -*) continue ;;
    esac
    target=$(g rev-parse -q --verify "$arg^{commit}" 2>/dev/null) || continue
    differ=$(g diff --name-only HEAD "$target" -- "\${before[@]}" 2>/dev/null | tr '\\n' ' ')
    if [ -n "$differ" ]; then
      echo "cawco: git $sub did not run, and the worktree is as it was: $arg holds \${differ% } other than HEAD does: harness config (Claude Code's, OpenCode's, pi's), which no workspace's git moves into its worktree, or paths its boundary keeps from every command. $way" >&2
      exit 1
    fi
  done
fi
"$real" "\${globals[@]}" "$sub" "$@"
status=$?
[ "$status" = 0 ] || exit "$status"
left=$(g diff --name-only HEAD -- "\${after[@]}" 2>/dev/null | tr '\\n' ' ')
[ \${#after[@]} -gt 0 ] || left=
if [ -n "$left" ]; then
  echo "cawco: git $sub left \${left% } other than HEAD has them, paths this workspace's boundary keeps from every command, so it is taken as failed. $way" >&2
  exit 1
fi
exit 0
`,
});
