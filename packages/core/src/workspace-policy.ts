/**
 * What a workspace may read and write on the host, in one place: the policy
 * every harness judges its file tools by (`judge` and `judgeCall` in
 * `workspace-judge.ts`, kept apart because the hook runs it as a plain script),
 * in @anthropic-ai/sandbox-runtime's filesystem shape, so the boundary's srt
 * settings and macOS profile are written from it too (`boundary-policy.ts`):
 * shell commands, file tools and both OSes answer to this one policy.
 *
 * - Reads: the whole home dir is denied, and back come the workspace's own
 *   trees (its clone, its state dir's read-only part and its scratch dir, the
 *   shared workspace cache, the
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
 *   writing, even inside an allowed tree. On Linux so are the host's runtime
 *   dirs, with every daemon's socket, and the journal.
 */
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
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
  workspaceReadOnlyDir,
  workspaceScratchDir,
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

/**
 * The objects dirs a clone borrows from (`.git/objects/info/alternates`), and
 * every one those borrow from in turn: git reads each borrowed dir's own
 * alternates too, so a clone of a clone needs the whole chain. A relative
 * entry is relative to the objects dir that names it (gitrepository-layout).
 */
const alternatesOf = async (clone: string): Promise<string[]> => {
  const found: string[] = [];
  const pending = [join(clone, ".git", "objects")];
  for (let objects = pending.shift(); objects; objects = pending.shift()) {
    // biome-ignore lint/performance/noAwaitInLoops: a chain of one or two borrowed dirs, each named by the one before
    const listed = await readFile(
      join(objects, "info", "alternates"),
      "utf8"
    ).catch(() => "");
    for (const line of listed.split("\n").map((each) => each.trim())) {
      if (!line || line.startsWith("#")) {
        continue;
      }
      const borrowed = isAbsolute(line) ? line : resolve(objects, line);
      if (!found.includes(borrowed)) {
        found.push(borrowed);
        pending.push(borrowed);
      }
    }
  }
  return found;
};

/** The toolchains on this process's PATH that live under the home dir, never the home dir itself. */
const homeToolchains = (home: string): string[] =>
  (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry.startsWith(`${home}/`));

/**
 * Linux: what the host keeps outside the home dir that no workspace reads.
 * `/run` and `/var/run` hold every host daemon's socket (the system bus,
 * tailscaled, snapd, sshd's local socket, the user's bus and sessiond under
 * `/run/user`): srt's seccomp layer, which would refuse every unix socket,
 * cannot start under Ubuntu's `bwrap-userns-restrict` AppArmor profile (srt
 * #429), so hiding them by path is the control (artifacts/srt-eval/REPORT.md
 * §5b). The logs hold what services print, a crashed hub's tokens among it:
 * the journal, and rsyslog's copies of it in `/var/log` (`syslog`,
 * `auth.log`), which the `adm` group reads. Crash reports and core dumps hold
 * a crashed process's memory, a browser's cookies among it. `journalctl` and
 * `coredumpctl` do not run: with nothing to read they would still report
 * success, as if a workspace could read the journal and found it empty.
 */
const LINUX_HOST_PRIVATE = [
  "/run",
  "/var/run",
  "/var/log",
  "/var/crash",
  "/var/lib/apport",
  "/var/lib/systemd/coredump",
  "/usr/bin/journalctl",
  "/usr/bin/coredumpctl",
];

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
    // Its state dir's read-only part and its scratch dir, side by side: the
    // state dir itself (its hook, executor, policy, boundary record) is the
    // host's.
    workspaceReadOnlyDir(workspace.id),
    workspaceScratchDir(workspace.id),
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
  const denyRead = unique([
    resolveReal(home),
    ...stores,
    ...(mac ? [] : real(LINUX_HOST_PRIVATE)),
  ]);
  return {
    home,
    clone,
    scratch,
    denyRead,
    // An entry that is a deny entry itself would re-allow it whole (srt:
    // `allowRead` wins a tie; the judge: a tie denies), so it is left out, and
    // srt and the judge agree on every path. A store deeper than an entry
    // stays denied: the deeper entry decides.
    allowRead: allowRead.filter((path) => !denyRead.includes(path)),
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
