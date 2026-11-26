/** What a workspace may read or write of the host: its caches, its toolchains and every store that holds a credential. */

import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import type { CredentialPlace } from "../harness/descriptor";
import { HARNESS_PLUGINS } from "../harness/kinds";
import { hostEnvironment } from "../session-env";
import { unhandled } from "../unhandled";
import { systemProgram } from "../workspace-needs";
import { redactionStoreDir, sessionIdentityDir } from "./cawco";
import { accountsRoot, claudeConfigDirs, claudeHomeJson } from "./claude";
import { harnessStoresDir, piAgentDir } from "./harnesses";
import { hubDbPath } from "./hub";
import {
  cawcoConfigDir,
  cawcoDataDir,
  hubDataDir,
  xdgConfigHome,
  xdgDataHome,
} from "./roots";
import { workspaceCacheDir } from "./workspace";

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
  const selected = await Bun.$`${systemProgram("xcode-select")} -p`
    .env(hostEnvironment())
    .quiet()
    .nothrow();
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
          const path = (
            await Bun.$`getconf ${name}`.env(hostEnvironment()).quiet()
          )
            .text()
            .trim();
          if (!path.startsWith("/")) {
            throw new Error(`getconf ${name} did not return an absolute path`);
          }
          return path;
        })
      )
    : [];

/**
 * The host's tool caches that skills and their commands run binaries from,
 * which every workspace reads at the same path, read-only (workspace-policy.ts
 * `workspacePolicy`): Playwright's browsers. The home dir stays hidden around
 * them, so each host installs what its skills pin. A tool whose launcher
 * fetches its own binary into a folder an env var names goes in the
 * workspaces' cache instead ({@link workspaceCacheEnv}), as impeccable's
 * engines do. A dir that holds a tool's keys or settings (`~/.heygen`,
 * `~/.media`) is never one of these; a new cache joins by being added here.
 */
export const hostToolCaches = (): string[] => [hostPlaywrightBrowsers()];

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
 * The name of a file that holds secrets wherever it lies: `.env`,
 * `.env.local`, `.envrc`, `tunnel.env`, `hub.env.bak`. A basename
 * pattern without anchors, in the syntax JavaScript, Perl and POSIX extended
 * regexes share: Seatbelt matches it as `/(…)$` on a path. No workspace reads
 * one outside its own clone; its own repository's are copied into its clone
 * when it is cut.
 */
const SECRET_FILE_NAME = String.raw`\.env[^/]*|[^/]*\.env(\.[^/]*)?`;

/** {@link SECRET_FILE_NAME} as a test on one file's name. */
export const isSecretFileName = (name: string): boolean =>
  new RegExp(`^(${SECRET_FILE_NAME})$`, "u").test(name);

/**
 * The paths one place a harness keeps its logins in names on this machine
 * (its descriptor's `credentialPlaces`, which no workspace reads).
 */
const credentialPaths = (place: CredentialPlace): string[] => {
  switch (place.in) {
    case "claude-config-dirs":
      return claudeConfigDirs().map((dir) => join(dir, place.file));
    case "claude-home-json":
      return [claudeHomeJson()];
    case "xdg-data":
      return [join(xdgDataHome(), place.path)];
    case "xdg-config":
      return [join(xdgConfigHome(), place.path)];
    case "pi-agent-dir":
      return [piAgentDir()];
    case "home":
      return [join(homedir(), place.path)];
    default:
      return unhandled("credential place", place);
  }
};

/**
 * The dir an env var of this process names, `~` and `~/…` expanded as the
 * tools below expand them; none when it is unset, empty or not absolute.
 */
const envDir = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  if (!value) {
    return;
  }
  if (value === "~") {
    return homedir();
  }
  const path = value.startsWith("~/") ? join(homedir(), value.slice(2)) : value;
  return isAbsolute(path) ? path : undefined;
};

/** {@link envDir} as a list: the dir, or nothing. */
const envDirs = (name: string): string[] => {
  const dir = envDir(name);
  return dir ? [dir] : [];
};

/**
 * Where a VS Code fork keeps its user data on this platform:
 * `~/Library/Application Support/<app>` on macOS, `$XDG_CONFIG_HOME/<app>`
 * elsewhere. Its `User/globalStorage/state.vscdb` holds the editor's sign-in.
 */
