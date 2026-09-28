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
 * The relay is done on the RAW SOCKET rather than through `http.request`. It
 * was written that way for bun 1.3.14, which could neither emit `'upgrade'` on
 * an outgoing request nor relay bytes back through an upgraded server socket
 * (oven-sh/bun#9911, #9882, #28396) — 1.4.0 fixes both, and this stayed because
 * after the handshake a websocket proxy is only bytes in both directions
 * anyway: the request line and headers are re-issued verbatim over a plain TCP
 * connection and the hub's own 101 passes straight back. Nothing here has to
 * agree with a runtime about what an upgrade is.
 *
 * Preview routing: `/preview/<id>/…` is forwarded to the hub's preview
 * listener. Requests whose path does NOT start with `/preview/<id>/` but whose
 * `Referer` does (root-absolute fetches from inside the iframe — `/assets/x.js`,
 * `/@vite/client`, `/src/App.svelte?t=…`) are also forwarded. A Referer-routed
 * request that is a navigation (`Sec-Fetch-Mode: navigate`) gets a 302 back
 * under the prefix so the iframe URL stays correct.
 */
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { handler } from "./build/handler.js";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const target = new URL(process.env.WHIFFLE_HUB_URL || "http://localhost:3456");
const targetPort = Number(target.port || 80);
const previewPort = Number(process.env.WHIFFLE_PREVIEW_PORT || targetPort + 1);

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
  // A Referer-routed navigation gets a 302 back under the prefix.
  if (
    info.viaReferer &&
    (req.headers["sec-fetch-mode"] === "navigate" ||
      req.headers["sec-fetch-dest"] === "document")
  ) {
    const prefix = `/preview/${encodeURIComponent(info.id)}`;
    res.writeHead(302, { location: `${prefix}${req.url}` });
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
      "x-whiffle-preview": info.id,
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
      `[whiffle] preview proxy error for ${info.id}: ${error.code ?? error.message}`
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

function serveApp(req, res) {
  const pathname = req.url.split("?")[0];
  if (
    pathname.startsWith(IMMUTABLE_PREFIX) &&
    !existsSync(`${CLIENT_DIR}${pathname}`)
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.on("pipe", (source) => {
    source.on("error", (error) => {
      if (error.code !== "ENOENT") {
        throw error;
      }
      console.warn(`[whiffle] static file gone mid-request: ${error.path}`);
      res.destroy();
    });
  });
  handler(req, res);
}

const server = http.createServer((req, res) => {
  const info = previewMatch(req);
  if (info) {
    proxyPreviewHttp(req, res, info);
    return;
  }
  serveApp(req, res);
});

server.on("upgrade", (req, socket, head) => {
  // `http.Server` drops a socket's error handling the moment it emits
  // `upgrade`, so an upgrade nobody claims is left with no `error` listener and
  // the eventual reset becomes a process-level throw — taking the server, and
  // every other dashboard socket, down with it.
  socket.on("error", (error) => {
    console.warn(
      `[whiffle] websocket socket error on ${req.url}: ${error.code ?? error.message}`
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
      lines.push(`X-Whiffle-Preview: ${info.id}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head?.length) {
        upstream.write(head);
      }
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", (error) => {
      console.warn(
        `[whiffle] preview ws proxy error for ${info.id}: ${error.code ?? error.message}`
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
      `[whiffle] hub ws proxy could not reach ${target.host}: ${error.code ?? error.message}`
    );
    socket.destroy();
  });
  socket.on("close", () => upstream.destroy());
  upstream.on("close", () => socket.destroy());
});

server.listen(PORT, HOST, () => {
  console.log(`dashboard on http://${HOST}:${PORT} — /ws -> ${target.origin}`);
});
