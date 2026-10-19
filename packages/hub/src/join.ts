/**
 * Adding a machine: the install script every new machine runs, the addresses
 * it could reach this hub on, and the SSH add that runs the script for the
 * operator.
 *
 * A machine joins by running `/install.sh`, which installs the signed binary
 * release of this hub's channel and ends in `cawco binary-install agent`.
 * Run by hand, the person picks a hub address the machine can reach. An SSH
 * add needs none: the hub first opens its own connection to the machine
 * (ssh-tunnels.ts), which carries a port on the machine's loopback to the
 * hub, and the install downloads the script and joins through that port. So
 * a machine the hub can SSH into joins whether or not it can reach any
 * address of the hub's. Nothing the operator types reaches a shell: the
 * target is one argv entry for `ssh`, the remote command holds only the
 * port OpenSSH allocated, and a password goes only to `ssh`'s askpass, on
 * its stdin.
 *
 * A machine that does not trust the hub's key yet is added with its
 * password: one connection signs in with it and appends the hub's key to
 * `~/.ssh/authorized_keys` as `ssh-copy-id` does; the connection the hub
 * holds and the install sign in with that key. The password is never in an
 * argv, a file, a job's lines or the database.
 */

import { lookup } from "node:dns/promises";
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { homedir, hostname, networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import {
  INSTALL_JOINED,
  INSTALL_STEP_PREFIX,
  type JoinAddress,
  type JoinInfo,
  type SshJoinJob,
  type SshJoinProblem,
} from "@cawco/core";
import { RELEASE_REPOSITORY } from "@cawco/core/binary-distribution";
import { readInstallation } from "@cawco/core/binary-installation";
import { readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { generateInstallScript } from "@cawco/core/install-script";
import { LineSplitter } from "@cawco/core/lines";
import { RELEASE_PUBLIC_KEY } from "@cawco/core/release-key";
import { hostEnvironment } from "@cawco/core/session-env";
import { Elysia, t } from "elysia";
import { DB_PATH, HUB_PORT } from "./config";
import type { HubLifetimeShape } from "./lifetime";
import { localHubName } from "./mdns";
import {
  CONNECT_S,
  type SshTunnels,
  sshOptions,
  type TunnelOpen,
  type TunnelOutcome,
  type TunnelRefusal,
} from "./ssh-tunnels";

/** How long a short command gets to answer. Our choice. */
const OUTPUT_MS = 3000;

/**
 * Runs a short command and answers its stdout, or undefined when it failed.
 * One that did not answer in time (`ms`) is said once in the log, apart from
 * a failure, and what it would answer is not had.
 */
const output = async (
  argv: string[],
  ms = OUTPUT_MS
): Promise<string | undefined> => {
  const ran = await readWithin(ms, async (signal) => {
    const child = Bun.spawn(argv, {
      env: hostEnvironment(),
      stdout: "pipe",
      stderr: "ignore",
      stdin: "ignore",
      signal,
    });
    const [text, code] = await Promise.all([
      new Response(child.stdout).text(),
      child.exited,
    ]);
    return code === 0 ? text.trim() : undefined;
  });
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      console.warn(
        `[join] ${argv.join(" ")} did not answer within ${Math.round(ran.after / 1000)} s; what it would answer is not had`
      );
      return;
    default: {
      const unhandled: never = ran;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

const TRAILING_DOT = /\.$/;

/**
 * Every address a machine could reach this hub on: Tailscale first, because a
 * tailnet address works from anywhere the machine is, then every non-internal
 * IPv4 labelled with its interface, then the `.local` name the hub holds on
 * its networks (mdns.ts), which keeps working when the hub's address changes
 * but reaches only machines on the same network. The Tailscale IP also shows
 * up as an interface (`tailscale0`, `utun…`); it is listed once, under
 * Tailscale. A machine without the `tailscale` binary simply has no Tailscale
 * rows, and a hub with mDNS off has no `.local` row.
 */
export const joinAddresses = async (): Promise<JoinAddress[]> => {
  const url = (host: string): string => `http://${host}:${HUB_PORT}`;
  const [ip, status] = await Promise.all([
    Bun.which("tailscale") ? output(["tailscale", "ip", "-4"]) : undefined,
    Bun.which("tailscale")
      ? output(["tailscale", "status", "--json"])
      : undefined,
  ]);
  const found: JoinAddress[] = [];
  const tailscaleIp = ip?.split("\n")[0]?.trim();
  if (tailscaleIp) {
    found.push({ label: "Tailscale", url: url(tailscaleIp) });
  }
  const dnsName = status
    ? (JSON.parse(status) as { Self?: { DNSName?: string } }).Self?.DNSName
    : undefined;
  if (dnsName) {
    found.push({
      label: "Tailscale DNS",
      url: url(dnsName.replace(TRAILING_DOT, "")),
    });
  }
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) {
        continue;
      }
      const candidate = url(entry.address);
      if (!found.some((address) => address.url === candidate)) {
        found.push({ label: name, url: candidate });
      }
    }
  }
  const local = localHubName();
  if (local) {
    found.push({ label: "On this network", url: url(local) });
  }
  return found;
};

/**
 * The key an SSH add signs in with: what `ssh` itself tries first. The
 * ed25519 key when there is one, else the first `id_*.pub` in `~/.ssh`.
 */
export const sshPublicKey = (): string | null => {
  const dir = join(homedir(), ".ssh");
  const preferred = join(dir, "id_ed25519.pub");
  if (existsSync(preferred)) {
    return readFileSync(preferred, "utf8").trim();
  }
  if (!existsSync(dir)) {
    return null;
  }
  const [first] = readdirSync(dir)
    .filter((name) => name.startsWith("id_") && name.endsWith(".pub"))
    .sort();
  return first ? readFileSync(join(dir, first), "utf8").trim() : null;
};

/**
 * A `Host` header that can be pasted into the script as-is: a name or an
 * address and a port. Anything else is refused before a script is written.
 */
const HOST_HEADER = /^[A-Za-z0-9.\-[\]:]+$/;

/** The hub and the public site render the same installer body. */
export const installScript = (hub: string, releaseHost?: string): string =>
  generateInstallScript({
    hub,
    origin: `https://github.com/${RELEASE_REPOSITORY}`,
    releaseHost,
  });

/** How long a finished SSH add stays readable, for a dialog opened late. */
const JOB_TTL_MS = 60 * 60 * 1000;
/** Output kept per add. The steps are a dozen lines; `bun install` is the bulk. */
const MAX_LINES = 2000;
/**
 * How long a clean exit waits for the hub to see the machine. `join` itself
 * already waited for it, so this only covers the socket racing the exit.
 */
const REGISTER_GRACE_MS = 15_000;

/**
 * A target `ssh` reads as a destination and nothing else: no leading dash (an
 * option), no whitespace (a second argument once a shell splits it).
 */
const TARGET = /^[^-\s][^\s]*$/;

/** A remote shell's line ending, which a pty-less SSH session can still send. */
const CARRIAGE_RETURN = /\r$/;

/** A password `ssh` could not be handed on askpass's one line. */
const LINE_BREAK = /[\r\n]/;

/**
 * The askpass program a password add runs `ssh` with. `ssh` runs it once
 * per prompt and reads its stdout as the answer (ssh(1), SSH_ASKPASS); it
 * shares `ssh`'s stdin, a pipe that holds the password's one line, so the
 * first prompt is answered and a second one finds the pipe empty and gives
 * up. `read -r` takes the line as it is and `printf '%s'` prints it as data,
 * so no character of it is ever read as shell.
 */
const ASKPASS = `#!/bin/sh
IFS= read -r password || exit 1
printf '%s\\n' "$password"
`;

/** Where {@link ASKPASS} is written, beside the hub's database. */
const ASKPASS_PATH = join(dirname(DB_PATH), "ssh-askpass");

/** {@link ASKPASS} on disk, executable by this user alone, written only when it is not already as it should be. */
const askpass = (): string => {
  if (
    !existsSync(ASKPASS_PATH) ||
    readFileSync(ASKPASS_PATH, "utf8") !== ASKPASS
  ) {
    writeFileSync(ASKPASS_PATH, ASKPASS, { mode: 0o700 });
  }
  chmodSync(ASKPASS_PATH, 0o700);
  return ASKPASS_PATH;
};

/**
 * A public key line, and a comment that can stand inside the trust step's
 * quotes: no quote, `$`, backtick, backslash or `!` for any login shell
 * (sh, bash, zsh, fish, csh) to read.
 */
const PUBLIC_KEY = /^(\S+ [A-Za-z0-9+/]+=*)(?: (.*))?$/;
const PLAIN_COMMENT = /^[\w@.:,+=/ -]*$/;

/** The trust command's step line, worded as the install script words its own. */
const TRUST_STEP = "adding this hub's SSH key";

/**
 * The step the remote command prints before it fetches the install script,
 * which tells the dialog the install runs on the machine now.
 */
const DOWNLOAD_STEP = "downloading the install script from ";

/**
 * The step the hub says once its own connection carries a port on the
 * machine to it: the first line of an add whose connection has signed in.
 */
const CARRY_STEP = "carrying this hub to the machine on its port ";

/**
 * The step the hub says as it gives the machine its key over its own
 * connection (ssh-tunnels.ts `admit`): the add is the person admitting it.
 */
const KEY_STEP = "giving the machine its key to this hub";

/**
 * The steps a machine fails on when it will not do what its forward needs,
 * each naming the setting and its fix (https://man.openbsd.org/sshd_config.5).
 * The hub reaches a machine added over SSH only through that forward, so
 * there is no other way to try.
 * - AllowTcpForwarding: "no to prevent all TCP forwarding, local to allow
 *   local (from the perspective of ssh(1)) forwarding only or remote to
 *   allow remote forwarding only".
 * - GatewayPorts: "yes to force remote port forwardings to bind to the
 *   wildcard address": anyone the machine's network reaches would reach the
 *   hub, so the add stops before the hub is forwarded there.
 */
const refusalStep = (refusal: TunnelRefusal): string => {
  switch (refusal.kind) {
    case "forwarding":
      return "forwarding a port on the machine to this hub, which its SSH server refuses: set AllowTcpForwarding yes (or remote) in its sshd_config and restart sshd";
    case "exposed":
      return `forwarding a port on the machine to this hub, which its SSH server would open on ${refusal.bound.join(", ")}, not only its loopback: set GatewayPorts no in its sshd_config and restart sshd`;
    case "held":
      return `forwarding port ${refusal.port} on the machine to this hub, which another program there holds: stop it, then Retry`;
    case "failed":
      return `${refusal.step} (${refusal.said})`;
    default: {
      const unhandled: never = refusal;
      throw new Error(`unhandled refusal: ${JSON.stringify(unhandled)}`);
    }
  }
};

/**
 * How long the machine's `curl` gets for the install script as a whole,
 * once connected: the script is a few kilobytes. curl(1) `--max-time`. Our
 * choice.
 */
const DOWNLOAD_MAX_S = 60;

/**
 * curl's exit statuses for an address it could not reach (curl(1) EXIT
 * CODES: 6 the name did not resolve, 7 the connection failed, 28 it timed
 * out); any other is the hub answering, and the download step's failure.
 */
const UNREACHED = new Set([6, 7, 28]);

/**
 * The line the install command prints when the machine's curl fails, its exit
 * status after it: CawCo's own, so the status is read off it, never curl's
 * words. Not a step line ({@link INSTALL_STEP_PREFIX}): the step it failed on
 * is still the download.
 */
const CURL_EXIT = "cawco-curl-exit: ";

/**
 * The install, once signed in: its step line, then the script from the hub
 * at `hubUrl`, the port on the machine's loopback the hub's connection
 * carries to it, fetched whole (a few kilobytes, held in a shell variable,
 * so an assignment's status is curl's own and the machine needs nothing
 * beyond sh and curl) and handed to `sh`. A curl that fails says its exit
 * status on a {@link CURL_EXIT} line, and the command ends failed. The
 * script names the hub as its `Host` header did, so the agent it installs
 * joins at that address too. It holds no single quote ({@link remoteCommand}).
 */
export const installCommand = (hubUrl: string): string =>
  `echo "${INSTALL_STEP_PREFIX}${DOWNLOAD_STEP}${hubUrl}" && if script=$(curl -fsSL --connect-timeout ${CONNECT_S} --max-time ${DOWNLOAD_MAX_S} ${hubUrl}/install.sh); then printf "%s\\n" "$script" | sh; else echo "${CURL_EXIT}$?"; false; fi`;

/**
 * What `ssh-copy-id` does on the machine, run by a password add's one
 * connection: `~/.ssh` made 700 and `authorized_keys` 600 when they are
 * missing (and left as they are when they exist), a final newline added to
 * the file when it lacks one, and the key appended only when the file does
 * not hold it already. It prints its step line first, so a failure is
 * named by it, and runs in a subshell so its umask stays its own. Its
 * apostrophe is printf's `\047` ({@link remoteCommand} holds no single
 * quote). A key whose comment could not stand in that command is added
 * without the comment; a comment is a label, never part of the key.
 */
const trustCommand = (key: string): string | null => {
  const [, blob, comment] = PUBLIC_KEY.exec(key) ?? [];
  if (!blob) {
    return null;
  }
  const line =
    comment && PLAIN_COMMENT.test(comment) ? `${blob} ${comment}` : blob;
  const file = '"$HOME/.ssh/authorized_keys"';
  const step = `${INSTALL_STEP_PREFIX}${TRUST_STEP}`.replace("'", "\\047");
  return `( printf "${step}\\n" && umask 077 && mkdir -p "$HOME/.ssh" && touch ${file} && { [ -z "$(tail -c 1 ${file})" ] || echo >> ${file}; } && { grep -qF "${blob}" ${file} || echo "${line}" >> ${file}; } )`;
};

/**
 * The one command an add hands `ssh`: `exec sh -c` and one single-quoted
 * word, so every login shell (sh, bash, zsh, fish, csh) hands it over as it
 * is (the word holds no quote or backslash: fish reads `\\` and `\'` inside
 * single quotes) and `sh` takes the login shell's place under sshd's session
 * process.
 *
 * sshd signals no command it started without a terminal when the connection
 * closes (the install gets none: the script asks its questions on one), so a
 * stopped add's install would run on until its next write. A watchdog sees
 * to it: while sshd's session process (`sh`'s parent) lives it waits, and
 * once it is gone it ends the command's whole process group. The command
 * ends the watchdog when it finishes, and exits with the command's status.
 * Measured against OpenSSH 10.2's sshd: a silent remote command outlived a
 * killed `ssh`; under the watchdog it was gone within 4 s.
 */
const remoteCommand = (body: string): string =>
  `exec sh -c 'p=$PPID; ( while ps -p "$p" >/dev/null 2>&1; do sleep 1; done; kill -TERM 0 ) >/dev/null 2>&1 & w=$!; ${body}; s=$?; kill "$w" 2>/dev/null; exit $s'`;

/**
 * The step an add fails on when `ssh` ended before the remote command said
 * anything: ssh refused the session. Once the hub has reached the machine's
 * port and found its host key as it knows it ({@link beforeSsh}), that is
 * the sign-in, most often; but `ssh` exits 255 for every failure of its own
 * (ssh(1) EXIT STATUS), so which one is in ssh's words, shown below it.
 */
const SIGN_IN_STEP = "signing in over SSH";

/**
 * What went wrong once `ssh` ran, off its exit and the lines the remote
 * command printed that are CawCo's own (its step lines, curl's exit status
 * on {@link CURL_EXIT}): the download through the hub's connection, a
 * machine that never came online, or the step it stopped on. Whether the
 * machine was reachable, and its host key, are settled before `ssh` runs
 * ({@link beforeSsh}), never read off ssh's words.
 */
export const problemOf = (
  lines: readonly string[],
  exitCode: number,
  machineId: string | null
): SshJoinProblem => {
  const steps = lines.filter((line) => line.startsWith(INSTALL_STEP_PREFIX));
  const last = steps.at(-1)?.slice(INSTALL_STEP_PREFIX.length);
  const curled = lines.findLast((line) => line.startsWith(CURL_EXIT));
  if (
    last?.startsWith(DOWNLOAD_STEP) &&
    curled !== undefined &&
    UNREACHED.has(Number(curled.slice(CURL_EXIT.length)))
  ) {
    return { kind: "download" };
  }
  if (exitCode === 0 && machineId) {
    return { kind: "unregistered" };
  }
  return { kind: "step", step: last ?? SIGN_IN_STEP };
};

/**
 * Where `ssh` connects for a target, as `ssh -G` resolves it after its config
 * (ssh(1) `-G`: one `keyword value` line each): the host and port, the
 * known-hosts files it checks the host key in and the name it looks it up by
 * (ssh_config(5) HostKeyAlias as it is; else the host, `[host]:port` off port
 * 22, sshd(8) SSH_KNOWN_HOSTS FILE FORMAT), and whether it goes through
 * another host (ProxyJump, ProxyCommand), which the hub cannot reach the way
 * `ssh` does.
 */
interface SshDestination {
  host: string;
  keyName: string;
  knownHosts: string[];
  port: number;
  proxied: boolean;
}

const destinationOf = async (
  target: string,
  port: number | null
): Promise<SshDestination | undefined> => {
  const said = await output([
    "ssh",
    "-G",
    ...(port === null ? [] : ["-p", String(port)]),
    "--",
    target,
  ]);
  if (said === undefined) {
    return;
  }
  const config = new Map<string, string>();
  for (const line of said.split("\n")) {
    const at = line.indexOf(" ");
    if (at > 0) {
      config.set(line.slice(0, at), line.slice(at + 1).trim());
    }
  }
  const host = config.get("hostname");
  const at = Number(config.get("port"));
  if (!(host && Number.isInteger(at))) {
    return;
  }
  const set = (keyword: string): boolean => {
    const value = config.get(keyword);
    return value !== undefined && value !== "none";
  };
  const files = (keyword: string): string[] =>
    (config.get(keyword) ?? "").split(" ").filter(Boolean);
  return {
    host,
    port: at,
    keyName:
      config.get("hostkeyalias") ?? (at === 22 ? host : `[${host}]:${at}`),
    knownHosts: [
      ...files("userknownhostsfile"),
      ...files("globalknownhostsfile"),
    ].filter((file) => existsSync(file)),
    proxied: set("proxyjump") || set("proxycommand"),
  };
};

/** getaddrinfo's errors for a name that does not resolve (EAI_*, as Node names them). */
const UNRESOLVED = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_NONAME",
  "EAI_FAIL",
  "EAI_NODATA",
  "ENODATA",
]);

