import { execFileSync } from "node:child_process";
import http from "node:http";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig, type Plugin } from "vite";

const PREVIEW_PREFIX = /^\/preview\/([^/]+)\/[^/]+\//;

/**
 * Extract a preview instance id from a path or Referer header. Returns
 * `{ id, stripped, viaReferer }` or null.
 */
function previewMatch(req: http.IncomingMessage): {
  id: string;
  stripped: string;
  prefix: string;
  viaReferer: boolean;
} | null {
  const url = req.url ?? "";
  const match = url.match(PREVIEW_PREFIX);
  if (match) {
    return {
      id: decodeURIComponent(match[1]),
      stripped: url.slice(match[0].length - 1),
      prefix: match[0].slice(0, -1),
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
          prefix: refMatch[0].slice(0, -1),
          viaReferer: true,
        };
      }
    } catch {
      // malformed referer
    }
  }
  return null;
}

const HUB_URL = new URL(process.env.CAWCO_HUB_URL || "http://localhost:3456");

/**
 * The faces the first paint sets its text in: Figtree's and JetBrains
 * Mono's latin variable faces. The build inlines them into the stylesheet,
 * which the page waits for anyway, so the first frame is laid out in them.
 * Fetched by URL, a face that lands after the first paint re-sets every line
 * in it: with the font 600ms late, the phone board re-wrapped and moved 20px
 * (0.027 CLS), and no fallback face matches the UI face's widths. app.html
 * starts their decode before the body is parsed. Every other asset keeps
 * Vite's limit: the other subsets and Fredoka load by URL when a page uses
 * them.
 */
const INLINE_FACES =
  /\/(?:figtree-latin-wght-normal|jetbrains-mono-latin-wght-normal)\.woff2$/;

/**
 * Proxies the dashboard's `/preview/` paths to the hub. The hub's `/ws` socket
 * goes through `server.proxy` below.
 *
 * Preview requests (`/preview/<id>/…` and Referer-routed root-absolute fetches)
 * are forwarded to the hub's preview listener on `CAWCO_PREVIEW_PORT`.
 *
 * Also the whole fix for a stray upgrade killing the dev server: `http.Server`
 * drops a socket's error handling the moment it emits `upgrade`, so an upgrade
 * no listener claims is left with no `error` handler and the eventual reset is a
 * process-level throw. Attaching an error listener to every upgrade socket keeps
 * that reset from taking the server (and every dashboard socket) down with it.
 */
const hubProxy = (): Plugin => ({
  name: "cawco:hub-proxy",
  configureServer(server) {
    const hubPort = Number(HUB_URL.port || 80);
    const pvPort = Number(process.env.CAWCO_PREVIEW_PORT || hubPort + 1);

    // HTTP middleware: intercept preview requests before Vite/SvelteKit.
    server.middlewares.use((req, res, next) => {
      const info = previewMatch(req);
      if (!info) {
        return next();
      }
      // A Referer-routed read gets a 302 back under the prefix, so the URL
      // the browser holds for it carries the prefix and so does the Referer
      // of whatever it loads in turn, and it is never stored (serve.js,
      // Preview routing).
      if (info.viaReferer && (req.method === "GET" || req.method === "HEAD")) {
        const { prefix } = info;
        res.writeHead(302, {
          location: `${prefix}${req.url}`,
          "cache-control": "no-store",
        });
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
          "x-cawco-preview": info.id,
        },
      };
      const pvPrefix = info.prefix;
      const proxyReq = http.request(options, (proxyRes) => {
        // Includes upstream errors: no preview response or validator is reusable.
        proxyRes.headers["cache-control"] = "no-store";
        for (const name of ["etag", "last-modified", "expires"]) {
          delete proxyRes.headers[name];
        }
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
          `[cawco] preview proxy error for ${info.id}: ${error.code ?? error.message}`,
          { timestamp: true }
        );
        if (!res.headersSent) {
          res.writeHead(502, { "cache-control": "no-store" });
        }
        res.end();
      });
      req.pipe(proxyReq);
    });

    server.httpServer?.on("upgrade", (req, socket, head) => {
      socket.on("error", (error: NodeJS.ErrnoException) => {
        server.config.logger.warn(
          `[cawco] websocket socket error on ${req.url}: ${error.code ?? error.message}`,
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
            "x-cawco-preview": info.id,
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
            `[cawco] preview ws proxy error for ${info.id}: ${error.code ?? error.message}`,
            { timestamp: true }
          );
          socket.destroy();
        });
        proxyReq.end();
      }
    });
  },
});

// `/ws` is left to `server.proxy`, and HMR's upgrade to Vite.
export default defineConfig({
  plugins: [
    hubProxy(),
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      compilerOptions: { experimental: { async: true } },
      adapter: adapter({ out: ".build-next" }),
      experimental: { remoteFunctions: true },
      /* The commit this build was made from. The build serves it as
         `_app/version.json` and bakes it into the page, and `updated.check()`
         compares the two: that is how a tab learns it is older than the
         dashboard now serving it (deploy-toast.ts). It must be deterministic,
         or two builds of one commit would each tell open tabs to reload. */
      version: {
        name: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
          encoding: "utf8",
        }).trim(),
      },
    }),
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
   * The CSS floor, for the minifier. Vite's own default target predates
   * light-dark(), and Lightning CSS lowers what a target lacks: light-dark()
   * would become variables keyed on a `prefers-color-scheme` media query,
   * which ignores the app's theme class and breaks every relative colour
   * built on a token. These are the releases where the stylesheet's newest
   * features ship natively: @scope (Firefox 146) and a relative colour whose
   * origin is light-dark() or currentColor (Chrome 131, Safari 18). The JS
   * target stays Vite's default.
   */
  build: {
    cssTarget: ["chrome131", "edge131", "firefox146", "safari18", "ios18"],
    assetsInlineLimit: (file) => INLINE_FACES.test(file) || undefined,
  },
  optimizeDeps: {
    exclude: ["@xyflow/svelte"],
  },
  ssr: {
    // Both ship raw .svelte sources; dev SSR must compile them, not require them.
    // These publish raw .svelte sources, which dev SSR must compile rather
    // than hand to Node — externalizing any of them ends in
    // ERR_UNKNOWN_FILE_EXTENSION on the first server-rendered request.
    //
    // The two @atlaskit packages are here for the production server, which
    // runs under node: their subpaths (`…/combine`, `…/util/…`) are
    // directories holding their own package.json, and node's ESM resolver
    // refuses a directory import (ERR_UNSUPPORTED_DIR_IMPORT) where vite's
    // resolver follows it. Bundled, the server never resolves them at all.
    noExternal: [
      "tw-animate-css",
      "shadcn-svelte",
      "@fontsource-variable/figtree",
      "@fontsource-variable/jetbrains-mono",
      "@fontsource/fredoka",
      "@fontsource-variable/nunito",
      "@xyflow/svelte",
      "virtua",
      "@hugeicons/svelte",
      "torph",
      "@atlaskit/pragmatic-drag-and-drop",
      "@atlaskit/pragmatic-drag-and-drop-hitbox",
    ],
  },
});
