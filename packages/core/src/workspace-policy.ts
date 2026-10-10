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
 *   objects dir its clone borrows), the toolchains on PATH and the Node
 *   package trees their commands link into (`homeToolchains`), the user's git
 *   config, Playwright's browsers, the cawco binary, and the user layer of
 *   Claude Code (CLAUDE.md, memories, skills, plugins, agents, commands,
 *   rules, output styles, workflows, themes, plans). A Claude session also
 *   reads its own `projects/<slug>/` dir, which the judge adds from the
 *   transcript the CLI names.
 * - Writes: the clone, the scratch dir and the workspace caches only; never
 *   the clone's git config, hooks or submodule dirs, or the harness project
 *   config the host loads at the next session, outside any boundary
 *   ({@link cloneDenies}).
 * - Every credential store (`credentialStores`) is denied for reading and
 *   writing, even inside an allowed tree. On Linux so are the host's runtime
 *   dirs, with every daemon's socket, and the journal.
 */
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
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
import { type Policy, resolveDenied, resolveReal } from "./workspace-judge";

/**
 * What stands in for a clone-side deny path its clone does not have, before
 * the sandbox starts: an empty directory, or a file holding the empty config
 * its reader takes as nothing set; `none` for one that is never made (a
 * clone without `.git/config` is no clone).
 */
export type CloneDenyEmpty =
  /** `readOnly`: made with no write bits, so no host tool fills it. */
  | { readonly kind: "dir"; readonly readOnly?: true }
  | { readonly kind: "file"; readonly text: string }
  | { readonly kind: "none" };

/** One path in a clone no workspace writes, and what stands in for it while the clone has none. */
export interface CloneDeny {
  readonly empty: CloneDenyEmpty;
  readonly path: string;
  /**
   * Denied by srt itself at the clone's root, whatever the policy says (its
   * mandatory names), rather than by the policy: given a stand-in and
   * guarded like the rest, never added to the policy's write denies.
   */
  readonly srt?: true;
}

const DIR = { kind: "dir" } as const;
const EMPTY_JSON = { kind: "file", text: "{}\n" } as const;
const EMPTY = { kind: "file", text: "" } as const;

/**
 * OpenCode's empty config: its schema alone. OpenCode writes `$schema` into a
 * config file that has none ("if (!data.$schema) { … fs.writeFileString(
 * options.path, updated)", `loadConfig` in packages/opencode/src/config/
 * config.ts at v1.18.34), so a `{}` stand-in is written over on the host.
 */
const OPENCODE_EMPTY = {
  kind: "file",
  text: '{"$schema":"https://opencode.ai/config.json"}\n',
} as const;

/**
 * OpenCode's config dir, empty and read-only. OpenCode writes a `.gitignore`
 * into each `.opencode` dir it loads and installs `@opencode-ai/plugin` there
 * (`ensureGitignore`, `npm.install` in the same file); without write bits
 * both fail quietly (the first catches PermissionDenied, the second is a
 * background fork that logs a warning), and the clone loads as one without
 * `.opencode` does (OpenCode 1.18.34: `/config` and `/agent` the same).
 */
const OPENCODE_DIR = { kind: "dir", readOnly: true } as const;

/**
 * srt's own mandatory deny names at its working directory, the clone, that
 * the policy does not name already (`DANGEROUS_FILES` and
 * `getDangerousDirectories()` in sandbox-utils.js at 0.0.79; `.mcp.json`,
 * `.claude/commands` and `.claude/agents` are the policy's too). An empty
 * file is what each of these files' readers takes as nothing set (git an
 * empty `.gitmodules` as no submodules).
 */
const SRT_FILES = [
  ".gitconfig",
  ".gitmodules",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".profile",
  ".ripgreprc",
];
const SRT_DIRS = [".vscode", ".idea"];

