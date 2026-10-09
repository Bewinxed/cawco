/**
 * Prototype: the srt settings one CawCo workspace runs under, derived from what
 * boundary.ts grants today (packages/agent/src/boundary.ts), with the review's
 * escapes closed in the config itself.
 *
 *   bun srt-config.ts <clone> <state> <out.json>
 *
 * <state> is the workspace's state dir (today ~/.cawco/workspaces/<id>): its
 * `tmp` is the command's TMPDIR and its `cache` the workspace's own package
 * caches. Writes <out.json>. Nothing here is product code.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [clone, state, out] = process.argv.slice(2);
if (!(clone && state && out)) {
  console.error("usage: bun srt-config.ts <clone> <state> <out.json>");
  process.exit(64);
}
const home = homedir();
const mac = process.platform === "darwin";
const scratch = join(state, "tmp");
const cache = join(state, "cache");
for (const dir of [scratch, cache, join(state, "ro")]) {
  mkdirSync(dir, { recursive: true });
}
const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

// The repository the clone reads its objects from (boundary.ts linuxSpec "alternates"):
// readable, never writable.
const alternates = (() => {
  try {
    return readFileSync(
      join(clone, ".git", "objects", "info", "alternates"),
      "utf8"
    )
      .split("\n")
      .filter((line) => line.startsWith("/"));
  } catch {
    return [];
  }
})();

// Build output folders Apple tools write that the host's Xcode also reads.
// Kept shared as boundary.ts cachesOf() does today; see REPORT.md (macOS gaps).
const appleWrites = mac
  ? [
      join(home, "Library", "Caches"),
      join(home, "Library", "Developer", "Xcode", "DerivedData"),
      join(home, ".swiftpm"),
      join(home, "Library", "org.swift.swiftpm"),
      join(
        home,
        "Library",
        "Developer",
        "Xcode",
        "UserData",
        "Provisioning Profiles"
      ),
      join(home, "Library", "MobileDevice", "Provisioning Profiles"),
      ...["DARWIN_USER_TEMP_DIR", "DARWIN_USER_CACHE_DIR"].map((name) =>
        execFileSync("getconf", [name], { encoding: "utf8" }).trim()
      ),
    ]
  : [];

// What a command reads under $HOME besides the workspace: toolchains, the
// user's git identity, Playwright's browsers. Everything else under $HOME is
// hidden: ~/.ssh, ~/.cawco (accounts, sessiond, other workspaces), every
// harness sign-in, every other repository and its .env.
const homeReads = [
  join(home, ".bun", "bin"),
  join(home, ".nvm"),
  join(home, ".local", "bin"),
  join(home, ".cargo", "bin"),
  join(home, ".rustup"),
  join(home, ".gitconfig"),
  join(home, ".config", "git"),
  mac
    ? join(home, "Library", "Caches", "ms-playwright")
    : join(home, ".cache", "ms-playwright"),
  ...(mac
    ? [
        join(home, "Library", "Developer"),
        join(home, "Library", "Preferences"),
        join(home, "Library", "Keychains"),
      ]
    : []),
];

const runtimeDir = process.env.XDG_RUNTIME_DIR;

/**
 * Linux: the srt process's own temp dir (runner-start.sh sets its TMPDIR to
 * it). srt makes its proxy bridge socket there and binds it into the sandbox
 * before the read denies, so a denied /tmp would bury it; this dir is the one
 * re-allowed. Short, because a Unix socket path is capped at 108 bytes (srt #213).
 */
export const srtHostTmp = (stateDir: string): string =>
  join(
    runtimeDir ?? "/tmp",
    "cawco-srt",
    createHash("sha256").update(stateDir).digest("hex").slice(0, 8)
  );
const hostTmp = mac ? undefined : srtHostTmp(real(state));
if (hostTmp) {
  mkdirSync(hostTmp, { recursive: true, mode: 0o700 });
}

const harnessConfig = [
  join(real(clone), ".claude", "settings.json"),
  join(real(clone), ".claude", "settings.local.json"),
  join(real(clone), "opencode.json"),
  join(real(clone), "opencode.jsonc"),
  join(real(clone), ".opencode"),
];

