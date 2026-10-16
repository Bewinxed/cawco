import {
  type Dirent,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { CLAUDE_DIR_NAME, CLAUDE_JSON_NAME } from "./claude-dirs";
import { sessiondEndpoint } from "./sessiond";

/**
 * Node-only paths shared across packages. Kept out of the main entry, which
 * the dashboard bundles for the browser.
 *
 * This file owns every Claude Code dir on a machine; nothing else builds a
 * path into one (`bun run claude-paths:check`). A Claude session runs in one
 * config dir, `CLAUDE_CONFIG_DIR`: its account's ({@link accountConfigDir}),
 * or {@link claudeHome} for a session on no account. What a config dir holds
 * is in one of three classes, each read from Claude Code's own docs
 * (https://code.claude.com/docs/en/claude-directory) and from real listings
 * of `~/.claude` and account dirs:
 * - the user layer ({@link USER_LAYER_DIRS}, {@link USER_LAYER_FILES},
 *   {@link projectMemoryDir}): one copy
 *   in {@link claudeHome}, linked into every account dir;
 * - per session ({@link SESSION_ENTRIES}): in the session's own dir,
 *   {@link sessionConfigDir}, carried whole when its account changes;
 * - per account: everything else (the credential, `.claude.json`, caches,
 *   telemetry, prompt history, process files), never linked or carried.
 */

/** Where every account's stores live on a machine, one dir per account. */
export const accountsRoot = (): string => join(homedir(), ".cawco", "accounts");

/**
 * Claude Code's own config dir on this machine, `~/.claude`: where it runs
 * with no `CLAUDE_CONFIG_DIR`. The user layer's one copy (fleet sync writes
 * there; every account dir links to it), and the dir of a session on no
 * account.
 */
export const claudeHome = (): string => join(homedir(), CLAUDE_DIR_NAME);

/** A path under the user layer on this machine. */
export const userLayerPath = (...parts: string[]): string =>
  join(claudeHome(), ...parts);

/**
 * The `.claude.json` of {@link claudeHome}: beside it, `~/.claude.json`, as
 * Claude Code keeps it for the default dir (every Claude Code on the machine
 * reads it too).
 */
export const claudeHomeJson = (): string => join(homedir(), CLAUDE_JSON_NAME);

/**
 * The `.claude.json` a Claude Code run with this `CLAUDE_CONFIG_DIR` reads
 * (inside it), or {@link claudeHomeJson} for one run with none.
 */
export const configDirClaudeJson = (configDir: string | undefined): string =>
  configDir ? join(configDir, CLAUDE_JSON_NAME) : claudeHomeJson();

/**
 * One account's Claude Code config dir on this machine: its own credential,
 * transcripts and `.claude.json`, and the fleet's user layer linked in.
 */
export const accountConfigDir = (accountId: string): string =>
  join(accountsRoot(), accountId, "claude");

/** The `.claude.json` inside an account's dir, where its MCP servers and login identity live. */
export const accountClaudeJson = (accountId: string): string =>
  join(accountConfigDir(accountId), CLAUDE_JSON_NAME);

/**
 * The one dir a Claude session's own data is in: its account's dir, or
 * {@link claudeHome} for a session on no account. Every change of a row's
 * account carries the session's data here before the row says so, so a
 * reader with the row reads this dir and no other.
 */
export const sessionConfigDir = ({
  accountId,
}: {
  accountId?: string | null;
}): string => (accountId ? accountConfigDir(accountId) : claudeHome());

/** A project's own Claude Code dir: `<cwd>/.claude`, read whatever config dir a session runs in. */
export const projectClaudeDir = (cwd: string, ...parts: string[]): string =>
  join(cwd, CLAUDE_DIR_NAME, ...parts);

/**
 * Where the trees behind a dir of CawCo-written trees live: beside that dir,
 * `<parent>/.cawco-trees/<dir name>/` ({@link treeStoreOf}). Each entry of
 * the dir (a fleet skill, a vendored plugin) is a relative link into it,
 * swapped with one rename (agent tree-swap.ts), so a session never reads a
 * missing or half-written tree. Kept outside the dir itself because OpenCode
 * finds skills with `**\/SKILL.md` and follows dot dirs. In
 * {@link claudeHome} it holds the fleet's skills, which every session reads.
 */
export const TREE_STORE_DIR = ".cawco-trees";

/** The store of the trees the entries of `dir` link to ({@link TREE_STORE_DIR}). */
export const treeStoreOf = (dir: string): string =>
  join(dirname(dir), TREE_STORE_DIR, basename(dir));

/**
 * The dirs of a config dir that are the user's, not an account's: one copy
 * in {@link claudeHome}, each linked into every account dir. Each is a
 * global-scope entry of https://code.claude.com/docs/en/claude-directory
 * ("files in `~/.claude` are personal configuration that applies across all
 * your projects"), or CawCo's own (`memories`, the documents CLAUDE.md
 * links). `plans` too: plan mode writes there by default, by a random name a
 * transcript then names by its full path, so one copy keeps that path good
 * on every account. And {@link TREE_STORE_DIR}, where each fleet skill in
 * `skills` links to by a relative link (`../.cawco-trees/skills/<tree>`):
 * a workspace's boundary on Linux binds `skills` at the account dir's own
 * name, so the link resolves beside that name, and an account dir without
 * the store there read every fleet skill as missing (`ls
 * $CLAUDE_CONFIG_DIR/skills/interface-craft/`: "No such file or directory",
 * 2026-10-16).
 */
export const USER_LAYER_DIRS = [
  "memories",
  "rules",
  "skills",
  TREE_STORE_DIR,
  "commands",
  "agents",
  "output-styles",
  "workflows",
  "agent-memory",
  "plugins",
  "themes",
  "plans",
] as const;

/**
 * The dir in {@link claudeHome} CawCo writes the fleet's marketplaces into,
 * one per fleet marketplace, each registered with Claude Code as a
 * `directory` marketplace (agent fleet.ts `VENDOR_ROOT`). Claude Code runs a
 * directory marketplace's plugins from there: their hooks' `${CLAUDE_PLUGIN_ROOT}`
 * is a path inside it, so a session that may not read it runs none of them.
 * Each marketplace keeps its plugins' tree store inside it
 * (`<marketplace>/.cawco-trees/plugins`).
 */
export const VENDOR_MARKETPLACES_DIR = "cawco-marketplaces";

/** The fleet's skills for Claude Code, which OpenCode reads too (agent session.ts `#fleetHoldings`). */
export const claudeSkillsDir = (): string => userLayerPath("skills");

/** pi's agent dir, `~/.pi/agent`: its login, its settings, and what the fleet writes for it. */
export const piAgentDir = (): string => join(homedir(), ".pi", "agent");

/** The fleet's skills for pi. */
export const piSkillsDir = (): string => join(piAgentDir(), "skills");

/** The fleet's memory document for pi. */
export const piMemoryFile = (): string => join(piAgentDir(), "AGENTS.md");

/**
 * What the fleet sync writes on this machine that a harness loads: each
 * skills dir ({@link claudeSkillsDir}, {@link piSkillsDir}) with the tree
 * store its links land in ({@link treeStoreOf}), the vendored marketplaces
 * with their plugins' stores ({@link VENDOR_MARKETPLACES_DIR}), and pi's
 * memory document (Claude Code's, `CLAUDE.md`, is the user layer's). Every
 * workspace reads each and writes none (core workspace-policy.ts): a harness
 * hands its model a skill's path, and the model reads the skill's other
 * files from there with its own tools, through the boundary. pi's lie in
 * its agent dir, a credential store, so only these open there.
 */
export const fleetSyncedPaths = (): string[] => [
  ...[claudeSkillsDir(), piSkillsDir()].flatMap((dir) => [
    dir,
    treeStoreOf(dir),
  ]),
  userLayerPath(VENDOR_MARKETPLACES_DIR),
  piMemoryFile(),
];

/** The user layer's files ({@link USER_LAYER_DIRS} has why each is the user's). */
export const USER_LAYER_FILES = [
  "CLAUDE.md",
  "settings.json",
  "keybindings.json",
] as const;

/**
 * A project's auto memory, `projects/<slug>/memory` ("Global only… Claude's
 * notes to itself across sessions", claude-directory docs): the user's, one
 * copy in {@link claudeHome}, linked into each account dir per project.
 */
export const projectMemoryDir = (configDir: string, slug: string): string =>
  join(configDir, "projects", slug, "memory");

/** The longest slug Claude Code keeps whole (the SDK's `lo`, 0.3.289). */
const SLUG_MAX = 200;

/**
 * The folder Claude Code files a project under in `projects/`: the path with
 * every byte other than a letter or digit as `-`, cut at 200 with a hash of
 * the whole path after it. The SDK's own `Tc` and `iS` (sdk.mjs 0.3.289).
 */
export const projectSlug = (path: string): string => {
  const slug = path.replace(/[^a-zA-Z0-9]/g, "-");
  if (slug.length <= SLUG_MAX) {
    return slug;
  }
  let hash = 0;
  // By UTF-16 unit, as the SDK's `charCodeAt` loop counts.
  for (let index = 0; index < path.length; index += 1) {
    // biome-ignore lint/suspicious/noBitwiseOperators: the SDK's own 32-bit string hash, kept exact
    hash = ((hash << 5) - hash + path.charCodeAt(index)) | 0;
  }
  return `${slug.slice(0, SLUG_MAX)}-${Math.abs(hash).toString(36)}`;
};

/**
 * How one per-session entry sits in a config dir, for session `id`:
 * - `dir`: `<root>/<id>` (a folder of the session's own);
 * - `file`: `<root>/<id><suffix>`;
 * - `prefix`: every name under `<root>` starting `<id><suffix>`;
 * - `project`: under each `projects/<slug>/`, the transcript `<id>.jsonl`,
 *   the folder `<id>/` (subagent transcripts, tool output), and the copies
 *   Claude Code sets aside (`<id>.jsonl.superseded-*`, `.orphaned-<id>-*`).
 */
export type SessionEntry =
  | { kind: "dir"; root: string }
  | { kind: "file"; root: string; suffix: string }
  | { kind: "prefix"; root: string; suffix: string }
  | { kind: "project" };

/**
 * Every entry of a config dir that belongs to one session, from the
 * claude-directory docs' "Application data" table: the transcript and its
 * folder, `tasks/<id>` (the task tools' list, named by the session id),
 * `file-history/<id>` (checkpoints), `session-env/<id>`, `debug/<id>.txt`,
 * `uploads/<id>`, `dev-mods/<id>`, and the legacy `todos/<id>-*` and
 * `image-cache/<id>`. Not here, each per account: `sessions/` and
 * `shell-snapshots/` (one per process, gone at exit), `paste-cache/` and
 * `history.jsonl` (the dir's prompt history).
 */
export const SESSION_ENTRIES: readonly SessionEntry[] = [
  { kind: "project" },
  { kind: "dir", root: "tasks" },
  { kind: "dir", root: "file-history" },
  { kind: "dir", root: "session-env" },
  { kind: "dir", root: "uploads" },
  { kind: "dir", root: "dev-mods" },
  { kind: "dir", root: "image-cache" },
  { kind: "file", root: "debug", suffix: ".txt" },
  { kind: "prefix", root: "todos", suffix: "-" },
];

/** A session's task list on disk: `tasks/<id>` in its own dir. */
export const sessionTasksDir = (
  row: { accountId?: string | null },
  sessionId: string
): string => join(sessionConfigDir(row), "tasks", sessionId);

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
 * Every Claude Code config dir on this machine, for a lookup by session id
 * alone (no row to say which dir): {@link claudeHome}, each account's own
 * dir, and any the process was pointed at (`$CLAUDE_CONFIG_DIR`,
 * comma-separated, or `$XDG_CONFIG_HOME/claude`), each once.
 */
const pointedConfigDirs = (): string[] => {
  const env = process.env.CLAUDE_CONFIG_DIR;
  if (env) {
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? [join(xdg, "claude")] : [];
};

export const claudeConfigDirs = (): string[] => {
  const pointed = pointedConfigDirs();
  return [
    ...new Set([
      claudeHome(),
      ...accountIds().map(accountConfigDir),
      ...pointed,
    ]),
  ];
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

const xdgConfigHome = (): string =>
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
export const xdgDataHome = (): string =>
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");

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

/** Every OpenCode database on the machine: the machine server's, then each account server's. */
export const opencodeDatabases = (): string[] => {
  const accounts = join(sessionIdentityDir(), "opencode-accounts");
  const homes = existsSync(accounts) ? readdirSync(accounts) : [];
  return [
    join(opencodeDataDir(), "opencode.db"),
    ...homes.map((account) =>
      join(opencodeAccountHome(account), "opencode", "opencode.db")
    ),
  ].filter((path) => existsSync(path));
};

/** CawCo's config dir: the CLI's `config.json`, the hub's env file, the release signing key. */
export const cawcoConfigDir = (): string => join(xdgConfigHome(), "cawco");

/** CawCo's data dir: the binary install, its runtime trees, the transcript index; on Linux the hub's database too. */
export const cawcoDataDir = (): string => join(xdgDataHome(), "cawco");

/**
 * Each live Claude session's scheduled wake-ups as its last turn ended, one
 * file per session named by its instance id, kept for as long as its
 * process runs (agent `wakeups.ts`).
 */
export const sessionWakeupsDir = (): string =>
  join(cawcoDataDir(), "session-wakeups");

/** Where an installed hub keeps its database (`cawco.db`) and the backups beside it. */
export const hubDataDir = (): string =>
  process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "cawco")
    : cawcoDataDir();

/**
 * The env file `scripts/release.ts` loads the release signing key from
 * (`CAWCO_RELEASE_SIGNING_KEY`), with Bun's `--env-file`: inside the config
 * dir, so no workspace reads it.
 */
export const releaseEnvPath = (): string =>
  join(cawcoConfigDir(), "release.env");

/**
 * The one cache every workspace on this machine shares, and no host process
 * ever reads: bun's and npm's package caches, the XDG cache, uv's, and on
 * macOS Xcode's DerivedData and SwiftPM's. Every host cache is read-only
 * inside a workspace, so nothing a workspace writes reaches a file the host
 * runs; bun links a workspace's `node_modules` to the files here, never to the
 * host's.
 */
export const workspaceCacheDir = (): string =>
  join(homedir(), ".cawco", "workspace-cache");

/**
 * Where a host check's checkouts are (harness.ts `CONTROL_HOST_CHECKOUT`),
 * one folder per check run, each outside every boundary and gone once its
 * run ends: on real disk, never a tmpfs, as a dependency install fills it.
 */
export const hostChecksDir = (): string =>
  join(homedir(), ".cawco", "host-checks");

/**
 * Where a workspace's unlanded work is saved when a person archives it
 * anyway (core `WorkspaceUnlanded` `carry`), one folder per archive: outside
 * every workspace's reach, so no workspace writes or deletes one.
 */
export const workspaceCarriesDir = (): string =>
  join(homedir(), ".cawco", "carries");

/** Where every workspace's boundary keeps its state, one dir per workspace; read-only inside the boundary. */
export const workspacesDir = (): string =>
  join(homedir(), ".cawco", "workspaces");

/**
 * The agent's socket that answers `cawco git-credential` outside a session:
 * this machine's credential for the hub's git remote, so a checkout whose
 * `origin` is the hub pulls and pushes from a terminal. Where a deep HOME
 * cannot push it past a socket path's length: `$XDG_RUNTIME_DIR/cawco` on
 * Linux, {@link darwinSocketRoot} on macOS, else `~/.cawco`. No workspace
 * reads or connects into either.
 */
export const hubCredentialSocket = (): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (process.platform === "linux" && runtime) {
    return join(runtime, "cawco", "git-credential.sock");
  }
  if (process.platform === "darwin") {
    return join(darwinSocketRoot(), "git-credential.sock");
  }
  return join(homedir(), ".cawco", "git-credential.sock");
};

/** One workspace's state dir: its executor, hook, policy and boundary record. */
export const workspaceStateDir = (id: string): string =>
  join(workspacesDir(), id);

/**
 * Where every workspace's scratch dir is, one dir per workspace: under home,
 * so on disk (never tmpfs, which is RAM, and workspaces build large trees
 * there), and outside every clone (never in git status). Short, because
 * tools put unix sockets in `$TMPDIR` ({@link SCRATCH_SOCKET_SUFFIX}).
 */
export const workspaceScratchRoot = (): string =>
  join(homedir(), ".cawco", "tmp");

/**
 * The longest name a tool puts a unix socket at under `$TMPDIR` that a
 * workspace runs: Chromium's process singleton,
 * `org.chromium.Chromium.XXXXXX/SingletonSocket` (45 bytes with its `/`),
 * which aborts the browser at launch when the whole path passes
 * {@link UNIX_SOCKET_PATH_MAX} ("Socket path too long",
 * process_singleton_posix.cc).
 */
export const SCRATCH_SOCKET_SUFFIX =
  "org.chromium.Chromium.XXXXXX/SingletonSocket";

/**
 * A workspace's scratch dir, its `TMPDIR`: in {@link workspaceScratchRoot},
 * named by the id's first 8 characters, as its clone (`<repo>-<id8>`),
 * branch (`ws/<id8>`) and door dir are. `~/.cawco/tmp/<id8>` is 34 bytes
 * under `/home/bewinxed`, so a socket at {@link SCRATCH_SOCKET_SUFFIX} in it
 * fits {@link UNIX_SOCKET_PATH_MAX} with room for a HOME 28 bytes longer.
 * Never inside the state dir: under it the path took 71 bytes and every
 * Chromium launch in a workspace aborted.
 */
export const workspaceScratchDir = (id: string): string =>
  join(workspaceScratchRoot(), id.slice(0, 8));

/**
 * The name a workspace's commands are given for its scratch dir, their
 * `TMPDIR`: on macOS its short name, `/private/tmp/cawco-<uid>/t-<id8>`
 * ({@link shortLink}, made by {@link linkWorkspaceTmp} before the boundary
 * starts), so a socket a tool binds there (Chromium's process singleton,
 * {@link SCRATCH_SOCKET_SUFFIX}) fits whatever the username, while its files
 * stay on disk in {@link workspaceScratchDir}; elsewhere the scratch dir.
 */
export const workspaceTmpDir = (id: string): string =>
  process.platform === "darwin"
    ? join(darwinSocketRoot(), scratchLinkName(id))
    : workspaceScratchDir(id);

/** {@link workspaceTmpDir}, its short name made or made again first on macOS. */
export const linkWorkspaceTmp = (id: string): string =>
  process.platform === "darwin"
    ? shortLink(scratchLinkName(id), workspaceScratchDir(id))
    : workspaceScratchDir(id);

/** Why a socket in workspace `id`'s `TMPDIR` would not fit, or nothing ({@link socketPathProblem}). */
export const scratchSocketProblem = (id: string): string | undefined =>
  socketPathProblem(
    join(workspaceTmpDir(id), SCRATCH_SOCKET_SUFFIX),
    `A socket in workspace ${id}'s TMPDIR, as Chromium makes one,`,
    "run the agent with a shorter HOME"
  );

/**
 * The part of a workspace's state dir a command inside its boundary reads:
 * the runner's FIFO, the empty git template, on Linux without a runtime dir
 * the doors' sockets ({@link workspaceDoorDir}) and, on macOS, the shims. Read-only inside, and never a parent of the scratch dir:
 * srt binds a writable dir nested in a read carve-out back read-only (srt
 * #446).
 */
export const workspaceReadOnlyDir = (id: string): string =>
  join(workspaceStateDir(id), "ro");

/**
 * macOS's root for every workspace's sockets ({@link workspaceDoorDir}):
 * `/private/tmp/cawco-<uid>`, this user's own (0700, made and checked by the
 * agent before a socket goes in it, tool-door.ts `socketPlace`). A real path,
 * as the Seatbelt profile matches paths (`/tmp` is a link to it), and one
 * whose sockets a workspace reaches only by name: the profile denies every
 * socket under `/private/tmp` (boundary.ts `LAUNCHD_SOCKETS`) but the doors
 * it names, and a workspace writes nothing there.
 */
export const darwinSocketRoot = (): string => {
  const uid = process.getuid?.();
  if (uid === undefined) {
    throw new Error("this process has no user id to name its socket dir by");
  }
  return join("/private/tmp", `cawco-${uid}`);
};

/**
 * {@link darwinSocketRoot}, made if it is not there (a restart clears
 * `/private/tmp`) and then taken only as this user's own: a dir, not a link,
 * owned by this uid, with no group or other bits. `/private/tmp` is every
 * local user's to write, so a root someone else made first (to read or stand
 * in for a workspace's doors, or to point a short name elsewhere) is refused
 * in words that say what to remove. Its path.
 */
export const ownSocketRoot = (): string => {
  const root = darwinSocketRoot();
  try {
    mkdirSync(root, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }
  }
  const found = lstatSync(root);
  // biome-ignore lint/suspicious/noBitwiseOperators: a mode's permission bits
  const mode = found.mode & 0o777;
  // Its group and other bits: none.
  const open = mode % 0o100 !== 0;
  if (!found.isDirectory() || found.uid !== process.getuid?.() || open) {
    throw new Error(
      `${root} is not this user's own dir (a ${found.isDirectory() ? "dir" : "link or file"} owned by uid ${found.uid}, mode ${mode.toString(8)}): remove it, and the agent makes it again`
    );
  }
  return root;
};

/**
 * macOS's short name for a dir whose path is too long to hold a socket's:
 * `<root>/<name>` in {@link ownSocketRoot}, a link to `target`, the dir
 * itself staying where it is. A socket bound or reached through it is the
 * file in `target`; only the path string handed to bind() and connect() is
 * short. Made, or made again (a restart clears `/private/tmp`), or pointed
 * back at `target`, before its path is returned, by whichever side asks
 * first. macOS's tmp_cleaner never takes it: it deletes regular files and
 * empty dirs three days old (`find … -type f … -delete`, `-type d … -empty`,
 * https://jrb.nz/posts/tmp-macos/), and a link is neither.
 */
export const shortLink = (name: string, target: string): string => {
  const link = join(ownSocketRoot(), name);
  const pointsAt = (): string | undefined => {
    try {
      return readlinkSync(link);
    } catch (error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === "ENOENT") {
        return;
      }
      if (code === "EINVAL") {
        throw new Error(
          `${link} is not a link (only this user writes ${darwinSocketRoot()}): remove it, and the agent makes the link again`,
          { cause: error }
        );
      }
      throw error;
    }
  };
  const found = pointsAt();
  if (found === target) {
    return link;
  }
  if (found !== undefined) {
    unlinkSync(link);
  }
  try {
    symlinkSync(target, link);
  } catch (error) {
    // Another process made it first: it is right if it names the same dir.
    if (
      (error as NodeJS.ErrnoException).code !== "EEXIST" ||
      pointsAt() !== target
    ) {
      throw error;
    }
  }
  return link;
};

