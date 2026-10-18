/**
 * The hub's own way to every machine it added over SSH, and the machine's
 * way back: one SSH connection per machine, which the hub opens and holds,
 * carrying a remote forward from a port on the machine's loopback to the
 * hub's port here. The machine's agent knows its hub as
 * `http://127.0.0.1:<that port>`, so all it sends the hub (its socket, every
 * HTTP call) rides the connection the hub made. The machine needs no route
 * to any address of the hub's: a box on another network, with no Tailscale,
 * joins and stays joined all the same (owner: it "needs to work even when
 * it's on a different network or no tailscale, over ssh"). The same
 * connection carries the hub's previews of the machine's sessions the other
 * way ({@link SshTunnels.carry}).
 *
 * The connection is `ssh -N` (ssh(1): "Do not execute a remote command. This
 * is useful for just forwarding ports.") with `-R 127.0.0.1:<port>:127.0.0.1:
 * <hub port>`. The first time, the port is 0: "If the port argument is '0',
 * the listen port will be dynamically allocated on the server and reported
 * to the client at run time" (https://man.openbsd.org/ssh), so it is one
 * nothing on the machine already listens on. It is kept (`ssh_machines`) and
 * asked for by number from then on: the agent's config names it.
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
import { DB_PATH, HUB_PORT } from "./config";
import type { SshMachineRow, SshMachinesDb } from "./db/ssh-machines";
import type { HubLifetimeShape, HubTimer } from "./lifetime";

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
/** How long a control command (`-O exit`, `-O forward`) gets to answer. Our choice. */
const CONTROL_MS = 5000;
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

/** `ssh`'s INFO line once port 0 is allocated: `Allocated port 41234 for remote forward to 127.0.0.1:3456`. */
const ALLOCATED = /^Allocated port (\d+) for remote forward/;
/** `-v`'s line once the server has the forward: `debug1: remote forward success for: listen 127.0.0.1:41234, connect …`. */
const FORWARDED = /remote forward success for: listen [^,]*:(\d+),/;
/** ExitOnForwardFailure's end when the server refused it: `Error: remote port forwarding failed for listen port 0`. */
const REFUSED = /remote port forwarding failed for listen port (\d+)/;
/** `-v`'s own lines, kept out of what an add shows. */
const DEBUG = /^debug\d?: /;
const CARRIAGE_RETURN = /\r$/;

