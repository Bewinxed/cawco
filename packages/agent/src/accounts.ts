import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  type AccountIdentity,
  type AccountKind,
  type AccountProbe,
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

/** The env that points Claude Code at an account's dir; none for `~/.claude`. */
export const accountEnv = (account: string | null): Record<string, string> =>
  account ? { CLAUDE_CONFIG_DIR: accountConfigDir(account) } : {};

/** The process env with the account's dir in place of any the agent itself carries. */
const envFor = (account: string | null): Record<string, string | undefined> => {
  const { CLAUDE_CONFIG_DIR: _own, ...rest } = process.env;
  return { ...rest, ...accountEnv(account) };
};

/** What `claude auth status --json` says of one dir: signed in, how, and as whom. */
const authStatus = async (
  account: string | null
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
    env: envFor(account),
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
const kindOf = (authMethod: string | undefined): AccountKind | undefined => {
  if (!authMethod || authMethod === "none") {
    return undefined;
  }
  return authMethod === "claude.ai" ? "subscription" : "console";
};

/** Every Claude Code config dir on this machine and whether it is signed in. */
export const accountReports = (): Promise<ClaudeAccountReport[]> =>
  Promise.all(
    [null, ...accountIds()].map(async (account) => {
      const status = await authStatus(account);
      const kind = kindOf(status.authMethod);
      return {
        account,
        loggedIn: status.loggedIn,
        ...(kind ? { kind } : {}),
        ...(status.identity ? { identity: status.identity } : {}),
      };
    })
  );

/** How long a probe may take to be answered at initialize. */
const PROBE_TIMEOUT_MS = 60_000;

/**
 * One dir's initialize response, read by a session that never takes a turn:
 * its prompt is held open and yields nothing, so the CLI answers the SDK's
 * initialize and waits. Nothing it loads makes a request: no user settings,
 * no MCP servers, nothing persisted. Throws with the CLI's word when it
 * cannot answer.
 */
export const probeAccount = async (
  account: string | null
): Promise<AccountProbe> => {
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