/** connect(2)'s errors, in the words the add says them in. */
const CONNECT_ERRORS: Record<string, string> = {
  ECONNREFUSED: "connection refused",
  EHOSTUNREACH: "no route to host",
  EHOSTDOWN: "the host is down",
  ENETUNREACH: "the network is unreachable",
  ENETDOWN: "the network is down",
  ETIMEDOUT: "no answer",
};

/** One TCP connect from the hub to `address`: undefined once it connects, else connect(2)'s errno. */
const tcpConnect = (
  address: string,
  port: number
): Promise<string | undefined> =>
  new Promise((resolve) => {
    const socket = connect({ host: address, port, timeout: CONNECT_S * 1000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(undefined);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve("ETIMEDOUT");
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      resolve(error.code ?? "EIO");
    });
  });

/**
 * Whether the hub reaches `host` on `port`, as `ssh` would first: the name
 * resolved, then a TCP connect to each of its addresses in turn until one
 * answers. Unreachable, by getaddrinfo's or connect(2)'s errno: the name did
 * not resolve, the port refused, no route, or no answer within ssh's own
 * ConnectTimeout.
 */
const reach = async (
  host: string,
  port: number
): Promise<SshJoinProblem | undefined> => {
  const addresses = await lookup(host, { all: true }).then(
    (found) => found.map(({ address }) => address),
    (error: NodeJS.ErrnoException) => error.code ?? "EIO"
  );
  if (typeof addresses === "string") {
    return {
      kind: "unreachable",
      detail: UNRESOLVED.has(addresses)
        ? `the name ${host} did not resolve`
        : `looking up ${host} failed: ${addresses}`,
    };
  }
  let failed = "ENOTFOUND";
  for (const address of addresses) {
    // biome-ignore lint/performance/noAwaitInLoops: one address after another, as ssh tries them
    const code = await tcpConnect(address, port);
    if (code === undefined) {
      return;
    }
    failed = code;
  }
  return {
    kind: "unreachable",
    detail:
      addresses.length === 0
        ? `the name ${host} did not resolve`
        : (CONNECT_ERRORS[failed] ?? `connecting failed: ${failed}`),
  };
};

