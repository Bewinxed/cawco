/**
 * A workspace's stage (live components, core `stage.ts`): the project's own
 * dev toolchain started by its own programmatic API from the project's own
 * config (spec §2): Vite's `createServer`, Astro's `dev()`, Nuxt Kit's
 * `loadNuxt` and `buildNuxt`; each with CawCo's plugins added to the Vite
 * inside it ({@link cawcoStage}, {@link stamp}) and nothing written into the
 * project. The daemon (agent `stage.ts`) writes this file, bundled, to
 * `<toolchain root>/.cawco/stage/host.mjs` and runs it there inside the
 * workspace's boundary under the runtime the project's lockfile implies, so
 * the project's toolchain never meets CawCo's process (the spike: the
 * compiled binary can't load a project's Vite, `Cannot find module
 * 'rolldown/parseAst'`).
 *
 * Its environment: `CAWCO_STAGE=1`, which a config reads to know it runs on
 * a stage (as Storybook's `STORYBOOK`); `CAWCO_STAGE_PORT`, the port it
 * listens on, on the boundary's loopback; `CAWCO_STAGE_FRAMEWORK`, whose
 * mount function each story's frame uses; `CAWCO_STAGE_KIT=1` for SvelteKit;
 * `CAWCO_STAGE_TOOLCHAIN`, which toolchain it starts.
 *
 * It speaks to the daemon in JSON lines on stdout, each `{"cawco": <word>}`:
 * `ready` with its port once it serves, `errors` with every compile error
 * standing whenever that changes, `beat` every {@link BEAT_MS}, and `fatal`
 * with why it could not start. Vite's own words go to stderr (`logLevel:
 * "warn"`). Once nothing reads its stdout (the daemon is gone), a beat's
 * write fails and the stage ends. Astro's and Nuxt's own words go to stderr
 * too (their `logLevel` at `warn`).
 *
 * Next to it, never through a preview (the hub answers `/__cawco/` itself
 * on every preview origin), the daemon reads a sheet ({@link STORIES_PATH}:
 * its stories, args and props), writes one ({@link WRITE_PATH}: a story's
 * args, a story added, duplicated, removed or moved) and lists the
 * components ({@link COMPONENTS_PATH}, spec §6's discovery).
 */
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  AS_PAGE,
  COMPONENTS_PATH,
  type ComponentDoc,
  type Found,
  HEALTH_PATH,
  SHEET_PATH,
  type SheetOnPage,
  type SheetRead,
  type SheetWrite,
  type SheetWritten,
  STORIES_PATH,
  STORY_FILE,
  type StageError,
  type StageToolchain,
  WRITE_PATH,
} from "@cawco/core/stage";
import { transformCode } from "@code-inspector/core";
import { propsNames, propsOf } from "./docgen";
import {
  readStoryFile,
  StoryRefusal,
  writeArgs,
  writeStoryOp,
} from "./story-file";

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
      pluginContainer: {
        resolveId: (
          id: string,
          importer?: string
        ) => Promise<{ id: string } | null>;
      };
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
  /** Vite's file watcher (chokidar): a `change` on it is what Vite's HMR runs on. */
  watcher: { emit: (event: "change", file: string) => boolean };
}

/** The project's own Vite, as the stage uses it. */
interface Vite {
  createServer: (config: object) => Promise<DevServer>;
  version: string;
}

/** The project's own Astro, as the stage uses it: its programmatic `dev()` (docs.astro.build/en/reference/programmatic-reference/). */
interface Astro {
  dev: (config: object) => Promise<{
    address: { port: number };
    stop: () => Promise<void>;
  }>;
}

/** What the stage uses of a Nuxt instance: its options, its dev server (nitro's), its end. */
interface Nuxt {
  close: () => Promise<void>;
  options: { css: string[]; srcDir: string };
  server?: {
    listen: (
      port: number,
      options: object
    ) => Promise<{ address: { port: number } | null; server: Server }>;
  };
}

/** The project's own Nuxt Kit (`nuxt/kit`), as the stage uses it (nuxt.com/docs/api/kit/programmatic). */
interface NuxtKit {
  addVitePlugin: (plugins: object[], options: { server: boolean }) => void;
  buildNuxt: (nuxt: Nuxt) => Promise<void>;
  defineNuxtModule: (module: object) => unknown;
  loadNuxt: (options: object) => Promise<Nuxt>;
}

/** A toolchain once it serves: its port, what it is, and how it ends. */
interface Started {
  close: () => Promise<void>;
  port: number;
  version: string;
}

