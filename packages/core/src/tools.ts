/**
 * The tool catalog: CLIs cawco can put on a machine (NEW.md §10).
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
  /** The install command, run through the Bun shell. */
  command: string;
  /**
   * How a binary this method put on a machine is told apart, from where it
   * resolves. A tool already present is installed again only with the method
   * whose footprint it bears, never a first-eligible one beside it: two
   * package managers each holding a copy is two copies on the PATH, and the
   * one that wins is not the one just installed.
   */
  footprint?: ToolFootprint;
  /** Names the method in status and errors: 'curl script', 'npm', 'winget'. */
  label: string;
  /**
   * Set on no method. Declared only because installable TestFlight builds'
   * schema has it (hub `openapi:check`); it goes in the change a TestFlight
   * build is made from, with `ToolSpec.dependencyOnly` and `requires`.
   */
  native?: string;
  /**
   * A binary that must already be on the machine for this method to be
   * eligible — 'npm', 'brew', 'winget'. Absent means always eligible. CawCo
   * never installs it: a machine without it takes the next method, or is told
   * what is missing.
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

/**
 * Where an install method leaves a tool, read from the binary the PATH finds
 * and the file it resolves to:
 * - `npm-global`: the file is under `npm root -g`;
 * - `bun-global`: the file is in a package of bun's global dir, and the PATH
 *   finds it through bun's global bin dir or beside the global dir's lockfile;
 * - `dir`: the binary or its file is under `path` (`~` expanded);
 * - `brew`: the file is in Homebrew's Cellar, under `formula`'s own dir.
 */
export type ToolFootprint =
  | { kind: "brew"; formula: string }
  | { kind: "bun-global" }
  | { kind: "dir"; path: string }
  | { kind: "npm-global" };

/** The shape of {@link ToolSpec.requires}, which no tool sets. */
export interface ToolRequirement {
  id: string;
  min?: string;
}

export interface ToolSpec {
  /** The executable whose presence means installed. */
  bin: string;
  /** Set on no tool; declared for installable apps only, as {@link ToolInstallMethod.native} is. */
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
  /**
   * The oldest version CawCo runs, for a tool whose own updates CawCo rides
   * (Claude Code updates itself): a copy older than it is reported `failed`
   * with why, and an install brings it to this version or newer.
   */
  minVersion?: string;
  /** What the dashboard calls it. */
  name: string;
  /** Set on no tool; declared for installable apps only, as {@link ToolInstallMethod.native} is. */
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
 * The oldest Claude Code CawCo runs at all (agent claude-version.ts
 * `claudeToStart`), and the floor of its catalog entry ({@link
 * ToolSpec.minVersion}). Its reason, Claude Code's CHANGELOG under 2.1.301:
 * "Fixed sign-in refresh timeouts and unexpected sign-outs after a short
 * command such as `claude auth status` or `claude plugin list` exited in the
 * middle of a token refresh". Below it, a refresh cut short can leave an
 * account dir's stored login blank (anthropics/claude-code#88583: the lock
 * "protect[s] the save, not the network call"), and every process on that
 * dir is signed out after.
 */
export const CLAUDE_VERSION_FLOOR = "2.1.301";

/**
 * The oldest pi CLI CawCo runs a pi session beside (agent tools.ts
 * `toolGate`), and the floor of its catalog entry. CawCo's pi sessions run on
 * the pi library the agent embeds (`@earendil-works/pi-coding-agent` 1.3.0,
 * packages/agent/package.json), which reads the same `~/.pi/agent/` files
 * (`auth.json`, `settings.json`, `models.json`) the person's `pi` writes.
 * Two releases changed what those files mean, pi's CHANGELOG: 1.0.3
 * "Renamed the Azure provider from `azure-openai-responses` to `azure`.
 * Rename the provider key in `auth.json` …, in `models.json`, and in
 * `settings.json`", and 1.3.0 "`models.json` overrides of the `kimi-coding`
 * base URL must now include `/v1`". A pi older than 1.3.0 reads and writes
 * them by other rules than CawCo's sessions do.
 */
export const PI_VERSION_FLOOR = "1.3.0";

const VERSION_PARTS = /^(\d+)\.(\d+)\.(\d+)/u;

