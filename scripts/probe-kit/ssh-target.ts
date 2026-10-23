/**
 * A scratch SSH target for the specs that add a machine over SSH
 * (ssh-password-join, ssh-reach): an SSH server on the maintained `ssh2`
 * package, because a non-root OpenSSH `sshd` cannot check a password, which
 * needs /etc/shadow or PAM. It signs in by password, keyboard-interactive or
 * a key in its own `authorized_keys`, forwards a port to the client as
 * OpenSSH's sshd does (`tcpip-forward`), and runs each command with `sh -c`
 * under a HOME and PATH of its own.
 *
 * Its commands' PATH ({@link machineBin}) has no `tar`: the hub's install
 * script, downloaded through the hub's connection, runs there and stops at
 * its first check, before it fetches or places anything, unless the machine
 * already has CawCo (the script's own rejoin branch, which ssh-reach uses).
 *
 * Run as a program (`bun ssh-target.ts '<json>'`, {@link TargetConfig}) it
 * serves one user and one password, and says `ssh-target listening <port>`:
 * how ssh-reach starts it inside its box.
 */
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { join } from "node:path";
import {
  type AuthContext,
  type AuthenticationType,
  type Connection,
  type ParsedKey,
  type PublicKeyAuthContext,
  Server,
  type TcpipBindInfo,
  utils,
} from "ssh2";

/** What a held install step on the machine runs: a `sleep` no other process here runs. */
export const HELD = ["sleep", "3017"];

/** Every way of signing in the target offers when it refuses one. */
export const WAYS: AuthenticationType[] = [
  "publickey",
  "password",
  "keyboard-interactive",
];

/**
 * The machine's commands, in `dir`: the system's own `sh`, `curl` and what
 * the hub's remote command and the trust step run, and no `tar`. Each is the
 * binary itself, never a wrapper earlier on this PATH. `uname`, the install
 * script's first command, holds the step ({@link HELD}) while
 * `$HOME/.hold` exists.
 */
export const machineBin = (dir: string): string => {
  mkdirSync(dir, { recursive: true });
  for (const tool of [
    "sh",
    "bash",
    "curl",
    "ps",
    "sleep",
    "kill",
    "mkdir",
    "touch",
    "tail",
    "grep",
    "cat",
    "sed",
    "mv",
    "id",
    // The hub reads where the machine listens, records the session holding
    // its port and ends that one alone, with these and `ps`, `sed`, `kill`
    // (hub ssh-tunnels.ts `listenersOn`, `holderOn`, `endOwnOn`). No `tr`:
    // the hub's commands must not need one.
    "ss",
    // A clone and push through the hub's remote (ssh-reach (i)).
    "git",
  ]) {
    const at = [
      `/usr/bin/${tool}`,
      `/bin/${tool}`,
      `/usr/sbin/${tool}`,
      `/sbin/${tool}`,
    ].find((path) => existsSync(path));
    if (at) {
      symlinkSync(at, join(dir, tool));
    }
  }
  writeFileSync(
    join(dir, "uname"),
    `#!/bin/sh\n[ -e "$HOME/.hold" ] && exec ${HELD.join(" ")}\nexec /usr/bin/uname "$@"\n`
  );
  chmodSync(join(dir, "uname"), 0o755);
  return dir;
};

/** The keys `authorized` holds, as the target reads them at each sign-in. */
const trustedKeys = (authorized: string): ParsedKey[] =>
  existsSync(authorized)
    ? readFileSync(authorized, "utf8")
        .split("\n")
        .filter(Boolean)
        .flatMap((line) => {
          const key = utils.parseKey(line);
          return key instanceof Error ? [] : [key as ParsedKey];
        })
    : [];

/**
 * A key sign-in: the key is one `authorized` holds, and its signature, once
 * sent, verifies (before it, the client only asks). `verified` hears a
 * signature that did.
 */
export const keyAccepted = (
  authorized: string,
  ctx: PublicKeyAuthContext,
  verified: () => void = () => undefined
): boolean => {
  const { key, signature, blob, hashAlgo } = ctx;
  const match = trustedKeys(authorized).find(
    (one) => one.type === key.algo && one.getPublicSSH().equals(key.data)
  );
  if (!(match && signature && blob)) {
    return Boolean(match);
  }
  const ok = match.verify(blob, signature, hashAlgo) === true;
  if (ok) {
    verified();
  }
  return ok;
};

/**
 * `tcpip-forward`, as OpenSSH's sshd answers it: a listener on the target's
 * loopback (port 0 allocated and said back), each connection to it opened to
 * the client as a `forwarded-tcpip` channel; and `cancel-tcpip-forward`,
 * which closes the listener the request names (by the port it asked for,
 * 0 for the last one allocated).
 */
