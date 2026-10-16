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
  writeFileSync,
} from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
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
 * The Vite root's components (spec §6's discovery): every `.svelte` and
 * `.vue` file under its source folder (`src/` when it has one), and every
 * `.tsx`/`.jsx` exporting a component react-docgen recognises, routes and
 * builds left out; each with the story files whose meta mounts it.
 */
async function discovered(): Promise<Found[]> {
  const top = existsSync(join(root, "src")) ? join(root, "src") : root;
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
      error: `${named ?? "No file"} is no story file in ${root}: a sheet is a .stories.ts (or .js, .tsx, .jsx) file inside the Vite root.`,
    });
    return;
  }
  if (path === SHEET_PATH) {
    await serveSheet(dev, req, res, next, base, file);
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
  const started = await vite.createServer({
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
  await started.listen();
  const address = started.httpServer?.address();
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
      started.close().finally(() => process.exit(0));
    });
  }
} catch (error) {
  say("fatal", {
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
}
