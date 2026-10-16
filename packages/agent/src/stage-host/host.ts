/**
 * A workspace's stage (live components, core `stage.ts`): the project's own
 * Vite, started by its JavaScript API from the project's own config file,
 * with one CawCo plugin added ({@link cawcoStage}) and nothing written into
 * the project. The daemon (agent `stage.ts`) writes this file, bundled, to
 * `<Vite root>/.cawco/stage/host.mjs` and runs it there inside the
 * workspace's boundary under the runtime the project's lockfile implies, so
 * the project's Vite version never meets CawCo's process (the spike: the
 * compiled binary can't load a project's Vite, `Cannot find module
 * 'rolldown/parseAst'`).
 *
 * Its environment: `CAWCO_STAGE=1`, which a config reads to know it runs on
 * a stage (as Storybook's `STORYBOOK`); `CAWCO_STAGE_PORT`, the port it
 * listens on, on the boundary's loopback; `CAWCO_STAGE_FRAMEWORK`, whose
 * mount function each story's frame uses; `CAWCO_STAGE_KIT=1` for SvelteKit.
 *
 * It speaks to the daemon in JSON lines on stdout, each `{"cawco": <word>}`:
 * `ready` with its port once it serves, `errors` with every compile error
 * standing whenever that changes, `beat` every {@link BEAT_MS}, and `fatal`
 * with why it could not start. Vite's own words go to stderr (`logLevel:
 * "warn"`). Once nothing reads its stdout (the daemon is gone), a beat's
 * write fails and the stage ends.
 */
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "@babel/parser";
import {
  HEALTH_PATH,
  SHEET_PATH,
  STORIES_PATH,
  STORY_FILE,
  type StageError,
  type Story,
} from "@cawco/core/stage";
import { transformCode } from "@code-inspector/core";

type Framework = "svelte" | "vue" | "react" | "solid" | "preact";

/** What the stage uses of a module node in Vite's graph. */
interface ModuleNode {
  file: string | null;
  id: string | null;
  importers: Set<ModuleNode>;
}

/** What the stage uses of the project's dev server: Vite's own API, its Environment API from Vite 6 on. */
interface DevServer {
  close: () => Promise<void>;
  config: { base: string };
  environments: {
    client: {
      hot: { send: (payload: unknown, ...rest: unknown[]) => void };
      moduleGraph: {
        getModuleById: (id: string) => ModuleNode | undefined;
        getModulesByFile: (file: string) => Set<ModuleNode> | undefined;
        invalidateModule: (mod: ModuleNode) => void;
      };
    };
  };
  httpServer: { address: () => { port: number } | string | null } | null;
  listen: () => Promise<unknown>;
  middlewares: {
    use: (
      handle: (
        req: IncomingMessage,
        res: ServerResponse,
        next: (error?: unknown) => void
      ) => void
    ) => void;
  };
  transformIndexHtml: (
    url: string,
    html: string,
    originalUrl?: string
  ) => Promise<string>;
}

/** The project's own Vite, as the stage uses it. */
interface Vite {
  createServer: (config: object) => Promise<DevServer>;
  version: string;
}

/** How often the stage tells the daemon it is alive. The daemon's health look is the spec's; this only ends a stage nobody reads. */
const BEAT_MS = 15_000;
const VIRTUAL = "cawco:sheet/";
const root = process.cwd();
const port = Number(process.env.CAWCO_STAGE_PORT);
const framework = process.env.CAWCO_STAGE_FRAMEWORK as Framework;
const kit = process.env.CAWCO_STAGE_KIT === "1";

const say = (word: string, rest: object = {}) => {
  process.stdout.write(`${JSON.stringify({ cawco: word, ...rest })}\n`);
};
// Nobody reads the stage's words any more: its daemon is gone, and so is it.
process.stdout.on("error", () => process.exit(0));

/**
 * The project's own copy of `name`, found from the Vite root up (a
 * workspace's packages hoist); Node takes `import.meta.resolve`'s parent
 * only behind a flag, so the walk is the stage's own.
 */
