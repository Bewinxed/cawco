import http from "node:http";
import path from "node:path";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import Icons from "unplugin-icons/vite";
import { defineConfig, type Plugin, type Rolldown } from "vite";

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

/**
 * Safari 15.6 is the floor, and CSS gets no lowering for it where it matters.
 * These reach the iPad as they were written, and a value the engine cannot
 * parse paints nothing — no border, no shadow, no scrim, no gradient:
 *
 * - `color-mix()`: Safari 16.2. Tailwind's `/N` opacity modifier compiles to
 *   it, with a full-opacity fallback.
 * - relative colour, `oklch(from …)`: Safari 16.4 (partial), 18.
 * - `light-dark()`: Safari 17.5.
 * - a colour space in a gradient, `linear-gradient(to bottom in oklab, …)`:
 *   Safari 16.2. Tailwind's gradient utilities all emit one.
 * - a bare-number lightness in `oklch()`/`oklab()`/`lab()`/`lch()`,
 *   `oklch(0.5 0.1 200)`: mixing numbers and percentages is Safari 16.2, so
 *   15.6 wants `oklch(50% 0.1 200)`.
 *
 * (Versions: @mdn/browser-compat-data — css.types.color.*, and
 * css.types.gradient.linear-gradient.interpolation_color_space.)
 *
 * So the built CSS is read, and every declaration using one of them fails the
 * build — unless it is listed below with the reason it is safe. The list is
 * only for dependency CSS this app cannot edit; our own colours are literal
 * tokens (app.css). A listed declaration that is no longer emitted fails the
 * build too, so the list cannot go stale: a dependency upgrade that changes
 * its CSS is re-read, not waved through.
 */
const CSS_BEYOND_FLOOR = new RegExp(
  [
    String.raw`color-mix\(`,
    String.raw`light-dark\(`,
    String.raw`\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*from\b`,
    String.raw`\bin\s+(?:srgb(?:-linear)?|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz(?:-d50|-d65)?|lab|oklab|lch|oklch|hsl|hwb)\b`,
    String.raw`\b(?:ok)?(?:lab|lch)\(\s*-?(?:\d*\.)?\d+(?:e-?\d+)?(?=[\s,/)])`,
  ].join("|")
);

const CHART_OVERRIDE = "overridden in ui/chart/chart-container.svelte";
const CHART_DEBUG = "layerchart debug mode only; no chart sets `debug`";
const CREPE_OVERRIDE = "overridden in features/MarkdownEditor.svelte";
const PLACEHOLDER =
  "Tailwind preflight; its @supports is false on Safari < 17, which keeps the UA placeholder colour";

/** `at-rules | selector | property` (Svelte scoping hashes removed) → why it is safe. */
const CSS_FLOOR_ALLOWED: Record<string, string> = {
  "@layer base | @supports (not ((-webkit-appearance:-apple-pay-button))) or (contain-intrinsic-size:1px) | @supports (color:color-mix(in lab, red, red)) | ::placeholder | color":
    PLACEHOLDER,
  "@layer components | :where(.lc-tooltip-context).debug | background-color":
    CHART_DEBUG,
  "@layer components | :where(.lc-tooltip-voronoi-path).debug | fill":
    CHART_DEBUG,
  "@layer components | :where(.lc-tooltip-rect).debug | fill": CHART_DEBUG,
  "@layer components | :where(.lc-tooltip-quadtree-rect).debug | fill":
    CHART_DEBUG,
  "@layer components | :where(.lc-debug-frame) | --fill-color": CHART_DEBUG,
  "@layer components | :where(.lc-axis-rule),:where(.lc-axis-tick) | --stroke-color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-axis-grid) | --stroke-color": CHART_OVERRIDE,
  "@layer components | :where(.lc-rule-x-line,.lc-rule-y-line,.lc-rule-x-radial-line,.lc-rule-y-radial-circle):not([class*=lc-axis],[class*=lc-grid]) | --stroke-color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-grid-x-rule,.lc-grid-x-end-rule,.lc-grid-x-radial-line,.lc-grid-y-rule,.lc-grid-y-end-rule,.lc-grid-y-radial-line) | --stroke-color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-grid-y-radial-circle) | --stroke-color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-highlight-area) | --fill-color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-highlight-line) | --stroke-color":
    CHART_OVERRIDE,
  "@layer base | :where(.lc-brush-range) | background": CHART_OVERRIDE,
  "@layer components | :where(.lc-tooltip-header) | border-bottom":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-tooltip-separator) | background-color":
    CHART_OVERRIDE,
  ".milkdown .ProseMirror .ProseMirror-selectednode | background":
    CREPE_OVERRIDE,
  ".milkdown .ProseMirror code | background": CREPE_OVERRIDE,
  ".milkdown .ProseMirror pre | background": CREPE_OVERRIDE,
  ".milkdown .ProseMirror hr | background-color": CREPE_OVERRIDE,
  ".milkdown .ProseMirror hr.ProseMirror-selectednode | background-color":
    CREPE_OVERRIDE,
  ".milkdown .ProseMirror hr.ProseMirror-selectednode:before | background-color":
    CREPE_OVERRIDE,
  ".milkdown .milkdown-slash-menu .tab-group | border-bottom": CREPE_OVERRIDE,
  ".milkdown .milkdown-slash-menu .menu-groups .menu-group h6 | color":
    CREPE_OVERRIDE,
  ".milkdown .milkdown-slash-menu .menu-groups .menu-group+.menu-group:before | background":
    CREPE_OVERRIDE,
  ".milkdown .milkdown-code-block .preview-panel .preview-label | color":
    CREPE_OVERRIDE,
  ".milkdown .crepe-drop-cursor | background-color": CREPE_OVERRIDE,
  ".milkdown .milkdown-image-inline .empty-image-inline .link-importer .placeholder | color":
    CREPE_OVERRIDE,
  ".milkdown .milkdown-image-block.selected>.image-edit:not(:has(input:focus)):before | background":
    CREPE_OVERRIDE,
  ".milkdown .milkdown-image-block.selected>.image-wrapper:before | background":
    CREPE_OVERRIDE,
  ".milkdown .milkdown-image-block .image-edit .link-importer .placeholder | color":
    CREPE_OVERRIDE,
  ".milkdown .crepe-placeholder:before | color": CREPE_OVERRIDE,
  ".milkdown .milkdown-toolbar .divider | background": CREPE_OVERRIDE,
  ".milkdown .milkdown-table-block th,.milkdown .milkdown-table-block td | border":
    CREPE_OVERRIDE,
  "@layer components | :where(.lc-tooltip-container)[data-variant=default] | background-color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-tooltip-container)[data-variant=default] .label | color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-tooltip-container)[data-variant=invert] | background-color":
    CHART_OVERRIDE,
  "@layer components | :where(.lc-tooltip-container)[data-variant=invert] .label | color":
    CHART_OVERRIDE,
};

