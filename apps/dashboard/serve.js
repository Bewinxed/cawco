/**
 * The dashboard's PRODUCTION server.
 *
 * `adapter-node`'s own `build/index.js` serves the app and nothing else, and the
 * app is not the whole story: the browser opens `/ws/dashboard` against the
 * origin that served it, expecting that origin to carry the socket through to
 * the hub. In dev that was `hubWsProxy()` in vite.config.ts — a dev-server
 * plugin, which is exactly why it stopped existing the moment the units began
 * running the build. REST kept working (it is a real SvelteKit route,
 * `routes/api/[...path]`), so the board still loaded while never once
 * connecting: "no hub connected", against a hub that was up the whole time.
 *
 * The relay is done on the RAW SOCKET rather than through `http.request`: after
 * the handshake a websocket proxy is only bytes in both directions, so the
 * request line and headers are re-issued verbatim over a plain TCP connection
 * and the hub's own 101 passes straight back.
 *
 * It runs under node and serves only on the listening socket its service
 * manager hands it — `cawco-dashboard.socket` under systemd, the `Sockets`
 * entry of the LaunchAgent under launchd (packages/cli/src/service.ts). The
 * manager holds that socket across a restart of this process, so a page load
 * that lands while a deploy restarts the dashboard waits in the listen backlog
 * for the new process instead of being refused. It never binds the port
 * itself; started any other way, `collect` throws and it exits.
 *
 * Preview routing: `/preview/<id>/…` is forwarded to the hub's preview
 * listener. Requests whose path does NOT start with `/preview/<id>/` but whose
 * `Referer` does (root-absolute fetches from inside the iframe — `/assets/x.js`,
 * `/@vite/client`, `/src/App.svelte?t=…`) belong to the preview too. A Referer
 * names the preview for one hop only: a module served at its root-absolute URL
 * sends that URL as the Referer of its own imports, and the prefix is gone. So
 * a Referer-routed GET or HEAD gets a 302 back under the prefix, and every URL
 * the iframe holds carries it; any other method is forwarded where it stands.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sockets from "socket-activation";

/**
 * adapter-node needs the browser's scheme and host for SvelteKit's CSRF check,
 * including mutating requests with no body (preview Close and other deletes).
 * Direct access is plain HTTP; a TLS-terminating proxy forwards the browser's
 * scheme and may forward its host separately. publicOrigin reads Forwarded,
 * then X-Forwarded-* and defaults to http and Host for direct requests. The
 * adapter reads these header names once when its handler loads. Trusting them
 * preserves CSRF protection: a cross-site browser form cannot set Forwarded or
 * X-Forwarded-* headers, and its Origin still differs from the dashboard's origin.
 */
const PROTOCOL_HEADER = "x-cawco-protocol";
const HOST_HEADER = "x-cawco-host";
process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;
process.env.HOST_HEADER = HOST_HEADER;
const { handler } = await import("./build/handler.js");
// Captured once: version.json on disk changes during a build before this process restarts.
const runningVersion = readFileSync(
  new URL("./build/client/_app/version.json", import.meta.url),
  "utf8"
);

const target = new URL(process.env.CAWCO_HUB_URL || "http://localhost:3456");
const targetPort = Number(target.port || 80);
const previewPort = Number(process.env.CAWCO_PREVIEW_PORT || targetPort + 1);

