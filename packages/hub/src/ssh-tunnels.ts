/**
 * The hub's own way to every machine it added over SSH, and the machine's
 * way back: one SSH connection per machine, which the hub opens and holds,
 * carrying a remote forward from a port on the machine's loopback to the
 * hub's door for SSH forwards (ssh-door.ts). The machine's agent knows its
 * hub as `http://127.0.0.1:<that port>`, so all it sends the hub (its
 * socket, every HTTP call, its git) rides the connection the hub made. The
 * machine needs no route to any address of the hub's: a box on another
 * network, with no Tailscale, joins and stays joined all the same (owner:
 * it "needs to work even when it's on a different network or no tailscale,
 * over ssh"). The same connection carries the hub's previews of the
 * machine's sessions the other way ({@link SshTunnels.carry}).
 *
 * The connection is `ssh -N -M`, the master of a control socket (ssh(1)
 * `-N`: "Do not execute a remote command. This is useful for just
 * forwarding ports."), and every forward is asked of it with `-O forward`
 * once it has signed in, in this order ({@link SshTunnels} `connect`):
 *
 * 1. Where the machine binds a forward, read with a probe whose far end is
 *    a port nothing on this host answers, then cancelled. A machine whose
 *    sshd binds it on more than its loopback (GatewayPorts, sshd_config(5):
 *    "yes to force remote port forwardings to bind to the wildcard
 *    address") is refused before the hub is forwarded there at all.
 * 2. The machine's own stale session, if one still holds the machine's port
 *    (a link that dropped without a word: its sshd sends no keepalive of
 *    its own, ClientAliveInterval "The default is 0"), is ended: only an
 *    `sshd` or `sshd-session` of the user the hub signs in as, listening on
 *    that port.
 * 3. The forward, `-R 127.0.0.1:<port>:127.0.0.1:<door>`, to the door's
 *    listener for this machine's record, which names what comes through it
 *    by the SSH target the person gave (ssh-door.ts). The first time the
 *    port is 0: "If the port argument is '0', the listen port will be
 *    dynamically allocated on the server and reported to the client at run
 *    time. When used together with -O forward, the allocated port will be
 *    printed to the standard output" (https://man.openbsd.org/ssh), so it is
 *    one nothing on the machine already listens on. It is kept
 *    (`ssh_machines`) and asked for by number from then on: the agent's
 *    config names it, and so do the hub remotes its clones keep.
 *
 * A connection that ends is opened again, after 1 s, doubling to a minute
 * while it keeps failing; and every joined machine's is opened when the hub
 * starts. A hub that is down is a machine offline, like any machine.
 */

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { detach } from "@cawco/core/detach";
import { LineSplitter } from "@cawco/core/lines";
import { darwinSocketRoot } from "@cawco/core/paths";
import { hostEnvironment } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { DB_PATH } from "./config";
import type { SshMachineRow, SshMachinesDb } from "./db/ssh-machines";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import type { SshDoor } from "./ssh-door";

/**
 * How long a connection gets to open: `ssh`'s to the machine, and the
 * machine's `curl` of the install script (join.ts). Without the second, an
 * address the machine cannot route to holds the add for the kernel's whole
 * connect timeout, minutes. curl(1): "--connect-timeout … Maximum time in
 * seconds that you allow curl's connection to take." Our choice.
 */
export const CONNECT_S = 10;

/**
 * How often `ssh` asks a silent server whether it is still there, and how
 * many unanswered asks end the connection: a machine that stops answering
 * (a firewall that bans the address after a failed password, a network that
 * drops) ends it in about 30 s, and a held connection is opened again.
 * ssh_config(5), ServerAliveInterval: "The default is 0, indicating that
 * these messages will not be sent to the server"; ServerAliveCountMax: "If
 * this threshold is reached while server alive messages are being sent, ssh
 * will disconnect from the server, terminating the session"
 * (https://man.openbsd.org/ssh_config.5). Debian's OpenSSH sets 300 under
 * BatchMode alone ("or 300 if the BatchMode option is set
 * (Debian-specific)"), so a password add had none and waited forever. Our
 * choice of 10 and 3 (its default, said outright).
 */
const SERVER_ALIVE_S = 10;
const SERVER_ALIVE_COUNT = 3;

