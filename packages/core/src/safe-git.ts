/**
 * How CawCo runs git: every git call the hub or an agent makes runs this way,
 * so that no program a repository's own config or hooks name ever runs. A
 * workspace writes its clone, `.git/config` and `.git/hooks` included; a git
 * call on the host that ran what they name would run the workspace's code
 * outside its boundary.
 *
 * - {@link SAFE_GIT_FLAGS} turn off what runs whatever the config says:
 *   hooks, the fsmonitor, the `ext::` transport, signing and its checks, the
 *   pager, the alternates' refs command.
 * - {@link SAFE_GIT_ENV} is what git reads before any config: pager, editors,
 *   askpass.
 * - {@link repositoryConfigProblem} holds a repository's own config to the
 *   keys a checkout needs ({@link ALLOWED_KEYS}); a key past them (a filter
 *   or diff driver, a credential helper, `core.sshCommand`, an include) means
 *   git does not run there at all. The global and system config are the
 *   owner's, and nothing inside a workspace writes them.
 *
 * A git call in a live workspace's clone also runs inside the workspace's
 * boundary, where a race on its config can only reach the workspace itself.
 * A workspace's clone is read or checked out with git on the host only while
 * its boundary is closed (agent workspace.ts `closeClone`, and `workspaceAt`,
 * which writes a commit's tracked files the policy denies the workspace
 * itself), when nothing can write it, and through a `.git` that is a folder,
 * never a link.
 */
import { join } from "node:path";

/** The flags that go right after `git`. */
export const SAFE_GIT_FLAGS: readonly string[] = [
  "--no-pager",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "protocol.ext.allow=never",
  "-c",
  "core.alternateRefsCommand=",
  "-c",
  "log.showSignature=false",
  "-c",
  "commit.gpgSign=false",
  "-c",
  "tag.gpgSign=false",
  "-c",
  "push.gpgSign=false",
];

/**
 * The locale every git CawCo runs speaks in, whatever the host's is: what
 * CawCo decides on git is its exit status and its plumbing's output, and the
 * words it quotes to a person are then the same on every machine. In
 * {@link SAFE_GIT_ENV}, and in each git environment built without it (a
 * move's, a GitHub push's, a merge of two texts).
 */
export const GIT_LOCALE: Readonly<Record<string, string>> = { LC_ALL: "C" };

/**
 * What git reads from its environment before any config, and {@link
 * GIT_LOCALE}. Each program is named bare, found by the OS's own lookup on
 * the PATH git runs with, as `true` is in every OS's; its answer, no
 * password, is the same wherever it is.
 */
export const SAFE_GIT_ENV: Readonly<Record<string, string>> = {
  GIT_PAGER: "cat",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  GIT_ASKPASS: "true",
  GIT_TERMINAL_PROMPT: "0",
  ...GIT_LOCALE,
};

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/**
 * {@link SAFE_GIT_ENV} and `git` with {@link SAFE_GIT_FLAGS}, as the start of
 * a shell command: `${SAFE_GIT} status --porcelain`. In a command line of
 * several git calls each starts this way.
 */
export const SAFE_GIT = [
  ...Object.entries(SAFE_GIT_ENV).map(
    ([name, value]) => `${name}=${quote(value)}`
  ),
  "git",
  ...SAFE_GIT_FLAGS.map(quote),
].join(" ");

/**
 * A shell function named `git` that runs git as {@link SAFE_GIT} does, put
 * before a command line: every `git` in it, in pipes, subshells and `||`
 * lists, then runs that way. `SAFE_GIT_SHELL + "git rebase …"`.
 */
export const SAFE_GIT_SHELL = `git() { ${[
  ...Object.entries(SAFE_GIT_ENV).map(
    ([name, value]) => `${name}=${quote(value)}`
  ),
  "command",
  "git",
  ...SAFE_GIT_FLAGS.map(quote),
].join(" ")} "$@"; }; `;

/**
 * git's global options that take the next word as their value (`git -C dir
 * status`): what a reader of a git command line steps over to find its
 * subcommand.
 */
export const GIT_VALUED_OPTIONS: readonly string[] = [
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "--super-prefix",
  "--list-cmds",
];

/** `git` and its arguments as an argv, for a spawn: pair it with {@link SAFE_GIT_ENV}. */
export const safeGitArgv = (args: readonly string[]): string[] => [
  "git",
  ...SAFE_GIT_FLAGS,
  ...args,
];

