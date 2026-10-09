import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  realpath,
  rename,
  rm,
  rmdir,
  symlink,
} from "node:fs/promises";
import { platform, userInfo } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  type AccountIdentity,
  type AccountKind,
  type AccountProbe,
  type AccountReport,
  type AuthState,
  identityOf,
  type ModelInfo,
} from "@cawco/core";
import {
  accountClaudeJson,
  accountConfigDir,
  accountIds,
  claudeHome,
  projectMemoryDir,
  removeAccountRoot,
  sessionConfigDir,
  USER_LAYER_DIRS,
  USER_LAYER_FILES,
  userLayerPath,
} from "@cawco/core/paths";
import { claudeExecutableOptions, idle, resolveClaudeExecutable } from "./auth";
import { retireConfigDir } from "./claude-sessions";

/**
 * An account's Claude Code on this machine: its config dir, which holds its
 * own credential (made by Claude Code's own `claude auth login`), transcripts
 * and `.claude.json`, with the fleet's user layer linked in from
 * {@link claudeHome}.
 * CawCo reads none of the credential: who a dir is signed in as comes from
 * Claude Code's own `auth status` and initialize response.
 */

/** The env that points Claude Code at an account's dir. */
export const accountEnv = (account: string): Record<string, string> => ({
  CLAUDE_CONFIG_DIR: accountConfigDir(account),
});

/**
 * The process env with neither of the config-dir variables Claude Code
 * reads (`CLAUDE_CONFIG_DIR`, and `CLAUDE_SECURESTORAGE_CONFIG_DIR`, which
 * overrides where its credential is kept): every Claude Code CawCo runs is
 * told its dir, never inherits one.
 */
export const bareEnv = (): Record<string, string | undefined> => {
  const {
    CLAUDE_CONFIG_DIR: _dir,
    CLAUDE_SECURESTORAGE_CONFIG_DIR: _store,
    ...rest
  } = process.env;
  return rest;
};

/** The process env with the account's dir in place of any the agent itself carries. */
const envFor = (account: string): Record<string, string | undefined> => ({
  ...bareEnv(),
  ...accountEnv(account),
});

/** What `claude auth status --json` says, run in `env`: signed in, how, and as whom. */
export const authStatusIn = async (
  env: Record<string, string | undefined>
): Promise<{
  loggedIn: boolean;
  authMethod?: string;
  identity?: AccountIdentity;
}> => {
  const executable = resolveClaudeExecutable();
  if (!executable) {
    return { loggedIn: false };
  }
  const child = Bun.spawn([executable, "auth", "status", "--json"], {
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    timeout: 20_000,
  });
  const [output] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  try {
    const status = JSON.parse(output) as {
      loggedIn?: unknown;
      authMethod?: unknown;
      email?: unknown;
      orgName?: unknown;
    };
    // `email` and `orgName` are the login's `emailAddress` and
    // `organizationName`, which its initialize response reports as `email`
    // and `organization`: one identity, whichever of the two read it.
    const identity =
      status.loggedIn === true && typeof status.email === "string"
        ? identityOf({
            email: status.email,
            ...(typeof status.orgName === "string"
              ? { organization: status.orgName }
              : {}),
          })
        : undefined;
    return {
      loggedIn: status.loggedIn === true,
      ...(typeof status.authMethod === "string"
        ? { authMethod: status.authMethod }
        : {}),
      ...(identity ? { identity } : {}),
    };
  } catch {
    return { loggedIn: false };
  }
};

/** A dir signed in through `claude auth login --console` reports a method other than claude.ai. */
export const kindOf = (
  authMethod: string | undefined
): AccountKind | undefined => {
  if (!authMethod || authMethod === "none") {
    return undefined;
  }
  return authMethod === "claude.ai" ? "subscription" : "console";
};

/**
 * The sign-ins this agent is changing (a sign-in begun or finished, a dir
 * signed out, a login moved or joined into an account), and how many
 * changes have begun or ended: a report read across one says what a dir was
 * before it, and the hub would take that over what the change settled.
 */
const signinChanges = new Set<Promise<unknown>>();
let signinChanged = 0;

