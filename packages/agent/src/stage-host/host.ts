/**
 * A workspace's stage (live components, core `stage.ts`): the project's own
 * dev toolchain started by its own programmatic API from the project's own
 * config (spec §2): Vite's `createServer`, Astro's `dev()`, Nuxt Kit's
 * `loadNuxt` and `buildNuxt`; each with CawCo's plugins added to the Vite
 * inside it ({@link cawcoStage}, {@link stamp}) and nothing written into the
 * project. The daemon (agent `stage.ts`) writes this file, bundled, to
 * `<toolchain root>/.cawco/stage/host.mjs` and runs it there inside the
 * workspace's boundary on the machine's own bun (agent user-bun.ts: the first
 * on the agent's PATH, never the runtime a binary install embeds), a
 * process of its own, so the project's toolchain never meets CawCo's process
 * (the spike: the compiled binary's own module graph can't load a project's
 * Vite, `Cannot find module 'rolldown/parseAst'`).
 *
 * Its environment: `CAWCO_STAGE=1`, which a config reads to know it runs on
 * a stage (as Storybook's `STORYBOOK`); `CAWCO_STAGE_PORT`, the port it
 * listens on, on the boundary's loopback; `CAWCO_STAGE_FRAMEWORK`, whose
 * mount function each story's frame uses; `CAWCO_STAGE_KIT=1` for SvelteKit;
 * `CAWCO_STAGE_TOOLCHAIN`, which toolchain it starts.
 *
 * It speaks to the daemon in JSON lines on stdout, each `{"cawco": <word>}`:
 * `ready` with its port once it serves, `errors` with every section's
 * problem standing (a states file that isn't written, a compile error)
 * whenever that changes, `beat` every {@link BEAT_MS}, and `fatal`
 * with why it could not start. Vite's own words go to stderr (its logger at
 * "warn"). Once nothing reads its stdout (the daemon is gone), a beat's
 * write fails and the stage ends. Astro's and Nuxt's own words go to stderr
 * too (their `logLevel` at `warn`).
 *
 * Next to it, never through a preview (the hub answers `/__cawco/` itself
 * on every preview origin), the daemon reads a sheet ({@link STORIES_PATH}:
 * its stories, args and props), writes one ({@link WRITE_PATH}: a story's
 * args, a story added, duplicated, removed or moved), reads what it loads
 * ({@link WEIGHT_PATH}) and lists the components ({@link COMPONENTS_PATH},
 * spec §6's discovery).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
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
import { hostEnvironment } from "@cawco/core/session-env";
import {
  AS_PAGE,
  CANVAS_PATH,
  CANVAS_PLAN_ID,
  COMPONENT_BUDGET,
  COMPONENTS_PATH,
  type ComponentDoc,
  DESIGN_MAP_LIMITS,
  type DesignCard,
  type DesignLink,
  type DesignMap,
  type DesignQuery,
  type DesignThumb,
  type Found,
  type FrameRender,
  HEALTH_PATH,
  type PageError,
  RENDERED_PATH,
  REPORT_PATH,
  type RenderReport,
  type ReportAnswer,
  SECTION_MISSING,
  SECTION_WRITTEN,
  type SectionPlan,
  type SectionRender,
  type SheetImport,
  type SheetOnPage,
  type SheetRead,
  type SheetWeight,
  type SheetWrite,
  type SheetWritten,
  STORIES_PATH,
  STORY_FILE,
  type StageError,
  type StageToolchain,
  sectionName,
  THUMB_FRAMES,
  WEIGHT_PATH,
  WRITE_PATH,
} from "@cawco/core/stage";
import { transformCode } from "@code-inspector/core";
import {
  originalPositionFor,
  type SourceMapInput,
  TraceMap,
} from "@jridgewell/trace-mapping";
import { propsOf } from "./docgen";
import {
  readStoryFile,
  StoryRefusal,
  storyStatement,
  writeArgs,
  writeStoryOp,
} from "./story-file";

type Framework = "svelte" | "vue" | "react" | "solid" | "preact";

/** What the stage uses of a module node in Vite's graph. */
interface ModuleNode {
  file: string | null;
  id: string | null;
  importedModules: Set<ModuleNode>;
  importers: Set<ModuleNode>;
  /** Its code as last served; null until a page asked for it. */
  transformResult: { code: string; map?: unknown } | null;
  url: string;
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
  watcher: {
    emit: (event: "change", file: string) => boolean;
    on: (
      event: "add" | "change" | "unlink",
      listener: (file: string) => void
    ) => unknown;
  };
}

/** What the stage uses of a Vite logger (vite.dev/guide/api-javascript `createLogger`). */
interface ViteLogger {
  error: (message: string, options?: object) => void;
}

/** The project's own Vite, as the stage uses it. */
interface Vite {
  createLogger: (level: "warn") => ViteLogger;
  createServer: (config: object) => Promise<DevServer>;
  version: string;
}

/** What Vite's logger says as a config file fails to load, before it throws the load's own error (Vite 8.3 `loadConfigFromFile`). */
const CONFIG_UNREAD = "failed to load config from";

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
/** A states file's section module: `cawco:sheet/<file>.js`. */
const VIRTUAL = "cawco:sheet/";
/** The canvas's own modules: its entry, runtime, adapter and Svelte props holder. */
const VIRTUAL_STAGE = "cawco:stage/";

/** Bundled in by build.ts: the canvas's browser runtime (canvas/runtime.ts), CawCo's tokens, and DialKit's vanilla build and stylesheet. */
declare const __CANVAS_RUNTIME__: string;
declare const __CANVAS_TOKENS__: string;
declare const __DIALKIT_JS__: string;
declare const __DIALKIT_CSS__: string;
declare const __CANVAS_FACES__: string;
declare const __CANVAS_FACE_FILES__: Record<string, string>;
const CANVAS_RUNTIME = __CANVAS_RUNTIME__;
const CANVAS_TOKENS = __CANVAS_TOKENS__;
const DIALKIT_JS = __DIALKIT_JS__;
const DIALKIT_CSS = __DIALKIT_CSS__;
const CANVAS_FACES = __CANVAS_FACES__;
const root = process.cwd();
const port = Number(process.env.CAWCO_STAGE_PORT);
const framework = process.env.CAWCO_STAGE_FRAMEWORK as Framework;
const kit = process.env.CAWCO_STAGE_KIT === "1";
const toolchain = process.env.CAWCO_STAGE_TOOLCHAIN as StageToolchain;
/**
 * The toolchain's caches, beside this file in the stage's own git-excluded
 * dir, never in `node_modules`: a place's `node_modules` (a symlink, a
 * workspace's hoisted to a folder above the place) can be read-only in its
 * boundary (EROFS). Vite's `cacheDir` "Default: `node_modules/.vite` … an
 * absolute file system path or a path relative to project root"
 * (vite.dev/config/shared-options); Astro's own "Default:
 * `./node_modules/.astro`" (docs.astro.build/en/reference/
 * configuration-reference/); Nuxt keeps "Explicit `vite.cacheDir` values"
 * (github.com/nuxt/nuxt/pull/35626). Vite's watcher ignores its `cacheDir`.
 */
const CACHE_DIR = resolve(root, ".cawco/stage/cache");
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
      title: read.meta.title,
    },
    components,
  };
}

/** The component files a states file mounts (its meta's and its stories' own), absolute: what its frames are drawn from. */
async function mountedFiles(abs: string, text: string): Promise<string[]> {
  const read = readStoryFile(abs, text);
  const names = [
    read.meta.component,
    ...read.stories.map((story) => story.component),
  ].filter((name): name is string => !!name);
  const files = await Promise.all(
    [...new Set(names)].map((name) => {
      const source = read.imports.get(name);
      return source ? resolved(source, abs) : Promise.resolve(null);
    })
  );
  return files.filter((file): file is string => !!file);
}

