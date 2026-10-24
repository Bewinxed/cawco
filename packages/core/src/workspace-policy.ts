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
 *   (`hostToolCaches`: Playwright's browsers), the
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
import { createHash } from "node:crypto";
import { open, readdir, readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { binaryRoot } from "./binary-installation";
import { projectClaudeRelative } from "./claude-dirs";
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
  placedMemoryDir,
  placedSyncedPaths,
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
  workspacesDir,
  xdgDataHome,
} from "./paths";
import { SAFE_GIT_ENV, safeGitArgv } from "./safe-git";
import { hostEnvironment } from "./session-env";
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
 * `getDangerousDirectories()` in sandbox-utils.js at 0.0.81; `.mcp.json`,
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
 * Claude Code's empty preview launch config: its version and no server.
 * "Claude automatically detects your dev server setup and stores the
 * configuration in `.claude/launch.json` … `{ "version": "0.0.1",
 * "configurations": [ … ] }`" (code.claude.com/docs/en/desktop, "Configure
 * preview servers").
 */
const LAUNCH_EMPTY = {
  kind: "file",
  text: '{"version":"0.0.1","configurations":[]}\n',
} as const;

/**
 * Claude Code's empty scheduled tasks: a `tasks` list with none. Its reader
 * takes anything else as no task too (CLI 0.3.302: `if(!r||typeof
 * r!=="object")return[];let i=r;if(!Array.isArray(i.tasks))return[]`).
 */
const SCHEDULED_EMPTY = { kind: "file", text: '{"tasks":[]}\n' } as const;

/**
 * Every project file or dir Claude Code, OpenCode or pi loads and runs (or
 * follows as instructions only it may change, `output-styles`), by its path
 * from the dir it is found in, with the stand-in its harness parses as
 * nothing set (a clone holds one at its root on Linux, {@link cloneDenies}).
 * Each is the harness's own and a fleet admin tool's, never a workspace's:
 * the owner picked "Admin tools only" (2026-10-23).
 *
 * - Claude Code: `.mcp.json`; `.claude/` settings (hooks, env, helpers,
 *   plugins), `hooks`, `commands` and `skills` (`` !`cmd` `` lines,
 *   frontmatter hooks), `agents`, `workflows` (JS scripts), `routines`,
 *   `scheduled_tasks.json`, `loop.md` (scheduled prompts), `launch.json`
 *   (the preview server's command), `output-styles`: Claude Code's own
 *   write-protected list (CLI 0.3.302: `Ae(st(Z,".claude","launch.json")…
 *   "workflows"…"routines"…"output-styles"…"scheduled_tasks.json"…
 *   "loop.md"…".mcp.json")`).
 * - OpenCode: `opencode.json(c)` and `.opencode/` (plugins, commands' shell
 *   blocks, MCP commands), from cwd to the filesystem root
 *   (opencode.ai/v2/docs/config).
 * - pi: `.pi/` (extensions, packages, `mcp.json`, settings; CawCo's pi takes
 *   every folder as trusted, pi-runtime.ts `SettingsManager.create`). "A
 *   bare `.pi` directory does not require project trust" (pi docs), so an
 *   empty one stands in.
 * - OpenCode and pi: `.agents/skills`.
 */
const HARNESS_CONFIG_EMPTY: Readonly<Record<string, CloneDenyEmpty>> = {
  ".mcp.json": { kind: "file", text: '{"mcpServers":{}}\n' },
  [projectClaudeRelative("settings.json")]: EMPTY_JSON,
  [projectClaudeRelative("settings.local.json")]: EMPTY_JSON,
  [projectClaudeRelative("hooks")]: DIR,
  [projectClaudeRelative("commands")]: DIR,
  [projectClaudeRelative("agents")]: DIR,
  [projectClaudeRelative("skills")]: DIR,
  [projectClaudeRelative("workflows")]: DIR,
  [projectClaudeRelative("routines")]: DIR,
  [projectClaudeRelative("output-styles")]: DIR,
  [projectClaudeRelative("launch.json")]: LAUNCH_EMPTY,
  [projectClaudeRelative("scheduled_tasks.json")]: SCHEDULED_EMPTY,
  [projectClaudeRelative("loop.md")]: EMPTY,
  "opencode.json": OPENCODE_EMPTY,
  "opencode.jsonc": OPENCODE_EMPTY,
  ".opencode": OPENCODE_DIR,
  ".pi": DIR,
  ".agents/skills": DIR,
};

/**
 * {@link HARNESS_CONFIG_EMPTY}'s paths: the one list of harness config a
 * clone's root denies, and which no workspace's commit changes at any depth
 * or in any letter case (agent hub-command.ts `ownConfigChanges`,
 * worktree-guard.ts `gitShim`).
 */
export const HARNESS_CONFIG: readonly string[] =
  Object.keys(HARNESS_CONFIG_EMPTY);

/**
 * Every path in a clone the workspace's policy denies writing, and srt's own
 * mandatory names at its root ({@link SRT_FILES}, {@link SRT_DIRS}), each
 * with its stand-in. What host git runs or reads from a clone: its config, its
 * hooks, its submodules' git dirs. And the harness project config the host
 * loads at the workspace's next session, outside any boundary, at the clone's
 * root ({@link HARNESS_CONFIG_EMPTY}: Claude Code's, OpenCode's and pi's);
 * the project skills, where the fleet places a project's skills with the
 * store their links land in (core paths.ts `placedSyncedPaths`); and the
 * project's memory documents as the fleet places them (`placedMemoryDir`).
 * On Linux a link in a dir the sandbox writes can be swapped for another,
 * so the whole skills dir is held, as `commands` and `agents` are. srt binds
 * literal paths alone ("`allowWrite` / `denyWrite` take literal paths",
 * github.com/anthropics/sandbox-runtime), so a nested copy of one is kept
 * out of what lands, at any depth, by the commit check instead.
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
export const cloneDenies = (clone: string): readonly CloneDeny[] => {
  const denies: CloneDeny[] = [
    { path: join(clone, ".git", "config"), empty: { kind: "none" } },
    { path: join(clone, ".git", "hooks"), empty: DIR },
    { path: join(clone, ".git", "modules"), empty: DIR },
    ...Object.entries(HARNESS_CONFIG_EMPTY).map(([name, empty]) => ({
      path: join(clone, name),
      empty,
    })),
    // The skills the fleet places in the clone, and the store their links
    // land in: a fleet skill, never the delegate's to change.
    ...placedSyncedPaths(clone).map((path) => ({ path, empty: DIR })),
    // The project's memory documents as the fleet places them: instructions
    // Claude Code loads at launch, never the delegate's to change.
    { path: placedMemoryDir(clone), empty: DIR },
    ...srtDenies(clone),
  ];
  const seen = new Set<string>();
  return denies.filter(({ path }) => !seen.has(path) && seen.add(path));
};

/** srt's own mandatory names at the clone's root, each with its stand-in ({@link SRT_FILES}, {@link SRT_DIRS}). */
const srtDenies = (clone: string): CloneDeny[] => [
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
 * What CawCo writes into a clone and keeps out of its status itself, by path
 * in the clone: its deny paths, which no delegate writes ({@link
 * cloneDenies}: the stand-ins CawCo made there, the placed skills and their
 * store, the project's memory documents as the fleet places them), and its
 * stage's host (agent stage.ts `writeHost`).
 */
export const cloneWritten = (clone: string): string[] =>
  [...cloneDenies(clone).map((deny) => deny.path), join(clone, ".cawco")].map(
    (path) => relative(clone, path)
  );

/**
 * The `git status` that names a clone's untracked paths git ignores, a
 * folder a rule matches whole as one, NUL-ended: what {@link
 * excludedPaths} reads, its `!! ` entries given to `git check-ignore -v -z
 * --stdin`.
 */
export const IGNORED_STATUS = [
  "status",
  "--porcelain=v1",
  "-z",
  "--ignored=matching",
  "--untracked-files=all",
] as const;

const TRAILING_SLASH = /\/$/;

/**
 * The paths of `git check-ignore -v -z` output (`rules`: source, line,
 * pattern and path, each NUL-ended) kept out of git by no `.gitignore` the
 * repository tracks (`tracked`, `git ls-files -z -- ':(glob)**\/.gitignore'`):
 * the clone's `.git/info/exclude` or an untracked `.gitignore`, which its
 * delegate writes. A path a tracked `.gitignore` covers goes with the clone,
 * as does one the owner's global excludes file covers (an absolute source,
 * outside every clone: no clone's config may name one, safe-git.ts
 * `repositoryConfigProblem`). What CawCo wrote there ({@link cloneWritten})
 * is CawCo's, and goes too; and what `person` names (the person's own
 * untracked files the copy started with, {@link personUntrackedIn}) is the
 * person's, never the workspace's. Each is work no remote has: it holds the
 * workspace (agent workspace.ts `holding`), and finish_item names it (hub
 * work-items.ts `leftoversIn`).
 */
export const excludedPaths = (
  clone: string,
  tracked: string,
  rules: string,
  person: readonly string[] = []
): string[] => {
  const own = [...cloneWritten(clone), ...person];
  const committed = new Set(tracked.split("\0").filter(Boolean));
  const fields = rules.split("\0");
  const excluded: string[] = [];
  for (let at = 0; at + 3 < fields.length; at += 4) {
    const source = fields[at] as string;
    const path = fields[at + 3] as string;
    const bare = path.replace(TRAILING_SLASH, "");
    if (!(
      committed.has(source) ||
      isAbsolute(source) ||
      own.some((one) => bare === one || bare.startsWith(`${one}/`))
    )) {
      excluded.push(path);
    }
  }
  return excluded;
};

/** Where CawCo's block of the person's own untracked files begins and ends in a copy's `info/exclude` (agent workspace.ts `excludeStart`). */
export const PERSON_UNTRACKED_START =
  "# cawco: the folder's own untracked files as the workspace started";
export const PERSON_UNTRACKED_END = "# cawco: end of the folder's own";

/**
 * The paths CawCo's block of a copy's `info/exclude` text names as the
 * person's own untracked files: they came along with the folder (agent
 * layer.ts) and are no work of the workspace's.
 */
export const personUntrackedIn = (exclude: string): string[] => {
  const named: string[] = [];
  let inside = false;
  for (const line of exclude.split("\n")) {
    if (line === PERSON_UNTRACKED_START) {
      inside = true;
    } else if (line === PERSON_UNTRACKED_END) {
      inside = false;
    } else if (inside && line.startsWith("/")) {
      named.push(line.slice(1));
    }
  }
  return named;
};

/**
 * A place: the workspace id the hub gives the boundary of a person's own
 * folder, never a delegate's. A project lead's (Caw's) is the folder he
 * starts in (hub `leadPlaceRef`); a session with no workspace of its own
 * has one over the folder it works in, which names its stage (hub
 * `stagePlaceRef`; the stage itself runs in a clone of that checkout, agent
 * stage-clone.ts). It is a person's own folder, not a disposable clone, so its
 * boundary never writes into it (no stand-ins, no copied inodes, no exclude
 * lines): its policy denies what is there ({@link workspaceDenies},
 * {@link ownerOnlyIn}, {@link linkedIn}), its judge refuses protected config
 * by name (`protectConfig`), and its guard checks each command
 * (boundary.ts `PLACE_GUARD`). Every place's id ends {@link PLACE_SUFFIX},
 * Caw's and a session's stage place alike. The suffix stays `-caw`, the one
 * it had when only Caw had a place, so the place records already on disk
 * still read as places.
 */
export const PLACE_SUFFIX = "-caw";
export const isPlace = (id: string): boolean => id.endsWith(PLACE_SUFFIX);

/**
 * The workspace id of place `placeId`'s stage clone (agent stage-clone.ts),
 * as its machine and the hub both name it: a workspace id of its own, never
 * a place's, its first 8 characters its own hash, so its scratch and door
 * dirs are its own and not the place's.
 */
export const stageCloneId = (placeId: string): string => {
  const hex = createHash("sha256").update(`stage\0${placeId}`).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
};

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
      { encoding: "utf8", env: hostEnvironment(), maxBuffer: FIND_OUTPUT_MAX },
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

/** What git exits with, and what it wrote. */
const gitIn = (
  root: string,
  args: readonly string[]
): Promise<{ code: number; out: string; err: string }> =>
  new Promise((done) => {
    execFile(
      "git",
      safeGitArgv(["-C", root, ...args]).slice(1),
      {
        encoding: "utf8",
        maxBuffer: FIND_OUTPUT_MAX,
        env: { ...process.env, ...SAFE_GIT_ENV, LC_ALL: "C" },
      },
      (error, out, err) => {
        if (!error) {
          done({ code: 0, out, err });
          return;
        }
        done({
          code: typeof error.code === "number" ? error.code : -1,
          out,
          err,
        });
      }
    );
  });

/**
 * The dirs under `root` its project ignores, as git states them: each
 * untracked dir every one of whose entries the project's own ignore rules
 * (`.gitignore`, `.git/info/exclude`, the user's `core.excludesFile`) leave
 * out, `git ls-files --others --ignored --exclude-standard --directory`,
 * never one of {@link PROTECTED_UNDER}'s dirs, whose protected entries lie
 * below it. None for a folder that is no git work tree: it declares no
 * ignores. Any other failure refuses the boundary, in git's words.
 */
const ignoredDirs = async (root: string): Promise<string[]> => {
  if ((await gitIn(root, ["rev-parse", "--is-inside-work-tree"])).code !== 0) {
    return [];
  }
  const listed = await gitIn(root, [
    "ls-files",
    "--others",
    "--ignored",
    "--exclude-standard",
    "--directory",
    "-z",
  ]);
  if (listed.code !== 0) {
    throw new Error(
      `the dirs ${root} ignores could not be read: git ls-files exited ${listed.code}: ${listed.err.trim()}`
    );
  }
  return listed.out
    .split("\0")
    .filter(
      (entry) =>
        entry.endsWith("/") &&
        !Object.hasOwn(PROTECTED_UNDER, basename(entry.slice(0, -1)))
    )
    .map((entry) => join(root, entry.slice(0, -1)));
};

/** `find -path`'s pattern for exactly `path`: its glob characters escaped. */
const FIND_GLOB = /[\\*?[\]]/g;

/** `find`'s test for any of `paths`, exactly; one that is never true for none. */
const anyPath = (paths: readonly string[]): string[] =>
  paths.length === 0
    ? ["-false"]
    : [
        "(",
        ...paths.flatMap((path, at) => [
          ...(at > 0 ? ["-o"] : []),
          "-path",
          path.replace(FIND_GLOB, "\\$&"),
        ]),
        ")",
      ];

/** `find`'s test for an entry that is a dir or a file of its own: never a link. */
const DIR_OR_FILE = ["(", "-type", "d", "-o", "-type", "f", ")"];

/**
 * The protected config a place has now ({@link PROTECTED_NAMES},
 * {@link PROTECTED_UNDER}), anywhere in it but below the dirs its project
 * ignores ({@link ignoredDirs}; an ignored dir that is protected config
 * itself is found): each a dir
 * or file of its own, which srt binds onto itself and so leaves nothing on
 * the host. One that is absent is never denied to srt, which would make its
 * mount point in the person's folder.
 *
 * Every one, empty or not: an empty `.claude/hooks` or `.vscode` is the
 * person's, and a hook planted there runs in their own Claude Code. CawCo
 * makes no stand-in in a place (stand-ins.ts `removeStandIns`), so nothing
 * there is CawCo's to leave unbound; one an earlier build made is denied
 * like the rest, which only keeps it as it is.
 */
const protectedIn = async (root: string): Promise<string[]> =>
  findIn(
    root,
    [
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
      "-o",
      ...anyPath(await ignoredDirs(root)),
      "-prune",
    ],
    "the protected config"
  );

/**
 * The clone-side denies a workspace's boundary keeps ({@link cloneDenies}).
 * A place keeps only the protected config it has
 * ({@link protectedIn}), each with nothing to stand in for it: a person's own
 * folder is never written into. At most {@link PROTECTED_MAX}, the config
 * that crowds past it denied as the dirs that hold it ({@link collapsed}).
 */
export const workspaceDenies = async (
  workspace: WorkspaceRef
): Promise<readonly CloneDeny[]> => {
  const clone = resolveReal(workspace.path);
  if (!isPlace(workspace.id)) {
    return cloneDenies(clone);
  }
  return collapsed(await protectedIn(clone), clone, PROTECTED_MAX).map(
    (path) => ({
      path,
      empty: { kind: "none" },
    })
  );
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
 * Not walked into, and nothing under a link; git's own dirs (`.git`) are not
 * looked in. Every other dir is, ignored or not: a tool's data dir is one a
 * project ignores, and what it keeps there is its own. A lead's place
 * hides each from his shell and file tools; an MCP server the owner runs
 * reaches its own data on its own.
 */
export const ownerOnlyIn = (root: string): Promise<string[]> =>
  findIn(
    root,
    [
      "-name",
      ".git",
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
 * srt's cap on the words of one bwrap profile (`BWRAP_MAX_ARGS = 9000` in
 * srt 0.0.81's linux-sandbox-utils.js, the newest release), and what one
 * path takes of it: "each path takes about three arguments" (its
 * `too_many_arguments` refusal), `--ro-bind <path> <path>`.
 */
const BWRAP_MAX_ARGS = 9000;
const BWRAP_ARGS_PER_PATH = 3;
/** The paths srt's cap holds: 3,000. */
const SRT_PATHS = BWRAP_MAX_ARGS / BWRAP_ARGS_PER_PATH;

/**
 * THE ONE BUDGET for what a place's denies take of srt's cap, whatever its
 * folder holds: two thirds of srt's 3,000 paths, 2,000 (6,000 words), for the
 * three lists read off the folder; the rest of the profile, which no folder
 * grows (allows, credential stores, the host's private paths), keeps 1,000
 * paths (3,000 words). That rest ran to 1,320 words on obelisk's cockpit
 * place on 2026-10-23 (14,370 in all, 4,350 of them linked files' denies,
 * the profile srt refused), so it has more than twice that in hand.
 *
 * The split, in paths: protected config ({@link protectedIn}) 500, denied
 * for writing; owner-only entries ({@link ownerOnlyIn}) 500, each denied for
 * reading and for writing, so 1,000 paths; linked files ({@link linkedIn})
 * 500, denied for writing. Owner-only entries get the most because each
 * costs two paths and a tool's data dirs hold many; past its share each
 * list is denied by the dirs that hold its entries ({@link collapsed}), which
 * only denies more, so a share decides how coarse a list becomes, never
 * what it protects. Our call, from srt's cap and that profile.
 */
const PLACE_PATHS = (SRT_PATHS * 2) / 3;
export const PROTECTED_MAX = PLACE_PATHS / 4;
export const OWNER_ONLY_MAX = PLACE_PATHS / 4;
export const LINKED_MAX = PLACE_PATHS / 4;

const depthOf = (path: string): number => path.split("/").length;

/** `paths` with every one that lies under another left out: the outer one covers it. */
const outermost = (paths: readonly string[]): string[] => {
  const all = new Set(paths);
  return [...all].filter((path) => {
    for (let up = dirname(path); up !== dirname(up); up = dirname(up)) {
      if (all.has(up)) {
        return false;
      }
    }
    return !(path !== "/" && all.has("/"));
  });
};

/**
 * `paths` (each `root` or under it) as at most `max` entries that cover
 * every one of them: the deepest lifted to the dir that holds them, one level
 * at a time, so the files that crowd one dir become that dir, until they fit;
 * at worst `root` itself.
 */
const collapsed = (
  paths: readonly string[],
  root: string,
  max: number
): string[] => {
  let kept = outermost(paths);
  const floor = depthOf(root);
  while (kept.length > max) {
    const deepest = kept.reduce(
      (most, path) => Math.max(most, depthOf(path)),
      0
    );
    if (deepest <= floor) {
      break;
    }
    kept = outermost(
      kept.map((path) => (depthOf(path) === deepest ? dirname(path) : path))
    );
  }
  return kept;
};

/**
 * What in a place shares its inodes with files elsewhere: each dir its
 * project ignores ({@link ignoredDirs}) that holds such a file, whole (an
 * install that hardlinks from its cache, as bun's and uv's do, fills one with
 * them), and every other file with more than one link. A clone's are copied apart
 * but those linked to the workspaces' own bun cache (boundary.ts
 * `ownInodes`); a person's own folder is never rewritten, so
 * these are only denied for writing: a write through one would change a file
 * the host runs.
 *
 * Never the place's own `.git/objects`: git's objects are named by their
 * content and written once, read-only (0444), never changed in place, so a
 * write through one changes nothing anyone runs; and a local clone links
 * every one of them (git-clone(1) `--local`), 4,342 files on obelisk's
 * cockpit place from two clones left behind. At most {@link LINKED_MAX}
 * entries, the files that crowd past it denied as the dirs that hold them
 * ({@link collapsed}): srt refuses a profile past its cap whole, and the
 * place's boundary would not start at all.
 */
export const linkedIn = async (root: string): Promise<string[]> => {
  const ignored = await ignoredDirs(root);
  const [files, dirs] = await Promise.all([
    findIn(
      root,
      [
        "-xdev",
        ...anyPath([...ignored, join(root, ".git", "objects")]),
        "-prune",
        "-o",
        "-type",
        "f",
        "-links",
        "+1",
        "-print0",
      ],
      "the files that share their inodes"
    ),
    Promise.all(
      ignored.map(async (dir) =>
        (
          await findIn(
            dir,
            ["-xdev", "-type", "f", "-links", "+1", "-print0", "-quit"],
            "the files that share their inodes"
          )
        ).length > 0
          ? [dir]
          : []
      )
    ),
  ]);
  return collapsed([...dirs.flat(), ...files], root, LINKED_MAX);
};

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
 * {@link resolveDenied} for a path that may not resolve at all (a link loop,
 * a `..` past a folder that doesn't exist): what it can't resolve, its parent
 * resolved and its last name kept as written. Only ever judged against what
 * a boundary hides, so a path kept as written can only deny more.
 */
export const resolveAsFar = (path: string): string => {
  try {
    return resolveDenied(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(resolveAsFar(parent), basename(path));
  }
};

/**
 * Why a file may not leave its machine as a delegate's input (a `delegate`
 * or `handoff`'s `inputs`, copied into the delegate's `$TMPDIR/inputs/`),
 * or nothing when it may: what every boundary hides from every workspace,
 * whoever asks. A credential store ({@link credentialStores}: logins, key
 * folders, the hub's own secrets), a file named as a secret
 * ({@link isSecretFileName}), and on Linux the host's runtime dirs and logs
 * ({@link LINUX_HOST_PRIVATE}). `opened` is what the caller's project opens
 * inside a store, as every boundary of the project opens it
 * ({@link projectFolderOf}): a path there, as named and as its real path, is
 * not in that store. Judged on the path as named and on its real path, so a
 * link leads neither into one nor out of one.
 */
export const inputDenial = (
  named: string,
  real: string,
  opened: readonly string[]
): string | undefined => {
  const paths = [resolveAsFar(named), real];
  const inside = (roots: readonly string[]): string | undefined =>
    roots
      .map(resolveDenied)
      .find((root) => paths.some((path) => within(path, root)));
  const store = credentialStores()
    .map(resolveDenied)
    .find((root) =>
      paths.some(
        (path) =>
          within(path, root) &&
          !opened.some((folder) => within(folder, root) && within(path, folder))
      )
    );
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
 * `restorePlacementOf` in srt 0.0.81); Seatbelt and the judge follow the
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
/**
 * A macOS copy's folder's root `node_modules` (agent layer.ts
 * `LINKED_MODULES`): the copy's own `node_modules` is a link to it until its
 * own clone is swapped in, and Seatbelt judges the path a link resolves to.
 * Read only, for the workspace's whole life, so the swap narrows nothing; a
 * write there is refused, as everywhere outside the copy. Nothing for a
 * Linux view, whose folder is its own path, nor for a copy of a folder
 * with none.
 */
const linkedModules = async (id: string): Promise<string[]> => {
  const layer = await readRecord<{ folder?: unknown; form?: unknown }>(
    join(workspacesDir(), id, "layer.json")
  ).catch(() => undefined);
  if (!(
    layer?.form === "copy" &&
    typeof layer.folder === "string" &&
    layer.folder
  )) {
    return [];
  }
  const modules = join(layer.folder, "node_modules");
  const found = await stat(modules).catch(() => undefined);
  return found?.isDirectory() ? [resolveReal(modules)] : [];
};

const spillDirs = async (id: string): Promise<string[]> =>
  (await workspaceSpills(id)).map(resolveReal);

/**
 * The spill folders workspace `id`'s policy binds ({@link spillDirs}), as
 * they are listed: each one the record names that is a session's spill
 * folder ({@link isSpillDir}). The agent makes each of them before its
 * boundary starts (boundary.ts `keepSpills`).
 */
export const workspaceSpills = async (id: string): Promise<string[]> => {
  const file = workspaceSpillsFile(id);
  const listed = (await readRecord<unknown>(file)) ?? [];
  if (!Array.isArray(listed)) {
    throw new DamagedRecord(file, "it is not a list");
  }
  return listed.filter(
    (dir): dir is string => typeof dir === "string" && isSpillDir(id, dir)
  );
};

/** A project id as the hub mints and accepts it (hub project-folder.ts `PROJECT_ID`). */
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/**
 * The folder of the project the workspace's work belongs to
 * ({@link workspaceProjectFile}), read only ({@link projectFolderOf}). None
 * for a workspace of no project.
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
  return projectFolderOf(project);
};

/**
 * Project `project`'s folder on the hub's machine, as a real path: what one
 * delegate hands in (`outputs`, copied into `assets/<item>/`), its project's
 * `knowledge/` and tasks, for the next delegate to read. It lies in the
 * hub's data dir, a credential store (the hub's database with its tokens and
 * keys, its backups, the transcript index, every other project's folder), so
 * only this one folder opens, the deeper entry deciding; nothing writes it.
 * THE ONE DEFINITION of that opening: a workspace's boundary reads it
 * ({@link projectFolder}), and a session of the project may name a file in
 * it as a delegate's input ({@link inputDenial}). None on a machine that is
 * not the hub's, where the folder does not exist (its delegates read the
 * folder with `folder_read`).
 */
export const projectFolderOf = async (project: string): Promise<string[]> => {
  if (!PROJECT_ID.test(project)) {
    throw new Error(`"${project}" is not a project id`);
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
    ...(await linkedModules(workspace.id)),
  ]);
  // A place: what only its owner may read in it is hidden from the
  // shell and file tools in it, for reading and writing (`ownerOnlyIn`).
  const lead = isPlace(workspace.id);
  // At most `OWNER_ONLY_MAX`, past it denied as the dirs that hold them.
  const ownerOnly = lead
    ? collapsed(await ownerOnlyIn(clone), clone, OWNER_ONLY_MAX)
    : [];
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