/** The short name of sessiond's dir (`~/.cawco`) on macOS ({@link shortLink}). */
export const SESSIOND_LINK = "c";

/** The short name of workspace `id`'s scratch dir on macOS ({@link shortLink}). */
const scratchLinkName = (id: string): string => `t-${id.slice(0, 8)}`;

/**
 * Where a workspace's unix sockets are: its tool door, its git door and its
 * judges'. A socket's path holds at most {@link UNIX_SOCKET_PATH_MAX} bytes,
 * and one in the state dir passes that under a HOME longer than 17 bytes
 * (`~/.cawco/workspaces/<id>/ro/judge-<16 hex>.sock` is HOME + 86), so never
 * under home:
 *  - on Linux, a dir of its own under `$XDG_RUNTIME_DIR`, as srt keeps its
 *    own sockets there, named by the id's first 8 characters, as its clone
 *    (`<repo>-<id8>`) and branch (`ws/<id8>`) are;
 *  - on macOS, the id's own dir under {@link darwinSocketRoot}: the whole
 *    id, so no two workspaces share one, and the judge's path is 86 bytes for
 *    uid 501, 95 for the longest uid;
 *  - on Linux without a runtime dir, the read-only dir.
 * Each is read-only inside the boundary, as the read-only dir is (a
 * workspace never binds a socket in its own door's place), and goes when the
 * boundary closes. The doors are read inside the boundary; the judges are
 * asked from the host.
 */