const forwarding = (client: Connection): void => {
  const listeners = new Map<number, ReturnType<typeof createServer>>();
  let allocated: number | undefined;
  client.on("request", (accept, reject, name, info) => {
    if (name === "cancel-tcpip-forward") {
      const { bindPort } = info as TcpipBindInfo;
      const port = bindPort === 0 ? allocated : bindPort;
      const held = port === undefined ? undefined : listeners.get(port);
      if (!(held && port !== undefined && accept)) {
        reject?.();
        return;
      }
      held.close();
      listeners.delete(port);
      accept();
      return;
    }
    if (!(name === "tcpip-forward" && accept)) {
      reject?.();
      return;
    }
    const { bindAddr, bindPort } = info as TcpipBindInfo;
    const listener = createServer((socket) => {
      const { port } = listener.address() as AddressInfo;
      client.forwardOut(
        bindAddr,
        port,
        socket.remoteAddress ?? "127.0.0.1",
        socket.remotePort ?? 0,
        (error, channel) => {
          if (error) {
            socket.destroy();
            return;
          }
          socket.pipe(channel).pipe(socket);
          socket.on("error", () => channel.close());
          channel.on("error", () => socket.destroy());
        }
      );
    });
    listener.listen(bindPort, "127.0.0.1", () => {
      const { port } = listener.address() as AddressInfo;
      listeners.set(port, listener);
      if (bindPort === 0) {
        allocated = port;
      }
      accept(port);
    });
    client.on("close", () => listener.close());
  });
};

/** Each command a session runs, as sshd runs it: `sh -c`, output as it comes, the exit once both ends close. */
const running = (
  client: Connection,
  machine: { home: string; path: string }
): void => {
  client.on("session", (accept) => {
    accept().on("exec", (acceptExec, _reject, info) => {
      const channel = acceptExec();
      const child = Bun.spawn(["sh", "-c", info.command], {
        cwd: machine.home,
        env: { HOME: machine.home, PATH: machine.path },
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      // The client's stdin, as sshd hands it on: the hub writes a machine's key so.
      channel.on("data", (chunk: Buffer) => {
        child.stdin.write(chunk);
      });
      channel.on("end", () => {
        child.stdin.end();
      });
      const relay = async (
        from: ReadableStream<Uint8Array>,
        to: { write: (chunk: Uint8Array) => unknown }
      ) => {
        for await (const chunk of from) {
          to.write(chunk);
        }
      };
      Promise.all([
        relay(child.stdout, channel),
        relay(child.stderr, channel.stderr),
        child.exited,
      ]).then(([, , code]) => {
        channel.exit(code);
        channel.end();
      });
    });
  });
};

/**
 * The target on `host`:`port` (0: any), signing in by `authenticate`;
 * answers its port. `forwards: false` refuses every `tcpip-forward`, as an
 * sshd with `AllowTcpForwarding no` does.
 */
export const serveTarget = async (options: {
  authenticate: (ctx: AuthContext) => void;
  forwards?: boolean;
  home: string;
  host: string;
  hostKey: Buffer;
  path: string;
  port: number;
}): Promise<{ port: number; server: Server }> => {
  const server = new Server({ hostKeys: [options.hostKey] }, (client) => {
    client
      .on("authentication", options.authenticate)
      .on("ready", () => {
        if (options.forwards === false) {
          client.on("request", (_accept, reject) => reject?.());
        } else {
          forwarding(client);
        }
        running(client, options);
      })
      .on("error", () => undefined);
  });
  const port = await new Promise<number>((resolve) => {
    server.listen(options.port, options.host, () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
  return { port, server };
};

/** What the program takes, as one JSON argument. */
export interface TargetConfig {
  authorized: string;
  home: string;
  host: string;
  hostKey: string;
  password: string;
  path: string;
  port: number;
  user: string;
}

if (import.meta.main) {
  const config = JSON.parse(process.argv[2] ?? "{}") as TargetConfig;
  const { port } = await serveTarget({
    home: config.home,
    host: config.host,
    hostKey: readFileSync(config.hostKey),
    path: config.path,
    port: config.port,
    authenticate: (ctx) => {
      const ok =
        ctx.username === config.user &&
        (ctx.method === "password"
          ? ctx.password === config.password
          : ctx.method === "publickey" && keyAccepted(config.authorized, ctx));
      if (ok) {
        ctx.accept();
      } else {
        ctx.reject(WAYS);
      }
    },
  });
  console.log(`ssh-target listening ${port}`);
}