/** How a connection the hub was waiting on came out. */
export type TunnelOutcome =
  | { kind: "up"; port: number }
  | {
      kind: "ended";
      code: number | null;
      lines: string[];
      /** The port the machine's server refused to forward, when that ended it. */
      refused: number | null;
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

/** A short command's exit and stderr, or null when it did not answer within {@link CONTROL_MS}. */
const control = async (
  argv: string[]
): Promise<{ code: number; err: string } | null> => {
  const ran = await readWithin(CONTROL_MS, async (signal) => {
    const child = Bun.spawn(argv, {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
      signal,
    });
    const [err, code] = await Promise.all([
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, err: err.trim() };
  });
  return ran.kind === "answered" ? ran.value : null;
};

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
 * The connection's `ssh`, the master of the control socket at `path`.
 * ExitOnForwardFailure: "Specifies whether ssh(1) should terminate the
 * connection if it cannot set up all requested … remote port forwardings"
 * (ssh_config(5)), so a machine that refuses it ends here rather than
 * holding a connection that carries nothing. BatchMode: "user interaction
 * such as password prompts and host key confirmation requests will be
 * disabled". `-v` for the one line that says a fixed port is forwarded;
 * `-M -S` makes it the master {@link SshTunnels.carry} adds forwards to
 * (ssh(1) `-O forward`: "Request forwardings without command execution").
 * Bound to 127.0.0.1 on the machine: "By default, TCP listening sockets on
 * the server will be bound to the loopback interface only" (ssh(1) `-R`);
 * named, for a server whose GatewayPorts is clientspecified. It leads a
 * process group of its own, so a stop ends it and a `ProxyCommand` it runs.
 */
const master = (
  row: SshMachineRow,
  path: string
): Bun.Subprocess<"ignore", "ignore", "pipe"> =>
  Bun.spawn(
    [
      "ssh",
      "-v",
      "-N",
      "-o",
      "BatchMode=yes",
      "-o",
      "ExitOnForwardFailure=yes",
      ...sshOptions(row.sshPort),
      "-M",
      "-S",
      path,
      "-R",
      `127.0.0.1:${row.boxPort ?? 0}:127.0.0.1:${HUB_PORT}`,
      "--",
      row.target,
    ],
    { stdin: "ignore", stdout: "ignore", stderr: "pipe", detached: true }
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

/** Ends `ssh`'s process group, when it still runs. */
const end = (child: Bun.Subprocess | null): void => {
  if (!child || child.exitCode !== null) {
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // ESRCH: it exited between the check and the signal.
  }
};

export const createSshTunnels = ({
  db,
  lifetime,
}: {
  db: SshMachinesDb;
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

  /** What one connection's `ssh` has said so far, as {@link hear} reads it. */
  interface Heard {
    /** Its own lines, `-v`'s left out: what an add shows. */
    lines: string[];
    /** The forward the machine's server refused, when it did. */
    refused: number | null;
    /** What it said once the connection was up: why a held one ended. */
    since: string[];
  }

  /** One line of `tunnel`'s `ssh` on `row`: the forward up, refused, or a line to keep. */
  const hear = (
    tunnel: Tunnel,
    row: SshMachineRow,
    heard: Heard,
    raw: string
  ): void => {
    const text = raw.replace(CARRIAGE_RETURN, "");
    const allocated = ALLOCATED.exec(text);
    if (allocated) {
      const port = Number(allocated[1]);
      db.update(row.id, { boxPort: port });
      cameUp(tunnel, row, port);
      return;
    }
    const forwarded = FORWARDED.exec(text);
    if (forwarded && forwarded[1] !== "0") {
      cameUp(tunnel, row, Number(forwarded[1]));
    }
    const refusal = REFUSED.exec(text);
    if (refusal) {
      heard.refused = Number(refusal[1]);
    }
    if (DEBUG.test(text)) {
      return;
    }
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
      settle(tunnel, { kind: "ended", code: null, lines: [], refused: null });
      return;
    }
    const child = master(row, path);
    tunnel.child = child;
    const heard: Heard = { lines: [], refused: null, since: [] };
    await eachLine(child.stderr, (line) => hear(tunnel, row, heard, line));
    const code = await child.exited;
    const steady = tunnel.upAt > 0 && Date.now() - tunnel.upAt >= STEADY_MS;
    tunnel.child = null;
    tunnel.running = false;
    tunnel.up = false;
    tunnel.carried.clear();
    rmSync(path, { force: true });
    const { lines, refused, since } = heard;
    settle(tunnel, { kind: "ended", code, lines, refused });
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
      refused === null
        ? ((tunnel.upAt > 0 ? since : lines).at(-1) ?? exit)
        : `the machine refused to forward port ${refused}: something there holds it, or its sshd no longer allows forwarding (AllowTcpForwarding)`
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
        machineId: null,
        createdAt: new Date(),
      };
      if (!held) {
        db.create(row);
      }
      const tunnel = tunnelOf(row.id);
      const outcome = new Promise<TunnelOutcome>((resolve) => {
        if (tunnel.up && row.boxPort !== null) {
          resolve({ kind: "up", port: row.boxPort });
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
    abandon: (id) => {
      const tunnel = tunnels.get(id);
      if (tunnel) {
        stop(tunnel);
      }
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
            `the hub's SSH connection to ${row.target} did not carry port ${port}: ${answer ? answer.err || `ssh exited ${answer.code}` : `no answer within ${CONTROL_MS / 1000} s`}`
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
