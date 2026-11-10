/**
 * WHERE GIT LOOKS. Git reads which repository a command is for from these
 * variables before it looks at the folder it runs in, and it exports them to
 * every program it starts: a hook, a `rebase --exec` step, a `bisect run`,
 * an alias. From a linked worktree that is
 * `GIT_DIR=<repository>/.git/worktrees/<name>` with no `GIT_WORK_TREE`
 * (git 2.53: a pre-push hook and a `rebase --exec` step both get it).
 *
 * A CawCo process that inherits them runs every git of its own on its
 * caller's repository, whatever folder it names. `git init <scratch>` is the
 * worst of them: it re-initialises the caller's repository, takes a git dir
 * whose path does not end in `/.git` for a bare one (builtin/init-db.c
 * `guess_repository_type`: "Otherwise it is often bare") and writes
 * `core.bare = true` into the config every worktree of it shares. A push to
 * main from a linked worktree runs the pre-push hook's `bun run check --all`
 * under them (scripts/git-hooks/pre-push), and its git-door-words-check and
 * logs-trailer-check each `git init` a scratch repository: the checkout the
 * worktree belongs to then has `bare = true` at line 4 of its config and git
 * refuses every work-tree command there. /home/bewinxed/cockpit's did at
 * 09:31:30Z on 2026-11-10, a minute after a session pushed to main from
 * ~/.worktrees/cockpit-rail-float, a linked worktree of it, and every
 * delegate started there until it was set back worked in a view of the
 * live checkout (agent repo-top.ts). Run so, logs-trailer-check also
 * commits onto the caller's repository, as a fleet spec run as a
 * `git bisect run` step committed "init" onto the bisect's checkout
 * (2026-10-14).
 *
 * So they leave the process's environment as this module loads, before
 * anything it starts: `Bun.$` reads `process.env` as it runs, and a spawn is
 * handed `env: process.env` or what session-env.ts `hostEnvironment` makes
 * of it (scripts/lint/spawn-names-env.grit). Every process that runs git as
 * safe-git.ts says loads it with that module; a script that runs git any
 * other way imports it first. What a git call names for itself (`--git-dir`,
 * a `GIT_DIR` in the env it is handed) is unchanged, and so is git's config
 * (`GIT_CONFIG_*`), which a workspace passes its own through.
 */
const GIT_REPOSITORY_ENV = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_PREFIX",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_IMPLICIT_WORK_TREE",
];
for (const name of GIT_REPOSITORY_ENV) {
  delete process.env[name];
}

export {};