function projectPackage(name: string): string {
  for (let dir = root; ; dir = dirname(dir)) {
    const pkg = join(dir, "node_modules", name, "package.json");
    if (existsSync(pkg)) {
      const json = JSON.parse(readFileSync(pkg, "utf8"));
      const dot = json.exports?.["."] ?? json.exports;
      const entry =
        (typeof dot === "string"
          ? dot
          : (dot?.import?.default ?? dot?.import ?? dot?.default)) ??
        json.module ??
        json.main;
      return pathToFileURL(join(dirname(pkg), entry)).href;
    }
    if (dirname(dir) === dir) {
      throw new Error(`${name} is not installed under ${root}`);
    }
  }
}

/** A story file's syntax plugins, by its extension: JSX only where the file may hold it, so a `.ts` file's `<T>() =>` stays a generic. */
const syntaxOf = (file: string): ("jsx" | "typescript")[] => {
  if (TSX.test(file)) {
    return ["typescript", "jsx"];
  }
  return TS.test(file) ? ["typescript"] : ["jsx"];
};
const TSX = /\.tsx$/;
const TS = /\.[cm]?ts$/;

/** A named export's name, or the string a specifier exports (`export { a as "b" }`). */
const exportedName = (node: {
  name?: string;
  value?: unknown;
}): string | undefined =>
  node.name ?? (typeof node.value === "string" ? node.value : undefined);

/** The names a story file's export declares: its variables', or its function's or class's. */
const declaredOf = (declaration: Declaration | null | undefined): Ident[] => {
  if (declaration?.type === "VariableDeclaration") {
    return declaration.declarations.map((one) => one.id as Ident);
  }
  if (
    declaration?.type === "FunctionDeclaration" ||
    declaration?.type === "ClassDeclaration"
  ) {
    return declaration.id ? [declaration.id as Ident] : [];
  }
  return [];
};

/**
 * Each story of a CSF file, in order, by its export's name and 1-based
 * place, read with Babel's parser (TypeScript and JSX, as Storybook's own
 * CSF tooling reads them). The default export is the sheet's meta, a type
 * is no story, and Storybook's `__namedExportsOrder` is no story either.
 */
function storiesOf(file: string): Story[] {
  const { program } = parse(readFileSync(file, "utf8"), {
    sourceType: "module",
    plugins: syntaxOf(file),
  });
  const found: Story[] = [];
  const add = (node: Ident) => {
    const name = exportedName(node);
    if (name && name !== "__namedExportsOrder" && node.loc) {
      found.push({
        name,
        line: node.loc.start.line,
        column: node.loc.start.column + 1,
      });
    }
  };
  for (const node of program.body) {
    if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type") {
      continue;
    }
    for (const one of declaredOf(node.declaration as Declaration | null)) {
      add(one);
    }
    for (const specifier of node.specifiers) {
      if (
        specifier.type === "ExportSpecifier" &&
        specifier.exportKind !== "type"
      ) {
        add(specifier.exported as Ident);
      }
    }
  }
  return found;
}

/** A node a story's name is read off: an identifier, or a specifier's string. */
interface Ident {
  loc?: { start: { column: number; line: number } } | null;
  name?: string;
  value?: unknown;
}
/** A named export's declaration, as far as its names are read. */
interface Declaration {
  declarations: { id: unknown }[];
  id?: unknown;
  type: string;
}

/** The app's page: SvelteKit's `src/app.html`, a Vite app's `index.html`. */
const shellFile = () => resolve(root, kit ? "src/app.html" : "index.html");

const ENTRY_SCRIPT =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/i;

/**
 * The app's root module, whose style imports are the app's global CSS:
 * SvelteKit's root layout (app.html loads no CSS: `import "../app.css"` is
 * the layout's), a Vite app's `index.html` entry script.
 */
function rootModule(): string | null {
  if (kit) {
    return resolve(root, "src/routes/+layout.svelte");
  }
  const shell = shellFile();
  const entry = existsSync(shell)
    ? readFileSync(shell, "utf8").match(ENTRY_SCRIPT)?.[1]
    : undefined;
  return entry ? resolve(root, entry.replace(LEADING_SLASH, "")) : null;
}
const LEADING_SLASH = /^\//;

const STYLE_IMPORT =
  /^\s*import\s+["']([^"']+\.(?:css|scss|sass|less|styl|stylus|pcss|postcss))["'];?/gm;