// RFC 7239 permits quoted values and case-insensitive parameter names. Commas
// inside quoted extension values belong to the first element, not the next hop.
const FIRST_FORWARDED_ELEMENT = /^(?:[^",]|"(?:\\.|[^"\\])*")*/;
const FORWARDED_PARAMETER =
  /(?:^|;)\s*([!#$%&'*+.^_`|~0-9a-z-]+)\s*=\s*("(?:\\.|[^"\\])*"|[^;\s]+)\s*(?=;|$)/gi;
const QUOTED_PAIR = /\\(.)/g;

function publicOrigin(req) {
  const first =
    req.headers.forwarded?.match(FIRST_FORWARDED_ELEMENT)?.[0] ?? "";
  const forwarded = new Map(
    [...first.matchAll(FORWARDED_PARAMETER)].map(([, name, value]) => [
      name.toLowerCase(),
      value.startsWith('"')
        ? value.slice(1, -1).replace(QUOTED_PAIR, "$1")
        : value,
    ])
  );
  const protocol = (
    forwarded.get("proto") ??
    req.headers["x-forwarded-proto"]?.split(",")[0] ??
    "http"
  )
    .trim()
    .toLowerCase();
  const host =
    forwarded.get("host") ?? req.headers["x-forwarded-host"]?.split(",")[0];
  return {
    protocol: protocol === "https" || protocol === "http" ? protocol : "http",
    host: host?.trim() || req.headers.host,
  };
}

const PREVIEW_PREFIX = /^\/preview\/([^/]+)\//;
/**
 * Extract preview instance id from a path or Referer. Returns
 * `{ id, stripped }` where `stripped` is the path with the prefix removed
 * (for path-matched requests) or the original path (for Referer-matched).
 * Returns null if no match.
 */
function previewMatch(req) {
  const match = req.url?.match(PREVIEW_PREFIX);
  if (match) {
    const id = decodeURIComponent(match[1]);
    const stripped = req.url.slice(match[0].length - 1); // keep leading /
    return { id, stripped, viaReferer: false };
  }
  const { referer } = req.headers;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refMatch = refUrl.pathname.match(PREVIEW_PREFIX);
      if (refMatch) {
        const id = decodeURIComponent(refMatch[1]);
        return { id, stripped: req.url, viaReferer: true };
      }
    } catch {
      // malformed referer — not a preview request
    }
  }
  return null;
}

function proxyPreviewHttp(req, res, info) {
  // A Referer-routed read gets a 302 back under the prefix, so the URL the
  // browser holds for it carries the prefix and so does the Referer of
  // whatever it loads in turn. Where it points depends on the Referer, so it
  // is never stored: a CDN keeping it would send one preview's file to
  // another's.
  if (info.viaReferer && (req.method === "GET" || req.method === "HEAD")) {
    const prefix = `/preview/${encodeURIComponent(info.id)}`;
    res.writeHead(302, {
      location: `${prefix}${req.url}`,
      "cache-control": "no-store",
    });
    res.end();
    return;
  }
  const options = {
    hostname: target.hostname,
    port: previewPort,
    path: info.stripped,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${target.hostname}:${previewPort}`,
      "x-cawco-preview": info.id,
    },
  };
  const prefix = `/preview/${encodeURIComponent(info.id)}`;
  const proxyReq = http.request(options, (proxyRes) => {
    // A root-absolute Location must stay under the prefix so the browser
    // does not leave /preview/<id>/ on a redirect.
    const { location } = proxyRes.headers;
    if (location?.startsWith("/") && !location.startsWith(prefix)) {
      proxyRes.headers.location = `${prefix}${location}`;
    }
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on("error", (error) => {
    console.warn(
      `[cawco] preview proxy error for ${info.id}: ${error.code ?? error.message}`
    );
    if (!res.headersSent) {
      res.writeHead(502);
    }
    res.end();
  });
  req.pipe(proxyReq);
}

/**
 * A deploy swaps a new `build/` in under this running process, and the old
 * hashed assets go with the old directory. adapter-node's sirv listed its files
 * once at startup, so it still claims them: `send()` writes a 200 head and then
 * pipes `fs.createReadStream(file)` into the response with no `'error'`
 * listener, and the ENOENT from `open()` becomes an unhandled error that exits
 * the process. A hashed asset that is no longer on disk is answered with a 404
 * before sirv sees it; the listener on the piped stream covers the file that
 * disappears between that check and sirv's open, where the 200 head is already
 * committed and the response can only be cut off.
 */
const CLIENT_DIR = fileURLToPath(new URL("./build/client", import.meta.url));
const IMMUTABLE_PREFIX = "/_app/immutable/";

/**
 * The Content-Type of what {@link serveFresh} answers: build/client's files
 * outside `_app/immutable/`, which today is `_app/version.json` and whatever a
 * `static/` directory would add. Anything else goes out as bytes.
 */
const TYPES = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

const ACCEPTS_BROTLI = /(br|brotli)/i;

/**
 * sirv also cached the SIZE of every non-hashed file (version.json, favicon,
 * manifest…) at startup, so between a deploy's swap and the restart it answers
 * with the old Content-Length over the new bytes. Those files are served here
 * from a stat taken on each request, with the headers sirv gave them. Returns
 * false when the path is not a file under build/client, leaving it to handler.
 */
function serveFresh(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const abs = resolve(CLIENT_DIR, `.${decoded}`);
  if (!abs.startsWith(CLIENT_DIR + sep)) {
    return false;
  }
  let stats;
  try {
    stats = statSync(abs);
  } catch {
    return false;
  }
  if (!stats.isFile()) {
    return false;
  }
  // Like sirv: the precompressed sibling wins when the client accepts it.
  const type = TYPES[extname(abs)] ?? "application/octet-stream";
  const accept = req.headers["accept-encoding"] ?? "";
  let file = abs;
  let encoding;
  for (const [ext, name, ok] of [
    [".br", "br", ACCEPTS_BROTLI.test(accept)],
    [".gz", "gzip", accept.includes("gzip")],
  ]) {
    if (!ok) {
      continue;
    }
    try {
      const variant = statSync(abs + ext);
      if (variant.isFile()) {
        file = abs + ext;
        stats = variant;
        encoding = name;
        break;
      }
    } catch {
      // no precompressed copy of this file
    }
  }
  const etag = `W/"${stats.size}-${stats.mtime.getTime()}"`;
  const headers = {
    Vary: "Accept-Encoding",
    "Content-Type": type,
    "Last-Modified": stats.mtime.toUTCString(),
    ETag: etag,
  };
  if (encoding) {
    headers["Content-Encoding"] = encoding;
  }
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers);
    res.end();
    return true;
  }
  headers["Content-Length"] = stats.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") {
    res.end();
    return true;
  }
  createReadStream(file, { end: stats.size - 1 })
    .on("error", () => res.destroy())
    .pipe(res);
  return true;
}

function serveApp(req, res) {
  const [pathname] = req.url.split("?");
  if (pathname === "/_app/running-version.json") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(runningVersion);
    return;
  }
  if (
    pathname.startsWith(IMMUTABLE_PREFIX) &&
    !existsSync(`${CLIENT_DIR}${pathname}`)
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  if (
    (req.method === "GET" || req.method === "HEAD") &&
    !pathname.startsWith(IMMUTABLE_PREFIX) &&
    serveFresh(req, res, pathname)
  ) {
    return;
  }
  // sirv has no type for Caw's .riv files and would send an empty
  // Content-Type; it keeps one already set on the response.
  if (pathname.endsWith(".riv")) {
    res.setHeader("Content-Type", "application/octet-stream");
  }
  res.on("pipe", (source) => {
    source.on("error", (error) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
      console.warn(`[cawco] static file gone mid-request: ${error.path}`);
      res.destroy();
    });
  });
  handler(req, res);
}

const server = http.createServer((req, res) => {
  const origin = publicOrigin(req);
  req.headers[PROTOCOL_HEADER] = origin.protocol;
  req.headers[HOST_HEADER] = origin.host;
  const info = previewMatch(req);
  if (info) {
    proxyPreviewHttp(req, res, info);
    return;
  }
  serveApp(req, res);
});

/** Every upgraded socket this process is relaying, so a stop can hang them up. */
const relayed = new Set();

server.on("upgrade", (req, socket, head) => {
  relayed.add(socket);
  socket.on("close", () => relayed.delete(socket));
  // `http.Server` drops a socket's error handling the moment it emits
  // `upgrade`, so an upgrade nobody claims is left with no `error` listener and
  // the eventual reset becomes a process-level throw — taking the server, and
  // every other dashboard socket, down with it.
  socket.on("error", (error) => {
    console.warn(
      `[cawco] websocket socket error on ${req.url}: ${error.code ?? error.message}`
    );
  });
  // Preview WebSocket: /preview/<id>/…
  const info = previewMatch(req);
  if (info) {
    const upstream = net.connect(previewPort, target.hostname, () => {
      const lines = [`${req.method} ${info.stripped} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const lower = req.rawHeaders[i].toLowerCase();
        if (lower === "host") {
          continue;
        }
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      lines.push(`Host: ${target.hostname}:${previewPort}`);
      lines.push(`X-Cawco-Preview: ${info.id}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) {
        upstream.write(head);
      }
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", (error) => {
      console.warn(
        `[cawco] preview ws proxy error for ${info.id}: ${error.code ?? error.message}`
      );
      socket.destroy();
    });
    socket.on("close", () => upstream.destroy());
    upstream.on("close", () => socket.destroy());
    return;
  }

  if (!req.url?.startsWith("/ws")) {
    return socket.destroy();
  }

  const upstream = net.connect(targetPort, target.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      // The hub is the one being addressed now, so it gets its own Host; every
      // other header (the websocket key above all) is the browser's and is
      // forwarded untouched, because the hub's 101 is computed from it.
      if (req.rawHeaders[i].toLowerCase() === "host") {
        continue;
      }
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    lines.push(`Host: ${target.host}`);
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head?.length) {
      upstream.write(head);
    }
    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", (error) => {
    console.warn(
      `[cawco] hub ws proxy could not reach ${target.host}: ${error.code ?? error.message}`
    );
    socket.destroy();
  });
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
});

// One socket: the unit and the plist each name a single address for it.
const [fd] = sockets.collect("dashboard");
server.listen({ fd }, () => {
  console.log(`dashboard on inherited fd ${fd} — /ws -> ${target.origin}`);
});

/**
 * How long a request already being answered gets to finish once a restart has
 * asked this process to stop. The restart waits on it: the next process only
 * starts once this one has exited, and page loads queue on the socket until
 * then.
 */
const DRAIN_MS = 5000;

/**
 * A restart stops this process with SIGTERM, and node's default is to exit on
 * the spot — cutting off a request it had already accepted from the socket
 * ("Connection terminated unexpectedly" on a page load that landed just before
 * the restart). Instead it stops accepting, which leaves the listening socket
 * itself open in the service manager's hands for the next process, hangs up
 * idle keep-alive connections so their next request goes to that process,
 * drops the websockets it relays (the board reconnects on its own), and exits
 * once the requests in flight are answered.
 */
process.once("SIGTERM", () => {
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  for (const socket of relayed) {
    socket.destroy();
  }
  setTimeout(() => process.exit(0), DRAIN_MS).unref();
});
