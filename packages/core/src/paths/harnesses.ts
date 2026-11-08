/** Where pi and OpenCode keep their dirs on this machine. */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sessionIdentityDir, xdgDataHome } from "./cawco";

/**
 * pi's agent dir: its login, its settings, and what the fleet writes for it.
 * pi's own rule (`getAgentDir` in @earendil-works/pi-coding-agent 1.0.1,
 * dist/config.js: `const envDir = process.env[ENV_AGENT_DIR]; if (envDir) {
 * return expandTildePath(envDir); } return join(homedir(), CONFIG_DIR_NAME,
 * "agent");`, `ENV_AGENT_DIR` being `PI_CODING_AGENT_DIR` and
 * `CONFIG_DIR_NAME` `.pi`), its tilde and `file://` expansion as its
 * `normalizePath` (dist/utils/paths.js) does it: core does not load pi, and
 * pi's sessions, the fleet's writes for it, its credential store and every
 * workspace's view of them all follow this one dir.
 */
export const piAgentDir = (): string => {
  const named = process.env.PI_CODING_AGENT_DIR;
  if (!named) {
    return join(homedir(), ".pi", "agent");
  }
  if (named === "~") {
    return homedir();
  }
  if (named.startsWith("~/")) {
    return join(homedir(), named.slice(2));
  }
  return named.startsWith("file://") ? fileURLToPath(named) : named;
};

/** The fleet's skills for pi. */
export const piSkillsDir = (): string => join(piAgentDir(), "skills");

/** The fleet's memory document for pi. */
export const piMemoryFile = (): string => join(piAgentDir(), "AGENTS.md");

/**
 * The machine's own OpenCode data dir, `$XDG_DATA_HOME/opencode`: the
 * machine's OpenCode server's database (`opencode.db`, where the owner's own
 * sign-ins are kept too) and the snapshot dir every server's undo history
 * lives in.
 */
export const opencodeDataDir = (): string => join(xdgDataHome(), "opencode");

/**
 * The data home (`XDG_DATA_HOME`) of an account's own OpenCode server: 2.0
 * keeps its database there (`<data>/opencode/opencode.db`), so this server's
 * sessions and its one credential are this account's and nothing else's.
 * Beside the session credentials, hidden as they are from every workspace
 * boundary.
 */
export const opencodeAccountHome = (accountId: string): string =>
  join(sessionIdentityDir(), "opencode-accounts", accountId);

/**
 * Where the data homes of OpenCode servers that workspaces' Linux views run
 * are (agent opencode.ts): one folder per workspace, outside its state dir,
 * so a workspace retired and cut again reopens its sessions.
 */
export const opencodeViewsDir = (): string =>
  join(homedir(), ".cawco", "opencode-views");

/**
 * The data home of the OpenCode server workspace `workspace`'s Linux view
 * runs for sessions on `account` (none: the machine's own sign-ins): its own
 * database, its sessions the view's.
 */
export const opencodeViewHome = (workspace: string, account?: string): string =>
  join(
    opencodeViewsDir(),
    workspace,
    account === undefined ? "home" : join("accounts", account)
  );

/** Every view's server's data home on the machine ({@link opencodeViewHome}). */
const opencodeViewHomes = (): string[] => {
  const root = opencodeViewsDir();
  const views = existsSync(root) ? readdirSync(root) : [];
  return views.flatMap((workspace) => {
    const accounts = join(root, workspace, "accounts");
    return [
      opencodeViewHome(workspace),
      ...(existsSync(accounts) ? readdirSync(accounts) : []).map((account) =>
        opencodeViewHome(workspace, account)
      ),
    ];
  });
};

/** Every OpenCode database on the machine: the machine server's, each account server's, then each view's server's. */
export const opencodeDatabases = (): string[] => {
  const accounts = join(sessionIdentityDir(), "opencode-accounts");
  const homes = existsSync(accounts) ? readdirSync(accounts) : [];
  return [
    join(opencodeDataDir(), "opencode.db"),
    ...homes.map((account) =>
      join(opencodeAccountHome(account), "opencode", "opencode.db")
    ),
    ...opencodeViewHomes().map((home) => join(home, "opencode", "opencode.db")),
  ].filter((path) => existsSync(path));
};
