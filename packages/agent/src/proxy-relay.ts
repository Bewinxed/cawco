/**
 * A Linux workspace's way out for every client, the ones that cannot
 * present srt's proxy credential among them.
 *
 * srt's proxy is a workspace's one way out, and it answers a request without
 * its per-session token `407 Proxy-Authenticate: Basic realm="srt"` ("Per-
 * session bearer token. When set, every CONNECT and absolute-URI request
 * must carry `Proxy-Authorization` … or it gets a 407. Without this, any
 * host process can dial 127.0.0.1 and reach the filter callback", srt
 * http-proxy.ts). srt hands the token to the sandbox in its proxy URLs'
 * userinfo alone (`HTTPS_PROXY=http://srt.…:<token>@localhost:3128`), which a
 * client must decode and present itself. Chromium never does: it takes its
 * proxy from the environment without the userinfo ("Chrome's
 * `--proxy-server` flag only accepts `host:port` … the credentials are
 * silently ignored", github.com/simonw/rodney claude-code-chrome-proxy.md),
 * so every page a session's own Chromium opened in a workspace, its
 * `artifact_browse` address among them, was refused at the proxy
 * (2026-10-22: `407 /__cawco/enter`, then ERR_TUNNEL_CONNECTION_FAILED).
 *
 * So the boundary puts a relay in front of srt's proxy that presents the
 * token for every request, and the sandbox's proxy URLs name the relay with
 * no userinfo: one way out, the same for every client. Its two halves:
 *
 * - The host half ({@link startProxyRelay}), in the srt host
 *   (boundary-host.ts), which holds srt's port and token: a listener on a
 *   unix socket in srt's own temp dir, which the sandbox binds back as it
 *   binds srt's own bridge sockets there. For each connection it dials srt's
 *   proxy and passes the stream through, adding the credential to the head
 *   of every request on it: each request of a kept-alive connection, read
 *   by its framing (RFC 9112 §6: a `Transfer-Encoding` body is chunked, else
 *   `Content-Length` counts it, else it has none), and a CONNECT or an
 *   upgrade passed through as a tunnel once its head is sent. Whatever srt
 *   answers reaches the client as srt wrote it: a refusal by policy reads
 *   as srt's own 403.
 * - The sandbox half ({@link RELAY_STEP}), in the runner (boundary.ts
 *   `runnerText`): socat on `127.0.0.1:` {@link RELAY_PORT} inside the sandbox's
 *   own network namespace, as srt puts its own bridges there, to that
 *   socket; then srt's proxy URLs pointed at it.
 *
 * The one exception, the hub's own preview origins (core hub-previews.ts):
 * srt refuses the owner's network, and the hub with it, so a preview a
 * workspace is handed or asks `artifact_browse` for, on a hub the tailnet
 * or the LAN alone reaches, could not be opened from inside. The agent keeps
 * the origins the hub states in its register ack in a file of its own
 * (agent hub-previews.ts), named to the relay by `previews`: a request head
 * whose target is one of them (a CONNECT, or a plain HTTP request in
 * absolute form) is dialed from the host, as the person's browser on the
 * host reaches it, and every other goes to srt as before, which still
 * refuses the LAN, the tailnet and the hub's other ports. What is reached so
 * is a preview listener of the hub's, which lets in only a pass in host mode
 * and is what every device on the owner's network reaches in port mode.
 *
 * The upstream is chosen at each request's head, the one before it left: an
 * HTTP/1.1 client sends a request on a connection once the answer before it
 * is read (no browser or curl pipelines), so the one before is done.
 *
 * Whom it lets through: only what reaches the socket. Its dir is srt's temp
 * dir, owner-only (0700), under the runtime dir every other workspace's
 * policy read-denies, so no other workspace sees the path; inside the
 * sandbox, the port is in the sandbox's own network namespace, which no
 * process outside it reaches. A process of the user's on the host reaches
 * the socket, as it reaches the token in any sandboxed process's
 * environment, and holds the host's whole network anyway.
 *
 * Dependency-free but for core's dependency-free socat backlog and hub
 * preview origins: the srt host imports it (boundary-host.ts takes nothing of
 * cawco's but dependency-free modules).
 */