/**
 * The keys of a known-hosts line, `type blob` each, from `ssh-keygen -F`'s
 * answer: a line is `[marker] hosts type blob [comment]` (sshd(8)), and its
 * `#` lines are ssh-keygen's own notes. A `@cert-authority` line vouches by
 * certificate, which a plain key cannot be compared with: `null`.
 */
const knownKeysOf = (said: string): Set<string> | null => {
  const keys = new Set<string>();
  for (const line of said.split("\n")) {
    const fields = line.trim().split(WHITESPACE);
    if (!fields[0] || fields[0].startsWith("#")) {
      continue;
    }
    if (fields[0] === "@cert-authority") {
      return null;
    }
    const [, type, blob] = fields[0].startsWith("@") ? fields.slice(1) : fields;
    if (type && blob) {
      keys.add(`${type} ${blob}`);
    }
  }
  return keys;
};

const WHITESPACE = /\s+/;

/**
 * Whether the machine's host key is one this hub's `ssh` knows it by: what
 * `ssh-keyscan` hears from the machine against what `ssh-keygen -F` finds in
 * each known-hosts file `ssh` reads. Changed when the hub knows keys for it
 * and the machine offers none of them; a machine the hub knows no key for is
 * new, which `ssh` takes (StrictHostKeyChecking=accept-new, ssh-tunnels.ts).
 * Not changed, too, when either side could not be read: `ssh` then decides.
 */
