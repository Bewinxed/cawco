/** What a workspace may read or write of the host: its caches, its toolchains and every store that holds a credential. */

import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { hostEnvironment } from "../session-env";
import { systemProgram } from "../workspace-needs";
import {
  cawcoConfigDir,
  cawcoDataDir,
  sessionIdentityDir,
  xdgConfigHome,
  xdgDataHome,
} from "./cawco";
import { accountsRoot, claudeConfigDirs, claudeHomeJson } from "./claude";
import { piAgentDir } from "./harnesses";
import { hubDataDir, hubDbPath } from "./hub";
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
    // The hub's env file, the release signing key, the
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
