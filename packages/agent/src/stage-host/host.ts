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
 * with why it could not start (the daemon leaves such a stage in error, never
 * starting it again on its own). Vite's own words go to stderr (its logger at
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
import { createHash, randomBytes } from "node:crypto";
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
import { stripVTControlCharacters } from "node:util";
import {
  linkedFolder as linkedFolderFrom,
  linkedRebundle,
} from "@cawco/core/linked-rebundle";
import { hostEnvironment } from "@cawco/core/session-env";
import {
  AS_PAGE,
  CANVAS_EMBED_GO,
  CANVAS_EMBED_GRAPH,
  CANVAS_EMBED_READY,
  CANVAS_GRAPH_FETCHED,
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
  type Found,
  type FrameRender,
  HEALTH_PATH,
  MODULES_PATH,
  type PageError,
  type PageSection,
  type PostedReport,
  RENDER_STATE_PARAM,
  RENDERED_PATH,
  REPORT_PATH,
  type RenderReport,
  type ReportAnswer,
  SECTION_MISSING,
  SECTION_WRITTEN,
  type SectionPlan,
  type SectionRender,
  type SectionSheet,
  type SectionUnloaded,
  SHEET_PATH,
  type SheetImport,
  type SheetRead,
  type SheetWeight,
  type SheetWrite,
  type SheetWritten,
  STORIES_PATH,
  STORY_FILE,
  type StageError,
  type StageFramework,
  type StageToolchain,
  sectionName,
  stageFrameworkOf,
  stageToolchainOf,
  sweptFiles,
  WEIGHT_PATH,
  WRITE_PATH,
} from "@cawco/core/stage";
import { transformCode } from "@code-inspector/core";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { parse as lex, init as lexerReady } from "es-module-lexer";
import type {
  Connect,
  ErrorPayload,
  HotPayload,
  InferCustomEventPayload,
  ViteDevServer,
} from "vite";
import { PACKAGE_TREES } from "../package-trees";
import { propsOf } from "./docgen";
import {
  codeWordOf,
  readStoryFile,
  StoryRefusal,
  storyStatement,
  writeArgs,
  writeStoryOp,
} from "./story-file";

