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
 *
 * Only the hub that added a machine holds its connection: each record names
 * its hub (`ssh_machines.hub_id`, the id hub-id.ts keeps beside the
 * database), and this hub reads no other's (db/ssh-machines.ts). A scratch
 * hub booted on a copy of another hub's database has an id of its own, so
 * it dials none of that hub's machines: it neither ends the session that
 * hub holds the machine's port with (step 2) nor takes the machine over.
 */

import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import type { BackoffPolicy } from "@cawco/core/backoff";
import {
  backoffSchedule,
  reopenSeries,
} from "@cawco/core/effect/backoff-schedule";
import { boundedRead } from "@cawco/core/effect/bounded";
import { type Join, makeJoin } from "@cawco/core/effect/join";
import { lookUntil } from "@cawco/core/effect/poll";
import { makeFolderSync } from "@cawco/core/folders";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { LineSplitter } from "@cawco/core/lines";
import { darwinSocketRoot } from "@cawco/core/paths/roots";
import { hostEnvironment } from "@cawco/core/session-env";
import { signalGroup, spawnedPid } from "@cawco/core/signal";
import { spawnTethered, untether } from "@cawco/core/tether";
import { unhandled } from "@cawco/core/unhandled";
import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  Schedule,
  Schema,
} from "effect";
import { DB_PATH } from "./config";
import type { SshMachineRow, SshMachinesDb } from "./db/ssh-machines";
import { hubIdKept } from "./hub-id";
import type { HubLifetimeShape } from "./lifetime";
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

/**
 * A dropped connection opened again: from 1 s, doubling to a minute. Never
 * given up: a joined machine reaches this hub only through it, and it ends
 * when the machine is removed. Our choice.
 */
const REOPENS: BackoffPolicy = {
  firstMs: 1000,
  mostMs: 60_000,
  giveUp: {
    never:
      "a joined machine reaches this hub through this connection alone; it ends when the machine is removed",
  },
};
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
// @limit recording: hub.ssh-tunnel-lines until 2026-12-03
const MAX_LINES = 40;

/**
 * Where each connection's control socket is (ssh(1) `-S`), named by its
 * row. A socket's path holds at most 107 bytes, and `ssh` binds it under a
 * 17-byte temporary name first: one beside a database on a long path was
 * refused ("unix_listener: path … too long for Unix domain socket"). So,
 * as the fleet's other sockets (core paths/workspace.ts `workspaceDoorDir`): a dir of
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
  readonly outcome: Effect.Effect<TunnelOutcome>;
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
  readonly admit: (id: string) => Effect.Effect<string | undefined>;
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
  /** Opens the connection of every joined machine this hub holds: the hub starting. */
  readonly start: () => void;
}

/** One connection the hub holds, or is opening. */
interface Tunnel {
  /** Each machine port carried to one on the hub's loopback, on this connection. */
  carried: Carried;
  child: Bun.Subprocess | null;
  /** What keeps the connection open, and opens it again after each drop. */
  follower: Fiber.Fiber<void, Dropped> | undefined;
  readonly id: string;
  lines: Set<(text: string) => void>;
  /** From the start of an open until its `ssh` has exited. */
  running: boolean;
  /** The last end it logged, so a machine that stays away is said once. */
  said: string | undefined;
  stopped: boolean;
  up: boolean;
  /** When it last came up this time round, or 0. */
  upAt: number;
  waiters: Deferred.Deferred<TunnelOutcome>[];
}

/** What a short command answered: its exit, its stdout and its stderr. */
interface Answer {
  code: number;
  err: string;
  out: string;
}

/**
 * A short command's answer, or null when it did not answer within
 * {@link CONTROL_MS}. Its process is ended when it is let go: past the
 * deadline, or interrupted.
 */