export const workspaceDoorDir = (id: string): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (process.platform === "linux" && runtime) {
    return join(runtime, "cawco-ws", id.slice(0, 8));
  }
  if (process.platform === "darwin") {
    return join(darwinSocketRoot(), id);
  }
  return workspaceReadOnlyDir(id);
};

/**
 * The most bytes a unix socket's path holds: `sun_path` is 108 bytes on
 * Linux and 104 on macOS, its NUL included. A longer one is cut short by
 * whoever packs it (perl's `pack_sockaddr_un` among them), so a listener
 * and a caller never meet.
 */
export const UNIX_SOCKET_PATH_MAX = process.platform === "darwin" ? 103 : 107;

/**
 * Why `path` cannot be a unix socket's, or nothing: refused up front, in
 * words that say what to change.
 */
export const socketPathProblem = (
  path: string,
  what: string,
  fix = process.platform === "linux"
    ? "give the agent a short XDG_RUNTIME_DIR"
    : "run the agent with a shorter HOME"
): string | undefined => {
  const bytes = Buffer.byteLength(path);
  if (bytes <= UNIX_SOCKET_PATH_MAX) {
    return;
  }
  return `${what} ${path} is ${bytes} bytes, past the ${UNIX_SOCKET_PATH_MAX} a unix socket's path holds: ${fix}`;
};