/** How often the stage tells the daemon it is alive. The daemon's health look is the spec's; this only ends a stage nobody reads. */
const BEAT_MS = 15_000;
const VIRTUAL = "cawco:sheet/";
const root = process.cwd();
const port = Number(process.env.CAWCO_STAGE_PORT);
const framework = process.env.CAWCO_STAGE_FRAMEWORK as Framework;
const kit = process.env.CAWCO_STAGE_KIT === "1";
const toolchain = process.env.CAWCO_STAGE_TOOLCHAIN as StageToolchain;
/** Nuxt's global CSS (`css` in its config) and source dir, once it has loaded. */
let nuxtOptions: Nuxt["options"] | undefined;

const say = (word: string, rest: object = {}) => {
  process.stdout.write(`${JSON.stringify({ cawco: word, ...rest })}\n`);
};
// Nobody reads the stage's words any more: its daemon is gone, and so is it.
process.stdout.on("error", () => process.exit(0));

/** An export map entry's file for an ES import: a string, or its `import` (then `default`) condition's. */
const importOf = (entry: unknown): string | undefined => {
  if (typeof entry === "string" || entry === undefined || entry === null) {
    return (entry ?? undefined) as string | undefined;
  }
  const conditions = entry as Record<string, unknown>;
  return importOf(conditions.import ?? conditions.default);
};

/** A package's file for an ES import of its `subpath`, by its manifest's export map, else its `module` or `main` for its root. */
function entryOf(
  manifest: { exports?: unknown; main?: string; module?: string },
  subpath: string
): string | undefined {
  const { exports } = manifest;
  // `"exports": "./x.js"` or a conditions object: sugar for `".": …`.
  const sugar =
    typeof exports === "string" ||
    (exports &&
      !Object.keys(exports).some((key: string) => key.startsWith(".")));
  if (subpath !== ".") {
    return sugar
      ? undefined
      : importOf((exports as Record<string, unknown> | undefined)?.[subpath]);
  }
  return (
    importOf(
      sugar ? exports : (exports as Record<string, unknown> | undefined)?.["."]
    ) ??
    manifest.module ??
    manifest.main
  );
}

/**
 * The project's own copy of `name` (its `subpath` export: `nuxt/kit` is
 * `nuxt`'s `./kit`), found from the toolchain root up (a workspace's
 * packages hoist); Node takes `import.meta.resolve`'s parent only behind a
 * flag, so the walk is the stage's own.
 */
function projectPackage(
  name: string,
  subpath = "."
): { href: string; version: string } {
  for (let dir = root; ; dir = dirname(dir)) {
    const pkg = join(dir, "node_modules", name, "package.json");
    if (existsSync(pkg)) {
      const json = JSON.parse(readFileSync(pkg, "utf8"));
      const entry = entryOf(json, subpath);
      if (!entry) {
        throw new Error(`${name} exports no ${subpath} under ${dir}`);
      }
      return {
        href: pathToFileURL(join(dirname(pkg), entry)).href,
        version: String(json.version),
      };
    }
    if (dirname(dir) === dir) {
      throw new Error(`${name} is not installed under ${root}`);
    }
  }
}

/** The project's dev server, once it stands: what resolves a story's imports and sends its pages HMR words. */
let server: DevServer | undefined;

/** An import of `importer` (absolute) resolved as the project's Vite does (its aliases: `#lib`, `$lib`, `@/`), from the root; null when it resolves to nothing on disk. */
async function resolved(
  source: string,
  importer: string
): Promise<string | null> {
  const found = await server?.environments.client.pluginContainer
    .resolveId(source, importer)
    .catch(() => null);
  const file = found?.id.split("?")[0];
  return file && existsSync(file) ? file : null;
}

/**
 * A story file as its stage reads it: its stories (each its export's name,
 * 1-based place and args), its meta, and the props of each component its
 * stories mount, by each framework's docgen (docgen.ts). A component the
 * stage could not resolve has no props, and says so.
 */
