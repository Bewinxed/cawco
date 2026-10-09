import { type Dirent, existsSync, readdirSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sessiondEndpoint } from "./sessiond";

/**
 * Node-only paths shared across packages. Kept out of the main entry, which
 * the dashboard bundles for the browser.
 */

/** Where every account's stores live on a machine, one dir per account. */
export const accountsRoot = (): string => join(homedir(), ".cawco", "accounts");

/**
 * One account's Claude Code config dir on this machine: its own credential,
 * transcripts and `.claude.json`, and the fleet's user layer linked in.
 */
export const accountConfigDir = (accountId: string): string =>
  join(accountsRoot(), accountId, "claude");

/**
 * The one store of an account of any provider other than Claude's on this
 * machine: its credential in pi-ai's credential format, keyed by the
 * provider's id (`{ "<provider>": { "type": "oauth" | "api_key", … } }`),
 * owner-only, written and refreshed by the agent alone.
 */
export const accountCredentialPath = (accountId: string): string =>
  join(accountsRoot(), accountId, "credential.json");

const accountsHaving = (entry: string): string[] => {
  try {
    return readdirSync(accountsRoot(), { withFileTypes: true })
      .filter(
        (dir) =>
          dir.isDirectory() && existsSync(join(accountsRoot(), dir.name, entry))
      )
      .map((dir) => dir.name);
  } catch {
    return [];
  }
};

/** The ids of the Claude accounts that have a config dir on this machine. */
export const accountIds = (): string[] => accountsHaving("claude");

/** The ids of the provider accounts that have a credential store on this machine. */
export const credentialAccountIds = (): string[] =>
  accountsHaving("credential.json");

/** The account's dir on this machine, gone with everything in it. */
export const removeAccountRoot = (accountId: string): Promise<void> =>
  rm(join(accountsRoot(), accountId), { recursive: true, force: true });

/**
 * Every Claude Code config dir on this machine: `$CLAUDE_CONFIG_DIR`
 * (comma-separated) else `$XDG_CONFIG_HOME/claude` and `~/.claude`, and each
 * account's own dir.
 */
export const claudeConfigDirs = (): string[] => {
  const env = process.env.CLAUDE_CONFIG_DIR;
  const dirs: string[] = [];
  if (env) {
    dirs.push(
      ...env
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
  } else {
    const xdg = process.env.XDG_CONFIG_HOME;
    if (xdg) {
      dirs.push(join(xdg, "claude"));
    }
    dirs.push(join(homedir(), ".claude"));
  }
  dirs.push(...accountIds().map(accountConfigDir));
  return dirs;
};

export interface ClaudeFile {
  path: string;
  /** The path component immediately after `projects/`. */
  project: string;
}

async function walk(
  root: string,
  project: string | null,
  out: ClaudeFile[]
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return; // a projects dir that vanished mid-walk is not an error
  }
  for (const entry of entries) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      // biome-ignore lint/performance/noAwaitInLoops: recursive walk; siblings push into the same shared `out` array in a stable, reproducible order
      await walk(full, project ?? entry.name, out);
    } else if (entry.name.endsWith(".jsonl")) {
      out.push({ path: full, project: project ?? "unknown" });
    }
  }
}

/** Every `*.jsonl` under each Claude config dir's `projects/`, with its project name. */
export const listClaudeFiles = async (): Promise<ClaudeFile[]> => {
  const files: ClaudeFile[] = [];
  for (const dir of claudeConfigDirs()) {
    // biome-ignore lint/performance/noAwaitInLoops: each config dir walks into the same shared `files` array in a stable, reproducible order
    await walk(join(dir, "projects"), null, files);
  }
  return files;
};

/** The agent's transcript search index. */
export const transcriptIndexPath = (): string =>
  join(
    process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
    "cawco",
    "transcript-index.db"
  );

/** Private host-side material, beneath the directory Linux boundaries already mask. */
export const sessionIdentityDir = (): string =>
  join(
    dirname(process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()),
    "session-identity"
  );
