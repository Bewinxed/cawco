/**
 * A port's door on one tailnet address (hub tailnet-https.ts): the first
 * byte of each connection says what it is. A TLS handshake record (0x16)
 * goes on byte for byte to the port's TLS listener on loopback, so TLS,
 * ALPN, streaming answers and WebSocket upgrades are that listener's own,
 * end to end. Anything else is read as an HTTP request and answered, once
 * its head is whole, with a 308 to the same port and path on the tailnet
 * name: nginx's 497 "a regular request has been sent to the HTTPS port",
 * redirected "after the request is fully parsed"
 * (nginx.org/en/docs/http/ngx_http_ssl_module.html#errors). No content is
 * ever served over plain http on a tailnet address.
 *
 * Bun.serve takes no connection it did not accept itself ("Bun.serve has no
 * way to adopt an existing listening descriptor", oven-sh/bun#33578), and
 * httpolyglot's way (node:http's `server.emit("connection", socket)`) is
 * node's servers', not Bun.serve's: so the door carries the bytes.
 */
import type { Socket, TCPSocketListener, TCPSocketListenOptions } from "bun";

/** The first byte of a TLS record that carries a handshake (RFC 8446 §5.1 `ContentType.handshake`). */
const TLS_HANDSHAKE = 0x16;
/** The longest request head the door reads before it answers 431. Our choice: the redirect needs the request line alone. */
const HEAD_MAX = 16 * 1024;
/** How long a connection may take to say what it is, and a plain request its head. Our choice. */
const SNIFF_S = 30;
const HEAD_END = "\r\n\r\n";
const LOOPBACK = "127.0.0.1";

/** One connection's end of the pipe: what is queued for each side while it can't take more. */
interface Pipe {
  client: Socket<Door>;
  /** The client's side is gone: the upstream ends once it has taken what was queued. */
  clientDone: boolean;
  toClient: Uint8Array[];
  toUpstream: Uint8Array[];
  upstream?: Socket<Pipe>;
  /** The upstream's side is gone: the client ends once it has taken what was queued. */
  upstreamDone: boolean;
}

/** A connection at the door: still saying what it is, a plain request being read, or a pipe. */
type Door =
  | { stage: "sniff" }
  | { stage: "plain"; head: string }
  | { stage: "pipe"; pipe: Pipe };

/**
 * `chunk` written to `to` now, or what it didn't take queued behind what
 * waits: false when anything waits, so the side it came from pauses.
 */
const send = (
  to: Socket<unknown> | undefined,
  queue: Uint8Array[],
  chunk: Uint8Array
): boolean => {
  if (to && queue.length === 0) {
    const written = Math.max(to.write(chunk), 0);
    if (written === chunk.length) {
      return true;
    }
    queue.push(chunk.slice(written));
    return false;
  }
  queue.push(chunk.slice());
  return false;
};

/** What waits for `to` written while it takes it: true once nothing waits. */
const flush = (to: Socket<unknown>, queue: Uint8Array[]): boolean => {
  while (queue.length > 0) {
    const chunk = queue[0] as Uint8Array;
    const written = Math.max(to.write(chunk), 0);
    if (written < chunk.length) {
      queue[0] = chunk.subarray(written);
      return false;
    }
    queue.shift();
  }
  return true;
};

/**
 * The path and query a request line asks for, as the redirect carries it:
 * the origin form as it came, an absolute form's own, `/` for anything else
 * (`*`, an authority). Null when the line isn't an HTTP request.
 */
const targetOf = (line: string): string | null => {
  const [method, target, version, ...rest] = line.split(" ");
  if (!(method && target && version?.startsWith("HTTP/")) || rest.length > 0) {
    return null;
  }
  if (target.startsWith("/")) {
    return target;
  }
  try {
    const url = new URL(target);
    return `${url.pathname}${url.search}`;
  } catch {
    return "/";
  }
};

/** A plain answer that closes the connection. */
const answer = (status: string, headers: string[] = []): string =>
  [
    `HTTP/1.1 ${status}`,
    ...headers,
    "Content-Length: 0",
    "Connection: close",
    "",
    "",
  ].join("\r\n");