/** A source file's imports of other files, as it writes them: `import … from "…"` and `import "…"`, never a dynamic `import()`. Ours: no parser, a module's imports are its first lines. */
const IMPORT_FROM = /\bimport\s+(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']/g;
/** A file whose imports the stage reads: a component or a script. */
const SOURCE_FILE = /\.(?:svelte|vue|[cm]?[jt]sx?)$/;
/** Each source file's resolved imports, kept by the file's time. */
const importsKept = new Map<string, { at: number; to: string[] }>();

/** The files source file `file` imports (absolute), resolved as Vite resolves them; none for a file that is no source (a stylesheet, an image). */
async function sourceImports(file: string): Promise<string[]> {
  if (!SOURCE_FILE.test(file)) {
    return [];
  }
  const at = statTime(file);
  const kept = importsKept.get(file);
  if (kept?.at === at) {
    return kept.to;
  }
  const text = readFileSync(file, "utf8");
  const sources = [
    ...new Set([...text.matchAll(IMPORT_FROM)].map((one) => one[1] as string)),
  ];
  const to = (
    await Promise.all(sources.map((source) => resolved(source, file)))
  ).filter((one): one is string => !!one);
  importsKept.set(file, { at, to });
  return to;
}

/** A file of the project's own: inside the toolchain root, not a package. */
const ownFile = (file: string): boolean =>
  file.startsWith(`${root}${sep}`) &&
  !file.includes(`${sep}node_modules${sep}`);

/**
 * Every file a states file's frames are drawn from (absolute, sorted): the
 * states file, the components it mounts, and the project's own files those
 * import, all the way down. Its section's hash is of these files, and an
 * edit to any of them loads its section again (the plugin's `hotUpdate`).
 */
async function drawnFrom(abs: string, text: string): Promise<string[]> {
  const files = new Set<string>([abs]);
  let level = await mountedFiles(abs, text).catch(() => []);
  while (level.length > 0) {
    const fresh = [
      ...new Set(
        level.filter(
          (one) => !files.has(one) && ownFile(one) && existsSync(one)
        )
      ),
    ];
    for (const one of fresh) {
      files.add(one);
    }
    // biome-ignore lint/performance/noAwaitInLoops: one level of imports at a time, each level's files read at once
    level = (await Promise.all(fresh.map(sourceImports))).flat();
  }
  return [...files].sort();
}

/**
 * A states file's content hash: of every file its frames are drawn from
 * ({@link drawnFrom}). Its section's module carries it (`HASH`), a report is
 * kept under it, and an edit to any of those files makes its frames `unseen`
 * until a browser draws them again.
 */
async function contentHash(file: string): Promise<string> {
  const abs = resolve(root, file);
  const hash = createHash("sha256");
  for (const one of await drawnFrom(abs, readFileSync(abs, "utf8"))) {
    hash
      .update(relative(root, one))
      .update("\0")
      .update(readFileSync(one))
      .update("\0");
  }
  return hash.digest("hex").slice(0, 16);
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
 * Each framework's own mount function, as one `mountStory(target, story,
 * failed)` answering `unmount` and `update(props)`: `update` changes the
 * live instance's props in place, never a re-mount, so the component's own
 * motion plays (a flow move's `play`, a dial on an arg). A story is mounted
 * from its `render` when it has one (the framework's own idiom), else its
 * component with its args, and wrapped in its decorators, the story's
 * innermost and then the meta's, as Storybook's `decorateStory` does: each
 * is `(Story, context)`. A decorator is the story's ancestor as Storybook
 * nests them: what it sets in Svelte's context (`setContext`, a stand-in a
 * states file provides) is the context the story inside it mounts with
 * (`getAllContexts` where its children render, `mount`'s `context`), so
 * each frame's component reads its own decorator's, never a store the
 * frames on one page share. Svelte's props are a `$state` object
 * (`cawco:stage/svelte-props.js`, compiled by the project's own Svelte),
 * as its docs pass reactive props to `mount`; React's and Preact's render
 * again on the same root; Vue's and Solid's are their own reactive objects.
 */
const ADAPTERS: Record<Framework, string> = {
  svelte: `import { createRawSnippet, flushSync, getAllContexts, mount, unmount } from "svelte";
import { reactive } from "${VIRTUAL_STAGE}svelte-props.js";
export function mountStory(target, s) {
  const inner = () => (s.render ? s.render(s.args, s.context) : { Component: s.component, props: s.args }) ?? {};
  const props = reactive({ ...(inner().props ?? {}) });
  let result = { ...inner(), props };
  for (const decorator of s.decorators) {
    const wrapped = result;
    const outer = decorator(() => wrapped, s.context);
    result = outer && outer !== wrapped && outer.Component ? { ...outer, child: wrapped } : (outer ?? wrapped);
  }
  const undo = mountSvelte(target, result);
  return {
    unmount: undo,
    update(next) {
      s.args = { ...s.args, ...next };
      s.context.args = s.args;
      const fresh = inner().props ?? {};
      for (const key of Object.keys(props)) if (!(key in fresh) && key !== "children") delete props[key];
      Object.assign(props, fresh);
      flushSync();
    },
  };
}
function mountSvelte(target, { Component, props = {}, child }, context) {
  if (child) {
    props.children = createRawSnippet(() => ({
      render: () => '<div style="display:contents"></div>',
      setup: (el) => mountSvelte(el, child, getAllContexts()),
    }));
  }
  const instance = mount(Component, { target, props, context });
  return () => unmount(instance);
}`,
  vue: `import { createApp, h, reactive } from "vue";
export function mountStory(target, s, failed) {
  const args = reactive({ ...s.args });
  s.context.args = args;
  let story = () => s.render ? s.render(args, s.context) : { render: () => h(s.component, args) };
  for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
  const app = createApp(story());
  app.config.errorHandler = (error) => failed(error);
  app.mount(target);
  return { unmount: () => app.unmount(), update(next) { Object.assign(args, next); } };
}`,
  react: `import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
export function mountStory(target, s, failed) {
  const draw = () => {
    let story = () => s.render ? s.render(s.args, s.context) : createElement(s.component, s.args);
    for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
    return story();
  };
  const root = createRoot(target, { onUncaughtError: failed, onCaughtError: failed });
  flushSync(() => root.render(draw()));
  return {
    unmount: () => root.unmount(),
    update(next) {
      s.args = { ...s.args, ...next };
      s.context.args = s.args;
      flushSync(() => root.render(draw()));
    },
  };
}`,
  solid: `import { createComponent } from "solid-js";
import { createMutable } from "solid-js/store";
import { render } from "solid-js/web";
export function mountStory(target, s) {
  const args = createMutable({ ...s.args });
  s.context.args = args;
  let story = () => s.render ? s.render(args, s.context) : createComponent(s.component, args);
  for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
  const dispose = render(story, target);
  return { unmount: dispose, update(next) { Object.assign(args, next); } };
}`,
  preact: `import { h, render } from "preact";
export function mountStory(target, s) {
  const draw = () => {
    let story = () => s.render ? s.render(s.args, s.context) : h(s.component, s.args);
    for (const decorator of s.decorators) { const inner = story; story = () => decorator(inner, s.context); }
    return story();
  };
  render(draw(), target);
  return {
    unmount: () => render(null, target),
    update(next) { s.args = { ...s.args, ...next }; s.context.args = s.args; render(draw(), target); },
  };
}`,
};

/** The Svelte props holder's source: a `$state` object, which `mount` reads as reactive props. Compiled by the project's own Svelte. */
const SVELTE_PROPS = `export function reactive(value) {
  const props = $state(value);
  return props;
}
`;

/** The project's Svelte compiling the props holder as a runes module, as vite-plugin-svelte compiles a `.svelte.js` file. */
async function svelteProps(): Promise<string> {
  const { href } = projectPackage("svelte", "./compiler");
  const compiler = (await import(href)) as {
    compileModule: (
      source: string,
      options: { dev: boolean; filename: string; generate: "client" }
    ) => { js: { code: string } };
  };
  return compiler.compileModule(SVELTE_PROPS, {
    dev: true,
    filename: "cawco-props.svelte.js",
    generate: "client",
  }).js.code;
}

/**
 * The canvas's entry: the app's global styles, the framework's adapter and
 * the canvas runtime (canvas/runtime.ts, bundled into this host), which
 * loads each section's module as it comes into view. Vite's HMR words
 * reach the runtime as window events: `cawco:after-update` after any
 * update (a component's own edit redraws through its framework's HMR and
 * loads again each section drawn from it, and the canvas reads its frames
 * again), `cawco:stage-error` with Vite's error for a module it couldn't
 * serve, which a section that didn't load says, and {@link SECTION_WRITTEN}
 * with a states file found missing that is written now, whose section loads
 * again, fresh (`?t=`: its failed import is never the browser's to reuse).
 */
function entryModule(): string {
  const styles = globalStyles()
    .map((style) => `import ${JSON.stringify(style)};`)
    .join("\n");
  return `${styles}
import { mountStory } from "${VIRTUAL_STAGE}adapter.js";
import { boot } from "${VIRTUAL_STAGE}runtime.js";
const BASE = new URL(import.meta.url).pathname.replace(/\\/@id\\/.*$/, "");
boot({
  adapter: { mountStory },
  root: ${JSON.stringify(root)},
  tokens: ${JSON.stringify(CANVAS_TOKENS)},
  faces: ${JSON.stringify(CANVAS_FACES)},
  load: (file, fresh) => import(/* @vite-ignore */ BASE + "/@id/__x00__${VIRTUAL}" + encodeURIComponent(file) + ".js" + (fresh ? "?t=" + Date.now() : "")),
});
if (import.meta.hot) {
  import.meta.hot.on("vite:afterUpdate", () => dispatchEvent(new CustomEvent("cawco:after-update")));
  import.meta.hot.on("vite:error", (payload) => dispatchEvent(new CustomEvent("cawco:stage-error", { detail: payload.err })));
  import.meta.hot.on(${JSON.stringify(SECTION_WRITTEN)}, (data) => dispatchEvent(new CustomEvent(${JSON.stringify(SECTION_WRITTEN)}, { detail: data.file })));
}
`;
}

/**
 * One section's module: its states file, the sheet as the stage reads it
 * (stories with their labels, forms and moves; the meta; each component's
 * props), and the content hash its report is kept under. It accepts itself:
 * an edit to any file its frames are drawn from (the plugin's `hotUpdate`)
 * loads it again, with its sheet and hash read anew, and the runtime
 * remounts that section alone (`cawco:section`) and hands the inspector the
 * new sheet.
 */
async function sectionModule(file: string): Promise<string> {
  const abs = resolve(root, file);
  const sheet: SheetOnPage = { ...(await sheetRead(file)), file };
  const hash = await contentHash(file);
  return `import * as module from ${JSON.stringify(abs)};
export const SHEET = ${JSON.stringify(sheet)};
export const HASH = ${JSON.stringify(hash)};
export { module };
if (import.meta.hot) {
  import.meta.hot.accept((next) => {
    if (next) dispatchEvent(new CustomEvent("cawco:section", { detail: next }));
  });
}
`;
}

/** What a page collects before its modules run: the errors a module's evaluation throws, which the runtime reports. Ours, our markup. */
const COLLECTOR = `<script>window.__cawcoErrors=[];addEventListener("error",function(e){window.__cawcoErrors&&window.__cawcoErrors.push({at:Date.now(),error:e.error||e.message})});addEventListener("unhandledrejection",function(e){window.__cawcoErrors&&window.__cawcoErrors.push({at:Date.now(),error:e.reason})});</script>`;

/**
 * The canvas's page: the app's own page (its markup, meta and links) with
 * its placeholders stripped, its inline scripts dropped (they are the app's
 * contract with its root layout, which never mounts on a stage: the
 * dashboard's holds every tap until its layout releases them) and a Vite
 * app's own entry with them; then the error collector and the canvas's
 * entry, a virtual `.js` (a `.svelte` in an id is claimed by
 * vite-plugin-svelte). The project's own HTML transforms run over it, as on
 * any of its pages; Vite's own puts the dev server's base before the entry
 * (Nuxt's is `/_nuxt/`), so it is written without it.
 */
function canvasPage(): string {
  const entry = `/@id/__x00__${VIRTUAL_STAGE}entry.js`;
  const main = `<main id="cawco-canvas" class="cawco-canvas"></main>`;
  let html = existsSync(shellFile())
    ? readFileSync(shellFile(), "utf8")
    : "<!doctype html><html><head></head><body></body></html>";
  html = kit
    ? html.replace("%sveltekit.body%", main)
    : html.replace(ENTRY_SCRIPT, "").replace(BODY, `$1${main}$2`);
  // A phone draws the canvas at its own width, not a desktop's 980px, even where the app's page names no viewport.
  const viewport = VIEWPORT_META.test(html)
    ? ""
    : '<meta name="viewport" content="width=device-width, initial-scale=1" />';
  return html
    .replace(PLACEHOLDER, "")
    .replace(INLINE_SCRIPT, "")
    .replace("</head>", `${viewport}${COLLECTOR}</head>`)
    .replace(
      "</body>",
      `<script type="module" src="${entry}"></script></body>`
    );
}

/**
 * The newest report of each states file, kept by the stage from whichever
 * browser drew it (a person's panel or the daemon's), under the content
 * hash it was drawn from.
 */
const reports = new Map<
  string,
  {
    at: string;
    by: RenderReport["by"];
    errors: PageError[];
    section: SectionRender;
  }
>();

/** A frame across draws of one states file: its story, its state, its scheme and its form. */
const frameId = (frame: FrameRender): string =>
  `${frame.story}|${frame.interaction}|${frame.scheme}|${frame.form}`;

/**
 * Keeps what a canvas page posted (its body, unchecked until here): each
 * section under its file. A frame the page did not show (`unshown`: a
 * phone's canvas shows one frame at a time) keeps the frame the last draw
 * of the same content recorded, so a phone looking never drops what a desk
 * saw from the map's counts.
 */
function keepReport(body: unknown): void {
  const report = body as Partial<RenderReport> | null;
  for (const section of report?.sections ?? []) {
    if (typeof section?.file === "string" && storyFile(section.file)) {
      // A frame this page did not show (a phone's, one at a time) keeps what an earlier draw of the same content saw.
      const kept = reports.get(section.file);
      const seen =
        kept?.section.hash === section.hash
          ? new Map(
              kept.section.frames
                .filter((frame) => frame.state !== "unshown")
                .map((frame) => [frameId(frame), frame])
            )
          : null;
      reports.set(section.file, {
        at:
          typeof report?.at === "string" ? report.at : new Date().toISOString(),
        by: report?.by === "stage" ? "stage" : "panel",
        errors: (report?.page?.errors ?? []).map(sourced),
        section: {
          ...section,
          frames: section.frames.map((frame) => {
            if (frame.state === "unshown") {
              return seen?.get(frameId(frame)) ?? frame;
            }
            return frame.error
              ? { ...frame, error: sourced(frame.error) }
              : frame;
          }),
          moves: section.moves.map((move) =>
            move.error ? { ...move, error: sourced(move.error) } : move
          ),
        },
      });
    }
  }
}

/**
 * A page's error at its place in the project's source: the browser's stack
 * names the code Vite served (a compiled `.svelte`, a transformed `.tsx`),
 * which Vite's own sourcemap for that module maps back to the line the
 * project wrote. An error with no place, or whose module has no map, is as
 * the page said it.
 */
function sourced(error: PageError): PageError {
  if (!error.file || error.line === null || error.column === null) {
    return error;
  }
  const abs = resolve(root, error.file);
  const map = [
    ...(server?.environments.client.moduleGraph.getModulesByFile(abs) ?? []),
  ].find((one) => one.transformResult?.map)?.transformResult?.map;
  if (!(map && typeof map === "object" && "mappings" in map)) {
    return error;
  }
  let traced: ReturnType<typeof originalPositionFor>;
  try {
    traced = originalPositionFor(new TraceMap(map as SourceMapInput), {
      line: error.line,
      column: error.column - 1,
    });
  } catch {
    return error;
  }
  if (traced.line === null || traced.column === null) {
    return error;
  }
  const file = traced.source
    ? relative(root, resolve(dirname(abs), traced.source.replace(FILE_URL, "")))
    : error.file;
  return { ...error, file, line: traced.line, column: traced.column + 1 };
}
const FILE_URL = /^file:\/\//;

/**
 * The canvas of `files` as the stage knows it: each section's newest
 * report, its frames `unseen` when the file or a component it mounts
 * changed since it was drawn (or no browser ever drew it).
 */
async function reportOf(files: string[]): Promise<RenderReport> {
  const sections: SectionRender[] = [];
  const unnamed: string[] = [];
  let newest: {
    at: string;
    by: RenderReport["by"];
    errors: PageError[];
  } | null = null;
  for (const file of files) {
    const abs = resolve(root, file);
    // Not written: nothing to draw; its problem is kept beside (`keepMissing`).
    if (!existsSync(abs)) {
      sections.push({
        file,
        title: file,
        hash: "",
        frames: [],
        moves: [],
        notForced: [],
      });
      continue;
    }
    const read = readStoryFile(abs, readFileSync(abs, "utf8"));
    unnamed.push(
      ...read.stories
        .filter((one) => !one.label)
        .map((one) => `${file}:${one.name}`)
    );
    // biome-ignore lint/performance/noAwaitInLoops: each states file hashed in turn, a canvas's few
    const hash = await contentHash(file);
    const kept = reports.get(file);
    if (kept && (!newest || kept.at > newest.at)) {
      newest = kept;
    }
    if (kept && kept.section.hash === hash) {
      sections.push(kept.section);
      continue;
    }
    const stale = kept?.section.frames ?? [];
    sections.push({
      file,
      title: read.meta.title ?? file,
      hash,
      moves: [],
      notForced: kept?.section.notForced ?? [],
      frames:
        stale.length > 0
          ? stale.map((one) => ({
              ...one,
              state: "unseen" as const,
              delta: undefined,
            }))
          : read.stories.map((one) => ({
              story: one.name,
              label: one.label,
              form: one.form
                ? `${one.form.name === "custom" ? "width" : one.form.name} ${one.form.width}`
                : "fit",
              interaction: "rest" as const,
              scheme: "light" as const,
              width: one.form?.width ?? 0,
              state: "unseen" as const,
              box: { x: 0, y: 0, w: 0, h: 0 },
              text: "",
              parts: [],
            })),
    });
  }
  return {
    at: newest?.at ?? new Date(0).toISOString(),
    by: newest?.by ?? "panel",
    page: { errors: newest?.errors ?? [] },
    sections,
    unnamed,
  };
}

/**
 * DialKit's vendored vanilla build and stylesheet (decision-page kit, MIT),
 * served beside the canvas for its timeline and dials, and the house faces'
 * woff2 pieces (core house-faces.ts, cut from the repository's own Figtree
 * and JetBrains Mono, OFL) its `faces` rules name, at `faces/<file>`.
 */
const CANVAS_ASSETS: Record<string, { body: string | Buffer; type: string }> = {
  "/@cawco/dialkit.js": { body: DIALKIT_JS, type: "text/javascript" },
  "/@cawco/dialkit.css": { body: DIALKIT_CSS, type: "text/css" },
  ...Object.fromEntries(
    Object.entries(__CANVAS_FACE_FILES__).map(([name, base64]) => [
      `/@cawco/faces/${name}`,
      { body: Buffer.from(base64, "base64"), type: "font/woff2" },
    ])
  ),
};

const BODY = /(<body\b[^>]*>)[\s\S]*(<\/body>)/i;
const VIEWPORT_META = /<meta\b[^>]*\bname=["']viewport["']/i;
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

/** The canvas's page, through the project's own HTML transforms. */
async function serveCanvas(
  dev: DevServer,
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
): Promise<void> {
  try {
    const files = new URL(
      req.url ?? CANVAS_PATH,
      "http://stage"
    ).searchParams.getAll("file");
    // JSON in a script element: no `<` closes it early.
    const plan = JSON.stringify(planOf(files)).replaceAll("<", "\\u003c");
    const html = await dev.transformIndexHtml(
      req.url ?? CANVAS_PATH,
      canvasPage().replace(
        "</head>",
        `<script id="${CANVAS_PLAN_ID}" type="application/json">${plan}</script></head>`
      ),
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
 * Each states file's {@link SectionPlan} (from the toolchain root), read
 * from the file as it stands, no transform: what the canvas page names its
 * section and stands in place while the module loads. A file outside the
 * root, or one that doesn't read, is named by its file with no stories; its
 * module's load says what is wrong with it.
 */
function planOf(files: string[]): Record<string, SectionPlan> {
  return Object.fromEntries(
    files.map((file): [string, SectionPlan] => {
      const named = sectionName(null, null, file);
      const abs = resolve(root, file);
      if (relative(root, abs).startsWith("..")) {
        return [file, { name: named, stories: [] }];
      }
      try {
        const read = readStoryFile(abs, readFileSync(abs, "utf8"));
        return [
          file,
          {
            name: sectionName(read.meta.title, read.meta.component, file),
            stories: read.stories.map((story) => ({
              name: story.name,
              label: story.label,
              width: story.form?.width ?? null,
            })),
          },
        ];
      } catch {
        return [file, { name: named, stories: [] }];
      }
    })
  );
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
  const printedInto = printedStory(write);
  let by: string | null = null;
  if (printedInto) {
    ({ by, ...out } = await inProjectStyle(file, abs, out.text, printedInto));
  }
  writeFileSync(abs, out.text);
  return {
    file,
    lines: out.lines,
    formatted: by,
    sheet: await sheetRead(file, out.text),
  };
}

/** The story whose statement a write printed values into: an args write's, an added or duplicated one's; none for a removal or a move, which only move text. */
const printedStory = (write: SheetWrite): string | null => {
  if ("args" in write) {
    return write.args.story;
  }
  const op = write.story;
  if ("add" in op) {
    return op.add;
  }
  return "duplicate" in op ? op.as : null;
};

/**
 * Story file `file` (`abs`, its absolute path) with story `story`'s
 * statement formatted by the project's own formatter and spliced back, every
 * other byte of the file as it was; the statement's lines are what changed.
 * The formatter is the project's Prettier where one resolves from the
 * toolchain root (its config and `.editorconfig` for this file,
 * prettier.io/docs/api: `resolveConfig(fileUrlOrPath [, options])`), else
 * its Biome where its config and `@biomejs/biome` are there. With neither,
 * the write is refused: a write in a style the project never chose fails its
 * own checks (a one-line literal, 330 characters, failed Prettier and Biome).
 */
async function inProjectStyle(
  file: string,
  abs: string,
  text: string,
  story: string
): Promise<{ by: string; lines: { from: number; to: number }; text: string }> {
  const { from, to } = storyStatement(file, text, story);
  const shaped = await formatted(abs, text.slice(from, to));
  const styled = shaped.code.trimEnd();
  const out = text.slice(0, from) + styled + text.slice(to);
  const lineAt = (offset: number) => out.slice(0, offset).split("\n").length;
  return {
    by: shaped.by,
    text: out,
    lines: { from: lineAt(from), to: lineAt(from + styled.length) },
  };
}

/** Whether package `name` is installed from the toolchain root up, where {@link projectPackage} finds it. */
const projectInstalled = (name: string): boolean => {
  for (let dir = root; ; dir = dirname(dir)) {
    if (existsSync(join(dir, "node_modules", name, "package.json"))) {
      return true;
    }
    if (dirname(dir) === dir) {
      return false;
    }
  }
};

/** The biome binary the project installed, from the toolchain root up; none when it has none. */
const projectBiome = (): string | null => {
  for (let dir = root; ; dir = dirname(dir)) {
    const bin = join(dir, "node_modules", ".bin", "biome");
    if (existsSync(bin)) {
      return bin;
    }
    if (dirname(dir) === dir) {
      return null;
    }
  }
};

/** Whether a Biome config (`biome.json`, `biome.jsonc`) stands at the toolchain root or above it. */
const biomeConfigured = (): boolean => {
  for (let dir = root; ; dir = dirname(dir)) {
    if (BIOME_CONFIGS.some((name) => existsSync(join(dir, name)))) {
      return true;
    }
    if (dirname(dir) === dir) {
      return false;
    }
  }
};
const BIOME_CONFIGS = ["biome.json", "biome.jsonc"];

/** `code`, as story file `abs` holds it, formatted by the project's Prettier or Biome, with which; refused in words when it has neither. */
async function formatted(
  abs: string,
  code: string
): Promise<{ by: string; code: string }> {
  // The project's Prettier, from the toolchain root up; none installed, its Biome or none.
  const prettier = projectInstalled("prettier")
    ? projectPackage("prettier")
    : null;
  if (prettier) {
    const api = (await import(prettier.href)) as {
      version: string;
      format: (code: string, options: object) => Promise<string>;
      resolveConfig: (
        file: string,
        options: { editorconfig: boolean }
      ) => Promise<object | null>;
    };
    const config = await api.resolveConfig(abs, { editorconfig: true });
    return {
      by: `prettier ${api.version}`,
      code: await api.format(code, { ...config, filepath: abs }),
    };
  }
  const biome = biomeConfigured() ? projectBiome() : null;
  if (biome) {
    const ran = spawnSync(biome, ["format", `--stdin-file-path=${abs}`], {
      cwd: root,
      env: hostEnvironment(),
      input: code,
      encoding: "utf8",
    });
    if (ran.status !== 0) {
      throw new StoryRefusal(
        `The project's Biome could not format the story it wrote, so nothing was written: ${(ran.stderr || ran.stdout || `exit ${ran.status}`).trim().split("\n").slice(-3).join(" ")}`
      );
    }
    return { by: "biome", code: ran.stdout };
  }
  throw new StoryRefusal(
    `Neither Prettier nor Biome resolves from ${root}, so the sheet can't write ${relative(root, abs)} in the project's own style, and nothing was written: add the project's formatter, or edit the story file by hand.`
  );
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

