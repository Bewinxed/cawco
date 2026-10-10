import { type Dirent, existsSync, readdirSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
 * The dirs of a config dir that are the user's, not an account's: one copy
 * in {@link claudeHome}, each linked into every account dir. Each is a
 * global-scope entry of https://code.claude.com/docs/en/claude-directory
 * ("files in `~/.claude` are personal configuration that applies across all
 * your projects"), or CawCo's own (`memories`, the documents CLAUDE.md
 * links). `plans` too: plan mode writes there by default, by a random name a
 * transcript then names by its full path, so one copy keeps that path good
 * on every account.
 */
export const USER_LAYER_DIRS = [
  "memories",
  "rules",
  "skills",
  "commands",
  "agents",
  "output-styles",
  "workflows",
  "agent-memory",
  "plugins",
  "themes",
  "plans",
] as const;

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

/** CawCo's config dir: the CLI's `config.json`, the hub's env file, the release signing key. */
export const cawcoConfigDir = (): string => join(xdgConfigHome(), "cawco");

/** CawCo's data dir: the binary install, its runtime trees, the transcript index; on Linux the hub's database too. */
export const cawcoDataDir = (): string => join(xdgDataHome(), "cawco");

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

/** Where every workspace's boundary keeps its state, one dir per workspace; read-only inside the boundary. */
export const workspacesDir = (): string =>
  join(homedir(), ".cawco", "workspaces");

/** One workspace's state dir: its executor, hook, policy and boundary record. */
export const workspaceStateDir = (id: string): string =>
  join(workspacesDir(), id);

/**
 * A workspace's scratch dir, its `/tmp`: beside its state, so on disk (never
 * tmpfs) and outside its clone (never in git status).
 */
export const workspaceScratchDir = (id: string): string =>
  join(workspaceStateDir(id), "tmp");

/**
 * The part of a workspace's state dir a command inside its boundary reads:
 * the runner's FIFO, the empty git template, the tool door's socket and, on
 * macOS, the shims. Read-only inside, and a sibling of the scratch dir, never
 * its parent: srt binds a writable dir nested in a read carve-out back
 * read-only (srt #446).
 */
export const workspaceReadOnlyDir = (id: string): string =>
  join(workspaceStateDir(id), "ro");

/** The name of a workspace's policy file in its state dir. */
export const WORKSPACE_POLICY_NAME = "policy.json";

/** Where a workspace's policy is written (`workspace-policy.ts`), for every harness to judge its file tools by. */
export const workspacePolicyFile = (id: string): string =>
  join(workspaceStateDir(id), WORKSPACE_POLICY_NAME);

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

/** Where Playwright's browsers are on the host: a workspace runs them from there, read-only. */
export const hostPlaywrightBrowsers = (): string =>
  process.platform === "darwin"
    ? join(homedir(), "Library", "Caches", "ms-playwright")
    : join(
        process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
        "ms-playwright"
      );

/** The environment every workspace command runs with, pointing each tool at {@link workspaceCacheDir}. */
export const workspaceCacheEnv = (): Record<string, string> => {
  const cache = workspaceCacheDir();
  return {
    BUN_INSTALL_CACHE_DIR: join(cache, "bun"),
    npm_config_cache: join(cache, "npm"),
    // node-gyp's headers: on macOS its default is `~/Library/Caches/node-gyp`,
    // a host cache, whatever XDG_CACHE_HOME says.
    npm_config_devdir: join(cache, "node-gyp"),
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
  const dbPath = process.env.CAWCO_DB_PATH;
  return [
    // Each account's Claude Code dir (its `.credentials.json`, its
    // `.claude.json`) and each provider account's `credential.json`.
    accountsRoot(),
    // Session credentials, OpenCode's bridge credentials, redaction values.
    sessionIdentityDir(),
    // The hub's env file (its Telegram token), the release signing key.
    cawcoConfigDir(),
    // The hub's database (fleet MCP OAuth tokens, API keys, push device
    // keys) and its backups, the transcript index.
    cawcoDataDir(),
    hubDataDir(),
    ...(dbPath ? [dirname(dbPath)] : []),
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
    join(home, ".pi", "agent"),
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
