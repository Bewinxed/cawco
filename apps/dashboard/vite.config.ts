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

/**
 * The hub a vite server (`vite dev`, `vite preview`) talks to: the one named in
 * `CAWCO_DEV_HUB_URL`, with no default. The fleet exports the live hub as
 * `CAWCO_HUB_URL` into every session's shell, and a leaf's dev server that
 * fell back on it, or on `localhost:3456`, put its test pages on the live hub:
 * a test script's Escape there denied the owner's parked question. So a vite
 * server never reads `CAWCO_HUB_URL`, and refuses to start without its own.
 *
 * The `/api` route reads `CAWCO_HUB_URL`, in dev (SSR in this process) and in
 * preview (the built server, imported into this process) alike, so this
 * process's copy is set to the dev hub before either loads. The production
 * server is serve.js under node, which never loads this file.
 *
 * The refusal is the servers' own (`hubProxy`'s hooks), not the config's:
 * svelte-check loads this config as a `serve` too, and starts no server.
 */
const DEV_HUB_ENV = "CAWCO_DEV_HUB_URL";
const DEV_HUB = process.env[DEV_HUB_ENV];
const devHub = (): URL => {
  if (!DEV_HUB) {
    console.error(
      `[cawco] a vite server needs ${DEV_HUB_ENV}, the hub it talks to (e.g. ${DEV_HUB_ENV}=http://localhost:4456 bun run dev); it never reads CAWCO_HUB_URL, which in a session's shell is the live hub.`
    );
    process.exit(1);
  }
  return new URL(DEV_HUB);
};

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
  configurePreviewServer() {
    devHub();
  },
  configureServer(server) {
    const HUB_URL = devHub();
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

/* The commit this build was made from. The build bakes it into the page and
   writes it to `_app/version.json`, which the running server answers as
   `_app/running-version.json` (serve.js); a tab compares the two to learn it
   is older than the dashboard now serving it (served-build.svelte.ts). It must
   be deterministic, or two builds of one commit would each tell open tabs to
   reload. */
const BUILD_VERSION = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

/**
 * `vite dev` answers `_app/running-version.json` as serve.js does, with the
 * body SvelteKit writes to `_app/version.json`, so a dev page runs the same
 * served-build check as production instead of logging a 404 on every load.
 */
const runningVersion = (): Plugin => ({
  name: "cawco:running-version",
  configureServer(server) {
    const body = JSON.stringify({ version: BUILD_VERSION });
    server.middlewares.use("/_app/running-version.json", (_req, res) => {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(body);
    });
  },
});

// `/ws` is left to `server.proxy`, and HMR's upgrade to Vite.
/**
 * Event Calendar's own palette (`src/styles/theme.css`) is not loaded: the
 * calendar view imports the library's layout stylesheet, and its first
 * line, the import of its theme, is taken out before Vite inlines the rest.
 * The project's tokens fill the `--ec-*` variables instead (PRD §5.2: the
 * libraries' themes are not loaded; our components carry DESIGN.md).
 */
const EC_INDEX = /@event-calendar[\\/]core[\\/]src[\\/]styles[\\/]index\.css$/;
const EC_THEME_IMPORT = /@import\s+["']\.\/theme\.css["'];?/;
const calendarThemeOff = (): Plugin => ({
  name: "cawco-calendar-theme-off",
  enforce: "pre",
  transform(code, id) {
    return EC_INDEX.test(id) ? code.replace(EC_THEME_IMPORT, "") : null;
  },
});

/**
 * svelte-streamdown's fullscreen overlay is one global rule in its root
 * component (Streamdown.svelte): `[data-expanded='true'] { position: fixed;
 * top: 16px; left: 16px; width: calc(100vw - 32px); height: calc(100vh -
 * 32px); z-index: 2147483647; margin: 0 }`. Its targets are its own two:
 * the table wrapper (`data-streamdown-table`, flagged by useExpand) and a
 * Mermaid diagram's container (the div inside `data-streamdown-mermaid`,
 * flagged by panzoom). But the selector names any element in the page, and
 * others carry the same flag: sonner marks every toast of an expanded stack
 * with it, and Milkdown's code-block language button while its list is
 * open. Each was fixed to the viewport, and whatever it does not set itself
 * (an unstyled toast's width, the button's offsets) took the overlay's: the
 * update notice spanned the viewport from the bottom-left, over the rail.
 *
 * The selector is confined to streamdown's own two targets here, where the
 * rule enters the build, so it matches nothing else and every other element
 * keeps its own cascade untouched. A counter-rule cannot do that: to win it
 * must set a value, and `revert`/`revert-layer` from unlayered CSS drop the
 * element's own author styles along with streamdown's; a cascade layer only
 * outranks it where the element sets the same property. `:where()` holds the
 * weight at the library's own (0,1,0). A release that changes the rule fails
 * the build here instead of leaking again.
 */
const STREAMDOWN_ROOT =
  /svelte-streamdown[\\/]dist[\\/]Streamdown\.svelte\?.*type=style/;
const STREAMDOWN_OVERLAY = /\[data-expanded=(['"]?)true\1\](?=\s*\{)/g;
const streamdownOverlayOwn = (): Plugin => ({
  name: "cawco-streamdown-overlay-own",
  transform(code, id) {
    if (!STREAMDOWN_ROOT.test(id)) {
      return null;
    }
    const found = code.match(STREAMDOWN_OVERLAY)?.length ?? 0;
    if (found !== 1) {
      throw new Error(
        `svelte-streamdown's [data-expanded='true'] overlay rule was found ${found} times in ${id}, expected once: re-read Streamdown.svelte and update streamdownOverlayOwn`
      );
    }
    return code.replace(
      STREAMDOWN_OVERLAY,
      ":where([data-streamdown-table], [data-streamdown-mermaid] > div)$&"
    );
  },
});

export default defineConfig(({ command }) => {
  // A build talks to no hub; only a vite server does, and only to the dev hub.
  if (command === "serve" && DEV_HUB) {
    process.env.CAWCO_HUB_URL = DEV_HUB;
  }
  return {
    plugins: [
      calendarThemeOff(),
      streamdownOverlayOwn(),
      hubProxy(),
      runningVersion(),
      tailwindcss(),
      sveltekit({
        preprocess: vitePreprocess(),
        compilerOptions: { experimental: { async: true } },
        adapter: adapter({ out: ".build-next" }),
        experimental: { remoteFunctions: true },
        version: { name: BUILD_VERSION },
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
      proxy: DEV_HUB
        ? { "/ws": { target: new URL(DEV_HUB).origin, ws: true } }
        : undefined,
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
      // svelte-streamdown is compiled like the app's own components, so its
      // stylesheet passes through streamdownOverlayOwn in dev as in the build:
      // prebundled, its styles are injected from the bundle's JS instead.
      exclude: ["@xyflow/svelte", "svelte-streamdown"],
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
  };
});