/**
 * The keys a repository's own config may hold for git to run there: what
 * `git clone`, `git init`, a branch and its upstream, a commit's author, and
 * git-lfs as it fetches and pushes write. Each is a pattern on the whole
 * lower-cased key.
 *
 * An allowlist, not a list of the keys that run programs: git keeps no such
 * list. Its own word is "Some configuration options and hook files may cause
 * Git to run arbitrary shell commands … it is not safe to run Git commands
 * in a .git directory … when that .git directory itself comes from an
 * untrusted source", and an untrusted one is to be "sanitized" first
 * (https://git-scm.com/docs/git#_security). Releases add more: Git 2.54's
 * config hooks run `hook.<name>.command` beside the hooks dir's, which
 * `core.hooksPath` names (https://git-scm.com/docs/git-hook). Keys that run
 * nothing still reach past the clone on the host:
 * `core.worktree` checks out anywhere, `http.cookieFile` with
 * `http.saveCookies` writes any file.
 */
const ALLOWED_KEYS: readonly RegExp[] = [
  /^core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|eol|safecrlf|quotepath)$/u,
  /^extensions\.(objectformat|refstorage)$/u,
  // git-lfs writes its format marker into any repository it runs in (a
  // checkout that smudges a large file); it names no program.
  /^lfs\.repositoryformatversion$/u,
  // git-lfs writes these of its own for its endpoint: `access` "is normally
  // set by LFS itself on receiving a 401 response" (basic, negotiate or
  // none), and `locksverify` true or false as the server answers its lock
  // check (https://github.com/git-lfs/git-lfs/blob/main/docs/man/git-lfs-config.adoc).
  // Both are among the few keys git-lfs takes from a repository's committed
  // `.lfsconfig`, a set it restricts "for security reasons". A delegate's
  // push to an LFS endpoint left `access` in clone 8c921fcb on 2026-10-25,
  // and its archive was refused every minute for it.
  /^lfs\.[^\n]+\.(access|locksverify)$/u,
  /^remote\.[^\n]+\.(url|pushurl|fetch|push|tagopt|prune|mirror|skipdefaultupdate)$/u,
  /^branch\.[^\n]+\.(remote|merge|rebase|pushremote|description)$/u,
  /^(user|author|committer)\.(name|email)$/u,
  /^(pull\.(rebase|ff)|push\.(default|autosetupremote)|rebase\.(autosquash|autostash|updaterefs)|merge\.(ff|conflictstyle)|fetch\.prune|init\.defaultbranch|color\.ui|gc\.auto)$/u,
];

/** The repository's own config files: `config`, and `config.worktree` where one is. */
const ownConfigs = (gitDir: string): string[] => [
  join(gitDir, "config"),
  join(gitDir, "config.worktree"),
];

/**
 * Why git must not run in the repository whose git directory is `gitDir`:
 * a `commondir` file there (a linked worktree's, gitrepository-layout(5):
 * git then reads the config of the dir it names, which this never reads; a
 * clone has none), the first key in its own config past
 * {@link ALLOWED_KEYS}, or the config git could not read. Nothing when git
 * may run there.
 */
export const repositoryConfigProblem = async (
  gitDir: string
): Promise<string | undefined> => {
  if (await Bun.file(join(gitDir, "commondir")).exists()) {
    return `${join(gitDir, "commondir")} names another git directory, whose config CawCo does not read, so it does not run git there`;
  }
  for (const file of ownConfigs(gitDir)) {
    if (!(await Bun.file(file).exists())) {
      continue;
    }
    const listed = Bun.spawnSync(
      [
        "git",
        ...SAFE_GIT_FLAGS,
        "config",
        "--file",
        file,
        "--no-includes",
        "--name-only",
        "--list",
      ],
      { env: { ...process.env, ...SAFE_GIT_ENV }, stderr: "pipe" }
    );
    if (listed.exitCode !== 0) {
      return `git could not read ${file}: ${listed.stderr.toString().trim()}`;
    }
    const key = listed.stdout
      .toString()
      .split("\n")
      .filter(Boolean)
      .find(
        (name) =>
          !ALLOWED_KEYS.some((allowed) => allowed.test(name.toLowerCase()))
      );
    if (key) {
      return `${file} sets ${key}, which CawCo does not run git under`;
    }
  }
};