/** The options every `ssh` the hub runs to a machine takes, and its port when one was given. */
export const sshOptions = (port: number | null): string[] => [
  "-o",
  "StrictHostKeyChecking=accept-new",
  "-o",
  `ConnectTimeout=${CONNECT_S}`,
  "-o",
  `ServerAliveInterval=${SERVER_ALIVE_S}`,
  "-o",
  `ServerAliveCountMax=${SERVER_ALIVE_COUNT}`,
  ...(port === null ? [] : ["-p", String(port)]),
];

/** The first wait before a dropped connection is opened again, and the longest. Our choice. */
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 60_000;
/** A connection that stayed up this long starts its next retries from the first wait. Our choice. */
const STEADY_MS = 60_000;
/** How long a control command (`-O check`, `-O forward`, one over the master) gets to answer. Our choice. */
const CONTROL_MS = 10_000;
/** How long a master gets to sign in and answer on its control socket: its connect, and the sign-in after. Our choice. */
const MASTER_READY_MS = (CONNECT_S + 20) * 1000;
/** How often a master that is signing in is asked whether it is up. Our choice. */
const MASTER_POLL_MS = 250;
/** How long a stale session gets to let the machine's port go once it is ended. Our choice. */
const STALE_GONE_MS = 5000;
/** The lines of `ssh`'s own output kept for the add that waits on it. */
const MAX_LINES = 40;

/**
 * Where each connection's control socket is (ssh(1) `-S`), named by its
 * row. A socket's path holds at most 107 bytes, and `ssh` binds it under a
 * 17-byte temporary name first: one beside a database on a long path was
 * refused ("unix_listener: path … too long for Unix domain socket"). So,
 * as the fleet's other sockets (core paths.ts `workspaceDoorDir`): a dir of
 * its own under `$XDG_RUNTIME_DIR` on Linux, under the user's own socket
 * root on macOS, beside the database on a Linux with no runtime dir.
 */
const controlDir = (): string => {
  const runtime = process.env.XDG_RUNTIME_DIR;
  if (process.platform === "linux" && runtime) {
    return join(runtime, "cawco-ssh");
  }
  if (process.platform === "darwin") {
    return join(darwinSocketRoot(), "ssh");
  }
  return join(dirname(DB_PATH), "ssh");
};
const controlPath = (id: string): string => join(controlDir(), id);

const CARRIAGE_RETURN = /\r$/u;
const PORT_LINE = /^\d+$/u;
/** A listener's address as `ss` and `lsof` print it: its host, then `:<port>`. */
const LOOPBACK_HOST = /^(?:127\.[\d.]+|\[::1\]|::1|localhost)$/u;

/**
 * The machine's PATH with its login PATH after it: what `/etc/profile` sets,
 * read in a subshell whose output goes nowhere. sshd hands a command a
 * PATH of its build's (`--with-default-path`: `/usr/local/bin:/usr/bin` in
 * Fedora's openssh.spec), which can lack the `sbin` an unmerged distro
 * keeps `ss` in; the OS's login profile is where it adds the rest (on macOS
 * `path_helper`, from `/etc/paths`). Kept after sshd's, so a profile that
 * fails takes nothing away.
 */
const LOGIN_PATH =
  'PATH="$PATH:$(. /etc/profile >/dev/null 2>&1; printf %s "$PATH")"';

/**
 * The machine's command that prints the address of every listener on
 * `port`, one per line: `ss` on Linux, `lsof` on macOS. Its words hold no
 * single quote: it runs as `sh -c '<it>'` under whatever login shell the
 * machine's user has.
 */
const listenersOn = (port: number): string =>
  `${LOGIN_PATH}; if command -v ss >/dev/null 2>&1; then ss -ltnH "sport = :${port}" | while read -r state recv send local rest; do echo "$local"; done; elif command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:${port} -sTCP:LISTEN -Fn | sed -n "s/^n//p"; else echo "this machine has neither ss nor lsof to read its listeners with" >&2; exit 3; fi`;

/**
 * The machine's shell words that set `pids` to each process listening on
 * `port`, as `ss -ltnp` or `lsof` lists it there for this user.
 */
const listenersOf = (port: number): string =>
  `${LOGIN_PATH}; if command -v ss >/dev/null 2>&1; then pids=$(ss -ltnpH "sport = :${port}" | sed -n "s/.*pid=\\([0-9][0-9]*\\).*/\\1/p"); elif command -v lsof >/dev/null 2>&1; then pids=$(lsof -nP -iTCP:${port} -sTCP:LISTEN -Fp | sed -n "s/^p//p"); else echo "this machine has neither ss nor lsof to read its listeners with" >&2; exit 3; fi`;