async function sheetRead(file: string, text?: string): Promise<SheetRead> {
  const abs = resolve(root, file);
  const read = readStoryFile(abs, text ?? readFileSync(abs, "utf8"));
  const local = new Map<string, Promise<string | null>>();
  const fileOf = (name: string | null): Promise<string | null> => {
    const source = name ? read.imports.get(name) : undefined;
    if (!(name && source)) {
      return Promise.resolve(null);
    }
    if (!local.has(name)) {
      local.set(name, resolved(source, abs));
    }
    return local.get(name) as Promise<string | null>;
  };
  const metaFile = await fileOf(read.meta.component);
  const owns = await Promise.all(
    read.stories.map((story) => fileOf(story.component))
  );
  // An Astro component renders on the server only: no mount adapter puts one in a frame.
  const astro = [metaFile, ...owns].find((one) => one && ASTRO_FILE.test(one));
  if (astro) {
    throw new StoryRefusal(
      `${relative(root, astro)} is an Astro component, which renders only on the server, so no sheet mounts it; a sheet mounts the project's Svelte, Vue, React, Solid or Preact components. ${AS_PAGE}`
    );
  }
  const stories = read.stories.map((story, at) => {
    const own = owns[at];
    return { ...story, component: own ? relative(root, own) : null };
  });
  // Each component a story mounts, by its file, under the name the file imports it by.
  const names = new Map<string, string>();
  if (metaFile && read.meta.component) {
    names.set(metaFile, read.meta.component);
  }
  read.stories.forEach((story, at) => {
    const own = owns[at];
    if (own && story.component) {
      names.set(own, story.component);
    }
  });
  const components: ComponentDoc[] = await Promise.all(
    [...names].map(([component, name]) => propsOf(component, name))
  );
  return {
    stories,
    meta: {
      args: read.meta.args,
      code: read.meta.code,
      component: metaFile ? relative(root, metaFile) : null,
    },
    components,
  };
}

const ASTRO_FILE = /\.astro$/;

/** The app's page: SvelteKit's `src/app.html`, a Vite app's `index.html`. */
const shellFile = () => resolve(root, kit ? "src/app.html" : "index.html");

const ENTRY_SCRIPT =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/i;

/**
 * The app's root modules, whose style imports are the app's global CSS:
 * SvelteKit's root layout (app.html loads no CSS: `import "../app.css"` is
 * the layout's), a Vite app's `index.html` entry script, an Astro project's
 * layouts (`src/layouts/`, where Astro's docs import global styles in the
 * frontmatter). Nuxt names its global CSS in its config instead.
 */
function rootModules(): string[] {
  if (kit) {
    return [resolve(root, "src/routes/+layout.svelte")];
  }
  if (toolchain === "astro") {
    const layouts = resolve(root, "src/layouts");
    return existsSync(layouts)
      ? readdirSync(layouts)
          .filter((one) => ASTRO_FILE.test(one))
          .map((one) => join(layouts, one))
      : [];
  }
  const shell = shellFile();
  const entry = existsSync(shell)
    ? readFileSync(shell, "utf8").match(ENTRY_SCRIPT)?.[1]
    : undefined;
  return entry ? [resolve(root, entry.replace(LEADING_SLASH, ""))] : [];
}
const LEADING_SLASH = /^\//;

const STYLE_IMPORT =
  /^\s*import\s+["']([^"']+\.(?:css|scss|sass|less|styl|stylus|pcss|postcss))["'];?/gm;

/**
 * The app's global CSS: Nuxt's `css`, else the root modules' side-effect
 * style imports, never the modules themselves: their JS (a theme, an
 * onMount) is the app's, not a sheet's.
 */
function globalStyles(): string[] {
  if (nuxtOptions) {
    return nuxtOptions.css;
  }
  const styles = rootModules()
    .filter((file) => existsSync(file))
    .flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(STYLE_IMPORT)].map((m) =>
        m[1].startsWith(".") ? resolve(dirname(file), m[1]) : m[1]
      )
    );
  return [...new Set(styles)];
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
 *
 * The inspector's side (spec §5): each run says the sheet on the window
 * (`cawco:sheet`, its stories, args and props, a token-typed prop's names
 * among them), which the overlay carries to the pane, and again when a
 * component's props change (the stage's `cawco:props`); the pane's live
 * args (`cawco:story-args`) mount a story again over the file's, with no
 * write until Save; the pane's chosen story (`cawco:story-select`) is
 * marked on its frame.
 */