const settings = {
  network: {
    // srt has no allow-all: "*" and "*.com" are refused (domain-pattern.ts
    // isValidDomainPattern). The prototype's allowlist; the product's is the
    // owner's call (REPORT.md).
    allowedDomains: [
      "github.com",
      "*.github.com",
      "*.githubusercontent.com",
      "registry.npmjs.org",
      "*.npmjs.org",
      "bun.sh",
      "*.bun.sh",
      "cdn.playwright.dev",
      "playwright.download.prss.microsoft.com",
      "swift.org",
      "*.swift.org",
      // Never "localhost"/"127.0.0.1": on Linux the proxy dials from the host,
      // so that entry hands a command the host's own loopback services (the
      // agent and hub APIs). A dev server the workspace starts is reached
      // directly, inside the sandbox's own network namespace (NO_PROXY).
      // macOS has no such namespace: allowLocalBinding (dev servers) opens
      // the host's loopback either way.
    ],
    deniedDomains: [],
    allowLocalBinding: true,
    // Linux: srt's AF_UNIX seccomp helper cannot start under Ubuntu's
    // bwrap-userns-restrict AppArmor profile (srt #429/#498), so it is off; the
    // sockets that matter are hidden by path (denyRead) and abstract sockets
    // are cut off by the sandbox's own network namespace.
    ...(mac ? { allowMachLookup: ["*"] } : { allowAllUnixSockets: true }),
  },
  filesystem: {
    // Linux: all of /run (every host daemon's socket: the system bus,
    // tailscaled, snapd, podman, sshd's local socket, the user's bus and
    // sessiond under /run/user) and the host's /tmp (other sessions' files;
    // the command's TMPDIR is the workspace's own). srt's seccomp AF_UNIX
    // block cannot start here (srt #429), so hiding the path is the control.
    // macOS: srt's Seatbelt profile refuses every unix socket by default.
    denyRead: [home, ...(mac ? [] : ["/run", "/var/run", "/tmp"])],
    allowRead: [
      real(clone),
      // Only the part of the state dir a command reads (runner script, FIFO,
      // empty git template): its writable tmp and cache are siblings, never
      // nested in a read carve-out, which srt binds back read-only (srt #446).
      join(real(state), "ro"),
      ...alternates,
      ...homeReads,
      ...appleWrites,
      ...(hostTmp ? [hostTmp, "/run/systemd/resolve"] : []),
    ],
    allowWrite: [real(clone), real(scratch), real(cache), ...appleWrites],
    // The clone's own git config and its submodules' (srt's built-in scan
    // protects `**/.git/config`, never `.git/modules/*/config`), named here
    // because allowGitConfig is on: srt's built-in `**/.git/config` deny would
    // also refuse every repository a command clones inside the workspace
    // (SwiftPM's .build/checkouts, git dependencies). Hooks stay denied
    // everywhere by srt's own rule.
    denyWrite: [
      { path: join(real(clone), ".git", "config"), literal: true },
      join(real(clone), ".git", "modules"),
      // Project config the harnesses load on the host, outside any boundary,
      // at the workspace's next session: Claude Code's project settings (hooks)
      // and OpenCode's project config (plugins, MCP commands). srt protects
      // .mcp.json and .claude/{commands,agents} itself.
      ...harnessConfig.map((path) => ({ path, literal: true as const })),
      // srt always grants /tmp/claude when it exists, shared by every sandbox
      // of the user (srt #654); denied for writing so no workspace plants
      // files for another. Reads of what is already there stay (srt #611).
      ...(mac ? [] : ["/tmp/claude"]),
    ],
    allowGitConfig: true,
  },
  ripgrep: {
    command: mac
      ? "/opt/homebrew/bin/rg"
      : join(home, ".cache", "srt-eval", "bin", "rg"),
  },
  mandatoryDenySearchDepth: 3,
};

writeFileSync(out, `${JSON.stringify(settings, null, 2)}\n`);
if (hostTmp) {
  writeFileSync(join(state, "srt-host-tmp"), `${hostTmp}\n`);
}
console.log(`wrote ${out}`);