const editorDataDir = (app: string): string =>
  process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", app)
    : join(xdgConfigHome(), app);

/**
 * Where coding agents CawCo does not run keep their sign-ins, which a person
 * is likely to have beside it and no workspace reads ({@link credentialStores}).
 * Each entry names its source; a dir an env var moves is hidden where the var
 * puts it and at its default.
 */
const OTHER_AGENT_CREDENTIALS: Record<string, () => string[]> = {
  // Oh My Pi (omp): `<root>/agent/agent.db` (every sign-in),
  // `<root>/profiles/<name>/agent/agent.db`, `<root>/auth-broker.token`,
  // `<root>/auth-gateway.token`, `<agent>/secret-placeholder.key`, the root
  // `~/<PI_CONFIG_DIR or .omp>`; once migrated to XDG, `agent.db` in
  // `$XDG_DATA_HOME/omp` and the key in `$XDG_STATE_HOME/omp`. The dirs of
  // its runtime state (sockets, logs) go with them. Its
  // `PI_CODING_AGENT_DIR` override is pi's (its descriptor's `credentialPlaces`).
  // github.com/can1357/oh-my-pi packages/utils/src/dirs.ts (`getBaseConfigRoot`,
  // `DirResolver`, `getAgentDbPath`, `getSecretPlaceholderKeyPath`),
  // packages/ai/src/auth-broker/discover.ts, coding-agent/src/cli/auth-gateway-cli.ts.
  omp: () => [
    join(homedir(), ".omp"),
    ...(process.env.PI_CONFIG_DIR
      ? [join(homedir(), process.env.PI_CONFIG_DIR)]
      : []),
    join(xdgDataHome(), "omp"),
    join(envDir("XDG_STATE_HOME") ?? join(homedir(), ".local", "state"), "omp"),
    // The auth broker's sign-ins, encrypted with its token, cached
    // (`getAuthBrokerSnapshotCachePath`).
    join(
      envDir("XDG_CACHE_HOME") ?? join(homedir(), ".cache"),
      "omp",
      "cache",
      "auth-broker-snapshot.enc"
    ),
    ...envDirs("OMP_AUTH_BROKER_SNAPSHOT_CACHE"),
  ],
  // Hermes Agent: `.env` (API keys), `auth.json` (OAuth), `profiles/*/` with
  // their own, and Slack, Google and WhatsApp tokens beside them, in
  // `$HERMES_HOME`, default `~/.hermes` (hermes-agent.nousresearch.com/docs/
  // user-guide/configuration, reference/environment-variables; hermes_cli/auth.py).
  hermes: () => [join(homedir(), ".hermes"), ...envDirs("HERMES_HOME")],
  // T3 Code: server secrets in `<state>/secrets`, each provider's own home
  // (Codex's, Antigravity's sign-in) in `<state>/providers`, the state dir
  // `userdata` or `dev` under `$T3CODE_HOME`, default `~/.t3`
  // (github.com/pingdotgg/t3code apps/server/src/config.ts `deriveServerPaths`,
  // os-jank.ts `resolveBaseDir`, provider/antigravityAuthSupport.ts).
  t3: () =>
    [join(homedir(), ".t3"), ...envDirs("T3CODE_HOME")].flatMap((base) =>
      ["userdata", "dev"].flatMap((state) => [
        join(base, state, "secrets"),
        join(base, state, "providers"),
      ])
    ),
  // Cursor: the CLI's `auth.json` (`$XDG_CONFIG_HOME/cursor` on Linux,
  // `~/.cursor` on macOS beside the keychain), the editor's
  // `User/globalStorage/state.vscdb` (`cursorAuth/accessToken`)
  // (docs.rs/ai-usagebar cursor::db, docs.rs/quotas auth/cursor.rs).
  cursor: () => [
    join(xdgConfigHome(), "cursor", "auth.json"),
    join(homedir(), ".cursor", "auth.json"),
    join(editorDataDir("Cursor"), "User", "globalStorage"),
  ],
  // Windsurf, now Devin Desktop: the editor's `state.vscdb`
  // (`windsurfAuthStatus`), the Codeium plugins' `~/.codeium/config.json`,
  // the Devin CLI's `devin/credentials.toml` in the data dir
  // (seanthegeek.net/doubleagent/research/windsurf.html; github.com/dwgx/
  // WindsurfAPI src/dashboard/local-windsurf.js; oh-my-pi
  // packages/ai/src/registry/oauth/devin-cli.ts).
  windsurf: () => [
    join(editorDataDir("Windsurf"), "User", "globalStorage"),
    join(editorDataDir("Devin"), "User", "globalStorage"),
    join(homedir(), ".codeium", "config.json"),
    join(xdgDataHome(), ".codeium", "config.json"),
    join(xdgDataHome(), "devin", "credentials.toml"),
    join(
      homedir(),
      "Library",
      "Application Support",
      "devin",
      "credentials.toml"
    ),
  ],
  // Antigravity: the editor's `state.vscdb` (`antigravityAuthStatus`,
  // `antigravityUnifiedStateSync.oauthToken`, unencrypted), under its old and
  // new names (discuss.ai.google.dev/t/186209; github.com/robinebers/openusage
  // PR 508). agy keeps its sign-in in `~/.gemini`, the app in the keyring.
  antigravity: () => [
    join(editorDataDir("Antigravity"), "User", "globalStorage"),
    join(editorDataDir("Antigravity IDE"), "User", "globalStorage"),
  ],
  // Kiro: the CLI's `data.sqlite3` (`auth_kv`) in `kiro-cli` under the data
  // dir (github.com/kirodotdev/Kiro issue 4847; github.com/vulnetix/cli
  // pkg/kiroauth/import.go). The editor's token is in `~/.aws/sso/cache`.
  kiro: () => [
    join(xdgDataHome(), "kiro-cli"),
    join(homedir(), "Library", "Application Support", "kiro-cli"),
  ],
  // Grok Build (xAI's `grok`): `auth.json`, `mcp_credentials.json`, model
  // keys in `config.toml`, in `$GROK_HOME`, default `~/.grok`
  // (github.com/xai-org/grok-build xai-grok-pager/docs/user-guide/
  // 02-authentication.md; x.ai/cli/install.sh).
  grok: () => [join(homedir(), ".grok"), ...envDirs("GROK_HOME")],
};