/**
 * Every path in a clone the workspace's policy denies writing, and srt's own
 * mandatory names at its root ({@link SRT_FILES}, {@link SRT_DIRS}), each
 * with its stand-in. What host git runs or reads from a clone: its config, its
 * hooks, its submodules' git dirs. And the harness project config the host
 * loads at the workspace's next session, outside any boundary: Claude Code's
 * project settings (hooks), hooks, commands and agents, OpenCode's config
 * (plugins, MCP commands), both `.mcp.json`.
 *
 * Linux: srt binds `/dev/null` over a deny path that does not exist, and
 * bwrap leaves a read-only empty file on the host at it for the sandbox's
 * whole life (an empty directory at a missing parent). A host harness then
 * reads that file as its config: OpenCode answered every request for such a
 * clone with ENOTDIR on `.opencode/opencode.json` (2026-10-10). A path that
 * exists is bound onto itself, which leaves nothing (srt #139: "Denied paths
 * that already exist are handled separately via --ro-bind, create no
 * artifact"), so the boundary's host makes each stand-in before every
 * sandbox it starts (`boundary-host.ts`).
 */
export const cloneDenies = (clone: string): readonly CloneDeny[] => [
  { path: join(clone, ".git", "config"), empty: { kind: "none" } },
  { path: join(clone, ".git", "hooks"), empty: DIR },
  { path: join(clone, ".git", "modules"), empty: DIR },
  { path: projectClaudeDir(clone, "settings.json"), empty: EMPTY_JSON },
  { path: projectClaudeDir(clone, "settings.local.json"), empty: EMPTY_JSON },
  ...["hooks", "commands", "agents"].map((name) => ({
    path: projectClaudeDir(clone, name),
    empty: DIR,
  })),
  { path: join(clone, "opencode.json"), empty: OPENCODE_EMPTY },
  { path: join(clone, "opencode.jsonc"), empty: OPENCODE_EMPTY },
  { path: join(clone, ".opencode"), empty: OPENCODE_DIR },
  {
    path: join(clone, ".mcp.json"),
    empty: { kind: "file", text: '{"mcpServers":{}}\n' },
  },
  ...SRT_FILES.map((name) => ({
    path: join(clone, name),
    empty: EMPTY,
    srt: true as const,
  })),
  ...SRT_DIRS.map((name) => ({
    path: join(clone, name),
    empty: DIR,
    srt: true as const,
  })),
];

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

const NODE_MODULES = "/node_modules";

/**
 * The toolchains on this process's PATH that live under the home dir, never
 * the home dir itself, and the Node package trees their commands link into:
 * a global npm or bun install puts each command in a PATH dir as a link into
 * a `node_modules` tree elsewhere under home (`~/.bun/bin/node-gyp` to
 * `~/node_modules/node-gyp/bin/node-gyp.js`), and the package needs its
 * dependencies beside it. Seatbelt judges a link by where it lands, so
 * without the tree the command is refused (EPERM) wherever it runs from, a
 * native dependency's `node-gyp` among them. A tree in a git work tree is a
 * clone's, never a toolchain.
 */
const homeToolchains = async (home: string): Promise<string[]> => {
  const dirs = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry.startsWith(`${home}/`));
  const landings = await Promise.all(
    dirs.map(async (dir) => {
      const names = await readdir(dir).catch(() => []);
      return Promise.all(
        names.map((name) => realpath(join(dir, name)).catch(() => ""))
      );
    })
  );
  // The outermost `node_modules` a command lands in: its packages resolve
  // their dependencies up to it.
  const trees = unique(
    landings.flat().flatMap((path) => {
      const at = path.indexOf(`${NODE_MODULES}/`);
      return path.startsWith(`${home}/`) && at >= 0
        ? [path.slice(0, at + NODE_MODULES.length)]
        : [];
    })
  );
  const outsideClones = await Promise.all(
    trees.map(async (tree) =>
      (await stat(join(dirname(tree), ".git")).then(
        () => true,
        () => false
      ))
        ? []
        : [tree]
    )
  );
  return [...dirs, ...outsideClones.flat()];
};

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
  // Paths that only go into a deny rule: one this process may not look up is
  // denied as written (`resolveDenied`).
  const denied = (paths: string[]): string[] =>
    unique(paths.map(resolveDenied));
  const clone = resolveReal(workspace.path);
  const scratch = resolveReal(workspaceScratchDir(workspace.id));
  const stores = denied(credentialStores());
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
    ...(await homeToolchains(home)),
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
    resolveDenied(home),
    ...stores,
    ...(mac ? [] : denied(LINUX_HOST_PRIVATE)),
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
      ...denied(
        cloneDenies(workspace.path)
          .filter((deny) => !deny.srt)
          .map(({ path }) => path)
      ),
      ...stores,
    ]),
  };
};