/** The root module's side-effect style imports, never the module itself: its JS (a theme, an onMount) is the app's, not a sheet's. */
function globalStyles(): string[] {
  const file = rootModule();
  if (!(file && existsSync(file))) {
    return [];
  }
  return [...readFileSync(file, "utf8").matchAll(STYLE_IMPORT)].map((m) =>
    m[1].startsWith(".") ? resolve(dirname(file), m[1]) : m[1]
  );
}

/**
 * Each framework's own mount function, as one `mountStory(target, story)`
 * answering how to take it down. A story is mounted from its `render` when
 * it has one (the framework's own idiom), else its component with its args,
 * and wrapped in its decorators, the story's innermost and then the meta's,
 * as Storybook's `decorateStory` does: each is `(Story, context)`.
 */
const ADAPTERS: Record<Framework, string> = {
  svelte: `import { createRawSnippet, mount, unmount } from "svelte";
function mountStory(target, s) {
  let result = s.render ? s.render(s.args, s.context) : { Component: s.component, props: s.args };
  for (const decorator of s.decorators) {
    const inner = result;
    const outer = decorator(() => inner, s.context);
    result = outer && outer !== inner && outer.Component ? { ...outer, child: inner } : (outer ?? inner);
  }
  return mountSvelte(target, result);
}
function mountSvelte(target, { Component, props = {}, child }) {
  const children = child && createRawSnippet(() => ({
    render: () => '<div style="display:contents"></div>',
    setup: (el) => mountSvelte(el, child),
  }));
  const instance = mount(Component, { target, props: children ? { ...props, children } : props });
  return () => unmount(instance);
}`,
  vue: `import { createApp, h } from "vue";
function mountStory(target, s) {
  let story = () => s.render ? s.render(s.args, s.context) : { render: () => h(s.component, s.args) };
  for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
  const app = createApp(story());
  app.mount(target);
  return () => app.unmount();
}`,
  react: `import { createElement } from "react";
import { createRoot } from "react-dom/client";
function mountStory(target, s) {
  let story = () => s.render ? s.render(s.args, s.context) : createElement(s.component, s.args);
  for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
  const root = createRoot(target);
  root.render(story());
  return () => root.unmount();
}`,
  solid: `import { createComponent } from "solid-js";
import { render } from "solid-js/web";
function mountStory(target, s) {
  let story = () => s.render ? s.render(s.args, s.context) : createComponent(s.component, s.args);
  for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
  return render(story, target);
}`,
  preact: `import { h, render } from "preact";
function mountStory(target, s) {
  let story = () => s.render ? s.render(s.args, s.context) : h(s.component, s.args);
  for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
  render(story(), target);
  return () => render(null, target);
}`,
};

/**
 * The sheet's module: the app's global styles, the story file, and every
 * story mounted into a frame of its own, `data-cawco-story` its export and
 * `data-cawco-source` the export's place, under a pick button
 * (`data-option`) of the page's one choice, the story file. It accepts
 * itself: a story file's edit (or a story added) runs it again, on fresh
 * places, after its last run took its stories down. A component's edit is
 * the framework's own HMR and never reaches it. Each HMR update says
 * `cawco:hmr` on the window, so the overlay reads its pins' anchors again.
 */