/** Every declaration in a stylesheet, keyed as CSS_FLOOR_ALLOWED keys it. */
function cssDeclarations(css: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  const stack: string[] = [];
  let start = 0;
  const flush = (text: string) => {
    let paren = 0;
    let from = 0;
    const parts: string[] = [];
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === "(") {
        paren += 1;
      } else if (ch === ")") {
        paren -= 1;
      } else if (ch === ";" && paren === 0) {
        parts.push(text.slice(from, i));
        from = i + 1;
      }
    }
    parts.push(text.slice(from));
    for (const part of parts) {
      const colon = part.indexOf(":");
      if (colon < 0) {
        continue;
      }
      const atRules = stack.slice(0, -1).filter((s) => s.startsWith("@"));
      out.push({
        key: [...atRules, stack.at(-1) ?? "", part.slice(0, colon).trim()]
          .join(" | ")
          .replace(/\.svelte-[a-z0-9]+/g, "")
          .replace(/\s+/g, " "),
        value: part.slice(colon + 1).trim(),
      });
    }
  };
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      stack.push(css.slice(start, i).trim());
      start = i + 1;
    } else if (ch === "}") {
      flush(css.slice(start, i));
      stack.pop();
      start = i + 1;
    } else if (ch === ";" && stack.length === 0) {
      start = i + 1;
    }
  }
  return out;
}

/** The CSS declarations in a bundle that are beyond the floor, and which were not listed. */
function floorFindings(bundle: Rolldown.OutputBundle): {
  refused: string[];
  seen: Set<string>;
} {
  const seen = new Set<string>();
  const refused: string[] = [];
  for (const file of Object.values(bundle)) {
    if (file.type !== "asset" || !file.fileName.endsWith(".css")) {
      continue;
    }
    for (const { key, value } of cssDeclarations(String(file.source))) {
      if (!CSS_BEYOND_FLOOR.test(value)) {
        continue;
      }
      seen.add(key);
      if (!(key in CSS_FLOOR_ALLOWED)) {
        refused.push(`  ${file.fileName}: ${key}: ${value}`);
      }
    }
  }
  return { refused, seen };
}

const cssFloor = (): Plugin => ({
  name: "whiffle:css-floor",
  apply: "build",
  // The client bundle's CSS is what reaches a browser.
  applyToEnvironment: (environment) => environment.name === "client",
  generateBundle(_options, bundle) {
    const { refused, seen } = floorFindings(bundle);
    const stale = Object.keys(CSS_FLOOR_ALLOWED).filter(
      (key) => !seen.has(key)
    );
    if (refused.length === 0 && stale.length === 0) {
      return;
    }
    this.error(
      [
        "CSS below the Safari 15.6 floor (color-mix, relative colour, light-dark, gradient colour space, number lightness):",
        ...refused,
        ...(stale.length > 0
          ? [
              "Listed in CSS_FLOOR_ALLOWED but no longer emitted:",
              ...stale.map((k) => `  ${k}`),
            ]
          : []),
        "Use a literal token from app.css (see its alpha steps), or, for dependency CSS, override it and list it with the reason.",
      ].join("\n")
    );
  },
});

export default defineConfig({
  plugins: [
    lookbehindShims(),
    hubProxy(),
    tailwindcss(),
    sveltekit(),
    Icons({ compiler: "svelte" }),
    cssFloor(),
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
