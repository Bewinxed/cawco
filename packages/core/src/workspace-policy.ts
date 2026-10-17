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
 *   objects dir its clone borrows), the toolchains on PATH and the tool
 *   trees their commands link into (`homeToolchains`), the user's git
 *   config, the host tool caches skills run binaries from
 *   (`hostToolCaches`: Playwright's browsers, impeccable's engines), the
 *   cawco binary, on macOS the selected
 *   Xcode bundle (`darwinDeveloperBundle`), and the user layer of
 *   Claude Code (CLAUDE.md, memories, skills, plugins, agents, commands,
 *   rules, output styles, workflows, themes, plans), also by its names in
 *   the config dir of each account the workspace's sessions run on
 *   (`accountLayers`), and what the fleet sync writes for every harness
 *   (`fleetSyncedPaths`). On the hub's machine, its project's folder there
 *   (`projectFolder`). Each session's own folder of saved tool results, the
 *   one its harness tells the model to read (`spillDirs`). A Claude session's
 *   file tools also read its own `projects/<slug>/` dir, which the judge adds
 *   from the transcript the CLI names.
 * - Writes: the clone, the scratch dir and the workspace caches only; never
 *   the clone's git config, hooks or submodule dirs, or the harness project
 *   config the host loads at the next session, outside any boundary
 *   ({@link cloneDenies}).
 * - Every credential store (`credentialStores`) is denied for reading and
 *   writing, even inside an allowed tree. On Linux so are the host's runtime
 *   dirs, with every daemon's socket, and the journal.
 */
import { execFile } from "node:child_process";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  resolve,
} from "node:path";
import { binaryRoot } from "./binary-installation";
import type { WorkspaceRef } from "./harness";
import {
  accountConfigDir,
  claudeConfigDirs,
  claudeHome,
  credentialStores,
  darwinDeveloperBundle,
  darwinUserDirs,
  fleetSyncedPaths,
  hostToolCaches,
  hubProjectsDir,
  isSecretFileName,
  placedSyncedPaths,
  projectClaudeDir,
  USER_LAYER_DIRS,
  USER_LAYER_FILES,
  userGitConfigDir,
  workspaceAccountsFile,
  workspaceCaches,
  workspaceDoorDir,
  workspaceProjectFile,
  workspaceReadOnlyDir,
  workspaceScratchDir,
  workspaceSpillDir,
  workspaceSpillsFile,
  xdgDataHome,
} from "./paths";
import { DamagedRecord, readRecord } from "./state-file";
import {
  type Policy,
  PROTECTED_NAMES,
  PROTECTED_UNDER,
  resolveDenied,
  resolveReal,
} from "./workspace-judge";

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
 * (plugins, MCP commands), both `.mcp.json`; and the project skills, where
 * the fleet places a project's skills with the store their links land in
 * (core paths.ts `placedSyncedPaths`). On Linux a link in a dir the
 * sandbox writes can be swapped for another, so the whole skills dir is held,
 * as `commands` and `agents` are.
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
  // The skills the fleet places in the clone, and the store their links
  // land in: a fleet skill, never the delegate's to change.
  ...placedSyncedPaths(clone).map((path) => ({ path, empty: DIR })),
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

/**
 * A project lead's place (Caw's): the workspace id the hub gives the
 * boundary of the folder Caw starts in (hub `leadPlaceRef`), never a
 * delegate's. It is a person's own folder, not a disposable clone, so its
 * boundary never writes into it (no stand-ins, no copied inodes, no exclude
 * lines): its policy denies what is there ({@link workspaceDenies},
 * {@link ownerOnlyIn}, {@link linkedIn}), its judge refuses protected config
 * by name (`protectConfig`), and its guard checks each command
 * (boundary.ts `PLACE_GUARD`).
 */
export const LEAD_PLACE_SUFFIX = "-caw";
export const isLeadPlace = (id: string): boolean =>
  id.endsWith(LEAD_PLACE_SUFFIX);