/** Runs a change to this machine's account dirs as one {@link accountReports} waits out. */
export const changingSignins = <T>(change: Promise<T>): Promise<T> => {
  signinChanges.add(change);
  signinChanged += 1;
  const over = () => {
    signinChanges.delete(change);
    signinChanged += 1;
  };
  change.then(over, over);
  return change;
};

/**
 * Every account dir on this machine and whether it is signed in, read when
 * no sign-in is changing here and again when one changed while it was read.
 */
export const accountReports = async (): Promise<AccountReport[]> => {
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each read waits out the changes begun before it
    await Promise.allSettled([...signinChanges]);
    const seen = signinChanged;
    const reports = await Promise.all(
      accountIds().map(async (account) => {
        const status = await authStatusIn(envFor(account));
        const kind = kindOf(status.authMethod);
        return {
          account,
          loggedIn: status.loggedIn,
          ...(kind ? { kind } : {}),
          ...(status.identity ? { identity: status.identity } : {}),
        };
      })
    );
    if (seen === signinChanged) {
      return reports;
    }
  }
};

/** `errSecInteractionNotAllowed`: the item is there, this session may not read it. */
const SEC_INTERACTION_NOT_ALLOWED = 36;

/**
 * The user name Claude Code files its Keychain item under: `$USER`, else the
 * login's, and `claude-code-user` when that is not `[a-zA-Z0-9._-]+`. Read
 * from Claude Code 2.1.289's own `I9()` (its bundled CLI) and
 * https://github.com/musistudio/claude-code-router/issues/1601.
 */
export const keychainUser = (): string => {
  let user: string;
  try {
    user = process.env.USER || userInfo().username;
  } catch {
    return "claude-code-user";
  }
  return KEYCHAIN_USER.test(user) ? user : "claude-code-user";
};

/** A user name Claude Code files its Keychain item under as it is. */
const KEYCHAIN_USER = /^[a-zA-Z0-9._-]+$/;

/**
 * The Keychain service Claude Code keeps an account dir's login under:
 * `Claude Code-credentials-` and the first 8 hex of the SHA-256 of the
 * NFC-normalized `CLAUDE_CONFIG_DIR` exactly as set (no tilde expansion,
 * https://github.com/anthropics/claude-code/issues/79223). Claude Code
 * 2.1.289's `tGe()`: `Claude Code${OAUTH_FILE_SUFFIX}-credentials-${sha256(dir).slice(0,8)}`;
 * also https://github.com/musistudio/claude-code-router/issues/1601.
 */
export const keychainService = (account: string): string =>
  `Claude Code-credentials-${createHash("sha256")
    .update(accountConfigDir(account).normalize("NFC"))
    .digest("hex")
    .slice(0, 8)}`;

/** Whether macOS holds an account's login but refuses this process the read (exit 36; a missing item is 44). */
const keychainRefused = async (account: string): Promise<boolean> => {
  const read =
    await Bun.$`security find-generic-password -a ${keychainUser()} -s ${keychainService(account)}`
      .quiet()
      .nothrow();
  return read.exitCode === SEC_INTERACTION_NOT_ALLOWED;
};

/**
 * The machine's word on Claude, from its account dirs alone: authenticated
 * when any account is signed in here; on macOS, `unreadable-credentials`
 * when none is but the login keychain refuses the read of one's login;
 * else unauthenticated. The machine's own `~/.claude` has no say.
 */
export const claudeAuth = async (
  reports: readonly AccountReport[]
): Promise<AuthState> => {
  if (reports.some((report) => report.loggedIn)) {
    return "authenticated";
  }
  if (platform() === "darwin") {
    const refused = await Promise.all(
      reports.map((report) => keychainRefused(report.account))
    );
    if (refused.some(Boolean)) {
      return "unreadable-credentials";
    }
  }
  return "unauthenticated";
};

/** {@link claudeAuth} over this machine's account dirs, read now. */
export const machineClaudeAuth = async (): Promise<AuthState> =>
  claudeAuth(await accountReports());