async function sheetModule(file: string): Promise<string> {
  const abs = resolve(root, file);
  const sheet: SheetOnPage = { ...(await sheetRead(file)), file };
  const styles = globalStyles()
    .map((style) => `import ${JSON.stringify(style)};`)
    .join("\n");
  return `${styles}
${ADAPTERS[framework]}
import * as sheet from ${JSON.stringify(abs)};
const FILE = ${JSON.stringify(file)};
const SHEET = ${JSON.stringify(sheet)};
const STORIES = SHEET.stories;
const host = document.getElementById("cawco-sheet");
const live = new Map();
/** The pane's args over a story's own, until its Save writes them or it lets them go. */
const overrides = new Map();
let chosen = window.__cawcoSheetChosen ?? null;
function said() {
  window.__cawcoSheetOnPage = SHEET;
  dispatchEvent(new CustomEvent("cawco:sheet", { detail: SHEET }));
}
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
function mountOne(mod, story) {
  const meta = mod.default ?? {};
  const value = mod[story.name];
  if (!value) return;
  const csf = typeof value === "function" ? { render: value, ...value } : value;
  const frame = frameOf(story);
  const body = frame.querySelector(".cawco-frame-body");
  live.get(story.name)?.();
  live.delete(story.name);
  body.replaceChildren();
  const override = overrides.get(story.name);
  frame.toggleAttribute("data-cawco-edited", !!override);
  frame.toggleAttribute("data-cawco-selected", chosen === story.name);
  const args = { ...(meta.args ?? {}), ...(csf.args ?? {}), ...(override ?? {}) };
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
function render(mod) {
  for (const frame of host.querySelectorAll("[data-cawco-story]")) {
    if (!STORIES.some((story) => story.name === frame.dataset.cawcoStory)) frame.remove();
  }
  for (const story of STORIES) mountOne(mod, story);
  window.__cawcoSheet = { file: FILE, stories: STORIES.map((story) => story.name), renders: (window.__cawcoSheet?.renders ?? 0) + 1 };
  said();
}
function storyArgs(event) {
  const { story, args } = event.detail ?? {};
  const one = STORIES.find((each) => each.name === story);
  if (!one) return;
  if (args && typeof args === "object") overrides.set(story, args);
  else overrides.delete(story);
  mountOne(sheet, one);
  dispatchEvent(new CustomEvent("cawco:hmr"));
}
function storySelect(event) {
  chosen = typeof event.detail?.story === "string" ? event.detail.story : null;
  window.__cawcoSheetChosen = chosen;
  for (const frame of host.querySelectorAll("[data-cawco-story]")) {
    frame.toggleAttribute("data-cawco-selected", frame.dataset.cawcoStory === chosen);
  }
}
addEventListener("cawco:story-args", storyArgs);
addEventListener("cawco:story-select", storySelect);
render(sheet);
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    removeEventListener("cawco:story-args", storyArgs);
    removeEventListener("cawco:story-select", storySelect);
    for (const undo of live.values()) undo?.();
    live.clear();
  });
  import.meta.hot.on("vite:afterUpdate", () => dispatchEvent(new CustomEvent("cawco:hmr")));
  import.meta.hot.on("cawco:props", (doc) => {
    const at = SHEET.components.findIndex((one) => one.file === doc.file && one.name === doc.name);
    if (at === -1) return;
    SHEET.components[at] = doc;
    said();
  });
}
`;
}

/** The sheet chrome's own look: frames in a wrapping row, each hugging its story, its name over it, the inspector's story outlined and an edited one's name marked. Neutral: the project's CSS is the stories'. */
const SHEET_STYLE = `<style>
.cawco-sheet{display:flex;flex-wrap:wrap;gap:24px;padding:24px;align-items:flex-start}
.cawco-frame{display:flex;flex-direction:column;gap:8px;min-width:0}
.cawco-frame-label{all:unset;align-self:flex-start;font:12px/1.4 system-ui,sans-serif;opacity:.6;cursor:pointer;border-radius:4px;padding:0 4px}
.cawco-frame-label[data-cawco-picked]{opacity:1;outline:2px solid Highlight}
.cawco-frame[data-cawco-selected]>.cawco-frame-label{opacity:1}
.cawco-frame[data-cawco-selected]>.cawco-frame-body{outline:1px dashed Highlight;outline-offset:8px}
.cawco-frame[data-cawco-edited]>.cawco-frame-label::after{content:" · edited"}
</style>`;

/**
 * The sheet's page: the app's own page (its markup, meta and links) with its
 * placeholders stripped, its inline scripts dropped (they are the app's
 * contract with its root layout, which never mounts on a stage: the
 * dashboard's holds every tap until its layout releases them) and a Vite
 * app's own entry with them; then the sheet's module, a virtual `.js`
 * (an inline module's id would carry the story's path, and a `.svelte` in it
 * is claimed by vite-plugin-svelte). The project's own HTML transforms run
 * over it, as on any of its pages; Vite's own puts the dev server's base
 * before the entry (Nuxt's is `/_nuxt/`), so it is written without it.
 */