/** The toolchain root's source folder: Nuxt's own (`app/` from Nuxt 4, where it holds components, not routes), else `src/` when it has one. */
const sourceTop = (): string =>
  nuxtOptions?.srcDir ??
  (existsSync(join(root, "src")) ? join(root, "src") : root);

/**
 * The components in folder `under` (absolute, in the toolchain root) (spec
 * §6's discovery): every `.svelte` and `.vue` file of the root's source
 * folder (`src/` when it has one) inside it, and every `.tsx`/`.jsx`
 * exporting a component react-docgen recognises, routes and builds left
 * out; each with the story files whose meta mounts it, wherever in the
 * source folder they are.
 */
async function discovered(under: string): Promise<Found[]> {
  // Nuxt's source dir is its own (`app/` from Nuxt 4), and its `app/` holds components, not routes.
  const top =
    nuxtOptions?.srcDir ??
    (existsSync(join(root, "src")) ? join(root, "src") : root);
  const all = componentFiles(top).filter(
    (file) => file === under || file.startsWith(`${under}${sep}`)
  );
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

/** The component files `file` imports (absolute), resolved as Vite resolves them. */
const componentImports = async (file: string): Promise<string[]> =>
  (await sourceImports(file)).filter(
    (one) => COMPONENT_FILE.test(one) && !STORY_FILE.test(one)
  );

/** A component's name from its file. */
const nameOf = (file: string): string => fileName(file);

/**
 * The design map (component canvas §4, `design_map`): the library under
 * `dir`, each component with its states, what a browser drew of them, the
 * components it renders (made of) and those that render it (used in), from
 * the frames' component chains the stage's reports keep and, before any page
 * has drawn, a static scan of each component's imports. Paged; one
 * component's card when asked.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pass joins the scan, the stories and the reports into each card
async function designMap(ask: DesignQuery): Promise<DesignMap> {
  const top = ask.dir ? resolve(root, ask.dir) : sourceTop();
  const inside = relative(root, top);
  if (inside.startsWith("..") || !existsSync(top)) {
    throw new StoryRefusal(
      `${ask.dir} is no folder inside ${root}: dir is a folder from the toolchain root, like src/lib.`
    );
  }
  const library = await discovered(top);
  let found = library;
  if (ask.query) {
    const needle = ask.query.toLowerCase();
    found = found.filter((one) => one.name.toLowerCase().includes(needle));
  }
  if (ask.component) {
    const wanted = relative(root, resolve(root, ask.component));
    found = found.filter((one) => one.file === wanted);
    if (found.length === 0) {
      throw new StoryRefusal(
        `${ask.component} is no component under ${inside || "."}: name its file from the toolchain root, like src/lib/Card.svelte, or call without component for the list.`
      );
    }
  }
  const total = found.length;
  const limit = Math.min(
    DESIGN_MAP_LIMITS.max,
    Math.max(1, ask.limit ?? DESIGN_MAP_LIMITS.limit)
  );
  const start = Math.max(0, Number(ask.cursor ?? 0) || 0);
  const page = found.slice(start, start + limit);
  const detailed = ask.detailed || !!ask.component;
  // Made of and used in: the static scan over the whole source folder, then each drawn frame's chain.
  const madeOf = new Map<string, Map<string, DesignLink>>();
  const usedIn = new Map<string, Map<string, DesignLink>>();
  const link = (from: string, to: string, at: string | null) => {
    if (from === to) {
      return;
    }
    const made = madeOf.get(from) ?? new Map<string, DesignLink>();
    const had = made.get(to);
    made.set(to, { name: nameOf(to), file: to, at: at ?? had?.at ?? null });
    madeOf.set(from, made);
    const used = usedIn.get(to) ?? new Map<string, DesignLink>();
    const was = used.get(from);
    used.set(from, {
      name: nameOf(from),
      file: from,
      at: at ?? was?.at ?? null,
    });
    usedIn.set(to, used);
  };
  const everything = componentFiles(sourceTop());
  const imports = await Promise.all(everything.map(componentImports));
  everything.forEach((file, at) => {
    for (const to of imports[at] ?? []) {
      link(relative(root, file), relative(root, to), null);
    }
  });
  const statesOf = new Map<
    string,
    { file: string; read: ReturnType<typeof readStoryFile> }[]
  >();
  for (const one of found) {
    for (const sheet of one.sheets) {
      const abs = resolve(root, sheet);
      const read = readStoryFile(abs, readFileSync(abs, "utf8"));
      statesOf.set(one.file, [
        ...(statesOf.get(one.file) ?? []),
        { file: sheet, read },
      ]);
      for (const frame of reports.get(sheet)?.section.frames ?? []) {
        for (const part of frame.parts) {
          link(one.file, part.file, part.at);
        }
      }
    }
  }
  const components: DesignCard[] = await Promise.all(
    page.map(async (one) => {
      const sheets = statesOf.get(one.file) ?? [];
      const frames = one.sheets.flatMap(
        (sheet) => reports.get(sheet)?.section.frames ?? []
      );
      const made = [...(madeOf.get(one.file)?.values() ?? [])];
      const used = [...(usedIn.get(one.file)?.values() ?? [])];
      const card: DesignCard = {
        name: one.name,
        file: one.file,
        states: sheets.reduce(
          (sum, sheet) => sum + sheet.read.stories.length,
          0
        ),
        drawn: frames.filter((frame) => frame.state === "drawn").length,
        usedIn: detailed ? used : used.length,
        madeOf: detailed ? made : made.length,
      };
      if (!detailed) {
        return card;
      }
      card.statesFiles = one.sheets;
      card.stories = sheets.flatMap((sheet) =>
        sheet.read.stories.map((story) => {
          const own = (reports.get(sheet.file)?.section.frames ?? []).filter(
            (frame) => frame.story === story.name
          );
          return {
            name: story.name,
            label: story.label,
            interactions: [...new Set(own.map((frame) => frame.interaction))],
            drawn: own.some((frame) => frame.state === "drawn"),
          };
        })
      );
      card.moves = sheets.flatMap((sheet) =>
        sheet.read.stories
          .filter((story) => story.from && story.play)
          .map((story) => ({ from: story.from as string, to: story.name }))
      );
      if (ask.component) {
        card.props = (await propsOf(resolve(root, one.file), one.name)).props;
      }
      if (ask.thumbs) {
        card.thumb = thumbOf(one.sheets);
        const known = new Map(library.map((each) => [each.file, each]));
        const counted = (links: DesignLink[]): DesignLink[] =>
          links.map((linked) => ({
            ...linked,
            ...countsOf(known.get(linked.file)?.sheets ?? []),
          }));
        card.usedIn = counted(used);
        card.madeOf = counted(made);
      }
      return card;
    })
  );
  const more = start + limit < total;
  return {
    root: ".",
    dir: inside || ".",
    components,
    total,
    has_more: more,
    next_cursor: more ? String(start + limit) : null,
    ...(more
      ? {
          steer: `${start + page.length} of ${total} under ${inside || "."}: narrow with dir or query, or pass cursor "${start + limit}".`,
        }
      : {}),
  };
}

/** A component's states, frames drawn, states files and thumbnail, from its states files (from the toolchain root): the map's counts of a linked component. */
function countsOf(
  sheets: string[]
): Required<Pick<DesignLink, "drawn" | "states" | "statesFiles" | "thumb">> {
  let states = 0;
  for (const sheet of sheets) {
    try {
      const abs = resolve(root, sheet);
      states += readStoryFile(abs, readFileSync(abs, "utf8")).stories.length;
    } catch {
      // A states file that doesn't read counts none: its canvas says why.
    }
  }
  return {
    states,
    drawn: sheets
      .flatMap((sheet) => reports.get(sheet)?.section.frames ?? [])
      .filter((frame) => frame.state === "drawn").length,
    statesFiles: sheets,
    thumb: thumbOf(sheets),
  };
}

/** How far one states file's frames stand below the one before, in a thumbnail. Ours: a frame's own gap on the canvas. */
const THUMB_GAP = 24;

/**
 * A component's frames as a browser last drew them, in miniature (the
 * panel's map): each states file's first frames from its own top left, the
 * next file's under it, at most {@link THUMB_FRAMES}; null before any drew.
 */
function thumbOf(sheets: string[]): DesignThumb | null {
  const frames: DesignThumb["frames"] = [];
  let top = 0;
  let wide = 0;
  for (const sheet of sheets) {
    const own = (reports.get(sheet)?.section.frames ?? []).slice(
      0,
      THUMB_FRAMES - frames.length
    );
    if (own.length === 0) {
      continue;
    }
    const left = Math.min(...own.map((frame) => frame.box.x));
    const up = Math.min(...own.map((frame) => frame.box.y));
    let low = 0;
    for (const { box, state } of own) {
      frames.push({
        x: box.x - left,
        y: box.y - up + top,
        w: box.w,
        h: box.h,
        state,
      });
      wide = Math.max(wide, box.x - left + box.w);
      low = Math.max(low, box.y - up + box.h);
    }
    top += low + THUMB_GAP;
  }
  return frames.length > 0 ? { frames, w: wide, h: top - THUMB_GAP } : null;
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

/** A module Vite prebundled, kept by the browser at its `?v=` address. */
const PREBUNDLED = /\/node_modules\/\.vite\/deps\/|[?&]v=/;
/** How many of a story file's imports a weight names. The design's number. */
const HEAVIEST = 3;
/** How far a weight's `via` goes down from an import. Ours: past it, the import to cut is named. */
const VIA_DEPTH = 6;

/**
 * What sheet `file` loads, walked breadth first through Vite's module graph
 * from its story file's node (spec: Vite's own graph, no scanner of ours):
 * each module a page has asked for, counted once, under the story file's
 * import that reached it first. Null until a page has loaded the sheet.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one walk of Vite's graph gives the totals, each import's share, its via, and what it brings
async function weightOf(file: string): Promise<SheetWeight | null> {
  const abs = resolve(root, file);
  const story = [
    ...(server?.environments.client.moduleGraph.getModulesByFile(abs) ?? []),
  ].find((one) => one.transformResult);
  if (!story) {
    return null;
  }
  // Each import as the story file writes it, by the file it resolves to.
  const writtenAs = new Map<string, string>();
  const read = readStoryFile(abs, readFileSync(abs, "utf8"));
  await Promise.all(
    [...new Set(read.imports.values())].map(async (source) => {
      const to = await resolved(source, abs);
      if (to) {
        writtenAs.set(to, source);
      }
    })
  );
  // Each module under the story's import that reached it first, and the module that did.
  const under = new Map<ModuleNode, ModuleNode>([[story, story]]);
  const parent = new Map<ModuleNode, ModuleNode>();
  const queue: ModuleNode[] = [];
  const reach = (mod: ModuleNode, by: ModuleNode, from: ModuleNode) => {
    if (!under.has(mod) && mod.transformResult) {
      under.set(mod, by);
      parent.set(mod, from);
      queue.push(mod);
    }
  };
  for (const top of story.importedModules) {
    reach(top, top, story);
  }
  // Breadth first: an array's iterator reaches what is pushed while it runs.
  for (const mod of queue) {
    for (const next of mod.importedModules) {
      reach(next, under.get(mod) as ModuleNode, mod);
    }
  }
  // Each module's project bytes with all it reached first, leaves up.
  const brought = new Map<ModuleNode, number>();
  const children = new Map<ModuleNode, ModuleNode[]>();
  for (const mod of queue.toReversed()) {
    const own = PREBUNDLED.test(mod.url)
      ? 0
      : (mod.transformResult?.code.length ?? 0);
    const total = own + (brought.get(mod) ?? 0);
    brought.set(mod, total);
    const up = parent.get(mod) as ModuleNode;
    brought.set(up, (brought.get(up) ?? 0) + total);
    children.set(up, [...(children.get(up) ?? []), mod]);
  }
  /** Down from `top` while one module brings at least half of the one above it. */
  const viaOf = (top: ModuleNode): string[] => {
    const path: string[] = [];
    for (let at = top; path.length < VIA_DEPTH;) {
      const [next] = (children.get(at) ?? []).sort(
        (a, b) => (brought.get(b) ?? 0) - (brought.get(a) ?? 0)
      );
      if (!next || (brought.get(next) ?? 0) * 2 < (brought.get(at) ?? 0)) {
        break;
      }
      path.push(relative(root, next.file ?? next.url));
      at = next;
    }
    return path;
  };
  const own = { modules: 0, bytes: 0 };
  const deps = { modules: 0, bytes: 0 };
  const byImport = new Map<ModuleNode, { bytes: number; modules: number }>();
  for (const [mod, top] of under) {
    const bytes = mod.transformResult?.code.length ?? 0;
    if (PREBUNDLED.test(mod.url)) {
      deps.modules += 1;
      deps.bytes += bytes;
      continue;
    }
    own.modules += 1;
    own.bytes += bytes;
    if (top !== story) {
      const sum = byImport.get(top) ?? { modules: 0, bytes: 0 };
      sum.modules += 1;
      sum.bytes += bytes;
      byImport.set(top, sum);
    }
  }
  // Modules under each module, counted where first reached.
  const countUnder = new Map<ModuleNode, number>();
  for (const mod of queue.toReversed()) {
    const up = parent.get(mod) as ModuleNode;
    const mine =
      (countUnder.get(mod) ?? 0) + (PREBUNDLED.test(mod.url) ? 0 : 1);
    countUnder.set(mod, mine);
    countUnder.set(up, (countUnder.get(up) ?? 0) + mine);
  }
  /** What `top` imports directly that brings the most: where its weight enters, no half rule. */
  const bringsOf = (top: ModuleNode) =>
    (children.get(top) ?? [])
      .filter((one) => !PREBUNDLED.test(one.url))
      .sort((a, b) => (brought.get(b) ?? 0) - (brought.get(a) ?? 0))
      .slice(0, HEAVIEST)
      .map((one) => ({
        file: relative(root, one.file ?? one.url),
        bytes: brought.get(one) ?? 0,
        modules: countUnder.get(one) ?? 1,
      }));
  const heaviest: SheetImport[] = [...byImport]
    .sort(([, a], [, b]) => b.bytes - a.bytes)
    .slice(0, HEAVIEST)
    .map(([top, sum]) => {
      const at = top.file ?? top.url;
      return {
        specifier: writtenAs.get(at) ?? relative(root, at),
        file: relative(root, at),
        ...sum,
        via: viaOf(top),
        brings: bringsOf(top),
      };
    });
  const over =
    own.modules > COMPONENT_BUDGET.modules ||
    own.bytes > COMPONENT_BUDGET.bytes;
  return {
    ...own,
    deps,
    heaviest,
    measuredAt: new Date().toISOString(),
    budget: { ...COMPONENT_BUDGET },
    over,
    cut: over ? cutOf(heaviest[0], read) : null,
  };
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/**
 * Where to cut, one sentence from the graph: the story's own component
 * bringing the weight is a seam in the component (or a fixture), never the
 * story; any other import is the story's to cut.
 */
function cutOf(
  top: SheetImport | undefined,
  read: ReturnType<typeof readStoryFile>
): string | null {
  if (!top) {
    return null;
  }
  const own = [read.meta.component, ...read.stories.map((one) => one.component)]
    .map((name) => (name ? read.imports.get(name) : undefined))
    .includes(top.specifier);
  const [entry] = top.brings;
  if (own && entry) {
    return `${top.file.split("/").at(-1)} imports ${entry.file} (${megabytes(entry.bytes)}, ${entry.modules} modules): the component reads it itself, so the cut is a seam in the component (its state as props) or a fixture, not the story.`;
  }
  return `The states file's import ${top.specifier} brings ${megabytes(top.bytes)} in ${top.modules} modules: cut it from the states file, or pass what it gives as args.`;
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the stage's every path in one router, each branch a line or two
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
    const ask = url.searchParams;
    await designMap({
      dir: ask.get("dir") ?? undefined,
      query: ask.get("query") ?? undefined,
      component: ask.get("component") ?? undefined,
      cursor: ask.get("cursor") ?? undefined,
      limit: ask.has("limit") ? Number(ask.get("limit")) : undefined,
      detailed: ask.get("detailed") === "1",
      thumbs: ask.get("thumbs") === "1",
    }).then(
      (map) => json(res, 200, map),
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
  const asset = CANVAS_ASSETS[path];
  if (asset) {
    res.setHeader("content-type", asset.type);
    res.setHeader("cache-control", "max-age=3600");
    res.end(asset.body);
    return;
  }
  if (path === RENDERED_PATH && req.method === "POST") {
    await bodyOf(req).then(
      (body) => {
        keepReport(body);
        json(res, 200, { ok: true });
      },
      (error) => refusedWith(res, error)
    );
    return;
  }
  if (
    path !== CANVAS_PATH &&
    path !== STORIES_PATH &&
    path !== WEIGHT_PATH &&
    path !== REPORT_PATH
  ) {
    next();
    return;
  }
  const named = url.searchParams.getAll("file");
  // The canvas's page is its viewer's: each section says what is wrong with
  // its file where its frames would stand (its module's load, `sectionProblem`),
  // never a refusal no page shows.
  if (path === CANVAS_PATH && named.length > 0) {
    await serveCanvas(dev, req, res, next);
    return;
  }
  const files = named.map(storyFile);
  if (named.length === 0 || files.some((one) => !one)) {
    json(res, 404, {
      error:
        (named.map(notStatesFile).find(Boolean) as string | undefined) ??
        "No file is named: a canvas names its states files as file=<path from the toolchain root>.",
    });
    return;
  }
  // A states file that isn't written is its section's problem, kept as the page's load keeps it: the read answers, the problem with it.
  keepMissing(files as string[]);
  if (path === REPORT_PATH) {
    await reportOf(files as string[]).then(
      (report) =>
        json(res, 200, {
          ...report,
          errors: [...stageErrors.values()],
        } satisfies ReportAnswer),
      (error) => refusedWith(res, error)
    );
    return;
  }
  const file = files[0] as string;
  const onDisk = existsSync(resolve(root, file));
  if (path === WEIGHT_PATH) {
    await (onDisk ? weightOf(file) : Promise.resolve(null)).then(
      (weight) => json(res, 200, { weight }),
      (error) => refusedWith(res, error)
    );
    return;
  }
  if (!onDisk) {
    json(res, 200, UNWRITTEN_SHEET);
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

/** A states file the request names, from the toolchain root, when it is one inside it (written or not); null otherwise. */
function storyFile(named: string | null): string | null {
  return named && !notStatesFile(named)
    ? relative(root, resolve(root, named))
    : null;
}

/** A states file that isn't written, as its read answers it: nothing in it yet. */
const UNWRITTEN_SHEET: SheetRead = {
  components: [],
  meta: { args: {}, code: {}, component: null, title: null },
  stories: [],
};

/**
 * Every section's problem the stage keeps, by the file it is of (absolute):
 * a states file that isn't written (`missing`, keyed by itself), or a module
 * that doesn't compile (`compile`, keyed by that module; one a section's
 * own load refused, by its states file). Told to the daemon on each change,
 * which carries it into each canvas's doc (`meta.stage.errors`): the panel
 * and the agent's read say it from there.
 */
const stageErrors = new Map<string, StageError>();
const tellErrors = () => say("errors", { errors: [...stageErrors.values()] });

/** A states file (from the toolchain root) that isn't written, as the stage keeps it: the stage's words, filed under its own section. */
const missingError = (file: string): StageError => ({
  kind: "missing",
  file,
  line: null,
  column: null,
  message: missingWords(file),
  frame: null,
  sheets: [file],
});

/**
 * Each of `files` (from the toolchain root) kept missing while it isn't
 * written, and let go once it is: the daemon told of a change, and every
 * page told to load a written one's section again ({@link SECTION_WRITTEN}).
 */
function keepMissing(files: string[]): void {
  let changed = false;
  for (const file of files) {
    const abs = resolve(root, file);
    const kept = stageErrors.get(abs);
    if (existsSync(abs)) {
      if (kept?.kind === "missing") {
        stageErrors.delete(abs);
        server?.environments.client.hot.send({
          type: "custom",
          event: SECTION_WRITTEN,
          data: { file },
        });
        changed = true;
      }
    } else if (kept?.kind !== "missing") {
      stageErrors.set(abs, missingError(file));
      changed = true;
    }
  }
  if (changed) {
    tellErrors();
  }
}

/**
 * A section's module, or why it can't be one, in the stage's words: Vite
 * sends the page the refusal (`vite:error`), which its section says; its
 * code tells a file that isn't there from one that won't compile.
 */
function sectionLoad(file: string): Promise<string> {
  const abs = resolve(root, file);
  // Nuxt's watcher passes states files by: the stage's own sees this one written.
  if (
    toolchain === "nuxt" &&
    !notStatesFile(file) &&
    existsSync(dirname(abs))
  ) {
    watchStory(abs);
  }
  const problem = sectionProblem(file);
  if (problem) {
    const missing = !(notStatesFile(file) || existsSync(abs));
    // Kept here: Vite sends this refusal with no id or place to file it by.
    if (missing) {
      keepMissing([file]);
    }
    throw Object.assign(new Error(problem), {
      pluginCode: missing ? SECTION_MISSING : undefined,
    });
  }
  return sectionModule(file).catch((error: unknown) => {
    throw placedAt(error, file);
  });
}

/** A parser's trailing place in its message: Babel's ` (2:61)`. */
const PLACE_SUFFIX = / \(\d+:\d+\)$/;

/**
 * A states file's read that threw (Babel's syntax error: its message and a
 * `loc`, 1-based line, 0-based column), placed in `file` (from the toolchain
 * root) as Vite places a plugin's error: its `loc.file`, from which Vite
 * draws the frame and names the module. Any other error as it was.
 */
function placedAt(error: unknown, file: string): unknown {
  const loc = (error as { loc?: { column?: unknown; line?: unknown } } | null)
    ?.loc;
  if (!(error instanceof Error && typeof loc?.line === "number")) {
    return error;
  }
  const abs = resolve(root, file);
  const column = typeof loc.column === "number" ? loc.column : 0;
  return Object.assign(new Error(error.message.replace(PLACE_SUFFIX, "")), {
    loc: { file: abs, line: loc.line, column },
    frame: codeFrame(abs, loc.line, column),
  });
}

/** Lines of a code frame either side of the line it points at. Ours: Vite's own frame shows two. */
const FRAME_AROUND = 2;

/**
 * A code frame as Vite draws one: the lines around 1-based `line`, each
 * numbered, and a caret under 0-based `column`; null when the file doesn't
 * read.
 */
function codeFrame(abs: string, line: number, column: number): string | null {
  let lines: string[];
  try {
    lines = readFileSync(abs, "utf8").split("\n");
  } catch {
    return null;
  }
  const from = Math.max(1, line - FRAME_AROUND);
  const to = Math.min(lines.length, line + FRAME_AROUND);
  const width = String(to).length;
  const rows: string[] = [];
  for (let at = from; at <= to; at += 1) {
    const number = String(at).padStart(width);
    rows.push(`${number} | ${lines[at - 1] ?? ""}`);
    if (at === line) {
      rows.push(`${" ".repeat(width)} | ${" ".repeat(column)}^`);
    }
  }
  return rows.join("\n");
}

/** Why `named` (from the toolchain root) can be no section at all, in the stage's words; null when it is a states file inside the root, written or not. */
function notStatesFile(named: string): string | null {
  const abs = resolve(root, named);
  return !STORY_FILE.test(named) || relative(root, abs).startsWith("..")
    ? `${named} is no states file in ${root}: a states file is a .stories.ts (or .js, .tsx, .jsx) file inside the toolchain root.`
    : null;
}

/** The stage's words for states file `named` (from the toolchain root) that isn't written: the page's section and the agent's read say them alike. */
const missingWords = (named: string): string =>
  `${named} does not exist in ${root}. The canvas draws it once its session writes it.`;

/** Why `named` (from the toolchain root) can't be a canvas's section, in the stage's words; null when it can. */
function sectionProblem(named: string): string | null {
  return (
    notStatesFile(named) ??
    (existsSync(resolve(root, named)) ? null : missingWords(named))
  );
}

/** The states file (from the toolchain root) a section module's id (`\0cawco:sheet/<file>.js`) stands for; null for any other module. */
function sectionOfId(id: string): string | null {
  const bare = id.split("?")[0] as string;
  return bare.startsWith(`\0${VIRTUAL}`)
    ? decodeURIComponent(bare.slice(VIRTUAL.length + 1, -".js".length))
    : null;
}

/** The key a module's problem is kept under: a section module's, its states file's (absolute); any other's, its own file. */
function errorKeyOf(id: string): string {
  const section = sectionOfId(id);
  return section === null
    ? (id.split("?")[0] as string)
    : resolve(root, section);
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

/** A compile error as Vite's server sends it the pages (`hot.send`, type `error`). */
interface SentError {
  frame?: string;
  id?: string;
  loc?: { column?: number; file?: string; line?: number };
  message: string;
  pluginCode?: string;
}

/**
 * The plugin: the sheet's page, its virtual module and its stories; every
 * compile error the client is sent, kept until its module compiles again
 * and told to the daemon; and Vite's launch-editor endpoint refused, which
 * opens any path on this machine (`/etc/hostname` among them) and reaches
 * anyone who can view the preview.
 */
function cawcoStage() {
  /** Each states file whose section module a page has loaded (from the root), with that module's id. */
  const sections = new Map<string, string>();

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
      if (mod.id?.startsWith(`\0${VIRTUAL}`)) {
        found.add(
          decodeURIComponent(mod.id.slice(VIRTUAL.length + 1, -".js".length))
        );
      }
      // The canvas's entry imports the app's global CSS: an error there is every canvas's.
      if (mod.id === `\0${VIRTUAL_STAGE}entry.js`) {
        for (const kept of reports.keys()) {
          found.add(kept);
        }
      }
      queue.push(...mod.importers);
    }
    return [...found];
  };

  /**
   * A compile error Vite sends the pages, kept under its module. A section's
   * own load refusal comes with neither the section module's id nor a place
   * when its states file isn't written: that one its load keeps
   * (`sectionLoad`), and it is passed by here. A states file that doesn't
   * compile stops its own section, which no module graph links it to while
   * its load fails.
   */
  const keepSent = (err: SentError) => {
    if (err.pluginCode === SECTION_MISSING) {
      return;
    }
    // The module's id is Vite's absolute path; a plugin's `loc.file` may be
    // its own (vite-plugin-svelte's is the bare file name).
    const at = resolve(
      root,
      (err.id ?? err.loc?.file ?? "").split("?")[0] as string
    );
    const file = relative(root, at);
    stageErrors.set(at, {
      kind: "compile",
      file,
      line: err.loc?.line ?? null,
      // Vite's (Rollup's) column is 0-based.
      column: typeof err.loc?.column === "number" ? err.loc.column + 1 : null,
      message: err.message,
      frame: err.frame ?? null,
      sheets: notStatesFile(file)
        ? sheetsOf(at)
        : [...new Set([file, ...sheetsOf(at)])],
    });
    tellErrors();
  };

  return {
    name: "cawco:stage",
    resolveId(id: string) {
      return id.startsWith(VIRTUAL) || id.startsWith(VIRTUAL_STAGE)
        ? `\0${id}`
        : null;
    },
    load(id: string) {
      if (id.startsWith(`\0${VIRTUAL_STAGE}`)) {
        const name = id.slice(VIRTUAL_STAGE.length + 1);
        if (name === "entry.js") {
          return entryModule();
        }
        if (name === "runtime.js") {
          return CANVAS_RUNTIME;
        }
        if (name === "adapter.js") {
          return ADAPTERS[framework];
        }
        return name === "svelte-props.js" ? svelteProps() : null;
      }
      if (!id.startsWith(`\0${VIRTUAL}`)) {
        return null;
      }
      const file = sectionOfId(id) as string;
      sections.set(file, id);
      return sectionLoad(file);
    },
    /**
     * An edit to a file a loaded section is drawn from ({@link drawnFrom}:
     * its states file, a component it mounts, a file those import) loads
     * that section's module again, with its sheet and hash read anew. Vite's
     * own propagation stops at a component that accepts itself (Svelte's,
     * React's, Vue's), so the section's module is added to the update here;
     * Vite invalidates it and sends it once (`updateModules` skips a module
     * its propagation already reached, as through a states file).
     */
    async hotUpdate(
      this: { environment: { name: string } },
      { file, modules }: { file: string; modules: ModuleNode[] }
    ) {
      const graph = server?.environments.client.moduleGraph;
      if (!graph || this.environment.name !== "client") {
        return;
      }
      const reached = await Promise.all(
        [...sections].map(async ([sheet, id]) => {
          const mod = graph.getModuleById(id);
          const abs = resolve(root, sheet);
          if (!(mod && existsSync(abs))) {
            return null;
          }
          const files = await drawnFrom(abs, readFileSync(abs, "utf8"));
          return files.includes(file) ? mod : null;
        })
      );
      const redrawn = reached.filter((mod): mod is ModuleNode => !!mod);
      return redrawn.length > 0 ? [...modules, ...redrawn] : undefined;
    },
    // A good compile of a module clears the error it had.
    transform: {
      order: "post" as const,
      handler(_code: string, id: string) {
        if (stageErrors.delete(errorKeyOf(id))) {
          tellErrors();
        }
        return null;
      },
    },
    configureServer(dev: DevServer) {
      server = dev;
      const { hot } = dev.environments.client;
      const send = hot.send.bind(hot);
      hot.send = (payload: unknown, ...rest: unknown[]) => {
        const sent = payload as { err?: SentError; type?: string } | undefined;
        if (sent?.type === "error" && sent.err) {
          keepSent(sent.err);
        }
        return send(payload, ...rest);
      };
      // A states file written lets its missing problem go; one a loaded section draws from, taken away, is missing.
      const nowWritten = (abs: string) => {
        if (stageErrors.get(abs)?.kind === "missing") {
          keepMissing([relative(root, abs)]);
        }
      };
      dev.watcher.on("add", nowWritten);
      dev.watcher.on("change", nowWritten);
      dev.watcher.on("unlink", (abs: string) => {
        const file = relative(root, abs);
        const id = sections.get(file);
        if (id === undefined) {
          return;
        }
        // Its section module's transform is kept: the next page's load must ask `sectionLoad` again, which refuses it.
        const graph = dev.environments.client.moduleGraph;
        const mod = graph.getModuleById(id);
        if (mod) {
          graph.invalidateModule(mod);
        }
        keepMissing([file]);
      });
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
  return {
    name: "cawco:stage-stamp",
    enforce: "pre" as const,
    // Ahead of every plugin's transform, a framework's own `pre` one too:
    // vite-plugin-solid compiles JSX away in its, and a project's plugins
    // stand before the stage's in the merged config.
    transform: {
      order: "pre" as const,
      handler: stampTransform,
    },
  };
}

/** One module stamped by code-inspector's transform; null when it is none the stage stamps. */
async function stampTransform(code: string, id: string) {
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
  const prefix = `data-insp-path="${root}${sep}`;
  return stamped === code
    ? null
    : { code: stamped.split(prefix).join('data-insp-path="'), map: null };
}

const JSX_FILE = /\.[jt]sx$/;

/** A Kit stub's id: `cawco:kit/navigation`. */
const KIT_STUB = "cawco:kit/";
/** `goto` and its kind on a sheet: they say so, and do nothing. */
const SAYS = (name: string) =>
  `console.info("[cawco] ${name} on a sheet does nothing")`;
const NAVIGATION_ASYNC = [
  "goto",
  "invalidate",
  "invalidateAll",
  "refreshAll",
  "preloadData",
  "preloadCode",
];
const NAVIGATION_SYNC = ["pushState", "replaceState"];
const NAVIGATION_NOOP = [
  "afterNavigate",
  "beforeNavigate",
  "onNavigate",
  "disableScrollHandling",
  "snapshot",
];
/**
 * The stub's page. Its module is evaluated on the server too: the project's
 * server hooks import client modules that import `$app/state` (the
 * dashboard's tab icon), and the alias is the whole server's, so its own
 * routes (`/prefs`, written by a story's folder tabs) answered 500 with
 * "location is not defined". There the page has no address of its own.
 */
const PAGE =
  '{ url: new URL(globalThis.location?.href ?? "http://localhost/"), params: {}, route: { id: null }, status: 200, error: null, data: {}, form: null, state: {}, shallow: null }';
const NAVIGATING =
  "{ from: null, to: null, type: null, willUnload: null, delta: null, complete: null }";

/**
 * SvelteKit's client modules on a stage, as Storybook's SvelteKit framework
 * mocks them (storybook.js.org/docs/get-started/frameworks/sveltekit:
 * `$app/navigation`, `$app/stores`, `$app/state`, `$app/forms` mocked;
 * `$app/environment`, `$app/paths` real): the real ones are Kit's client
 * router, which a sheet never starts and whose 47 files a story that reached
 * it loaded. Each export the installed Kit (3.0) has, so an import of any
 * still links.
 */
const KIT_STUBS: Record<string, string> = {
  navigation: [
    ...NAVIGATION_ASYNC.map(
      (name) =>
        `export const ${name} = () => { ${SAYS(name)}; return Promise.resolve(); };`
    ),
    ...NAVIGATION_SYNC.map(
      (name) => `export const ${name} = () => { ${SAYS(name)}; };`
    ),
    ...NAVIGATION_NOOP.map((name) => `export const ${name} = () => {};`),
  ].join("\n"),
  state: `export const page = ${PAGE};
export const navigating = ${NAVIGATING};
export const updated = { current: false, check: async () => false };`,
  stores: `import { readable } from "svelte/store";
export const page = readable(${PAGE});
export const navigating = readable(null);
export const updated = { ...readable(false), check: async () => false };
export const getStores = () => ({ page, navigating, updated });`,
  forms: `export const enhance = () => ({ destroy() {} });
export const applyAction = () => Promise.resolve();
export const deserialize = (result) => JSON.parse(result);`,
};

/**
 * The Kit stubs: `$app/<name>` aliased to `cawco:kit/<name>`, loaded from
 * {@link KIT_STUBS}. The alias goes in a config hook ordered after Kit's
 * own, whose `$app` alias would match first otherwise (Vite merges a later
 * hook's aliases ahead of the earlier ones').
 */
function cawcoKit() {
  return {
    name: "cawco:stage-kit",
    enforce: "pre" as const,
    config: {
      order: "post" as const,
      handler: () => ({
        resolve: {
          alias: Object.keys(KIT_STUBS).map((name) => ({
            find: new RegExp(`^\\$app/${name}$`),
            replacement: `${KIT_STUB}${name}`,
          })),
        },
      }),
    },
    resolveId(id: string) {
      return id.startsWith(KIT_STUB) ? `\0${id}` : null;
    },
    load(id: string) {
      return id.startsWith(`\0${KIT_STUB}`)
        ? (KIT_STUBS[id.slice(KIT_STUB.length + 1)] ?? null)
        : null;
    },
  };
}

const CONFIGS = ["ts", "mts", "js", "mjs", "cts", "cjs"].map(
  (ext) => `vite.config.${ext}`
);

/** The stage's plugins for the Vite inside any toolchain: a Svelte element carries its place already; SvelteKit's client modules are stubs. */
const plugins = () => [
  cawcoStage(),
  ...(framework === "svelte" ? [] : [stamp()]),
  ...(kit ? [cawcoKit()] : []),
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

/**
 * The project's Vite, from its own config file (vite.dev/guide/api-javascript
 * `createServer`), loaded by the stage's own runtime, which is always bun
 * (agent stage.ts): `native` "executes the original config file directly …
 * It requires a runtime that supports the syntax used by your config file"
 * (vite.dev/config), and bun reads what the default `bundle` loader does
 * (TS enums, extensionless relative imports, `__dirname` in ESM). `bundle`
 * itself "writes the bundled config to `node_modules/.vite-temp`" and fails
 * on a read-only one (Vite 8.3.4 `loadConfigFromBundledFile` falls back
 * beside the config only on EACCES, so EROFS throws; vitejs/vite#18839 open).
 * `runner` transforms the config with Vite's own oxc, which fails the whole
 * load on any `extends` it can't follow (oxc-resolver#1185, vitejs/vite
 * #21852), such as SvelteKit 3's `$app/tsconfig` before `svelte-kit sync`
 * has written it.
 */
async function startVite(): Promise<Started> {
  const vite = (await import(projectPackage("vite").href)) as Vite;
  const configFile = CONFIGS.map((name) => resolve(root, name)).find(
    existsSync
  );
  // A config that does not load fails the stage with the load's own error,
  // named as the config's: no other loader is tried (no fallback).
  const logger = vite.createLogger("warn");
  const said = logger.error;
  let unread = false;
  logger.error = (message, options) => {
    unread ||= message.includes(CONFIG_UNREAD);
    said(message, options);
  };
  const started = await vite
    .createServer({
      root,
      configFile: configFile ?? false,
      configLoader: "native",
      cacheDir: CACHE_DIR,
      clearScreen: false,
      customLogger: logger,
      plugins: plugins(),
      server: { host: HOST, port, strictPort: true, hmr: { overlay: false } },
    })
    .catch((error: unknown) => {
      throw unread && configFile
        ? new Error(
            `Vite couldn't load ${relative(root, configFile)}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error }
          )
        : error;
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
    cacheDir: CACHE_DIR,
    logLevel: "warn",
    server: { host: HOST, port },
    vite: {
      cacheDir: join(CACHE_DIR, "vite"),
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
      vite: { cacheDir: CACHE_DIR },
      // Chrome DevTools Workspaces ("Default: `true`", nuxt.com/docs/api/
      // nuxt-config): its `chrome-workspace.json` goes into
      // node_modules/.cache/nuxt, and its route hands the project's root path
      // to whoever views the preview. A sheet is no workspace to map.
      experimental: { chromeDevtoolsProjectSettings: false },
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