/** The most `find` writes about a place: every path it names, NUL-separated. */
const FIND_OUTPUT_MAX = 64 * 1024 * 1024;

/**
 * The paths `find root -mindepth 1 <expression>` prints with `-print0`, over
 * the whole place: `find` reads a tree of hundreds of thousands of entries in
 * a second. It exits 1 when a dir under the place is not the owner's to
 * read, which nothing in the boundary reads either; any other failure
 * refuses the boundary, saying `what` could not be found.
 */
const findIn = (
  root: string,
  expression: readonly string[],
  what: string
): Promise<string[]> =>
  new Promise((done, fail) => {
    execFile(
      "find",
      [root, "-mindepth", "1", ...expression],
      { encoding: "utf8", maxBuffer: FIND_OUTPUT_MAX },
      (error, out) => {
        if (error && error.code !== 1) {
          fail(
            new Error(
              `${what} in ${root} could not be found: ${error.message}`,
              {
                cause: error,
              }
            )
          );
          return;
        }
        done(out.split("\0").filter(Boolean));
      }
    );
  });

/** `find`'s test for an entry that is a dir or a file of its own: never a link. */
const DIR_OR_FILE = ["(", "-type", "d", "-o", "-type", "f", ")"];

/**
 * The protected config a lead's place has now, anywhere in it but installed
 * dependencies ({@link PROTECTED_NAMES}, {@link PROTECTED_UNDER}): each a dir
 * or file of its own, which srt binds onto itself and so leaves nothing on
 * the host. One that is absent is never denied to srt, which would make its
 * mount point in the person's folder.
 */
const protectedIn = async (root: string): Promise<string[]> => {
  const found = await foundProtected(root);
  const made = await Promise.all(
    found.map((path) => standInAsMade(root, path))
  );
  return found.filter((_, at) => !made[at]);
};

/**
 * Whether `path` is still exactly a stand-in an earlier build made in a
 * lead's place (an empty dir, or a file holding a stand-in's text): left
 * unbound so the agent can take it away (stand-ins.ts `removeStandIns`); the
 * place's guard still sees every change to it.
 */
const standInAsMade = async (root: string, path: string): Promise<boolean> => {
  const texts = new Set(
    cloneDenies(root).flatMap(({ empty }) =>
      empty.kind === "file" ? [empty.text] : []
    )
  );
  const found = await stat(path).catch(() => undefined);
  if (found?.isDirectory()) {
    return (await readdir(path).catch(() => ["?"])).length === 0;
  }
  return (
    found?.isFile() === true &&
    texts.has(await readFile(path, "utf8").catch(() => "\0"))
  );
};

const foundProtected = (root: string): Promise<string[]> =>
  findIn(
    root,
    [
      "-name",
      "node_modules",
      "-prune",
      "-o",
      "(",
      ...PROTECTED_NAMES.flatMap((name, at) => [
        ...(at > 0 ? ["-o"] : []),
        "-name",
        name,
      ]),
      ...Object.entries(PROTECTED_UNDER).flatMap(([dir, names]) =>
        names.flatMap((name) => ["-o", "-path", `*/${dir}/${name}`])
      ),
      ")",
      ...DIR_OR_FILE,
      "-print0",
      "-prune",
    ],
    "the protected config"
  );

/**
 * The clone-side denies a workspace's boundary keeps ({@link cloneDenies}).
 * A lead's place keeps only the protected config it has
 * ({@link protectedIn}), each with nothing to stand in for it: a person's own
 * folder is never written into.
 */
export const workspaceDenies = async (
  workspace: WorkspaceRef
): Promise<readonly CloneDeny[]> => {
  const clone = resolveReal(workspace.path);
  if (!isLeadPlace(workspace.id)) {
    return cloneDenies(clone);
  }
  return (await protectedIn(clone)).map((path) => ({
    path,
    empty: { kind: "none" },
  }));
};