function sheetPage(file: string): string {
  const entry = `/@id/__x00__${VIRTUAL}${encodeURIComponent(file)}.js`;
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
  file: string
): Promise<void> {
  try {
    const html = await dev.transformIndexHtml(
      req.url ?? SHEET_PATH,
      sheetPage(file),
      (req as IncomingMessage & { originalUrl?: string }).originalUrl
    );
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.end(html);
  } catch (error) {
    next(error);
  }
}

/** A request's body, read whole as JSON. */
const bodyOf = (req: IncomingMessage): Promise<unknown> =>
  new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        fail(error);
      }
    });
    req.on("error", fail);
  });

/** Why value `value` does not fit prop `name` of the component, by its schema; null when it fits or the schema can't say. */
function misfit(
  doc: ComponentDoc | undefined,
  name: string,
  value: unknown
): string | null {
  const meta =
    doc?.types === "unknown"
      ? undefined
      : doc?.props.find((one) => one.name === name);
  if (!meta) {
    return null;
  }
  const { name: kind, raw } = meta.type;
  if (kind === "enum") {
    return meta.options?.includes(value as string | number)
      ? null
      : `${name} takes one of ${meta.options?.map((one) => JSON.stringify(one)).join(", ")}; ${JSON.stringify(value)} is none of them.`;
  }
  if (
    kind === "token-color" ||
    kind === "token-size" ||
    kind === "token-font"
  ) {
    return meta.options?.includes(value as string)
      ? null
      : `${name} takes one of the design system's ${raw} names; ${JSON.stringify(value)} is none of them.`;
  }
  if (kind === "slot") {
    return `${name} is a slot (${raw}): its content is a pin for the agent, not an arg.`;
  }
  if (kind === "function") {
    return `${name} is a function (${raw}), which is code: edit it in the file.`;
  }
  const scalar: Partial<Record<string, string>> = {
    boolean: "boolean",
    number: "number",
  };
  const wanted = scalar[kind];
  if (wanted && typeof value !== wanted) {
    return `${name} takes a ${wanted} (${raw}); ${JSON.stringify(value)} is not one.`;
  }
  if (
    kind === "string" &&
    !(
      typeof value === "string" ||
      (typeof value === "number" && raw.includes("number"))
    )
  ) {
    return `${name} takes a string (${raw}); ${JSON.stringify(value)} is not one.`;
  }
  return null;
}

/**
 * Writes a sheet's story file as `write` says (story-file.ts), refused by
 * name when a value doesn't fit its prop's type or the file can't take it.
 * The project's watcher sees the file change and the sheet redraws.
 */
async function written(write: SheetWrite): Promise<SheetWritten> {
  const file = storyFile(write.file);
  if (!file) {
    throw new StoryRefusal(`${write.file} is no story file in ${root}.`);
  }
  const abs = resolve(root, file);
  const text = readFileSync(abs, "utf8");
  let out: { lines: { from: number; to: number }; text: string };
  if ("args" in write) {
    const before = await sheetRead(file, text);
    const story = before.stories.find((one) => one.name === write.args.story);
    const component = story?.component ?? before.meta.component;
    const doc = before.components.find((one) => one.file === component);
    for (const [name, value] of Object.entries(write.args.values)) {
      const problem = misfit(doc, name, value);
      if (problem) {
        throw new StoryRefusal(`${problem} Nothing was written.`);
      }
    }
    out = writeArgs(
      file,
      text,
      write.args.story,
      write.args.values,
      write.args.unset
    );
  } else {
    const op = write.story;
    if ("add" in op) {
      const before = await sheetRead(file, text);
      const doc = before.components.find(
        (one) => one.file === before.meta.component
      );
      for (const [name, value] of Object.entries(op.args ?? {})) {
        const problem = misfit(doc, name, value);
        if (problem) {
          throw new StoryRefusal(`${problem} Nothing was written.`);
        }
      }
    }
    out = writeStoryOp(file, text, op);
  }
  writeFileSync(abs, out.text);
  return { file, lines: out.lines, sheet: await sheetRead(file, out.text) };
}

/** Folders whose components are a framework's routes, never a component a sheet shows (spec §6). */
const ROUTE_DIRS = new Set([
  "routes",
  "pages",
  "app",
  "node_modules",
  ".svelte-kit",
  ".cawco",
  "dist",
  "build",
]);
const COMPONENT_FILE = /\.(?:svelte|vue|[jt]sx)$/;
/** A `.tsx`/`.jsx` file worth asking react-docgen about: one that exports a capitalised name. Our prefilter. */
const CAPITAL_EXPORT =
  /export\s+(?:default\s+)?(?:const|function|class|let)\s+[A-Z]|export\s+default\s+[A-Z]|export\s*\{[^}]*\b[A-Z]/;
