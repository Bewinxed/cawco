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
 * One way to put a tool on a machine. A copy already there goes on again
 * with the method that holds it (its `footprint`, or what `holds` asks);
 * any other install takes, in catalog order, the first method whose
 * `platforms` match and whose `needs` runs here ({@link needProbe}), among the methods that
 * hold nothing when the tool has any (a package manager's method is for the
 * copy it holds), else among all. A pinned install takes only a method with
 * a `pinnedCommand`. There is no fallback past a method that ran and failed
 * — a half-applied installer chain is harder to reason about than one
 * honest failure.
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
  /**
   * For a package manager whose copies can't be told apart by where they
   * resolve (apk puts its files where other managers put theirs): the
   * question that asks it whether it holds a copy, `<needs> <holds…>
   * <file>`, which exits 0 and names the package when it does. A copy it
   * holds is held to this method, as one bearing its footprint is.
   */
  holds?: string[];
  /** Names the method in status and errors: 'curl script', 'npm', 'winget'. */
  label: string;
  /**
   * Set on no method. Declared only because installable TestFlight builds'
   * schema has it (hub `openapi:check`); it goes in the change a TestFlight
   * build is made from, with `ToolSpec.dependencyOnly` and `requires`.
   */
  native?: string;
  /**
   * A binary that must already run on the machine for this method to be
   * eligible — 'npm', 'brew', 'winget': on the PATH, and its
   * {@link needProbe} neither failing to start nor exiting other than 0 (one
   * still running at the agent's bound runs). Absent means always eligible. CawCo
   * never installs it: a machine where it is missing or does not run takes
   * the next method, or is told what is missing and what it said.
   */
  needs?: string;
  /**
   * The command when the policy pins a version — `{version}` becomes the pin.
   * Kept apart from `command` because "latest" is not a version most
   * installers accept: the curl scripts and winget want no version argument
   * at all when they should take the newest. A method without one never runs
   * for a pin: the install says it can't put that version on, rather than
   * putting another on.
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
 * - `brew`: the file is in Homebrew's Cellar under the formula `formula`'s
 *   own dir, or in its Caskroom under the cask of that name.
 */
export type ToolFootprint =
  | { kind: "brew"; formula: string }
  | { kind: "bun-global" }
  | { kind: "dir"; path: string }
  | { kind: "npm-global" };

/**
 * How a machine turns a tool's own updates off, as the tool itself decides
 * it: a variable whose value is on ({@link switchOn}; any value at all for
 * one of `anyValue`) in the `env` of the tool's settings, else in the
 * environment the tool runs with, which its settings' `env` stands over.
 * The settings are what the tool's own merge engine resolves (`engine`):
 * the user's and every managed source, ranked as the tool ranks them.
 * `automatic` turns off the tool's own automatic updates, and so CawCo's;
 * `every` turns off every update, a press's included.
 */
export interface ToolUpdateSwitches {
  /** Of the variables, those on whatever they are set to, rather than by {@link switchOn}. */
  anyValue?: string[];
  automatic: string[];
  /**
   * Whose engine resolves the tool's settings: `claude-code`, Claude Code's
   * own, as the Agent SDK's `resolveSettings` runs it (agent tools.ts
   * `SETTINGS_ENGINES`).
   */
  engine: "claude-code";
  every: string[];
  /**
   * Where the tool's managed settings are kept, as a row names the place a
   * switch is set: its managed settings files (the system directory each
   * platform keeps them in, and the file and the folder of `.json` files
   * there), its macOS managed preferences domain, and the registry value its
   * settings are kept in, under each key.
   */
  places: {
    files: {
      dirs: Partial<Record<ToolPlatform, string>>;
      file: string;
      folder: string;
    };
    profile: string;
    registry: { hkcu: string; hklm: string; value: string };
  };
}

/**
 * Whether a switch's value turns it on, as Claude Code reads one: 2.1.318's
 * `function Oe(e){if(!e)return!1;if(typeof e==="boolean")return e;let
 * n=String(e).toLowerCase().trim();return["1","true","yes","on"].includes(n)}`,
 * the parse of DISABLE_AUTOUPDATER (`zy(Oe(process.env.DISABLE_AUTOUPDATER))`)
 * and of DISABLE_UPDATES (`aD=H.bool()`, `bool:()=>a`, `a=r((n)=>Oe(n))`).
 */
export const switchOn = (value: unknown): boolean =>
  ["1", "true", "yes", "on"].includes(
    String(value ?? "")
      .toLowerCase()
      .trim()
  );