const control = (
  argv: string[],
  stdin?: string
): Effect.Effect<Answer | null> =>
  boundedRead(
    CONTROL_MS,
    Effect.scoped(
      Effect.gen(function* () {
        const child = yield* Effect.acquireRelease(
          Effect.sync(() =>
            Bun.spawn(argv, {
              env: hostEnvironment(),
              stdin:
                stdin === undefined
                  ? "ignore"
                  : new TextEncoder().encode(stdin),
              stdout: "pipe",
              stderr: "pipe",
            })
          ),
          (spawned) =>
            Effect.sync(() => {
              if (spawned.exitCode === null) {
                spawned.kill();
              }
            })
        );
        const [out, err, code] = yield* Effect.promise(() =>
          Promise.all([
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
            child.exited,
          ])
        );
        return { code, out: out.trim(), err: err.trim() };
      })
    )
  ).pipe(Effect.catchTag("Unanswered", () => Effect.succeed(null)));

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
 *
 * It runs under the tether (core tether.ts), whose shell `exec`s it in its
 * own place, its stdin the hub's end of a pipe, so it ends with the hub
 * however the hub ends: the service hub's SIGTERM is the kernel's
 * (lifetime.ts), so no JavaScript runs to end it, and `detached`
 * (`setsid()`) takes it out of the hub's process group. A hub run outside
 * the service's cgroup (a scratch hub, a `bun --watch`) left its masters
 * running, reparented, holding their machines' ports.
 * None is kept across a restart on purpose: the next hub tells any it
 * finds to exit (`clearControl`, as it connects) and opens its own.
 */
const master = (
  row: SshMachineRow,
  path: string
): Bun.Subprocess<"pipe", "ignore", "pipe"> =>
  spawnTethered(
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
    { env: hostEnvironment(), stdout: "ignore", stderr: "pipe" }
  );

/** One command on the machine over the master at `path`: `sh -c` and one single-quoted word, as ssh-add.ts runs its own. */
const onMachine = (
  path: string,
  target: string,
  script: string,
  stdin?: string
): Effect.Effect<Answer | null> =>
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
 * Ends `ssh`'s process group, when it still runs: the master's tether was
 * spawned `detached` and `exec`s `ssh`, so `ssh` leads its own group, the
 * tether's reader and its `ProxyCommand` in it.
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
    default:
      unhandled("refusal", refusal);
  }
};

/** Whether `master` answers on its control socket at `path`: signed in. False once it exits, or past {@link MASTER_READY_MS}. */
const masterReady = (
  child: Bun.Subprocess,
  path: string,
  target: string
): Effect.Effect<boolean> =>
  lookUntil(
    { every: Duration.millis(MASTER_POLL_MS), deadlineMs: MASTER_READY_MS },
    Effect.suspend((): Effect.Effect<boolean | undefined> => {
      if (child.exitCode !== null) {
        return Effect.succeed(false);
      }
      if (!existsSync(path)) {
        return Effect.succeed(undefined);
      }
      return control(["ssh", "-S", path, "-O", "check", "--", target]).pipe(
        Effect.map((checked) => (checked?.code === 0 ? true : undefined))
      );
    })
  ).pipe(Effect.map((looked) => looked.kind === "found" && looked.value));

/**
 * Whether a `-O forward` that exited non-zero was the machine's server
 * refusing it, read from the master's state, never from `ssh`'s words: the
 * forward asked is well formed, so when the master still answers `-O check`
 * (exit 0) it carried the request and the server said no; when it does not,
 * the connection itself failed.
 */
const refusedByServer = (
  path: string,
  target: string
): Effect.Effect<boolean> =>
  control(["ssh", "-S", path, "-O", "check", "--", target]).pipe(
    Effect.map((checked) => checked?.code === 0)
  );

/** Where the machine binds the probe forward `probed` made: a refusal, or nothing when it binds on its loopback alone. */
const readBinding = (
  path: string,
  target: string,
  probed: Answer
): Effect.Effect<TunnelRefusal | null> =>
  Effect.gen(function* () {
    const port = Number(probed.out);
    if (!PORT_LINE.test(probed.out)) {
      return {
        kind: "failed",
        step: "forwarding a port on the machine",
        said: `ssh named no port: ${probed.out}`,
      };
    }
    const read = yield* onMachine(path, target, listenersOn(port));
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
  });