const hostKeyChanged = async (to: SshDestination): Promise<boolean> => {
  const known = new Set<string>();
  for (const file of to.knownHosts) {
    // biome-ignore lint/performance/noAwaitInLoops: a few files, each a short local read
    const said = await output(["ssh-keygen", "-F", to.keyName, "-f", file]);
    const keys = said === undefined ? new Set<string>() : knownKeysOf(said);
    if (keys === null) {
      return false;
    }
    for (const key of keys) {
      known.add(key);
    }
  }
  if (known.size === 0) {
    return false;
  }
  const scanned = await output(
    [
      "ssh-keyscan",
      "-T",
      String(CONNECT_S),
      "-p",
      String(to.port),
      "--",
      to.host,
    ],
    (CONNECT_S + 5) * 1000
  );
  const offered = scanned === undefined ? null : knownKeysOf(scanned);
  if (!offered || offered.size === 0) {
    return false;
  }
  return ![...offered].some((key) => known.has(key));
};

/**
 * What stops an add before any `ssh` runs: the machine's port unreachable
 * from the hub ({@link reach}), or its host key not the one the hub knows
 * ({@link hostKeyChanged}). A target that goes through another host, or one
 * `ssh -G` could not resolve, is `ssh`'s to try.
 */
export const beforeSsh = async (
  target: string,
  port: number | null
): Promise<SshJoinProblem | undefined> => {
  const to = await destinationOf(target, port);
  if (!to || to.proxied) {
    return;
  }
  const unreached = await reach(to.host, to.port);
  if (unreached) {
    return unreached;
  }
  return (await hostKeyChanged(to)) ? { kind: "host-key" } : undefined;
};