/** The shape of {@link ToolSpec.requires}, which no tool sets. */
interface ToolRequirement {
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
   * The oldest version CawCo runs, for a tool CawCo updates with the tool's
   * own updater (`claude update`, `pi update`): a copy older than it is
   * reported `failed` with why, and an install brings it to this version or
   * newer.
   */
  minVersion?: string;
  /** What the dashboard calls it. */
  name: string;
  /**
   * Where the tool's newest release is said, for a tool CawCo keeps at its
   * newest release on every machine that has it (hub tool-releases.ts): a
   * URL whose body's first `x.y.z` is that release. The hub reads it and
   * sends each machine whose copy is older an install, which runs the
   * copy's own updater ({@link ToolSpec.install}'s first method), so no
   * press is needed; an update that leaves the copy older says why on its
   * row.
   */
  release?: string;
  /** Set on no tool; declared for installable apps only, as {@link ToolInstallMethod.native} is. */
  requires?: ToolRequirement[];
  /**
   * For a tool that signs in to its own service with the machine's person's
   * own login, which CawCo never holds: how a machine reads whether it is
   * signed in, and runs its own sign-in.
   */
  signin?: ToolSigninSpec;
  /**
   * How a machine turns this tool's own updates off, for a tool CawCo keeps
   * current ({@link release}): the switches its owner set are CawCo's too.
   */
  updatesOff?: ToolUpdateSwitches;
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

/**
 * A tool's own sign-in, run as the tool itself on the machine (agent
 * tool-signin.ts): CawCo reads what it prints and types what the person
 * pasted into it, and never sees or keeps the login it stores.
 */
export interface ToolSigninSpec {
  /** Arguments after the binary for the tool's own interactive sign-in: it prints a link, takes the code pasted on its input, and ends once signed in. */
  login: string[];
  /** The hosts its sign-in link may be on; no other link on its screen is read. */
  loginHosts: string[];
  /** Words, any case, in what {@link status} prints when it is not signed in. */
  signedOut: string[];
  /** Arguments after the binary for a read that spends nothing and exits 0 only when signed in. */
  status: string[];
}

/**
 * Whether a tool on a machine is signed in, as its own {@link
 * ToolSigninSpec.status} read said when it was last read (`at`, ms epoch):
 * `unknown` when that read said neither, with its words in `detail`.
 */
export interface ToolSignin {
  at: number;
  detail?: string;
  state: "signed-in" | "signed-out" | "unknown";
}

/** A tool's sign-in begun on a machine: the link the person opens, and until when it is kept (ms epoch). */
export interface ToolSigninChallenge {
  expiresAt: number;
  url: string;
}

/**
 * A tool sign-in's controls, each the hub's to the machine (agent
 * tool-signin.ts). Begin (args: tool id) starts the tool's own sign-in and
 * answers a {@link ToolSigninChallenge}; Complete (args: tool id, the
 * pasted code) types the code into it, waits for it to end, and answers the
 * tool's {@link ToolStatus} with its sign-in read again.
 */
export const CONTROL_BEGIN_TOOL_SIGNIN = "beginToolSignin";
export const CONTROL_COMPLETE_TOOL_SIGNIN = "completeToolSignin";

/** What a probe or an install attempt found. The unit every surface renders. */
export type ToolState =
  "installed" | "missing" | "installing" | "failed" | "unsupported";

/** @socketFrame fromHub */
export interface ToolStatus {
  /** When this was learnt, ms epoch. */
  at: number;
  /**
   * `failed`: the tail of the installer's stderr. `unsupported`: what is
   * missing, named exactly — 'needs npm (Node 20+)' beats a grey chip.
   * `installed`: set only on a tool CawCo keeps at its newest release
   * ({@link ToolSpec.release}), when the last update it ran here left the
   * copy older than the release it was after: why, in the updater's words.
   * The copy still runs; the update is owed until a newer release, a Retry,
   * or the copy moving some other way.
   */
  detail?: string;
  id: string;
  /** The {@link ToolInstallMethod.label} that installed it or failed trying. */
  method?: string;
  /** For a tool with its own sign-in ({@link ToolSpec.signin}), installed here: whether it is signed in. */
  signin?: ToolSignin;
  state: ToolState;
  /**
   * The version the copy here says: on `installed`; on `failed`, a copy
   * CawCo does not run (older than its floor, or not its one version), or,
   * for a tool CawCo keeps at its newest release, the copy an update that
   * failed left there; on `installing`, the copy being updated. An attempt
   * that failed on any other tool carries none.
   */
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
const OPENCODE_VERSION = "2.0.29";

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
const PI_VERSION_FLOOR = "1.3.0";

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
    // The release channel Claude Code's own updater reads: 2.1.311's bundle
    // has `var Ie="https://downloads.claude.ai/claude-code-releases"` and
    // asks `${Ie}/${channel}`, `latest` by default (read 2026-11-04; the
    // body is the version alone, "2.1.318"). Its updater never runs in the
    // sessions CawCo starts: it is the interactive REPL's footer
    // (`AutoUpdaterWrapper`, on mount and `Pa(()=>void z(),1800000)`), and a
    // process whose stdout is no terminal is not interactive (`return
    // n||t||o||!process.stdout.isTTY`), which every SDK process under
    // sessiond is. So CawCo runs it, whenever this says a newer release.
    release: "https://downloads.claude.ai/claude-code-releases/latest",
    // The native installer's link (code.claude.com/docs/en/setup), for a
    // daemon whose PATH lacks it.
    wellKnownPaths: ["~/.local/bin/claude"],
    // Its own switches, as its updater decides on them: 2.1.318's
    // `function zy(e){if(i.DISABLE_UPDATES)return{type:"env",envVar:
    // "DISABLE_UPDATES"};if(e)return{type:"env",envVar:"DISABLE_AUTOUPDATER"};
    // let n=UUt();if(n)return{type:"env",envVar:n};…}`, asked as
    // `zy(Oe(process.env.DISABLE_AUTOUPDATER))`, with `function UUt(){if(
    // process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC)return
    // "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC";return null}`: that one on
    // any value, as the docs say ("Set to any non-empty value, such as `1`,
    // to disable nonessential network traffic: auto-updates, … Setting it to
    // `0` or `false` still disables this traffic",
    // code.claude.com/docs/en/env-vars, read 2026-11-04), and only
    // DISABLE_UPDATES stops a press ("`DISABLE_AUTOUPDATER` only stops the
    // background check; `claude update` and `claude install` still work. To
    // block all update paths, including manual updates, set
    // `DISABLE_UPDATES`", code.claude.com/docs/en/setup). Claude Code hands
    // that decision to no caller (`claude doctor` prints it as words,
    // `Auto-updates: disabled (set by env: …)`), so its rules are held here,
    // and the settings they read are its own engine's answer. Its last test,
    // `fe().autoUpdates===!1` in `~/.claude.json`, it moves into the user's
    // settings at its next start (`Kn("userSettings",{env:
    // {DISABLE_AUTOUPDATER:"1"}})`), where the engine reads it.
    updatesOff: {
      automatic: [
        "DISABLE_AUTOUPDATER",
        "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
      ],
      anyValue: ["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC"],
      every: ["DISABLE_UPDATES"],
      engine: "claude-code",
      // "`managed-settings.json`, an optional `managed-settings.d/`
      // directory, and `managed-mcp.json` in the system directory:
      // `/Library/Application Support/ClaudeCode/` on macOS,
      // `/etc/claude-code/` on Linux and WSL, and `C:\Program Files\ClaudeCode\`
      // on Windows", "the `com.anthropic.claudecode` managed preferences
      // domain", "the JSON as a `REG_SZ` or `REG_EXPAND_SZ` value named
      // `Settings` under `HKLM\SOFTWARE\Policies\ClaudeCode`", and "the same
      // `Settings` value under `HKCU\SOFTWARE\Policies\ClaudeCode`"
      // (code.claude.com/docs/en/managed-settings, read 2026-11-04).
      places: {
        files: {
          dirs: {
            linux: "/etc/claude-code",
            darwin: "/Library/Application Support/ClaudeCode",
            win32: "C:\\Program Files\\ClaudeCode",
          },
          file: "managed-settings.json",
          folder: "managed-settings.d",
        },
        profile: "com.anthropic.claudecode",
        registry: {
          value: "Settings",
          hklm: "HKLM\\SOFTWARE\\Policies\\ClaudeCode",
          hkcu: "HKCU\\SOFTWARE\\Policies\\ClaudeCode",
        },
      },
    },
    // A copy a package manager holds goes on again with that manager, as
    // Claude Code tells its own installs apart (2.1.311's
    // `detectHomebrew`: `n.includes("/Caskroom/")` and the cask from
    // `/\/Caskroom\/([^/]+)\//`; `detectWinget`: `Microsoft[/\\]WinGet[/\\]
    // Packages` or `Links`; `detectApk`: `apk info --who-owns <execPath>`).
    // Any other copy, a native one among them, takes Claude Code's own
    // updater, as the machine's user and with no sudo ("To apply an update
    // immediately without waiting for the next background check, run:
    // claude update", code.claude.com/docs/en/setup, read 2026-11-04), which
    // keeps the person's channel ("Control which release channel Claude Code
    // follows for auto-updates and `claude update` with the
    // `autoUpdatesChannel` setting", the same page). A pin never runs it: it
    // goes to the native installer, "To install a specific version number:
    // curl -fsSL https://claude.ai/install.sh | bash -s 2.1.89" (the same
    // page), or to npm for a copy npm holds. A machine without one gets that
    // installer too, the newest build or the pinned one.
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
      // "Claude Code runs npm without `sudo` when it updates itself", and "To
      // upgrade an npm installation, run `npm install -g
      // @anthropic-ai/claude-code@latest`" (the same page): its own updater
      // for the newest, which keeps the channel; npm itself for a pin.
      {
        label: "npm",
        platforms: ["linux", "darwin", "win32"],
        needs: "npm",
        footprint: { kind: "npm-global" },
        command: "claude update",
        pinnedCommand: "npm install -g @anthropic-ai/claude-code@{version}",
      },
      // "Run `brew upgrade claude-code` or `brew upgrade
      // claude-code@latest`, depending on which cask you installed" (the
      // same page). A cask carries one version, so no pin.
      {
        label: "brew",
        platforms: ["darwin", "linux"],
        needs: "brew",
        footprint: { kind: "brew", formula: "claude-code" },
        command: "brew upgrade claude-code",
      },
      {
        label: "brew",
        platforms: ["darwin", "linux"],
        needs: "brew",
        footprint: { kind: "brew", formula: "claude-code@latest" },
        command: "brew upgrade claude-code@latest",
      },
      // "Run `winget upgrade Anthropic.ClaudeCode` periodically" (the same
      // page), with the flags a run with no terminal needs.
      {
        label: "winget",
        platforms: ["win32"],
        needs: "winget",
        footprint: { kind: "dir", path: "~/AppData/Local/Microsoft/WinGet" },
        command:
          "winget upgrade -e --id Anthropic.ClaudeCode --silent --accept-package-agreements --accept-source-agreements",
      },
      // "To upgrade later, run `apk update && apk upgrade claude-code`" (the
      // same page). It needs root: as any other user apk says why not.
      {
        label: "apk",
        platforms: ["linux"],
        needs: "apk",
        holds: ["info", "--who-owns"],
        command: "apk update && apk upgrade claude-code",
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
    // Its own reads and sign-in, never a request of CawCo's to Google
    // (Antigravity's terms §6, https://antigravity.google/terms). `/usage`
    // in print mode is answered by the CLI itself, spends nothing, and
    // prints the quota buckets only when signed in; signed out, headless
    // runs fail with "authentication required"
    // (https://antigravity.google/docs/cli/headless/), which 1.5.2 says
    // ("Authentication required. Please visit the URL to log in:") and then
    // waits 60 s for a login before it exits (measured 2026-11-07), so the
    // read ends where the words are said (agent tools.ts `readSignin`). `acp --login`: "Log
    // in with Google interactively, then exit" (`agy acp --help`, 1.5.0).
    signin: {
      status: ["-p", "/usage", "--output-format", "json"],
      signedOut: ["authentication required"],
      login: ["acp", "--login"],
      loginHosts: ["accounts.google.com"],
    },
    // The official scripts: ~/.local/bin on linux/darwin, LocalAppData on
    // Windows. A static Go binary — no runtime to require.
    wellKnownPaths: ["~/.local/bin/agy", "~/AppData/Local/agy/bin/agy.exe"],
    install: [
      // Verified 2026-08-06 (v1.1.10). The installer script takes no version
      // argument — the binary self-updates (AGY_CLI_DISABLE_AUTO_UPDATE=true
      // turns that off), so only winget can honour a policy pin; elsewhere a
      // pinned install says it can't put that version on, and runs nothing. Auth stays the user's: Google sign-in into the OS
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

/**
 * What a method's need (`ToolInstallMethod.needs`) is asked to tell whether
 * it runs here: its own `--version`, which starts the binary and its runtime
 * as an install would. A binary present but unable to run fails it: an
 * `npm` whose `#!/usr/bin/env node` finds no `node` exits 127 with
 * "/usr/bin/env: 'node': No such file or directory". Asking the binary
 * itself covers each manager's own runtime (npm's Node, brew's Ruby) with no
 * table of runtimes to keep. Windows PowerShell takes no `--version` (its
 * `-Version` names a version to start), so it is asked to exit.
 */
export const needProbe = (need: string): string[] =>
  need === "powershell"
    ? ["-NoProfile", "-NonInteractive", "-Command", "exit 0"]
    : ["--version"];

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

/** The states a daemon may claim for a tool; anything else is not a status. */
const TOOL_STATES: readonly ToolState[] = [
  "installed",
  "missing",
  "installing",
  "failed",
  "unsupported",
];

export const isToolStatus = (value: unknown): value is ToolStatus =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ToolStatus).id === "string" &&
  TOOL_STATES.includes((value as ToolStatus).state);