import { chmodSync, readFileSync, rmSync, statSync } from "node:fs";
import { connect, createServer, type Server, type Socket } from "node:net";
import {
  type HubPreviewOrigins,
  hubPreviewOriginsOf,
  isHubPreview,
} from "@cawco/core/hub-previews";
import { SOCAT_BACKLOG } from "@cawco/core/socat";

/** The relay's port inside a Linux workspace's sandbox, beside srt's 3128 (HTTP) and 1080 (SOCKS) there. */
export const RELAY_PORT = 3129;

/** The relay's socket's name in srt's temp dir. */
export const RELAY_SOCKET_NAME = "cawco-proxy-relay.sock";

/** Set on the runner by the srt host: the relay's socket, which the runner's {@link RELAY_STEP} bridges into the sandbox. */
export const RELAY_SOCKET_ENV = "CAWCO_PROXY_RELAY";

/** The relay's address as the sandbox's proxy URLs name it: no userinfo. */
export const RELAY_URL = `http://127.0.0.1:${RELAY_PORT}`;

/**
 * Every proxy variable srt sets to its HTTP proxy's URL (sandbox-utils.js
 * `generateProxyEnvVars` at 0.0.81), each pointed at the relay. srt's SOCKS
 * URLs (`FTP_PROXY`, `RSYNC_PROXY`) stay: a SOCKS client presents the
 * RFC 1929 credential from the URL itself, and no client that drops it
 * reads them.
 */
const HTTP_PROXY_VARS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "http_proxy",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "GRPC_PROXY",
  "grpc_proxy",
  "DOCKER_HTTP_PROXY",
  "DOCKER_HTTPS_PROXY",
];

/** {@link RELAY_PORT} as `/proc/net/tcp` spells a listener on 127.0.0.1: address and port in hex, state 0A (LISTEN). */
const LISTENING = `0100007F:${RELAY_PORT.toString(16).toUpperCase().padStart(4, "0")} 00000000:0000 0A`;

/**
 * The runner's step that bridges the relay into the sandbox, run before
 * it reads srt's environment for its commands (boundary.ts `runnerText`); a
 * runner that names no relay socket ({@link RELAY_SOCKET_ENV}: macOS, whose
 * Seatbelt boundary has no srt proxy) skips it. srt's own address is read
 * from its `HTTPS_PROXY`, and every HTTP proxy variable naming it, with or
 * without userinfo, names the relay instead, gcloud's port too
 * (`CLOUDSDK_PROXY_*`), its credential gone. The runner waits until socat
 * listens; one that never does ends the sandbox with a line saying so,
 * which the agent names the boundary's refusal by.
 */
export const RELAY_STEP = `if [ -n "\${${RELAY_SOCKET_ENV}:-}" ]; then
  srt_proxy=\${HTTPS_PROXY:-}
  srt_proxy=\${srt_proxy#http://}
  srt_proxy=\${srt_proxy##*@}
  srt_proxy=\${srt_proxy%/}
  socat TCP-LISTEN:${RELAY_PORT},bind=127.0.0.1,fork,reuseaddr,backlog=${SOCAT_BACKLOG} "UNIX-CONNECT:$${RELAY_SOCKET_ENV}" < /dev/null > /dev/null 2>&1 &
  relay_up=
  for _ in $(seq 200); do
    if grep -q ': ${LISTENING} ' /proc/net/tcp; then relay_up=1; break; fi
    sleep 0.05
  done
  if [ -z "$relay_up" ]; then
    echo "cawco: the workspace's proxy relay did not listen on 127.0.0.1:${RELAY_PORT} inside the sandbox within 10 s, so the sandbox has no way out and the boundary closes"
    exit 1
  fi
  for name in ${HTTP_PROXY_VARS.join(" ")}; do
    eval "value=\\\${$name:-}"
    case $value in
      "http://$srt_proxy" | "http://$srt_proxy/" | http://*@"$srt_proxy" | http://*@"$srt_proxy/") export "$name=${RELAY_URL}" ;;
    esac
  done
  if [ -n "$srt_proxy" ] && [ "\${CLOUDSDK_PROXY_PORT:-}" = "\${srt_proxy##*:}" ]; then
    export CLOUDSDK_PROXY_ADDRESS=127.0.0.1 CLOUDSDK_PROXY_PORT=${RELAY_PORT}
    unset CLOUDSDK_PROXY_USERNAME CLOUDSDK_PROXY_PASSWORD
  fi
  unset ${RELAY_SOCKET_ENV} srt_proxy relay_up name value
fi`;

