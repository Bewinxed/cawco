/**
 * What a section's stories hold of their own: each story that names a module
 * in its `beforeEach` (host.ts `ownSet`) is evaluated in its own Vite
 * `ModuleRunner` (the Vite serving the page's, `vite/module-runner`), wired
 * as Vite's runner in a server is, with its transport here:
 *
 * - a private module (the states file, the modules it imports with
 *   `import()`, and every module of the project's own a chain from the
 *   states file reaches them through) is code the stage made for runners
 *   (host.ts `runnerCode`): the client environment's transform, in Vite's
 *   runner shape. Every runner of the page shares one copy of each
 *   module's code, fetched once for a section (`OWN_PATH`), and evaluates
 *   it itself with the stock `ESModulesEvaluator`.
 * - every other module is `{ externalize }` at the page's own address (its
 *   key, its HMR stamp): the page's one instance, the framework's runtime
 *   and the `$app` stand-ins among them.
 *
 * The runner's code comes from the same transform the page imports, so
 * every address it names is one the page's graph has, and a runner's
 * `import()` at run time is answered by the same rule. A runner never takes
 * a hot update: an edit to any file its section is drawn from loads the
 * section again, which makes every story's runner anew and closes the old
 * ones (runtime.ts `seeded`). Its modules get a hot context from the
 * runner's own HMR client, which hears nothing: code a framework compiles
 * for the client (plugin-vue's `import.meta.hot.on`) runs, and nothing it
 * registers is ever called.
 *
 * Vite's stack interceptor stays off: it swaps `Error.prepareStackTrace`
 * for the whole page, in Chromium alone. A runner's code names itself at
 * an address of its own (`//# sourceURL=…/@cawco/runner/<n><address>`),
 * which {@link ownPlace} reads back to the client code's place, where the
 * stage's map of that module takes it to the source (host.ts `sourced`).
 */

import { MODULES_PATH, OWN_PATH } from "@cawco/core/stage";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import type {
  ModuleRunner,
  ModuleRunnerTransport,
  ModuleRunnerTransportHandlers,
} from "vite/module-runner";

/** The Vite module the stage serves as `cawco:stage/module-runner.js`. */
export type RunnerModule = typeof import("vite/module-runner");

/** A private module's code as the stage made it for runners, or why it couldn't (host.ts `OwnCode`). */
type OwnCode = { code: string; etag: string; map: unknown } | { error: string };

/** What the stage answers at `OWN_PATH` (host.ts `OwnAnswer`). */
interface OwnAnswer {
  /** The states file's address, the runner's entry. */
  entry: string;
  modules: Record<string, OwnCode>;
  stories: string[];
  unreached: Record<string, string>;
  urls: string[];
}

/** A section's own stories once their runners stand. */
export interface OwnModules {
  /** Every runner of the section closed: its cache and hot listeners let go. */
  close: () => Promise<void>;
  /** Each own story's states file, as its runner evaluated it, by the story's export name. */
  modules: Map<string, Record<string, unknown>>;
  /** Each own story whose seed can't reach its component, with the component's file. */
  unreached: Map<string, string>;
}

/** Where a runner's code names itself ({@link ownPlace}): served by nothing, read back by the page. */
const RUNNER_CODE = "/@cawco/runner/";
/**
 * Vite's HMR stamp on an address, and its `?import` (what its import
 * analysis adds to an `import()` of an expression, `__vite__injectQuery`):
 * the runner's module is the address's without them, as Vite's own
 * middleware reads it.
 */
const TIME_QUERY = /([?&])t=\d+&?/u;
const IMPORT_QUERY = /([?&])import=?(?:&|$)/u;
const TRAILING_SEPARATOR = /[?&]$/u;
const KEYED_AT = new RegExp(`^${MODULES_PATH}[^/]+`, "u");

/** The page's key on its module addresses (`/@cawco/m/<key>`), read off this module's own: an externalized module is the page's at it. */
const keyPrefix = (): string =>
  new URL(import.meta.url).pathname.match(KEYED_AT)?.[0] ?? "";

/**
 * An address the page's code imports, whole (origin and all) at the page's
 * key; another origin's or a `data:` one as it is. Whole, because Vite's
 * client adds `?import` to an `import()` of a path it can't read (its
 * `__vite__injectQuery`, the evaluator's `import(url)` among them), and the
 * page's module at that address is another instance.
 */
const keyedAt = (url: string, prefix: string): string =>
  url.startsWith("/") && !url.startsWith("//")
    ? new URL(`${prefix}${url}`, location.href).href
    : url;

/** A private module's code on this page: its ETag, its code with its own address, and its map from that code to the client's. */
interface Shared {
  code: string;
  etag: string;
  place: string;
}

/** Each private module's code, one copy for every runner on the page, by address; replaced when the stage answers another ETag. */
const sharedCode = new Map<string, Shared>();
/** Each runner code's own address, by the place it names: the module's address, its map, and the lines the evaluator wraps it in. */
const places = new Map<
  string,
  { map: unknown; offset: number; traced?: TraceMap; url: string }
>();
let placesMade = 0;

/** The page's one copy of module `url`'s code at `code.etag`, named by an address of its own. */
function sharedOf(
  url: string,
  code: { code: string; etag: string; map: unknown }
): Shared {
  const kept = sharedCode.get(url);
  if (kept?.etag === code.etag) {
    return kept;
  }
  if (kept) {
    places.delete(kept.place);
  }
  placesMade += 1;
  const place = `${RUNNER_CODE}${placesMade}${url}`;
  places.set(place, { map: code.map, offset: 0, url });
  const shared = {
    code: `${code.code.trimEnd()}\n//# sourceURL=${location.origin}${place}\n`,
    etag: code.etag,
    place,
  };
  sharedCode.set(url, shared);
  return shared;
}