/**
 * Where the machine binds a forward, before the hub is forwarded there: a
 * probe forward whose far end is a port nothing on this host answers (so
 * nothing behind it answers anyone), its listeners read, then cancelled by
 * the spec that made it (`-O cancel` by its allocated port answers "port not
 * forwarded" and leaves it, measured on OpenSSH 10.2). A refusal, or
 * nothing when it binds on its loopback alone.
 */
const checkBinding = (
  path: string,
  target: string
): Effect.Effect<TunnelRefusal | null> =>
  Effect.gen(function* () {
    const probe = `127.0.0.1:0:127.0.0.1:${freePort()}`;
    const probed = yield* control([
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
      return (yield* refusedByServer(path, target))
        ? { kind: "forwarding" }
        : {
            kind: "failed",
            step: "forwarding a port on the machine",
            said: saidBy(probed),
          };
    }
    return yield* readBinding(path, target, probed).pipe(
      Effect.ensuring(
        control(["ssh", "-S", path, "-O", "cancel", "-R", probe, "--", target])
      )
    );
  });

/**
 * Ends this hub's own earlier connection's session that still holds `port`
 * on the machine (a dead hub's, a dropped one's): the process recorded as
 * `session` when that connection came up, by its pid and its start, and
 * waits for the port to be let go. Nothing else that holds it is touched,
 * whatever it is (the person's own sshd, a session of theirs): the forward
 * then says the port is taken.
 */
const endStale = (
  path: string,
  target: string,
  port: number,
  session: string | null
): Effect.Effect<TunnelRefusal | null> =>
  Effect.gen(function* () {
    if (!(session && SESSION.test(session))) {
      return null;
    }
    const ended = yield* onMachine(path, target, endOwnOn(port, session));
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
    yield* lookUntil(
      { every: Duration.millis(MASTER_POLL_MS), deadlineMs: STALE_GONE_MS },
      onMachine(path, target, listenersOn(port)).pipe(
        Effect.map((read) => (read?.code === 0 && !read.out) || undefined)
      )
    );
    return null;
  });

/**
 * A held connection ended, and why: a failure of its series of opens, or,
 * when it ended after holding {@link STEADY_MS}, the first failure of the
 * next series.
 */
class Dropped extends Schema.TaggedError<Dropped>()("Dropped", {
  machineId: Schema.String,
  target: Schema.String,
  why: Schema.String,
}) {}

/** The machine ports one connection carried, and the carries under way: a new connection starts with none. */
interface Carried {
  carrying: Join<number, number, Error>;
  ports: Map<number, number>;
}

const noneCarried = (): Carried => ({
  carrying: makeJoin<number, number, Error>(),
  ports: new Map(),
});

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
      follower: undefined,
      running: false,
      up: false,
      upAt: 0,
      stopped: false,
      carried: noneCarried(),
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
      Deferred.doneUnsafe(answer, Effect.succeed(outcome));
    }
  };

  const cameUp = (tunnel: Tunnel, row: SshMachineRow, port: number): void => {
    tunnel.up = true;
    tunnel.upAt = Date.now();
    tunnel.said = undefined;
    tunnel.carried = noneCarried();
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
  const clearControl = (path: string, target: string): Effect.Effect<void> =>
    existsSync(path)
      ? control(["ssh", "-S", path, "-O", "exit", "--", target]).pipe(
          Effect.andThen(
            Effect.sync(() => {
              rmSync(path, { force: true });
            })
          )
        )
      : Effect.void;

  /**
   * The machine's forward to the hub, once the master at `path` has signed
   * in: where it binds checked, its stale session ended, then the forward.
   * Answers the machine's port, or what it would not do.
   */
  const forwardHub = (
    row: SshMachineRow,
    path: string
  ): Effect.Effect<{ port: number } | { refusal: TunnelRefusal }> =>
    Effect.gen(function* () {
      const binding = yield* checkBinding(path, row.target);
      if (binding) {
        return { refusal: binding };
      }
      if (row.boxPort !== null) {
        const stale = yield* endStale(
          path,
          row.target,
          row.boxPort,
          row.boxSession
        );
        if (stale) {
          return { refusal: stale };
        }
      }
      const forwarded = yield* forwardDoor(row, path);
      if ("port" in forwarded) {
        yield* recordSession(row, path, forwarded.port);
      }
      return forwarded;
    });

  /**
   * The process on the machine holding this connection's forward, recorded
   * for the row: the one {@link endStale} may end when this connection has
   * died and left it there. None read, none recorded: then nothing is ended.
   */
  const recordSession = (
    row: SshMachineRow,
    path: string,
    port: number
  ): Effect.Effect<void> =>
    onMachine(path, row.target, holderOn(port)).pipe(
      Effect.flatMap((read) =>
        Effect.sync(() => {
          const lines =
            read?.code === 0 ? read.out.split("\n").filter(Boolean) : [];
          const [session] = lines;
          db.update(row.id, {
            boxSession:
              lines.length === 1 && session && SESSION.test(session)
                ? session
                : null,
          });
        })
      )
    );

  /** The forward itself: the machine's port, kept the first time, to the hub's door. */
  const forwardDoor = (
    row: SshMachineRow,
    path: string
  ): Effect.Effect<{ port: number } | { refusal: TunnelRefusal }> =>
    Effect.gen(function* () {
      const spec = `127.0.0.1:${row.boxPort ?? 0}:127.0.0.1:${door.port(row.id, row.target)}`;
      const answer = yield* control([
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
        if (!(yield* refusedByServer(path, row.target))) {
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
    });

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
    recordLimitReading("hub.ssh-tunnel-lines", heard.lines.length);
    if (heard.lines.length > MAX_LINES) {
      heard.lines.shift();
    }
    for (const line of tunnel.lines) {
      line(text);
    }
  };

  /**
   * Once `child`, the master, has signed in: the machine's forward to the
   * hub, and the connection up. What the machine would not do, or nothing;
   * a master refused, or not signed in in time, is ended: nothing holds it.
   */
  const bringUp = (
    tunnel: Tunnel,
    row: SshMachineRow,
    path: string,
    child: Bun.Subprocess
  ): Effect.Effect<TunnelRefusal | null> =>
    Effect.gen(function* () {
      const ready = yield* masterReady(child, path, row.target);
      const forwarded =
        ready && !tunnel.stopped ? yield* forwardHub(row, path) : null;
      if (forwarded && "port" in forwarded) {
        cameUp(tunnel, row, forwarded.port);
        return null;
      }
      end(child);
      return forwarded?.refusal ?? null;
    });

  /**
   * `tunnel`'s master, run once and followed until `ssh` exits: its exit
   * and what the machine refused; null when the tunnel stopped before it
   * ran. The master is the scope's: ended with it, however it is left.
   */
  const runMaster = (
    tunnel: Tunnel,
    row: SshMachineRow,
    path: string,
    heard: { lines: string[]; since: string[] }
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        yield* clearControl(path, row.target);
        if (tunnel.stopped) {
          return null;
        }
        const child = yield* Effect.acquireRelease(
          Effect.sync(() => master(row, path)),
          (spawned) =>
            Effect.sync(() => {
              end(spawned);
              untether(spawned.stdin);
            })
        );
        tunnel.child = child;
        const reading = yield* Effect.forkScoped(
          Effect.promise(() =>
            eachLine(child.stderr, (line) => hear(tunnel, heard, line))
          )
        );
        const refusal = yield* bringUp(tunnel, row, path, child);
        yield* Fiber.join(reading);
        const code = yield* Effect.promise(() => child.exited);
        return { child, code, refusal };
      })
    );

  /**
   * Opens `tunnel`'s connection once and follows it until `ssh` exits.
   * Fails with why when a joined machine's connection ended before it held
   * {@link STEADY_MS}; answers why when it ended after holding it, and
   * nothing when nothing opens it again (the tunnel stopped, the machine
   * never joined, the hub closing). Whatever ends it, every add waiting on
   * it is told how it came out.
   */
  const connect = (
    tunnel: Tunnel
  ): Effect.Effect<Dropped | undefined, Dropped> =>
    Effect.gen(function* () {
      const row = db.get(tunnel.id);
      if (!row || tunnel.stopped || tunnel.running) {
        return;
      }
      tunnel.running = true;
      tunnel.upAt = 0;
      makeFolderSync(controlDir(), { mode: 0o700 });
      const path = controlPath(row.id);
      const heard: { lines: string[]; since: string[] } = {
        lines: [],
        since: [],
      };
      const letGo = (): boolean => {
        const steady = tunnel.upAt > 0 && Date.now() - tunnel.upAt >= STEADY_MS;
        tunnel.child = null;
        tunnel.running = false;
        tunnel.up = false;
        tunnel.carried = noneCarried();
        rmSync(path, { force: true });
        return steady;
      };
      const ran = yield* runMaster(tunnel, row, path, heard).pipe(
        Effect.onExit((exit) =>
          Exit.isSuccess(exit)
            ? Effect.void
            : Effect.sync(() => {
                letGo();
                settle(tunnel, {
                  kind: "ended",
                  code: null,
                  lines: heard.lines,
                  refusal: null,
                });
              })
        )
      );
      if (ran === null) {
        tunnel.running = false;
        settle(tunnel, { kind: "ended", code: null, lines: [], refusal: null });
        return;
      }
      const steady = letGo();
      settle(tunnel, {
        kind: "ended",
        code: ran.code,
        lines: heard.lines,
        refusal: ran.refusal,
      });
      const dropped = droppedBy(tunnel, row.id, ran, heard);
      return dropped === undefined || steady ? dropped : yield* dropped;
    });

  /** Why `tunnel`'s master ended, as `ran` and `heard` say; nothing when nothing opens it again (it stopped, its machine never joined, the hub closing). */
  const droppedBy = (
    tunnel: Tunnel,
    id: string,
    ran: { child: Bun.Subprocess; code: number; refusal: TunnelRefusal | null },
    heard: { lines: string[]; since: string[] }
  ): Dropped | undefined => {
    const now = db.get(id);
    if (tunnel.stopped || !now?.machineId || lifetime.closed()) {
      return;
    }
    const { child, code, refusal } = ran;
    const exited = child.signalCode
      ? `ssh ended by ${child.signalCode}`
      : `ssh exited ${code}`;
    return new Dropped({
      machineId: now.machineId,
      target: now.target,
      why: refusal
        ? `the machine refused: ${refusalWords(refusal)}`
        : ((tunnel.upAt > 0 ? heard.since : heard.lines).at(-1) ?? exited),
    });
  };

  /**
   * A joined machine's connection that ended is opened again: after 1 s,
   * doubling while it keeps failing ({@link REOPENS}). Each new reason is
   * said once, with the wait before the next open.
   */
  const reopens = (tunnel: Tunnel) =>
    backoffSchedule(REOPENS).pipe(
      Schedule.setInputType<Dropped>(),
      Schedule.modifyDelay(({ duration, input }) =>
        Effect.sync(() => {
          if (tunnel.said !== input.why) {
            tunnel.said = input.why;
            console.warn(
              `[ssh] ${input.target}: the connection that carries ${input.machineId} to this hub ended (${input.why}); it is opened again, from ${Math.round(Duration.toMillis(duration) / 1000)} s, until it holds`
            );
          }
          return duration;
        })
      )
    );

  /**
   * One series of opens of `tunnel`'s connection, each after its wait on
   * {@link REOPENS}, until one holds and ends (that end answered) or nothing
   * opens it again (nothing answered). `held`: one that held just ended,
   * which counts as the series' first failure, so the open after it waits
   * the first wait.
   */
  const series = (
    tunnel: Tunnel,
    held: Dropped | undefined
  ): Effect.Effect<Dropped | undefined, Dropped> =>
    reopenSeries(connect(tunnel), reopens(tunnel), Option.fromNullishOr(held));

  /** `tunnel`'s connection, opened now and again after each drop for as long as it is held. */
  const follow = (tunnel: Tunnel): Effect.Effect<void, Dropped> =>
    Effect.gen(function* () {
      let held = yield* series(tunnel, undefined);
      while (held) {
        held = yield* series(tunnel, held);
      }
    });

  /** `tunnel`'s connection opened now, a wait for the next open cut short. */
  const openNow = (tunnel: Tunnel): void => {
    tunnel.follower?.interruptUnsafe();
    const follower = lifetime.fork("ssh connection", follow(tunnel));
    tunnel.follower = follower;
    follower.addObserver(() => {
      if (tunnel.follower === follower) {
        tunnel.follower = undefined;
      }
    });
  };

  const stop = (tunnel: Tunnel): void => {
    tunnel.stopped = true;
    tunnel.follower?.interruptUnsafe();
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
      const outcome = Deferred.makeUnsafe<TunnelOutcome>();
      const port = db.get(row.id)?.boxPort ?? null;
      if (tunnel.up && port !== null) {
        Deferred.doneUnsafe(outcome, Effect.succeed({ kind: "up", port }));
      } else {
        tunnel.lines.add(line);
        tunnel.waiters.push(outcome);
        if (!tunnel.running) {
          openNow(tunnel);
        }
      }
      return {
        id: row.id,
        fresh: !held,
        machineId: row.machineId,
        outcome: Deferred.await(outcome),
      };
    },
    admit: Effect.fnUntraced(function* (id: string) {
      const row = db.get(id);
      if (!(row && tunnels.get(id)?.up)) {
        return "the hub's SSH connection to the machine is not open";
      }
      const key = randomBytes(32).toString("base64url");
      db.update(id, { pendingKey: key });
      const kept = yield* onMachine(
        controlPath(id),
        row.target,
        KEEP_KEY,
        `${key}\n`
      );
      return kept?.code === 0 ? undefined : saidBy(kept);
    }),
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
      const claimed = db.claim(hubIdKept());
      if (claimed > 0) {
        console.info(
          `[ssh] ${claimed} machine${claimed === 1 ? "" : "s"} added over SSH before records named their hub: this hub's, which added them`
        );
      }
      const elsewhere = db.heldElsewhere();
      if (elsewhere > 0) {
        console.info(
          `[ssh] ${elsewhere} machine${elsewhere === 1 ? "" : "s"} in this database ${elsewhere === 1 ? "is" : "are"} held by another hub (this database is a copy of its): this hub opens no connection to ${elsewhere === 1 ? "it" : "them"}`
        );
      }
      for (const row of db.unjoined()) {
        db.remove(row.id);
      }
      for (const row of db.joined()) {
        openNow(tunnelOf(row.id));
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
      const at = tunnel.carried;
      const held = at.ports.get(port);
      if (held !== undefined) {
        return Promise.resolve(held);
      }
      // The promise edge of one carry, shared by every caller while it runs.
      return lifetime.run(
        at.carrying.run(
          port,
          Effect.gen(function* () {
            const local = freePort();
            const answer = yield* control([
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
              return yield* Effect.fail(
                new Error(
                  `the hub's SSH connection to ${row.target} did not carry port ${port}: ${saidBy(answer)}`
                )
              );
            }
            at.ports.set(port, local);
            return local;
          })
        )
      );
    },
  };
};