const recognised = new Map<string, { at: number; name: string | null }>();

/** Every component file under `dir`, routes and builds left out. */
function componentFiles(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((one) =>
      one.isDirectory() ? `${one.name}/` : one.name
    );
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.endsWith("/")) {
      const name = entry.slice(0, -1);
      return ROUTE_DIRS.has(name) || name.startsWith(".")
        ? []
        : componentFiles(join(dir, name));
    }
    return COMPONENT_FILE.test(entry) && !STORY_FILE.test(entry)
      ? [join(dir, entry)]
      : [];
  });
}

/** A `.tsx`/`.jsx` file's component name, when react-docgen recognises one exported from it; kept by the file's time. */
async function reactComponent(file: string): Promise<string | null> {
  const at = statTime(file);
  const hit = recognised.get(file);
  if (hit?.at === at) {
    return hit.name;
  }
  const text = readFileSync(file, "utf8");
  let name: string | null = null;
  if (CAPITAL_EXPORT.test(text)) {
    const docgen =
      (await import("react-docgen")) as typeof import("react-docgen");
    try {
      const docs = docgen.parse(text, {
        filename: file,
        babelOptions: { babelrc: false, configFile: false, root },
      });
      name = docs[0] ? (docs[0].displayName ?? fileName(file)) : null;
    } catch {
      name = null;
    }
  }
  recognised.set(file, { at, name });
  return name;
}
const statTime = (file: string): number =>
  statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0;
const fileName = (file: string): string =>
  (file.split(sep).at(-1) ?? file).replace(EXTENSION, "");
const EXTENSION = /\.[^.]+$/;

/**
 * The toolchain root's components (spec §6's discovery): every `.svelte` and
 * `.vue` file under its source folder (`src/` when it has one), and every
 * `.tsx`/`.jsx` exporting a component react-docgen recognises, routes and
 * builds left out; each with the story files whose meta mounts it.
 */
async function discovered(): Promise<Found[]> {
  // Nuxt's source dir is its own (`app/` from Nuxt 4), and its `app/` holds components, not routes.
  const top =
    nuxtOptions?.srcDir ??
    (existsSync(join(root, "src")) ? join(root, "src") : root);
  const all = componentFiles(top);
  // Each story file's meta component, resolved as Vite resolves the import: no props read.
  const shown = await Promise.all(
    (all.length > 0 ? storyFilesUnder(top) : []).map(async (story) => {
      try {
        const read = readStoryFile(story, readFileSync(story, "utf8"));
        const source = read.meta.component
          ? read.imports.get(read.meta.component)
          : undefined;
        return { story, file: source ? await resolved(source, story) : null };
      } catch {
        return { story, file: null };
      }
    })
  );
  const sheets = new Map<string, string[]>();
  for (const { story, file } of shown) {
    if (file) {
      sheets.set(file, [...(sheets.get(file) ?? []), relative(root, story)]);
    }
  }
  const names = await Promise.all(
    all.map((file) =>
      file.endsWith(".svelte") || file.endsWith(".vue")
        ? fileName(file)
        : reactComponent(file)
    )
  );
  return all.flatMap((file, at) => {
    const name = names[at];
    return name
      ? [{ name, file: relative(root, file), sheets: sheets.get(file) ?? [] }]
      : [];
  });
}

/** Every story file under `dir`, routes and builds left out. */
function storyFilesUnder(dir: string): string[] {
  let entries: { dir: boolean; name: string }[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }).map((one) => ({
      name: one.name,
      dir: one.isDirectory(),
    }));
  } catch {
    return [];
  }
  return entries.flatMap((one) => {
    if (one.dir) {
      return ROUTE_DIRS.has(one.name) || one.name.startsWith(".")
        ? []
        : storyFilesUnder(join(dir, one.name));
    }
    return STORY_FILE.test(one.name) ? [join(dir, one.name)] : [];
  });
}

/** A refusal's answer: a write the file can't take is the person's or agent's to fix (422); anything else is the stage's. */
const refusedWith = (res: ServerResponse, error: unknown) =>
  json(res, error instanceof StoryRefusal ? 422 : 500, {
    error: error instanceof Error ? error.message : String(error),
  });

