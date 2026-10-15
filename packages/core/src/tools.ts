/**
 * The tool catalog: workflow CLIs cawco can put on a machine (NEW.md §10).
 *
 * The catalog is data and the agent's executor is generic — adding a tool is
 * adding one {@link ToolSpec} here and nothing anywhere else. The hub decides
 * whether a machine should have a tool (its policy table); the agent decides
 * how to get it there (the first eligible method for its platform); the
 * dashboard only renders {@link ToolStatus} rows it is handed.
 */

/** The platforms a daemon reports itself as — `platform()` from `node:os`. */
export type ToolPlatform = "linux" | "darwin" | "win32";

/**
 * One way to put a tool on a machine. Methods are tried in catalog order; the
 * first whose `platforms` match and whose `needs` is present wins. There is no
 * fallback past a method that ran and failed — a half-applied installer chain
 * is harder to reason about than one honest failure.
 */
export interface ToolInstallMethod {
  /**
   * The install command, run through the Bun shell. Exactly one of `command`
   * and `native` is set.
   */
  command?: string;
  /** Names the method in status and errors: 'curl script', 'npm', 'winget'. */
  label: string;
  /**
   * The name of a routine the agent implements in code, for the installs a
   * portable shell one-liner cannot express (resolving the right Node tarball
   * for an arch, say). The escape hatch that keeps `command` honest.
   */
  native?: string;
  /**
   * A binary that must already be on the machine for this method to be
   * eligible — 'npm', 'brew', 'winget'. Absent means always eligible.
   */
  needs?: string;
  /**
   * The command when the policy pins a version — `{version}` becomes the pin.
   * Kept apart from `command` because "latest" is not a version most
   * installers accept: the curl scripts and winget want no version argument
   * at all when they should take the newest.
   */
  pinnedCommand?: string;
  platforms: ToolPlatform[];
}

/** A catalog tool another tool needs first, with the version floor it needs. */
export interface ToolRequirement {
  id: string;
  /** Semver floor, compared major-first against the probed version. */
  min?: string;
}

export interface ToolSpec {
  /** The executable whose presence means installed. */
  bin: string;
  /**
   * True for tools that exist only to satisfy a `requires` — they stay out of
   * the policy list until something needs them, and the dashboard shows them
   * only where they explain another tool's state.
   */
  dependencyOnly?: boolean;
  /**
   * The one version this fleet runs, for a tool CawCo's own code is built
   * against: every install puts exactly this one on the machine, whatever the
   * policy pins, and a probe that finds another reports it failed.
   */
  exactVersion?: string;
  homepage: string;
  id: string;
  /** Ordered by preference. Empty for a platform = unsupported there. */
  install: ToolInstallMethod[];
  /** What the dashboard calls it. */
  name: string;
  /**
   * Catalog tools that must be present first. A missing requirement installs
   * automatically (depth 1 — requirements do not have requirements); one that
   * is present but below `min` does not: silently replacing a machine's Node
   * is ruder than telling the user exactly what is too old.
   */
  requires?: ToolRequirement[];
  /** Probe for the version; the first `x.y.z` in its output is the answer. */
  versionCommand: string;
  /**
   * Where installers put the binary when it lands off the daemon's PATH —
   * probed with `~` expanded, after `which` misses. An installer that edits
   * shell rc files fixes the *user's* PATH, never a daemon that is already
   * running.
   */
  wellKnownPaths?: string[];
}

/** What a probe or an install attempt found. The unit every surface renders. */
export type ToolState =
  "installed" | "missing" | "installing" | "failed" | "unsupported";

export interface ToolStatus {
  /** When this was learnt, ms epoch. */
  at: number;
  /**
   * `failed`: the tail of the installer's stderr. `unsupported`: what is
   * missing, named exactly — 'needs npm (Node 20+)' beats a grey chip.
   */
  detail?: string;
  id: string;
  /** The {@link ToolInstallMethod.label} that installed it or failed trying. */
  method?: string;
  state: ToolState;
  /** Set when `installed`. */
  version?: string;
}

/** The hub's per-tool policy row: what the fleet is supposed to have. */
export interface ToolPolicy {
  id: string;
  /** Exact version to install; null rides `{version}` as `latest`. */
  pinnedVersion: string | null;
  /** Required tools install automatically wherever a register finds them missing. */
  required: boolean;
}