/**
 * Why the hub's own connection to the machine did not come up: what the
 * machine would not do once signed in, else what its `ssh` said.
 */
const tunnelProblem = (
  outcome: Extract<TunnelOutcome, { kind: "ended" }>
): SshJoinProblem =>
  outcome.refusal
    ? { kind: "step", step: refusalStep(outcome.refusal) }
    : problemOf(outcome.lines, outcome.code ?? 255, null);

interface JoinDeps {
  /** Runs each finished job's forgetting until the hub closes. */
  readonly lifetime: HubLifetimeShape;
  /** Whether the hub holds a live socket from this machine right now. */
  readonly online: (machineId: string) => boolean;
  /** The connections the hub holds to the machines it added over SSH. */
  readonly tunnels: SshTunnels;
}

/** How long a stopped `ssh` gets to close its connection before its group is killed outright. Our choice. */
const STOP_GRACE_MS = 3000;

/**
 * Signals `ssh`'s process group: `ssh` and the askpass it may be running.
 * One that is already gone has nothing left to signal. Only a real pid's
 * group: `kill(-1)` signals every process this user owns.
 */
const signalGroup = (pid: number, signal: "SIGTERM" | "SIGKILL"): void => {
  if (!Number.isInteger(pid) || pid <= 1) {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // ESRCH: the group exited between the stop and the signal.
  }
};