/**
 * `find`'s test for a mode with no group or other bit: GNU find's `/077`
 * (any of them set), BSD find's (macOS) `+077`, negated.
 */
const ANY_GROUP_OR_OTHER_BIT = process.platform === "darwin" ? "+077" : "/077";

/**
 * Every entry under `root` (never `root` itself) that only its owner may
 * read: a dir or file whose mode has no group or other bits (a 0700 dir, a
 * 0600 file), as a tool keeps its own data (x-use's accounts and cookies).
 * Not walked into, and nothing under a link; git's own dirs and installed
 * dependencies (`.git`, `node_modules`) are not looked in. A lead's place
 * hides each from his shell and file tools; an MCP server the owner runs
 * reaches its own data on its own.
 */
export const ownerOnlyIn = (root: string): Promise<string[]> =>
  findIn(
    root,
    [
      "(",
      "-name",
      ".git",
      "-o",
      "-name",
      "node_modules",
      ")",
      "-prune",
      "-o",
      ...DIR_OR_FILE,
      "!",
      "-perm",
      ANY_GROUP_OR_OTHER_BIT,
      "-print0",
      "-prune",
    ],
    "the files only their owner may read"
  );

/**
 * What in a lead's place shares its inodes with files elsewhere: each
 * installed dependencies dir (bun installs by hardlinking from its cache),
 * and every other file with more than one link. A clone's are copied apart
 * but those linked to the workspaces' own bun cache (boundary.ts
 * `ownInodes`); a person's own folder is never rewritten, so
 * these are only denied for writing: a write through one would change a file
 * the host runs.
 */
export const linkedIn = (root: string): Promise<string[]> =>
  findIn(
    root,
    [
      "-xdev",
      "(",
      "-name",
      "node_modules",
      "-type",
      "d",
      "-print0",
      "-prune",
      ")",
      "-o",
      "(",
      "-type",
      "f",
      "-links",
      "+1",
      "-print0",
      ")",
    ],
    "the files that share their inodes"
  );

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

