/** Where pi and OpenCode keep their dirs on this machine. */

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessKind } from "../harness/kinds";
import { cawcoDataDir, xdgDataHome } from "./roots";

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

/**
 * pi's own skills dir, where earlier versions wrote the fleet's skills for
 * pi. Read only by the cleanup that takes them back out (agent
 * fleet-common.ts `dropHarnessUserLayer`).
 */
export const piSkillsDir = (): string => join(piAgentDir(), "skills");

/**
 * pi's own global context file, where earlier versions wrote the fleet's
 * memory. Read only by that cleanup.
 */
export const piMemoryFile = (): string => join(piAgentDir(), "AGENTS.md");

/**
 * The fleet's skills for pi: one `<name>/SKILL.md` dir each, handed to every
 * pi session CawCo starts through its resource loader's
 * `additionalSkillPaths` (pi's `--skill <path>`, "Loads a skill file or
 * directory", docs/cli.md). CawCo's own, under its data dir: the person's
 * own `pi` never reads it.
 */
export const piFleetSkillsDir = (): string => join(piFleetRoot(), "skills");

/** What the fleet sync writes for pi: its skills, and the tree store their links land in. */
export const piFleetRoot = (): string => join(cawcoDataDir(), "fleet-pi");

/**
 * The machine's own OpenCode data dir, `$XDG_DATA_HOME/opencode`: the
 * machine's OpenCode server's database (`opencode.db`, where the owner's own
 * sign-ins are kept too) and the snapshot dir every server's undo history
 * lives in.
 */
export const opencodeDataDir = (): string => join(xdgDataHome(), "opencode");

/**
 * The one root of every harness store CawCo keeps for itself: what a harness
 * server writes into a data home CawCo gives it (a database, conversations,
 * settings, a session index), which must outlive a reboot. On disk, under
 * CawCo's data dir, never under the runtime dir: `$XDG_RUNTIME_DIR`, and
 * paths/cawco.ts `sessionIdentityDir` in it, is a tmpfs that every reboot
 * empties, and the reboot of 2026-11-11 took 32 OpenCode sessions with the
 * account databases kept there. The runtime dir holds only what may vanish: sockets
 * and credentials that are short-lived. Owner-only, as every folder in the
 * data dir is (core folders.ts), and hidden from every workspace boundary in
 * its own right (host-policy.ts `credentialStores`), as the session
 * credentials' dir is.
 */
export const harnessStoresDir = (): string =>
  join(cawcoDataDir(), "harness-stores");

/** Where every account's OpenCode server keeps its data home, one dir per account ({@link opencodeAccountHome}). */
const opencodeAccountsDir = (): string =>
  join(harnessStoresDir(), "opencode-accounts");

/**
 * CawCo's own records about one harness on this machine: what the fleet
 * sync last wrote for it (its sidecar), and, for OpenCode, the agent's
 * bookkeeping of its sessions and servers. No harness reads them; the agent
 * alone does. Under CawCo's data dir, never in the person's own agent config
 * dirs, where earlier versions kept them (agent harness-records-move.ts
 * moves each once, as the agent starts).
 */
export const harnessRecordsDir = (harness: HarnessKind): string =>
  join(cawcoDataDir(), "harness-records", harness);

/**
 * One of the agent's OpenCode records, by its name: `fleet.json` (the fleet
 * sync's sidecar), `fleet-mcp.json`, `tags.json`, `session-homes.json`,
 * `open-turns.json`, `background.json`, `account-catalogs.json`,
 * `server-facts.json`, `sign-in-faults.json`, `placed-mcp.revision` and
 * `placed-mcp.seen.json`. Earlier versions kept each in OpenCode's global
 * config dir as `cawco-<name>`.
 */
export const opencodeRecordFile = (name: string): string =>
  join(harnessRecordsDir("opencode"), name);

/**
 * What the fleet sync manages for pi, by what it last wrote (agent
 * pi-services.ts `PI_SIDECAR`). Earlier versions kept it in
 * {@link piAgentDir} as `cawco-fleet.json`.
 */
export const piFleetSidecarFile = (): string =>
  join(harnessRecordsDir("pi"), "fleet.json");

