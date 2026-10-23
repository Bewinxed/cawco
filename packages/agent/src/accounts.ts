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
  type AuthState,configurePage,
  identityOf,
  type MachineHarnessReport,
  type ModelInfo,
} from "@cawco/core";
import { type Bounded, Gone, readWithin } from "@cawco/core/bounded";
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
import { hostEnvironment } from "@cawco/core/session-env";
import { idle } from "./auth";
import { retireConfigDir } from "./claude-sessions";
import { ClaudeRefused, claudeToStart } from "./claude-version";
import { hostGit } from "./clone";
import { keychainLocked, loginKeychainPath } from "./login-keychain";
import { probeStarted } from "./probe-count";

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

/**
 * How long one `claude auth status` may take to answer. Our choice, because:
 * every account dir is read this way each minute and on every report, and a
 * CLI that never answers would hold all of them; a read cut by it is
 * unanswered, never signed out ({@link authStatusIn}). Ending it can cut a
 * token refresh short, which signed accounts out before Claude Code 2.1.301
 * ("Fixed sign-in refresh timeouts and unexpected sign-outs after a short
 * command such as `claude auth status` … exited in the middle of a token
 * refresh"), so it runs on nothing older ({@link claudeToStart}).
 */
const AUTH_STATUS_TIMEOUT_MS = 20_000;

/**
 * What `claude auth status --json` said for a config dir: its sign-in, or
 * `unread` with the sentence why it says nothing of one (the version gate
 * refused to run it, or it printed nothing it could mean), or `locked`: it
 * was not asked, its login being in the locked login keychain
 * ({@link lockedAway}). None is signed out.
 */
export type AuthStatus =
  | {
      kind: "signin";
      loggedIn: boolean;
      authMethod?: string;
      identity?: AccountIdentity;
    }
  | { kind: "unread"; why: string }
  | { kind: "locked"; why: string };

/** Who each config dir was signed in as at its last `auth status` read, by the dir. */
const dirIdentities = new Map<string, AccountIdentity>();

/**
 * Who a Claude Code process running in config dir `dir` says it is (its
 * initialize response's `said`, which names no organization id), with the
 * organization id of the dir's own login as its last `auth status` read it,
 * when that login is the same email: one login, read twice. Another email,
 * or no read yet, leaves the id unknown, and such an identity is the same as
 * no other (core `sameIdentity`).
 */
export const dirIdentity = (
  dir: string | undefined,
  said: AccountIdentity | undefined
): AccountIdentity | undefined => {
  const read = dir === undefined ? undefined : dirIdentities.get(dir);
  return said && read?.email.toLowerCase() === said.email.toLowerCase()
    ? { ...said, orgId: read.orgId }
    : said;
};

/**
 * Who an `auth status` answer says its dir is signed in as, kept for the dir
 * (`configDir`, its `CLAUDE_CONFIG_DIR`; none for the machine's own) as
 * {@link dirIdentity} reads it. `email`, `orgName` and `orgId` are the
 * login's `emailAddress`, `organizationName` and `organizationUuid`. The id
 * is what the identity is keyed on (core `sameIdentity`); its initialize
 * response names none, so this read is the one that says who a dir is.
 */
const signedInAs = (
  status: NonNullable<ReturnType<typeof statusIn>>,
  configDir: string | undefined
): AccountIdentity | undefined => {
  const identity =
    status.loggedIn && typeof status.email === "string"
      ? identityOf({
          email: status.email,
          ...(typeof status.orgName === "string"
            ? { organization: status.orgName }
            : {}),
          ...(typeof status.orgId === "string" ? { orgId: status.orgId } : {}),
        })
      : undefined;
  if (configDir && identity) {
    dirIdentities.set(configDir, identity);
  } else if (configDir) {
    dirIdentities.delete(configDir);
  }
  return identity;
};

/** The sentence for a `claude auth status` on `dir` that gave no answer in time, or ended before it answered. */
export const noAuthAnswer = (
  dir: string,
  { after, reason }: { after: number; reason: "timeout" | "dead" }
): string =>
  reason === "timeout"
    ? `Claude Code did not answer \`claude auth status\` for ${dir} within ${AUTH_STATUS_TIMEOUT_MS / 1000} s (let go after ${after} ms). Its sign-in was not read.`
    : `Claude Code's \`claude auth status\` for ${dir} ended before it answered, after ${after} ms. Its sign-in was not read.`;

