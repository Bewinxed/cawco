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
 * Previews are never served here: each is an origin of its own, the hub's
 * preview listener's, so a previewed app shares nothing of the dashboard's.
 * The `/ws` relay passes only this dashboard's own pages through (the gate
 * core `browser-gate.ts` keeps, written out below for node).
 */
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import http from "node:http";
import net from "node:net";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sockets from "socket-activation";
import { publicOrigin } from "./public-origin.js";

const standalone = typeof Bun !== "undefined" && Bun.isStandaloneExecutable;
const resources = standalone ? await import("@cawco/core/runtime") : undefined;
const relayRuntime = standalone
  ? await import("./inherited-relay.js")
  : undefined;

/**
 * adapter-node needs the browser's scheme and host for SvelteKit's CSRF check,
 * including mutating requests with no body (preview Close and other deletes),
 * and for the hooks gate's `event.url.origin`: the request's
 * {@link publicOrigin}, stamped on these headers. The adapter reads their
 * names once when its handler loads.
 */
const PROTOCOL_HEADER = "x-cawco-protocol";
const HOST_HEADER = "x-cawco-host";
process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;
process.env.HOST_HEADER = HOST_HEADER;
if (standalone && !process.env.ADDRESS_HEADER) {
  process.env.ADDRESS_HEADER = "x-cawco-peer-address";
}
// A file the reader attaches goes to the hub through `/api/files`, up to the
// hub's own 100 MB (media.ts `FILE_LIMIT_BYTES`), which answers a larger one
// itself; the adapter's 512K default refused any file past it here first.
process.env.BODY_SIZE_LIMIT = "101M";
const { handler } = await import("./build/handler.js");
// Captured once: version.json on disk changes during a build before this process restarts.
const runningVersion = readFileSync(
  standalone
    ? `${resources.materializeTree("dashboard/client")}/_app/version.json`
    : new URL("./build/client/_app/version.json", import.meta.url),
  "utf8"
);

const target = new URL(process.env.CAWCO_HUB_URL || "http://localhost:3456");
const targetPort = Number(target.port || 80);

/**
 * Why a socket to the hub is refused, or null: core `browser-gate.ts`
 * `crossSiteRefusal`, for a WebSocket handshake (never a navigation), against
 * `own`, the request's {@link publicOrigin}. A page of another origin, a
 * previewed app on its own port of this host above all, may not open the
 * dashboard's socket with the browser's cookies.
 */
function crossSiteRefusal(req, own) {
  const site = req.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "none") {
    return `a ${site} request`;
  }
  const { origin } = req.headers;
  if (origin && origin !== own) {
    return `a request from ${origin}`;
  }
  return null;
}

/**
 * What the relay tells the hub the page's origin was, once the gate passed it
 * (core `PAGE_ORIGIN_HEADER`): the request's {@link publicOrigin}, which the
 * gate just found the page's `Origin` to be. Only a socket that carries an
 * `Origin` came from a page: one with none passed the gate as a client that
 * is no browser, and what its forwarded headers say vouches for no page.
 */
const PAGE_ORIGIN_HEADER = "x-cawco-page-origin";

/** What a relay that passed the gate leaves out: the hub behind it is not the page's origin (core `BROWSER_HEADERS`). */
const BROWSER_HEADERS = new Set([
  "origin",
  "sec-fetch-site",
  "sec-fetch-mode",
  "sec-fetch-dest",
  "sec-fetch-user",
]);

/**
 * A deploy swaps a new `build/` in under this running process, and the old
 * hashed assets go with the old directory. adapter-node's sirv listed its files
 * once at startup, so it still claims them: `send()` writes a 200 head and then
 * pipes `fs.createReadStream(file)` into the response with no `'error'`
 * listener, and the ENOENT from `open()` becomes an unhandled error that exits
 * the process. A hashed asset that is no longer in this build is answered
 * before sirv sees it: from an earlier build's tree (`earlier`) when one
 * holds it, else with a 404; the listener on the piped stream covers the file that
 * disappears between that check and sirv's open, where the 200 head is already
 * committed and the response can only be cut off.
 */
const CLIENT_DIR = standalone
  ? resources.materializeTree("dashboard/client")
  : fileURLToPath(new URL("./build/client", import.meta.url));
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
 * The client trees of earlier builds still on disk, newest first: every
 * earlier release's under the runtime directory (nothing prunes them), or in
 * a checkout the one build the last publish replaced (`.build-old`,
 * scripts/publish-build.ts). A page from an earlier build asks for that
 * build's hashed assets: an open tab loading a chunk or stylesheet late, a
 * page restored from the browser's cache. Answered with a 404 they leave it
 * half loaded; a stylesheet that 404s left the update notice unstyled. A
 * hashed name is its content, so a file found under that name in any of
 * them is the file the page asked for.
 *
 * Listed on each miss, never once at startup. In a checkout the publish
 * swaps `build/` under this running process, which still renders its own
 * build's pages until the restart: a page loaded in that window names the
 * hashes now in `.build-old`, which did not exist when this process started.
 * A miss is rare (a page from another build), so the listing costs nothing
 * on the ordinary path.
 */