/**
 * A stack frame's place in a runner's code (its `path`, line and 1-based
 * column) at its place in the client code the stage serves the page for
 * that module: its address, and the line and column there. Null for a
 * frame of any other code.
 */
export function ownPlace(
  path: string,
  line: number,
  column: number
): { column: number; line: number; path: string } | null {
  const place = places.get(path);
  if (!place) {
    return null;
  }
  const { map } = place;
  if (!(map && typeof map === "object" && "mappings" in map)) {
    return null;
  }
  place.traced ??= new TraceMap(JSON.stringify(map));
  const traced = originalPositionFor(place.traced, {
    line: line - place.offset,
    column: column - 1,
  });
  return traced.line === null || traced.column === null
    ? null
    : {
        path: place.url.split("?")[0] ?? place.url,
        line: traced.line,
        column: traced.column + 1,
      };
}

/** What the stage holds of states file `file`'s own stories (`OWN_PATH`). */
async function ownAnswerOf(file: string): Promise<OwnAnswer> {
  // Beside the page, as its sheet is read (core `OWN_PATH`).
  const at = new URL(
    OWN_PATH.slice(OWN_PATH.lastIndexOf("/") + 1),
    location.href
  );
  at.search = new URLSearchParams({ file }).toString();
  const answer = await fetch(at);
  const body: unknown = await answer.json();
  if (!answer.ok) {
    const said =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : `The stage answered ${answer.status} for ${file}'s own modules.`;
    throw new Error(said);
  }
  return body as OwnAnswer;
}

/**
 * Story runners' transport: a private module's code from the page's copy,
 * `{ cache: true }` for one this runner holds at the ETag the page has
 * (per runner: Vite's own answer assumes one runner an environment), and
 * every other address the page's own module (`{ externalize }`).
 */
function transportOf(
  codes: Map<string, Shared | { error: string }>,
  prefix: string
): ModuleRunnerTransport {
  const known = new Map<string, string>();
  return {
    connect(_handlers: ModuleRunnerTransportHandlers) {
      // The runner's HMR client hears nothing: its section makes it anew on an edit.
    },
    disconnect() {
      known.clear();
    },
    send: () => Promise.resolve(),
    invoke(payload) {
      const call = payload.type === "custom" ? payload.data : null;
      if (call?.name === "getBuiltins") {
        return Promise.resolve({ result: [] });
      }
      if (call?.name !== "fetchModule") {
        return Promise.resolve({
          error: {
            message: `A story's runner asks nothing of ${String(call?.name)}.`,
          },
        });
      }
      const [asked, , options] = call.data as [
        string,
        string | undefined,
        { cached?: boolean; startOffset?: number } | undefined,
      ];
      const url = asked
        .replace(TIME_QUERY, "$1")
        .replace(IMPORT_QUERY, "$1")
        .replace(TRAILING_SEPARATOR, "");
      const shared = codes.get(url);
      if (!shared) {
        return Promise.resolve({
          result: { externalize: keyedAt(asked, prefix), type: "module" },
        });
      }
      if ("error" in shared) {
        return Promise.resolve({ error: { message: shared.error } });
      }
      const place = places.get(shared.place);
      if (place) {
        place.offset = options?.startOffset ?? 0;
      }
      if (options?.cached && known.get(url) === shared.etag) {
        return Promise.resolve({ result: { cache: true } });
      }
      // Asked by another address of it (an `import()` of an expression, with Vite's `?import`): the runner finds the module it holds by its id, and keeps it.
      known.set(url, shared.etag);
      return Promise.resolve({
        result: { code: shared.code, file: url, id: url, url },
      });
    },
  };
}

/** A runner for one own story: the stage's code for its private modules, the page's own for every other. */
function runnerOf(
  vite: RunnerModule,
  codes: Map<string, Shared | { error: string }>,
  prefix: string
): ModuleRunner {
  return new vite.ModuleRunner(
    {
      transport: transportOf(codes, prefix),
      hmr: { logger: false },
      sourcemapInterceptor: false,
      // As the page's own module has it: its address on the page.
      createImportMeta: (path) => ({
        ...vite.createDefaultImportMeta(path),
        url: keyedAt(path, prefix),
      }),
    },
    new vite.ESModulesEvaluator()
  );
}

/**
 * States file `file`'s own stories, each evaluated in a runner of its own;
 * null when none of its stories names a module. `runnerModule` loads Vite's
 * runner the first time a section needs one.
 */
export async function ownModulesOf(
  file: string,
  runnerModule: () => Promise<RunnerModule>
): Promise<OwnModules | null> {
  const answer = await ownAnswerOf(file);
  if (answer.stories.length === 0) {
    return null;
  }
  const vite = await runnerModule();
  const prefix = keyPrefix();
  // The page's one copy of each private module's code, every runner's.
  const codes = new Map(
    answer.urls.flatMap((url) => {
      const code = answer.modules[url];
      if (!code) {
        return [];
      }
      return [[url, "error" in code ? code : sharedOf(url, code)] as const];
    })
  );
  const unreached = new Map(Object.entries(answer.unreached));
  const runners: ModuleRunner[] = [];
  const close = async () => {
    await Promise.all(runners.map((one) => one.close()));
  };
  const modules = new Map<string, Record<string, unknown>>();
  try {
    await Promise.all(
      answer.stories
        .filter((story) => !unreached.has(story))
        .map(async (story) => {
          const runner = runnerOf(vite, codes, prefix);
          runners.push(runner);
          modules.set(story, await runner.import(answer.entry));
        })
    );
  } catch (error) {
    await close();
    throw error;
  }
  return { close, modules, unreached };
}