/**
 * The shell words for `$pid`'s start, in `ps -o lstart=`'s words with its
 * spaces squeezed by `sed` alone, which {@link listenersOf} needs already: a
 * machine whose PATH had no `tr` read every start as nothing, so no session
 * was recorded and a silent drop's stale session was never ended (ssh-reach
 * (g), 2026-10-23: `sh: 1: tr: not found`).
 */
const START_OF_PID = `$(ps -o lstart= -p "$pid" | sed "s/  */ /g;s/^ //;s/ $//")`;

/**
 * The machine's command that prints each process listening on `port` as
 * `<pid> <start>`, one a line, each pid an integer above 1. One line, so
 * every login shell hands it over whole.
 */
const holderOn = (port: number): string =>
  `${listenersOf(port)}; for pid in $pids; do [ "$pid" -gt 1 ] 2>/dev/null || continue; printf "%s %s\\n" "$pid" "${START_OF_PID}"; done; exit 0`;

/**
 * The machine's command that ends `session` (`<pid> <start>`, as
 * {@link holderOn} read it when this hub's connection came up) if it still
 * listens on `port`, and nothing else: a pid there is ended only when its
 * start is the one recorded, so a pid the system has handed to another
 * process since is left alone. It prints the pid it ended.
 */
const endOwnOn = (port: number, session: string): string =>
  `${listenersOf(port)}; for pid in $pids; do [ "$pid" -gt 1 ] 2>/dev/null || continue; if [ "$pid ${START_OF_PID}" = "${session}" ]; then kill "$pid" && echo "$pid"; fi; done; exit 0`;

/** A session as {@link holderOn} prints it: a pid, then its start in `ps`'s words. */
const SESSION = /^\d+ [A-Za-z0-9: ]+$/u;

/**
 * The machine's command that keeps its key where its agent reads it
 * (core machine-key.ts `machineKeyPath`: `$XDG_CONFIG_HOME/cawco`, else
 * `~/.config/cawco`), readable by its user alone, from its stdin: the key
 * is in no argv, on either machine.
 */
const KEEP_KEY = `umask 077 && d="\${XDG_CONFIG_HOME:-$HOME/.config}/cawco" && mkdir -p "$d" && cat > "$d/machine-key.part" && mv -f "$d/machine-key.part" "$d/machine-key"`;

/** What a machine would not do, which ends an add, or a held connection. */
type TunnelRefusal =
  /** Its sshd forwards no port to the hub (AllowTcpForwarding). */
  | { kind: "forwarding" }
  /** Something there other than this hub's own connection holds the machine's port. */
  | { kind: "held"; port: number }
  /** Its sshd binds a forward on more than its loopback (GatewayPorts): the addresses it bound. */
  | { kind: "exposed"; bound: string[] }
  /** A step over the connection did not run, in `ssh`'s or the machine's words. */
  | { kind: "failed"; step: string; said: string };

/** How a connection the hub was waiting on came out. */
export type TunnelOutcome =
  | { kind: "up"; port: number }
  | {
      kind: "ended";
      code: number | null;
      lines: string[];
      /** What the machine would not do, when that ended it. */
      refusal: TunnelRefusal | null;
    };

/** A connection an add asked for ({@link SshTunnels.open}). */
export interface TunnelOpen {
  /** Whether this add made the machine's record: one the hub has not added over SSH before. */
  readonly fresh: boolean;
  readonly id: string;
  /** The machine this record names, when it has joined before. */
  readonly machineId: string | null;
  /** Up, or how it ended, once it is either. */
  readonly outcome: Promise<TunnelOutcome>;
}

export interface SshTunnels {
  /** An add that made record `id` failed or stopped: its connection ends and its record goes. */
  readonly abandon: (id: string) => void;
  /**
   * The add of record `id` admits its machine: a new key, kept for it until
   * the machine proves it (hub-auth.ts), written over its open connection
   * where the machine's agent reads its key. Answers what went wrong, or
   * nothing.
   */
  readonly admit: (id: string) => Promise<string | undefined>;
  /**
   * A port on the hub's loopback carried to `port` on the machine's, through
   * the machine's connection: how the hub reaches a preview listener there.
   */
  readonly carry: (machineId: string, port: number) => Promise<number>;
  /** The machine was removed: its connection ends and its record goes. */
  readonly forget: (machineId: string) => void;
  /** Whether the hub reaches `machineId` through a connection of its own. */
  readonly holds: (machineId: string) => boolean;
  /**
   * The add that opened `id` ended with `machineId` online: the hub holds
   * that connection from now on, and any other it held for the machine goes.
   */
  readonly joined: (id: string, machineId: string) => void;
  /**
   * The connection to `target` on `sshPort`, for an add: open already, or
   * opened now. `ssh`'s lines go to `line` until it is up or has ended.
   */
  readonly open: (
    target: string,
    sshPort: number | null,
    line: (text: string) => void
  ) => TunnelOpen;
  /** Opens every joined machine's connection: the hub starting. */
  readonly start: () => void;
}