/**
 * The stage's own paths: the launch-editor endpoint refused, its health, a
 * sheet's page, its read and its writes, and the components; anything else
 * goes on to the project's.
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
  if (path === COMPONENTS_PATH) {
    await discovered().then(
      (components) => json(res, 200, { components }),
      (error) => refusedWith(res, error)
    );
    return;
  }
  if (path === WRITE_PATH && req.method === "POST") {
    await bodyOf(req)
      .then((body) => written(body as SheetWrite))
      .then(
        (done) => json(res, 200, done),
        (error) => refusedWith(res, error)
      );
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
      error: `${named ?? "No file"} is no story file in ${root}: a sheet is a .stories.ts (or .js, .tsx, .jsx) file inside the toolchain root.`,
    });
    return;
  }
  if (path === SHEET_PATH) {
    await serveSheet(dev, req, res, next, file);
    return;
  }
  await sheetRead(file).then(
    (read) => json(res, 200, read),
    (error) =>
      refusedWith(
        res,
        new StoryRefusal(error instanceof Error ? error.message : String(error))
      )
  );
}

/** A story file the request names, from the toolchain root, when it is one inside it; null otherwise. */
function storyFile(named: string | null): string | null {
  if (!(named && STORY_FILE.test(named))) {
    return null;
  }
  const abs = resolve(root, named);
  const inside = relative(root, abs);
  return inside.startsWith("..") || !existsSync(abs) ? null : inside;
}

/** The folders whose story files the stage watches itself, and each story file's pending change. */
const watchedDirs = new Set<string>();
const storyChanges = new Map<string, ReturnType<typeof setTimeout>>();
/** A write's events (truncate, then content) as one change. Ours. */
const STORY_SETTLE_MS = 30;

/**
 * Nuxt keeps story files out of its Vite's watcher (its default `ignore`
 * holds `**\/*.stories.{js,cts,mts,ts,jsx,tsx}`, so its component scan
 * passes them by too), and a story's edit or a Save would never redraw its
 * sheet. The stage watches each sheet's story folder itself and hands every
 * change of a story file in it to Vite's watcher as its own `change`, the
 * event Vite's HMR runs on. The folder, not the file: an editor's atomic
 * save replaces the file's inode.
 */