/** The name of a workspace's policy file in its state dir. */
export const WORKSPACE_POLICY_NAME = "policy.json";

/** Where a workspace's policy is written (`workspace-policy.ts`), for every harness to judge its file tools by. */
export const workspacePolicyFile = (id: string): string =>
  join(workspaceStateDir(id), WORKSPACE_POLICY_NAME);

/**
 * The Claude accounts a workspace's sessions have run on, a JSON list of
 * account ids the agent adds to as each session spawns there
 * (`boundaryFor`), so the workspace reads each one's user layer by the path
 * its session is given (`workspacePolicy`). In the state dir, which nothing
 * inside the boundary writes.
 */
export const workspaceAccountsFile = (id: string): string =>
  join(workspaceStateDir(id), "accounts.json");

/**
 * The project a workspace's work belongs to, a JSON string of its id the
 * agent writes as the workspace is cut and as each work item's session
 * spawns there (`boundaryFor`), so the workspace reads that project's folder
 * on the hub's machine (`workspacePolicy`). In the state dir, which nothing
 * inside the boundary writes.
 */
/**
 * Workspace `id`'s upstream rule (upstream-guard.ts `UpstreamRule`), in the
 * part of its state dir a command reads: its shims judge by it inside the
 * boundary, and its executor and git door outside it.
 */
