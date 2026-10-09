/**
 * What a workspace may read and write on the host, in one place: the policy
 * every harness judges its file tools by (`judge` and `judgeCall` in
 * `workspace-judge.ts`, kept apart because the hook runs it as a plain script),
 * in @anthropic-ai/sandbox-runtime's filesystem shape, so the boundary's srt
 * settings and macOS profile can be written from it too.
 *
 * - Reads: the whole home dir is denied, and back come the workspace's own
 *   trees (its clone, its state and scratch, the shared workspace cache, the
 *   objects dir its clone borrows), the toolchains on PATH, the user's git
 *   config, Playwright's browsers, the cawco binary, and the user layer of
 *   Claude Code (CLAUDE.md, memories, skills, plugins, agents, commands,
 *   rules, output styles, workflows, themes, plans). A Claude session also
 *   reads its own `projects/<slug>/` dir, which the judge adds from the
 *   transcript the CLI names.
 * - Writes: the clone, the scratch dir and the workspace caches only; never
 *   the clone's git config, hooks or submodule dirs, or the harness project
 *   config the host loads at the next session, outside any boundary.
 * - Every credential store (`credentialStores`) is denied for reading and
 *   writing, even inside an allowed tree.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { binaryRoot } from "./binary-installation";
import type { WorkspaceRef } from "./harness";
import {
  claudeHome,
  credentialStores,
  darwinUserDirs,
  hostPlaywrightBrowsers,
  projectClaudeDir,
  USER_LAYER_DIRS,
  USER_LAYER_FILES,
  workspaceCaches,
  workspaceScratchDir,
  workspaceStateDir,
} from "./paths";
import { type Policy, resolveReal } from "./workspace-judge";

/**
 * Harness project config in a clone: Claude Code loads the project's
 * settings (hooks), hooks, commands and agents, OpenCode its config
 * (plugins, MCP commands), both `.mcp.json`, on the host at the workspace's
 * next session.
 */
const harnessConfig = (clone: string): string[] => [
  ...[
    "settings.json",
    "settings.local.json",
    "hooks",
    "commands",
    "agents",
  ].map((name) => projectClaudeDir(clone, name)),
  ...["opencode.json", "opencode.jsonc", ".opencode", ".mcp.json"].map((name) =>
    join(clone, name)
  ),
];

/** What host git runs or reads from a clone: its config, its hooks, its submodules' git dirs. */
const GIT_CONFIG = [
  [".git", "config"],
  [".git", "hooks"],
  [".git", "modules"],
] as const;

const unique = (paths: string[]): string[] => [...new Set(paths)];

/** The objects dirs a clone borrows from its source repository (`.git/objects/info/alternates`). */
const alternatesOf = async (clone: string): Promise<string[]> =>
  (
    await readFile(
      join(clone, ".git", "objects", "info", "alternates"),
      "utf8"
    ).catch(() => "")
  )
    .split("\n")
    .filter((line) => line.startsWith("/"));

/** The toolchains on this process's PATH that live under the home dir, never the home dir itself. */
const homeToolchains = (home: string): string[] =>
  (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry.startsWith(`${home}/`));

/** The workspace's policy on this machine as it stands now, every path a real path. */
export const workspacePolicy = async (
  workspace: WorkspaceRef
): Promise<Policy> => {
  const home = homedir();
  const real = (paths: string[]): string[] => unique(paths.map(resolveReal));
  const clone = resolveReal(workspace.path);
  const scratch = resolveReal(workspaceScratchDir(workspace.id));
  const stores = real(credentialStores());
  const mac = process.platform === "darwin";
  const caches = [...workspaceCaches(), ...(await darwinUserDirs())];
  const allowRead = real([
    workspace.path,
    workspaceStateDir(workspace.id),
    ...caches,
    ...(await alternatesOf(workspace.path)),
    ...homeToolchains(home),
    join(home, ".gitconfig"),
    join(home, ".config", "git"),
    hostPlaywrightBrowsers(),
    binaryRoot(),
    ...[...USER_LAYER_DIRS, ...USER_LAYER_FILES].map((name) =>
      join(claudeHome(), name)
    ),
    ...(mac
      ? ["Developer", "Preferences", "Keychains"].map((name) =>
          join(home, "Library", name)
        )
      : []),
  ]);
  const homeReal = resolveReal(home);
  return {
    home,
    clone,
    scratch,
    denyRead: unique([homeReal, ...stores]),
    // An entry that is the home dir or a store itself would re-allow it whole
    // (srt: `allowRead` wins a tie), so it is left out. A store deeper than
    // an entry stays denied: the deeper entry decides.
    allowRead: allowRead.filter(
      (path) => path !== homeReal && !stores.includes(path)
    ),
    allowWrite: real([
      workspace.path,
      workspaceScratchDir(workspace.id),
      ...caches,
    ]),
    denyWrite: unique([
      ...real([
        ...GIT_CONFIG.map((parts) => join(workspace.path, ...parts)),
        ...harnessConfig(workspace.path),
      ]),
      ...stores,
    ]),
  };
};