/**
 * What a machine's start says about its Claude accounts, in the one place
 * both `cawco up` and the daemon read it from: nothing while a CawCo account
 * is signed in here; with none, the sentence pointing at Configure →
 * Accounts; on a Mac whose keychain refuses this process an account's login,
 * that.
 */
export const claudeAuthNote = (state: AuthState): string | undefined => {
  if (state === "authenticated") {
    return;
  }
  return state === "unreadable-credentials"
    ? "A Claude account is signed in on this machine, but this process can't read its login: it is in the login keychain, which opens only inside the desktop session. Run the daemon as a service (`cawco service install`)."
    : "No Claude account is signed in on this machine. Add one in Configure → Accounts and sign it in there.";
};

/** How long a probe may take to be answered at initialize. */
const PROBE_TIMEOUT_MS = 60_000;

/**
 * One dir's initialize response, read by a session that never takes a turn:
 * its prompt is held open and yields nothing, so the CLI answers the SDK's
 * initialize and waits. Nothing it loads makes a request: no user settings,
 * no MCP servers, nothing persisted. Throws with the CLI's word when it
 * cannot answer.
 */
export const probeAccount = async (account: string): Promise<AccountProbe> => {
  const handle = query({
    prompt: idle,
    options: {
      ...claudeExecutableOptions(),
      env: envFor(account),
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      persistSession: false,
    },
  });
  try {
    const init = await Promise.race([
      handle.initializationResult(),
      Bun.sleep(PROBE_TIMEOUT_MS).then(() => {
        throw new Error(
          `Claude Code did not answer initialize within ${PROBE_TIMEOUT_MS / 1000}s`
        );
      }),
    ]);
    const identity = identityOf(init.account);
    return {
      models: init.models as ModelInfo[],
      ...(identity ? { identity } : {}),
      ...(init.account.subscriptionType
        ? { subscriptionType: init.account.subscriptionType }
        : {}),
    };
  } finally {
    handle.close();
  }
};

/**
 * Links the fleet's user layer (core paths.ts) into an account's dir: each
 * of its dirs ({@link USER_LAYER_DIRS}, made in {@link claudeHome} when it is
 * not there yet, so an account never starts a copy of its own) and each of
 * its files `claudeHome` has ({@link USER_LAYER_FILES}) becomes a symlink to
 * the user's one copy; and so does each project's auto memory `claudeHome`
 * has ({@link linkProjectMemory}). A dir the account already has of its own
 * is moved into the user's copy first ({@link shareDir}); a file of its own
 * is left alone and said in the log.
 */
export const linkUserLayer = async (account: string): Promise<void> => {
  const dir = accountConfigDir(account);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await Promise.all([
    ...USER_LAYER_DIRS.map((entry) =>
      shareDir(join(dir, entry), userLayerPath(entry), account)
    ),
    ...USER_LAYER_FILES.map(async (entry) => {
      const target = userLayerPath(entry);
      const path = join(dir, entry);
      if (!(await lstat(target).catch(() => undefined))) {
        return;
      }
      const there = await lstat(path).catch(() => undefined);
      if (there?.isSymbolicLink()) {
        return;
      }
      if (there) {
        console.warn(
          `[accounts] ${path} is the account's own, not the fleet's; left as it is`
        );
        return;
      }
      await symlink(target, path);
    }),
  ]);
  const projects = await readdir(userLayerPath("projects"), {
    withFileTypes: true,
  }).catch(() => []);
  for (const project of projects) {
    if (
      project.isDirectory() &&
      // biome-ignore lint/performance/noAwaitInLoops: one project at a time, each a handful of syscalls
      (await lstat(projectMemoryDir(claudeHome(), project.name)).catch(
        () => undefined
      ))
    ) {
      await linkProjectMemory(dir, project.name);
    }
  }
};

/**
 * The folder Claude Code keys a project's auto memory by: the canonical git
 * root (the dir holding `--git-common-dir`'s `.git`, so every worktree of a
 * repo shares its main checkout's memory), else the dir itself, each by its
 * real path. Found by a rig run of Claude Code 2.1.289: a linked worktree's
 * memory went under the main repo's slug.
 */