function watchStory(file: string): void {
  const dir = dirname(file);
  if (watchedDirs.has(dir)) {
    return;
  }
  watchedDirs.add(dir);
  watch(dir, (_event, name) => {
    if (!(name && STORY_FILE.test(name))) {
      return;
    }
    const changed = join(dir, name);
    clearTimeout(storyChanges.get(changed));
    storyChanges.set(
      changed,
      setTimeout(() => {
        storyChanges.delete(changed);
        if (existsSync(changed)) {
          server?.watcher.emit("change", changed);
        }
      }, STORY_SETTLE_MS)
    );
  }).unref();
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
      const file = decodeURIComponent(
        id.slice(VIRTUAL.length + 1, -".js".length)
      );
      if (toolchain === "nuxt") {
        watchStory(resolve(root, file));
      }
      return sheetModule(file);
    },
    // A story file's edit runs its sheet's module again from a fresh load: its stories' places may have moved.
    // A component's edit reads its props again, and every sheet's page hears them (`cawco:props`).
    hotUpdate({ file }: { file: string }) {
      if (!server) {
        return;
      }
      if (!STORY_FILE.test(file)) {
        const { hot } = server.environments.client;
        for (const name of propsNames(file)) {
          propsOf(file, name)
            .then((doc) =>
              hot.send({ type: "custom", event: "cawco:props", data: doc })
            )
            .catch(() => undefined);
        }
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
 * toolchain root), by code-inspector's own transform (MIT, bundled into this
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

/** The stage's plugins for the Vite inside any toolchain: a Svelte element carries its place already. */
const plugins = () => [
  cawcoStage(),
  ...(framework === "svelte" ? [] : [stamp()]),
];

/**
 * The boundary's loopback alone: the daemon's bridge reaches it there, and
 * on a machine whose boundaries share the host's network (macOS) it is open
 * to nobody else.
 */
const HOST = "127.0.0.1";

/** A toolchain that took another port than the stage's: the daemon would never reach it. */
const onPort = (got: number | undefined, name: string): number => {
  if (got !== port) {
    throw new Error(
      `${name} listened on port ${got} instead of ${port}, which something else holds.`
    );
  }
  return got;
};

/** The project's Vite, from its own config file (vite.dev/guide/api-javascript `createServer`). */
async function startVite(): Promise<Started> {
  const vite = (await import(projectPackage("vite").href)) as Vite;
  const configFile = CONFIGS.map((name) => resolve(root, name)).find(
    existsSync
  );
  const started = await vite.createServer({
    root,
    configFile: configFile ?? false,
    clearScreen: false,
    logLevel: "warn",
    plugins: plugins(),
    server: { host: HOST, port, strictPort: true, hmr: { overlay: false } },
  });
  await started.listen();
  const address = started.httpServer?.address();
  return {
    port: onPort(
      typeof address === "object" && address ? address.port : undefined,
      "Vite"
    ),
    version: `vite ${vite.version}`,
    close: () => started.close(),
  };
}

/**
 * The project's Astro, from its own config, by Astro's `dev()`: "Programmatic
 * Astro API (experimental) … their API signature may change"
 * (docs.astro.build/en/reference/programmatic-reference/). Read for Astro 7
 * (agent stage.ts `ASTRO_MAJOR` refuses any other major); read again with
 * each Astro major. Its inline config is merged over the project's, its
 * `vite` by Vite's own `mergeConfig`.
 */
async function startAstro(): Promise<Started> {
  // A stage reports nothing anywhere: no telemetry from a boundary.
  process.env.ASTRO_TELEMETRY_DISABLED = "1";
  const { href, version } = projectPackage("astro");
  const astro = (await import(href)) as Astro;
  const started = await astro.dev({
    root,
    logLevel: "warn",
    server: { host: HOST, port },
    vite: {
      clearScreen: false,
      plugins: plugins(),
      server: { strictPort: true, hmr: { overlay: false } },
    },
  });
  return {
    port: onPort(started.address.port, "Astro"),
    version: `astro ${version}`,
    close: () => started.stop(),
  };
}

/**
 * The project's Nuxt, from its own config, by Nuxt Kit's `loadNuxt` with
 * CawCo's module in `overrides` ("Configuration applied above every layer,
 * including the root project's own nuxt.config", nuxt.com/docs/api/kit/
 * programmatic), then `buildNuxt`. The module adds the stage's plugins to
 * the client's Vite (`addVitePlugin`, `server: false`: a plugin Kit scopes
 * to several environments has its `configureServer` ignored by Vite). Nitro's
 * dev server listens on the stage's port, as `nuxi dev`'s does; Vite's HMR
 * socket rides the same server (`server.hmr.server`, as `nuxi dev` sets it),
 * so a preview of the port carries it.
 */
async function startNuxt(): Promise<Started> {
  const { href, version } = projectPackage("nuxt", "./kit");
  const nuxtKit = (await import(href)) as NuxtKit;
  let http: Server | undefined;
  const cawcoNuxtModule = nuxtKit.defineNuxtModule({
    meta: { name: "cawco:stage" },
    setup() {
      nuxtKit.addVitePlugin(
        [
          ...plugins(),
          {
            name: "cawco:stage-hmr",
            // Before Nuxt's own config hook, which picks a port of its own
            // (24678 on) for the socket unless it finds a server set.
            enforce: "pre",
            config: () => ({
              server: { hmr: { server: http, overlay: false } },
            }),
          },
        ],
        { server: false }
      );
    },
  });
  const nuxt = await nuxtKit.loadNuxt({
    cwd: root,
    dev: true,
    overrides: {
      modules: [cawcoNuxtModule],
      // A stage reports nothing anywhere: no telemetry from a boundary.
      telemetry: false,
    },
  });
  nuxtOptions = nuxt.options;
  if (!nuxt.server) {
    throw new Error(
      "Nuxt loaded with no dev server (nuxt.server), so it has nothing to serve a sheet with."
    );
  }
  const listener = await nuxt.server.listen(port, {
    hostname: HOST,
    showURL: false,
  });
  http = listener.server;
  // Nitro's own: it hands every socket to its server's worker, Vite's HMR
  // socket too. A sheet uses no server socket; Vite's own listener is the one.
  http.removeAllListeners("upgrade");
  onPort(listener.address?.port, "Nuxt");
  await nuxtKit.buildNuxt(nuxt);
  return {
    port,
    version: `nuxt ${version}`,
    close: () => nuxt.close(),
  };
}

const STARTS: Record<StageToolchain, () => Promise<Started>> = {
  vite: startVite,
  astro: startAstro,
  nuxt: startNuxt,
};

try {
  const started = await STARTS[toolchain]();
  say("ready", {
    port: started.port,
    toolchain: started.version,
    runtime:
      typeof Bun === "undefined"
        ? `node ${process.version}`
        : `bun ${Bun.version}`,
  });
  setInterval(() => say("beat"), BEAT_MS);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      started.close().finally(() => process.exit(0));
    });
  }
} catch (error) {
  say("fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