/**
 * Every place on this machine that holds a credential CawCo, a harness or
 * another tool keeps. Every workspace boundary hides each one from every
 * command it runs (packages/agent/src/boundary/): a directory with all that
 * is in it, a file whole. A new store is hidden by adding it here; a secret
 * file a project keeps is hidden by its name ({@link SECRET_FILE_NAME}).
 */
export const credentialStores = (): string[] => {
  const home = homedir();
  return [
    // Each account's Claude Code dir (its `.credentials.json`, its
    // `.claude.json`) and each provider account's `credential.json`.
    accountsRoot(),
    // Session credentials, OpenCode's bridge credentials, the host key.
    sessionIdentityDir(),
    // The harness stores CawCo keeps (each account's OpenCode server's data
    // home, its database and credential in it): denied in their own right,
    // as the session credentials are, not only as a part of the data dir.
    harnessStoresDir(),
    // The agent's redaction store: every session credential that may still
    // grant something, kept on disk until the hub says it is revoked.
    redactionStoreDir(),
    // The hub's env file, the release signing key, the
    // machine's key the hub admitted it with (machine-key.ts).
    cawcoConfigDir(),
    // The hub's database (fleet MCP OAuth tokens, API keys, push device
    // keys) and its backups, the transcript index.
    cawcoDataDir(),
    hubDataDir(),
    dirname(hubDbPath()),
    // Each harness's own logins (its descriptor's `credentialPlaces`).
    ...HARNESS_PLUGINS.flatMap((plugin) =>
      plugin.credentialPlaces.flatMap(credentialPaths)
    ),
    // Other agents' logins: GitHub Copilot. (Gemini CLI's `~/.gemini` is
    // agy's too, held by agy's descriptor.)
    join(xdgConfigHome(), "github-copilot"),
    // Coding agents a person keeps beside CawCo ({@link OTHER_AGENT_CREDENTIALS}).
    ...Object.values(OTHER_AGENT_CREDENTIALS).flatMap((stores) => stores()),
    // Other tools' tokens. `gh` inside runs with a config dir of its own
    // (`GH_CONFIG_DIR`) that sends it through the workspace's GitHub door,
    // which signs in on the host: no token of gh's enters a workspace.
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