export const projectMemoryRoot = async (cwd: string): Promise<string> => {
  const common =
    await Bun.$`git rev-parse --path-format=absolute --git-common-dir`
      .cwd(cwd)
      .quiet()
      .nothrow();
  const dir = common.exitCode === 0 ? common.stdout.toString().trim() : "";
  const root = dir.endsWith("/.git") ? dirname(dir) : cwd;
  return await realpath(root).catch(() => root);
};

/** Two files with the same bytes; never two dirs. */
const sameFile = async (a: string, b: string): Promise<boolean> => {
  const [one, two] = await Promise.all([lstat(a), lstat(b)]);
  return (
    one.isFile() &&
    two.isFile() &&
    one.size === two.size &&
    Buffer.from(await Bun.file(a).arrayBuffer()).equals(
      Buffer.from(await Bun.file(b).arrayBuffer())
    )
  );
};

/**
 * Makes `path`, a dir in an account's config dir, a symlink to `target`, the
 * user's one copy in {@link claudeHome}, made there if it is not yet. What
 * the account's dir already holds of its own there is moved into the copy
 * entry by entry first: one the copy already has with the same bytes goes,
 * one with other bytes is kept beside it as `<base>.account-<id8><ext>`, so
 * neither is lost. A file where the dir should be is left alone and said in
 * the log.
 */
const shareDir = async (
  path: string,
  target: string,
  /** The account `path` is in, whose first 8 characters mark a copy kept beside. */
  account: string
): Promise<void> => {
  const there = await lstat(path).catch(() => undefined);
  if (there?.isSymbolicLink()) {
    return;
  }
  if (there && !there.isDirectory()) {
    console.warn(`[accounts] ${path} is a file, not a dir; left as it is`);
    return;
  }
  await mkdir(target, { recursive: true });
  if (there) {
    const id8 = account.slice(0, 8);
    for (const name of await readdir(path)) {
      const from = join(path, name);
      const into = join(target, name);
      // biome-ignore lint/performance/noAwaitInLoops: each entry moved whole before the dir it leaves is removed
      if (!(await lstat(into).catch(() => undefined))) {
        await rename(from, into);
      } else if (await sameFile(from, into)) {
        await rm(from, { force: true });
      } else {
        const ext = extname(name);
        await rename(
          from,
          join(target, `${basename(name, ext)}.account-${id8}${ext}`)
        );
      }
    }
    await rmdir(path);
    console.info(`[accounts] ${path}'s own entries moved into ${target}`);
  }
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path);
};

/**
 * Links a project's auto memory (`projects/<slug>/memory`) in a config dir to
 * the user's one copy in {@link claudeHome} ({@link shareDir}): every
 * account's session in the project reads and writes that one memory.
 */
export const linkProjectMemory = async (
  configDir: string,
  slug: string
): Promise<void> => {
  if (resolve(configDir) === resolve(claudeHome())) {
    return;
  }
  await shareDir(
    projectMemoryDir(configDir, slug),
    projectMemoryDir(claudeHome(), slug),
    basename(dirname(resolve(configDir)))
  );
};

/** Every account dir's own `.claude.json`, where its MCP servers live. */
export const accountClaudeJsons = (): string[] =>
  accountIds().map(accountClaudeJson);

/**
 * The account's store on this machine (`~/.cawco/accounts/<id>`), gone: its
 * credential with it, once its harness signed it out. The one way any
 * account's store is deleted, so no session's data goes with one: each
 * Claude session that ran in its dir is carried out first ({@link
 * retireConfigDir}), into `into`'s dir when the account is joined into
 * another, else into {@link claudeHome}, the dir of a session on no account,
 * which is what each of their rows says once the account is gone.
 */
export const removeAccountDir = async (
  account: string,
  into: string | null = null
): Promise<void> => {
  const dir = accountConfigDir(account);
  if (await lstat(dir).catch(() => undefined)) {
    const target = sessionConfigDir({ accountId: into });
    const moved = await retireConfigDir(dir, target);
    if (moved > 0) {
      console.info(
        `[accounts] ${account}: ${moved} session(s) carried into ${target} before its dir goes`
      );
    }
  }
  await removeAccountRoot(account);
};