/** An add while it runs: the `ssh` it waits on now, the connection it asked for, and its run as a whole, settled. */
interface Run {
  child: Bun.Subprocess | null;
  ended: Promise<void>;
  /** Settles when the person stops the add: a wait on the hub's connection stops waiting. */
  readonly halt: Promise<null>;
  readonly halted: () => void;
  stopped: boolean;
  tunnel: TunnelOpen | null;
}

export const joinRoutes = ({ lifetime, online, tunnels }: JoinDeps) => {
  const jobs = new Map<string, SshJoinJob>();
  const runs = new Map<string, Run>();

  const fail = (job: SshJoinJob, problem: SshJoinProblem): void => {
    job.problem = problem;
    job.state = "failed";
  };

  /** An install that has exited: done once the hub has the machine online, else what went wrong. */
  const settle = async (job: SshJoinJob): Promise<void> => {
    const { machineId, exitCode } = job;
    if (exitCode === 0 && machineId) {
      const deadline = Date.now() + REGISTER_GRACE_MS;
      while (!online(machineId) && Date.now() < deadline) {
        // biome-ignore lint/performance/noAwaitInLoops: a poll — each check must see the registry after the previous wait
        await Bun.sleep(500);
      }
      if (online(machineId)) {
        job.state = "done";
        return;
      }
    }
    fail(job, problemOf(job.lines, exitCode ?? -1, machineId));
  };

  /** One line of the add's output, kept as the dialog reads it. */
  const take = (job: SshJoinJob, line: string): void => {
    const clean = line.replace(CARRIAGE_RETURN, "");
    if (clean.startsWith(INSTALL_JOINED)) {
      job.machineId = clean.slice(INSTALL_JOINED.length).trim();
    }
    job.lines.push(clean);
    if (job.lines.length > MAX_LINES) {
      job.lines.splice(0, job.lines.length - MAX_LINES);
    }
  };

  const collect = async (
    job: SshJoinJob,
    stream: ReadableStream<Uint8Array>
  ): Promise<void> => {
    const decoder = new TextDecoder();
    const lines = new LineSplitter();
    for await (const chunk of stream) {
      for (const line of lines.push(decoder.decode(chunk, { stream: true }))) {
        take(job, line);
      }
    }
    const rest = lines.push(decoder.decode());
    for (const line of rest) {
      take(job, line);
    }
    if (lines.pending) {
      take(job, lines.end());
    }
  };

  /**
   * One `ssh` session of an add, its output into the job's lines, answering
   * its exit. With `password` it signs in by password alone, through
   * {@link ASKPASS} on `ssh`'s stdin; without it, by key with no prompt at
   * all (BatchMode). `-n` keeps that stdin from the remote command: `ssh`
   * hands the session /dev/null. `ssh` leads a process group of its own
   * (`detached`, setsid), so a stop ends it and its askpass together.
   */
  const session = async (
    job: SshJoinJob,
    run: Run,
    password: string | null,
    body: string
  ): Promise<number> => {
    const child = Bun.spawn(
      [
        "ssh",
        "-n",
        ...(password === null
          ? ["-o", "BatchMode=yes"]
          : [
              "-o",
              "PreferredAuthentications=password,keyboard-interactive",
              "-o",
              "PubkeyAuthentication=no",
              "-o",
              "NumberOfPasswordPrompts=1",
            ]),
        ...sshOptions(job.port),
        "--",
        job.target,
        remoteCommand(body),
      ],
      {
        stdin:
          password === null
            ? "ignore"
            : new TextEncoder().encode(`${password}\n`),
        stdout: "pipe",
        stderr: "pipe",
        detached: true,
        env:
          password === null
            ? process.env
            : {
                ...process.env,
                SSH_ASKPASS: askpass(),
                SSH_ASKPASS_REQUIRE: "force",
              },
      }
    );
    run.child = child;
    const [, , code] = await Promise.all([
      collect(job, child.stdout),
      collect(job, child.stderr),
      child.exited,
    ]);
    run.child = null;
    return code;
  };

  /**
   * The add, in order: a password add's one connection adds the hub's key;
   * the hub's own connection to the machine opens with it, carrying a port
   * on the machine to the hub; the install runs by key and joins through
   * that port. A connection this add made is the hub's to hold once the
   * machine is online, and goes with an add that fails or stops.
   */
  const add = async (
    job: SshJoinJob,
    run: Run,
    trust: { password: string; command: string } | null
  ): Promise<void> => {
    const stopped = await Promise.race([
      beforeSsh(job.target, job.port),
      run.halt,
    ]);
    if (run.stopped) {
      return;
    }
    if (stopped) {
      fail(job, stopped);
      return;
    }
    if (trust) {
      const code = await session(job, run, trust.password, trust.command);
      if (run.stopped) {
        return;
      }
      if (code !== 0) {
        job.exitCode = code;
        fail(job, problemOf(job.lines, code, null));
        return;
      }
    }
    const tunnel = tunnels.open(job.target, job.port, (line) =>
      take(job, line)
    );
    run.tunnel = tunnel;
    const outcome = await Promise.race([tunnel.outcome, run.halt]);
    if (run.stopped || outcome === null) {
      return;
    }
    if (outcome.kind === "ended") {
      if (tunnel.fresh) {
        tunnels.abandon(tunnel.id);
      }
      job.exitCode = outcome.code;
      fail(job, tunnelProblem(outcome));
      return;
    }
    await install(job, run, tunnel, outcome.port);
  };

  /**
   * The install, by key, through `port` on the machine, once the hub's
   * connection carries it; done once the machine is online, when the hub
   * holds that connection from then on.
   */
  const install = async (
    job: SshJoinJob,
    run: Run,
    tunnel: TunnelOpen,
    port: number
  ): Promise<void> => {
    job.hubUrl = `http://127.0.0.1:${port}`;
    take(job, `${INSTALL_STEP_PREFIX}${CARRY_STEP}${port}`);
    take(job, `${INSTALL_STEP_PREFIX}${KEY_STEP}`);
    const unkept = await tunnels.admit(tunnel.id);
    if (run.stopped) {
      return;
    }
    if (unkept) {
      take(job, unkept);
      if (tunnel.fresh) {
        tunnels.abandon(tunnel.id);
      }
      fail(job, { kind: "step", step: KEY_STEP });
      return;
    }
    job.exitCode = await session(job, run, null, installCommand(job.hubUrl));
    if (run.stopped) {
      return;
    }
    // A machine already joined over this connection installs nothing new and
    // says no `joined as`: it is the machine the connection was held for.
    job.machineId ??= tunnel.machineId;
    await settle(job);
    if (job.state === "done" && job.machineId) {
      tunnels.joined(tunnel.id, job.machineId);
    } else if (tunnel.fresh) {
      tunnels.abandon(tunnel.id);
    }
  };

  const start = (
    target: string,
    port: number | null,
    trust: { password: string; command: string } | null
  ) => {
    const job: SshJoinJob = {
      id: crypto.randomUUID(),
      target,
      port,
      hubUrl: "",
      state: "running",
      lines: [],
      exitCode: null,
      machineId: null,
      problem: null,
    };
    jobs.set(job.id, job);
    let halted = (): void => undefined;
    const halt = new Promise<null>((resolve) => {
      halted = () => resolve(null);
    });
    const run: Run = {
      child: null,
      ended: Promise.resolve(),
      halt,
      halted,
      stopped: false,
      tunnel: null,
    };
    run.ended = add(job, run, trust)
      .then(() => {
        if (run.stopped) {
          job.state = "stopped";
        }
      })
      .finally(() => {
        runs.delete(job.id);
        lifetime.after(JOB_TTL_MS, () => jobs.delete(job.id));
      });
    runs.set(job.id, run);
    detach(run.ended, "machine join");
    return job;
  };

  /**
   * Stops an add that runs: a connection it made goes, and the `ssh` it
   * waits on is asked to end (TERM, so `ssh` closes the connection), then
   * killed if it has not within {@link STOP_GRACE_MS}. Answers once the run
   * has ended and reads `stopped`. On the machine, the closed connection
   * ends the remote command's watchdog's wait, and it ends the command
   * ({@link remoteCommand}).
   */
  const stop = async (run: Run): Promise<void> => {
    run.stopped = true;
    run.halted();
    if (run.tunnel?.fresh) {
      tunnels.abandon(run.tunnel.id);
    }
    const { child } = run;
    if (child) {
      signalGroup(child.pid, "SIGTERM");
      const exit = await readWithin(STOP_GRACE_MS, () => child.exited);
      switch (exit.kind) {
        case "answered":
          break;
        case "unanswered":
          signalGroup(child.pid, "SIGKILL");
          break;
        default: {
          const unhandled: never = exit;
          throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
        }
      }
    }
    await run.ended;
  };

  return new Elysia()
    .get("/install.sh", async ({ request, status, set }) => {
      const host = request.headers.get("host");
      if (!(host && HOST_HEADER.test(host))) {
        return status(400, "The request has no usable Host header.");
      }
      if (!RELEASE_PUBLIC_KEY) {
        return status(
          503,
          "This hub's build cannot install machines yet: it carries no release key to check a download against, so it would hand out an installer that verifies nothing. Install a released build of CawCo on this hub to enable it."
        );
      }
      const installation = await readInstallation();
      set.headers["content-type"] = "text/x-shellscript; charset=utf-8";
      return installScript(`http://${host}`, installation?.releaseHost);
    })
    .get("/api/join", async (): Promise<JoinInfo> => ({
      addresses: await joinAddresses(),
      sshPublicKey: sshPublicKey(),
      hubHostname: hostname(),
    }))
    .post(
      "/api/machines/ssh",
      {
        body: t.Object({
          target: t.String(),
          port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
          // Unread: the machine reaches the hub through the hub's own
          // connection. Shipped apps still send the address they picked.
          hubUrl: t.Optional(t.String()),
          password: t.Optional(t.String()),
        }),
      },
      ({ body, status }) => {
        const target = body.target.trim();
        if (!TARGET.test(target)) {
          return status(
            422,
            "Enter the SSH target as user@host or a Host from ~/.ssh/config, with no spaces and no leading dash."
          );
        }
        const password = body.password ?? "";
        if (LINE_BREAK.test(password)) {
          return status(
            422,
            "That password has a line break, which SSH cannot be handed. Check it, or add this hub's key to the machine yourself, then try again."
          );
        }
        const key = password === "" ? null : sshPublicKey();
        if (password !== "" && !key) {
          return status(
            422,
            `This hub has no SSH key to add to the machine yet. Create one on ${hostname()} with ssh-keygen -t ed25519, then try again.`
          );
        }
        const command = key === null ? null : trustCommand(key);
        if (key !== null && command === null) {
          return status(
            422,
            "This hub's SSH public key is not a key line ssh-copy-id would add. Check ~/.ssh on the hub's machine, then try again."
          );
        }
        return start(
          target,
          body.port ?? null,
          command === null ? null : { password, command }
        );
      }
    )
    .get("/api/machines/ssh/:id", ({ params, status }) => {
      const job = jobs.get(params.id);
      return job ?? status(404, "No SSH add with that id on this hub.");
    })
    .post("/api/machines/ssh/:id/stop", async ({ params, status }) => {
      const job = jobs.get(params.id);
      if (!job) {
        return status(404, "No SSH add with that id on this hub.");
      }
      const run = runs.get(params.id);
      if (!run) {
        return status(
          409,
          `That SSH add to ${job.target} has already ended, so there is nothing to stop.`
        );
      }
      await stop(run);
      return job;
    });
};