const CRLF = Buffer.from("\r\n");
const HEAD_END = Buffer.from("\r\n\r\n");
const EMPTY = Buffer.alloc(0);
/** The most a request's head may hold before the relay refuses it (Node's own default head limit is 16 KiB). */
const MAX_HEAD = 64 * 1024;
/** The most a chunk's size line or a trailer line may hold. */
const MAX_LINE = 4096;
const CHUNKED = /(?:^|,)\s*chunked\s*$/iu;
const DECIMAL = /^\d+$/u;
const HEX = /^[0-9a-f]+$/iu;
const PROXY_AUTHORIZATION = /^proxy-authorization\s*:/iu;
/** A request target in absolute form, as a client asks a proxy for a plain HTTP origin. */
const ABSOLUTE_FORM = /^https?:\/\//iu;
/** A head's proxy-only fields, which a request dialed straight to its origin leaves out. */
const PROXY_ONLY = /^proxy-(?:authorization|connection)\s*:/iu;

/** Where the relay stands in the client's stream of requests. */
type Phase =
  /** Reading a request's head. */
  | { kind: "head" }
  /** Passing `left` more bytes of a body, then reading what comes `after` (the next head, or a chunk's size line). */
  | { kind: "bytes"; left: number; after: "head" | "size" }
  /** Reading a chunk's size line. */
  | { kind: "size" }
  /** Reading the trailer section after the last chunk, to its empty line. */
  | { kind: "trailer" }
  /** A CONNECT or an upgrade: everything passed as it comes. */
  | { kind: "tunnel" };

/** One step through what the client sent: more is needed, the relay refuses (its status), or bytes go to srt and the phase moves on. */
type Step =
  | { wait: true }
  | { refuse: string }
  | { out: Buffer; phase: Phase; rest: Buffer };

const WAIT: Step = { wait: true };
const BAD_REQUEST: Step = { refuse: "400 Bad Request" };

/** A request head's lines, split once. */
const linesOf = (head: Buffer): string[] =>
  head.toString("latin1").slice(0, -4).split("\r\n");

/** Header `name`'s values in `lines` (the request line first, skipped), joined as a list. */
const headerOf = (
  lines: readonly string[],
  name: string
): string | undefined => {
  const values = lines.slice(1).flatMap((line) => {
    const colon = line.indexOf(":");
    return colon > 0 && line.slice(0, colon).trim().toLowerCase() === name
      ? [line.slice(colon + 1).trim()]
      : [];
  });
  return values.length > 0 ? values.join(",") : undefined;
};

/** Whether the head asks for a tunnel: a CONNECT, or an upgrade (`Upgrade` named in `Connection`). */
const tunnels = (lines: readonly string[]): boolean =>
  lines[0]?.split(" ")[0]?.toUpperCase() === "CONNECT" ||
  (headerOf(lines, "upgrade") !== undefined &&
    (headerOf(lines, "connection") ?? "")
      .split(",")
      .some((token) => token.trim().toLowerCase() === "upgrade"));