export const workspaceUpstreamRuleFile = (id: string): string =>
  join(workspaceReadOnlyDir(id), "upstream.json");

export const workspaceProjectFile = (id: string): string =>
  join(workspaceStateDir(id), "project.json");

/**
 * The hub's sqlite file, as an absolute path: `CAWCO_DB_PATH`, else
 * `cawco.db` in {@link hubDataDir}. The one rule every end reads it by: the
 * hub itself, the unit the CLI writes for it, the binary installer, and the
 * agent's workspace policy (its data dir denied, its projects dir's folders).
 * Everything else the hub keeps lies beside it.
 */
export const hubDbPath = (): string =>
  resolve(process.env.CAWCO_DB_PATH ?? join(hubDataDir(), "cawco.db"));

/**
 * Where the hub keeps every project's folder: `projects/` beside its
 * database ({@link hubDbPath}). Only on the hub's machine does it exist.
 */
export const hubProjectsDir = (): string =>
  join(dirname(hubDbPath()), "projects");

/**
 * The caches a workspace writes besides its clone and scratch dir: the
 * workspaces' own cache, and on macOS the provisioning profile folders
 * automatic signing fills. Every host cache is read-only to a workspace: a
 * host process runs what is in them.
 */
export const workspaceCaches = (): string[] => [
  workspaceCacheDir(),
  ...(process.platform === "darwin"
    ? [
        join(
          homedir(),
          "Library",
          "Developer",
          "Xcode",
          "UserData",
          "Provisioning Profiles"
        ),
        join(homedir(), "Library", "MobileDevice", "Provisioning Profiles"),
      ]
    : []),
];