/** The connection's pipe to the TLS listener at `port` on loopback, with `first` its first bytes. */
const pipeTo = (client: Socket<Door>, port: number, first: Uint8Array) => {
  const pipe: Pipe = {
    client,
    clientDone: false,
    toClient: [],
    toUpstream: [first.slice()],
    upstreamDone: false,
  };
  client.data = { stage: "pipe", pipe };
  client.timeout(0);
  // Nothing more is read from the client until the upstream can take it.
  client.pause();
  Bun.connect<Pipe>({
    hostname: LOOPBACK,
    port,
    data: pipe,
    socket: {
      open(upstream) {
        pipe.upstream = upstream;
        if (pipe.clientDone && pipe.toUpstream.length === 0) {
          upstream.end();
          return;
        }
        if (flush(upstream, pipe.toUpstream)) {
          if (pipe.clientDone) {
            upstream.end();
          } else {
            client.resume();
          }
        }
      },
      data(upstream, chunk) {
        if (!send(client, pipe.toClient, chunk)) {
          upstream.pause();
        }
      },
      drain(upstream) {
        if (flush(upstream, pipe.toUpstream)) {
          if (pipe.clientDone) {
            upstream.end();
          } else {
            client.resume();
          }
        }
      },
      close() {
        pipe.upstreamDone = true;
        if (pipe.toClient.length === 0) {
          client.end();
        }
      },
      connectError() {
        pipe.upstreamDone = true;
        client.end();
      },
      error() {
        // Its close follows.
      },
    },
  }).catch(() => {
    // connectError answered it.
  });
};

/** One request head read so far: the 308 once it is whole, 400 or 431 when it can't be one. */
const readPlain = (
  client: Socket<Door>,
  head: string,
  location: (target: string) => string
): void => {
  const end = head.indexOf(HEAD_END);
  if (end < 0) {
    if (head.length > HEAD_MAX) {
      client.end(answer("431 Request Header Fields Too Large"));
      return;
    }
    client.data = { stage: "plain", head };
    return;
  }
  const target = targetOf(head.slice(0, head.indexOf("\r\n")));
  client.end(
    target === null
      ? answer("400 Bad Request")
      : answer("308 Permanent Redirect", [
          `Location: ${location(target)}`,
          // The tailnet address answers plain http again once HTTPS stops:
          // no browser may keep this redirect past it.
          "Cache-Control: no-store",
        ])
  );
};

export interface TailnetDoor {
  stop: (closeActiveConnections?: boolean) => Promise<void>;
}

/**
 * The door on `hostname:port` (a tailnet address, beside the port's
 * wildcard plain listener, both SO_REUSEPORT: Linux gives a connection to
 * the address-bound one): TLS on to `tlsPort` on loopback, plain http
 * redirected to `https://<name>:<port>`. Throws as `Bun.listen` does,
 * EADDRINUSE when the port can't be shared.
 */
export const openTailnetDoor = ({
  hostname,
  name,
  port,
  tlsPort,
}: {
  hostname: string;
  name: string;
  port: number;
  tlsPort: number;
}): TailnetDoor => {
  const location = (target: string): string =>
    `https://${name}:${port}${target}`;
  // Bun.listen takes `reusePort` as Bun.serve does (measured: two listeners
  // on one address and port beside a wildcard one); its type doesn't name it.
  const options: TCPSocketListenOptions<Door> & { reusePort: boolean } = {
    hostname,
    port,
    reusePort: true,
    data: { stage: "sniff" },
    socket: {
      open(client) {
        client.data = { stage: "sniff" };
        client.timeout(SNIFF_S);
      },
      data(client, chunk) {
        const at = client.data;
        if (at.stage === "pipe") {
          if (!send(at.pipe.upstream, at.pipe.toUpstream, chunk)) {
            client.pause();
          }
          return;
        }
        if (at.stage === "sniff" && chunk[0] === TLS_HANDSHAKE) {
          pipeTo(client, tlsPort, chunk);
          return;
        }
        readPlain(
          client,
          `${at.stage === "plain" ? at.head : ""}${chunk.toString("latin1")}`,
          location
        );
      },
      drain(client) {
        const at = client.data;
        if (at.stage !== "pipe" || !flush(client, at.pipe.toClient)) {
          return;
        }
        if (at.pipe.upstreamDone) {
          client.end();
        } else {
          at.pipe.upstream?.resume();
        }
      },
      close(client) {
        const at = client.data;
        if (at.stage !== "pipe") {
          return;
        }
        at.pipe.clientDone = true;
        if (at.pipe.toUpstream.length === 0) {
          at.pipe.upstream?.end();
        }
      },
      timeout(client) {
        // A connection that never said what it was, or a head never finished.
        client.end();
      },
      error() {
        // Its close follows.
      },
    },
  };
  const listener: TCPSocketListener<Door> = Bun.listen(options);
  return {
    stop: (closeActiveConnections = false) => {
      listener.stop(closeActiveConnections);
      return Promise.resolve();
    },
  };
};