/** The phase after a request's head, by RFC 9112 §6.3 for a request: a tunnel, a chunked body, a counted one, or none. */
const afterHead = (lines: readonly string[]): Phase | undefined => {
  if (tunnels(lines)) {
    return { kind: "tunnel" };
  }
  const coding = headerOf(lines, "transfer-encoding");
  if (coding !== undefined) {
    return CHUNKED.test(coding) ? { kind: "size" } : undefined;
  }
  const length = headerOf(lines, "content-length");
  if (length === undefined) {
    return { kind: "head" };
  }
  const counts = new Set(length.split(",").map((one) => one.trim()));
  const [only] = counts;
  if (counts.size !== 1 || !(only && DECIMAL.test(only))) {
    return;
  }
  const left = Number(only);
  return left > 0 ? { kind: "bytes", left, after: "head" } : { kind: "head" };
};

/**
 * `lines` (a request's head) with the relay's credential: any
 * `Proxy-Authorization` the client sent is dropped, since the relay is the
 * only one that presents srt's.
 */
const withCredential = (
  lines: readonly string[],
  authorization: string
): Buffer =>
  Buffer.from(
    `${[
      lines[0],
      ...lines.slice(1).filter((line) => !PROXY_AUTHORIZATION.test(line)),
      `Proxy-Authorization: ${authorization}`,
    ].join("\r\n")}\r\n\r\n`,
    "latin1"
  );

/** Up to `phase.left` bytes of a body, as they are. */
const bytesStep = (
  phase: Extract<Phase, { kind: "bytes" }>,
  pending: Buffer
): Step => {
  if (pending.length === 0) {
    return WAIT;
  }
  const n = Math.min(phase.left, pending.length);
  return {
    out: pending.subarray(0, n),
    phase:
      n === phase.left
        ? { kind: phase.after }
        : { ...phase, left: phase.left - n },
    rest: pending.subarray(n),
  };
};

/** One CRLF-ended line, passed as written; `next` reads it into the phase after it, or refuses it (undefined). */
const lineStep = (
  pending: Buffer,
  next: (line: string) => Phase | undefined
): Step => {
  const end = pending.indexOf(CRLF);
  if (end < 0) {
    return pending.length > MAX_LINE ? BAD_REQUEST : WAIT;
  }
  const phase = next(pending.subarray(0, end).toString("latin1"));
  return phase
    ? {
        out: pending.subarray(0, end + 2),
        phase,
        rest: pending.subarray(end + 2),
      }
    : BAD_REQUEST;
};

/** A chunk's size line: its data and the CRLF closing it come next; the last chunk (size 0) opens the trailers. */
const afterSize = (line: string): Phase | undefined => {
  const size = line.split(";")[0]?.trim() ?? "";
  if (!HEX.test(size)) {
    return;
  }
  const bytes = Number.parseInt(size, 16);
  return bytes === 0
    ? { kind: "trailer" }
    : { kind: "bytes", left: bytes + 2, after: "size" };
};

/** The next step from `phase` (anything but a head) over `pending`. */
const stepOf = (
  phase: Exclude<Phase, { kind: "head" }>,
  pending: Buffer
): Step => {
  switch (phase.kind) {
    case "bytes":
      return bytesStep(phase, pending);
    case "size":
      return lineStep(pending, afterSize);
    case "trailer":
      return lineStep(pending, (line) =>
        line === "" ? { kind: "head" } : phase
      );
    case "tunnel":
      return pending.length === 0 ? WAIT : { out: pending, phase, rest: EMPTY };
    default:
      return phase satisfies never;
  }
};

/** What the relay answers, before closing, for a request srt never hears. */
const refusal = (status: string, why = ""): Buffer =>
  Buffer.from(
    `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(why)}\r\nX-Proxy-Error: cawco-relay\r\n\r\n${why}`,
    "latin1"
  );

