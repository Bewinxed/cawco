import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sessiondEndpoint } from "./sessiond";

/**
 * Node-only paths shared across packages. Kept out of the main entry, which
 * the dashboard bundles for the browser.
 */

/** `$CLAUDE_CONFIG_DIR` (comma-separated) else `$XDG_CONFIG_HOME/claude` and `~/.claude`. */
export const claudeConfigDirs = (): string[] => {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const dirs: string[] = [];
  const xdg = process.env.XDG_CONFIG_HOME;
  if (xdg) {
    dirs.push(join(xdg, "claude"));
  }
  dirs.push(join(homedir(), ".claude"));
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