const OLD_CHECKOUT = fileURLToPath(
  new URL("./.build-old/client", import.meta.url)
);
function earlier() {
  if (!standalone) {
    return existsSync(OLD_CHECKOUT) ? [OLD_CHECKOUT] : [];
  }
  // <runtime>/<release>/dashboard/client
  const releases = resolve(CLIENT_DIR, "..", "..", "..");
  return readdirSync(releases)
    .map((release) => join(releases, release, "dashboard", "client"))
    .filter((client) => client !== CLIENT_DIR && existsSync(client))
    .map((client) => ({ client, at: statSync(client).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .map(({ client }) => client);
}

/** What a hashed asset is answered with, as sirv answers the current ones. */
const IMMUTABLE = { "Cache-Control": "public,max-age=31536000,immutable" };

/**
 * sirv also cached the SIZE of every non-hashed file (version.json, favicon,
 * manifest…) at startup, so between a deploy's swap and the restart it answers
 * with the old Content-Length over the new bytes. Those files are served here
 * from a stat taken on each request, with the headers sirv gave them; so are
 * an earlier build's hashed assets, from its own tree (`earlier`). Returns
 * false when the path is not a file under `root`, leaving it to the caller.
 */
function serveFile(req, res, pathname, root = CLIENT_DIR, extra = {}) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return false;
  }
  const abs = resolve(root, `.${decoded}`);
  if (!abs.startsWith(root + sep)) {
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
    ...extra,
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
  const reading = req.method === "GET" || req.method === "HEAD";
  if (
    pathname.startsWith(IMMUTABLE_PREFIX) &&
    !existsSync(`${CLIENT_DIR}${pathname}`)
  ) {
    const found = earlier().find((root) => existsSync(`${root}${pathname}`));
    if (
      !(reading && found && serveFile(req, res, pathname, found, IMMUTABLE))
    ) {
      // Never stored: a cache in front (the Cloudflare tunnel keeps a 404 on
      // a .css path for minutes) would go on answering it after the file is
      // there, and the page that asked stays unstyled.
      res.writeHead(404, { "Cache-Control": "no-store" });
      res.end();
    }
    return;
  }
  if (
    reading &&
    !pathname.startsWith(IMMUTABLE_PREFIX) &&
    serveFile(req, res, pathname)
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
  if (standalone) {
    relayRuntime.applyRelayPeer(req);
  }
  const own = publicOrigin(req.headers);
  req.headers[PROTOCOL_HEADER] = own.protocol;
  req.headers[HOST_HEADER] = own.host;
  serveApp(req, res);
});

/** Every upgraded socket this process is relaying, so a stop can hang them up. */
const relayed = new Set();

server.on("upgrade", (req, socket, head) => {
  if (standalone) {
    relayRuntime.applyRelayPeer(req);
  }
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
  if (!req.url?.startsWith("/ws")) {
    return socket.destroy();
  }
  const own = publicOrigin(req.headers).origin;
  const refused = crossSiteRefusal(req, own);
  if (refused) {
    console.warn(`[cawco] refused ${refused} to open ${req.url}`);
    socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }

  const upstream = net.connect(targetPort, target.hostname, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      // The hub is the one being addressed now, so it gets its own Host, and
      // none of the page's origin, which this gate has read; every other
      // header (the websocket key above all) is the browser's and is
      // forwarded untouched, because the hub's 101 is computed from it.
      const name = req.rawHeaders[i].toLowerCase();
      if (
        name === "host" ||
        name === PAGE_ORIGIN_HEADER ||
        BROWSER_HEADERS.has(name)
      ) {
        continue;
      }
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    lines.push(`Host: ${target.host}`);
    // A page's socket: where the hub's dashboard is reached, and its
    // previews may be framed from.
    if (req.headers.origin) {
      lines.push(`${PAGE_ORIGIN_HEADER}: ${own}`);
    }
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
const ready = () => {
  console.log(`dashboard on inherited fd ${fd} — /ws -> ${target.origin}`);
};
const relay = standalone
  ? await relayRuntime.listenInherited(server, fd, ready)
  : undefined;
if (!standalone) {
  server.listen({ fd }, ready);
}

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
  relay?.stopAccepting();
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  for (const socket of relayed) {
    socket.destroy();
  }
  setTimeout(() => process.exit(0), DRAIN_MS).unref();
});
