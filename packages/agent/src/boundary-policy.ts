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
import { BROWSER_PORTS, browserGatePort } from "@cawco/core/browser";
import type { Policy } from "@cawco/core/workspace-judge";

/**
 * Every port of {@link BROWSER_PORTS} (the machine's DevTools gate, and the
 * browsers' neko, DevTools and media ports), and the gate's port where a
 * second agent on the host moved it: none of them is dialled by a command of
 * a workspace on this machine.
 */
const browserPorts = (): number[] => [
  ...new Set([
    ...Array.from(
      { length: BROWSER_PORTS.last - BROWSER_PORTS.first + 1 },
      (_, at) => BROWSER_PORTS.first + at
    ),
    browserGatePort(),
  ]),
];

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
  /**
   * Bun's `--bun` node shim dir, made on the host (bun-node-shim.ts), read
   * back into the sandbox's denied `/tmp`, where Bun looks for it.
   */
  readonly bunNode: string | undefined;
  /** The bwrap srt runs (its `bwrapPath`): {@link readOnlyDeniesBwrap}, as the workspace's boundary writes it. */
  readonly bwrap: string;
  /**
   * The container runtimes' sockets on this machine (boundary.ts
   * `containerSockets`): their own dirs, and every socket the runtime
   * registry may dial, each as named and as the file it names.
   */
  readonly containerSockets: {
    readonly dirs: readonly string[];
    readonly sockets: readonly string[];
  };
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
 * What a Linux workspace's srt hides of the container runtimes' sockets
 * ({@link SrtPlace.containerSockets}): each runtime dir whole, and each
 * endpoint's own dir whole when the policy reads and writes nothing in it
 * or above it (`DOCKER_HOST` at `/srv/docker/docker.sock`), so a socket the
 * runtime makes again behind a running sandbox is hidden too; else the
 * endpoint itself. `/run`, `/var/run`, `/tmp` and the home dir are hidden
 * already (core `LINUX_HOST_PRIVATE`, the policy's home deny): this is for
 * a socket outside them, or under a path the policy allows.
 */
const runtimeSocketDenies = (
  policy: Policy,
  found: SrtPlace["containerSockets"]
): string[] => {
  const opened = [...policy.allowRead, ...policy.allowWrite];
  return [
    ...new Set([
      ...found.dirs,
      ...found.sockets.map((socket) => {
        const dir = dirname(socket);
        return opened.some((path) => within(path, dir) || within(dir, path))
          ? socket
          : dir;
      }),
    ]),
  ];
};

/**
 * The srt settings of a Linux workspace's sandbox. The network reaches any
 * public host (the host process's ask callback allows every name and refuses
 * an address literal in private space) and no name that resolves into
 * {@link DENIED_RESOLVED_ADDRESSES}; never `localhost`: srt's proxy dials from
 * the host, so that entry would hand a command the agent's and hub's own
 * loopback services (REPORT.md §5l). A dev server a command starts is reached
 * inside the sandbox's own network namespace.
 *
 * Every read-denied dir (the home dir, `/tmp`, `/run`) is an empty tmpfs that
 * srt mounts writable (srt #149), and that the bwrap srt runs
 * ({@link SrtPlace.bwrap}, {@link readOnlyDeniesBwrap}) remounts read-only once
 * what is bound back into it is in place: a write there fails at once with
 * EROFS naming its path, never lands in the sandbox's memory to vanish with
 * it. What a command writes is the policy's `allowWrite` alone:
 * the clone, its scratch dir (`TMPDIR`, its XDG config, data and state homes)
 * and the workspaces' cache (every tool's cache, `XDG_CACHE_HOME`,
 * `XDG_RUNTIME_DIR`).
 *
 * Besides the policy:
 * - `/tmp` is read-denied: the host's `/tmp` holds other sessions' files and
 *   sockets; a command's `TMPDIR` is its scratch dir. srt cannot give a
 *   sandbox a private `/tmp` (srt #294).
 * - `/tmp/claude`, which srt always grants and every sandbox of the user
 *   shares, is write-denied (srt #654).
 * - srt's own temp dir and the resolver files under `/run` are read back, and
 *   Bun's `--bun` node shim dir under `/tmp` ({@link SrtPlace.bunNode}), which
 *   Bun only ever looks for there: read-only, so the shim the host's own bun
 *   runs through is never a workspace's to write.
 * - `allowAllUnixSockets`: the seccomp helper that would refuse every unix
 *   socket cannot start under Ubuntu's AppArmor profile for bwrap (srt #429);
 *   the sockets are hidden by path, and abstract ones are cut off by the
 *   sandbox's own network namespace (REPORT.md §5b).
 * - `allowGitConfig`, with the clone's own `.git/config` denied by name in the
 *   policy: srt's built-in `**\/.git/config` deny would refuse every repository
 *   a command clones inside the workspace (REPORT.md §5g).
 *
 * The browsers' ports ({@link BROWSER_PORTS}) need nothing here: `127.0.0.1`
 * inside the sandbox is its own network namespace's, and its proxy refuses
 * loopback; the container runtimes' sockets are under the denied home dir and
 * `/run` (workspace-policy.ts `LINUX_HOST_PRIVATE`).
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
    denyRead: literal([
      ...policy.denyRead,
      "/tmp",
      ...runtimeSocketDenies(policy, place.containerSockets),
    ]),
    allowRead: literal([
      ...policy.allowRead,
      place.srtTmp,
      ...(place.bunNode ? [place.bunNode] : []),
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
  bwrapPath: place.bwrap,
});

/** `text` as one bash word. */
const bashWord = (text: string): string => `'${text.replaceAll("'", "'\\''")}'`;

/**
 * The bwrap a Linux workspace's srt runs, by srt's own `bwrapPath` setting
 * ("absolute path to the bwrap (bubblewrap) binary", sandbox-config.js): the
 * host's bwrap `real`, with `--remount-ro` on each tmpfs srt mounts. srt
 * mounts a tmpfs only over a read-denied dir (`--tmpfs`, linux-sandbox-utils.js
 * `pushReadDenyDirMounts` at 0.0.79), and a tmpfs is writable: "inside the
 * sandbox it is an EMPTY WRITABLE directory" (srt's README; srt #149). Each
 * remount goes after all of srt's mounts, just before the command, which srt
 * always ends its words with (`-- SHELL -c COMMAND`), so every mount point
 * inside a tmpfs is made first; bwrap's `--remount-ro` "works only on the
 * specified mount point, without changing any other mount point under the
 * specified path" (bwrap(1)), so what srt binds back into it, the clone and
 * the scratch dir among them, keeps its own flags. srt moves its mounts into
 * a file bwrap reads through `--args FD` when the line would be too long; the
 * launcher reads them from that fd by its own open (`/proc/self/fd/FD`), so
 * bwrap still reads the file from its start. What srt runs with no tmpfs (its
 * namespace probe, `--version`) runs as it is. A command whose words this
 * cannot read starts no sandbox, in its own words.
 */
export const readOnlyDeniesBwrap = (real: string): string => `#!/bin/bash
set -u
real=${bashWord(real)}
words=("$@")
count=$#
head=("$@")
tail=()
if (( count >= 4 )) && [[ \${words[count-4]} == -- && \${words[count-2]} == -c ]]; then
  head=("\${words[@]:0:count-4}")
  tail=("\${words[@]:count-4}")
fi
landings=()
scan() {
  local all=("$@") at=0 fd word
  while (( at < \${#all[@]} )); do
    case \${all[at]} in
      --tmpfs)
        landings+=("\${all[at+1]}")
        at=$((at + 2))
        ;;
      --args)
        fd=\${all[at+1]}
        local file=()
        while IFS= read -r -d '' word || [[ -n $word ]]; do
          file+=("$word")
        done < "/proc/self/fd/$fd" || {
          echo "cawco: srt's bwrap mounts on fd $fd could not be read, so its read-denied dirs cannot be made read-only and no sandbox starts" >&2
          exit 125
        }
        scan "\${file[@]}"
        at=$((at + 2))
        ;;
      *)
        at=$((at + 1))
        ;;
    esac
  done
}
scan "\${head[@]}"
if (( \${#landings[@]} == 0 )); then
  exec "$real" "$@"
fi
if (( \${#tail[@]} == 0 )); then
  echo "cawco: srt's bwrap words do not end in '-- SHELL -c COMMAND', so its read-denied dirs cannot be made read-only and no sandbox starts" >&2
  exit 125
fi
declare -A seen=()
remounts=()
for landing in "\${landings[@]}"; do
  if [[ -z \${seen[$landing]:-} ]]; then
    seen[$landing]=1
    remounts+=(--remount-ro "$landing")
  fi
done
exec "$real" "\${head[@]}" "\${remounts[@]}" "\${tail[@]}"
`;

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

/**
 * THE NAMES A macOS BOUNDARY'S PROCESSES ARE KNOWN BY. macOS keeps no tree
 * of a sandbox's processes and no namespace around them, and withholds the
 * environment of every Apple platform binary (xnu kern_sysctl.c
 * `sysctl_procargsx` reads it only when the "target process is not
 * cs_restricted", SIP is off or the caller holds
 * `com.apple.private.read-environment-variables`), so a `setsid`,
 * double-forked `/bin/sleep` that launchd adopted carried no marker anyone
 * could read. What every process of a boundary does carry, through fork,
 * exec, `setsid`, a double fork and adoption by launchd, whatever its binary
 * and environment, is the Seatbelt profile its runner started under: the
 * kernel holds it with the process, and none inside can leave or replace it
 * ("sandbox-exec: sandbox_apply: Operation not permitted", measured inside
 * one). Each profile therefore lets its processes look up two Mach service
 * names nobody registers, its workspace's and its generation's, and refuses
 * every other name under {@link MEMBERSHIP_PREFIX}; the agent asks the
 * kernel which profile allows which (core process-identity.ts
 * `seatbeltLetsLookUp`, Seatbelt's `sandbox_check`). A process answers to a
 * boundary's name when its profile allows that name and refuses the bare
 * prefix: an unsandboxed process and a permissive foreign sandbox allow the
 * prefix, any other foreign sandbox refuses the name. Measured on the Mac
 * (2026-10-20): each sandbox's escaped `/bin/sleep`, its parent launchd and
 * its environment unreadable, answered to its own name alone; a second
 * sandbox with a byte-identical profile answered to the same name; of 380
 * other sandboxed processes of the user, the only ones that answered were
 * those two sandboxes' own runners and the `sleep` each was polling with.
 * It reads all 803 processes of the Mac in 3.6 ms.
 */
export const MEMBERSHIP_PREFIX = "dev.cawco.boundary.";

/** The name workspace `id`'s boundaries answer to, or, given `gen`, that generation's alone ({@link MEMBERSHIP_PREFIX}). */
export const membershipName = (id: string, gen?: string): string =>
  gen === undefined
    ? `${MEMBERSHIP_PREFIX}${id}`
    : `${MEMBERSHIP_PREFIX}${id}/${gen}`;

/** What a macOS profile names besides the policy. */
export interface SeatbeltPlace {
  /**
   * The tool, git and GitHub doors' sockets, the unix sockets under
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
  /** The names its processes answer to ({@link membershipName}): its workspace's and its generation's. */
  readonly members: readonly string[];
  /**
   * The host sockets a command still connects to, each a Seatbelt regex over
   * the socket's whole path, inside a dir of {@link hostSockets}: each booted
   * simulator's testmanagerd (boundary.ts `TEST_MANAGER_SOCKET`) and its
   * remote automation (boundary.ts `REMOTE_AUTOMATION_SOCKET`).
   */
  readonly reachedHostSockets: readonly string[];
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
 * no keychain service is looked up ({@link KEYCHAIN_MACH_SERVICES}), its
 * processes answer to its workspace's and generation's names alone
 * ({@link MEMBERSHIP_PREFIX}), and no
 * unix socket under {@link SeatbeltPlace.hostSockets} or a read-denied path
 * (the home dir, every credential store) is reached but the tool, git and
 * GitHub doors' and those under the workspace's own writable roots: tools put their
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
 * there. Of the host's sockets, only {@link SeatbeltPlace.reachedHostSockets}
 * are reached, each by its whole path. Allows come after denies, as srt writes its `allowUnixSockets`
 * (`(allow network-outbound (remote unix-socket (subpath …)))`,
 * macos-sandbox-utils.ts). The network is the host's: Seatbelt cannot judge a
 * destination by the name it resolves. Of it, every port of the browsers
 * ({@link BROWSER_PORTS}) is refused on this machine's loopback: a project's
 * Chromium answers its DevTools port to anyone who reaches it, and agents
 * reach a browser through its gate alone, from outside every boundary.
 * Seatbelt filters loopback by port only ("The only valid input for IP is
 * localhost or *, meaning that you can only filter by port", Apple's
 * Sandbox Guide), so it is one rule per port.
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
    // The pseudo-terminal multiplexer, which openpty() opens read-write: its
    // pairs are `/dev/ttys…`, allowed above. Refused, xcodebuild cannot launch
    // a UI test runner (Maestro's driver) on a simulator: "Pseudo Terminal
    // Setup Error … Errno: 1 … Operation not permitted".
    '  (literal "/dev/ptmx")',
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
    `(deny mach-lookup (global-name-prefix ${sbString(MEMBERSHIP_PREFIX)}))`,
    "(allow mach-lookup",
    ...place.members.map((name) => `  (global-name ${sbString(name)})`),
    ")",
    ...socketDenies.map(
      (path) =>
        `(deny network-outbound (remote unix-socket (subpath ${sbString(path)})))`
    ),
    ...[...place.doors, ...ownSockets].map(
      (path) =>
        `(allow network-outbound (remote unix-socket (subpath ${sbString(path)})))`
    ),
    ...place.reachedHostSockets.map(
      (pattern) =>
        `(allow network-outbound (remote unix-socket (path-regex #"${pattern}")))`
    ),
    ...browserPorts().map(
      (port) => `(deny network-outbound (remote ip "localhost:${port}"))`
    ),
    "",
  ].join("\n");
};
