/**
 * A checkout's JavaScript dependencies, installed from its root lockfile:
 * what the repository's own scripts load before they import anything a
 * dependency provides (scripts/lib/deps.ts); a place's stage clone installs
 * by its project's own manager instead (agent stage-clone.ts `installAt`). A
 * workspace's first cut installs nothing: its delegate runs its project's
 * install; a cut again installs what its retired clone had installed (agent
 * workspace.ts `reinstall`).
 * The landing gate installs nothing of its own: a project declares its
 * install as a step of its gate (hub gate-file.ts).
 *
 * This module imports nothing, so scripts/lib/deps.ts loads it in a checkout
 * with no dependencies.
 */

/**
 * bun's install that never writes the lockfile, as every pick of
 * {@link installPick} is frozen. bun.com/docs/pm/cli/install: "Bun installs
 * the exact versions specified in the lockfile and does not update it. If
 * your `package.json` disagrees with `bun.lock`, Bun exits with an error";
 * and "If there is no lockfile at all, `--frozen-lockfile` installs from
 * `package.json` without writing one".
 */
const BUN_FROZEN = "bun install --frozen-lockfile";

/**
 * Yarn 2 and later's frozen install. yarnpkg.com/cli/install: "If the
 * `--immutable` option is set …, Yarn will abort with an error exit code if
 * the lockfile was to be modified … For backward compatibility we offer an
 * alias under the name of `--frozen-lockfile`, but it will be removed in a
 * later release."
 */
const YARN_IMMUTABLE = "yarn install --immutable";

/** Yarn 1's frozen install, which has no `--immutable`. */
const YARN_FROZEN = "yarn install --frozen-lockfile";

/**
 * Whether the checkout's yarn is Yarn 2 or later, as a shell test in its
 * root: its `yarn.lock` opens with a `__metadata:` block (Yarn 1's is
 * headed `# yarn lockfile v1` and has none), or it keeps a `.yarnrc.yml`,
 * the one config file Yarn 2 and later read ("Starting from the v2, they must
 * be written in valid Yaml", yarnpkg.com/configuration/yarnrc).
 */
const YARN_BERRY_TEST =
  "grep -q '^__metadata:' yarn.lock || [ -f .yarnrc.yml ]";

/**
 * The shell that sets `install` to the install a lockfile at a repository's
 * root picks (my call; no lockfile, no install): each frozen, so it installs
 * what the lockfile holds and never rewrites it, and refuses a lockfile its
 * `package.json` disagrees with. A `yarn.lock` picks by its yarn's major
 * ({@link YARN_BERRY_TEST}).
 */
const installPick = (lockfile: (typeof LOCKFILES)[number]): string => {
  const word = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;
  switch (lockfile) {
    case "bun.lock":
    case "bun.lockb":
      return `install=${word(BUN_FROZEN)}`;
    case "pnpm-lock.yaml":
      return `install=${word("pnpm install --frozen-lockfile")}`;
    case "package-lock.json":
      return `install=${word("npm ci")}`;
    case "yarn.lock":
      return `if ${YARN_BERRY_TEST}; then install=${word(YARN_IMMUTABLE)}; else install=${word(YARN_FROZEN)}; fi`;
    default:
      return lockfile satisfies never;
  }
};

/** The lockfiles {@link installPick} knows, most specific first. */
export const LOCKFILES = [
  "bun.lock",
  "bun.lockb",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
] as const;

/**
 * Where a checkout's install records what it installed from, next to the
 * dependencies: one hash of its root lockfile (its `package.json` when it
 * has none) and every tracked `package.json`, so a manifest changed without
 * its lockfile installs too, and the frozen install refuses it. Gone with
 * them: a clone cut again has none.
 */
const DEPS_STAMP = "node_modules/.cawco-lockfile";

/** What {@link depsScript} prints first when it installs, and only then. */
export const DEPS_INSTALLING = "installing: ";

/**
 * Installs a checkout's dependencies when they were not installed from its
 * root lockfile and manifests as they stand ({@link DEPS_STAMP}): none
 * installed, or one changed since; by {@link installPick}'s pick for that
 * lockfile, which never rewrites it. With no lockfile its `package.json`
 * stands in for one, installed by bun's frozen install, which writes none:
 * the checkout gains no file to commit. Then stamps it. Neither file, or a
 * matching stamp: nothing runs and nothing is printed. The stamp, not the
 * installer's own check, decides: `npm ci` removes a `node_modules` that is
 * there before every install (docs.npmjs.com/cli/commands/npm-ci). Run in
 * the checkout's root.
 */
export const depsScript = (): string => {
  const word = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;
  const picks = LOCKFILES.map(
    (lock, index) =>
      `${index ? "elif" : "if"} [ -f ${lock} ]; then lock=${lock}; ${installPick(lock)}`
  ).join("\n");
  return [
    `${picks}\nelif [ -f package.json ]; then lock=package.json; install=${word(BUN_FROZEN)}\nelse exit 0\nfi`,
    `inputs="$({ git hash-object "$lock"; git -c core.quotePath=false ls-files -- ':(glob)**/package.json' | git hash-object --stdin-paths; } | git hash-object --stdin)"`,
    `stamp="$(cat ${DEPS_STAMP} 2>/dev/null)"`,
    `[ "$stamp" = "$inputs" ] && exit 0`,
    `what="a package.json"; [ "$lock" = package.json ] || what="$what or $lock"`,
    `if [ -n "$stamp" ]; then why="$what changed since the dependencies were installed"; else why="no dependencies installed from $lock"; fi`,
    `echo "${DEPS_INSTALLING}$install ($why)"`,
    "$install 2>&1 || exit $?",
    `mkdir -p node_modules && printf '%s\\n' "$inputs" > ${DEPS_STAMP}`,
  ].join("\n");
};