/** One connection the hub holds, or is opening. */
interface Tunnel {
  /** Each machine port carried to one on the hub's loopback, on this connection. */
  carried: Map<number, Promise<number>>;
  child: Bun.Subprocess | null;
  failures: number;
  readonly id: string;
  lines: Set<(text: string) => void>;
  retry: HubTimer | undefined;
  /** From the start of an open until its `ssh` has exited. */
  running: boolean;
  /** The last end it logged, so a machine that stays away is said once. */
  said: string | undefined;
  stopped: boolean;
  up: boolean;
  /** When it last came up this time round, or 0. */
  upAt: number;
  waiters: ((outcome: TunnelOutcome) => void)[];
}

/** What a short command answered: its exit, its stdout and its stderr. */
interface Answer {
  code: number;
  err: string;
  out: string;
}

/** A short command's answer, or null when it did not answer within {@link CONTROL_MS}. */
const control = async (
  argv: string[],
  stdin?: string
): Promise<Answer | null> => {
  const ran = await readWithin(CONTROL_MS, async (signal) => {
    const child = Bun.spawn(argv, {
      env: hostEnvironment(),
      stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin),
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, out: out.trim(), err: err.trim() };
  });
  return ran.kind === "answered" ? ran.value : null;
};

/** What a short command said when it did not do what it was asked: its stderr, or its exit. */
const saidBy = (answer: Answer | null): string =>
  answer
    ? answer.err || `ssh exited ${answer.code}`
    : `no answer within ${CONTROL_MS / 1000} s`;

/** A port nothing on the hub's loopback holds right now. */
const freePort = (): number => {
  const lease = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  const { port } = lease;
  lease.stop(true);
  return port;
};

/**
 * The connection's `ssh`, the master of the control socket at `path`, with
 * no forward of its own: each is asked of it once it has signed in
 * (`-O forward`, ssh(1): "Request forwardings without command execution").
 * BatchMode: "user interaction such as password prompts and host key
 * confirmation requests will be disabled". It leads a process group of its
 * own, so a stop ends it and a `ProxyCommand` it runs.
 */
const master = (
  row: SshMachineRow,
  path: string
): Bun.Subprocess<"ignore", "ignore", "pipe"> =>
  Bun.spawn(
    [
      "ssh",
      "-N",
      "-o",
      "BatchMode=yes",
      ...sshOptions(row.sshPort),
      "-M",
      "-S",
      path,
      "--",
      row.target,
    ],
    {
      env: hostEnvironment(),
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      detached: true,
    }
  );

/** One command on the machine over the master at `path`: `sh -c` and one single-quoted word, as join.ts runs its own. */
const onMachine = (
  path: string,
  target: string,
  script: string,
  stdin?: string
): Promise<Answer | null> =>
  control(
    [
      "ssh",
      "-S",
      path,
      "-o",
      "BatchMode=yes",
      "--",
      target,
      `exec sh -c '${script}'`,
    ],
    stdin
  );

/** Every line of `stream` to `take`, as it comes, the last one too. */
const eachLine = async (
  stream: ReadableStream<Uint8Array>,
  take: (line: string) => void
): Promise<void> => {
  const decoder = new TextDecoder();
  const splitter = new LineSplitter();
  for await (const chunk of stream) {
    for (const line of splitter.push(decoder.decode(chunk, { stream: true }))) {
      take(line);
    }
  }
  for (const line of splitter.push(decoder.decode())) {
    take(line);
  }
  if (splitter.pending) {
    take(splitter.end());
  }
};

/**
 * Ends `ssh`'s process group, when it still runs: `ssh` was spawned
 * `detached`, so it leads its own group.
 */
const end = (child: Bun.Subprocess | null): void => {
  const leader =
    child && child.exitCode === null ? spawnedPid(child) : undefined;
  if (leader) {
    signalGroup(leader, "SIGTERM");
  }
};