/**
 * macOS: the Xcode bundle `xcode-select -p` names (`…/Xcode-27.2-beta.app`
 * for `…/Xcode-27.2-beta.app/Contents/Developer`), as a real path, with every
 * platform and toolchain in it: a workspace builds with the Xcode the owner
 * selected, wherever it is installed, under home included. None elsewhere, or
 * when no developer dir is selected or it is not in an app bundle (the
 * Command Line Tools alone, outside home).
 */
export const darwinDeveloperBundle = async (): Promise<string[]> => {
  if (process.platform !== "darwin") {
    return [];
  }
  const selected = await Bun.$`/usr/bin/xcode-select -p`.quiet().nothrow();
  const developer = selected.stdout.toString().trim();
  const at = developer.lastIndexOf(".app/");
  return selected.exitCode === 0 && at > 0
    ? [developer.slice(0, at + ".app".length)]
    : [];
};

/**
 * macOS: the user's temp and cache folders (`getconf DARWIN_USER_TEMP_DIR`,
 * `DARWIN_USER_CACHE_DIR`), which Apple's build tools write wherever they
 * run, so a workspace writes them too. None elsewhere.
 */
export const darwinUserDirs = async (): Promise<string[]> =>
  process.platform === "darwin"
    ? await Promise.all(
        ["DARWIN_USER_TEMP_DIR", "DARWIN_USER_CACHE_DIR"].map(async (name) => {
          const path = (await Bun.$`getconf ${name}`.quiet()).text().trim();
          if (!path.startsWith("/")) {
            throw new Error(`getconf ${name} did not return an absolute path`);
          }
          return path;
        })
      )
    : [];

/**
 * Where the impeccable skill's engine is installed on the host, one folder
 * per version (`<version>/impeccable`), at the path its launcher computes
 * for the version its skill pins (`${IMPECCABLE_HOME:-$HOME/.impeccable}/bin/
 * <version>`, skills/impeccable/scripts/impeccable). Only `bin`: the cache
 * root beside it is the launcher's own to write.
 */
const hostImpeccableEngines = (): string =>
  join(process.env.IMPECCABLE_HOME ?? join(homedir(), ".impeccable"), "bin");

/**
 * The host's tool caches that skills and their commands run binaries from,
 * which every workspace reads at the same path, read-only (workspace-policy.ts
 * `workspacePolicy`): Playwright's browsers and the impeccable skill's
 * engines. The home dir stays hidden around them; a skill launcher that
 * finds its binary here never downloads (inside a workspace a download is
 * refused: it writes nothing under home, and on 2026-10-14 the curl first on
 * the Linux host's PATH, zerobrew's, verified no certificate), so each host
 * installs what its skills pin, and one it lacks is refused in the launcher's
 * own words. A dir that holds a tool's keys or settings (`~/.heygen`,
 * `~/.media`) is never one of these; a new cache joins by being added here.
 */
export const hostToolCaches = (): string[] => [
  hostPlaywrightBrowsers(),
  hostImpeccableEngines(),
];

/**
 * Where the host's operating system keeps its trusted CA certificates: the
 * bundles and dirs Go's crypto/x509 looks for, in its order
 * (src/crypto/x509/root_linux.go: "Possible certificate files; stop after
 * finding one"), on macOS the bundle the system ships at /etc/ssl/cert.pem.
 */
const HOST_CA_FILES: Record<string, readonly string[]> = {
  linux: [
    "/etc/ssl/certs/ca-certificates.crt", // Debian, Ubuntu, Gentoo
    "/etc/pki/tls/certs/ca-bundle.crt", // Fedora, RHEL 6
    "/etc/ssl/ca-bundle.pem", // openSUSE
    "/etc/pki/tls/cacert.pem", // OpenELEC
    "/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem", // CentOS, RHEL 7
    "/etc/ssl/cert.pem", // Alpine
  ],
  darwin: ["/etc/ssl/cert.pem"],
};
const HOST_CA_DIRS: Record<string, readonly string[]> = {
  linux: ["/etc/ssl/certs", "/etc/pki/tls/certs"],
  darwin: [],
};

/**
 * `SSL_CERT_FILE` and `SSL_CERT_DIR` naming the host's own CA store (the
 * first bundle and dir of {@link HOST_CA_FILES} and {@link HOST_CA_DIRS}
 * this host has), for every command a workspace runs: OpenSSL reads them
 * before the CA paths it was built with, so whatever binary is first on
 * PATH verifies TLS against the host's store. A curl from a relocated
 * package prefix was built with one that does not exist (zerobrew's,
 * `/home/linuxbrew/.linuxbrew/etc/openssl@3`) and verified no certificate.
 * Empty on a host that has neither.
 */