const ESTABLISHED = Buffer.from(
  "HTTP/1.1 200 Connection Established\r\n\r\n",
  "latin1"
);

/** Where a request's head asks to go: a CONNECT's authority, or an absolute-form target's; none for origin form. */
const targetOf = (
  lines: readonly string[]
):
  | { connect: boolean; host: string; path: string; port: number }
  | undefined => {
  const [method = "", target = ""] = (lines[0] ?? "").split(" ");
  const tunnel = method.toUpperCase() === "CONNECT";
  const url = tunnel ? `http://${target}` : target;
  if (!((tunnel || ABSOLUTE_FORM.test(target)) && URL.canParse(url))) {
    return;
  }
  const parsed = new URL(url);
  const port = Number(parsed.port) || (parsed.protocol === "https:" ? 443 : 80);
  return {
    connect: tunnel,
    host: parsed.hostname,
    path: `${parsed.pathname}${parsed.search}`,
    port,
  };
};

/** A head for its origin itself: the request line in origin form, its proxy-only fields gone. */
const originHead = (lines: readonly string[], path: string): Buffer => {
  const [method, , version] = (lines[0] ?? "").split(" ");
  return Buffer.from(
    `${[
      `${method} ${path || "/"} ${version}`,
      ...lines.slice(1).filter((line) => !PROXY_ONLY.test(line)),
    ].join("\r\n")}\r\n\r\n`,
    "latin1"
  );
};

/**
 * The hub's preview origins, read from `path` again whenever the agent
 * writes it anew (agent hub-previews.ts); none when there is no file or it
 * is not one.
 */
const previewOriginsAt = (path: string | undefined) => {
  let read: { at: number; origins: HubPreviewOrigins | null } = {
    at: -1,
    origins: null,
  };
  return (): HubPreviewOrigins | null => {
    if (!path) {
      return null;
    }
    let at: number;
    try {
      at = statSync(path).mtimeMs;
    } catch {
      return null;
    }
    if (at !== read.at) {
      let origins: HubPreviewOrigins | null = null;
      try {
        origins = hubPreviewOriginsOf(JSON.parse(readFileSync(path, "utf8")));
      } catch {
        origins = null;
      }
      read = { at, origins };
    }
    return read.origins;
  };
};

/** Where one request goes: srt's proxy, with its credential, or one of the hub's preview origins, from here. */
type Route = { kind: "srt" } | { host: string; kind: "hub"; port: number };

/**
 * One client connection: each request's head routed ({@link Route}), given
 * srt's `authorization` when it goes to srt's proxy at `srt`, every other
 * byte passed through in order, and each answer piped back untouched.
 */
