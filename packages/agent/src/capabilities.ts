import { existsSync, readdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type {
  MachineCapabilities,
  MachineCapability,
} from "@cawco/core/capabilities";
import { hostEnvironment } from "@cawco/core/session-env";
import { CLAUDE_NOT_INSTALLED, resolveClaudeExecutable } from "./auth";
import { claudeHostVersion } from "./claude-version";
import { opencodeBinary } from "./harnesses/opencode-client";
import { probeStarted } from "./probe-count";
import { installAdvice, resolveBin } from "./tools";

export function browserExecutable(): string | undefined {
  const candidates =
    platform() === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Chromium.app/Contents/MacOS/Chromium",
        ]
      : [
          "google-chrome",
          "google-chrome-stable",
          "chromium",
          "chromium-browser",
        ];
  return (
    candidates
      .map((name) => {
        if (name.startsWith("/")) {
          return existsSync(name) ? name : undefined;
        }
        return resolveBin(name);
      })
      .find(Boolean) ?? playwrightBrowser()
  );
}

function playwrightBrowser(): string | undefined {
  const root =
    platform() === "darwin"
      ? join(homedir(), "Library/Caches/ms-playwright")
      : join(homedir(), ".cache/ms-playwright");
  if (!existsSync(root)) {
    return undefined;
  }
  for (const name of readdirSync(root)
    .filter((entry) => entry.startsWith("chromium-"))
    .sort()
    .reverse()) {
    for (const suffix of [
      "chrome-linux64/chrome",
      "chrome-linux/chrome",
      "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
      "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
    ]) {
      const path = join(root, name, suffix);
      if (existsSync(path)) {
        return path;
      }
    }
  }
  return undefined;
}

function linuxInstall(pkg: string): string {
  if (resolveBin("apt-get")) {
    return `sudo apt-get update && sudo apt-get install -y ${pkg}`;
  }
  if (resolveBin("dnf")) {
    return `sudo dnf install -y ${pkg}`;
  }
  if (resolveBin("pacman")) {
    return `sudo pacman -S --needed ${pkg}`;
  }
  if (resolveBin("apk")) {
    return `sudo apk add ${pkg}`;
  }
  return `Install ${pkg} with this Linux distribution's package manager`;
}

const VERSIONED: readonly string[] = [
  "git",
  "claude",
  "opencode",
  "pi",
  "node",
];
const VERSION = /\d+\.\d+\.\d+(?:[-+][\w.-]+)?/;

/**
 * Asks an installed tool for its version, so the report says which one it is.
 * Never synchronously: `opencode --version` takes about a second, and a
 * synchronous spawn holds the agent's whole loop for it, long enough for every
 * keeper dial and HTTP timeout pending meanwhile to fire before its answer is
 * read (and under Bun, spawnSync's private loop misplaces the agent's own
 * polls: oven-sh/bun#34069).
 */
async function toolVersion(path: string): Promise<string | undefined> {
  const child = Bun.spawn([path, "--version"], {
    // Never the embedded pi's package dir: `pi --version` would read CawCo's pi as its own.
    env: hostEnvironment(),
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  const text = stdout.trim();
  return exitCode === 0 ? (VERSION.exec(text)?.[0] ?? text) : undefined;
}

/** Claude Code's version is the version gate's own read (claude-version.ts), so the two never disagree. */
const claudeVersion = async (): Promise<string | undefined> => {
  const said = await claudeHostVersion();
  return said.kind === "answered" ? said.value : undefined;
};

async function readVersion(item: MachineCapability): Promise<void> {
  if (!(item.available && item.path && VERSIONED.includes(item.id))) {
    return;
  }
  const version =
    item.id === "claude" ? await claudeVersion() : await toolVersion(item.path);
  if (version) {
    item.version = version;
  } else {
    item.reason = "Installed tool did not answer its version command";
  }
}

/** Presence is read fresh on registration and every explicit probe. */
export async function probeCapabilities(): Promise<MachineCapabilities> {
  probeStarted();
  const mac = platform() === "darwin";
  const git = resolveBin("git");
  const claude = resolveClaudeExecutable();
  const node = resolveBin("node");
  const browser = browserExecutable();
  let service: string | undefined;
  if (mac) {
    service = resolveBin("launchctl");
  } else if (existsSync("/run/systemd/system")) {
    service = resolveBin("systemctl");
  }
  const nodeInstall =
    'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && . "$HOME/.nvm/nvm.sh" && nvm install 24';
  const opencode = await opencodeBinary();
  const opencodeAdvice = await installAdvice("opencode");
  const items: MachineCapability[] = [
    {
      id: "git",
      available: !!git,
      path: git,
      installCommand: mac ? "xcode-select --install" : linuxInstall("git"),
    },
    {
      // The Claude Code sessions run (auth.ts), so the same lookup reports it.
      id: "claude",
      available: !!claude,
      path: claude,
      // Claude Code's native installer for macOS, Linux and WSL
      // (https://code.claude.com/docs/en/setup).
      installCommand: "curl -fsSL https://claude.ai/install.sh | bash",
      ...(claude ? {} : { reason: CLAUDE_NOT_INSTALLED }),
    },
    {
      id: "opencode",
      available: !!opencode,
      path: opencode,
      // The command the install action runs here: the way this machine's
      // OpenCode got here, or none and why.
      ...("command" in opencodeAdvice
        ? { installCommand: opencodeAdvice.command }
        : { installCommand: "", reason: opencodeAdvice.refusal }),
    },
    {
      id: "pi",
      available: !!resolveBin("pi"),
      path: resolveBin("pi"),
      installCommand: "npm install -g @earendil-works/pi-coding-agent",
    },
    {
      id: "node",
      available: !!node,
      path: node,
      installCommand: mac ? "brew install node@24" : nodeInstall,
    },
    {
      id: "browser",
      available: !!browser && !!node,
      path: browser,
      installCommand: mac
        ? "brew install --cask google-chrome && brew install node@24"
        : `${node ? "node --version" : nodeInstall} && npx --yes playwright install --with-deps chromium`,
      ...(node ? {} : { reason: "Browser tools also require Node/npm" }),
    },
    {
      id: "service-manager",
      available: !!service,
      path: service,
      installCommand: mac
        ? "launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/dev.cawco.agent.plist"
        : `${linuxInstall("systemd")} && sudo loginctl enable-linger "$(id -un)"`,
      ...(service
        ? {}
        : {
            reason: mac
              ? "launchd is unavailable"
              : "systemd must be running as the service manager; installing its package alone does not change PID 1",
          }),
    },
  ];
  await Promise.all(items.map(readVersion));
  return { at: Date.now(), platform: platform(), items };
}
