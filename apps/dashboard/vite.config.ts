import http from "node:http";
import path from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig, type Plugin } from "vite";

/**
 * Lookbehind, patched out of the dependencies that would compile it.
 *
 * Safari grew regex lookbehind in 16.4, and this dashboard is opened on an
 * iPad running iPadOS 15.6. A lookbehind reaching that engine is not a
 * degraded feature, it is a `SyntaxError: invalid group specifier name`
 * thrown while the module is still evaluating — so the chunk never finishes,
 * and whichever route imported it renders SvelteKit's "500 — Internal Error"
 * while the rest of the app carries on working. That is how this started:
 * one screen down, everything else fine.
 *
 * Each entry names the module it applies to and the exact text it swaps. The
 * build FAILS when a listed module contains neither the text to replace nor
 * the replacement — an upgrade that respells the code silently un-fixes the
 * iPad otherwise, and a build that stops is recoverable in a way a bug
 * reported three weeks later is not. A module already carrying the
 * replacement is fine and says nothing: bun can serve a previously patched
 * copy out of its cache, and failing on that stopped a deploy once already.
 */
const LOOKBEHIND_SHIMS = [
  {
    /**
     * marked feature-DETECTS lookbehind, and the bundler broke the detection
     * rather than the feature: it treats `new RegExp(...)` as pure, drops the
     * construction, and folds `!!<object>` to `true`, so the probe answers
     * "supported" on an engine that does not support it and marked takes the
     * lookbehind branch. oxc's minifier learned to keep these when a
     * `build.target` rules the pattern out (oxc#24712, and `build.target`
     * below is set for that reason among others), but the fold also happens
     * without the minifier — an unminified build shows `try { return true }
     * catch` too. Reading `.source` off the result is what survives: the
     * value is no longer a bare constructed object to reason away.
     */
    id: /[\\/]marked[\\/]lib[\\/]marked\.esm\.js$/,
    from: 'try{return!!new RegExp("(?<=1)(?<!1)")}catch{return!1}',
    to: 'try{return new RegExp("(?<=1)(?<!1)").source.length>0}catch{return!1}',
  },
  {
    /**
     * @pierre/diffs does not detect anything — it builds `/(?<=\n)/` at module
     * scope, so importing it is enough to throw, which is what took out the
     * Tools route. The regex exists to split a patch into lines that keep
     * their newline, and `split` asks the separator for `Symbol.split` before
     * treating it as a pattern, so an object answering that is a drop-in at
     * both call sites with no lookbehind anywhere. Checked against the
     * original on empty strings, bare and repeated newlines, CRLF, and a hunk
     * body: identical output on every one.
     */
    id: /[\\/]@pierre[\\/]diffs[\\/]dist[\\/](constants|worker-portable)\.js$/,
    from: "const SPLIT_WITH_NEWLINES = /(?<=\\n)/;",
    to:
      "const SPLIT_WITH_NEWLINES = { [Symbol.split](s) { const out = []; " +
      "let start = 0; for (let i = 0; i < s.length; i++) { if (s[i] === '\\n') " +
      "{ out.push(s.slice(start, i + 1)); start = i + 1; } } " +
      "if (start < s.length || out.length === 0) { out.push(s.slice(start)); } " +
      "return out; } };",
  },
];

const lookbehindShims = (): Plugin => {
  /** Per shim: modules that matched, and modules left in a safe shape. */
  let matched: number[] = [];
  let safe: number[] = [];
  return {
    name: "whiffle:lookbehind-shims",
    apply: "build",
    buildStart() {
      matched = LOOKBEHIND_SHIMS.map(() => 0);
      safe = LOOKBEHIND_SHIMS.map(() => 0);
    },
    transform(code, id) {
      let output = code;
      let touched = false;
      LOOKBEHIND_SHIMS.forEach((shim, i) => {
        if (!shim.id.test(id)) {
          return;
        }
        matched[i] += 1;
        if (output.includes(shim.to)) {
          safe[i] += 1;
          return;
        }
        if (!output.includes(shim.from)) {
          return;
        }
        safe[i] += 1;
        output = output.replaceAll(shim.from, shim.to);
        touched = true;
      });
      return touched ? { code: output, map: null } : null;
    },
    buildEnd() {
      LOOKBEHIND_SHIMS.forEach((shim, i) => {
        if (matched[i] > 0 && safe[i] === 0) {
          this.error(
            `whiffle:lookbehind-shims matched ${matched[i]} module(s) for ` +
              `${shim.id} and found neither\n\n  ${shim.from}\n\nnor\n\n  ` +
              `${shim.to}\n\nin any of them, so that dependency is no longer ` +
              "being patched. Read how it spells the lookbehind now and either " +
              "update this entry or delete it if the code is gone. Shipping " +
              "as-is breaks that route on Safari below 16.4 (iPadOS 15.6)."
          );
        }
      });
    },
  };
};