const within = (path: string, root: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/** A script's `#!` line, up to its interpreter's absolute path. */
const SHEBANG = /^#![ \t]*(\/[^\s]+)/;
/** How much of a command {@link interpreterOf} reads for its `#!` line. */
const SHEBANG_BYTES = 512;

/** The interpreter `path` names on its `#!` line by an absolute path, as a real path; none for a binary or `#!/usr/bin/env`. */
const interpreterOf = async (path: string): Promise<string | undefined> => {
  const file = await open(path, "r").catch(() => undefined);
  if (!file) {
    return;
  }
  try {
    const head = Buffer.alloc(SHEBANG_BYTES);
    const { bytesRead } = await file.read(head, 0, SHEBANG_BYTES, 0);
    const named = SHEBANG.exec(head.subarray(0, bytesRead).toString("latin1"));
    return named?.[1]
      ? await realpath(named[1]).catch(() => undefined)
      : undefined;
  } catch {
    // A directory, or a file this process may not read: no interpreter.
  } finally {
    await file.close();
  }
};

/**
 * The dirs under home where each dir directly below is one tool's own tree:
 * the XDG data dir (`~/.local/share/uv`, `~/.local/share/claude`), `~/.local`
 * (`~/.local/pipx`) and, on macOS, Application Support. Deepest first, so a
 * landing is judged by the deepest one that holds it.
 */
const toolRoots = (home: string): string[] =>
  unique([
    xdgDataHome(),
    join(home, ".local", "share"),
    join(home, ".local"),
    join(home, "Library", "Application Support"),
  ]).sort((a, b) => b.length - a.length);

/**
 * The tool tree a command landing at `landing` runs from: the outermost
 * `node_modules` it lies in (its packages resolve their dependencies up to
 * it); else the dir right below the deepest {@link toolRoots} entry that
 * holds it, never a root itself or `~/.local/state`, where shells keep their
 * histories; else, for a landing elsewhere under home, the dir right below
 * home when that dir is a Python virtual environment (`pyvenv.cfg`). Anything
 * else under home is the owner's own files or a harness's state, never a
 * tool's.
 */
const toolTreeOf = async (
  landing: string,
  home: string,
  roots: readonly string[]
): Promise<string | undefined> => {
  const at = landing.indexOf(`${NODE_MODULES}/`);
  if (at >= 0) {
    return landing.slice(0, at + NODE_MODULES.length);
  }
  const root = roots.find((dir) => landing.startsWith(`${dir}/`));
  if (root) {
    const tree = join(root, landing.slice(root.length + 1).split("/")[0] ?? "");
    return roots.includes(tree) || tree === join(home, ".local", "state")
      ? undefined
      : tree;
  }
  const top = join(home, landing.slice(home.length + 1).split("/")[0] ?? "");
  return top !== landing &&
    (await stat(join(top, "pyvenv.cfg")).then(
      () => true,
      () => false
    ))
    ? top
    : undefined;
};

/**
 * The toolchains on this process's PATH that live under the home dir, never
 * the home dir itself, and the tool trees under home their commands run
 * from. A global npm or bun install, a `uv tool` or pipx install, Claude
 * Code's own installer, each put a command in a PATH dir as a link into a
 * tree elsewhere under home (`~/.bun/bin/node-gyp` to `~/node_modules`,
 * `~/.local/bin/hf` to `~/.local/share/uv/tools/…`, `~/.local/bin/claude` to
 * `~/.local/share/claude/versions/…`), and the command needs its tree: its
 * dependencies, its virtual environment, the interpreter its `#!` line names
 * (a uv tool's runs `~/.local/share/uv/python/…`). Seatbelt judges a link by
 * where it lands, so without the tree the command is refused (EPERM)
 * wherever it runs from; srt shows it as missing. Each tree is
 * {@link toolTreeOf} the command's landing and of its interpreter's, and,
 * for a command in a Python venv, the prefix of the Python the venv was made
 * from ({@link venvBaseOf}: a pipx venv on pyenv's `~/.pyenv/versions/…`),
 * read only. A tool installed editable, its code in a clone of its own
 * (`~/glm-ocr`), stays refused: that clone is another repository. Never a
 * tree in a git work tree, a clone's (a `.git` in the tree's
 * parent, the tree or any dir down to the landing), and never one that is or
 * lies in a credential store; a store inside a tree stays denied, the deeper
 * entry deciding.
 */
export const homeToolchains = async (home: string): Promise<string[]> => {
  const dirs = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry.startsWith(`${home}/`));
  const commands = await Promise.all(
    dirs.map(async (dir) => {
      const names = await readdir(dir).catch(() => []);
      return names.map((name) => join(dir, name));
    })
  );
  const landings = unique(
    (
      await Promise.all(
        commands.flat().map(async (command) => {
          const landing = await realpath(command).catch(() => undefined);
          if (!landing) {
            return [];
          }
          const interpreter = await interpreterOf(landing);
          return interpreter ? [landing, interpreter] : [landing];
        })
      )
    )
      .flat()
      .filter(
        (landing) =>
          landing.startsWith(`${home}/`) &&
          !dirs.some((dir) => within(landing, dir))
      )
  );
  const roots = toolRoots(home);
  const stores = credentialStores().flatMap((store) => [
    store,
    resolveDenied(store),
  ]);
  const gits = new Map<string, Promise<boolean>>();
  const hasGit = (dir: string): Promise<boolean> => {
    let found = gits.get(dir);
    if (!found) {
      found = stat(join(dir, ".git")).then(
        () => true,
        () => false
      );
      gits.set(dir, found);
    }
    return found;
  };
  const inWorkTree = async (
    tree: string,
    landing: string
  ): Promise<boolean> => {
    const chain = [dirname(tree)];
    for (let dir = dirname(landing); within(dir, tree); dir = dirname(dir)) {
      chain.push(dir);
    }
    return (await Promise.all(chain.map(hasGit))).some(Boolean);
  };
  const allowed = async (tree: string, landing: string): Promise<string[]> =>
    tree.startsWith(`${home}/`) &&
    !stores.some((store) => within(tree, store)) &&
    !(await inWorkTree(tree, landing))
      ? [tree]
      : [];
  const trees = await Promise.all(
    landings.map(async (landing) => {
      const [tree, base] = await Promise.all([
        toolTreeOf(landing, home, roots),
        venvBaseOf(landing),
      ]);
      return [
        ...(tree ? await allowed(tree, landing) : []),
        ...(base ? await allowed(base, join(base, "bin")) : []),
      ];
    })
  );
  return unique([...dirs, ...trees.flat()]);
};