export const hostCaEnv = (): Record<string, string> => {
  const isFile = (path: string): boolean =>
    existsSync(path) && statSync(path).isFile();
  const isDir = (path: string): boolean =>
    existsSync(path) && statSync(path).isDirectory();
  const file = (HOST_CA_FILES[process.platform] ?? []).find(isFile);
  const dir = (HOST_CA_DIRS[process.platform] ?? []).find(isDir);
  return {
    ...(file ? { SSL_CERT_FILE: file } : {}),
    ...(dir ? { SSL_CERT_DIR: dir } : {}),
  };
};

/** Where Playwright's browsers are on the host: a workspace runs them from there, read-only. */
export const hostPlaywrightBrowsers = (): string =>
  process.platform === "darwin"
    ? join(homedir(), "Library", "Caches", "ms-playwright")
    : join(
        process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
        "ms-playwright"
      );

/**
 * The user's own git config dir, `~/.config/git` (`config`, `ignore`,
 * `attributes`): every workspace reads it, as it reads `~/.gitconfig`
 * (workspace-policy.ts `workspacePolicy`).
 */
export const userGitConfigDir = (): string => join(homedir(), ".config", "git");

/**
 * A workspace's own XDG config, data and state homes, in its scratch dir: so
 * made with it and gone with it (boundary.ts `makeDirs`, `closeBoundary`). A
 * CLI that writes its own state there as it starts (OpenCode makes
 * `$XDG_DATA_HOME/opencode/log` at boot) runs inside the boundary, and the
 * person's real ones (OpenCode's `auth.json`, its `opencode.json`, its
 * database) stay hidden: the boundary refuses every write under home, which
 * on macOS failed that start with EEXIST.
 */
export const workspaceXdgDirs = (
  id: string
): { config: string; data: string; state: string } => {
  const root = join(workspaceScratchDir(id), "xdg");
  return {
    config: join(root, "config"),
    data: join(root, "data"),
    state: join(root, "state"),
  };
};

/**
 * The environment every command of workspace `id` runs with for its XDG base
 * dirs: its own config, data and state homes ({@link workspaceXdgDirs}). The
 * cache home stays the workspaces' shared one ({@link workspaceCacheEnv}),
 * where the Apple build root and every tool's cache already are. Two readers
 * of the host's data home keep reading it, read-only as before: uv's managed
 * Pythons and its tools (`uv python dir`, `uv tool dir` follow
 * `XDG_DATA_HOME`), so `uv` finds the interpreters it found before and never
 * downloads one per workspace. Git's own config dir goes on being read
 * through a link in the config home (boundary.ts `makeDirs`).
 */
export const workspaceXdgEnv = (id: string): Record<string, string> => {
  const own = workspaceXdgDirs(id);
  return {
    XDG_CONFIG_HOME: own.config,
    XDG_DATA_HOME: own.data,
    XDG_STATE_HOME: own.state,
    UV_PYTHON_INSTALL_DIR: join(xdgDataHome(), "uv", "python"),
    UV_TOOL_DIR: join(xdgDataHome(), "uv", "tools"),
  };
};

/**
 * A workspace's own home for Maestro, in its scratch dir: Maestro's JVM takes
 * it as `user.home` ({@link workspaceMaestroEnv}).
 */
export const workspaceMaestroHome = (id: string): string =>
  join(workspaceScratchDir(id), "maestro");

/**
 * Maestro's JVM options for every command of workspace `id`: its home in the
 * workspace ({@link workspaceMaestroHome}) and its temp dir the workspace's
 * `TMPDIR`. Maestro has no home setting of its own: its deps go to
 * `Paths.get(System.getProperty("user.home"), ".maestro", "deps", name)`
 * (maestro-cli Unpacker.kt `binaryDependency`), its logs and sessions under
 * that home too, and its iOS driver and xcodebuild's output to
 * `java.io.tmpdir` (on macOS the per-user temp dir, every app's). Its
 * launcher passes `MAESTRO_OPTS` to `java` ("You can also use JAVA_OPTS and
 * MAESTRO_OPTS to pass JVM options to this script"), each word through
 * `xargs`, so a quoted path keeps its spaces. Its state already follows
 * `XDG_STATE_HOME` (EnvUtils.kt `xdgStateHome`). A caller that sets
 * `MAESTRO_OPTS` itself appends to this one.
 */
export const workspaceMaestroEnv = (id: string): Record<string, string> => ({
  MAESTRO_OPTS: `"-Duser.home=${workspaceMaestroHome(id)}" "-Djava.io.tmpdir=${workspaceTmpDir(id)}"`,
});

/** The environment every workspace command runs with, pointing each tool at {@link workspaceCacheDir}. */
export const workspaceCacheEnv = (): Record<string, string> => {
  const cache = workspaceCacheDir();
  return {
    BUN_INSTALL_CACHE_DIR: join(cache, "bun"),
    npm_config_cache: join(cache, "npm"),
    // node-gyp's headers. Its default is env-paths' cache dir (bin/node-gyp.js:
    // `prog.devDir = envPaths('node-gyp', { suffix: '' }).cache`): on Linux
    // `$XDG_CACHE_HOME/node-gyp`, on macOS `~/Library/Caches/node-gyp`, a host
    // cache, whatever XDG_CACHE_HOME says. It takes its options from
    // `npm_package_config_node_gyp_<key>` too (lib/node-gyp.js: "This is the
    // preferred way to set options for node-gyp since npm v11"), and npm
    // passes it through (run-script make-spawn-args.js: `...process.env`);
    // `npm_config_devdir` npm 11 warns of ("Unknown env config") and will drop.
    npm_package_config_node_gyp_devdir: join(cache, "node-gyp"),
    XDG_CACHE_HOME: join(cache, "xdg"),
    UV_CACHE_DIR: join(cache, "uv"),
    PLAYWRIGHT_BROWSERS_PATH: hostPlaywrightBrowsers(),
  };
};