const relayOne = (
  client: Socket,
  srt: { host: string; port: number },
  authorization: string,
  previews: () => HubPreviewOrigins | null
): void => {
  let upstream: Socket | undefined;
  let routed = "";
  let pending: Buffer = EMPTY;
  let phase: Phase = { kind: "head" };
  let refused = false;

  const broken = (): void => {
    client.destroy();
    upstream?.destroy();
  };

  /** The upstream `route` names, the one before let go when it differs. */
  const upstreamFor = (route: Route): Socket => {
    const key = route.kind === "srt" ? "srt" : `${route.host}:${route.port}`;
    if (upstream && key === routed) {
      return upstream;
    }
    if (upstream) {
      upstream.unpipe(client);
      upstream.removeAllListeners();
      upstream.on("error", () => undefined);
      upstream.destroy();
    }
    const opened = connect({
      ...(route.kind === "srt" ? srt : { host: route.host, port: route.port }),
      allowHalfOpen: true,
    });
    opened.on("drain", () => client.resume());
    opened.on("error", broken);
    // Each direction ends on its own (both sockets half-open): a client
    // that shuts its side after its request still reads the whole answer,
    // and the last bytes (srt's 403 before it closes) are flushed first.
    opened.pipe(client);
    upstream = opened;
    routed = key;
    return opened;
  };

  const refuse = (status: string, why?: string): void => {
    refused = true;
    upstream?.destroy();
    client.end(refusal(status, why));
  };

  const send = (to: Socket, bytes: Buffer): void => {
    if (bytes.length > 0 && !to.write(bytes)) {
      client.pause();
    }
  };

  /** A CONNECT to one of the hub's preview origins: answered here once its socket is open, or refused naming why. */
  const tunnelToHub = (to: Socket, host: string, port: number): void => {
    to.off("error", broken);
    to.once("error", (error: NodeJS.ErrnoException) => {
      if (to.connecting) {
        refuse(
          "502 Bad Gateway",
          `the hub's preview at ${host}:${port} did not answer from this machine (${error.code ?? error.message})`
        );
        return;
      }
      broken();
    });
    to.once("connect", () => {
      to.on("error", broken);
      client.write(ESTABLISHED);
    });
  };

  /** A request's head, routed: the next phase, or false to wait for more. */
  const head = (): boolean => {
    const end = pending.indexOf(HEAD_END);
    if (end < 0) {
      if (pending.length > MAX_HEAD) {
        refuse("431 Request Header Fields Too Large");
      }
      return false;
    }
    const lines = linesOf(pending.subarray(0, end + 4));
    const next = afterHead(lines);
    if (!next) {
      refuse("400 Bad Request");
      return false;
    }
    pending = pending.subarray(end + 4);
    const target = targetOf(lines);
    const origins = previews();
    if (target && origins && isHubPreview(origins, target.host, target.port)) {
      // A tunnel is a connection of its own: never one a plain request used.
      if (target.connect) {
        routed = "";
      }
      const to = upstreamFor({
        kind: "hub",
        host: target.host,
        port: target.port,
      });
      if (target.connect) {
        tunnelToHub(to, target.host, target.port);
      } else {
        send(to, originHead(lines, target.path));
      }
    } else {
      send(upstreamFor({ kind: "srt" }), withCredential(lines, authorization));
    }
    phase = next;
    return true;
  };

  /** What follows a head, passed to the upstream it went to: false to wait for more. */
  const body = (): boolean => {
    const step = stepOf(phase as Exclude<Phase, { kind: "head" }>, pending);
    if ("wait" in step) {
      return false;
    }
    if ("refuse" in step) {
      refuse(step.refuse);
      return false;
    }
    if (upstream) {
      send(upstream, step.out);
    }
    ({ rest: pending, phase } = step);
    return true;
  };

  /** Takes what `pending` holds as far as the phase lets it go. */
  const take = (): void => {
    while (!refused && (phase.kind === "head" ? head() : body())) {
      // Each step moved `pending` on: read the next.
    }
  };

  client.on("data", (chunk: Buffer) => {
    if (refused) {
      return;
    }
    pending = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk;
    take();
  });
  client.on("end", () => {
    if (!refused) {
      upstream?.end();
    }
  });
  client.on("error", broken);
};

/**
 * The relay's host half: listening on unix socket `socket` (owner-only, a
 * stale one replaced), each connection relayed to srt's proxy at `upstream`
 * with `credential` (`user:token`) on every request, but a request for one
 * of the hub's preview origins, which the file at `previews` names (agent
 * hub-previews.ts), dialed from here.
 */
export const startProxyRelay = async (options: {
  credential: string;
  previews?: string;
  socket: string;
  upstream: { host: string; port: number };
}): Promise<Server> => {
  const authorization = `Basic ${Buffer.from(options.credential).toString("base64")}`;
  const previews = previewOriginsAt(options.previews);
  rmSync(options.socket, { force: true });
  const server = createServer({ allowHalfOpen: true }, (client) =>
    relayOne(client, options.upstream, authorization, previews)
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.socket, () => {
      server.off("error", reject);
      resolve();
    });
  });
  chmodSync(options.socket, 0o600);
  return server;
};