/**
 * The data home (`XDG_DATA_HOME`) of an account's own OpenCode server: 2.0
 * keeps its database there (`<data>/opencode/opencode.db`), so this server's
 * sessions and its one credential are this account's and nothing else's.
 * A store that must last, so in {@link harnessStoresDir}.
 */
export const opencodeAccountHome = (accountId: string): string =>
  join(opencodeAccountsDir(), accountId);

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
  const accounts = opencodeAccountsDir();
  const homes = existsSync(accounts) ? readdirSync(accounts) : [];
  return [
    join(opencodeDataDir(), "opencode.db"),
    ...homes.map((account) =>
      join(opencodeAccountHome(account), "opencode", "opencode.db")
    ),
    ...opencodeViewHomes().map((home) => join(home, "opencode", "opencode.db")),
  ].filter((path) => existsSync(path));
};

/**
 * One account's Codex home (`CODEX_HOME`): its own sign-in (`auth.json`,
 * which Codex itself writes and CawCo never reads), CawCo's `config.toml`
 * and `environments.toml`, and links to the machine's thread store
 * ({@link codexStoreDir}) and the fleet's skills and rules. Beside the
 * account's other stores (the accounts root of paths/claude.ts, named here
 * without importing it: that module imports this one), which no workspace
 * reads.
 */
export const codexAccountHome = (accountId: string): string =>
  join(homedir(), ".cawco", "accounts", accountId, "codex");

/**
 * Every Codex home's one thread store on this machine: `sessions/` (its
 * rollout files) and `db/` (its SQLite stores, `sqlite_home`), so a thread
 * one account began resumes on another (the owner's pick "Move only to an
 * API key", 2026-11-17) and one listing reads every account's.
 */
export const codexStoreDir = (): string => join(cawcoDataDir(), "codex-store");

/** What the fleet sync writes for Codex (skills, rules), linked into every account's home. */
export const codexFleetRoot = (): string => join(cawcoDataDir(), "fleet-codex");

/** What the fleet sync writes for Antigravity, linked into every account's agy home (tsk-340 item 9). */
export const agyFleetRoot = (): string => join(cawcoDataDir(), "fleet-agy");

/**
 * One Antigravity account's agy home (`agy acp --gemini-dir`): its
 * `config/hooks.json` (CawCo's one hook), and its app-data dir
 * ({@link AGY_APP_DATA}) with its settings, its sign-in when agy keeps one
 * in a file, and its conversations. Beside the account's other stores, which
 * no workspace reads. The owner's own `~/.gemini` is never read or written.
 */
export const agyAccountHome = (accountId: string): string =>
  join(homedir(), ".cawco", "accounts", accountId, "agy");

/**
 * The app-data dir every session of an account's agy home shares, by its
 * name in the home (`agy acp --app-data-dir`, which takes a relative name
 * alone). One per account, as T3 Code keeps one per profile: agy keeps a
 * file sign-in in it ({@link agySignInFile}), which a session in a dir of
 * its own would not find.
 */
export const AGY_APP_DATA = "cawco";

/**
 * Where agy keeps an account's Google sign-in: a file in its home's app-data
 * dir, as every launch's `AGY_CLI_FORCE_FILE_TOKEN_STORAGE` has it (agy
 * 1.5.18 `composite_token_storage.go`, the project's
 * `assets/22523e77/REPORT.md`). CawCo looks only at whether it is there,
 * never at what it holds.
 */
export const agySignInFile = (accountId: string): string =>
  join(agyAccountHome(accountId), AGY_APP_DATA, AGY_SIGN_IN_FILE);

/** The sign-in file's name in an agy home's app-data dir ({@link agySignInFile}). */
export const AGY_SIGN_IN_FILE = "antigravity-oauth-token";

/**
 * What one Antigravity account signs in with on this machine: its method,
 * and the Google Cloud project and location the method takes, never a key
 * (a key is the account's `credential.json`'s, paths/claude.ts
 * `accountCredentialPath`). Beside the account's agy home, outside it, so
 * agy never reads it.
 */
export const agyAccountRecord = (accountId: string): string =>
  join(homedir(), ".cawco", "accounts", accountId, "antigravity.json");