/** What the stage uses of a module node in Vite's graph. */
interface ModuleNode {
  file: string | null;
  id: string | null;
  importedModules: Set<ModuleNode>;
  importers: Set<ModuleNode>;
  /** When it was last changed under a page (Vite's HMR), whose importers then ask for it with `?t=`; 0 when never. */
  lastHMRTimestamp: number;
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
      /** Vite's optimizer of the project's dependencies: its `browserHash` names the deps it last built (each served at `?v=<hash>`); each dependency found since, with the build that bundles it while it runs. */
      depsOptimizer?: {
        metadata: {
          browserHash: string;
          discovered: Record<string, { processing?: Promise<void> }>;
        };
      } | null;
      /** Vite's HMR channel to the pages: the stage's own events ({@link SECTION_HELD}, {@link SECTION_WRITTEN}) are typed by the augmentation of its `CustomEventMap` below. */
      hot: ViteDevServer["environments"]["client"]["hot"];
      pluginContainer: {
        resolveId: (
          id: string,
          importer?: string
        ) => Promise<{ id: string } | null>;
      };
      /** Vite's own transform of `url` ahead of a page's ask (its `warmupRequest`): kept in its graph, an error logged and passed by. */
      warmupRequest: (url: string) => Promise<void>;
      /** Vite's transform of `url` as its middleware asks it for a page (`environment.transformRequest`): what a request's error is thrown from. */
      transformRequest: (url: string, ...rest: unknown[]) => Promise<unknown>;
      moduleGraph: {
        getModuleById: (id: string) => ModuleNode | undefined;
        getModuleByUrl: (url: string) => Promise<ModuleNode | undefined>;
        getModulesByFile: (file: string) => Set<ModuleNode> | undefined;
        idToModuleMap: Map<string, ModuleNode>;
        invalidateModule: (mod: ModuleNode, ...rest: unknown[]) => void;
      };
    };
  };
  httpServer: { address: () => { port: number } | string | null } | null;
  listen: () => Promise<unknown>;
  middlewares: {
    use: (
      handle: (
        req: Connect.IncomingMessage,
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
    add: (paths: string[]) => unknown;
    emit: (event: "add" | "change", file: string) => boolean;
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

/** Bundled in by build.ts: the canvas's browser runtime (canvas/runtime.ts), CawCo's tokens and the house faces. */
declare const __CANVAS_RUNTIME__: string;
declare const __CANVAS_TOKENS__: string;
declare const __CANVAS_FACES__: string;
declare const __CANVAS_FACE_FILES__: Record<string, string>;
const CANVAS_RUNTIME = __CANVAS_RUNTIME__;
const CANVAS_TOKENS = __CANVAS_TOKENS__;
const CANVAS_FACES = __CANVAS_FACES__;
const root = process.cwd();
const port = Number(process.env.CAWCO_STAGE_PORT);
const kit = process.env.CAWCO_STAGE_KIT === "1";
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

/** `value` of the environment variable `name`; the stage's `fatal` word, and its end, where it names none. */
const environed = <T>(value: T | undefined, name: string): T => {
  if (value === undefined) {
    say("fatal", { message: `${name} names nothing the stage runs.` });
    process.exit(1);
  }
  return value;
};
const framework = environed(
  stageFrameworkOf(process.env.CAWCO_STAGE_FRAMEWORK),
  "CAWCO_STAGE_FRAMEWORK"
);
const toolchain = environed(
  stageToolchainOf(process.env.CAWCO_STAGE_TOOLCHAIN),
  "CAWCO_STAGE_TOOLCHAIN"
);

/** An export map entry's file for an ES import: a string, or its `import` (then `default`) condition's. */
const importOf = (entry: unknown): string | undefined => {
  if (typeof entry === "string") {
    return entry;
  }
  if (typeof entry !== "object" || entry === null) {
    return undefined;
  }
  const imported = "import" in entry ? entry.import : undefined;
  const fallback = "default" in entry ? entry.default : undefined;
  return importOf(imported ?? fallback);
};

/** An export map's entry for `subpath`; undefined where the map is none. */
const exportedAs = (exports: unknown, subpath: string): unknown =>
  typeof exports === "object" && exports !== null
    ? Reflect.get(exports, subpath)
    : undefined;

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
    return sugar ? undefined : importOf(exportedAs(exports, subpath));
  }
  return (
    importOf(sugar ? exports : exportedAs(exports, ".")) ??
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

/** Package `name`'s real folder when it is linked (core linked-rebundle.ts `linkedFolder`), found from the project's root up. */
const linkedFolder = (name: string): string | null =>
  linkedFolderFrom(root, name);

/** Whether module `mod` is a script a page was handed an import of (an importer of it served) that has no code served: its transform threw. */
const failedServe = (mod: ModuleNode): boolean =>
  mod.transformResult === null &&
  !mod.url.includes("?") &&
  [...mod.importers].some((importer) => importer.transformResult !== null);

/** Whether `file` is a package's own manifest outside `node_modules`: the project's, or a linked workspace package's. */
const isManifest = (file: string): boolean =>
  file.endsWith(`${sep}package.json`) &&
  !file.includes(`${sep}node_modules${sep}`);

/** The manifests of the project's linked workspace packages (`workspace:*`), each in its real folder. */
function linkedManifests(): string[] {
  const own = join(root, "package.json");
  if (!existsSync(own)) {
    return [];
  }
  const manifest: unknown = JSON.parse(readFileSync(own, "utf8"));
  const names = DEPENDENCY_FIELDS.flatMap((field) => {
    const deps: unknown =
      manifest && typeof manifest === "object"
        ? Reflect.get(manifest, field)
        : undefined;
    return deps && typeof deps === "object" ? Object.keys(deps) : [];
  });
  return [...new Set(names)]
    .map(linkedFolder)
    .filter((dir): dir is string => dir !== null)
    .map((dir) => join(dir, "package.json"));
}
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

/**
 * A manifest edit reaches Vite's resolver as a file created. Vite 8
 * resolves imports in Rolldown's native resolver (`builtin:vite-resolve`),
 * which caches every package.json it reads and clears that cache on a
 * watched file created or deleted, never on one changed (rolldown 1.2.12
 * `vite_resolve_plugin.rs` `watch_change`: "WatcherChangeKind::Create |
 * WatcherChangeKind::Delete => { self.resolvers.clear_cache(); }
 * WatcherChangeKind::Update => {}"; the same on main). An export added to
 * `@cawco/core` while the stage ran stayed "not exported under the
 * conditions" until a restart, and a linked package's manifest was not
 * even watched: Vite watches "the `root`" (vite.dev/config/server-options
 * `server.watch`) and its JS resolver's own manifests, which the native
 * resolver never reads through. So each linked package's manifest is
 * watched, and a change to any manifest is handed to Vite's watcher as an
 * `add`, its own path for a file created: every environment's plugins hear
 * it (`watchChange` with `create`: the native resolver clears its cache,
 * Vite's `vite:watch-package-data` drops its package data), then its HMR
 * runs with it ({@link cawcoStage}'s `hotUpdate` loads each section whose
 * module failed again). Nothing restarts.
 */
function relinkOnManifestChange(dev: DevServer): void {
  dev.watcher.add(linkedManifests());
  dev.watcher.on("change", (file) => {
    if (isManifest(file)) {
      dev.watcher.emit("add", file);
    }
  });
}

/**
 * Each error a page's request for a module throws names that module. Vite
 * sends a page its error with the error's own `id` (`prepareError`: "id:
 * err.id"), which a plugin's transform error carries; the native
 * resolver's throw from inside Vite's import analysis carries neither an
 * `id` nor a `loc` (`"./x" is not exported under the conditions …`,
 * `plugin: "builtin:vite-resolve"`), so the stage kept it under no file
 * and no sheet, and its frames read `unseen`. Vite's middleware asks
 * `environment.transformRequest(url)` for every module a page fetches; an
 * error thrown from it that names no module is given the id of the module
 * at `url`, the one whose transform threw, and goes on as Vite's own:
 * kept by `keepSent` under that module, with its sheets.
 */
function nameFailedModules(dev: DevServer): void {
  const env = dev.environments.client;
  const transform = env.transformRequest.bind(env);
  env.transformRequest = async (url, ...rest) => {
    try {
      return await transform(url, ...rest);
    } catch (error) {
      if (error instanceof Object && !Reflect.get(error, "id")) {
        const mod = await env.moduleGraph
          .getModuleByUrl(url)
          .catch(() => undefined);
        if (mod?.id) {
          Reflect.set(error, "id", mod.id);
        }
      }
      throw error;
    }
  };
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
 * A story file's sheet without its props: its stories (each its export's
 * name, 1-based place and args) and its meta, and each component its stories
 * mount, by its file, under the name the file imports it by. What a
 * section's module carries ({@link sectionModule}): no draw waits on docgen.
 */
async function sheetOf(
  file: string,
  text?: string
): Promise<{
  mounted: Map<string, string>;
  sheet: Omit<SheetRead, "components">;
}> {
  const abs = resolve(root, file);
  const read = readStoryFile(abs, text ?? readFileSync(abs, "utf8"));
  const local = new Map<string, Promise<string | null>>();
  const fileOf = (name: string | null): Promise<string | null> => {
    const source = name ? read.imports.get(name) : undefined;
    if (!(name && source)) {
      return Promise.resolve(null);
    }
    let pending = local.get(name);
    if (!pending) {
      pending = resolved(source, abs);
      local.set(name, pending);
    }
    return pending;
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
  return {
    mounted: names,
    sheet: {
      stories,
      meta: {
        args: read.meta.args,
        code: read.meta.code,
        component: metaFile ? relative(root, metaFile) : null,
        title: read.meta.title,
      },
    },
  };
}

/**
 * A story file as its stage reads it: its sheet ({@link sheetOf}) and the
 * props of each component its stories mount, by each framework's docgen
 * (docgen.ts). A component the stage could not resolve has no props, and
 * says so.
 */
async function sheetRead(file: string, text?: string): Promise<SheetRead> {
  const { mounted, sheet } = await sheetOf(file, text);
  const components: ComponentDoc[] = await Promise.all(
    [...mounted].map(([component, name]) => propsOf(component, name))
  );
  return { ...sheet, components };
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

/** A source file's imports of other files, as it writes them: `import … from "…"`, `import "…"` and a barrel's `export … from "…"`, never a dynamic `import()` nor an `import type`, which loads nothing. Ours: no parser, a module's imports are its first lines. */
const IMPORT_FROM =
  /\b(?:import|export)\s+(?!type\s)(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']/gu;
/** A file whose imports the stage reads: a component or a script. */
const SOURCE_FILE = /\.(?:svelte|vue|[cm]?[jt]sx?)$/u;
/**
 * Each source file's resolved imports, kept by the file's time from the
 * moment they are asked for: every walk that reaches a changed file while
 * its resolve runs shares that one resolve. Kept only once resolved, the
 * 21 walks one edit of `client.svelte.ts` started at once each resolved all
 * its imports again.
 */
const importsKept = new Map<string, { at: number; to: Promise<string[]> }>();

/** The files source file `file` imports (absolute), resolved as Vite resolves them; none for a file that is no source (a stylesheet, an image). */
function sourceImports(file: string): Promise<string[]> {
  if (!SOURCE_FILE.test(file)) {
    return Promise.resolve([]);
  }
  const at = statTime(file);
  const kept = importsKept.get(file);
  if (kept?.at === at) {
    return kept.to;
  }
  const to = resolvedImports(file);
  importsKept.set(file, { at, to });
  // A file gone mid-read is read again by the next walk.
  to.catch(() => {
    if (importsKept.get(file)?.to === to) {
      importsKept.delete(file);
    }
  });
  return to;
}

/** The files `file` imports, read from it now and resolved ({@link sourceImports} keeps them). */
async function resolvedImports(file: string): Promise<string[]> {
  const text = readFileSync(file, "utf8");
  const sources = [
    ...new Set([...text.matchAll(IMPORT_FROM)].flatMap((one) => one[1] ?? [])),
  ];
  return (
    await Promise.all(sources.map((source) => resolved(source, file)))
  ).filter((one): one is string => !!one);
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
    level = (await Promise.all(fresh.map(sourceImports))).flat();
  }
  return [...files].sort();
}

/** The event a canvas page sends the stage over Vite's HMR channel as it loads a section: `{ file }`, its states file from the root. */
const SECTION_HELD = "cawco:section-held";

/** The stage's own events over Vite's HMR channel, in Vite's own map of them (`vite/types/customEvent.d.ts`), so `hot.send` and `hot.on` carry their payloads. */
declare module "vite/types/customEvent.d.ts" {
  interface CustomEventMap {
    [SECTION_HELD]: { file: string };
    [SECTION_WRITTEN]: { file: string };
  }
}

/** Each open page's sections: the states files (from the root) its canvas has loaded, by its connection to Vite's HMR (its hot channel's client). */
const pageSections = new Map<object, Set<string>>();

/**
 * The sections an open page holds: each states file by how many pages have
 * loaded it ({@link SECTION_HELD}), let go when the last of them closes
 * (Vite's `vite:client:disconnect`), and with it its files
 * ({@link drawnKept}) and its kept report: the hub holds a canvas's last
 * draws past the stage (hub artifacts/component.ts `drawsHeld`). An edit
 * checks only these. Kept from the section module's load, a stage open all
 * day kept every states file it ever drew, and each edit checked them all.
 * A page with no HMR connection holds none: no edit reaches it either.
 */
const heldSections = new Map<string, number>();

/** Page `page` loaded the section of `file`. */
function holdSection(page: object, file: string): void {
  const own = pageSections.get(page) ?? new Set<string>();
  pageSections.set(page, own);
  if (own.has(file)) {
    return;
  }
  own.add(file);
  heldSections.set(file, (heldSections.get(file) ?? 0) + 1);
}

/**
 * A states file edited while no page holds its section (every page that
 * loaded it has closed): its section module's transform is kept with the
 * sheet read then, and the next page to load it drew that old list of
 * stories ("This canvas has no story named …" for one added since, while
 * the stories' own args, the file's own module, were new). Invalidated
 * here, its sheet is read anew on that next load. A held one is updated by
 * the plugin's `hotUpdate`, which the page hears.
 */
function forgetUnheldSheet(
  graph: {
    getModuleById: (id: string) => ModuleNode | undefined;
    invalidateModule: (mod: ModuleNode, ...rest: unknown[]) => void;
  },
  file: string,
  timestamp: number
): void {
  const edited = relative(root, file);
  const unheld = heldSections.has(edited)
    ? undefined
    : graph.getModuleById(sectionIdOf(edited));
  if (unheld) {
    graph.invalidateModule(unheld, new Set(), timestamp, true);
  }
}

/** Page `page` closed: each section no other page holds is let go. */
function releasePage(page: object): void {
  for (const file of pageSections.get(page) ?? []) {
    const left = (heldSections.get(file) ?? 1) - 1;
    if (left > 0) {
      heldSections.set(file, left);
      continue;
    }
    heldSections.delete(file);
    drawnKept.delete(file);
    reports.delete(file);
  }
  pageSections.delete(page);
}

/**
 * Each held section's files ({@link drawnFrom}), read once and kept until
 * one of them changes or a file is created or deleted (the plugin's
 * `hotUpdate`: a failed import may resolve now, a resolved one fail). An
 * edit to a file outside a section's set can't change that set: only an
 * edit to a file in it adds or drops an import. Walked again for every
 * section on every changed file, one edit of `client.svelte.ts` on a stage
 * with the dashboard's 52 states files loaded spent 2 to 9 s in Vite's
 * resolver. Sorted, as {@link drawnFrom} answers them.
 */
const drawnKept = new Map<string, Promise<Set<string>>>();

/** Held section `sheet`'s files, kept ({@link drawnKept}). */
function drawnSet(sheet: string): Promise<Set<string>> {
  const kept = drawnKept.get(sheet);
  if (kept) {
    return kept;
  }
  const abs = resolve(root, sheet);
  const read = drawnFrom(abs, readFileSync(abs, "utf8")).then(
    (files) => new Set(files)
  );
  drawnKept.set(sheet, read);
  read.catch(() => {
    if (drawnKept.get(sheet) === read) {
      drawnKept.delete(sheet);
    }
  });
  return read;
}

/**
 * A states file's content hash: of every file its frames are drawn from
 * ({@link drawnFrom}; a held section's kept, {@link drawnSet}). Its
 * section's module carries it (`HASH`), a report is kept under it, and an
 * edit to any of those files makes its frames `unseen` until a browser
 * draws them again. Each file is read now: the set is kept, never the
 * bytes.
 */
async function contentHash(file: string): Promise<string> {
  const abs = resolve(root, file);
  const files = heldSections.has(file)
    ? await drawnSet(file)
    : await drawnFrom(abs, readFileSync(abs, "utf8"));
  const hash = createHash("sha256");
  for (const one of files) {
    hash
      .update(relative(root, one))
      .update("\0")
      .update(readFileSync(one))
      .update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}

const ASTRO_FILE = /\.astro$/u;

/** The app's page: SvelteKit's `src/app.html`, a Vite app's `index.html`. */
const shellFile = () => resolve(root, kit ? "src/app.html" : "index.html");

const ENTRY_SCRIPT =
  /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/iu;

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
const LEADING_SLASH = /^\//u;

const STYLE_IMPORT =
  /^\s*import\s+["']([^"']+\.(?:css|scss|sass|less|styl|stylus|pcss|postcss))["'];?/gmu;

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
 * each frame's component reads its own decorator's. A module the component
 * imports is the page's one, save where a story's `beforeEach` imports it:
 * that story mounts from its own copy ({@link cawcoStandIns}), its
 * component and its spec read off it (canvas runtime.ts `moduleOf`).
 * Svelte's props are a `$state` object
 * (`cawco:stage/svelte-props.js`, compiled by the project's own Svelte),
 * as its docs pass reactive props to `mount`; React's and Preact's render
 * again on the same root; Vue's and Solid's are their own reactive objects.
 */
const ADAPTERS: Record<StageFramework, string> = {
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

/** Storybook's preview file's names, under the project's root: its decorators and parameters apply to every story (storybook.js.org/docs/writing-stories/decorators, "Defining the decorator in the preview file applies it to all stories"). */
const PREVIEW_FILES = ["ts", "tsx", "mts", "js", "jsx", "mjs"].map(
  (ext) => `.storybook/preview.${ext}`
);

/**
 * The project's preview file (Storybook's `.storybook/preview.*`), where
 * what the app's root gives its whole tree is given every story: a
 * provider its components read (the dashboard's tooltip provider), set as
 * a decorator. None where the project has none.
 */
function previewFile(): string | null {
  const found = PREVIEW_FILES.map((one) => resolve(root, one)).find((one) =>
    existsSync(one)
  );
  return found ?? null;
}

/**
 * The canvas's entry: the app's global styles, the project's preview file
 * ({@link previewFile}: its decorators every story's outermost), the
 * framework's adapter and the canvas runtime (canvas/runtime.ts, bundled into this host), which
 * loads each section's module as it comes into view. Vite's HMR words
 * reach the runtime as window events: `cawco:updates` with the modules an
 * update names, before it applies (a section that failed to load, among
 * them, loads again), `cawco:after-update` after any
 * update, this page's or not (a component's own edit redraws through its
 * framework's HMR and loads again each section drawn from it, which reads
 * its frames again; the canvas lays its drawing out), `cawco:stage-error` with Vite's error for a module it couldn't
 * serve, which a section that didn't load says, and {@link SECTION_WRITTEN}
 * with a states file found missing that is written now, whose section loads
 * again, fresh (`?t=`: its failed import is never the browser's to reuse).
 */
function entryModule(): string {
  const styles = globalStyles()
    .map((style) => `import ${JSON.stringify(style)};`)
    .join("\n");
  const preview = previewFile();
  return `${styles}
${preview ? `import * as preview from ${JSON.stringify(preview)};` : "const preview = {};"}
import { mountStory } from "${VIRTUAL_STAGE}adapter.js";
import { boot } from "${VIRTUAL_STAGE}runtime.js";
const BASE = new URL(import.meta.url).pathname.replace(/\\/@id\\/.*$/, "");
boot({
  adapter: { mountStory },
  preview: preview.default ?? preview,
  root: ${JSON.stringify(root)},
  tokens: ${JSON.stringify(CANVAS_TOKENS)},
  faces: ${JSON.stringify(CANVAS_FACES)},
  load: (file, fresh) => {
    import.meta.hot?.send(${JSON.stringify(SECTION_HELD)}, { file });
    return import(/* @vite-ignore */ BASE + "/@id/__x00__${VIRTUAL}" + encodeURIComponent(file) + ".js" + (fresh ? "?t=" + Date.now() : ""));
  },
});
if (import.meta.hot) {
  import.meta.hot.on("vite:beforeUpdate", (payload) => dispatchEvent(new CustomEvent("cawco:updates", { detail: payload.updates.map((one) => one.path) })));
  import.meta.hot.on("vite:afterUpdate", () => dispatchEvent(new CustomEvent("cawco:after-update")));
  import.meta.hot.on("vite:error", (payload) => dispatchEvent(new CustomEvent("cawco:stage-error", { detail: payload.err })));
  import.meta.hot.on(${JSON.stringify(SECTION_WRITTEN)}, (data) => dispatchEvent(new CustomEvent(${JSON.stringify(SECTION_WRITTEN)}, { detail: data.file })));
}
`;
}

/**
 * One section's module: its states file and its sheet as the stage reads it
 * (stories with their labels, forms and moves; the meta), never its
 * components' props nor its content hash. Both cost a cold stage a second
 * on the first module of a canvas's graph (NeedsCard: docgen 0.5 s, the
 * hash's walk of every import 0.5 s), and nothing drawn needs them: the
 * page reads the props at {@link SHEET_PATH} once it has drawn, for the
 * inspector, and the stage stamps the hash on each report it keeps
 * ({@link keepReport}). It accepts itself: an edit to any file its frames
 * are drawn from (the plugin's `hotUpdate`) loads it again, with its sheet
 * read anew, and the runtime remounts that section alone (`cawco:section`)
 * and hands the inspector the new sheet. `FRAMES` holds, by story, the copy
 * of the states file each story that holds modules of its own mounts from
 * ({@link framesOf}).
 */
async function sectionModule(file: string): Promise<string> {
  const abs = resolve(root, file);
  const sheet: SectionSheet = { ...(await sheetOf(file)).sheet, file };
  const frames = framesOf(file);
  const imports = frames
    .map(
      (one, at) =>
        `import * as frame${at} from ${JSON.stringify(`${abs}?${FRAME_QUERY}=${one.token}`)};`
    )
    .join("\n");
  const named = frames
    .map((one, at) => `${JSON.stringify(one.story)}: frame${at}`)
    .join(", ");
  return `import * as module from ${JSON.stringify(abs)};
${imports}
export const SHEET = ${JSON.stringify(sheet)};
export const FRAMES = { ${named} };
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
  const entry = CANVAS_ENTRY;
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
 * hash it was drawn from. Held by this process alone: it ends with the
 * stage (asleep, restarted, its daemon or its clone made again), so each
 * section it answers says whether it holds a draw (`drawn`), and the hub
 * keeps a canvas's last draws past it (hub artifacts/component.ts
 * `drawsHeld`).
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

/**
 * The states files a page said it is drawing (its sweep had not reached
 * them, or a read of them was under way), each with when it last said so:
 * a report answers them as drawing until that page posts their section, or
 * for {@link DRAWING_HELD_MS} after it last said so (a page closed mid-read
 * says nothing more).
 */
const drawingSaid = new Map<string, number>();
/** How long a page's word that it is drawing a section holds. Ours: past a section's read held aside by the person's acts, which posts again as each section ends. */
const DRAWING_HELD_MS = 20_000;

/** What a post says of its page's drawing: each section it posts is drawn, each file it names under `drawing` is being drawn now. */
function keepDrawing(
  posted: readonly ({ file?: unknown } | null)[],
  drawing: readonly unknown[]
): void {
  for (const section of posted) {
    if (typeof section?.file === "string") {
      drawingSaid.delete(section.file);
    }
  }
  for (const file of drawing) {
    if (typeof file === "string" && storyFile(file)) {
      drawingSaid.set(file, Date.now());
    }
  }
}

/** A frame across draws of one states file: its story, its state, its scheme and its form. */
const frameId = (frame: FrameRender): string =>
  `${frame.story}|${frame.interaction}|${frame.scheme}|${frame.form}`;

/**
 * Keeps what a canvas page posted (its body, unchecked until here): each
 * section under its file, stamped with its content hash as its files stand
 * now (`contentHash`, read here and never on the page's path: an edit
 * since the draw loaded the section again, which draws and posts again). A
 * frame the page did not show (`unshown`: a phone's canvas shows one frame
 * at a time) keeps the frame the last draw of the same content recorded, so
 * a phone looking never drops what a desk saw from the map's counts.
 */
async function keepReport(body: unknown): Promise<void> {
  const report = body as Partial<PostedReport> | null;
  keepUnloaded(report?.unloaded ?? [], report?.sections ?? []);
  keepDrawing(report?.sections ?? [], report?.drawing ?? []);
  for (const drawn of report?.sections ?? []) {
    if (typeof drawn?.file === "string" && storyFile(drawn.file)) {
      const section: SectionRender = {
        ...drawn,
        hash: await contentHash(drawn.file),
      };
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
    traced = originalPositionFor(new TraceMap(JSON.stringify(map)), {
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
const FILE_URL = /^file:\/\//u;

/**
 * The state of each frame of states file `file` (from the root) no current
 * draw holds: failed with the stage's words for the problem standing on
 * its sheet (a module of it that doesn't compile, or a page that couldn't
 * load its section), else unseen. A states file that isn't written has no
 * frames to say it on.
 */
function unloadedState(file: string): {
  error?: PageError;
  state: "failed" | "unseen";
} {
  const standing = [...stageErrors.values()].find(
    (one) => one.kind !== "missing" && one.sheets.includes(file)
  );
  return standing
    ? {
        state: "failed",
        error: {
          message: standing.message,
          file: standing.file,
          line: standing.line,
          column: standing.column,
        },
      }
    : { state: "unseen" };
}

/** What states file `file` says that the report names (core `RenderReport`): its stories that differ only by width, and its labels that say a word of code. */
function sheetFindings(
  file: string,
  read: ReturnType<typeof readStoryFile>
): Required<Pick<RenderReport, "codeNamed" | "widthOnly">> {
  const names = [
    ...read.stories.map((one) => one.name),
    ...read.imports.keys(),
  ];
  return {
    widthOnly: read.widthOnly.map((group) =>
      group.map((story) => `${file}:${story}`)
    ),
    codeNamed: read.stories.flatMap((one) => {
      const word = one.label ? codeWordOf(one.label, names) : null;
      return word ? [{ story: `${file}:${one.name}`, word }] : [];
    }),
  };
}

/**
 * The canvas of `files` as the stage knows it: each section's newest
 * report, its frames `unseen` when the file or a component it mounts
 * changed since it was drawn (or no browser ever drew it), `failed` with the
 * page's error when a page couldn't load its section.
 */
async function reportOf(files: string[]): Promise<RenderReport> {
  const sections: SectionRender[] = [];
  const unnamed: string[] = [];
  const widthOnly: string[][] = [];
  const codeNamed: { story: string; word: string }[] = [];
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
    const said = sheetFindings(file, read);
    widthOnly.push(...said.widthOnly);
    codeNamed.push(...said.codeNamed);
    const hash = await contentHash(file);
    const kept = reports.get(file);
    if (kept && (!newest || kept.at > newest.at)) {
      newest = kept;
    }
    // A draw of the files as they stand: said with when and by whom, which the hub keeps past this process (hub artifacts/component.ts `drawsHeld`).
    if (kept && kept.section.hash === hash) {
      sections.push({ ...kept.section, drawn: { at: kept.at, by: kept.by } });
      continue;
    }
    const failed = unloadedState(file);
    const stale = failed.error ? [] : (kept?.section.frames ?? []);
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
              ...failed,
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
    widthOnly,
    codeNamed,
    ...drawingOf(files),
  };
}

/** The report's `drawing`: those of `files` a page said it is drawing, within {@link DRAWING_HELD_MS}. */
function drawingOf(files: string[]): Pick<RenderReport, "drawing"> {
  const now = Date.now();
  const drawing = files.filter(
    (file) =>
      now - (drawingSaid.get(file) ?? Number.NEGATIVE_INFINITY) <
      DRAWING_HELD_MS
  );
  return drawing.length > 0 ? { drawing } : {};
}

/**
 * The house faces' woff2 pieces (core house-faces.ts, cut from the
 * repository's own Figtree and JetBrains Mono, OFL) the canvas page's
 * `faces` rules name, served beside it at `faces/<file>`.
 */
const CANVAS_ASSETS: Record<string, { body: string | Buffer; type: string }> = {
  ...Object.fromEntries(
    Object.entries(__CANVAS_FACE_FILES__).map(([name, base64]) => [
      `/@cawco/faces/${name}`,
      { body: Buffer.from(base64, "base64"), type: "font/woff2" },
    ])
  ),
};

const BODY = /(<body\b[^>]*>)[\s\S]*(<\/body>)/iu;
const VIEWPORT_META = /<meta\b[^>]*\bname=["']viewport["']/iu;
/** `%sveltekit.head%`, `%sveltekit.assets%` … and a project's own (`%cawco.tab-icon%`). */
const PLACEHOLDER = /%[\w.-]+%/gu;
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/giu;
const TRAILING_SLASH = /\/$/u;

/** A JSON answer, never cached. */
const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
};

/**
 * The canvas page's preloads of its whole graph, each counted as it answers
 * (core `CanvasGraph`): once every one has, the page dispatches
 * `CANVAS_GRAPH_FETCHED`, so an embed tells the page holding it its graph
 * arrived before it evaluates it (runtime.ts, `CANVAS_EMBED_FETCHED`).
 * Measured on caw-panel's States, cold: its 839 preloads answered 1.5 s
 * in, its frame drew 3.8 s in; the 2.3 s between are the page's main thread
 * evaluating the graph, which the next embed's fetch may overlap.
 *
 * Each preload's answer is heard by one listener on the document (`load`
 * and `error` reach it in their capture phase), never by a handler of its
 * own: a handler attribute is a script the frame compiles, 665 of them for
 * a 665-module graph.
 *
 * A Preview's page (`embed`, framed) asks for none of its graph until the
 * page holding it says so (dashboard decisions host embed-turns.ts: a
 * page's embeds fetch together, each module asked of the network once): it
 * tells that page every module's address (core `CANVAS_EMBED_GRAPH`),
 * preloads its share on `CANVAS_EMBED_GO` (counted as above: its `asked`),
 * and the rest of its graph, which another frame's fetch has put in the
 * renderer's cache, on `CANVAS_EMBED_READY`, which settles the graph's `go`
 * (the runtime loads its stories after it). Any other page, or one opened
 * on its own, preloads its graph as it is read.
 */
const graphPreloads = (urls: string[], embed: boolean, key: string): string => {
  const count = `var g=window.__cawcoGraph={asked:${urls.length},done:0,whole:false,go:null};function check(){if(!g.whole&&g.done>=g.asked){g.whole=true;document.removeEventListener("load",heard,true);document.removeEventListener("error",heard,true);dispatchEvent(new Event(${JSON.stringify(CANVAS_GRAPH_FETCHED)}))}}function heard(e){var t=e.target;if(!(t instanceof HTMLLinkElement&&t.rel==="modulepreload"))return;g.done+=1;check()}document.addEventListener("load",heard,true);document.addEventListener("error",heard,true);`;
  if (!embed) {
    return `<script>(function(){${count}g.go=Promise.resolve()})();</script>${urls
      .map((url) => `<link rel="modulepreload" href="${escapeAttr(url)}">`)
      .join("")}`;
  }
  // At the page's key, as `keyedPage` keys its tags (the modules' own imports ask for them so); JSON in a script element: no `<` closes it early.
  const list = JSON.stringify(urls.map((url) => keyedUrl(url, key))).replaceAll(
    "<",
    "\\u003c"
  );
  const go = JSON.stringify(CANVAS_EMBED_GO);
  const ready = JSON.stringify(CANVAS_EMBED_READY);
  return `<script>(function(){var u=${list};${count}function preload(list){var f=document.createDocumentFragment();list.forEach(function(x){var l=document.createElement("link");l.rel="modulepreload";l.href=x;f.appendChild(l)});document.head.appendChild(f)}g.go=new Promise(function(go){if(window.parent===window){preload(u);go();return}addEventListener("message",function hear(e){var d=e.data;if(e.source!==window.parent||!d||!Array.isArray(d.urls))return;if(d.type===${go}){g.asked=d.urls.length;preload(d.urls);check()}else if(d.type===${ready}){removeEventListener("message",hear);preload(d.urls);go()}});window.parent.postMessage({type:${JSON.stringify(CANVAS_EMBED_GRAPH)},urls:u.map(function(x){return new URL(x,location.href).href})},"*")})})();</script>`;
};

/** The canvas's page, through the project's own HTML transforms. */
async function serveCanvas(
  dev: DevServer,
  req: Connect.IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void
): Promise<void> {
  try {
    const asked = new URL(req.url ?? CANVAS_PATH, "http://stage").searchParams;
    const files = asked.getAll("file");
    // JSON in a script element: no `<` closes it early.
    const plans = planOf(files);
    const plan = JSON.stringify(plans).replaceAll("<", "\\u003c");
    const by = asked.get("by");
    const embed = by === "embed";
    // The sections the page loads at once: an embed's every one (runtime.ts `pump`); a stage's render, every one its sweep takes; a panel's, its first, the others as each nears the view.
    let loaded = files.slice(0, 1);
    if (embed) {
      loaded = files;
    } else if (by === "stage") {
      loaded = sweptFiles(files, plans, asked.get(RENDER_STATE_PARAM));
    }
    const urls = await settledClosureOf(dev, loaded);
    // One key for the page's tags and its graph's list, read once its graph has settled.
    const key = generationOf(dev);
    const preloads = graphPreloads(urls, embed, key);
    const html = keyedPage(
      await dev.transformIndexHtml(
        req.url ?? CANVAS_PATH,
        canvasPage().replace(
          "</head>",
          `<script id="${CANVAS_PLAN_ID}" type="application/json">${plan}</script>${preloads}</head>`
        ),
        req.originalUrl
      ),
      key
    );
    res.setHeader("content-type", "text/html");
    res.setHeader("cache-control", "no-store");
    res.end(html);
  } catch (error) {
    next(error);
  }
}

/*
 * A canvas page's modules, at the stage's generation: `/@cawco/m/<key>/<the
 * module's own address>`, Vite's prebundled dependencies too (one of them
 * may import a module of the page's: the stage's `cawco:yjs`, which imports
 * Vite's client). The key is new whenever Vite lets go of a module's
 * served code ({@link rekeyOnInvalidate}) or its server starts, and with
 * each build of the dependencies, so one
 * address always holds one module's code: kept by the browser for good
 * (`immutable`), a decision page's embeds of one states file fetch each
 * module once, where through the hub's preview proxy each fetched all of
 * them again (`no-store`, the only policy Cloudflare leaves a dev server's
 * module: 1,370 of the comment-card page's 3,430 requests). `private`: the
 * project's source is kept by the person's browser, never at a CDN's edge.
 *
 * Every address a keyed module imports is keyed with it, the page's own
 * key, so its graph stays one generation's; a changed module reaches an
 * open page by Vite's HMR, which Vite's client asks for at the page's key
 * with its `?t=`.
 */
const KEPT = "private, max-age=31536000, immutable";
const newGeneration = (): string => randomBytes(9).toString("base64url");
let generation = newGeneration();

/** A new generation: every page loaded from now asks for its modules at new addresses. */
const rekey = () => {
  generation = newGeneration();
  keyedServed.clear();
};

/**
 * Keys anew whenever Vite lets go of a module's served code (its graph's
 * `invalidateModule`): a file a module is read from changed (one the pages
 * import, or one a plugin said a module depends on: Tailwind's every
 * scanned source, by `addWatchFile`), an update reached a module's
 * importers, a file was added that a glob or a failed import now finds, a
 * TypeScript project file changed, or the dependencies were built again
 * (`invalidateAll`). A write Vite serves nothing from (an agent's note, a
 * log) lets go of nothing, and every address stays: the next page reads its
 * modules from the browser's cache.
 */
function rekeyOnInvalidate(dev: DevServer): void {
  const graph = dev.environments.client.moduleGraph;
  const invalidate = graph.invalidateModule.bind(graph);
  graph.invalidateModule = (mod, ...rest) => {
    rekey();
    invalidate(mod, ...rest);
  };
}

/** The key a page loaded now asks for its modules under: the files' generation and the dependencies' build. */
const generationOf = (dev: DevServer): string => {
  const deps = dev.environments.client.depsOptimizer?.metadata.browserHash;
  return deps ? `${generation}.${deps}` : generation;
};

/** `url` (an address on the stage) under `key`; another origin's, or a relative one, as it is. */
const keyedUrl = (url: string, key: string): string =>
  url.startsWith("/") && !url.startsWith("//")
    ? `${MODULES_PATH}${key}${url}`
    : url;

/** An import of an address on the stage: what a module with none (a prebundle's chunk) is served without parsing. */
const STAGE_IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*["']\/(?!\/)/u;

/** The page's module scripts and preloads (Vite's client among them) at `key`. */
const MODULE_TAG =
  /(<script\b[^>]*\btype="module"[^>]*\bsrc="|<link\b[^>]*\brel="modulepreload"[^>]*\bhref=")([^"]+)"/gu;
const keyedPage = (html: string, key: string): string =>
  html.replace(
    MODULE_TAG,
    (_whole, head: string, url: string) => `${head}${keyedUrl(url, key)}"`
  );

/** Vite's client declares the base its HMR imports a changed module under. */
const CLIENT_BASE = (base: string) => `const base = ${JSON.stringify(base)} ||`;

/** The quote a string literal opens with: an `import("…")` of one names a module; of a template or an expression, none the stage reads. */
const STRING_QUOTE = /^["']$/u;

/** A string literal a module imports from: its span in the code, quotes and all, its value, and whether it is an `import("…")`. */
interface ImportLiteral {
  dynamic: boolean;
  end: number;
  start: number;
  value: string;
}

/**
 * The string literals `code` imports from (static, re-exported, and
 * `import("…")` of a literal), as their spans in it: read by
 * es-module-lexer, the lexer Vite's own import analysis reads each module
 * with, where a parse of the whole module (Babel's, before) cost a cold
 * canvas of NeedsCard 1.1 s of the stage's one thread for its 698 modules,
 * read twice (its graph walked, then each module keyed as it was served).
 * Throws where `code` doesn't lex.
 */
function importLiterals(code: string): ImportLiteral[] {
  const [imports] = lex(code);
  const spans: ImportLiteral[] = [];
  for (const one of imports) {
    if (one.type === "static" || one.type === "reexport-star") {
      // A static import's span is its specifier, inside its quotes.
      spans.push({
        start: one.start - 1,
        end: one.end + 1,
        value: one.specifier,
        dynamic: false,
      });
    } else if (
      one.type === "dynamic" &&
      one.specifier !== undefined &&
      !one.glob &&
      STRING_QUOTE.test(code[one.start] ?? "")
    ) {
      // A dynamic import's span is its argument, quotes and all.
      spans.push({
        start: one.start,
        end: one.end,
        value: one.specifier,
        dynamic: true,
      });
    }
  }
  return spans;
}

/** `code` with every stage address it imports from at `key`; as it is where it doesn't lex: the browser says what is wrong with it. */
function keyedImports(code: string, key: string): string {
  if (!STAGE_IMPORT.test(code)) {
    return code;
  }
  let spans: ImportLiteral[];
  try {
    spans = importLiterals(code);
  } catch {
    return code;
  }
  const parts: string[] = [];
  let at = 0;
  for (const { start, end } of spans) {
    const quote = code.charAt(start);
    const url = code.slice(start + 1, end - 1);
    const keyed = keyedUrl(url, key);
    if (keyed !== url) {
      parts.push(code.slice(at, start), quote, keyed, quote);
      at = end;
    }
  }
  parts.push(code.slice(at));
  return parts.join("");
}

/** A keyed module as served: its body, its type, and the source map Vite wrote into it, kept apart. */
interface Keyed {
  body: Uint8Array | string;
  map: string | null;
  type: string;
}

/** Each keyed module as served, by its keyed address: rewritten once a generation. */
const keyedServed = new Map<string, Keyed>();

/** Where a keyed module's source map is asked for: `/@cawco/m/<key>/@cawco-map/<the module's address>`. */
const MAP_AT = "/@cawco-map";

/**
 * The source map Vite's dev server writes at the end of each module it
 * serves, the map's JSON base64 in a data URL ("inline source maps", its
 * `getCodeWithSourcemap`): as large as the code again or more (bits-ui's
 * prebundle, 1.5 MB of code, is served as 4.4 MB with it).
 */
const INLINE_MAP =
  /\n\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)\s*$/u;

/**
 * `code` with its inline source map taken out and named by its address
 * beside the module instead (`/@cawco/m/<key>/@cawco-map/<address>`), the
 * map's JSON returned apart: a frame decodes and keeps every byte of each
 * script's text, and only DevTools, once open, asks for a map. The map is
 * no part of what a frame draws or reports: an element's place in the
 * source is its framework's own (Svelte's `__svelte_meta`, the stage's
 * `data-insp-path` stamp, canvas measure.ts), and an error's place is
 * mapped on the stage from Vite's own map ({@link sourced}).
 */
function mapApart(
  code: string,
  key: string,
  address: string
): { code: string; map: string | null } {
  const found = code.match(INLINE_MAP);
  if (!found) {
    return { code, map: null };
  }
  return {
    code: `${code.slice(0, found.index)}\n//# sourceMappingURL=${MODULES_PATH}${key}${MAP_AT}${address}`,
    map: Buffer.from(found[1] ?? "", "base64").toString("utf8"),
  };
}

/**
 * The stage's own answer at `address`, asked of itself, keyed at `key`:
 * what it imports keyed alike, Vite's client's HMR base the page's key, its
 * source map apart ({@link mapApart}). Kept when it answered; an error (a
 * module that doesn't compile) is never kept, and is the answer as it came.
 */
async function keyedModule(
  dev: DevServer,
  req: IncomingMessage,
  key: string,
  address: string
): Promise<Keyed | { failed: Response }> {
  const at = `${MODULES_PATH}${key}${address}`;
  const known = keyedServed.get(at);
  if (known) {
    return known;
  }
  const listening = dev.httpServer?.address();
  const stagePort =
    typeof listening === "object" && listening ? listening.port : 0;
  const headers: Record<string, string> = {};
  for (const name of ["accept", "sec-fetch-dest", "user-agent"]) {
    const value = req.headers[name];
    if (typeof value === "string") {
      headers[name] = value;
    }
  }
  const answer = await fetch(`http://127.0.0.1:${stagePort}${address}`, {
    headers,
  });
  if (answer.status !== 200) {
    return { failed: answer };
  }
  const type = answer.headers.get("content-type") ?? "application/octet-stream";
  let kept: Keyed;
  if (type.includes("javascript")) {
    const prefix = `${MODULES_PATH}${key}`;
    const apart = mapApart(await answer.text(), key, address);
    let body = keyedImports(apart.code, key);
    if (address.split("?")[0] === `${dev.config.base}@vite/client`) {
      body = body.replace(
        CLIENT_BASE(dev.config.base),
        CLIENT_BASE(`${prefix}${dev.config.base}`)
      );
    }
    kept = { body, type, map: apart.map };
  } else {
    kept = {
      body: new Uint8Array(await answer.arrayBuffer()),
      type,
      map: null,
    };
  }
  keyedServed.set(at, kept);
  return kept;
}

/**
 * A module at a key (`/@cawco/m/<key>/<address>`), or its source map
 * (`/@cawco/m/<key>/@cawco-map/<address>`): kept for good, as every keyed
 * address is.
 */
async function serveKeyed(
  dev: DevServer,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<void> {
  const rest = url.pathname.slice(MODULES_PATH.length);
  const cut = rest.indexOf("/");
  const key = rest.slice(0, cut);
  const asked = `${rest.slice(cut)}${url.search}`;
  const forMap = asked.startsWith(`${MAP_AT}/`);
  const address = forMap ? asked.slice(MAP_AT.length) : asked;
  const kept = await keyedModule(dev, req, key, address);
  if ("failed" in kept) {
    res.statusCode = kept.failed.status;
    res.setHeader(
      "content-type",
      kept.failed.headers.get("content-type") ?? "application/octet-stream"
    );
    res.setHeader("cache-control", "no-store");
    res.end(Buffer.from(await kept.failed.arrayBuffer()));
    return;
  }
  if (forMap && kept.map === null) {
    res.statusCode = 404;
    res.setHeader("cache-control", "no-store");
    res.end();
    return;
  }
  res.statusCode = 200;
  res.setHeader("content-type", forMap ? "application/json" : kept.type);
  res.setHeader("cache-control", KEPT);
  res.end(forMap ? kept.map : kept.body);
}

/** An attribute's value, its quotes and ampersands written as entities. */
const escapeAttr = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

/** Code that imports or re-exports anything: what a module with no module syntax (a prebundle's leaf chunk) is passed by without parsing. */
const ANY_IMPORT = /\b(?:import|export)\b/u;
/** Vite's `?import` (its `importQueryRE`), which it takes off an address before it transforms it. */
const IMPORT_QUERY = /(\?|&)import=?(?:&|$)/u;
const TRAILING_SEPARATOR = /[?&]$/u;
/** Vite's address of a module named by its id (`/@id/<id>`, its `wrapId`), and the null byte a virtual id starts with, written out in it. */
const WRAPPED_ID = /^\/@id\//u;
const NULL_BYTE = /^__x00__/u;
/** Each served module's static imports, as its code writes them, by the transform that wrote it. */
const staticKept = new WeakMap<object, string[]>();

/** The addresses `code` imports statically; none where it doesn't parse: the browser fetches what it names, and says what is wrong with it. */
function staticOf(code: string): string[] {
  try {
    return importLiterals(code)
      .filter((one) => !one.dynamic)
      .map((one) => one.value);
  } catch {
    return [];
  }
}

/**
 * The addresses module `url` (as its page asks for it, the dev server's
 * base in it) imports statically, as the page will ask for them: its code
 * as Vite serves it, transformed here when no page has asked for it yet
 * (Vite's own `warmupRequest`), each `import`/`export … from` of it, a
 * relative one (a prebundle's chunks) resolved from it. An `import("…")`
 * is no part of it: the page asks for one only once its code runs.
 */
async function staticImportsOf(dev: DevServer, url: string): Promise<string[]> {
  const env = dev.environments.client;
  const { base } = dev.config;
  // As Vite's own middleware takes it: its base off, its `?import` off, a virtual module's `/@id/` unwrapped (its `unwrapId`).
  const own = (url.startsWith(base) ? `/${url.slice(base.length)}` : url)
    .replace(IMPORT_QUERY, "$1")
    .replace(TRAILING_SEPARATOR, "")
    .replace(WRAPPED_ID, "")
    .replace(NULL_BYTE, "\0");
  await env.warmupRequest(own);
  const result = (await env.moduleGraph.getModuleByUrl(own))?.transformResult;
  if (!result) {
    return [];
  }
  let imports = staticKept.get(result);
  if (!imports) {
    imports = ANY_IMPORT.test(result.code) ? staticOf(result.code) : [];
    staticKept.set(result, imports);
  }
  return imports.flatMap((one) => {
    if (one.startsWith(".")) {
      const at = new URL(one, `http://stage${url}`);
      return [`${at.pathname}${at.search}`];
    }
    return one.startsWith("/") && !one.startsWith("//") ? [one] : [];
  });
}

/**
 * Every module a page of `files`' canvas loads before it draws, by the
 * address the page asks for it: Vite's client, the stage's entry, each
 * section's module, and what each imports statically, all the way down
 * ({@link staticImportsOf}), each transformed here first when no page has
 * asked for it yet. The canvas page preloads them (`modulepreload`), so
 * the browser asks for its whole graph at once, where each level of
 * imports was a round trip of its own: cold, NeedsCard's 665 modules came
 * 21 levels deep, drawn 4.1 s in on the stage's own host and 11.4 s in at
 * 350 ms a request (the hub's preview proxy, as the comment card's trace
 * read it). Nothing a page's code imports only when it runs is preloaded:
 * a frame parses only the modules its stories reach. `files` are the
 * sections the page loads at once ({@link serveCanvas}): each one's
 * dependencies built before the page runs, so none a section finds while
 * the page draws builds them again and reloads it mid-sweep.
 */
async function closureOf(dev: DevServer, files: string[]): Promise<string[]> {
  const { base } = dev.config;
  const asPage = (address: string) => `${base}${address.slice(1)}`;
  const sections = files
    .filter((file) => sectionProblem(file) === null)
    .map((file) =>
      asPage(`/@id/__x00__${VIRTUAL}${encodeURIComponent(file)}.js`)
    );
  const order: string[] = [];
  const seen = new Set<string>();
  // Each module's imports walked the moment it is transformed, never held for the rest of its level: the section's module (its sheet's docgen and hash, a second cold) holds back only what it imports.
  const visit = async (url: string): Promise<void> => {
    if (seen.has(url)) {
      return;
    }
    seen.add(url);
    order.push(url);
    const imports = await staticImportsOf(dev, url);
    await Promise.all(imports.map(visit));
  };
  await Promise.all(
    [asPage(VITE_CLIENT), asPage(CANVAS_ENTRY), ...sections].map(visit)
  );
  // A section's module is a dynamic import of an address the runtime builds, which Vite asks for with `?import` first.
  return order.map((url) =>
    sections.includes(url) ? withQuery(url, "import", true) : url
  );
}

/** How many times a page's graph is walked again when the walk set off a new build of the dependencies. Ours: each new build finds what the walk before it reached. */
const DEPENDENCY_ROUNDS = 3;

/**
 * The page's graph ({@link closureOf}) once the dependencies it names are
 * built: a dependency no page had imported yet, which the walk's own
 * transforms found, is bundled by Vite's optimizer after the walk, and a
 * new build that changes the others (`optimized dependencies changed.
 * reloading`, its `fullReload`) leaves every address the walk read at the
 * old build's `?v=`, each answered 504 "Outdated Optimize Dep" (the React
 * fixture's first canvas). The walk then reads the graph again, at the new
 * build.
 */
async function settledClosureOf(
  dev: DevServer,
  files: string[]
): Promise<string[]> {
  const optimizer = () => dev.environments.client.depsOptimizer;
  let urls: string[] = [];
  for (let round = 0; round < DEPENDENCY_ROUNDS; round += 1) {
    const build = optimizer()?.metadata.browserHash;
    urls = await closureOf(dev, files);
    const building = Object.values(optimizer()?.metadata.discovered ?? {})
      .map((one) => one.processing)
      .filter((one): one is Promise<void> => one !== undefined);
    await Promise.all(building);
    if (optimizer()?.metadata.browserHash === build) {
      return urls;
    }
  }
  return urls;
}

/** `url` with `query` added, at the start of its query (Vite's `injectQuery`) or its end. */
const withQuery = (url: string, query: string, first: boolean): string => {
  const [path = url, search] = url.split("?");
  if (!search) {
    return `${path}?${query}`;
  }
  return first ? `${path}?${query}&${search}` : `${path}?${search}&${query}`;
};

/** The canvas page's entry, and Vite's client, by the addresses the page asks for them. */
const CANVAS_ENTRY = `/@id/__x00__${VIRTUAL_STAGE}entry.js`;
const VITE_CLIENT = "/@vite/client";

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
    return meta.options?.some((one) => one === value)
      ? null
      : `${name} takes one of ${meta.options?.map((one) => JSON.stringify(one)).join(", ")}; ${JSON.stringify(value)} is none of them.`;
  }
  if (
    kind === "token-color" ||
    kind === "token-size" ||
    kind === "token-font"
  ) {
    return meta.options?.some((one) => one === value)
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

/** Folders whose components are a framework's routes, never a component a sheet shows (spec §6), and package and build trees; a dot-dir (`.cawco`) is passed over too. */
const ROUTE_DIRS: ReadonlySet<string> = new Set([
  "routes",
  "pages",
  "app",
  ...PACKAGE_TREES,
]);
const COMPONENT_FILE = /\.(?:svelte|vue|[jt]sx)$/u;
/** A `.tsx`/`.jsx` file worth asking react-docgen about: one that exports a capitalised name. Our prefilter. */
const CAPITAL_EXPORT =
  /export\s+(?:default\s+)?(?:const|function|class|let)\s+[A-Z]|export\s+default\s+[A-Z]|export\s*\{[^}]*\b[A-Z]/u;
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
    const docgen = await import("react-docgen");
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
const EXTENSION = /\.[^.]+$/u;

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
        sheet.read.stories.flatMap((story) =>
          story.from && story.play ? [{ from: story.from, to: story.name }] : []
        )
      );
      if (ask.component) {
        card.props = (await propsOf(resolve(root, one.file), one.name)).props;
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
const PREBUNDLED = /\/node_modules\/\.vite\/deps\/|[?&]v=/u;
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
  // The states file's own module, and each story's own copy of it (`cawco-frame`): a page loads them all.
  const served = [
    ...(server?.environments.client.moduleGraph.getModulesByFile(abs) ?? []),
  ].filter((one) => one.transformResult);
  const story = served.find((one) => !(one.id && frameOf(one.id)));
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
  const under = new Map<ModuleNode, ModuleNode>(
    served.map((one) => [one, story] as const)
  );
  /** A module reached, with the top import it is under and the module that reached it. */
  interface Reached {
    by: ModuleNode;
    from: ModuleNode;
    mod: ModuleNode;
  }
  const queue: Reached[] = [];
  const reach = (mod: ModuleNode, by: ModuleNode, from: ModuleNode) => {
    if (!under.has(mod) && mod.transformResult) {
      under.set(mod, by);
      queue.push({ mod, by, from });
    }
  };
  for (const copy of served) {
    for (const top of copy.importedModules) {
      // A copy's import is counted under the shared import of its file, where the states file writes it.
      const shared = [...story.importedModules].find(
        (one) => one.file === top.file
      );
      reach(top, shared ?? top, copy);
    }
  }
  // Breadth first: an array's iterator reaches what is pushed while it runs.
  for (const { mod, by } of queue) {
    for (const next of mod.importedModules) {
      reach(next, by, mod);
    }
  }
  // Each module's project bytes with all it reached first, leaves up.
  const brought = new Map<ModuleNode, number>();
  const children = new Map<ModuleNode, ModuleNode[]>();
  for (const { mod, from: up } of queue.toReversed()) {
    const own = PREBUNDLED.test(mod.url)
      ? 0
      : (mod.transformResult?.code.length ?? 0);
    const total = own + (brought.get(mod) ?? 0);
    brought.set(mod, total);
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
  for (const { mod, from: up } of queue.toReversed()) {
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
  // The component's own imports: what any stage that mounts it loads.
  const components = componentsOf(read);
  const component = { modules: 0, bytes: 0 };
  for (const [top, sum] of byImport) {
    const at = top.file ?? top.url;
    if (components.has(writtenAs.get(at) ?? relative(root, at))) {
      component.modules += sum.modules;
      component.bytes += sum.bytes;
    }
  }
  const statesOver =
    own.modules - component.modules > COMPONENT_BUDGET.modules ||
    own.bytes - component.bytes > COMPONENT_BUDGET.bytes;
  return {
    ...own,
    deps,
    heaviest,
    measuredAt: new Date().toISOString(),
    budget: { ...COMPONENT_BUDGET },
    over,
    cut: over ? cutOf(heaviest, components, statesOver) : null,
  };
}

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** The specifiers the states file imports its components by: `meta.component` and each story's. */
const componentsOf = (read: ReturnType<typeof readStoryFile>) =>
  new Set(
    [read.meta.component, ...read.stories.map((one) => one.component)].flatMap(
      (name) => {
        const specifier = name ? read.imports.get(name) : undefined;
        return specifier ? [specifier] : [];
      }
    )
  );

/**
 * Where the weight is, from the graph: each heaviest import with whose it
 * is (the component's own, or the states file's: its fixtures, frames,
 * decorators and stand-ins), then what to do. Past the budget without the
 * component's imports, the states file's own imports are the cut; within
 * it, the weight is the component's and no story cuts it.
 */
function cutOf(
  heaviest: SheetImport[],
  components: Set<string>,
  statesOver: boolean
): string | null {
  if (heaviest.length === 0) {
    return null;
  }
  const named = heaviest.map((one) => {
    const size = `${one.file} (${megabytes(one.bytes)}, ${one.modules} modules)`;
    if (!components.has(one.specifier)) {
      return `${size}, the states file's own import`;
    }
    const [entry] = one.brings;
    return entry
      ? `${size}, the component with its own imports, the heaviest ${entry.file} (${megabytes(entry.bytes)}, ${entry.modules} modules)`
      : `${size}, the component with its own imports`;
  });
  const heaviestNamed = `Heaviest: ${named.join("; ")}.`;
  if (statesOver) {
    const cuts = heaviest
      .filter((one) => !components.has(one.specifier))
      .map((one) => one.specifier);
    const what = cuts.length > 0 ? cuts.join(", ") : "its own imports";
    return `${heaviestNamed} The states file's own imports are over budget without the component's: cut ${what} from the states file, or pass what they give as args.`;
  }
  return `${heaviestNamed} The weight is the component's own imports: without them the states file is within budget, and the story cannot cut them.`;
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
  if (url.pathname.startsWith(MODULES_PATH) && req.method === "GET") {
    await serveKeyed(dev, req, res, url);
    return;
  }
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
    await bodyOf(req)
      .then(keepReport)
      .then(
        () => json(res, 200, { ok: true }),
        (error) => refusedWith(res, error)
      );
    return;
  }
  if (
    path !== CANVAS_PATH &&
    path !== STORIES_PATH &&
    path !== SHEET_PATH &&
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
  const mapped = named.map(storyFile);
  const files = mapped.filter((one): one is string => one !== null);
  const [file] = files;
  if (file === undefined || files.length !== mapped.length) {
    json(res, 404, {
      error:
        named.map(notStatesFile).find(Boolean) ??
        "No file is named: a canvas names its states files as file=<path from the toolchain root>.",
    });
    return;
  }
  // A states file that isn't written is its section's problem, kept as the page's load keeps it: the read answers, the problem with it.
  keepMissing(files);
  if (path === REPORT_PATH) {
    await reportOf(files).then(
      (report) =>
        json(res, 200, {
          ...report,
          errors: [...stageErrors.values()],
        } satisfies ReportAnswer),
      (error) => refusedWith(res, error)
    );
    return;
  }
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
 * own load refused, by its states file), or a section a page couldn't load
 * (`page`, keyed by its states file: {@link keepUnloaded}). Told to the daemon on each change,
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
        server?.environments.client.hot.send(SECTION_WRITTEN, { file });
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
 * Each section a page couldn't load (`unloaded`: an import naming an export
 * its module lacks, a throw as its module ran), kept as its states file's
 * `page` problem in the browser's words, placed in the source where the
 * page's stack names a place; and each a page posted drawn lets its go.
 * Vite never hears of these: it served every module, and the browser
 * refused them as it linked or ran them. The stage's own word on a section
 * (missing, a compile error) stands over a page's.
 */
function keepUnloaded(unloaded: SectionUnloaded[], drawn: PageSection[]): void {
  let changed = false;
  for (const one of unloaded) {
    const file = storyFile(one.file);
    const kept = file ? stageErrors.get(resolve(root, file)) : undefined;
    if (!file || (kept && kept.kind !== "page")) {
      continue;
    }
    const next = pageProblem(file, one.error);
    if (JSON.stringify(kept) !== JSON.stringify(next)) {
      stageErrors.set(resolve(root, file), next);
      changed = true;
    }
  }
  for (const section of drawn) {
    const file = storyFile(section.file);
    const abs = file ? resolve(root, file) : null;
    if (abs && stageErrors.get(abs)?.kind === "page") {
      stageErrors.delete(abs);
      changed = true;
    }
  }
  if (changed) {
    tellErrors();
  }
}

/** States file `file`'s (from the toolchain root) section as a page couldn't load it: the page's error, placed in the source and framed where its stack names a place. */
function pageProblem(file: string, said: PageError): StageError {
  const error = sourced(said);
  return {
    kind: "page",
    file: error.file ?? file,
    line: error.line,
    column: error.column,
    message: error.message,
    frame:
      error.file && error.line !== null
        ? codeFrame(
            resolve(root, error.file),
            error.line,
            Math.max(0, (error.column ?? 1) - 1)
          )
        : null,
    sheets: [file],
  };
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
const PLACE_SUFFIX = / \(\d+:\d+\)$/u;

/**
 * A states file's read that threw (Babel's syntax error: its message and a
 * `loc`, 1-based line, 0-based column), placed in `file` (from the toolchain
 * root) as Vite places a plugin's error: its `loc.file`, from which Vite
 * draws the frame and names the module. Any other error as it was.
 */
function placedAt(error: unknown, file: string): unknown {
  if (!(error instanceof Error && "loc" in error)) {
    return error;
  }
  const { loc } = error;
  const line =
    typeof loc === "object" && loc !== null && "line" in loc
      ? loc.line
      : undefined;
  if (typeof line !== "number") {
    return error;
  }
  const abs = resolve(root, file);
  const column =
    typeof loc === "object" && loc !== null && "column" in loc
      ? loc.column
      : undefined;
  const placed = typeof column === "number" ? column : 0;
  return Object.assign(new Error(error.message.replace(PLACE_SUFFIX, "")), {
    loc: { file: abs, line, column: placed },
    frame: codeFrame(abs, line, placed),
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

/** A module id without its query. */
const pathOfId = (id: string): string => id.split("?")[0] ?? id;

/** The id of states file `file`'s section module in Vite's graph (from the root): the stage's address of it, `/@id/__x00__cawco:sheet/<file>.js`, unwrapped. */
const sectionIdOf = (file: string): string =>
  `\0${VIRTUAL}${encodeURIComponent(file)}.js`;

/** The states file (from the toolchain root) a section module's id (`\0cawco:sheet/<file>.js`) stands for; null for any other module. */
function sectionOfId(id: string): string | null {
  const bare = pathOfId(id);
  return bare.startsWith(`\0${VIRTUAL}`)
    ? decodeURIComponent(bare.slice(VIRTUAL.length + 1, -".js".length))
    : null;
}

/** The key a module's problem is kept under: a section module's, its states file's (absolute); any other's, its own file. */
function errorKeyOf(id: string): string {
  const section = sectionOfId(id);
  return section === null ? pathOfId(id) : resolve(root, section);
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
  /** The story files (from the root) whose sheets import `file`, read up Vite's module graph. */
  const sheetsOf = (file: string): string[] => {
    const graph = server?.environments.client.moduleGraph;
    const found = new Set<string>();
    const seen = new Set<ModuleNode>();
    const queue = [...(graph?.getModulesByFile(file) ?? [])];
    for (let mod = queue.shift(); mod; mod = queue.shift()) {
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
   * Whether module `id` (Vite's, its query kept) is one a canvas's page
   * loads: the stage's own (a section's module, the entry, the runtime), a
   * states file, or a module another module of the page's graph imports.
   * Vite answers every request it is sent, and sends each request's error
   * to every page (its `logError`), so a request no page made (an address
   * typed or mangled by hand, `climb.riv?import&amp;url` read straight out
   * of the page's HTML) makes a module no module imports: its error is the
   * request's answer alone, neither sent to the open pages nor kept against
   * a canvas whose own import of that file compiles. An error that names
   * no module is sent and kept.
   */
  const pageAsks = (id: string | undefined): boolean => {
    if (!id || id.startsWith("\0") || STORY_FILE.test(id.split("?")[0] ?? "")) {
      return true;
    }
    const mod = server?.environments.client.moduleGraph.getModuleById(id);
    return !!mod && mod.importers.size > 0;
  };

  /**
   * A compile error Vite sends the pages, kept under its module. A section's
   * own load refusal comes with neither the section module's id nor a place
   * when its states file isn't written: that one its load keeps
   * (`sectionLoad`), and it is passed by here. A states file that doesn't
   * compile stops its own section, which no module graph links it to while
   * its load fails.
   */
  const keepSent = (err: ErrorPayload["err"]) => {
    if (err.pluginCode === SECTION_MISSING) {
      return;
    }
    // The module's id is Vite's absolute path; a plugin's `loc.file` may be
    // its own (vite-plugin-svelte's is the bare file name).
    const at = resolve(root, pathOfId(err.id ?? err.loc?.file ?? ""));
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
      const file = sectionOfId(id);
      return file === null ? null : sectionLoad(file);
    },
    /**
     * An edit to a file a loaded section is drawn from ({@link drawnFrom}:
     * its states file, a component it mounts, a file those import) loads
     * that section's module again, with its sheet and hash read anew. Vite's
     * own propagation stops at a component that accepts itself (Svelte's,
     * React's, Vue's), so the section's module is added to the update here;
     * Vite invalidates it and sends it once (`updateModules` skips a module
     * its propagation already reached, as through a states file).
     *
     * A manifest taken as created ({@link relinkOnManifestChange}) may make
     * an import resolve that failed. Vite's own HMR, on a file created,
     * updates each module an import of which failed to resolve
     * (`_hasResolveFailedErrorModules`), but only one whose resolve answered
     * nothing; the native resolver throws ("is not exported under the
     * conditions"), and the throw names no module. And Vite propagates no
     * update from a module whose transform threw ("stop propagation because
     * not analyzed": its `isSelfAccepting` unset). So each module a page was
     * handed an import of and that has no code served ({@link failedServe})
     * is invalidated as Vite's HMR invalidates a changed module (its
     * `lastHMRTimestamp`: its importers ask for it at `?t=`, past the
     * browser's record of the failed fetch), and its served importers are
     * the update: Vite's propagation reaches each failed section's module,
     * which the page loads again.
     */
    async hotUpdate(
      this: { environment: { name: string } },
      {
        type,
        file,
        modules,
        timestamp,
      }: {
        type: "create" | "update" | "delete";
        file: string;
        modules: ModuleNode[];
        timestamp: number;
      }
    ) {
      const graph = server?.environments.client.moduleGraph;
      if (!graph || this.environment.name !== "client") {
        return;
      }
      if (type !== "update" || isManifest(file)) {
        drawnKept.clear();
      }
      // An edit may add or drop an import a frame's copies run through.
      copiesKept.clear();
      if (isManifest(file)) {
        if (type !== "create") {
          return;
        }
        const failed = [...graph.idToModuleMap.values()].filter(failedServe);
        // Read before the invalidation, which invalidates each importer too.
        const importers = failed.flatMap((mod) =>
          [...mod.importers].filter((one) => one.transformResult !== null)
        );
        for (const mod of failed) {
          // Hard first: the HMR call moves only `lastHMRTimestamp`, and Vite's race guards in transformRequest.ts compare `lastInvalidationTimestamp`, so a transform in flight across it would store its result on a module still soft-invalidated (https://github.com/vitejs/vite/issues/23941). Drop this line once a Vite release ships https://github.com/vitejs/vite/pull/23950.
          graph.invalidateModule(mod, new Set(), timestamp);
          graph.invalidateModule(mod, new Set(), timestamp, true);
        }
        return importers.length > 0 ? [...modules, ...importers] : undefined;
      }
      forgetUnheldSheet(graph, file, timestamp);
      const reached = await Promise.all(
        [...heldSections.keys()].map(async (sheet) => {
          const mod = graph.getModuleById(sectionIdOf(sheet));
          const abs = resolve(root, sheet);
          if (!(mod && existsSync(abs))) {
            return null;
          }
          const set = drawnSet(sheet);
          if (!(await set).has(file)) {
            return null;
          }
          // Its imports may have changed with this edit: read again on the next.
          if (drawnKept.get(sheet) === set) {
            drawnKept.delete(sheet);
          }
          return mod;
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
      relinkOnManifestChange(dev);
      nameFailedModules(dev);
      const { hot } = dev.environments.client;
      const send = hot.send.bind(hot);
      function sendKept(payload: HotPayload): void;
      function sendKept<Event extends string>(
        event: Event,
        data?: InferCustomEventPayload<Event>
      ): void;
      function sendKept(payload: HotPayload | string, data?: unknown): void {
        if (typeof payload === "string") {
          send(payload, data);
          return;
        }
        if (payload.type === "error") {
          // A request no page made is answered with its error alone: no page hears it.
          if (!pageAsks(payload.err.id)) {
            return;
          }
          keepSent(payload.err);
        }
        send(payload);
      }
      hot.send = sendKept;
      // Each section a page loads is held while the page is open: an edit checks only those.
      hot.on(SECTION_HELD, (data, client) => {
        // A page runs the project's code: its word is checked, whatever the type says.
        const named: unknown = data?.file;
        const file = typeof named === "string" ? storyFile(named) : null;
        if (file) {
          holdSection(client, file);
        }
      });
      hot.on("vite:client:disconnect", (_data, client) => releasePage(client));
      // A states file written lets its missing problem go; one a loaded section draws from, taken away, is missing.
      const nowWritten = (abs: string) => {
        if (stageErrors.get(abs)?.kind === "missing") {
          keepMissing([relative(root, abs)]);
        }
      };
      // A server Vite (re)started (its config, a file the config imports or an env file changed: its own restart) serves at new addresses, and so does one that let go of a module.
      rekey();
      rekeyOnInvalidate(dev);
      dev.watcher.on("add", nowWritten);
      dev.watcher.on("change", nowWritten);
      dev.watcher.on("unlink", (abs: string) => {
        const file = relative(root, abs);
        // Its section module's transform is kept: the next page's load must ask `sectionLoad` again, which refuses it.
        const graph = dev.environments.client.moduleGraph;
        const mod = graph.getModuleById(sectionIdOf(file));
        if (!mod) {
          return;
        }
        graph.invalidateModule(mod);
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
async function stampTransform(code: string, served: string) {
  // A story's own copy of a file is stamped as the file.
  const id = unframed(served);
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

const JSX_FILE = /\.[jt]sx$/u;

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

/** The query a story's own copy of a module is served under: `?cawco-frame=<token>`, the token naming its states file and story ({@link framesOf}). */
const FRAME_QUERY = "cawco-frame";
const FRAME_PARAM = /[?&]cawco-frame=([\w-]+)/u;
const FRAME_PART = /([?&])cawco-frame=[\w-]+&?/u;

/** One story that holds modules of its own: its states file (from the root), its export's name, the modules its `beforeEach` imports as the file writes them, and its token. */
interface Frame {
  file: string;
  modules: string[];
  story: string;
  token: string;
}

/** Each frame by its token, written as its section's module is ({@link framesOf}): what a copy's import is resolved by. */
const framesKept = new Map<string, Frame>();

/**
 * The stories of states file `file` that hold modules of their own: each
 * whose `beforeEach` (or the meta's) imports a module with `import("…")`
 * (story-file.ts `standIns`). Each such story's frame draws from its own
 * copy of the states file, and of every file between it and those modules,
 * so what its `beforeEach` writes into them is that frame's alone.
 */
function framesOf(file: string): Frame[] {
  const abs = resolve(root, file);
  const { standIns } = readStoryFile(abs, readFileSync(abs, "utf8"));
  return [...standIns].map(([story, modules]) => {
    const token = createHash("sha256")
      .update(`${file}\0${story}`)
      .digest("base64url")
      .slice(0, 12);
    const frame = { file, story, modules, token };
    framesKept.set(token, frame);
    copiesKept.delete(token);
    return frame;
  });
}

/** The frame token module id `id` is a copy for; null for the shared module. */
const frameOf = (id: string): string | null =>
  id.match(FRAME_PARAM)?.[1] ?? null;

/** `id` as its shared module: the frame's query taken out. */
const unframed = (id: string): string =>
  id.replace(FRAME_PART, "$1").replace(TRAILING_SEPARATOR, "");

/** `id` as frame `token`'s copy. */
const framed = (id: string, token: string): string =>
  withQuery(id, `${FRAME_QUERY}=${token}`, false);

/** Each frame's copied files, kept until a file is edited, created or deleted (the plugin's `hotUpdate`): an edit may add or drop an import. */
const copiesKept = new Map<string, Promise<Set<string>>>();

/**
 * The files frame `token` serves copies of (absolute): its states file, the
 * modules it names, and each of the project's own files a static import
 * chain from the states file reaches them through. The rest of the page's
 * graph (the framework, the kit, a module that never reaches a named one)
 * is the one every frame shares. Walked over the files' own imports
 * ({@link sourceImports}), kept by their times.
 */
function copiesOf(token: string): Promise<Set<string>> {
  const kept = copiesKept.get(token);
  if (kept) {
    return kept;
  }
  const frame = framesKept.get(token);
  const walk = frame ? copiedFiles(frame) : Promise.resolve(new Set<string>());
  // A walk that failed (a file gone mid-read) is walked again after the next edit, which clears them all.
  copiesKept.set(token, walk);
  return walk;
}

/** Frame `frame`'s copied files, walked now ({@link copiesOf}). */
async function copiedFiles(frame: Frame): Promise<Set<string>> {
  const abs = resolve(root, frame.file);
  const named = (
    await Promise.all(frame.modules.map((source) => resolved(source, abs)))
  ).filter((one): one is string => !!one);
  // Each of the project's own files the states file reaches, with what imports it.
  const importers = new Map<string, string[]>();
  const seen = new Set<string>([abs]);
  let level = [abs];
  while (level.length > 0) {
    const next: string[] = [];
    await Promise.all(
      level.map(async (file) => {
        for (const to of await sourceImports(file)) {
          importers.set(to, [...(importers.get(to) ?? []), file]);
          if (!seen.has(to) && ownFile(to) && existsSync(to)) {
            seen.add(to);
            next.push(to);
          }
        }
      })
    );
    level = next;
  }
  // Up from the named modules: every file a chain to one of them runs through.
  const copies = new Set<string>([abs, ...named]);
  const queue = [...named];
  for (let file = queue.shift(); file; file = queue.shift()) {
    for (const up of importers.get(file) ?? []) {
      if (!copies.has(up)) {
        copies.add(up);
        queue.push(up);
      }
    }
  }
  return copies;
}

/**
 * The stage's stand-ins for modules a component imports, as Storybook
 * stands in for them (its SvelteKit framework's mocks; its module mocking,
 * storybook.js.org/docs/writing-stories/mocking-data-and-modules/mocking-modules,
 * a story's `beforeEach` setting what a mocked module holds):
 *
 * - SvelteKit's client modules, for every frame: `$app/<name>` aliased to
 *   `cawco:kit/<name>`, loaded from {@link KIT_STUBS}. The alias goes in a
 *   config hook ordered after Kit's own, whose `$app` alias would match
 *   first otherwise (Vite merges a later hook's aliases ahead of the
 *   earlier ones').
 * - A story's own modules, for its frame alone: a story whose `beforeEach`
 *   imports a module (`await import("…")`) mounts
 *   from its own copy of its states file (`?cawco-frame=<token>`, imported
 *   by the section's module, {@link sectionModule}), and each import a copy
 *   makes of a file between the states file and that module
 *   ({@link copiesOf}) resolves to that file's copy for the same frame. The
 *   copy is the real module, its writers and derived views its own, so the
 *   `beforeEach` seeds it through its own writers and every story of one
 *   states file holds its own value on one page.
 */
function cawcoStandIns() {
  return {
    name: "cawco:stage-stand-ins",
    enforce: "pre" as const,
    config: {
      order: "post" as const,
      handler: () =>
        kit
          ? {
              resolve: {
                alias: Object.keys(KIT_STUBS).map((name) => ({
                  find: new RegExp(`^\\$app/${name}$`, "u"),
                  replacement: `${KIT_STUB}${name}`,
                })),
              },
            }
          : {},
    },
    async resolveId(
      this: {
        resolve: (
          source: string,
          importer: string,
          options: object
        ) => Promise<{ external?: unknown; id: string } | null>;
      },
      id: string,
      importer: string | undefined,
      options: object
    ) {
      if (id.startsWith(KIT_STUB)) {
        return `\0${id}`;
      }
      const token = importer ? frameOf(importer) : null;
      if (!(importer && token) || id.startsWith("\0")) {
        return null;
      }
      const found = await this.resolve(id, importer, {
        ...options,
        skipSelf: true,
      });
      if (!found || found.external || frameOf(found.id)) {
        return found;
      }
      const copies = await copiesOf(token);
      return copies.has(pathOfId(found.id))
        ? { ...found, id: framed(found.id, token) }
        : found;
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

/** The stage's plugins for the Vite inside any toolchain: a Svelte element carries its place already; the stand-ins serve SvelteKit's client modules and each story's own. */
const plugins = () => [
  cawcoStage(),
  linkedRebundle(),
  ...(framework === "svelte" ? [] : [stamp()]),
  cawcoStandIns(),
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
 * `createServer`), loaded the way the project's own `vite` command loads it:
 * by Vite's default loader, whatever that is in the Vite installed. On Vite
 * 8 it is `bundle`: "By default, Vite uses Rolldown to bundle the config
 * into a temporary file and load it" (vite.dev/config), "the current
 * default, though `native` is planned to become the default in a future
 * major version", which "writes the bundled config to
 * `node_modules/.vite-temp` before loading it" (Vite 8.3.4
 * `loadConfigFromBundledFile`: the `node_modules` nearest the config, the
 * file unlinked once imported). That folder is the stage's to write: a stage
 * runs in its workspace's clone or its place's stage clone, never in a
 * place, whose boundary holds `node_modules` read-only (stage-clone.ts).
 * Vite's own caches stay in {@link CACHE_DIR}.
 */
async function startVite(): Promise<Started> {
  const vite = (await import(projectPackage("vite").href)) as Vite;
  const configFile = CONFIGS.map((name) => resolve(root, name)).find(
    existsSync
  );
  // A config that does not load fails the stage with the load's own error,
  // named as the config's: no other loader is tried (no fallback), and the
  // stage is not started again until someone asks for it.
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
      cacheDir: CACHE_DIR,
      clearScreen: false,
      customLogger: logger,
      plugins: plugins(),
      server: { host: HOST, port, strictPort: true, hmr: { overlay: false } },
    })
    .catch((error: unknown) => {
      throw unread && configFile
        ? new Error(
            // Rolldown colours its parse errors for a terminal; the sheet shows plain text.
            `Vite couldn't load ${relative(root, configFile)}: ${stripVTControlCharacters(error instanceof Error ? error.message : String(error))}`,
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
  await lexerReady();
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
