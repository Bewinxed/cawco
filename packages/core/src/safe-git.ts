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

/** What git reads from its environment before any config. */
export const SAFE_GIT_ENV: Readonly<Record<string, string>> = {
  GIT_PAGER: "cat",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  GIT_ASKPASS: "/usr/bin/true",
  GIT_TERMINAL_PROMPT: "0",
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

/** `git` and its arguments as an argv, for a spawn: pair it with {@link SAFE_GIT_ENV}. */
export const safeGitArgv = (args: readonly string[]): string[] => [
  "git",
  ...SAFE_GIT_FLAGS,
  ...args,
];

/**
 * The keys a repository's own config may hold for git to run there: what
 * `git clone`, `git init`, a branch and its upstream, and a commit's author
 * write. Each is a pattern on the whole lower-cased key.
 */
const ALLOWED_KEYS: readonly RegExp[] = [
  /^core\.(repositoryformatversion|filemode|bare|logallrefupdates|ignorecase|precomposeunicode|symlinks|autocrlf|eol|safecrlf|quotepath)$/,
  /^extensions\.(objectformat|refstorage)$/,
  // git-lfs writes its format marker into any repository it runs in (a
  // checkout that smudges a large file); it names no program.
  /^lfs\.repositoryformatversion$/,
  /^remote\.[^\n]+\.(url|pushurl|fetch|push|tagopt|prune|mirror|skipdefaultupdate)$/,
  /^branch\.[^\n]+\.(remote|merge|rebase|pushremote|description)$/,
  /^(user|author|committer)\.(name|email)$/,
  /^(pull\.(rebase|ff)|push\.(default|autosetupremote)|rebase\.(autosquash|autostash|updaterefs)|merge\.(ff|conflictstyle)|fetch\.prune|init\.defaultbranch|color\.ui|gc\.auto)$/,
];

/** The repository's own config files: `config`, and `config.worktree` where one is. */
const ownConfigs = (gitDir: string): string[] => [
  join(gitDir, "config"),
  join(gitDir, "config.worktree"),
];

/**
 * Why git must not run in the repository whose git directory is `gitDir`:
 * the first key in its own config past {@link ALLOWED_KEYS}, or the config
 * git could not read. Nothing when git may run there.
 */
export const repositoryConfigProblem = async (
  gitDir: string
): Promise<string | undefined> => {
  for (const file of ownConfigs(gitDir)) {
    // biome-ignore lint/performance/noAwaitInLoops: two small files, the second only where it exists
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