/**
 * The name of a file that holds secrets wherever it lies: `.env`,
 * `.env.local`, `.envrc`, `tunnel.env`, `telegram.env.bak`. A basename
 * pattern without anchors, in the syntax JavaScript, Perl and POSIX extended
 * regexes share: Seatbelt matches it as `/(…)$` on a path. No workspace reads
 * one outside its own clone; its own repository's are copied into its clone
 * when it is cut.
 */
export const SECRET_FILE_NAME = String.raw`\.env[^/]*|[^/]*\.env(\.[^/]*)?`;

/** {@link SECRET_FILE_NAME} as a test on one file's name. */
export const isSecretFileName = (name: string): boolean =>
  new RegExp(`^(${SECRET_FILE_NAME})$`).test(name);

/**
 * The variables that name a key agent's socket: ssh-agent's, GPG's, the
 * desktop keyring's. Every workspace command runs without them, so nothing
 * inside signs or logs in with the host's keys, wherever the socket lies.
 */
export const AGENT_SOCKET_ENV = [
  "SSH_AUTH_SOCK",
  "SSH_AGENT_PID",
  "GPG_AGENT_INFO",
  "GNOME_KEYRING_CONTROL",
] as const;

/**
 * Every place on this machine that holds a credential CawCo, a harness or
 * another tool keeps. Every workspace boundary hides each one from every
 * command it runs (packages/agent/src/boundary.ts): a directory with all that
 * is in it, a file whole. A new store is hidden by adding it here; a secret
 * file a project keeps is hidden by its name ({@link SECRET_FILE_NAME}).
 */
export const credentialStores = (): string[] => {
  const home = homedir();
  return [
    // Each account's Claude Code dir (its `.credentials.json`, its
    // `.claude.json`) and each provider account's `credential.json`.
    accountsRoot(),
    // Session credentials, OpenCode's bridge credentials, redaction values.
    sessionIdentityDir(),
    // The hub's env file (its Telegram token), the release signing key, the
    // machine's key the hub admitted it with (machine-key.ts).
    cawcoConfigDir(),
    // The hub's database (fleet MCP OAuth tokens, API keys, push device
    // keys) and its backups, the transcript index.
    cawcoDataDir(),
    hubDataDir(),
    dirname(hubDbPath()),
    // Claude Code: each config dir's login (the machine's own, each
    // account's, any it was pointed at), and the fleet's MCP servers with
    // their headers and env.
    ...claudeConfigDirs().map((dir) => join(dir, ".credentials.json")),
    claudeHomeJson(),
    // OpenCode: `auth.json`, `mcp-auth.json`; `opencode.json` with provider
    // keys and MCP headers.
    join(xdgDataHome(), "opencode"),
    join(xdgConfigHome(), "opencode"),
    // pi: `auth.json`, the CLIProxyAPI key; CLIProxyAPI's own logins.
    piAgentDir(),
    join(home, ".cli-proxy-api"),
    // Other agents' logins: Codex, Gemini, GitHub Copilot.
    join(home, ".codex"),
    join(home, ".gemini"),
    join(xdgConfigHome(), "github-copilot"),
    // Other tools' tokens. `gh` gets its token from the executor as
    // `GH_TOKEN`, and an empty config dir of its own (`GH_CONFIG_DIR`), so
    // `gh auth git-credential` hands git that token inside.
    join(xdgConfigHome(), "gh", "hosts.yml"),
    // uv's plaintext credentials store (`uv auth login`): "$XDG_DATA_HOME/uv/
    // credentials or $HOME/.local/share/uv/credentials on Unix"
    // (docs.astral.sh/uv/reference/cli, `uv auth dir`). The uv dir around it
    // is a tool tree a workspace reads (`homeToolchains`).
    join(xdgDataHome(), "uv", "credentials"),
    ...(process.env.UV_CREDENTIALS_DIR ? [process.env.UV_CREDENTIALS_DIR] : []),
    join(home, ".git-credentials"),
    join(home, ".netrc"),
    join(home, ".npmrc"),
    join(home, ".pypirc"),
    join(home, ".docker", "config.json"),
    join(home, ".cargo", "credentials.toml"),
    join(home, ".cargo", "credentials"),
    join(home, ".aws"),
    join(home, ".kube"),
    join(xdgConfigHome(), "gcloud"),
    join(home, ".cloudflared"),
    join(home, ".wrangler"),
    join(xdgConfigHome(), ".wrangler"),
    // SSH: every private key, and the agent sockets a tool may leave there.
    // A workspace reaches another machine only through CawCo, never by ssh.
    join(home, ".ssh"),
    join(home, ".gnupg"),
    join(home, ".password-store"),
    // Shell histories, where a pasted token stays.
    join(home, ".bash_history"),
    join(home, ".zsh_history"),
    join(home, ".local", "share", "fish", "fish_history"),
    // Browser profiles: cookies, saved logins.
    join(home, ".mozilla"),
    ...(process.platform === "darwin"
      ? [
          // The login keychain, where Claude Code keeps each account's login
          // and `gh` its token.
          join(home, "Library", "Keychains", "login.keychain-db"),
          join(home, "Library", "Keychains", "login.keychain"),
          join(home, "Library", "Application Support", "Google", "Chrome"),
          join(home, "Library", "Application Support", "Chromium"),
          join(home, "Library", "Application Support", "Firefox"),
          join(home, "Library", "Cookies"),
        ]
      : [
          // The desktop keyring, where `gh` and other tools keep tokens.
          join(xdgDataHome(), "keyrings"),
          join(xdgConfigHome(), "google-chrome"),
          join(xdgConfigHome(), "chromium"),
        ]),
  ];
};
