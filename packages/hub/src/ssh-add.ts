/**
 * The commands and checks an SSH add of a machine runs for the operator: the
 * key it signs in with, the target it takes, the askpass a password goes
 * through, the remote commands it runs and the look at the machine before it
 * (`beforeSsh`). installs.ts runs the add itself; join.ts serves the install
 * script and the routes.
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
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { INSTALL_STEP_PREFIX } from "@cawco/core/join";
import { runCaptured } from "@cawco/core/run-captured";
import { hostEnvironment } from "@cawco/core/session-env";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { systemProgram } from "@cawco/core/workspace-needs";
import { DB_PATH } from "./config";

import { CONNECT_S } from "./ssh-tunnels";

/** How long a short command gets to answer. Our choice. */
const OUTPUT_MS = 3000;

/**
 * Runs a short command and answers its stdout, or undefined when it failed.
 * One that did not answer in time (`ms`) is said once in the log, apart from
 * a failure, and what it would answer is not had.
 */
export const output = async (
  argv: string[],
  ms = OUTPUT_MS
): Promise<string | undefined> => {
  const ran = await readWithin(ms, async (signal) => {
    const { code, stdout } = await runCaptured(argv, {
      env: hostEnvironment(),
      signal,
    });
    return code === 0 ? stdout.trim() : undefined;
  });
  switch (ran.kind) {
    case "answered":
      return ran.value;
    case "unanswered":
      console.warn(
        `[join] ${argv.join(" ")} did not answer within ${secondsOf(ran.after)} s; what it would answer is not had`
      );
      return;
    default:
      unhandled("read", ran);
  }
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
 * A target `ssh` reads as a destination and nothing else: no leading dash (an
 * option), no whitespace (a second argument once a shell splits it).
 */
export const TARGET = /^[^-\s][^\s]*$/u;

/**
 * A line of the report Bun prints for an error a build left uncaught: its
 * source excerpt (`4158 | …`), the caret under it, a frame (`at f (…:1:2)`)
 * and the runtime (`Bun v1.4.2 (Linux x64)`). An add keeps none of them: the
 * error's own line (`error: …`) says what happened, and the person never
 * reads a build's source.
 */
export const STACK_LINE =
  /^(?:\d+ \| |\s*\^+\s*$|\s+at \S.*:\d+:\d+\)?$|Bun v\d+\.\d+\.\d+ \()/u;

/** What starts the line an add's failure says the hub's own words on. */
export const HUB_SAID = "this hub: ";

/** A password `ssh` could not be handed on askpass's one line. */
export const LINE_BREAK = /[\r\n]/u;

/**
 * The askpass program a password add runs `ssh` with. `ssh` runs it once
 * per prompt and reads its stdout as the answer (ssh(1), SSH_ASKPASS); it
 * shares `ssh`'s stdin, a pipe that holds the password's one line, so the
 * first prompt is answered and a second one finds the pipe empty and gives
 * up. `read -r` takes the line as it is and `printf '%s'` prints it as data,
 * so no character of it is ever read as shell.
 */
const ASKPASS = `#!${systemProgram("sh")}
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
const PUBLIC_KEY = /^(\S+ [A-Za-z0-9+/]+=*)(?: (.*))?$/u;
const PLAIN_COMMENT = /^[\w@.:,+=/ -]*$/u;

/**
 * The environment a password add's `ssh` runs with: {@link ASKPASS} answers
 * its one prompt from `ssh`'s stdin.
 */
export const ASKPASS_ENV = (): Record<string, string> => ({
  SSH_ASKPASS: askpass(),
  SSH_ASKPASS_REQUIRE: "force",
});

/** The trust command's step line, worded as the install script words its own. */
export const TRUST_STEP = "adding this hub's SSH key";

/**
 * The step the remote command prints before it fetches the install script,
 * which tells the dialog the install runs on the machine now.
 */
export const DOWNLOAD_STEP = "downloading the install script from ";

/**
 * The step the hub says once its own connection carries a port on the
 * machine to it: the first line of an add whose connection has signed in.
 */
export const CARRY_STEP = "carrying this hub to the machine on its port ";

/** The step the hub says as it finds the build an SSH add leaves the machine on: its update channel's newest (binary-updates.ts `offered`). */
export const OFFER_STEP = "finding the build this hub offers its fleet";

/**
 * The step the hub says as it gives the machine its key over its own
 * connection (ssh-tunnels.ts `admit`): the add is the person admitting it.
 */
export const KEY_STEP = "giving the machine its key to this hub";

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
export const UNREACHED = new Set([6, 7, 28]);

/**
 * The line the install command prints when the machine's curl fails, its exit
 * status after it: CawCo's own, so the status is read off it, never curl's
 * words. Not a step line ({@link INSTALL_STEP_PREFIX}): the step it failed on
 * is still the download.
 */
export const CURL_EXIT = "cawco-curl-exit: ";

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
  `echo "${INSTALL_STEP_PREFIX}${DOWNLOAD_STEP}${hubUrl}" && if script=$(curl -fsSL --connect-timeout ${CONNECT_S} --max-time ${DOWNLOAD_MAX_S} "${hubUrl}/install.sh"); then printf "%s\\n" "$script" | sh; else echo "${CURL_EXIT}$?"; false; fi`;

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
export const trustCommand = (key: string): string | null => {
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
 * once it is gone it ends the command's whole process group: the group `sh`
 * leads (sshd's session process makes a new session for the login shell,
 * whose place `sh` takes), named by `sh`'s own pid `$$`, an integer above 1
 * checked first, never `kill 0`, which signals whatever group the watchdog
 * finds itself in. No `--` before the group: dash's `kill` (Debian's and
 * Ubuntu's `sh`) refuses it ("Illegal number: -") and sends nothing, while a
 * signal named first already makes `-$$` a pid for dash, bash and busybox.
 * The command
 * ends the watchdog when it finishes, and exits with the command's status.
 * Measured against OpenSSH 10.2's sshd: a silent remote command outlived a
 * killed `ssh`; under the watchdog it was gone within 4 s.
 */
export const remoteCommand = (body: string): string =>
  `exec sh -c 'p=$PPID; ( while ps -p "$p" >/dev/null 2>&1; do sleep 1; done; [ "$$" -gt 1 ] && kill -TERM "-$$" ) >/dev/null 2>&1 & w=$!; ${body}; s=$?; kill "$w" 2>/dev/null; exit $s'`;

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

/**
 * OpenSSH's words in place of its greeting to an address it holds back
 * (sshd_config(5) PerSourcePenalties, OpenSSH 9.8 on): it refuses the
 * connection with them for a while after connections from there that never
 * signed in, or failed to.
 */
const PENALIZED_LINE = "Not allowed at this time";

/** What one TCP connect to the machine's SSH port heard. */
type Knock =
  /** Its server greeted (or said nothing in time): `ssh` takes it from here. */
  | { kind: "greeted" }
  /** Its server turned this address away for now ({@link PENALIZED_LINE}). */
  | { kind: "penalized" }
  /** It never connected: connect(2)'s errno. */
  | { kind: "failed"; code: string };

/**
 * One TCP connect from the hub to `address`, the server's first line read
 * once it connects: its greeting, or the words OpenSSH turns a held-back
 * address away with. A connect that fails reaches no server and costs the
 * hub nothing with it.
 */
const knock = (address: string, port: number): Promise<Knock> =>
  new Promise((resolve) => {
    let connected = false;
    let heard = "";
    let done = false;
    const socket = connect({ host: address, port, timeout: CONNECT_S * 1000 });
    const end = (result: Knock): void => {
      if (done) {
        return;
      }
      done = true;
      socket.destroy();
      resolve(result);
    };
    const said = (): Knock =>
      heard.startsWith(PENALIZED_LINE)
        ? { kind: "penalized" }
        : { kind: "greeted" };
    socket.once("connect", () => {
      connected = true;
    });
    socket.on("data", (chunk: Buffer) => {
      heard += chunk.toString("latin1");
      if (heard.includes("\n")) {
        end(said());
      }
    });
    socket.once("end", () => end(said()));
    socket.once("timeout", () =>
      end(connected ? said() : { kind: "failed", code: "ETIMEDOUT" })
    );
    socket.once("error", (error: NodeJS.ErrnoException) =>
      end(connected ? said() : { kind: "failed", code: error.code ?? "EIO" })
    );
  });

/** What stops an add before any `ssh` runs ({@link beforeSsh}). */
export type BeforeSsh =
  | { kind: "unreachable"; detail: string }
  | { kind: "host-key" }
  | { kind: "penalized" };

/**
 * Whether the hub reaches `host` on `port`, as `ssh` would first: the name
 * resolved, then a {@link knock} on each of its addresses in turn until one
 * answers. Unreachable, by getaddrinfo's or connect(2)'s errno: the name did
 * not resolve, the port refused, no route, or no answer within ssh's own
 * ConnectTimeout. Penalized when its server turns this address away.
 */
const reach = async (
  host: string,
  port: number
): Promise<BeforeSsh | undefined> => {
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
    const heard = await knock(address, port);
    if (heard.kind === "greeted") {
      return;
    }
    if (heard.kind === "penalized") {
      return { kind: "penalized" };
    }
    failed = heard.code;
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

const WHITESPACE = /\s+/u;

/**
 * `ssh-keyscan -t`'s name for a key type as known-hosts lines write it, in
 * the order `ssh` prefers them (ssh_config(5) HostKeyAlgorithms).
 */
const SCAN_TYPES: [string, string][] = [
  ["ssh-ed25519", "ed25519"],
  ["ecdsa-sha2-nistp256", "ecdsa"],
  ["ecdsa-sha2-nistp384", "ecdsa"],
  ["ecdsa-sha2-nistp521", "ecdsa"],
  ["sk-ssh-ed25519@openssh.com", "ed25519-sk"],
  ["sk-ecdsa-sha2-nistp256@openssh.com", "ecdsa-sk"],
  ["ssh-rsa", "rsa"],
];

/**
 * The keys this hub's `ssh` knows the machine by, from each known-hosts file
 * `ssh` reads (`ssh-keygen -F`); `null` when one vouches by certificate,
 * which `ssh` decides.
 */
const knownKeys = async (to: SshDestination): Promise<Set<string> | null> => {
  const known = new Set<string>();
  for (const file of to.knownHosts) {
    const said = await output(["ssh-keygen", "-F", to.keyName, "-f", file]);
    const keys = said === undefined ? new Set<string>() : knownKeysOf(said);
    if (keys === null) {
      return null;
    }
    for (const key of keys) {
      known.add(key);
    }
  }
  return known;
};

/**
 * What stops an add before any `ssh` runs, at the cost of one connection
 * that never signs in (OpenSSH holds back an address after such connections:
 * sshd_config(5) PerSourcePenalties, `noauth` 1s each, enforced from 15s).
 * When the hub knows the machine's host key, that connection is
 * `ssh-keyscan` for the one type it knows it by first (`ssh-keyscan` makes a
 * connection per type): a key heard is the machine reached, and its host key
 * either one the hub knows or changed. When it knows none, or the scan heard
 * nothing, it is a {@link knock}: the port unreachable (a connect that fails
 * reaches no server), or the server turning this address away. The one case
 * that makes two is a server that no longer offers the key type the hub
 * knows it by, scanned and then knocked on. A target that goes through
 * another host, or one `ssh -G` could not resolve, is `ssh`'s to try.
 */
export const beforeSsh = async (
  target: string,
  port: number | null
): Promise<BeforeSsh | undefined> => {
  const to = await destinationOf(target, port);
  if (!to || to.proxied) {
    return;
  }
  const known = await knownKeys(to);
  const types = new Set([...(known ?? [])].map((key) => key.split(" ")[0]));
  const scan = SCAN_TYPES.find(([type]) => types.has(type))?.[1];
  if (known && scan) {
    const scanned = await output(
      [
        "ssh-keyscan",
        "-T",
        String(CONNECT_S),
        "-t",
        scan,
        "-p",
        String(to.port),
        "--",
        to.host,
      ],
      (CONNECT_S + 5) * 1000
    );
    const offered = scanned === undefined ? null : knownKeysOf(scanned);
    if (offered && offered.size > 0) {
      return [...offered].some((key) => known.has(key))
        ? undefined
        : { kind: "host-key" };
    }
  }
  return await reach(to.host, to.port);
};