/**
 * The one OpenCode release CawCo runs: its adapter speaks this release's
 * server API, loads a plugin written for its plugin API, and pins
 * `@opencode/client` to it (packages/agent/package.json). 2.0.29 gives
 * plugins `ctx.permission.assert` ("Plugins had no in-process way to ask for
 * permission", anomalyco/opencode#54930), which the plugin's `shell` asks
 * through.
 */
export const OPENCODE_VERSION = "2.0.29";

/**
 * The catalog. Order is display order. Verified against each tool's official
 * docs on 2026-08-06 — when an entry drifts from what an installer really
 * does, fix the entry and note the drift in NEW.md.
 */
export const TOOL_CATALOG: ToolSpec[] = [
  {
    id: "opencode",
    name: "opencode",
    homepage: "https://opencode.ai",
    // OpenCode 2.0's package (`@opencode/cli`) has two bins, `opencode` and
    // `opencode2` (npm view @opencode/cli@2.0.28 bin); 1.x never had
    // `opencode2`, so this name finds only 2.0, wherever a 1.x `opencode`
    // still sits on the PATH.
    bin: "opencode2",
    versionCommand: "opencode2 --version",
    exactVersion: OPENCODE_VERSION,
    install: [
      // 2.0 is the `@opencode/cli` package, a native binary per platform in
      // its optional dependencies. 1.x's npm package (`opencode-ai`) installs
      // an `opencode` bin of its own, which npm refuses to overwrite: it goes
      // first ("Remove a package-managed V1 installation before installing
      // V2", opencode.ai/v2/docs/migrate-v1).
      {
        label: "npm",
        platforms: ["linux", "darwin", "win32"],
        needs: "npm",
        command:
          "npm uninstall -g opencode-ai && npm install -g @opencode/cli@{version}",
        pinnedCommand:
          "npm uninstall -g opencode-ai && npm install -g @opencode/cli@{version}",
      },
    ],
    requires: [{ id: "node" }],
  },
  {
    id: "antigravity",
    name: "Antigravity CLI",
    homepage: "https://antigravity.google",
    bin: "agy",
    versionCommand: "agy --version",
    // The official scripts: ~/.local/bin on linux/darwin, LocalAppData on
    // Windows. A static Go binary — no runtime to require.
    wellKnownPaths: ["~/.local/bin/agy", "~/AppData/Local/agy/bin/agy.exe"],
    install: [
      // Verified 2026-08-06 (v1.1.10). The installer script takes no version
      // argument — the binary self-updates (AGY_CLI_DISABLE_AUTO_UPDATE=true
      // turns that off), so a policy pin is best-effort here and only winget
      // can honour one. Auth stays the user's: Google sign-in into the OS
      // keyring, once per machine (`agy` prints an URL + code over SSH);
      // Google says API keys are not supported (antigravity-cli#78).
      {
        label: "curl script",
        platforms: ["linux", "darwin"],
        command: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
      },
      {
        label: "winget",
        platforms: ["win32"],
        needs: "winget",
        command:
          "winget install -e --id Google.AntigravityCLI --silent --accept-package-agreements --accept-source-agreements",
        pinnedCommand:
          "winget install -e --id Google.AntigravityCLI --version {version} --silent --accept-package-agreements --accept-source-agreements",
      },
      {
        label: "powershell script",
        platforms: ["win32"],
        needs: "powershell",
        command:
          'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://antigravity.google/cli/install.ps1 | iex"',
      },
    ],
  },
  {
    id: "node",
    name: "Node.js",
    homepage: "https://nodejs.org",
    bin: "node",
    versionCommand: "node --version",
    dependencyOnly: true,
    install: [
      {
        label: "brew",
        platforms: ["darwin", "linux"],
        needs: "brew",
        command: "brew install node",
      },
      {
        label: "winget",
        platforms: ["win32"],
        needs: "winget",
        command:
          "winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements",
      },
      // No brew and no sudo is the common Linux daemon: resolve the latest
      // LTS tarball for this arch and unpack it into ~/.local — code, because
      // no portable one-liner reads nodejs.org/dist/index.json honestly.
      {
        label: "official tarball",
        platforms: ["linux"],
        native: "node-tarball",
      },
    ],
  },
];

export const toolSpec = (id: string): ToolSpec | undefined =>
  TOOL_CATALOG.find((spec) => spec.id === id);