function sheetModule(file: string): string {
  const abs = resolve(root, file);
  const stories = storiesOf(abs);
  const styles = globalStyles()
    .map((style) => `import ${JSON.stringify(style)};`)
    .join("\n");
  return `${styles}
${ADAPTERS[framework]}
import * as sheet from ${JSON.stringify(abs)};
const FILE = ${JSON.stringify(file)};
const STORIES = ${JSON.stringify(stories)};
const host = document.getElementById("cawco-sheet");
const live = new Map();
function frameOf(story) {
  let frame = host.querySelector('[data-cawco-story="' + CSS.escape(story.name) + '"]');
  if (!frame) {
    frame = document.createElement("section");
    frame.className = "cawco-frame";
    frame.dataset.cawcoStory = story.name;
    const label = document.createElement("button");
    label.type = "button";
    label.className = "cawco-frame-label";
    label.dataset.option = story.name;
    label.textContent = story.name;
    const body = document.createElement("div");
    body.className = "cawco-frame-body";
    frame.append(label, body);
  }
  frame.dataset.cawcoSource = FILE + ":" + story.line + ":" + story.column;
  host.append(frame);
  return frame;
}
function render(mod) {
  const meta = mod.default ?? {};
  for (const frame of host.querySelectorAll("[data-cawco-story]")) {
    if (!STORIES.some((story) => story.name === frame.dataset.cawcoStory)) frame.remove();
  }
  for (const story of STORIES) {
    const value = mod[story.name];
    if (!value) continue;
    const csf = typeof value === "function" ? { render: value, ...value } : value;
    const body = frameOf(story).querySelector(".cawco-frame-body");
    body.replaceChildren();
    const args = { ...(meta.args ?? {}), ...(csf.args ?? {}) };
    const context = { args, id: story.name, name: csf.name ?? story.name, title: meta.title ?? FILE, parameters: { ...(meta.parameters ?? {}), ...(csf.parameters ?? {}) }, argTypes: {}, globals: {}, viewMode: "story" };
    try {
      live.set(story.name, mountStory(body, {
        args, context,
        component: csf.component ?? meta.component,
        render: csf.render ?? meta.render,
        decorators: [...(csf.decorators ?? []), ...(meta.decorators ?? [])],
      }));
    } catch (error) {
      console.error("[cawco] story " + story.name + " did not mount:", error);
    }
  }
  window.__cawcoSheet = { file: FILE, stories: STORIES.map((story) => story.name), renders: (window.__cawcoSheet?.renders ?? 0) + 1 };
}
render(sheet);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    for (const undo of live.values()) undo?.();
    live.clear();
  });
  import.meta.hot.on("vite:afterUpdate", () => dispatchEvent(new CustomEvent("cawco:hmr")));
}
`;
}

/** The sheet chrome's own look: frames in a wrapping row, each hugging its story, its name over it. Neutral: the project's CSS is the stories'. */
const SHEET_STYLE = `<style>
.cawco-sheet{display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-start}
.cawco-frame{display:flex;flex-direction:column;gap:8px;min-width:0}
.cawco-frame-label{all:unset;align-self:flex-start;font:12px/1.4 system-ui,sans-serif;opacity:.6;cursor:pointer;border-radius:4px;padding:0 4px}
.cawco-frame-label[data-cawco-picked]{opacity:1;outline:2px solid Highlight}
</style>`;

/**
 * The sheet's page: the app's own page (its markup, meta and links) with its
 * placeholders stripped, its inline scripts dropped (they are the app's
 * contract with its root layout, which never mounts on a stage: the
 * dashboard's holds every tap until its layout releases them) and a Vite
 * app's own entry with them; then the sheet's module, a virtual `.js`
 * (an inline module's id would carry the story's path, and a `.svelte` in it
 * is claimed by vite-plugin-svelte). The project's own HTML transforms run
 * over it, as on any of its pages.
 */
function sheetPage(base: string, file: string): string {
  const entry = `${base}/@id/__x00__${VIRTUAL}${encodeURIComponent(file)}.js`;
  const main = `<main id="cawco-sheet" class="cawco-sheet" data-cawco-choice="${file.replaceAll('"', "&quot;")}"></main>`;
  let html = existsSync(shellFile())
    ? readFileSync(shellFile(), "utf8")
    : "<!doctype html><html><head></head><body></body></html>";
  html = kit
    ? html.replace("%sveltekit.body%", main)
    : html.replace(ENTRY_SCRIPT, "").replace(BODY, `$1${main}$2`);
  return html
    .replace(PLACEHOLDER, "")
    .replace(INLINE_SCRIPT, "")
    .replace("</head>", `${SHEET_STYLE}</head>`)
    .replace(
      "</body>",
      `<script type="module" src="${entry}"></script></body>`
    );
}

const BODY = /(<body\b[^>]*>)[\s\S]*(<\/body>)/i;
/** `%sveltekit.head%`, `%sveltekit.assets%` … and a project's own (`%cawco.tab-icon%`). */
const PLACEHOLDER = /%[\w.-]+%/g;
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi;
const TRAILING_SLASH = /\/$/;

/** A JSON answer, never cached. */
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
};

