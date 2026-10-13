/**
 * A workspace's policy (`workspace-policy.ts`), as each boundary enforces it:
 * the settings of its @anthropic-ai/sandbox-runtime (srt) sandbox on Linux,
 * its Seatbelt profile on macOS. The one place the policy every harness's file
 * tools are judged by becomes what a shell command runs under, so shell, file
 * tools and both OSes answer to one policy. What either adds beyond the
 * policy is what that engine needs to hold it, each named where it is added.
 */
import { dirname } from "node:path";
import type {
  FilesystemPathEntry,
  SandboxRuntimeConfig,
} from "@anthropic-ai/sandbox-runtime";
import type { Policy } from "@cawco/core/workspace-judge";

const within = (path: string, root: string): boolean =>
  root === "/" || path === root || path.startsWith(`${root}/`);

/** Each path as a name srt never reads as a glob (its README, "All platforms"). */
const literal = (paths: readonly string[]): FilesystemPathEntry[] =>
  [...new Set(paths)].map((path) => ({ path, literal: true as const }));

/**
 * The address space no workspace dials by a name that resolves into it: the
 * private ranges, the tailnet's CGNAT range (every one of the owner's
 * machines, the hub among them: "The tailnet is the perimeter", PRODUCT.md)
 * and IPv6 unique-local. srt's own guard refuses loopback, link-local,
 * multicast, cloud metadata and this host's own addresses besides
 * (src/sandbox/resolved-address-guard.ts in 0.0.79); IPv4 and IPv6 listed
 * apart, as its README asks.
 */
export const DENIED_RESOLVED_ADDRESSES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "100.64.0.0/10",
  "fc00::/7",
];

/** Where srt runs for one Linux workspace: what its settings name besides the policy. */
export interface SrtPlace {
  /** The ripgrep srt scans the clone for its protected names with. */
  readonly rg: string;
  /**
   * srt's own temp dir for this workspace (`TMPDIR` of the host process):
   * its proxy bridge's socket is there, bound into the sandbox, so it is
   * read back under the denied `/run` it lies in. Short: a unix socket path
   * is capped at 108 bytes (srt #213).
   */
  readonly srtTmp: string;
}

/**
 * The srt settings of a Linux workspace's sandbox. The network reaches any
 * public host (the host process's ask callback allows every name and refuses
 * an address literal in private space) and no name that resolves into
 * {@link DENIED_RESOLVED_ADDRESSES}; never `localhost`: srt's proxy dials from
 * the host, so that entry would hand a command the agent's and hub's own
 * loopback services (REPORT.md §5l). A dev server a command starts is reached
 * inside the sandbox's own network namespace.
 *
 * Besides the policy:
 * - `/tmp` is read-denied: the host's `/tmp` holds other sessions' files and
 *   sockets; a command's `TMPDIR` is its scratch dir. srt cannot give a
 *   sandbox a private `/tmp` (srt #294).
 * - `/tmp/claude`, which srt always grants and every sandbox of the user
 *   shares, is write-denied (srt #654).
 * - srt's own temp dir and the resolver files under `/run` are read back.
 * - `allowAllUnixSockets`: the seccomp helper that would refuse every unix
 *   socket cannot start under Ubuntu's AppArmor profile for bwrap (srt #429);
 *   the sockets are hidden by path, and abstract ones are cut off by the
 *   sandbox's own network namespace (REPORT.md §5b).
 * - `allowGitConfig`, with the clone's own `.git/config` denied by name in the
 *   policy: srt's built-in `**\/.git/config` deny would refuse every repository
 *   a command clones inside the workspace (REPORT.md §5g).
 * - A write deny reaches srt only where the policy allows writes: everywhere
 *   else writes are refused anyway, and srt would make a mount point for each
 *   that does not exist yet.
 */
export const srtSettings = (
  policy: Policy,
  place: SrtPlace
): SandboxRuntimeConfig => ({
  network: {
    allowedDomains: [],
    deniedDomains: [],
    deniedResolvedAddresses: DENIED_RESOLVED_ADDRESSES,
    allowLocalBinding: true,
    allowAllUnixSockets: true,
  },
  filesystem: {
    denyRead: literal([...policy.denyRead, "/tmp"]),
    allowRead: literal([
      ...policy.allowRead,
      place.srtTmp,
      "/run/systemd/resolve/stub-resolv.conf",
      "/run/systemd/resolve/resolv.conf",
    ]),
    allowWrite: literal(policy.allowWrite),
    denyWrite: literal([
      ...policy.denyWrite.filter((path) =>
        policy.allowWrite.some((root) => within(path, root))
      ),
      "/tmp/claude",
    ]),
    allowGitConfig: true,
  },
  ripgrep: { command: place.rg },
  mandatoryDenySearchDepth: 3,
});