const PREVIEW_PREFIX = /^\/preview\/([^/]+)\//;

/**
 * Extract a preview instance id from a path or Referer header. Returns
 * `{ id, stripped, viaReferer }` or null.
 */
function previewMatch(req: http.IncomingMessage): {
  id: string;
  stripped: string;
  viaReferer: boolean;
} | null {
  const url = req.url ?? "";
  const match = url.match(PREVIEW_PREFIX);
  if (match) {
    return {
      id: decodeURIComponent(match[1]),
      stripped: url.slice(match[0].length - 1),
      viaReferer: false,
    };
  }
  const { referer } = req.headers;
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const refMatch = refUrl.pathname.match(PREVIEW_PREFIX);
      if (refMatch) {
        return {
          id: decodeURIComponent(refMatch[1]),
          stripped: url,
          viaReferer: true,
        };
      }
    } catch {
      // malformed referer
    }
  }
  return null;
}

const HUB_URL = new URL(process.env.WHIFFLE_HUB_URL || "http://localhost:3456");

/**
 * Proxies the dashboard's `/preview/` paths to the hub. The hub's `/ws` socket
 * goes through `server.proxy` below.
 *
 * Preview requests (`/preview/<id>/…` and Referer-routed root-absolute fetches)
 * are forwarded to the hub's preview listener on `WHIFFLE_PREVIEW_PORT`.
 *
 * Also the whole fix for a stray upgrade killing the dev server: `http.Server`
 * drops a socket's error handling the moment it emits `upgrade`, so an upgrade
 * no listener claims is left with no `error` handler and the eventual reset is a
 * process-level throw. Attaching an error listener to every upgrade socket keeps
 * that reset from taking the server (and every dashboard socket) down with it.
 */
const hubProxy = (): Plugin => ({
  name: "whiffle:hub-proxy",
  configureServer(server) {
    const hubPort = Number(HUB_URL.port || 80);
    const pvPort = Number(process.env.WHIFFLE_PREVIEW_PORT || hubPort + 1);

    // HTTP middleware: intercept preview requests before Vite/SvelteKit.
    server.middlewares.use((req, res, next) => {
      const info = previewMatch(req);
      if (!info) {
        return next();
      }
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
      const options: http.RequestOptions = {
        hostname: HUB_URL.hostname,
        port: pvPort,
        path: info.stripped,
        method: req.method,
        headers: {
          ...req.headers,
          host: `${HUB_URL.hostname}:${pvPort}`,
          "x-whiffle-preview": info.id,
        },
      };
      const pvPrefix = `/preview/${encodeURIComponent(info.id)}`;
      const proxyReq = http.request(options, (proxyRes) => {
        // A root-absolute Location must stay under the prefix so the browser
        // does not leave /preview/<id>/ on a redirect.
        const { location } = proxyRes.headers;
        if (
          typeof location === "string" &&
          location.startsWith("/") &&
          !location.startsWith(pvPrefix)
        ) {
          proxyRes.headers.location = `${pvPrefix}${location}`;
        }
        res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (error: NodeJS.ErrnoException) => {
        server.config.logger.warn(
          `[whiffle] preview proxy error for ${info.id}: ${error.code ?? error.message}`,
          { timestamp: true }
        );
        if (!res.headersSent) {
          res.writeHead(502);
        }
        res.end();
      });
      req.pipe(proxyReq);
    });

    server.httpServer?.on("upgrade", (req, socket, head) => {
      socket.on("error", (error: NodeJS.ErrnoException) => {
        server.config.logger.warn(
          `[whiffle] websocket socket error on ${req.url}: ${error.code ?? error.message}`,
          { timestamp: true }
        );
      });

      // Preview WebSocket: /preview/<id>/…
      const info = previewMatch(req);
      if (info) {
        const proxyReq = http.request({
          host: HUB_URL.hostname,
          port: pvPort,
          path: info.stripped,
          method: req.method,
          headers: {
            ...req.headers,
            host: `${HUB_URL.hostname}:${pvPort}`,
            "x-whiffle-preview": info.id,
          },
        });
        proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
          const lines = ["HTTP/1.1 101 Switching Protocols"];
          for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
            lines.push(
              `${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}`
            );
          }
          socket.write(`${lines.join("\r\n")}\r\n\r\n`);
          if (proxyHead?.length) {
            socket.write(proxyHead);
          }
          if (head?.length) {
            proxySocket.write(head);
          }
          proxySocket.pipe(socket).pipe(proxySocket);
          proxySocket.on("error", () => socket.destroy());
          socket.on("error", () => proxySocket.destroy());
        });
        proxyReq.on("error", (error: NodeJS.ErrnoException) => {
          server.config.logger.warn(
            `[whiffle] preview ws proxy error for ${info.id}: ${error.code ?? error.message}`,
            { timestamp: true }
          );
          socket.destroy();
        });
        proxyReq.end();
      }
      // `/ws` is left to `server.proxy`, and HMR's upgrade to Vite.
    });
  },
});