/** The sheet's page, through the project's own HTML transforms. */
async function serveSheet(
  dev: DevServer,
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
  base: string,
  file: string
): Promise<void> {
  try {
    const html = await dev.transformIndexHtml(
      req.url ?? SHEET_PATH,
      sheetPage(base, file),
      (req as IncomingMessage & { originalUrl?: string }).originalUrl
    );
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.end(html);
  } catch (error) {
    next(error);
  }
}

/**
 * The stage's own paths: the launch-editor endpoint refused, its health, a
 * sheet's page and its stories; anything else goes on to the project's.
 */
async function serveStage(
  dev: DevServer,
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://stage");
  const base = dev.config.base.replace(TRAILING_SLASH, "");
  const path = url.pathname.startsWith(base)
    ? url.pathname.slice(base.length)
    : url.pathname;
  if (path === "/__open-in-editor") {
    res.statusCode = 404;
    res.end("Not served on a stage");
    return;
  }
  if (path === HEALTH_PATH) {
    json(res, 200, { ok: true });
    return;
  }
  if (path !== SHEET_PATH && path !== STORIES_PATH) {
    next();
    return;
  }
  const named = url.searchParams.get("file");
  const file = storyFile(named);
  if (!file) {
    json(res, 404, {
      error: `${named ?? "No file"} is no story file in ${root}: a sheet is a .stories.ts (or .js, .tsx, .jsx) file inside the Vite root.`,
    });
    return;
  }
  if (path === SHEET_PATH) {
    await serveSheet(dev, req, res, next, base, file);
    return;
  }
  try {
    json(res, 200, { stories: storiesOf(resolve(root, file)) });
  } catch (error) {
    json(res, 422, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** A story file the request names, from the Vite root, when it is one inside it; null otherwise. */
function storyFile(named: string | null): string | null {
  if (!(named && STORY_FILE.test(named))) {
    return null;
  }
  const abs = resolve(root, named);
  const inside = relative(root, abs);
  return inside.startsWith("..") || !existsSync(abs) ? null : inside;
}

/**
 * The plugin: the sheet's page, its virtual module and its stories; every
 * compile error the client is sent, kept until its module compiles again
 * and told to the daemon; and Vite's launch-editor endpoint refused, which
 * opens any path on this machine (`/etc/hostname` among them) and reaches
 * anyone who can view the preview.
 */
function cawcoStage() {
  const errors = new Map<string, StageError>();
  const tell = () => say("errors", { errors: [...errors.values()] });
  let server: DevServer | undefined;

  /** The story files (from the root) whose sheets import `file`, read up Vite's module graph. */
  const sheetsOf = (file: string): string[] => {
    const graph = server?.environments.client.moduleGraph;
    const found = new Set<string>();
    const seen = new Set<ModuleNode>();
    const queue = [...(graph?.getModulesByFile(file) ?? [])];
    while (queue.length > 0) {
      const mod = queue.shift() as ModuleNode;
      if (seen.has(mod)) {
        continue;
      }
      seen.add(mod);
      if (mod.file && STORY_FILE.test(mod.file)) {
        found.add(relative(root, mod.file));
      }
      // A sheet's own module imports the app's global CSS: an error there is every importing sheet's.
      if (mod.id?.startsWith(`\0${VIRTUAL}`)) {
        found.add(
          decodeURIComponent(mod.id.slice(VIRTUAL.length + 1, -".js".length))
        );
      }
      queue.push(...mod.importers);
    }
    return [...found];
  };

  return {
    name: "cawco:stage",
    resolveId(id: string) {
      return id.startsWith(VIRTUAL) ? `\0${id}` : null;
    },
    load(id: string) {
      if (!id.startsWith(`\0${VIRTUAL}`)) {
        return null;
      }
      return sheetModule(
        decodeURIComponent(id.slice(VIRTUAL.length + 1, -".js".length))
      );
    },
    // A story file's edit runs its sheet's module again from a fresh load: its stories' places may have moved.
    hotUpdate({ file }: { file: string }) {
      if (!(STORY_FILE.test(file) && server)) {
        return;
      }
      const rel = relative(root, file);
      const sheet = server.environments.client.moduleGraph.getModuleById(
        `\0${VIRTUAL}${encodeURIComponent(rel)}.js`
      );
      if (sheet) {
        server.environments.client.moduleGraph.invalidateModule(sheet);
      }
    },
    // A good compile of a module clears the error it had.
    transform: {
      order: "post" as const,
      handler(_code: string, id: string) {
        if (errors.delete(id.split("?")[0] as string)) {
          tell();
        }
        return null;
      },
    },
    configureServer(dev: DevServer) {
      server = dev;
      const { hot } = dev.environments.client;
      const send = hot.send.bind(hot);
      hot.send = (payload: unknown, ...rest: unknown[]) => {
        const sent = payload as
          | {
              err?: {
                frame?: string;
                id?: string;
                loc?: { column?: number; file?: string; line?: number };
                message: string;
              };
              type?: string;
            }
          | undefined;
        if (sent?.type === "error" && sent.err) {
          const { err } = sent;
          // The module's id is Vite's absolute path; a plugin's `loc.file`
          // may be its own (vite-plugin-svelte's is the bare file name).
          const file = resolve(
            root,
            (err.id ?? err.loc?.file ?? "").split("?")[0] as string
          );
          errors.set(file, {
            file: relative(root, file),
            line: err.loc?.line ?? null,
            // Vite's (Rollup's) column is 0-based.
            column:
              typeof err.loc?.column === "number" ? err.loc.column + 1 : null,
            message: err.message,
            frame: err.frame ?? null,
            sheets: sheetsOf(file),
          });
          tell();
        }
        return send(payload, ...rest);
      };
      // Here, not in a returned post hook: before Vite's own middlewares and SvelteKit's handler.
      dev.middlewares.use((req, res, next) => {
        serveStage(dev, req, res, next).catch(next);
      });
    },
  };
}

/**
 * Stamps every element a React, Preact, Solid or Vue file writes with its
 * place (`data-insp-path="<file>:<line>:<column>:<tag>"`, the file from the
 * Vite root), by code-inspector's own transform (MIT, bundled into this
 * file with its notice). A Svelte element carries its place already
 * (`__svelte_meta`, in a dev compile). Before the framework's own plugin,
 * which compiles the markup away.
 */
function stamp() {
  const prefix = `data-insp-path="${root}${sep}`;
  return {
    name: "cawco:stage-stamp",
    enforce: "pre" as const,
    async transform(code: string, id: string) {
      if (id.includes("?") || id.includes(`${sep}node_modules${sep}`)) {
        return null;
      }
      let fileType: "vue" | "jsx" | null = null;
      if (id.endsWith(".vue")) {
        fileType = "vue";
      } else if (JSX_FILE.test(id)) {
        fileType = "jsx";
      }
      if (!(fileType && id.startsWith(`${root}${sep}`))) {
        return null;
      }
      const stamped = await transformCode({
        content: code,
        filePath: id,
        fileType,
        escapeTags: [],
        pathType: "absolute",
      });
      return stamped === code
        ? null
        : { code: stamped.split(prefix).join('data-insp-path="'), map: null };
    },
  };
}

const JSX_FILE = /\.[jt]sx$/;

const CONFIGS = ["ts", "mts", "js", "mjs", "cts", "cjs"].map(
  (ext) => `vite.config.${ext}`
);

try {
  const vite = (await import(projectPackage("vite"))) as Vite;
  const configFile = CONFIGS.map((name) => resolve(root, name)).find(
    existsSync
  );
  const server = await vite.createServer({
    root,
    configFile: configFile ?? false,
    clearScreen: false,
    logLevel: "warn",
    plugins: [cawcoStage(), ...(framework === "svelte" ? [] : [stamp()])],
    // The boundary's loopback alone: the daemon's bridge reaches it there,
    // and on a machine whose boundaries share the host's network (macOS) it
    // is open to nobody else.
    server: {
      host: "127.0.0.1",
      port,
      strictPort: true,
      hmr: { overlay: false },
    },
  });
  await server.listen();
  const address = server.httpServer?.address();
  say("ready", {
    port: typeof address === "object" && address ? address.port : port,
    vite: vite.version,
    runtime:
      typeof Bun === "undefined"
        ? `node ${process.version}`
        : `bun ${Bun.version}`,
  });
  setInterval(() => say("beat"), BEAT_MS);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      server.close().finally(() => process.exit(0));
    });
  }
} catch (error) {
  say("fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