/** Whether a listener's address, as `ss` or `lsof` prints it (`127.0.0.1:41234`, `[::]:41234`, `*:41234`), is the machine's loopback. */
const onLoopback = (address: string): boolean =>
  LOOPBACK_HOST.test(address.slice(0, address.lastIndexOf(":")));

/** Words a person reads for what a machine would not do. */
const refusalWords = (refusal: TunnelRefusal): string => {
  switch (refusal.kind) {
    case "forwarding":
      return "its sshd forwards no port (AllowTcpForwarding)";
    case "held":
      return `something on the machine other than this hub's own connection holds port ${refusal.port}`;
    case "exposed":
      return `its sshd binds a forward on ${refusal.bound.join(", ")}, beyond its loopback (GatewayPorts)`;
    case "failed":
      return `${refusal.step}: ${refusal.said}`;
    default: {
      const unhandled: never = refusal;
      throw new Error(`unhandled refusal: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** Whether `master` answers on its control socket at `path`: signed in. False once it exits, or past {@link MASTER_READY_MS}. */
const masterReady = async (
  child: Bun.Subprocess,
  path: string,
  target: string
): Promise<boolean> => {
  const deadline = Date.now() + MASTER_READY_MS;
  while (child.exitCode === null && Date.now() < deadline) {
    if (existsSync(path)) {
      const checked = await control([
        "ssh",
        "-S",
        path,
        "-O",
        "check",
        "--",
        target,
      ]);
      if (checked?.code === 0) {
        return true;
      }
    }
    await Bun.sleep(MASTER_POLL_MS);
  }
  return false;
};

/**
 * Whether a `-O forward` that exited non-zero was the machine's server
 * refusing it, read from the master's state, never from `ssh`'s words: the
 * forward asked is well formed, so when the master still answers `-O check`
 * (exit 0) it carried the request and the server said no; when it does not,
 * the connection itself failed.
 */
const refusedByServer = async (
  path: string,
  target: string
): Promise<boolean> =>
  (await control(["ssh", "-S", path, "-O", "check", "--", target]))?.code === 0;

/**
 * Where the machine binds a forward, before the hub is forwarded there: a
 * probe forward whose far end is a port nothing on this host answers (so
 * nothing behind it answers anyone), its listeners read, then cancelled by
 * the spec that made it (`-O cancel` by its allocated port answers "port not
 * forwarded" and leaves it, measured on OpenSSH 10.2). A refusal, or
 * nothing when it binds on its loopback alone.
 */
const checkBinding = async (
  path: string,
  target: string
): Promise<TunnelRefusal | null> => {
  const probe = `127.0.0.1:0:127.0.0.1:${freePort()}`;
  const probed = await control([
    "ssh",
    "-S",
    path,
    "-O",
    "forward",
    "-R",
    probe,
    "--",
    target,
  ]);
  if (probed?.code !== 0) {
    return (await refusedByServer(path, target))
      ? { kind: "forwarding" }
      : {
          kind: "failed",
          step: "forwarding a port on the machine",
          said: saidBy(probed),
        };
  }
  try {
    const port = Number(probed.out);
    if (!PORT_LINE.test(probed.out)) {
      return {
        kind: "failed",
        step: "forwarding a port on the machine",
        said: `ssh named no port: ${probed.out}`,
      };
    }
    const read = await onMachine(path, target, listenersOn(port));
    const bound = read?.code === 0 ? read.out.split("\n").filter(Boolean) : [];
    if (bound.length === 0) {
      return {
        kind: "failed",
        step: `reading where the machine listens on port ${port}`,
        said: read?.code === 0 ? "it lists no listener there" : saidBy(read),
      };
    }
    const beyond = bound.filter((address) => !onLoopback(address));
    return beyond.length > 0 ? { kind: "exposed", bound: beyond } : null;
  } finally {
    await control([
      "ssh",
      "-S",
      path,
      "-O",
      "cancel",
      "-R",
      probe,
      "--",
      target,
    ]);
  }
};

/**
 * Ends this hub's own earlier connection's session that still holds `port`
 * on the machine (a dead hub's, a dropped one's): the process recorded as
 * `session` when that connection came up, by its pid and its start, and
 * waits for the port to be let go. Nothing else that holds it is touched,
 * whatever it is (the person's own sshd, a session of theirs): the forward
 * then says the port is taken.
 */
const endStale = async (
  path: string,
  target: string,
  port: number,
  session: string | null
): Promise<TunnelRefusal | null> => {
  if (!(session && SESSION.test(session))) {
    return null;
  }
  const ended = await onMachine(path, target, endOwnOn(port, session));
  if (ended?.code !== 0) {
    return {
      kind: "failed",
      step: `freeing port ${port} on the machine`,
      said: saidBy(ended),
    };
  }
  if (!ended.out) {
    return null;
  }
  console.info(
    `[ssh] ${target}: ended the stale session holding port ${port} (pid ${ended.out.split("\n").join(", ")})`
  );
  const deadline = Date.now() + STALE_GONE_MS;
  while (Date.now() < deadline) {
    const read = await onMachine(path, target, listenersOn(port));
    if (read?.code === 0 && !read.out) {
      return null;
    }
    await Bun.sleep(MASTER_POLL_MS);
  }
  return null;
};

export const createSshTunnels = ({
  db,
  door,
  lifetime,
}: {
  db: SshMachinesDb;
  /** The hub's door for SSH forwards (ssh-door.ts): each record's listener, named by its target. */
  door: Pick<SshDoor, "close" | "port">;
  lifetime: HubLifetimeShape;
}): SshTunnels => {
  const tunnels = new Map<string, Tunnel>();

  const tunnelOf = (id: string): Tunnel => {
    const held = tunnels.get(id);
    if (held) {
      return held;
    }
    const made: Tunnel = {
      id,
      child: null,
      running: false,
      up: false,
      upAt: 0,
      stopped: false,
      failures: 0,
      retry: undefined,
      carried: new Map(),
      lines: new Set(),
      waiters: [],
      said: undefined,
    };
    tunnels.set(id, made);
    return made;
  };

  const settle = (tunnel: Tunnel, outcome: TunnelOutcome): void => {
    const waiting = tunnel.waiters.splice(0);
    tunnel.lines.clear();
    for (const answer of waiting) {
      answer(outcome);
    }
  };

  const cameUp = (tunnel: Tunnel, row: SshMachineRow, port: number): void => {
    tunnel.up = true;
    tunnel.upAt = Date.now();
    tunnel.said = undefined;
    tunnel.carried.clear();
    console.info(
      `[ssh] ${row.target}: port ${port} on the machine is carried to this hub`
    );
    settle(tunnel, { kind: "up", port });
  };

  /**
   * A control socket left by a master this hub no longer holds (one that
   * ran before the hub was killed outright): its master is told to exit,
   * which frees the port on the machine, and a stale socket is removed.
   */
  const clearControl = async (path: string, target: string): Promise<void> => {
    if (!existsSync(path)) {
      return;
    }
    await control(["ssh", "-S", path, "-O", "exit", "--", target]);
    rmSync(path, { force: true });
  };

  /**
   * The machine's forward to the hub, once the master at `path` has signed
   * in: where it binds checked, its stale session ended, then the forward.
   * Answers the machine's port, or what it would not do.
   */
  const forwardHub = async (
    row: SshMachineRow,
    path: string
  ): Promise<{ port: number } | { refusal: TunnelRefusal }> => {
    const binding = await checkBinding(path, row.target);
    if (binding) {
      return { refusal: binding };
    }
    if (row.boxPort !== null) {
      const stale = await endStale(
        path,
        row.target,
        row.boxPort,
        row.boxSession
      );
      if (stale) {
        return { refusal: stale };
      }
    }
    const forwarded = await forwardDoor(row, path);
    if ("port" in forwarded) {
      await recordSession(row, path, forwarded.port);
    }
    return forwarded;
  };

  /**
   * The process on the machine holding this connection's forward, recorded
   * for the row: the one {@link endStale} may end when this connection has
   * died and left it there. None read, none recorded: then nothing is ended.
   */
  const recordSession = async (
    row: SshMachineRow,
    path: string,
    port: number
  ): Promise<void> => {
    const read = await onMachine(path, row.target, holderOn(port));
    const lines = read?.code === 0 ? read.out.split("\n").filter(Boolean) : [];
    const [session] = lines;
    db.update(row.id, {
      boxSession:
        lines.length === 1 && session && SESSION.test(session) ? session : null,
    });
  };

  /** The forward itself: the machine's port, kept the first time, to the hub's door. */
  const forwardDoor = async (
    row: SshMachineRow,
    path: string
  ): Promise<{ port: number } | { refusal: TunnelRefusal }> => {
    const spec = `127.0.0.1:${row.boxPort ?? 0}:127.0.0.1:${door.port(row.id, row.target)}`;
    const answer = await control([
      "ssh",
      "-S",
      path,
      "-O",
      "forward",
      "-R",
      spec,
      "--",
      row.target,
    ]);
    if (answer?.code !== 0) {
      if (!(await refusedByServer(path, row.target))) {
        return {
          refusal: {
            kind: "failed",
            step: "forwarding the hub to the machine",
            said: saidBy(answer),
          },
        };
      }
      return {
        refusal:
          row.boxPort === null
            ? { kind: "forwarding" }
            : { kind: "held", port: row.boxPort },
      };
    }
    if (row.boxPort !== null) {
      return { port: row.boxPort };
    }
    if (!PORT_LINE.test(answer.out)) {
      return {
        refusal: {
          kind: "failed",
          step: "forwarding the hub to the machine",
          said: `ssh named no port: ${answer.out}`,
        },
      };
    }
    const port = Number(answer.out);
    db.update(row.id, { boxPort: port });
    return { port };
  };

  /** One line of `tunnel`'s `ssh`: kept for the add that waits on it, and for why a held one ended. */
  const hear = (
    tunnel: Tunnel,
    heard: { lines: string[]; since: string[] },
    raw: string
  ): void => {
    const text = raw.replace(CARRIAGE_RETURN, "");
    if (tunnel.up) {
      heard.since.push(text);
    }
    heard.lines.push(text);
    if (heard.lines.length > MAX_LINES) {
      heard.lines.shift();
    }
    for (const line of tunnel.lines) {
      line(text);
    }
  };

  /**
   * A joined machine's connection that ended is opened again: after 1 s,
   * doubling while it keeps failing, from 1 s again after one that held.
   * Each new reason is said once.
   */
  const retry = (
    tunnel: Tunnel,
    row: SshMachineRow,
    steady: boolean,
    why: string
  ): void => {
    tunnel.failures = steady ? 1 : tunnel.failures + 1;
    const wait = Math.min(
      RETRY_MAX_MS,
      RETRY_FIRST_MS * 2 ** (tunnel.failures - 1)
    );
    if (tunnel.said !== why) {
      tunnel.said = why;
      console.warn(
        `[ssh] ${row.target}: the connection that carries ${row.machineId} to this hub ended (${why}); it is opened again, from ${wait / 1000} s, until it holds`
      );
    }
    tunnel.retry = lifetime.after(wait, () => {
      tunnel.retry = undefined;
      detach(connect(tunnel), "ssh connection");
    });
  };

  /**
   * Once `child`, the master, has signed in: the machine's forward to the
   * hub, and the connection up. What the machine would not do, or nothing;
   * a master refused, or not signed in in time, is ended: nothing holds it.
   */
  const bringUp = async (
    tunnel: Tunnel,
    row: SshMachineRow,
    path: string,
    child: Bun.Subprocess
  ): Promise<TunnelRefusal | null> => {
    const ready = await masterReady(child, path, row.target);
    const forwarded =
      ready && !tunnel.stopped ? await forwardHub(row, path) : null;
    if (forwarded && "port" in forwarded) {
      cameUp(tunnel, row, forwarded.port);
      return null;
    }
    end(child);
    return forwarded?.refusal ?? null;
  };

  /** Opens `tunnel`'s connection once and follows it until `ssh` exits. */
  const connect = async (tunnel: Tunnel): Promise<void> => {
    const row = db.get(tunnel.id);
    if (!row || tunnel.stopped || tunnel.running) {
      return;
    }
    tunnel.running = true;
    tunnel.upAt = 0;
    mkdirSync(controlDir(), { recursive: true, mode: 0o700 });
    const path = controlPath(row.id);
    await clearControl(path, row.target);
    if (tunnel.stopped) {
      tunnel.running = false;
      settle(tunnel, { kind: "ended", code: null, lines: [], refusal: null });
      return;
    }
    const child = master(row, path);
    tunnel.child = child;
    const heard = { lines: [] as string[], since: [] as string[] };
    const reading = eachLine(child.stderr, (line) => hear(tunnel, heard, line));
    const refusal = await bringUp(tunnel, row, path, child);
    await reading;
    const code = await child.exited;
    const steady = tunnel.upAt > 0 && Date.now() - tunnel.upAt >= STEADY_MS;
    tunnel.child = null;
    tunnel.running = false;
    tunnel.up = false;
    tunnel.carried.clear();
    rmSync(path, { force: true });
    const { lines, since } = heard;
    settle(tunnel, { kind: "ended", code, lines, refusal });
    const now = db.get(row.id);
    if (tunnel.stopped || !now?.machineId || lifetime.closed()) {
      return;
    }
    const exit = child.signalCode
      ? `ssh ended by ${child.signalCode}`
      : `ssh exited ${code}`;
    retry(
      tunnel,
      now,
      steady,
      refusal
        ? `the machine refused: ${refusalWords(refusal)}`
        : ((tunnel.upAt > 0 ? since : lines).at(-1) ?? exit)
    );
  };

  const stop = (tunnel: Tunnel): void => {
    tunnel.stopped = true;
    lifetime.cancel(tunnel.retry);
    tunnel.retry = undefined;
    end(tunnel.child);
    tunnels.delete(tunnel.id);
  };

  lifetime.onClose(() => {
    for (const tunnel of tunnels.values()) {
      stop(tunnel);
    }
  });

  return {
    open: (target, sshPort, line) => {
      const held = db.at(target, sshPort);
      const row: SshMachineRow = held ?? {
        id: randomBytes(6).toString("hex"),
        target,
        sshPort,
        boxPort: null,
        boxSession: null,
        machineId: null,
        pendingKey: null,
        createdAt: new Date(),
      };
      if (!held) {
        db.create(row);
      }
      const tunnel = tunnelOf(row.id);
      const outcome = new Promise<TunnelOutcome>((resolve) => {
        const port = db.get(row.id)?.boxPort ?? null;
        if (tunnel.up && port !== null) {
          resolve({ kind: "up", port });
          return;
        }
        tunnel.lines.add(line);
        tunnel.waiters.push(resolve);
        if (!tunnel.running) {
          lifetime.cancel(tunnel.retry);
          tunnel.retry = undefined;
          detach(connect(tunnel), "ssh connection");
        }
      });
      return {
        id: row.id,
        fresh: !held,
        machineId: row.machineId,
        outcome,
      };
    },
    admit: async (id) => {
      const row = db.get(id);
      if (!(row && tunnels.get(id)?.up)) {
        return "the hub's SSH connection to the machine is not open";
      }
      const key = randomBytes(32).toString("base64url");
      db.update(id, { pendingKey: key });
      const kept = await onMachine(
        controlPath(id),
        row.target,
        KEEP_KEY,
        `${key}\n`
      );
      return kept?.code === 0 ? undefined : saidBy(kept);
    },
    abandon: (id) => {
      const tunnel = tunnels.get(id);
      if (tunnel) {
        stop(tunnel);
      }
      door.close(id);
      db.remove(id);
    },
    joined: (id, machineId) => {
      db.update(id, { machineId });
      for (const other of db.ofMachine(machineId)) {
        if (other.id === id) {
          continue;
        }
        const tunnel = tunnels.get(other.id);
        if (tunnel) {
          stop(tunnel);
        }
        door.close(other.id);
        db.remove(other.id);
      }
    },
    start: () => {
      for (const row of db.unjoined()) {
        db.remove(row.id);
      }
      for (const row of db.joined()) {
        detach(connect(tunnelOf(row.id)), "ssh connection");
      }
    },
    forget: (machineId) => {
      for (const row of db.ofMachine(machineId)) {
        const tunnel = tunnels.get(row.id);
        if (tunnel) {
          stop(tunnel);
        }
        door.close(row.id);
        db.remove(row.id);
      }
    },
    holds: (machineId) => db.ofMachine(machineId).length > 0,
    carry: (machineId, port) => {
      const [row] = db.ofMachine(machineId);
      const tunnel = row ? tunnels.get(row.id) : undefined;
      if (!(row && tunnel?.up)) {
        return Promise.reject(
          new Error(
            `the hub's SSH connection to ${row?.target ?? machineId} is not open`
          )
        );
      }
      const held = tunnel.carried.get(port);
      if (held !== undefined) {
        return held;
      }
      const carrying = (async () => {
        const local = freePort();
        const answer = await control([
          "ssh",
          "-S",
          controlPath(row.id),
          "-O",
          "forward",
          "-L",
          `127.0.0.1:${local}:127.0.0.1:${port}`,
          "--",
          row.target,
        ]);
        if (answer?.code !== 0) {
          throw new Error(
            `the hub's SSH connection to ${row.target} did not carry port ${port}: ${saidBy(answer)}`
          );
        }
        return local;
      })();
      tunnel.carried.set(port, carrying);
      carrying.catch(() => {
        tunnel.carried.delete(port);
      });
      return carrying;
    },
  };
};
