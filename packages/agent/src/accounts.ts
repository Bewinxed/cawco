import { createHash } from "node:crypto";
import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import { homedir, platform, userInfo } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  type AccountIdentity,
  type AccountKind,
  type AccountProbe,
  type AuthState,
  type ClaudeAccountReport,
  identityOf,
  type ModelInfo,
} from "@cawco/core";
import { accountConfigDir, accountIds } from "@cawco/core/paths";
import { claudeExecutableOptions, idle, resolveClaudeExecutable } from "./auth";

/**
 * An account's Claude Code on this machine: its config dir, which holds its
 * own credential (made by Claude Code's own `claude auth login`), transcripts
 * and `.claude.json`, with the fleet's user layer linked in from `~/.claude`.
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

/** Every account dir on this machine and whether it is signed in. */
export const accountReports = (): Promise<ClaudeAccountReport[]> =>
  Promise.all(
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
  reports: readonly ClaudeAccountReport[]
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
 * The fleet's user layer, which Claude Code reads from its config dir: each
 * entry an account dir links to `~/.claude`, where fleet sync writes it. Per
 * dir and never linked: the credential, transcripts, history and
 * `.claude.json`.
 */
const USER_LAYER = [
  "CLAUDE.md",
  "memories",
  "skills",
  "agents",
  "commands",
  "plugins",
  "settings.json",
];

/**
 * Links the fleet's user layer into an account's dir: each entry `~/.claude`
 * has, the dir does not, becomes a symlink to it. An entry the dir already
 * has as a file of its own is left alone and said in the log.
 */
export const linkUserLayer = async (account: string): Promise<void> => {
  const dir = accountConfigDir(account);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const home = join(homedir(), ".claude");
  await Promise.all(
    USER_LAYER.map(async (entry) => {
      const target = join(home, entry);
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
    })
  );
};

/** Every account dir's own `.claude.json`, where its MCP servers live. */
export const accountClaudeJsons = (): string[] =>
  accountIds().map((account) =>
    join(accountConfigDir(account), ".claude.json")
  );

/** The account's dir, gone: its credential with it, after Claude Code signed it out. */
export const removeAccountDir = (account: string): Promise<void> =>
  rm(join(accountConfigDir(account), ".."), { recursive: true, force: true });