/** Whether `version` (`x.y.z`, anything after it ignored) is older than `than`. */
export const olderThan = (version: string, than: string): boolean => {
  const a = VERSION_PARTS.exec(version)?.slice(1).map(Number) ?? [0, 0, 0];
  const b = VERSION_PARTS.exec(than)?.slice(1).map(Number) ?? [0, 0, 0];
  for (const [at, part] of a.entries()) {
    const other = b[at] ?? 0;
    if (part !== other) {
      return part < other;
    }
  }
  return false;
};

/**
 * The catalog. Order is display order. Verified against each tool's official
 * docs on 2026-08-06 — when an entry drifts from what an installer really
 * does, fix the entry and note the drift in NEW.md.
 */
// Each method's command runs through the Bun shell in a folder of its own
// (agent tools.ts `runMethod`). An installer script is downloaded to a file
// there and then run, never piped from `curl` into a shell: the Bun shell
// has no `pipefail` (`set` is not one of its builtins), so a pipe whose
// download failed exits 0 from the empty script, and curl's words were the
// only sign of it (a fresh machine with no route to claude.ai, stage 2 of
// the nightly at cf911c631).
export const TOOL_CATALOG: ToolSpec[] = [
  {
    id: "claude",
    name: "Claude Code",
    homepage: "https://code.claude.com",
    bin: "claude",
    versionCommand: "claude --version",
    minVersion: CLAUDE_VERSION_FLOOR,
    // The native installer's link (code.claude.com/docs/en/setup), for a
    // daemon whose PATH lacks it.
    wellKnownPaths: ["~/.local/bin/claude"],
    // No footprints: whatever put Claude Code here, its own updater is asked
    // first, as the machine's user and with no sudo ("To apply an update
    // immediately without waiting for the next background check, run:
    // claude update", code.claude.com/docs/en/setup, read 2026-10-22). The
    // same page: "Installs managed by Homebrew, WinGet, or apk report `Claude
    // is up to date!` instead", so the version is read again after it and a
    // copy still below the floor fails with what the updater said. A machine
    // without one gets the official installer, which puts the newest build in
    // ~/.local/bin, or the build a pin names ("curl -fsSL
    // https://claude.ai/install.sh | bash -s 2.1.89", the same page).
    install: [
      {
        label: "claude update",
        platforms: ["linux", "darwin", "win32"],
        needs: "claude",
        command: "claude update",
      },
      {
        label: "curl script",
        platforms: ["linux", "darwin"],
        needs: "curl",
        command:
          "curl -fsSL https://claude.ai/install.sh -o claude-install.sh && bash claude-install.sh",
        pinnedCommand:
          "curl -fsSL https://claude.ai/install.sh -o claude-install.sh && bash claude-install.sh {version}",
      },
    ],
  },
  {
    id: "opencode",
    name: "OpenCode",
    homepage: "https://opencode.ai",
    // OpenCode 2.0's package (`@opencode/cli`) has two bins, `opencode` and
    // `opencode2` (npm view @opencode/cli@2.0.28 bin); 1.x never had
    // `opencode2`, so this name finds only 2.0, wherever a 1.x `opencode`
    // still sits on the PATH.
    bin: "opencode2",
    versionCommand: "opencode2 --version",
    exactVersion: OPENCODE_VERSION,
    // The curl script's dir, for a daemon whose PATH lacks it (bun's global
    // bin is on every probe's PATH: agent tools.ts `toolPath`); then
    // Homebrew's: anomalyco/tap's opencode-v2 formula runs `bin.install
    // "opencode"` and leaves no `opencode2`, so its copy is found by the
    // formula's own `opt` link, which only 2.0 has (the 1.x formula is
    // `opencode`), on each prefix Homebrew installs to.
    wellKnownPaths: [
      "~/.opencode/bin/opencode2",
      "/opt/homebrew/opt/opencode-v2/bin/opencode",
      "/usr/local/opt/opencode-v2/bin/opencode",
      "/home/linuxbrew/.linuxbrew/opt/opencode-v2/bin/opencode",
    ],
    // The ways opencode.ai/v2/docs gives (checked 2026-10-15) that CawCo can
    // put a release on. A fresh machine gets npm, as before; one that has
    // OpenCode already gets the method that put it there.
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
        footprint: { kind: "npm-global" },
        command:
          "npm uninstall -g opencode-ai && npm install -g @opencode/cli@{version}",
        pinnedCommand:
          "npm uninstall -g opencode-ai && npm install -g @opencode/cli@{version}",
      },
      // "bun install -g --trust @opencode/cli": `--trust` lets the package's
      // postinstall pick the native binary (opencode.ai/v2/docs).
      {
        label: "bun",
        platforms: ["linux", "darwin"],
        needs: "bun",
        footprint: { kind: "bun-global" },
        command: "bun install -g --trust @opencode/cli@{version}",
        pinnedCommand: "bun install -g --trust @opencode/cli@{version}",
      },
      // The tap carries one release, so no version can be asked for: "brew
      // install formula will upgrade formula if it is already installed but
      // outdated" (docs.brew.sh/Manpage), and the probe after it says whether
      // the tap's release is the one CawCo runs.
      {
        label: "brew",
        platforms: ["darwin", "linux"],
        needs: "brew",
        footprint: { kind: "brew", formula: "opencode-v2" },
        command: "brew install anomalyco/tap/opencode-v2",
      },
      // "-v, --version <version> Install a specific version" into
      // $HOME/.opencode/bin, which it writes an `opencode2` into
      // (opencode.ai/v2/install); `--no-modify-path` leaves the user's rc
      // files alone, as the catalog's installs all do.
      {
        label: "curl script",
        platforms: ["linux", "darwin"],
        needs: "curl",
        footprint: { kind: "dir", path: "~/.opencode/bin" },
        command:
          "curl -fsSL https://opencode.ai/v2/install -o opencode-install.sh && bash opencode-install.sh --version {version} --no-modify-path",
        pinnedCommand:
          "curl -fsSL https://opencode.ai/v2/install -o opencode-install.sh && bash opencode-install.sh --version {version} --no-modify-path",
      },
    ],
  },
  {
    id: "pi",
    name: "pi",
    homepage: "https://pi.dev",
    bin: "pi",
    versionCommand: "pi --version",
    minVersion: PI_VERSION_FLOOR,
    // Where pi's installer links `pi` (pi.dev/install.sh read 2026-10-22,
    // `select_managed_path_bin_dir`: "$managed_agent_dir/bin"|"$HOME/.local/bin"
    // …), for a daemon whose PATH lacks it.
    wellKnownPaths: ["~/.local/bin/pi", "~/.pi/agent/bin/pi"],
    // As Claude Code's: pi's own updater first, then its installer. pi's
    // docs/quickstart.md (1.3.0): "curl -fsSL https://pi.dev/install.sh |
    // sh … The installer pins all dependencies and updates Pi with `pi
    // update`", and "`pi update` cannot update a Nix installation", so the
    // version is read again after it. With no terminal the installer goes on
    // unasked ("No terminal detected; continuing without confirmation.", its
    // `choose_pi_action`), as the daemon runs it.
    install: [
      {
        label: "pi update",
        platforms: ["linux", "darwin", "win32"],
        needs: "pi",
        command: "pi update",
      },
      {
        label: "curl script",
        platforms: ["linux", "darwin"],
        needs: "curl",
        command:
          "curl -fsSL https://pi.dev/install.sh -o pi-install.sh && sh pi-install.sh",
      },
    ],
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
        command:
          "curl -fsSL https://antigravity.google/cli/install.sh -o agy-install.sh && bash agy-install.sh",
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
];

export const toolSpec = (id: string): ToolSpec | undefined =>
  TOOL_CATALOG.find((spec) => spec.id === id);

/**
 * Whether `version` is one CawCo runs of `spec`: its one version
 * ({@link ToolSpec.exactVersion}), else its floor or newer
 * ({@link ToolSpec.minVersion}); no version said is none it runs. The one
 * rule the agent's version gate (tools.ts `toolGate`) and the dashboard's
 * blocks (harness-block.svelte.ts) judge a version by.
 */
export const toolRuns = (
  spec: ToolSpec,
  version: string | undefined
): boolean => {
  if (!version) {
    return false;
  }
  if (spec.exactVersion) {
    return version === spec.exactVersion;
  }
  return !(spec.minVersion && olderThan(version, spec.minVersion));
};

/**
 * Each catalog tool this build runs at one version only, that version by id:
 * what `cawco binary-pins` puts on, run from this build by the build before
 * it, before the swap.
 */
export const pinnedTools = (): Record<string, string> =>
  Object.fromEntries(
    TOOL_CATALOG.flatMap((spec) =>
      spec.exactVersion ? [[spec.id, spec.exactVersion]] : []
    )
  );
