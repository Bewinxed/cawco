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

/** What a macOS profile names besides the policy. */
export interface SeatbeltPlace {
  /** The tool door's socket, the one unix socket under CawCo's dirs a command connects to. */
  readonly door: string;
  /**
   * Where a host's key agents and CawCo's own sockets are (CawCo's state,
   * sessiond's dir, launchd's ssh-agent): no command connects to a socket
   * under one.
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
 * and no unix socket under {@link SeatbeltPlace.hostSockets} or a credential
 * store is reached but the tool door's. The network is the host's: Seatbelt
 * cannot judge a destination by the name it resolves.
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
    ...[...new Set([...place.hostSockets, ...policy.denyRead])]
      .filter((path) => path !== policy.home)
      .map(
        (path) =>
          `(deny network-outbound (remote unix-socket (subpath ${sbString(path)})))`
      ),
    `(allow network-outbound (remote unix-socket (subpath ${sbString(place.door)})))`,
    "",
  ].join("\n");
};