/** `pyvenv.cfg`'s `home = …` line: the dir of the interpreter a venv was made from. */
const VENV_HOME = /^home\s*=\s*(.+?)\s*$/m;

/**
 * The prefix of the Python a venv was made from, when `landing` is a command
 * in the venv's `bin` (`<venv>/bin/<command>`), as a real path: `pyvenv.cfg`
 * names its `bin` dir as `home` (docs.python.org/3/library/venv.html: "a
 * home key pointing to the Python installation from which the command was
 * run"), and the interpreter loads its standard library and, from a shared
 * build, `libpython` from the prefix above it (a pipx venv made from pyenv's
 * `~/.pyenv/versions/3.12.0`). None for a landing outside a venv.
 */
const venvBaseOf = async (landing: string): Promise<string | undefined> => {
  const cfg = await readFile(
    join(dirname(dirname(landing)), "pyvenv.cfg"),
    "utf8"
  ).catch(() => undefined);
  const named = cfg ? VENV_HOME.exec(cfg)?.[1] : undefined;
  if (!(named && isAbsolute(named))) {
    return;
  }
  const real = await realpath(named).catch(() => undefined);
  if (!real) {
    return;
  }
  return real.endsWith("/bin") ? dirname(real) : real;
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

/**
 * Why a file may not leave its machine as a delegate's input (a `delegate`
 * or `handoff`'s `inputs`, copied into the delegate's `$TMPDIR/inputs/`),
 * or nothing when it may: what every boundary hides from every workspace,
 * whoever asks. A credential store ({@link credentialStores}: logins, key
 * folders, the hub's own secrets), a file named as a secret
 * ({@link isSecretFileName}), and on Linux the host's runtime dirs and logs
 * ({@link LINUX_HOST_PRIVATE}). Judged on the path as named and on its real
 * path, so a link leads neither into one nor out of one.
 */
export const inputDenial = (
  named: string,
  real: string
): string | undefined => {
  const paths = [resolveDenied(named), real];
  const inside = (roots: readonly string[]): string | undefined =>
    roots
      .map(resolveDenied)
      .find((root) => paths.some((path) => within(path, root)));
  const store = inside(credentialStores());
  if (store) {
    return `${named} is in ${store}, a credential store no workspace reads`;
  }
  if (paths.some((path) => isSecretFileName(basename(path)))) {
    return `${named} is named as a secret file (.env and its kind), which no workspace reads outside its own clone`;
  }
  const host = process.platform === "darwin" ? "" : inside(LINUX_HOST_PRIVATE);
  return host
    ? `${named} is in ${host}, the host's sockets and logs, which no workspace reads; copy the lines the delegate needs into a file of your own and name that`
    : undefined;
};

/** An account id as the hub mints it: one path component, never `.` or `..`. */
const ACCOUNT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * The user layer's entries in the config dir of each Claude account a
 * session of the workspace runs on ({@link workspaceAccountsFile}), by the
 * names that session is given: its `CLAUDE_CONFIG_DIR` is the account's dir,
 * so Claude Code hands out a skill's files under it ("Base directory for this
 * skill: <account>/claude/skills/…"). Each entry there is a link into
 * {@link claudeHome} (`accounts.ts` links them). The account dir lies in a
 * credential store (`accountsRoot`), so only these names open, each kept as
 * written under the dir's real path: srt binds what the name resolves to
 * back at the name, and refuses one that resolves into anything else the
 * policy denies (a link planted at `skills` to `~/.ssh` opens nothing,
 * `restorePlacementOf` in srt 0.0.79); Seatbelt and the judge follow the
 * link to its target, which the user layer's own entries allow. The
 * account's credential, `.claude.json`, transcripts and the rest stay denied.
 */
const accountLayers = async (id: string): Promise<string[]> => {
  const file = workspaceAccountsFile(id);
  const listed = (await readRecord<unknown>(file)) ?? [];
  if (!Array.isArray(listed)) {
    throw new DamagedRecord(file, "it is not a list");
  }
  return listed
    .filter(
      (account): account is string =>
        typeof account === "string" && ACCOUNT_ID.test(account)
    )
    .flatMap((account) => {
      const dir = resolveReal(accountConfigDir(account));
      return [...USER_LAYER_DIRS, ...USER_LAYER_FILES].map((name) =>
        join(dir, name)
      );
    });
};

/** A Claude Code session id: a UUID, as CawCo mints it for a launch (`spill` in harnesses/claude.ts) and the CLI keeps it. */
const SESSION_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A CawCo instance id as one path component: never `.` or `..`. */
const INSTANCE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/**
 * Whether `dir` is one session's spill folder: Claude Code's
 * `<config dir>/projects/<slug>/<session id>/tool-results` under a config dir
 * of this machine's, or a pi or OpenCode session's {@link workspaceSpillDir}
 * of this workspace. Nothing else in the record opens.
 */
const isSpillDir = (id: string, dir: string): boolean => {
  if (!isAbsolute(dir) || dir.split("/").includes("..")) {
    return false;
  }
  if (workspaceSpillDir(id, basename(dir)) === dir) {
    return INSTANCE_ID.test(basename(dir));
  }
  const session = dirname(dir);
  const projects = dirname(dirname(session));
  return (
    basename(dir) === "tool-results" &&
    SESSION_UUID.test(basename(session)) &&
    basename(projects) === "projects" &&
    claudeConfigDirs().includes(dirname(projects))
  );
};

/**
 * Each folder a session of the workspace was launched with for its harness's
 * saved tool results ({@link workspaceSpillsFile}), as a real path, read only.
 * A harness saves a result too large to hand the model to a file and tells
 * the model to read it, by the shell for one too long a line for its file
 * tool: Claude Code "Slice by character range via Bash instead — e.g.
 * python3 -c …" under its config dir, which is a credential store
 * (`accountsRoot`), pi "Use bash: sed -n …" from its host's `TMPDIR`, and
 * OpenCode cuts each line its `read` shows at 2000 characters. So each
 * session's own folder opens, the deeper entry deciding; it holds that
 * session's tool output alone, never a credential or another session's.
 */
const spillDirs = async (id: string): Promise<string[]> => {
  const file = workspaceSpillsFile(id);
  const listed = (await readRecord<unknown>(file)) ?? [];
  if (!Array.isArray(listed)) {
    throw new DamagedRecord(file, "it is not a list");
  }
  return listed
    .filter(
      (dir): dir is string => typeof dir === "string" && isSpillDir(id, dir)
    )
    .map(resolveReal);
};

/** A project id as the hub mints and accepts it (hub project-folder.ts `PROJECT_ID`). */
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * The folder of the project the workspace's work belongs to
 * ({@link workspaceProjectFile}), as a real path, read only: what one
 * delegate hands in (`outputs`, copied into `assets/<item>/`), its project's
 * `knowledge/` and tasks, for the next delegate to read. It lies in the
 * hub's data dir, a credential store (the hub's database with its tokens and
 * keys, its backups, the transcript index, every other project's folder), so
 * only this one folder opens, the deeper entry deciding; nothing writes it.
 * None for a workspace of no project, and none on a machine that is not the
 * hub's, where the folder does not exist (its delegates read the folder with
 * `folder_read`).
 */