export default defineConfig({
  plugins: [
    lookbehindShims(),
    hubProxy(),
    tailwindcss(),
    sveltekit(),
    Icons({ compiler: "svelte" }),
  ],
  server: {
    port: 3000,
    host: true,
    // The dashboard is reached from the other machines on the tailnet, by name.
    // Vite refuses an unknown Host header with a 403, so the tailnet suffix is
    // named here; `.ts.net` covers this tailnet's MagicDNS names without
    // pinning the machine's own hostname into the repo.
    allowedHosts: [".ts.net", "localhost"],
    // The hub's live socket. REST /api is handled by SvelteKit's own route
    // (routes/api/[...path]).
    proxy: {
      "/ws": { target: HUB_URL.origin, ws: true },
    },
  },
  /**
   * The browsers this dashboard is actually opened in — an iPad on iPadOS 15.6
   * among them, which is why this is spelled out rather than left to default.
   *
   * Naming a target is not only about which syntax gets lowered. oxc's
   * minifier decides whether a `new RegExp(...)` is safe to delete by asking
   * whether every configured target can compile that pattern, and with no
   * target configured it assumes the newest engine and deletes it. That is not
   * a cosmetic difference: libraries feature-detect regex support by
   * constructing a pattern inside a try/catch, and deleting the construction
   * turns `try { return !!new RegExp("(?<=1)(?<!1)") } catch { return false }`
   * into `try { return true } catch { return false }` — a detector that always
   * answers yes. `marked` does exactly this for lookbehind, which Safari only
   * grew in 16.4, so the minified bundle took the lookbehind branch and threw
   * `SyntaxError: invalid group specifier name` while the markdown chunk was
   * evaluating. Only the transcript loads that chunk, so the whole app worked
   * on an iPad except the one screen, which rendered "500 — Internal Error".
   *
   * With the target named, the same minifier keeps every such probe intact,
   * for marked and for anything else that detects a feature this way. Do not
   * replace this with `esnext`, and do not drop it: either brings the bug back
   * for every dependency at once.
   */
  build: {
    target: ["safari15.6", "chrome107", "firefox104", "edge107"],
  },
  resolve: {
    alias: {
      $lib: path.resolve("./src/lib"),
    },
  },
  optimizeDeps: {
    exclude: ["@xyflow/svelte"],
  },
  ssr: {
    // Both ship raw .svelte sources; dev SSR must compile them, not require them.
    // These publish raw .svelte sources, which dev SSR must compile rather
    // than hand to Node — externalizing any of them ends in
    // ERR_UNKNOWN_FILE_EXTENSION on the first server-rendered request.
    noExternal: ["@xyflow/svelte", "virtua", "@hugeicons/svelte", "torph"],
  },
});