/** A path as a Seatbelt string. */
const sbString = (path: string): string =>
  `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

const depth = (path: string): number => path.split("/").filter(Boolean).length;

/**
 * The keychain's mach services. Seatbelt's `allow default` lets any command
 * look them up, and securityd reads the login keychain on its caller's
 * behalf, past the file deny: `git credential-osxkeychain get` or `security
 * find-internet-password` would hand a workspace a stored password. These are
 * the names sandy-seatbelt's baseline denies so "common Keychain APIs [do
 * not become] credential deputies" (docs.rs/crate/sandy-seatbelt, baseline.rs),
 * with `com.apple.security.authhost`, which the keychain layers of isol8 and
 * tftio-silent-critic allow beside them. `com.apple.trustd*`, which verifies
 * TLS certificates, is not among them.
 */
const KEYCHAIN_MACH_SERVICES = [
  "com.apple.SecurityServer",
  "com.apple.securityd",
  "com.apple.securityd.xpc",
  "com.apple.securityd.general",
  "com.apple.securityd.systemkeychain",
  "com.apple.security.keychaind",
  "com.apple.secd",
  "com.apple.security.agent",
  "com.apple.security.authhost",
];

/** What a macOS profile names besides the policy. */
export interface SeatbeltPlace {
  /**
   * The tool door's and the git door's sockets, the unix sockets under
   * CawCo's dirs a command connects to, and its `TMPDIR`'s short name
   * (paths.ts `workspaceTmpDir`), through which a tool reaches its own socket.
   */
  readonly doors: readonly string[];
  /**
   * Where a host's key agents, apps and CawCo's own sockets are (CawCo's
   * state, sessiond's dir, launchd's ssh-agent, Apple's per-user temp and
   * cache dirs): no command connects to a socket under one, even one a
   * workspace writes.
   */
  readonly hostSockets: readonly string[];
}

/**
 * The Seatbelt profile of a macOS workspace's runner. Seatbelt lets the last
 * matching rule win, so the read rules come in order of depth, a deny before
 * an allow of the same depth: the most specific entry decides, an allow
 * wins a tie (srt's README, "Filesystem Isolation"), as srt decides on Linux.
 * Every directory above an allowed path inside a denied one answers a
 * lookup alone (its metadata), never its listing: a tool that resolves its
 * own path climbs through them. The policy's paths are real paths, as
 * Seatbelt matches.
 *
 * Besides the policy: signals stay inside the sandbox, `launchctl` does not
 * run (so nothing reaches launchd), the scratch dir itself cannot be removed,
 * no keychain service is looked up ({@link KEYCHAIN_MACH_SERVICES}), and no
 * unix socket under {@link SeatbeltPlace.hostSockets} or a read-denied path
 * (the home dir, every credential store) is reached but the tool and git
 * doors' and those under the workspace's own writable roots: tools put their
 * own sockets where they write and connect back to them (a browser's process
 * singleton in `$TMPDIR`, a language server, a probe's sessiond under
 * `$XDG_CACHE_HOME`). So a daemon's socket under home stays out of reach
 * (Colima's `~/.colima/default/docker.sock`, a key agent's), and so do the
 * agent's and sessiond's, every other workspace's clone, scratch dir and
 * doors, and every host app's in the per-user temp and cache dirs (VS Code's
 * git askpass, a browser's singleton): Apple's build tools write those dirs
 * but bind no socket there, and Chromium binds its singleton in `$TMPDIR`,
 * the scratch dir. The cache is every workspace's, as on Linux: a socket one binds
 * there another reaches, as it already reaches every file the other writes
 * there. Allows come after denies, as srt writes its `allowUnixSockets`
 * (`(allow network-outbound (remote unix-socket (subpath …)))`,
 * macos-sandbox-utils.ts). The network is the host's: Seatbelt cannot judge a
 * destination by the name it resolves.
 */
export const seatbeltProfile = (
  policy: Policy,
  place: SeatbeltPlace
): string => {
  const reads = [
    ...policy.denyRead.map((path) => ({ path, allow: false })),
    ...policy.allowRead.map((path) => ({ path, allow: true })),
  ].sort(
    (a, b) => depth(a.path) - depth(b.path) || Number(a.allow) - Number(b.allow)
  );
  const socketDenies = [...new Set([...place.hostSockets, ...policy.denyRead])];
  // The workspace's own writable roots a socket deny covers: its clone, its
  // scratch dir and the workspaces' cache, all under home. Never a root that
  // is or holds a host socket dir: Apple's per-user temp and cache dirs are
  // writable here and the host's too.
  const ownSockets = policy.allowWrite.filter(
    (root) =>
      socketDenies.some((denied) => within(root, denied)) &&
      !place.hostSockets.some((host) => within(host, root))
  );
  const lookups = new Set<string>();
  for (const path of policy.allowRead) {
    for (let dir = dirname(path); dir !== "/"; dir = dirname(dir)) {
      if (policy.denyRead.some((denied) => within(dir, denied))) {
        lookups.add(dir);
      }
    }
  }
  return [
    "(version 1)",
    "(allow default)",
    "(deny signal)",
    "(allow signal (target same-sandbox))",
    ...reads.map(
      ({ path, allow }) =>
        `(${allow ? "allow" : "deny"} file-read* (subpath ${sbString(path)}))`
    ),
    ...[...lookups].map(
      (path) => `(allow file-read-metadata (literal ${sbString(path)}))`
    ),
    "(deny file-write*)",
    "(allow file-write*",
    ...policy.allowWrite.map((path) => `  (subpath ${sbString(path)})`),
    '  (literal "/dev/null") (literal "/dev/zero") (literal "/dev/dtracehelper")',
    '  (regex #"^/dev/tty") (regex #"^/dev/fd/"))',
    ...policy.denyWrite.map(
      (path) => `(deny file-write* (subpath ${sbString(path)}))`
    ),
    // Its contents are the workspace's to write; the scratch dir itself stays.
    `(deny file-write-unlink (literal ${sbString(policy.scratch)}))`,
    '(deny process-exec (literal "/bin/launchctl"))',
    "(deny mach-lookup",
    ...KEYCHAIN_MACH_SERVICES.map(
      (service) => `  (global-name ${sbString(service)})`
    ),
    ")",
    ...socketDenies.map(
      (path) =>
        `(deny network-outbound (remote unix-socket (subpath ${sbString(path)})))`
    ),
    ...[...place.doors, ...ownSockets].map(
      (path) =>
        `(allow network-outbound (remote unix-socket (subpath ${sbString(path)})))`
    ),
    "",
  ].join("\n");
};