const projectFolder = async (id: string): Promise<string[]> => {
  const file = workspaceProjectFile(id);
  const project = await readRecord<unknown>(file);
  if (project === undefined) {
    return [];
  }
  if (typeof project !== "string" || !PROJECT_ID.test(project)) {
    throw new DamagedRecord(file, "it is not a project id");
  }
  const folder = join(hubProjectsDir(), project);
  const found = await stat(folder).catch(() => undefined);
  if (!found?.isDirectory()) {
    return [];
  }
  const real = resolveReal(folder);
  // Only the folder itself, never one its name leads out of the projects dir.
  return dirname(real) === resolveReal(hubProjectsDir()) ? [real] : [];
};

/**
 * The workspace's policy on this machine as it stands now, every path a real
 * path but the account layer names ({@link accountLayers}).
 */
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
  const allowRead = unique([
    ...real([
      workspace.path,
      // Its state dir's read-only part and its scratch dir: the state dir
      // itself (its hook, executor, policy, boundary record) is the host's.
      workspaceReadOnlyDir(workspace.id),
      workspaceScratchDir(workspace.id),
      // Its door sockets, under the runtime dir on Linux (`workspaceDoorDir`).
      workspaceDoorDir(workspace.id),
      ...caches,
      ...(await alternatesOf(workspace.path)),
      ...(await homeToolchains(home)),
      join(home, ".gitconfig"),
      userGitConfigDir(),
      ...hostToolCaches(),
      ...(await darwinDeveloperBundle()),
      binaryRoot(),
      ...[...USER_LAYER_DIRS, ...USER_LAYER_FILES].map((name) =>
        join(claudeHome(), name)
      ),
      // What the fleet sync writes that a harness loads, read only: every
      // skills dir with the tree store its links land in, the vendored
      // marketplaces Claude Code runs the fleet's plugins from (without them
      // every hook of such a plugin failed, `python3: can't open file
      // '…/cawco-marketplaces/axiom-marketplace/plugins/axiom/hooks/…'`),
      // pi's memory (core paths.ts `fleetSyncedPaths`).
      ...fleetSyncedPaths(),
      ...(mac
        ? ["Developer", "Preferences", "Keychains"].map((name) =>
            join(home, "Library", name)
          )
        : []),
    ]),
    ...(await accountLayers(workspace.id)),
    ...(await projectFolder(workspace.id)),
    ...(await spillDirs(workspace.id)),
  ]);
  // A lead's place: what only its owner may read in it is hidden from the
  // lead's shell and file tools, for reading and writing (`ownerOnlyIn`).
  const lead = isLeadPlace(workspace.id);
  const ownerOnly = lead ? await ownerOnlyIn(clone) : [];
  // What shares an inode with a file elsewhere is only read (`linkedIn`).
  const linked = lead ? await linkedIn(clone) : [];
  const denyRead = unique([
    resolveDenied(home),
    ...stores,
    ...ownerOnly,
    ...(mac ? [] : denied(LINUX_HOST_PRIVATE)),
  ]);
  return {
    home,
    clone,
    scratch,
    ...(lead ? { protectConfig: true } : {}),
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
        (await workspaceDenies(workspace))
          .filter((deny) => !deny.srt)
          .map(({ path }) => path)
      ),
      ...stores,
      ...ownerOnly,
      ...linked,
    ]),
  };
};
