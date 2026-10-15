import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type http from "node:http";
import { join } from "node:path";
import {
  BROWSER_HEADERS,
  crossSiteRefusal,
  PAGE_ORIGIN_HEADER,
} from "@cawco/core/browser-gate";
import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import {
  defineConfig,
  type Plugin,
  type PreviewServer,
  type ViteDevServer,
} from "vite";
import { publicOrigin } from "./public-origin.js";

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
export const INLINE_FACES =
  /\/(?:figtree-latin-wght-normal|jetbrains-mono-latin-wght-normal)\.woff2$/;

/**
 * The vite servers' (`vite dev`, and `vite preview`, the built dashboard the
 * probes drive) hold on the hub: a server refuses to start without its own
 * (`devHub`), and the hub's `/ws` socket goes through `server.proxy` below.
 * Previews are never served here: each is an origin of its own.
 *
 * Also the whole fix for a stray upgrade killing the server: `http.Server`
 * drops a socket's error handling the moment it emits `upgrade`, so an upgrade
 * no listener claims is left with no `error` handler and the eventual reset is a
 * process-level throw. Attaching an error listener to every upgrade socket keeps
 * that reset from taking the server (and every dashboard socket) down with it.
 */
const hubProxy = (): Plugin => ({
  name: "cawco:hub-proxy",
  configurePreviewServer(server) {
    holdUpgrades(server);
  },
  configureServer(server) {
    holdUpgrades(server);
  },
});

function holdUpgrades(server: ViteDevServer | PreviewServer) {
  devHub();

  server.httpServer?.on("upgrade", (req, socket) => {
    socket.on("error", (error: NodeJS.ErrnoException) => {
      server.config.logger.warn(
        `[cawco] websocket socket error on ${req.url}: ${error.code ?? error.message}`,
        { timestamp: true }
      );
    });
  });
}

/**
 * `server.proxy`'s `/ws` relay passes only this dashboard's own pages
 * through (core `browser-gate.ts`, as serve.js does), and leaves out the
 * page's origin headers it read: the hub behind it is not the page's origin.
 */
const gateHubSocket = (proxy: {
  on: (
    event: "proxyReqWs",
    listener: (
      proxyReq: http.ClientRequest,
      req: http.IncomingMessage,
      socket: { destroy: () => void }
    ) => void
  ) => void;
}) => {
  proxy.on("proxyReqWs", (proxyReq, req, socket) => {
    const own = publicOrigin(req.headers).origin;
    const refused = crossSiteRefusal(
      req.method ?? "GET",
      (name) => {
        const value = req.headers[name];
        return Array.isArray(value) ? value[0] : value;
      },
      own
    );
    if (refused) {
      console.warn(`[cawco] refused ${refused} to open ${req.url}`);
      socket.destroy();
      return;
    }
    for (const name of BROWSER_HEADERS) {
      proxyReq.removeHeader(name);
    }
    // A page's socket (one with an Origin, which the gate found its own):
    // where the hub's dashboard is reached, and its previews may be framed
    // from. One with none came from no page (serve.js says why).
    proxyReq.removeHeader(PAGE_ORIGIN_HEADER);
    if (req.headers.origin) {
      proxyReq.setHeader(PAGE_ORIGIN_HEADER, own);
    }
  });
};

/* The commit this build was made from. The build bakes it into the page and
   writes it to `_app/version.json`, which the running server answers as
   `_app/running-version.json` (serve.js); a tab compares the two to learn it
   is older than the dashboard now serving it (served-build.svelte.ts). It must
   be deterministic, or two builds of one commit would each tell open tabs to
   reload. */
const BUILD_VERSION = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();

/** Answers `_app/running-version.json` with `body`, as serve.js does. */
function answerRunningVersion(
  server: ViteDevServer | PreviewServer,
  body: string
) {
  server.middlewares.use("/_app/running-version.json", (_req, res) => {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(body);
  });
}

/**
 * `vite dev` and `vite preview` answer `_app/running-version.json` as serve.js
 * does, so their pages run the same served-build check as production instead
 * of logging a 404 on every load. Dev answers the body SvelteKit writes to
 * `_app/version.json`; preview answers the built one (SvelteKit previews
 * `.svelte-kit/output/client`), read once at start as serve.js reads its own.
 */
const runningVersion = (): Plugin => ({
  name: "cawco:running-version",
  configureServer(server) {
    answerRunningVersion(server, JSON.stringify({ version: BUILD_VERSION }));
  },
  configurePreviewServer(server) {
    answerRunningVersion(
      server,
      readFileSync(
        join(server.config.root, ".svelte-kit/output/client/_app/version.json"),
        "utf8"
      )
    );
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
export const calendarThemeOff = (): Plugin => ({
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
export const streamdownOverlayOwn = (): Plugin => ({
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

/** The CSS floor, for the minifier (`build.cssTarget` below says why). */
export const CSS_TARGET = [
  "chrome131",
  "edge131",
  "firefox146",
  "safari18",
  "ios18",
];

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
        // The dashboard's one CSRF rule is its own gate (hooks.server.ts,
        // core `browser-gate.ts`), against the request's `publicOrigin`.
        // Kit's form check judged by `request.url` instead, which `vite
        // preview` builds from the Host alone: a page reached through a
        // proxy had its POSTs refused there by the second rule. Every
        // cross-site form the Kit check refused the gate refuses too (a POST
        // navigation carries `Sec-Fetch-Site: cross-site` and an Origin that
        // is not the dashboard's).
        csrf: { trustedOrigins: ["*"] },
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
        ? {
            "/ws": {
              target: new URL(DEV_HUB).origin,
              ws: true,
              configure: gateHubSocket,
            },
          }
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
      cssTarget: CSS_TARGET,
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