/** `claude auth status --json`'s output read as an answer, or undefined when it is none (no JSON, no `loggedIn`). */
const statusIn = (
  output: string
):
  | {
      loggedIn: boolean;
      authMethod?: unknown;
      email?: unknown;
      orgId?: unknown;
      orgName?: unknown;
    }
  | undefined => {
  let parsed: { loggedIn?: unknown } | null;
  try {
    parsed = JSON.parse(output);
  } catch {
    return undefined;
  }
  return typeof parsed?.loggedIn === "boolean"
    ? (parsed as { loggedIn: boolean })
    : undefined;
};

/**
 * What `claude auth status --json` says, run in `env` (its config dir is
 * `dir`): signed in, how, and as whom ({@link AuthStatus}). Unanswered when
 * it ran out of {@link AUTH_STATUS_TIMEOUT_MS} (however the process then
 * took its end), or something else ended it before it answered (`dead`).
 * Not run, and `locked`, when the dir's login is in the locked login
 * keychain ({@link lockedAway}).
 */
export const authStatusIn = async (
  env: Record<string, string | undefined>,
  dir: string
): Promise<Bounded<AuthStatus>> => {
  let executable: string;
  try {
    executable = await claudeToStart();
  } catch (error) {
    if (error instanceof ClaudeRefused) {
      return {
        kind: "answered",
        value: {
          kind: "unread",
          why: `\`claude auth status\` was not run for ${dir}: ${error.message} Its sign-in was not read.`,
        },
      };
    }
    throw error;
  }
  if (await lockedAway(serviceOf(env.CLAUDE_CONFIG_DIR))) {
    return {
      kind: "answered",
      value: {
        kind: "locked",
        why: `\`claude auth status\` was not run for ${dir}: its login is in the login keychain, which is locked, and Claude Code reads it only by unlocking it. Its sign-in was not read.`,
      },
    };
  }
  return readWithin<AuthStatus>(AUTH_STATUS_TIMEOUT_MS, async (signal) => {
    const child = Bun.spawn([executable, "auth", "status", "--json"], {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      signal,
    });
    const [output] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    if (child.signalCode !== null) {
      throw new Gone(`claude auth status for ${dir} (${child.signalCode})`);
    }
    const status = statusIn(output);
    if (!status) {
      return {
        kind: "unread",
        why: `Claude Code answered \`claude auth status\` for ${dir} with no JSON carrying a loggedIn (exit ${child.exitCode}). Its sign-in was not read.`,
      };
    }
    // It "Exits with code 0 if logged in, 1 if not"
    // (https://code.claude.com/docs/en/cli): an exit that says otherwise
    // than its JSON leaves neither read.
    if (status.loggedIn !== (child.exitCode === 0)) {
      return {
        kind: "unread",
        why: `Claude Code answered \`claude auth status\` for ${dir} with loggedIn ${status.loggedIn} but exit ${child.exitCode}, which say opposite things. Its sign-in was not read.`,
      };
    }
    const identity = signedInAs(status, env.CLAUDE_CONFIG_DIR);
    return {
      kind: "signin",
      loggedIn: status.loggedIn,
      ...(typeof status.authMethod === "string"
        ? { authMethod: status.authMethod }
        : {}),
      ...(identity ? { identity } : {}),
    };
  });
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

/** What hears each change to this machine's account dirs end ({@link onSigninsChanged}). */
const signinListeners = new Set<() => void>();

/** Listens for the end of each change to this machine's account dirs ({@link changingSignins}); answers the way to stop. */
export const onSigninsChanged = (listener: () => void): (() => void) => {
  signinListeners.add(listener);
  return () => signinListeners.delete(listener);
};

/** Runs a change to this machine's account dirs as one {@link accountReports} waits out. */
export const changingSignins = <T>(change: Promise<T>): Promise<T> => {
  signinChanges.add(change);
  signinChanged += 1;
  const over = () => {
    signinChanges.delete(change);
    signinChanged += 1;
    for (const listener of signinListeners) {
      listener();
    }
  };
  change.then(over, over);
  return change;
};

/**
 * What one read of the machine's account dirs found: each dir Claude Code
 * answered for, and the dirs whose sign-in was not read ({@link
 * authStatusIn} unanswered, answered with nothing of a sign-in, or not asked
 * for a login in the locked keychain), which are neither signed in nor out:
 * the hub keeps what it last had for each. `locked` names the unread ones
 * whose login is in the locked keychain.
 */
export interface AccountsRead {
  accounts: AccountReport[];
  locked: string[];
  unread: string[];
}

/** The account dirs whose last read went unanswered, so each is said once until it answers again. */
const unanswered = new Set<string>();

/** A dir whose sign-in was not read, and whether its login is in the locked keychain. */
interface Unread {
  account: string;
  locked: boolean;
}

/** A dir whose sign-in was not read, said once per streak with `why`. */
const unreadAccount = (
  account: string,
  why: string,
  locked: boolean
): Unread => {
  if (!unanswered.has(account)) {
    unanswered.add(account);
    console.warn(`[accounts] ${why}`);
  }
  return { account, locked };
};

/** One account dir read, or the dir unread (said once). */
const readAccount = async (
  account: string
): Promise<AccountReport | Unread> => {
  const dir = accountConfigDir(account);
  const read = await authStatusIn(envFor(account), dir);
  switch (read.kind) {
    case "unanswered":
      return unreadAccount(account, noAuthAnswer(dir, read), false);
    case "answered": {
      const status = read.value;
      switch (status.kind) {
        case "unread":
          return unreadAccount(account, status.why, false);
        case "locked":
          return unreadAccount(account, status.why, true);
        case "signin": {
          unanswered.delete(account);
          const kind = kindOf(status.authMethod);
          return {
            account,
            loggedIn: status.loggedIn,
            ...(kind ? { kind } : {}),
            ...(status.identity ? { identity: status.identity } : {}),
          };
        }
        default: {
          const unhandled: never = status;
          throw new Error(`unhandled status: ${JSON.stringify(unhandled)}`);
        }
      }
    }
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/**
 * Every account dir on this machine and whether it is signed in, read when
 * no sign-in is changing here and again when one changed while it was read.
 */
export const accountReports = async (): Promise<AccountsRead> => {
  probeStarted();
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each read waits out the changes begun before it
    await Promise.allSettled([...signinChanges]);
    const seen = signinChanged;
    const read = await Promise.all(accountIds().map(readAccount));
    if (seen === signinChanged) {
      const unread = read.filter((one): one is Unread => "locked" in one);
      return {
        accounts: read.filter(
          (one): one is AccountReport => !("locked" in one)
        ),
        locked: unread.filter((one) => one.locked).map((one) => one.account),
        unread: unread.map((one) => one.account),
      };
    }
  }
};

/**
 * The user name Claude Code files its Keychain item under: `$USER`, else the
 * login's, and `claude-code-user` when that is not `[a-zA-Z0-9._-]+`. Read
 * from Claude Code 2.1.289's own `I9()` (its CLI's source) and
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
  serviceOf(accountConfigDir(account));

/** The default dir's Keychain service: no `CLAUDE_CONFIG_DIR`, no hash suffix. */
export const HOME_SERVICE = "Claude Code-credentials";

/** The Keychain service of the dir `CLAUDE_CONFIG_DIR` names, or of the default dir when it names none ({@link keychainService}). */
const serviceOf = (configDir: string | undefined): string =>
  configDir === undefined
    ? HOME_SERVICE
    : `${HOME_SERVICE}-${createHash("sha256")
        .update(configDir.normalize("NFC"))
        .digest("hex")
        .slice(0, 8)}`;

/**
 * Whether the keychain holds the login item filed under `service`: its
 * attributes only (no `-w`), which read while the keychain is locked and
 * never touch the secret, so no prompt rises. A missing item exits 44.
 */
const keychainHolds = async (service: string): Promise<boolean> => {
  const read =
    await Bun.$`security find-generic-password -a ${keychainUser()} -s ${service}`
      .env(hostEnvironment())
      .quiet()
      .nothrow();
  return read.exitCode === 0;
};

/**
 * Whether the login filed under `service` is in the login keychain while it
 * is locked for this process: on macOS, the item is there and the keychain is
 * locked (login-keychain.ts, no secret, no UI). Claude Code reads a login
 * only with its secret (`security find-generic-password … -w`, CLI 2.1.302),
 * which on a locked keychain raises the unlock dialog inside the desktop
 * session and waits on it, so nothing that runs it in the background is
 * started on such a login. The item is read first: the lock is read only of
 * a keychain that holds one.
 */
const lockedAway = async (service: string): Promise<boolean> =>
  platform() === "darwin" &&
  (await keychainHolds(service)) &&
  keychainLocked(loginKeychainPath());

/**
 * The machine's word on Claude, from its account dirs alone: authenticated
 * when any account is signed in here; else `unreadable-credentials` when a
 * dir's login is in the locked login keychain ({@link lockedAway}), whatever
 * the other dirs said; else, when some dir gave no answer, undefined (its
 * dirs have not said, and the hub keeps the machine's last word); else
 * unauthenticated. The machine's own `~/.claude` has no say.
 */
export const claudeAuth = ({
  accounts,
  locked,
  unread,
}: AccountsRead): AuthState | undefined => {
  if (accounts.some((report) => report.loggedIn)) {
    return "authenticated";
  }
  if (locked.length > 0) {
    return "unreadable-credentials";
  }
  if (unread.length > 0) {
    return undefined;
  }
  return "unauthenticated";
};

/**
 * The sign-in part of Claude's harness report, from one read of the account
 * dirs: the dirs that answered, the ones that did not (`unreadAccounts`, which
 * the hub leaves as they were), and the machine's word on Claude when its
 * dirs settle it. The one place the report's sign-ins are made.
 */
export const claudeSignins = (
  read: AccountsRead
): Pick<MachineHarnessReport, "accounts" | "auth" | "unreadAccounts"> => {
  const auth = claudeAuth(read);
  return {
    accounts: read.accounts,
    ...(read.unread.length > 0 ? { unreadAccounts: read.unread } : {}),
    ...(auth ? { auth } : {}),
  };
};

/**
 * What a machine's agent says about its Claude accounts once it has read
 * them (daemon.ts `noteClaudeAuth`): nothing while a CawCo account
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
    : `No Claude account is signed in on this machine. Add one in ${configurePage("accounts")} and sign it in there.`;
};

/** How long a probe may take to be answered at initialize. */
const PROBE_TIMEOUT_MS = 60_000;

/**
 * One dir's initialize response, read by a session that never takes a turn:
 * its prompt is held open and yields nothing, so the CLI answers the SDK's
 * initialize and waits. Nothing it loads makes a request: no user settings,
 * no MCP servers, nothing persisted. Throws with the CLI's word when it
 * cannot answer, and with its own sentence when it gave no answer in time
 * (never a probe that read nothing). Not started on a login in the locked
 * login keychain ({@link lockedAway}): it throws that sentence. Its identity
 * carries the organization id the dir's `auth status` names.
 */
export const probeAccount = async (account: string): Promise<AccountProbe> => {
  if (await lockedAway(keychainService(account))) {
    throw new Error(
      `${accountConfigDir(account)} was not probed: its login is in the login keychain, which is locked, and Claude Code reads it only by unlocking it.`
    );
  }
  const handle = query({
    prompt: idle,
    options: {
      pathToClaudeCodeExecutable: await claudeToStart(),
      env: envFor(account),
      settingSources: [],
      strictMcpConfig: true,
      mcpServers: {},
      persistSession: false,
    },
  });
  try {
    const read = await readWithin(PROBE_TIMEOUT_MS, () =>
      handle.initializationResult()
    );
    let init: Awaited<ReturnType<typeof handle.initializationResult>>;
    switch (read.kind) {
      case "unanswered":
        throw new Error(
          `Claude Code did not answer initialize within ${PROBE_TIMEOUT_MS / 1000}s`
        );
      case "answered":
        init = read.value;
        break;
      default: {
        const unhandled: never = read;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    // Who it is, keyed on its organization's id, which only `auth status`
    // names: read now, so the id is this login's ({@link dirIdentity}).
    await readAccount(account);
    const identity = dirIdentity(
      accountConfigDir(account),
      identityOf(init.account)
    );
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
 * the user's one copy; and so does each project's auto memory either side
 * has ({@link memorySlugs}, {@link linkProjectMemory}). A dir the account already has of its own
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
    ...USER_LAYER_FILES.map((entry) => {
      const target = userLayerPath(entry);
      const path = join(dir, entry);
      return onePathAtATime(path, async () => {
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
      });
    }),
  ]);
  for (const slug of await memorySlugs(dir)) {
    // biome-ignore lint/performance/noAwaitInLoops: one project at a time, each a handful of syscalls
    await linkProjectMemory(dir, slug);
  }
};

/**
 * The projects whose auto memory an account dir links at link time: each one
 * {@link claudeHome} has a memory for, and each one the account dir has a
 * memory of its own for (moved into the user's copy as it is linked). A
 * project neither has one for is linked when a session launches in it.
 */
const memorySlugs = async (configDir: string): Promise<string[]> => {
  const withMemory = async (root: string): Promise<string[]> => {
    const projects = await readdir(join(root, "projects"), {
      withFileTypes: true,
    }).catch(() => []);
    const found = await Promise.all(
      projects.map(async (project) =>
        project.isDirectory() &&
        (await lstat(projectMemoryDir(root, project.name)).catch(
          () => undefined
        ))
          ? project.name
          : undefined
      )
    );
    return found.filter((slug): slug is string => slug !== undefined);
  };
  return [
    ...new Set([
      ...(await withMemory(claudeHome())),
      ...(await withMemory(configDir)),
    ]),
  ];
};

/**
 * The folder Claude Code keys a project's auto memory by: the canonical git
 * root (the dir holding `--git-common-dir`'s `.git`, so every worktree of a
 * repo shares its main checkout's memory), else the dir itself, each by its
 * real path. Found by a rig run of Claude Code 2.1.289: a linked worktree's
 * memory went under the main repo's slug.
 */
export const projectMemoryRoot = async (cwd: string): Promise<string> => {
  const common = await hostGit(cwd, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]).catch(() => undefined);
  const dir = common?.exitCode === 0 ? common.stdout.toString().trim() : "";
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
 * The link being made now at each config-dir path, as a promise that never
 * rejects. A link is a look then a change (lstat, then move and symlink), and
 * launches run in parallel: ten sessions started at once in one project each
 * link its memory, and every one that looked before the first had linked
 * failed its symlink with EEXIST, its launch with it. So one path is linked by
 * one call at a time: a later call waits for the earlier one to end, then
 * looks, finds the link, and returns.
 */
const linking = new Map<string, Promise<void>>();

const onePathAtATime = (
  path: string,
  link: () => Promise<void>
): Promise<void> => {
  const key = resolve(path);
  const run = (linking.get(key) ?? Promise.resolve()).then(link);
  const ended = run.then(
    () => undefined,
    () => undefined
  );
  linking.set(key, ended);
  ended.then(() => {
    if (linking.get(key) === ended) {
      linking.delete(key);
    }
  });
  return run;
};

/**
 * Makes `path`, a dir in an account's config dir, a symlink to `target`, the
 * user's one copy in {@link claudeHome}, made there if it is not yet. What
 * the account's dir already holds of its own there is moved into the copy
 * entry by entry first: one the copy already has with the same bytes goes,
 * one with other bytes is kept beside it as `<base>.account-<id8><ext>`, so
 * neither is lost. A file where the dir should be is left alone and said in
 * the log. One call at a time per path ({@link onePathAtATime}).
 */
const shareDir = (
  path: string,
  target: string,
  /** The account `path` is in, whose first 8 characters mark a copy kept beside. */
  account: string
): Promise<void> =>
  onePathAtATime(path, () => shareDirNow(path, target, account));

const shareDirNow = async (
  path: string,
  target: string,
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
