/**
 * The probe kit's one place for what every web spec shares: the pinned
 * viewports, themes, scale and fonts; the built dashboard and the servers
 * that serve it; scratch fleets; pages; and the PASS/FAIL ledger.
 *
 * Rendering is pinned so one machine's settings never move a reading. On
 * Linux the text's hinting comes from fontconfig, and a shell reads the
 * user's own config where a sandbox reads only the system's: `fonts.conf`
 * is the system's with full hinting on, as the owner's desktop draws it.
 * Compositing is in software (`--disable-gpu`), so a host with a GPU and
 * one without draw the same frame.
 */
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import { constants, homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Frame,
  type FrameLocator,
  firefox,
  type Locator,
  type Page,
  webkit,
} from "playwright-core";
import { readWithin } from "../../packages/core/src/bounded";
import { CLAUDE_DIR_NAME } from "../../packages/core/src/claude-dirs";
import {
  openLockFile,
  release,
  tryLock,
  tryShare,
  unlock,
} from "../../packages/core/src/flock";
import { type HeavySlot, heavySlot } from "../lib/heavy-run";
import {
  type Fleet,
  type HubAddress,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "../scratch-fleet";

export const ROOT = resolve(import.meta.dir, "../..");
const DASHBOARD = join(ROOT, "apps", "dashboard");
const FONTS_CONF = join(import.meta.dir, "fonts.conf");

/** Every viewport a spec opens. `touch` is a finger: touch events, a mobile viewport. */
export const VIEWS = {
  desk: { width: 1440, height: 900, touch: false },
  tablet: { width: 1024, height: 1366, touch: true },
  /** An iPad mini's portrait: the journeys' tablet. */
  tabletPortrait: { width: 768, height: 1024, touch: true },
  phone: { width: 390, height: 844, touch: true },
  /** Past the phone's line and under the drawer's: the rail is a sheet, the bar is the desk's. */
  narrowDesk: { width: 680, height: 900, touch: false },
  /** The widest phone, a Pro Max's 430pt. */
  phoneWide: { width: 430, height: 932, touch: true },
  /** The simulators the iOS specs pair with: iPhone 16 Pro and iPad Pro 13-inch (M4), portrait. */
  iphone: { width: 402, height: 874, touch: true },
  /** An iPhone 15 Pro, portrait: the owner's phone. */
  iphone15Pro: { width: 393, height: 852, touch: true },
  ipad: { width: 1032, height: 1376, touch: true },
  /** An iPad Pro 11-inch (M4), portrait: the simulator ios-config and ios-views pair with. */
  ipad11: { width: 834, height: 1194, touch: true },
  /** The same iPad in landscape. Either way up it is an iPad's regular width, so the web stands
   *  the side panel beside the conversation (layoutPolicy.sideDrawer) as the app does. */
  ipadWide: { width: 1376, height: 1032, touch: true },
} as const;
export type View = keyof typeof VIEWS;

/**
 * Chromium's pointer and hover, a desk's: a mouse, which hovers. Unpinned,
 * Linux Chromium reads them from the host's input devices
 * (ui/base/pointer/pointer_device_linux.cc: `return {pointer_types ?
 * pointer_types : POINTER_TYPE_NONE, hover_types};`), so on a machine with no
 * mouse a desk page matched `(pointer: none)` and `(hover: none)`: no
 * `.pointer-hit` area (app.css, under `(pointer: fine)`) and no hover style
 * applied. These are the page's embedder settings; a touch context (`hasTouch`,
 * `Emulation.setTouchEmulationEnabled`) lays coarse and none over them and
 * gives them back when touch is off (core/inspector/dev_tools_emulator.cc
 * `SetTouchEventEmulationEnabled`), so one browser serves both. The values
 * are blink's mojom enums: PointerType kPointerFineType 4, HoverType
 * kHoverHoverType 2. `Emulation.setEmulatedMedia` leaves `pointer` and
 * `hover` as they are (Chromium 156, read in a page).
 */
const DESK_POINTER =
  "--blink-settings=primaryPointerType=4,availablePointerTypes=4,primaryHoverType=2,availableHoverTypes=2";

/** What a view's page matches: a desk's mouse, or a touch screen's finger. */
const POINTER_OF = (touch: boolean) =>
  touch
    ? { pointer: "coarse", hover: "none" }
    : { pointer: "fine", hover: "hover" };

/** Below this, a touch view is a phone (DESIGN.md's 640px breakpoint). */
const PHONE_MAX_WIDTH = 640;
/**
 * What a phone's browser says it is, by engine: the dashboard's server
 * draws a first visit's first paint for a phone from it (`narrowOf`, the
 * `(app)` layout: the cookie, then `sec-ch-ua-mobile`, then the agent).
 * Playwright's WebKit and Firefox send a desktop agent and no hint, so a
 * phone page was drawn wide and flipped to the phone's bar once its script
 * ran: J9 found the wide bar's Jump and lost it to the flip (WebKit phone,
 * "waiting for getByRole('button', { name: /^Jump to session$/ })").
 * Chromium's mobile emulation sends the hint, and keeps its own agent.
 */
const PHONE_AGENT: Record<Engine, string | undefined> = {
  chromium: undefined,
  webkit:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  firefox:
    "Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0",
};
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
/** Device pixels per css px, everywhere. */
export const SCALE = 2;

/**
 * A composer's message field (Composer.svelte's MentionField): an editable
 * box, not a textarea. Its words read as its `textContent` (a chip as its
 * label); its draft is the composer's own string. Its autosize twin is no
 * combobox, so this finds the field alone.
 */
export const COMPOSER_FIELD = '[role="combobox"][contenteditable="true"]';
/** A composer's field in its pill (Composer.svelte's `data-slot="cin"` form). */
export const COMPOSER = `form[data-slot="cin"] ${COMPOSER_FIELD}`;

/** The browser engines a page runs on. */
export type Engine = "chromium" | "webkit" | "firefox";

const ENGINES: readonly Engine[] = ["chromium", "webkit", "firefox"];

/**
 * The engine a page opens on where its spec names none: `PROBE_ENGINE`
 * (`PROBE_ENGINE=webkit bun scripts/probe-kit/run.ts web <spec>`), so a
 * spec written on Chromium runs whole on another engine; Chromium unset. A
 * page whose spec names its engine keeps it.
 */
const RUN_ENGINE: Engine = (() => {
  const named = process.env.PROBE_ENGINE;
  if (named === undefined || named === "") {
    return "chromium";
  }
  if (!(ENGINES as readonly string[]).includes(named)) {
    throw new Error(
      `PROBE_ENGINE=${named} is no engine the kit runs (${ENGINES.join(", ")})`
    );
  }
  return named as Engine;
})();

/**
 * Whether a console message is the kit's own doing, none of the page's.
 * WebKit runs a context's init scripts (`addInitScript`: the theme,
 * `installRuns`, a spec's `init`) in every frame as that frame's own
 * scripts, and a frame sandboxed without `allow-scripts` blocks them and
 * says so as a console error; Chromium sets them in where no sandbox
 * reaches and says nothing. The product's one such frame holds no script
 * of its own (preview-overlay schemes.ts `blankFrame`: `sandbox=
 * "allow-same-origin"`, `srcdoc` "<!doctype html>"), so this message from
 * a srcdoc frame is the kit's scripts turned away, never the page's.
 */
export const kitsOwnMessage = (text: string): boolean =>
  text ===
  "Blocked script execution in 'about:srcdoc' because the document's frame is sandboxed and the 'allow-scripts' permission is not set.";

export interface PageOptions {
  /**
   * A browser of its own, by name, for a page traced while another page is:
   * DevTools tracing runs one at a time per browser ("Tracing has already
   * been started (possibly in another tab)"). Unset, the run's shared one.
   */
  browser?: string;
  /** WebKit for a spec that reads Safari's engine, Firefox for Gecko's; Chromium otherwise. */
  engine?: Engine;
  /**
   * Chromium only: its `--host-resolver-rules`, where a spec needs a name to
   * reach one address alone (`MAP localhost [::1]`: an agent's loopback
   * beside a scratch hub on 127.0.0.1; `MAP *.localtest.me 127.0.0.1`: host
   * mode's names where no DNS answers, as in a workspace). The browser then
   * connects to every name directly: a proxy the environment names (a
   * workspace's) would resolve the name itself, and answered such a page
   * 407.
   */
  hostRules?: string;
  /**
   * The page's context accepts a certificate of the run's own (a
   * Cloudflare-like front's, cloudflare-front.ts `scratchCertificate`), as a
   * browser trusts the real edge's: its https origins stay secure contexts.
   */
  ignoreHTTPSErrors?: boolean;
  /** Scripts installed before the page's own, in order. */
  init?: (() => void)[];
  /**
   * Chromium only: every frame in the page's own process, its preview's
   * included, as WebKit runs them and as Chromium does a frame of the same
   * site it does not isolate. Unset, Playwright's Chromium keys a preview's
   * origin to a process of its own (preview-bound's 2).
   */
  oneProcess?: boolean;
  /**
   * An HTTP proxy every request of the page's context goes through, its
   * loopback ones included (Playwright bypasses none unless told): a
   * spec's stand-in for what stands between the owner's browser and his
   * hub (idle-proxy.ts). `http://127.0.0.1:<port>`.
   */
  proxy?: string;
  /** Device pixels per css px, when a spec reads another device (an iPhone's 3). */
  scale?: number;
  /**
   * Chromium only: scrollbars that take their width, as a desk's Chromium
   * draws them (app.css's thin ones). Unset, Playwright's headless Chromium
   * hides them (`--hide-scrollbars`), so a box that starts or stops
   * scrolling never narrows what it holds.
   */
  scrollbars?: boolean;
  theme?: Theme;
  /**
   * The WebKit build a WebKit page runs on, by its Playwright revision,
   * where a spec reads a bug a phone's Safari still has and a newer build
   * has fixed (`PINNED_WEBKIT`). Unset, the build this playwright-core
   * expects, or the one `PROBE_WEBKIT` names.
   */
  webkit?: string;
  /**
   * Chromium only: every tile rastered whole whenever it changes
   * (`--disable-partial-raster`), on a browser of its own. Partial raster
   * redraws only what was invalidated into a tile it keeps, so the
   * antialiasing at those rects' edges follows the order the page changed
   * in: bench-usage-relay at the desk gave two pictures of one state, 5
   * pixels apart on Caw's rim, its dumps identical. The surfaces' walk
   * (walk.ts `passPage`) takes it; a spec timing the raster does not.
   */
  wholeRaster?: boolean;
}

/** What a page's context takes of `options` on how it reaches its origins: a certificate of the run's own, a proxy. */
const networkOf = (options: PageOptions) => ({
  ...(options.ignoreHTTPSErrors ? { ignoreHTTPSErrors: true } : {}),
  ...(options.proxy ? { proxy: { server: options.proxy } } : {}),
});

/**
 * WebKit 2359 (playwright-core 1.63.0's) hangs its web process on a blur
 * transitioning in the page, as the owner's iPhone Safari does; 2370
 * (1.64.1's) does not. The specs that guard against that hang run on it.
 */
export const PINNED_WEBKIT = "2359";

/**
 * A WebKit build in Playwright's browser cache, by its revision: its
 * `pw_run.sh`. Missing, the spec cannot read what it is for, and says how
 * to install it.
 */
function pinnedWebkit(revision: string): string {
  const cache =
    process.env.PLAYWRIGHT_BROWSERS_PATH ??
    join(homedir(), ".cache", "ms-playwright");
  const run = join(cache, `webkit-${revision}`, "pw_run.sh");
  if (!existsSync(run)) {
    throw new Error(
      `WebKit ${revision} is not installed at ${run}: install it with \`bunx playwright-core@1.63.0 install webkit\``
    );
  }
  return run;
}

/** A spec: one surface, a short list of assertions on the kit's helpers. */
export interface Spec {
  /**
   * Why the spec runs on the host, outside every workspace, when it does:
   * it starts workspace boundaries (a delegate's, a stage's, a place's), and
   * no boundary starts inside another (README "A spec that delegates runs on
   * the host"). Inside a workspace such a spec is not run: the run says it
   * runs on the host, with its command.
   */
  host?: string;
  /** The spec's name: its file's, its baselines' folder. */
  name: string;
  /**
   * Why the spec stands up its own git and HOME, when it does: it runs in a
   * process of its own (run.ts {@link OWN_HOME_ENV}), with a scratch HOME set
   * as that process starts (Bun's `os.homedir()` reads HOME once, at start,
   * and never a HOME set later) and none of an enclosing workspace's git or
   * gh settings, which would send its own setup pushes through that
   * workspace's git door.
   */
  ownHome?: string;
  run: (kit: Kit) => Promise<void>;
}

/** Set on the process run.ts starts for an {@link Spec.ownHome} spec: its scratch HOME. */
export const OWN_HOME_ENV = "CAWCO_PROBE_OWN_HOME";

/**
 * The variables of an enclosing workspace's git and gh an
 * {@link Spec.ownHome} spec runs without: its git config words
 * (`GIT_CONFIG_*`, with `pushInsteadOf` to the workspace's door), the door's
 * own (`CAWCO_GIT_*`), its ssh, LFS and template settings, and gh's config dir.
 */
export const ENCLOSING_GIT_ENV =
  /^(?:GIT_CONFIG_\w+|CAWCO_GIT_\w+|GIT_SSH_COMMAND|GIT_LFS_SKIP_PUSH|GIT_TEMPLATE_DIR|GH_CONFIG_DIR)$/;

/**
 * Why a spec cannot start a boundary of its own where this run is: inside a
 * workspace, on Linux bwrap is refused the namespaces it needs and on macOS
 * Seatbelt does not nest (core boundary-nesting.ts). The host is not.
 */
export const BOUNDARY_INSIDE =
  "a workspace boundary cannot start inside another (bwrap on Linux is refused its namespaces, macOS's Seatbelt does not nest)";

/**
 * What `--approve` asks of one spec: every baseline it writes
 * (`--approve <spec>`), or the entries named (`--approve <spec>:<entry>,…`).
 */
export type Approval = "all" | readonly string[];

/**
 * A baseline entry's name as `--approve` names it: lower case, every run of
 * other characters one dash ("phone 390" is `phone-390`).
 */
export const entrySlug = (entry: string): string =>
  entry
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Where approved baselines live: `baselines/` beside the kit, or the folder
 * `PROBE_BASELINES` names (a scratch copy, to prove an approve on).
 */
const BASELINES_ROOT =
  process.env.PROBE_BASELINES ?? join(import.meta.dir, "baselines");

/** A capture that differs from its approved baseline, for the owner's review page. */
export interface Changed {
  /** The approved baseline's png. */
  baseline: string;
  /** The region that changed, device px; null when the sizes differ. */
  box: { height: number; width: number; x: number; y: number } | null;
  /** This run's capture's png. */
  capture: string;
  /** The capture's name, as `--approve <spec>:<entry>` names it. */
  entry: string;
  spec: string;
}

export interface Kit {
  /**
   * Whether `--approve` names this spec: this run writes baselines, the
   * entries `approves` names, and a spec skips what reads against them.
   */
  approve: boolean;
  /**
   * Whether this run writes `entry`'s baseline (a capture's name, or a
   * spec's own entry such as a leg): every one for `--approve <spec>`, only
   * those named for `--approve <spec>:<entry>,…`, matched by `entrySlug`.
   * A spec asks it of every entry it could write: a name it never asks of
   * fails the run, so a misspelt entry never passes as approved.
   */
  approves: (entry: string) => boolean;
  /** This spec's approved baselines: `baselines/web/<spec>/`. */
  baselines: string;
  /** The dev server against no hub: the `/motion/` benches, which need none. */
  bench: () => Promise<string>;
  /**
   * The dev server against `hub`, a stub the spec stands up itself, its
   * server render included: SvelteKit's dev guard runs there, so a relative
   * `fetch` the render makes throws `ssr_fetch_relative_url` into its log
   * (`$TMPDIR/probe-kit/vite-dev-<port>.err.log`). It stops when the spec ends.
   */
  benchFor: (hub: string) => Promise<string>;
  /** The built dashboard against no hub (built once per run): a bench a runtime spec times. */
  built: () => Promise<string>;
  /**
   * The built dashboard served against `hub`, a hub the spec stands up
   * itself (a stub answering the reads one surface makes, server-side
   * rendering included): its address. It stops when the spec ends.
   */
  builtFor: (hub: string) => Promise<string>;
  /** A capture that differs from its approved baseline: kept for `--review`. */
  changed: (change: Omit<Changed, "spec">) => void;
  /** One assertion: a PASS or FAIL line. Returns `ok`. */
  check: (assertion: string, ok: boolean, detail?: string) => boolean;
  /**
   * A scratch fleet (scratch-fleet.ts), nothing launched yet, answered once
   * the run's dashboard is built; its `dashboard()` serves that build
   * against its hub once asked, where the hub is reached (`hub.at`). Both go
   * when the spec ends. `hub`: where its hub listens and is reached
   * (scratch-fleet.ts `HubAddress`), 127.0.0.1 unless named.
   */
  fleet: (
    respond: (request: Seen) => Reply | Promise<Reply>,
    hub?: HubAddress
  ) => Promise<KitFleet>;
  /** A line that is neither a pass nor a fail (a capture awaiting its baseline). */
  note: (line: string) => void;
  /** Where the spec writes what a reviewer reads after a failure. */
  out: string;
  /** A page in a pinned context; it closes when the spec ends. */
  page: (view: View, options?: PageOptions) => Promise<Page>;
  spec: string;
}

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

declare global {
  interface Window {
    /**
     * Whether `el` lies inside what `selector` names, out through every
     * shadow host it sits in (`closest` stops at a shadow root).
     */
    kitInside: (el: Element | null | undefined, selector: string) => boolean;
    /**
     * Every animation on the page: the document's, and every open shadow
     * root's at any depth. Chromium's `document.getAnimations()` leaves out
     * a shadow tree's (an artifact's overlay runs in one), each shadow root
     * answers its own.
     */
    kitRuns: () => Animation[];
  }
}

/** Installs `kitRuns` and `kitInside` on every page and frame, before its own scripts. */
function installRuns(): void {
  const walk = (root: Document | ShadowRoot): Animation[] => {
    const runs = [...root.getAnimations()];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const shadow = (node as Element).shadowRoot;
      if (shadow) {
        runs.push(...walk(shadow));
      }
    }
    return runs;
  };
  window.kitRuns = () => walk(document);
  window.kitInside = (el, selector) => {
    let at: Element | null = el ?? null;
    while (at) {
      if (at.closest(selector)) {
        return true;
      }
      const root = at.getRootNode();
      at = root instanceof ShadowRoot ? root.host : null;
    }
    return false;
  };
}

/** The dashboard's vite, run as itself: one process a kill ends (`bunx` left its `node vite` running). */
const VITE = join(DASHBOARD, "node_modules", ".bin", "vite");

/**
 * Every vite this process started (a build, a server) that has not ended:
 * each is ended as the process exits, however it exits but a SIGKILL. A stop signal
 * reaches the exit through scratch-fleet.ts's own handlers, which end the
 * process once its fleets are gone; a run stopped that way left its `vite
 * preview` servers running, their parent the init process.
 */
const VITES = new Set<Bun.Subprocess>();
process.on("exit", () => {
  for (const child of VITES) {
    child.kill();
  }
});

/**
 * The dashboard built, as the probes' `vite preview` serves it: the shipped
 * build's code in the `bench` mode, whose one difference is that the
 * `/motion/` benches answer (routes/(app)/motion/+layout.ts), so a runtime
 * spec times one as built.
 */
const viteBuild = async (): Promise<void> => {
  // `PROBE_BUILD_LOCK` names a lock file builds on this host share
  // (`flock`): one build at a time across the workspaces that name it.
  const lock = process.env.PROBE_BUILD_LOCK;
  const build = [VITE, "build", "--mode", "bench"];
  const child = Bun.spawn(lock ? ["flock", lock, ...build] : build, {
    cwd: DASHBOARD,
    // This process's own, git's repository variables gone (scratch-fleet.ts
    // `GIT_REPOSITORY_ENV`): the build reads `git rev-parse` for its version.
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  VITES.add(child);
  child.exited.then(() => VITES.delete(child));
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`vite build exited ${code}: ${(err || out).slice(-2000)}`);
  }
};

/**
 * The checkout's built dashboard, which every run in it serves from one
 * folder (`.svelte-kit/output`, what `vite preview` reads), and the lock the
 * runs serving it share.
 *
 * WHY. A build empties that folder before it writes it again, and each run
 * built once, so a second run in a checkout rebuilt it under every run still
 * serving it. On 2026-10-18 two base self-compares started 2 s apart in one
 * checkout: the second's build took the first's server chunks and fonts away
 * (`ERR_MODULE_NOT_FOUND …/chunks/sr-only-styles.js`, then an `ENOENT` on a
 * woff2 nothing handled ended `vite preview`) and every state after was
 * refused. A surfaces walk beside a style-snapshot's build in the converted
 * checkout lost nine pages to reloads ("Execution context was destroyed,
 * most likely because of a navigation"): a build names its chunks anew.
 *
 * HOW. A build carries the key of the tree it was built from
 * (`OUTPUT_STAMP`, `treeKey`). A run whose tree has that key serves the
 * build as it is, holding the lock shared. A run whose tree differs builds
 * only once it holds the lock alone, which is once no run serves the old
 * build. The kernel frees a run's lock when it ends, a SIGKILL included.
 * `vite dev` reads the sources, not this folder, and holds nothing.
 */
const KIT_DIR = join(DASHBOARD, ".svelte-kit");
const OUTPUT_LOCK = join(KIT_DIR, "probe-output.lock");
const OUTPUT_STAMP = join(KIT_DIR, "output", "probe-tree.txt");
/** Between looks at a lock another run holds. */
const OUTPUT_WAIT_MS = 2000;
/**
 * What a build reads, from the root: the dashboard, the workspace packages
 * it imports, the design tokens, the patches the install applies to its
 * dependencies (`patches/`: `bun.lock` names a patch's path, not its
 * content, so an edited patch kept the old build and its old library) and
 * the root's own files (`bun.lock`, `package.json`); a glob's `*` stops at
 * a `/`.
 */
const BUILD_DIRS = ["apps/dashboard", "packages", "design", "patches"];
const BUILD_READS = [...BUILD_DIRS, ":(glob)*"];

/** Git's answer in the checkout, `input` on its stdin. */
const gitSays = async (args: string[], input?: string): Promise<string> => {
  const child = Bun.spawn(["git", ...args], {
    cwd: ROOT,
    env: process.env,
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`git ${args.join(" ")} exited ${code}: ${err.trim()}`);
  }
  return out;
};

/**
 * The tree a build is built from, as one key: what it reads as HEAD has it
 * (every file's blob there), every change to one since, and every untracked
 * one's content. Not HEAD itself: a commit to the kit alone made every run
 * after it wait on every run still serving, for a build nothing it reads
 * had changed. The build writes HEAD's short hash as its version
 * (vite.config.ts `BUILD_VERSION`), which a page only compares with the
 * version the server it came from serves (served-build.svelte.ts), the same
 * build's, and draws nowhere. The baselines a run writes are not in it, so
 * an approve never makes the next run's tree another.
 */
const treeKey = async (): Promise<string> => {
  const hash = new Bun.CryptoHasher("sha256");
  const [tracked, root] = await Promise.all([
    gitSays(["ls-tree", "-r", "HEAD", "--", ...BUILD_DIRS]),
    gitSays(["ls-tree", "HEAD"]),
  ]);
  hash.update(tracked);
  // The root's own files (`bun.lock`, `package.json`), its folders apart.
  hash.update(
    root
      .split("\n")
      .filter((line) => line.includes(" blob "))
      .join("\n")
  );
  hash.update(
    await gitSays(["diff", "HEAD", "--binary", "--", ...BUILD_READS])
  );
  const untracked = (
    await gitSays([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ...BUILD_READS,
    ])
  )
    .split("\0")
    .filter(Boolean);
  if (untracked.length > 0) {
    hash.update(untracked.join("\0"));
    hash.update(
      await gitSays(["hash-object", "--stdin-paths"], untracked.join("\n"))
    );
  }
  return hash.digest("hex");
};

/**
 * adapter-node's half of the build (vite.config.ts `BUILD_OUT`), which a spec's
 * publish step (apps/dashboard/scripts/publish-build.ts) consumes: it renames
 * it to `build/`. A build whose `.build-next` was published is not whole, and
 * a second run of that spec on the tree would find nothing to publish.
 */
const ADAPTER_OUTPUT = join(DASHBOARD, ".build-next");

/** The checkout's build is this tree's, and whole: its stamp says `key` and adapter-node's output stands unpublished. */
const stampSays = (key: string): Promise<boolean> =>
  Bun.file(OUTPUT_STAMP)
    .text()
    .then(
      (stamp) => stamp === key && existsSync(ADAPTER_OUTPUT),
      () => false
    );

/**
 * The checkout's build of this tree, built here when it is not, and the
 * descriptor that holds it shared until the run lets it go (`unlock`).
 */
const builtOutput = async (): Promise<number> => {
  await mkdir(KIT_DIR, { recursive: true });
  const fd = openLockFile(OUTPUT_LOCK, true);
  try {
    const key = await treeKey();
    let waiting = false;
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: each look follows the last
      if (tryShare(fd) && (await stampSays(key))) {
        return fd;
      }
      release(fd);
      if (tryLock(fd)) {
        try {
          if (!(await stampSays(key))) {
            await rm(OUTPUT_STAMP, { force: true });
            console.log("… building the dashboard");
            await viteBuild();
            await writeFile(`${OUTPUT_STAMP}.new`, key);
            await rename(`${OUTPUT_STAMP}.new`, OUTPUT_STAMP);
          }
        } finally {
          release(fd);
        }
        continue;
      }
      if (!waiting) {
        waiting = true;
        console.log(
          "… waiting on this checkout's built dashboard: another run is building it, or serves one built from another tree"
        );
      }
      await Bun.sleep(OUTPUT_WAIT_MS);
    }
  } catch (error) {
    unlock(fd);
    throw error;
  }
};

/** A dashboard server: its address, its process, and its end when its run is done with it. */
interface Served {
  base: string;
  child: Bun.Subprocess;
  /** Ends it on purpose: an end without this one is a loss (`serve`'s `lost`). */
  stop: () => void;
}

/** How many of a lost server's last lines, of each stream, its loss says. */
const LOST_LINES = 15;

/**
 * How a server's process ended, a signal by its name: the one it took
 * itself, or the one its server took under it. `bunx` runs vite as a child
 * and exits 128 plus the number of the signal that ended it, and a SIGKILL
 * leaves nothing in the server's own stderr. Bun names the signal, or
 * gives its number (`signalCode: NodeJS.Signals | number | null`).
 */
const signalNamed = (signal: number): string | undefined =>
  Object.entries(constants.signals).find(([, n]) => n === signal)?.[0];
const endOf = (
  code: number | null,
  signal: Bun.Subprocess["signalCode"]
): string => {
  if (typeof signal === "number") {
    return `signal ${signalNamed(signal) ?? signal}`;
  }
  if (signal) {
    return `signal ${signal}`;
  }
  const taken =
    code !== null && code > 128 ? signalNamed(code - 128) : undefined;
  return taken ? `exit ${code}: signal ${taken}` : `exit ${code}`;
};

/** A log's last lines, indented under the line that says them; none when it can't be read. */
const tailOf = async (file: string): Promise<string> => {
  const text = await Bun.file(file)
    .text()
    .catch(() => "");
  return text
    .split("\n")
    .filter((line) => line.trim())
    .slice(-LOST_LINES)
    .join("\n  ");
};

/**
 * The dashboard served against `hub`: the dev server (`vite dev`), or the
 * built one (`vite preview`, what the runtime specs time: a dev build's own
 * checks would be in every long task). Its address and process.
 *
 * What it prints goes to files of its own beside the run's output
 * (`probe-kit/vite-<how>-<port>.err.log`, `.out.log`), and an end its run did not ask for is
 * `lost`, with that file's last lines: two style-snapshot approves' servers
 * stopped a few minutes into their walks, every state after was refused at
 * `goto`, and each run still read ALL PASS, its server's own words thrown
 * away.
 */
async function serve(
  how: "dev" | "preview",
  hub: string,
  lost: (why: string) => void,
  env: Record<string, string> = {},
  /** The port to serve on: a fleet's `dashboardPort`, the one its hub names; any free one when unset. */
  at?: number,
  /** The address to serve on: a fleet's hub's (`hub.at`); 127.0.0.1 when unset. */
  host = "127.0.0.1"
): Promise<Served> {
  const port = at ?? (await freePort());
  const logs = join(process.env.TMPDIR ?? join(ROOT, ".probe"), "probe-kit");
  await mkdir(logs, { recursive: true });
  const log = join(logs, `vite-${how}-${port}`);
  const child = Bun.spawn(
    [VITE, how, "--host", host, "--port", String(port), "--strictPort"],
    {
      cwd: DASHBOARD,
      env: {
        ...process.env,
        ...env,
        CAWCO_DEV_HUB_URL: hub,
        CAWCO_HUB_URL: hub,
      },
      stdout: Bun.file(`${log}.out.log`),
      stderr: Bun.file(`${log}.err.log`),
    }
  );
  let stopping = false;
  VITES.add(child);
  child.exited.then(() => VITES.delete(child));
  const base = `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
  const ended = async (code: number): Promise<void> => {
    if (stopping) {
      return;
    }
    const err = await tailOf(`${log}.err.log`);
    const out = await tailOf(`${log}.out.log`);
    lost(
      `vite ${how} at ${base} ended (${endOf(code, child.signalCode)}) before its run was done with it; every page after it is refused (${log}.err.log, .out.log):\n  ${err}\n  ${out}`
    );
  };
  child.exited.then(ended).catch(() => undefined);
  await until(
    "the built dashboard answering",
    () => fetch(base).then((r) => r.ok),
    Boolean,
    60_000
  );
  return {
    base,
    child,
    stop: () => {
      stopping = true;
      child.kill();
    },
  };
}
/**
 * Where a bench's dashboard reaches its hub: a stand-in that is never one.
 * The benches feed the client's own state. A read is refused (503). The
 * socket is taken and answers each message with itself, so the page's
 * heartbeat hears it and never drops it, and no board ever comes: the page
 * stays connecting, the state a cold load passes through, and the Shell
 * raises no hub banner over a bench (f57855286). A hub that refused the
 * socket raised it 4 s in.
 */
let noHub: string | undefined;
const benchHub = (): string => {
  if (!noHub) {
    const hub = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      // A socket the page holds open for the whole run.
      idleTimeout: 0,
      fetch: (request, server) =>
        server.upgrade(request)
          ? undefined
          : new Response("no hub", { status: 503 }),
      websocket: {
        idleTimeout: 0,
        message: (socket, message) => {
          socket.send(message);
        },
      },
    });
    hub.unref();
    noHub = `http://127.0.0.1:${hub.port}`;
  }
  return noHub;
};

/**
 * What one run holds across its specs: the browsers, the build and its
 * servers, and the machine's heavy-run slot (lib/heavy-run.ts) they run
 * under. The run takes the slot as it first builds, serves, opens a browser
 * or stands a fleet up, waiting while none is free or the machine has no
 * room, and holds it until `close`: a fleet's sessions, its servers and its
 * Chromium weigh on the machine for as long as they run, not only while
 * they start. Each `run.ts` process is a run of its own and holds its own.
 */
export class Run {
  failures = 0;
  /** Each failed assertion's line, said again over the run's last line (a report that quotes the run's tail keeps them). */
  readonly failed: string[] = [];
  notes = 0;
  /** The specs not run here because they run on the host ({@link Spec.host}). */
  readonly onHost: string[] = [];
  /** Every capture this run that differs from its baseline, in run order. */
  readonly changed: Changed[] = [];
  private devServer: Promise<Served> | null = null;
  private builtServer: Promise<Served> | null = null;
  private built: Promise<void> | null = null;
  /** The descriptor holding the checkout's build shared while this run serves it. */
  private output: number | null = null;
  private readonly browsers = new Map<string, Promise<Browser>>();
  private slot: Promise<HeavySlot> | null = null;

  /** The run's heavy-run slot, taken the first time it starts anything heavy. */
  heavy(): Promise<HeavySlot> {
    this.slot ??= heavySlot();
    return this.slot;
  }

  /**
   * The checkout's build of this tree, the first time a spec needs it, held
   * until the run closes (`builtOutput`).
   */
  build(): Promise<void> {
    this.built ??= (async () => {
      await this.heavy();
      this.output = await builtOutput();
    })();
    return this.built;
  }

  /** The dashboard served (`serve`), under the run's slot; a server lost before its run is done fails the run. */
  private async startServer(
    how: "dev" | "preview",
    hub: string,
    port?: number,
    host?: string
  ): Promise<Served> {
    await this.heavy();
    return serve(
      how,
      hub,
      (why) => {
        const line = `FAIL the dashboard server: ${why}`;
        console.log(line);
        this.failures += 1;
        this.failed.push(line.slice(0, 1200));
      },
      {},
      port,
      host
    );
  }

  browser(
    engine: Engine,
    revision?: string,
    oneProcess = false,
    own?: string,
    wholeRaster = false,
    hostRules?: string,
    scrollbars = false
  ): Promise<Browser> {
    const key = [
      engine,
      revision,
      oneProcess && "one-process",
      wholeRaster && "whole-raster",
      own,
      hostRules && `hosts:${hostRules}`,
      scrollbars && "scrollbars",
    ]
      .filter(Boolean)
      .join("-");
    const known = this.browsers.get(key);
    if (known) {
      return known;
    }
    const env =
      process.platform === "linux"
        ? { ...process.env, FONTCONFIG_FILE: FONTS_CONF }
        : process.env;
    // `PROBE_WEBKIT` names a WebKit build to run (its `pw_run.sh`) where the
    // one this playwright-core expects is not installed; a page's own
    // `webkit` revision names one in Playwright's browser cache.
    const launch = {
      webkit: () =>
        webkit.launch({
          env,
          executablePath: revision
            ? pinnedWebkit(revision)
            : process.env.PROBE_WEBKIT,
        }),
      firefox: () => firefox.launch({ env }),
      chromium: () =>
        chromium.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-gpu",
            ...(wholeRaster ? ["--disable-partial-raster"] : []),
            ...(oneProcess
              ? [
                  "--disable-site-isolation-trials",
                  "--disable-features=IsolateOrigins,site-per-process,OriginIsolationHeader",
                ]
              : []),
            ...(hostRules
              ? [
                  `--host-resolver-rules=${hostRules}`,
                  "--proxy-server=direct://",
                ]
              : []),
            DESK_POINTER,
          ],
          ...(scrollbars ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}),
          env,
        }),
    } satisfies Record<Engine, () => Promise<Browser>>;
    const launched = this.heavy().then(() => launch[engine]());
    this.browsers.set(key, launched);
    return launched;
  }

  bench(): Promise<string> {
    this.devServer ??= this.startServer("dev", benchHub());
    return this.devServer.then((s) => s.base);
  }

  builtBench(): Promise<string> {
    this.builtServer ??= this.build().then(() =>
      this.startServer("preview", benchHub())
    );
    return this.builtServer.then((s) => s.base);
  }

  /** Runs one spec with its own pages and fleets, closed after it however it ends. */
  async spec(spec: Spec, approval: Approval | null): Promise<void> {
    if (spec.host && process.env.CAWCO_WORKSPACE) {
      this.onHost.push(spec.name);
      console.log(
        `HOST ${spec.name}: runs on the host, not in this workspace: ${spec.host}, and ${BOUNDARY_INSIDE}. Run it from a shell outside every workspace, on a checkout of this commit: bun scripts/probe-kit/run.ts ${spec.name}`
      );
      return;
    }
    const named = approval === null || approval === "all" ? [] : approval;
    const asked = named.map(entrySlug);
    /** Every entry the spec asked `approves` of: what it could write. */
    const offered = new Set<string>();
    const contexts: BrowserContext[] = [];
    const ends: (() => Promise<void>)[] = [];
    /** The run's failures before this spec: more after it, and it failed. */
    const failuresBefore = this.failures;
    const out = join(
      process.env.TMPDIR ?? join(ROOT, ".probe"),
      "probe-kit",
      spec.name
    );
    // Its folder holds this run's files alone: one an earlier run left there
    // would read as this run's evidence.
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    // A fleet whose spec failed keeps its sandbox for reading (its hub's log
    // and database); the spec's next run removes it (scratch-fleet.ts
    // `removeKept`). One that passed goes with the spec.
    const failedBefore = this.failures;
    const failedHere = () => this.failures > failedBefore;
    const kit: Kit = {
      spec: spec.name,
      approve: approval !== null,
      approves: (entry) => {
        const slug = entrySlug(entry);
        offered.add(slug);
        return approval === "all" || asked.includes(slug);
      },
      baselines: join(BASELINES_ROOT, "web", spec.name),
      out,
      changed: (change) => {
        this.changed.push({ ...change, spec: spec.name });
      },
      check: (assertion, ok, detail) => {
        const line = `${ok ? "PASS" : "FAIL"} ${spec.name}: ${assertion}${detail ? ` (${detail})` : ""}`;
        console.log(line);
        if (!ok) {
          this.failures += 1;
          this.failed.push(line.slice(0, 600));
        }
        return ok;
      },
      note: (line) => {
        this.notes += 1;
        console.log(`NOTE ${spec.name}: ${line}`);
      },
      bench: () => this.bench(),
      benchFor: async (hub) => {
        const served = this.startServer("dev", hub);
        ends.push(async () => {
          (await served).stop();
        });
        return (await served).base;
      },
      built: () => this.builtBench(),
      builtFor: async (hub) => {
        const served = this.build().then(() =>
          this.startServer("preview", hub)
        );
        ends.push(async () => {
          (await served).stop();
        });
        return (await served).base;
      },
      fleet: async (respond, hub) => {
        // Under the run's slot, taken by the build: the fleet's own hold
        // (scratch-fleet.ts) counts once in this process.
        // Built before the fleet starts, never between its start and the
        // dashboard's: the build runs once per run, so a fleet left waiting
        // on it ran its sessions on for the build's length when its spec
        // came first and not at all after another, and a capture read its
        // sessions in one state alone and another in a run (tab-strip's
        // working tabs, idle when a fleet spec ran before it).
        await this.build();
        const fleet = await scratchFleet({
          name: `probe-kit-${spec.name}`,
          respond,
          ...(hub ? { hub } : {}),
        });
        let served: Promise<Served> | null = null;
        let servedDev: Promise<Served> | null = null;
        ends.push(async () => {
          (await served)?.stop();
          (await servedDev)?.stop();
          // A spec that failed keeps what says why, which goes with the
          // fleet: into its output folder, the hub still answering.
          if (this.failures > failuresBefore) {
            const kept = join(out, "fleet-on-failure");
            const said = await fleetEvidence(fleet, kept).then(
              () => kept,
              (error) => `${kept} (in part: ${error})`
            );
            const line = `FAIL ${spec.name}: the failed run's fleet, its logs and every session's transcript, are in ${said}`;
            console.log(line);
            this.failed.push(line);
          }
          await fleet.close();
          await fleet.clean(failedHere());
        });
        return Object.assign(fleet, {
          dashboard: () => {
            served ??= this.build().then(() =>
              this.startServer(
                "preview",
                fleet.base,
                fleet.dashboardPort,
                fleet.hub.at
              )
            );
            return served.then((s) => s.base);
          },
          devDashboard: () => {
            servedDev ??= this.startServer("dev", fleet.base);
            return servedDev.then((s) => s.base);
          },
        });
      },
      page: async (view, options = {}) => {
        const v = VIEWS[view];
        const engine = options.engine ?? RUN_ENGINE;
        const browser = await this.browser(
          engine,
          engine === "webkit" ? options.webkit : undefined,
          options.oneProcess,
          options.browser,
          options.wholeRaster,
          options.hostRules,
          options.scrollbars
        );
        const phoneAgent = PHONE_AGENT[engine];
        const context = await browser.newContext({
          viewport: { width: v.width, height: v.height },
          deviceScaleFactor: options.scale ?? SCALE,
          hasTouch: v.touch,
          // Gecko has no mobile viewport mode in Playwright ("isMobile is
          // not supported in Firefox"): a touch screen at the size alone.
          isMobile: v.touch && engine !== "firefox",
          colorScheme: options.theme ?? "light",
          ...networkOf(options),
          ...(v.touch && v.width < PHONE_MAX_WIDTH && phoneAgent
            ? { userAgent: phoneAgent }
            : {}),
        });
        contexts.push(context);
        // Every frame runs it; one with an opaque origin (a browser error
        // page in a frame whose server went away, a sandboxed document) has
        // no storage, and reading it there throws a SecurityError.
        await context.addInitScript((t) => {
          if (self.origin !== "null") {
            localStorage.setItem("cawco-theme", t);
          }
        }, options.theme ?? "light");
        await context.addInitScript(installRuns);
        for (const script of options.init ?? []) {
          // biome-ignore lint/performance/noAwaitInLoops: each script before the next, in order
          await context.addInitScript(script);
        }
        const page = await context.newPage();
        // A crashed renderer answers no DevTools command again, and a CDP
        // session's send waits on it for ever: closing the page rejects
        // every send still waiting, so the crash fails the spec, never hangs it.
        page.on("crash", () => {
          kit.check("the page's renderer runs to the end", false, page.url());
          page.close().catch(() => undefined);
        });
        // The page stands for its device in what it points with: a desk's
        // mouse, a touch screen's finger (DESK_POINTER). A leg on a page that
        // does not fails here, before it measures what the owner never sees.
        const want = POINTER_OF(v.touch);
        const missed = await page.evaluate(
          ({ pointer, hover }) =>
            [
              `(pointer: ${pointer})`,
              `(hover: ${hover})`,
              `(any-pointer: ${pointer})`,
              `(any-hover: ${hover})`,
            ].filter((query) => !matchMedia(query).matches),
          want
        );
        if (missed.length > 0) {
          kit.check(
            `${view}: the page points as its device does`,
            false,
            `${engine} does not match ${missed.join(" ")}`
          );
        }
        return page;
      },
    };
    const started = performance.now();
    try {
      await spec.run(kit);
      const unknown = asked.filter((entry) => !offered.has(entry));
      if (unknown.length > 0) {
        kit.check(
          "--approve names entries this spec writes",
          false,
          `no ${unknown.join(", ")}; it writes ${[...offered].join(", ") || "none"}`
        );
      }
    } catch (error) {
      kit.check(
        "runs to its end",
        false,
        error instanceof Error ? (error.stack ?? error.message) : String(error)
      );
    } finally {
      for (const context of contexts) {
        // biome-ignore lint/performance/noAwaitInLoops: one context at a time
        await context.close().catch(() => undefined);
      }
      for (const end of ends.reverse()) {
        // biome-ignore lint/performance/noAwaitInLoops: fleets stop one at a time, by PID
        await end().catch((error) => console.log(`  cleanup: ${error}`));
      }
      console.log(
        `  ${spec.name}: ${((performance.now() - started) / 1000).toFixed(0)}s`
      );
    }
  }

  async close(): Promise<void> {
    for (const browser of this.browsers.values()) {
      // biome-ignore lint/performance/noAwaitInLoops: one browser at a time
      await (await browser).close().catch(() => undefined);
    }
    (await this.devServer)?.stop();
    (await this.builtServer)?.stop();
    if (this.output !== null) {
      unlock(this.output);
      this.output = null;
    }
    (await this.slot?.catch(() => undefined))?.release();
    this.slot = null;
  }
}

export type KitFleet = Fleet & {
  /** The built dashboard served against this fleet's hub: its address. */
  dashboard: () => Promise<string>;
  /**
   * The dev server against this fleet's hub: every module is its own URL,
   * so a spec can name which source files a page fetched.
   */
  devDashboard: () => Promise<string>;
};

/** What `fleetEvidence` copies of each kind, by where it goes under its folder. */
const LOG_FILE = /\.(log|err)$/;

/**
 * A failed run's fleet, kept in `dir` before the fleet goes: its services'
 * logs (`logs/`, the sandbox's `*.log` and `*.err`: the hub's, every
 * agent's and sessiond's), every session's transcript as the hub serves it
 * (`transcripts/<title>-<id>.json`), its work items and artifacts as the
 * hub holds them, and every Claude Code session log under its HOME, each
 * account's included (`claude/`). Read while the hub still runs. What
 * cannot be read is said in `unread.txt`, never left out silently.
 */
async function fleetEvidence(fleet: Fleet, dir: string): Promise<void> {
  const unread: string[] = [];
  await mkdir(join(dir, "logs"), { recursive: true });
  for (const name of await readdir(fleet.sandbox)) {
    if (LOG_FILE.test(name)) {
      // biome-ignore lint/performance/noAwaitInLoops: a few files, one at a time
      await cp(join(fleet.sandbox, name), join(dir, "logs", name));
    }
  }
  await mkdir(join(dir, "transcripts"), { recursive: true });
  const instances = fleet.query<{ id: string; title: string | null }>(
    "SELECT id, title FROM instances"
  );
  for (const { id, title } of instances) {
    const name = `${(title ?? "untitled").replace(/[^\w-]+/g, "-").slice(0, 60)}-${id.slice(0, 8)}.json`;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one session at a time, off a hub that is closing next
      const response = await fetch(
        `${fleet.base}/api/instances/${id}/transcript`
      );
      await writeFile(join(dir, "transcripts", name), await response.text());
    } catch (error) {
      unread.push(`transcript of ${id} (${title}): ${error}`);
    }
  }
  for (const table of ["work_items", "artifacts"]) {
    // biome-ignore lint/performance/noAwaitInLoops: two tables, one at a time
    await writeFile(
      join(dir, `${table}.json`),
      JSON.stringify(fleet.query(`SELECT * FROM ${table}`), null, 2)
    );
  }
  // Claude Code's own session logs, the first account's and each other's.
  // `claude/home/…` the HOME's own `.claude`, `claude/cawco/accounts/<id>/…` each account's.
  const sessionLogs = new Bun.Glob("**/projects/**/*.jsonl");
  for (const [root, under] of [
    [join(fleet.home, CLAUDE_DIR_NAME), "home"],
    [join(fleet.home, ".cawco"), "cawco"],
  ] as const) {
    if (!existsSync(root)) {
      continue;
    }
    for (const file of sessionLogs.scanSync({ cwd: root, dot: true })) {
      const to = join(dir, "claude", under, file);
      // biome-ignore lint/performance/noAwaitInLoops: one log at a time
      await mkdir(join(to, ".."), { recursive: true });
      await cp(join(root, file), to);
    }
  }
  if (unread.length > 0) {
    await writeFile(join(dir, "unread.txt"), `${unread.join("\n")}\n`);
  }
}

/**
 * In the page: how many elements under `root` (its largest match, else the
 * body) Svelte has adopted. The dev server tags each with `__svelte_meta`;
 * a build marks each one it wires with a symbol-keyed cache (its class,
 * style or attributes, its delegated events: svelte constants.js
 * `CLASS_CACHE`, …). The server's markup carries neither.
 */
export function adopted(root: string): number {
  let top: Element = document.body;
  let most = -1;
  for (const el of document.querySelectorAll(root)) {
    const n = el.getElementsByTagName("*").length;
    if (n > most) {
      most = n;
      top = el;
    }
  }
  let count = 0;
  for (const el of [top, ...top.querySelectorAll("*")]) {
    if ("__svelte_meta" in el || Object.getOwnPropertySymbols(el).length > 0) {
      count += 1;
    }
  }
  return count;
}

/** The reads in a row, a frame apart, the page's layout boxes and adopted count hold for {@link pageReady}. */
const STILL_FRAMES = 3;
/** A frame at 60Hz, ms: what {@link pageReady} waits between reads. */
const FRAME_MS = 17;
/** How long {@link pageReady} gives the page to hydrate, let go of its first paint and stand. */
const READY_WITHIN_MS = 30_000;

/**
 * In the page, for {@link pageReady}: the step it still waits on, or, with
 * none left, every element's layout box and the adopted count as one string.
 */
function readiness(): { step: string | null; boxes: string } {
  let count = 0;
  const parts: number[] = [];
  for (const el of document.body.querySelectorAll("*")) {
    if ("__svelte_meta" in el || Object.getOwnPropertySymbols(el).length > 0) {
      count += 1;
    }
    if (el instanceof HTMLElement) {
      parts.push(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight);
    }
  }
  if (count === 0) {
    return { step: "hydrated", boxes: "" };
  }
  if (document.querySelector("[data-first-paint]")) {
    return { step: "the Shell's first-render release", boxes: "" };
  }
  return { step: null, boxes: `${count};${parts.join(",")}` };
}

/**
 * Waits until the page draws its own answers, standing: what a read taken
 * at `load` and two frames saw was the server's first paint (NeedsCaw's head
 * the cookie's 20px guess where the hydrated page at 390 draws 24px).
 *
 * 1. Hydrated: Svelte has adopted some of the page ({@link adopted}).
 * 2. The Shell's first-render release: no `[data-first-paint]` stands
 *    (Shell.svelte, first-render.svelte.ts). A page with no Shell has none.
 * 3. Still: every element's layout box (`offset*`, which a transform does
 *    not move, so a running breath or spinner is still) and the adopted
 *    count the same for {@link STILL_FRAMES} reads in a row a frame apart,
 *    so a part async Svelte hydrates late, or a size a script sets on
 *    mount, has landed.
 *
 * Read from here, a frame's length apart in real time, never on the page's
 * own frames: the walk's page runs Playwright's paused fake clock, which
 * holds `requestAnimationFrame` too. The walk calls it once `stand` has run
 * that clock on, so the Shell's release (a frame and a task after mount)
 * has come.
 */
export async function pageReady(page: Page): Promise<void> {
  const deadline = Date.now() + READY_WITHIN_MS;
  let last = "";
  let held = 0;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: each read is a frame after the last
    const now = await page.evaluate(readiness);
    if (now.step === null) {
      held = now.boxes === last ? held + 1 : 0;
      last = now.boxes;
      if (held >= STILL_FRAMES) {
        return;
      }
    } else {
      held = 0;
      last = "";
    }
    if (Date.now() > deadline) {
      throw new Error(
        `${page.url()}: not ready within ${READY_WITHIN_MS / 1000}s: ${now.step ?? `still for ${STILL_FRAMES} frames`}`
      );
    }
    await page.waitForTimeout(FRAME_MS);
  }
}

/** Opens `url`, waits for `ready` in the page and fonts loaded, then for the page's own answers, standing ({@link pageReady}). */
export async function open(
  page: Page,
  url: string,
  ready: string | (() => boolean),
  timeout = 60_000
): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (typeof ready === "string") {
    await page.waitForSelector(ready, { timeout });
  } else {
    await page.waitForFunction(ready, null, { timeout });
  }
  await page.evaluate(() => document.fonts.ready);
  await pageReady(page);
}

/** A button line of an ARIA snapshot (`- button "Try again"`), its name quoted as JSON. */
const BUTTON_LINE = /- button "((?:[^"\\]|\\.)*)"/g;

/**
 * The buttons in `scope` by their accessible names, as the accessibility
 * tree computes them, in order. A button's words are read here, never off
 * its text: a kit Button that can be pending keeps its idle and pending
 * words in one cell (ui/button pending-content), the one not shown
 * aria-hidden, so its text content holds both ("Try againStarting…").
 */
export async function buttonNames(scope: Locator): Promise<string[]> {
  const aria = await scope.ariaSnapshot();
  return [...aria.matchAll(BUTTON_LINE)].map(
    ([, name]) => JSON.parse(`"${name}"`) as string
  );
}

/**
 * Puts the page on a still clock: every looping animation running (endless,
 * or a set count of loops) is paused at its start, and every one-shot run is
 * waited on until it lands.
 */
export async function settle(page: Page, ms = 150): Promise<void> {
  // A looping run (a working glyph's breath, a needs-you dot's three echoes,
  // which outlast the wait) would be caught mid-loop, a different frame each
  // time: it is paused at currentTime 0 instead, the product's motion left
  // as designed and the frame read the same on every look. One started after
  // this (a row mounted later) is paused by the next settle.
  // A finite run still going after 10s will not land: named, as a failure,
  // never waited on for ever. A run lands when it finishes or stops running:
  // one paused after the wait began (a faded cover's skeleton holds still)
  // moves no more, and its `finished` never settles. Each run waited on is
  // kept with whether it landed, so one that didn't is named with its state.
  const landed = await readWithin(10_000, () =>
    page.evaluate(async () => {
      const running = window
        .kitRuns()
        .filter((run) => run.playState === "running");
      const end = (run: Animation) =>
        Number(run.effect?.getComputedTiming().endTime ?? 0);
      const finite = (run: Animation) => Number.isFinite(end(run));
      /** A run that repeats: endless, or a set count of loops (a needs-you dot's three echoes, motion/echo). */
      const repeats = (run: Animation) =>
        end(run) === Number.POSITIVE_INFINITY ||
        Number(run.effect?.getComputedTiming().iterations ?? 1) > 1;
      // On the document's clock only: a scroll-driven run's end is a
      // percentage (NaN here), it moves with its scroller, never on its own.
      const loops = running.filter(
        (one) => one.timeline instanceof DocumentTimeline && repeats(one)
      );
      for (const run of loops) {
        run.pause();
        run.currentTime = 0;
      }
      const waits = running
        .filter((run) => finite(run) && !loops.includes(run))
        .map((run) => ({ run, settled: false }));
      (window as unknown as { __kitWaits: typeof waits }).__kitWaits = waits;
      /** Resolves once `run` no longer runs (paused, idle), read each frame. */
      const stops = (run: Animation) =>
        new Promise<void>((done) => {
          const look = () => {
            if (run.playState === "running") {
              requestAnimationFrame(look);
            } else {
              done();
            }
          };
          requestAnimationFrame(look);
        });
      await Promise.all(
        waits.map((wait) =>
          Promise.race([
            wait.run.finished.catch(() => undefined),
            stops(wait.run),
          ]).then(() => {
            wait.settled = true;
          })
        )
      );
    })
  );
  switch (landed.kind) {
    case "answered":
      break;
    case "unanswered": {
      const stuck = await page.evaluate(() =>
        (
          (
            window as unknown as {
              __kitWaits?: { run: Animation; settled: boolean }[];
            }
          ).__kitWaits ?? []
        )
          .filter((wait) => !wait.settled)
          .map(({ run }) => {
            const target = (run.effect as KeyframeEffect | null)?.target;
            let what = `${run.constructor.name} ${run.id}`;
            if (run instanceof CSSTransition) {
              what = `transition ${run.transitionProperty}`;
            } else if (run instanceof CSSAnimation) {
              what = `animation ${run.animationName}`;
            }
            // The element by its hook, when it has one; its first class otherwise.
            const slot = target?.getAttribute("data-slot");
            const name = slot
              ? `[data-slot="${slot}"]`
              : `.${String(target?.className).split(" ")[0]}`;
            return `${what} on ${target?.tagName.toLowerCase()}${name} (${run.playState}${target?.isConnected === false ? ", detached" : ""})`;
          })
      );
      // The wait awaited the runs going when it began: one paused since
      // never settles its promise, and a busy machine can answer late, yet
      // nothing is moving now. Only a run still going never landed.
      if (stuck.length > 0) {
        throw new Error(
          `animations never landed within ${landed.after} ms: ${stuck.slice(0, 6).join("; ")}`
        );
      }
      break;
    }
    default: {
      const unhandled: never = landed;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
  await page.waitForTimeout(ms);
}

/** Two frames: a flush, a style pass, and whatever reads the frame after it. */
export const frames = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

/** How many times {@link pressIn} presses before a press its `<iframe>` element took is a failure. */
const PRESSES = 3;
/** How long {@link pressIn} waits for the page around a frame to uncover its target. */
const UNCOVER_MS = 5000;

/**
 * What in the pages around `inner` stands over `point` (in `inner`'s
 * viewport), or null when every `<iframe>` up the chain is the element at
 * that point in its own parent. A press is sent at the top page's point and
 * the top page hit-tests it, so an overlay there (a sheet, a popover) takes
 * a press Playwright's own check never sees: that check runs inside the
 * target's frame alone. `through` names a layer that takes the press on
 * purpose (a preview overlay's Comment layer, which asks the frame under it
 * what the point is): at its level it stands for the `<iframe>`. Each level
 * maps the point through its `<iframe>`'s box: its border and padding, and
 * any scale a transform puts on it.
 */
async function coverOver(
  inner: Frame,
  point: { x: number; y: number },
  through: string | null
): Promise<string | null> {
  let at = point;
  for (
    let child = inner, parent = inner.parentFrame();
    parent;
    child = parent, parent = parent.parentFrame()
  ) {
    // biome-ignore lint/performance/noAwaitInLoops: each level maps the point the level inside it gave
    const element = await child.frameElement();
    const seen = await element.evaluate(
      (el: Element, { p, layer }) => {
        const box = el.getBoundingClientRect();
        const html = el as HTMLElement;
        const style = getComputedStyle(el);
        const scale = html.offsetWidth > 0 ? box.width / html.offsetWidth : 1;
        const x =
          box.left +
          (html.clientLeft + Number.parseFloat(style.paddingLeft) + p.x) *
            scale;
        const y =
          box.top +
          (html.clientTop + Number.parseFloat(style.paddingTop) + p.y) * scale;
        const hit = document.elementFromPoint(x, y);
        if (hit === el || (layer && hit?.closest(layer))) {
          return { x, y, cover: null };
        }
        const name = (node: Element | null): string => {
          if (!node) {
            return "nothing (the point is off the page)";
          }
          // The surface it belongs to, by its role and its accessible name:
          // a sheet reads as the dialog it is, not the row inside it.
          const surface = node.closest(
            "[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=tooltip], [role=complementary], [role=region], [role=banner], [role=navigation], [popover], dialog, aside, header, nav"
          );
          const labelled = surface
            ?.getAttribute("aria-labelledby")
            ?.split(" ")
            .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
            .join(" ");
          const said = surface?.getAttribute("aria-label") ?? labelled;
          const role =
            surface?.getAttribute("role") ?? surface?.tagName.toLowerCase();
          const slot = node.closest("[data-slot]")?.getAttribute("data-slot");
          return [
            `<${node.tagName.toLowerCase()}>`,
            slot ? `[data-slot=${slot}]` : "",
            role ? `in the ${role}` : "",
            said ? `“${said}”` : "",
          ]
            .filter(Boolean)
            .join(" ");
        };
        return {
          x,
          y,
          cover: `${name(hit)} at (${Math.round(x)}, ${Math.round(y)}) in ${location.href}`,
        };
      },
      { p: at, layer: through }
    );
    if (seen.cover) {
      return seen.cover;
    }
    at = { x: seen.x, y: seen.y };
  }
  return null;
}

/**
 * Presses `target` in `frame` (a selector in it, or a locator into it),
 * once nothing in the pages around it stands over it, and returns once a
 * press went past the frame's `<iframe>` element; `tap` presses it with a
 * finger. The press's point is the target's centre: every page around the
 * frame must have the frame's `<iframe>` element there ({@link coverOver}),
 * else the press fails naming what covers it, where Playwright would
 * report a click done that a sheet took.
 *
 * Chromium hit-tests a press sent over the DevTools protocol against the
 * compositor's last frame, and a frame not yet in it takes the press as its
 * `<iframe>` element in the parent: "the compositor might not be up-to-date
 * yet resulting in a misclick (the iframe element becomes the event target
 * instead of the content inside the iframe)" (Puppeteer's
 * test/src/oopif.spec.ts, on crbug.com/1334119). Playwright's click hears
 * no event in the frame and calls it done (its injected
 * `setupHitTargetInterceptor`: `return result || "done"`). A person presses
 * only what was drawn: each press waits for two frames of the page inside
 * and two of the page around it, and a press the `<iframe>` element itself
 * took reached nothing in the page, so it is made again. The element is
 * watched, not the frame's window: the preview overlay's own window
 * listener stops a Comment or Draw press before any listener added later
 * (`preview-overlay/page.ts`, `stopImmediatePropagation`).
 */
export async function pressIn(
  frame: Frame | FrameLocator,
  target: string | Locator,
  {
    tap = false,
    through = null,
  }: {
    tap?: boolean;
    /** A layer in a page around the frame that takes the press on purpose ({@link coverOver}). */
    through?: string | null;
  } = {}
): Promise<void> {
  const root = frame.locator(":root");
  const pressed = typeof target === "string" ? frame.locator(target) : target;
  const named = typeof target === "string" ? target : String(target);
  // Both handles evaluate alike; the cast names the one signature.
  const element = (
    "owner" in frame ? frame.owner() : await frame.frameElement()
  ) as Pick<Locator, "evaluate">;
  for (let press = 1; press <= PRESSES; press += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each press waits on the one before it
    await element.evaluate((el: Element) => {
      const kept = el as unknown as { __kitTook: boolean };
      kept.__kitTook = false;
      el.addEventListener(
        "pointerdown",
        (event: Event) => {
          kept.__kitTook = event.target === el;
        },
        { once: true }
      );
    });
    await root.evaluate(
      () =>
        new Promise<void>((done) =>
          requestAnimationFrame(() => requestAnimationFrame(() => done()))
        )
    );
    await frames(root.page());
    await pressed.scrollIntoViewIfNeeded();
    await uncovered(
      async () => {
        const handle = await pressed.elementHandle();
        const inner = await handle?.ownerFrame();
        if (!(handle && inner)) {
          throw new Error(`${named}: not in a frame`);
        }
        const point = await handle.evaluate((el: Element) => {
          const box = el.getBoundingClientRect();
          return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        });
        return { inner, point };
      },
      named,
      through
    );
    await (tap ? pressed.tap() : pressed.click());
    const took = await element.evaluate(
      (el: Element) => (el as unknown as { __kitTook: boolean }).__kitTook
    );
    if (!took) {
      return;
    }
  }
  throw new Error(
    `${named}: the parent's <iframe> took each of ${PRESSES} presses`
  );
}

/**
 * Presses the top page's point `at` (its viewport's pixels, as
 * `page.mouse.click` takes them), a point inside `frame`, once nothing in
 * the pages around the frame stands over it: the press of a Comment or Draw
 * mode at a point, or of a canvas's shape, with {@link pressIn}'s check
 * ({@link coverOver}), failing the same way, naming the cover. `how` is the
 * press: a mouse's click, a finger's tap, or a mouse's `down` alone, a
 * drag's start, which the caller moves and lifts.
 */
export async function pressAt(
  frame: Frame | FrameLocator,
  at: { x: number; y: number },
  {
    through = null,
    how = "click",
  }: {
    /** A layer in a page around the frame that takes the press on purpose ({@link coverOver}). */
    through?: string | null;
    how?: "click" | "tap" | "down";
  } = {}
): Promise<void> {
  const inner =
    "owner" in frame
      ? await (await frame.owner().elementHandle())?.contentFrame()
      : frame;
  if (!inner) {
    throw new Error(`(${at.x}, ${at.y}): its frame is not on the page`);
  }
  await uncovered(
    async () => ({ inner, point: await pointIn(inner, at) }),
    `the point (${Math.round(at.x)}, ${Math.round(at.y)}) in ${inner.url()}`,
    through
  );
  const page = inner.page();
  if (how === "tap") {
    await page.touchscreen.tap(at.x, at.y);
  } else if (how === "down") {
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
  } else {
    await page.mouse.click(at.x, at.y);
  }
}

/**
 * The top page's point `at` as a point in `inner`'s own viewport: through
 * each `<iframe>`'s box down the chain, outermost first (its border and
 * padding, and any scale a transform puts on it), the inverse of
 * {@link coverOver}'s mapping.
 */
async function pointIn(
  inner: Frame,
  at: { x: number; y: number }
): Promise<{ x: number; y: number }> {
  const chain: Frame[] = [];
  for (let one: Frame | null = inner; one?.parentFrame();) {
    chain.unshift(one);
    one = one.parentFrame();
  }
  let point = at;
  for (const child of chain) {
    // biome-ignore lint/performance/noAwaitInLoops: each level maps the point the level around it gave
    const element = await child.frameElement();
    point = await element.evaluate((el: Element, p) => {
      const box = el.getBoundingClientRect();
      const html = el as HTMLElement;
      const style = getComputedStyle(el);
      const scale = html.offsetWidth > 0 ? box.width / html.offsetWidth : 1;
      return {
        x:
          (p.x - box.left) / scale -
          html.clientLeft -
          Number.parseFloat(style.paddingLeft),
        y:
          (p.y - box.top) / scale -
          html.clientTop -
          Number.parseFloat(style.paddingTop),
      };
    }, point);
  }
  return point;
}

/** Waits up to {@link UNCOVER_MS} for nothing around a frame to stand over the point `read` gives in it, else fails naming what does. */
async function uncovered(
  read: () => Promise<{ inner: Frame; point: { x: number; y: number } }>,
  named: string,
  through: string | null
): Promise<void> {
  const deadline = performance.now() + UNCOVER_MS;
  let cover: string | null = null;
  do {
    // biome-ignore lint/performance/noAwaitInLoops: each read waits on the page the one before it saw
    const { inner, point } = await read();
    cover = await coverOver(inner, point, through);
    if (!cover) {
      return;
    }
    await inner.page().waitForTimeout(100);
  } while (performance.now() < deadline);
  throw new Error(
    `${named}: the page around its frame covers it: ${cover}, for ${UNCOVER_MS / 1000}s`
  );
}

/** One run a motion read caught. */
export interface MotionRun {
  /** Its delay before it moves, ms. */
  delay: number;
  /**
   * The curve it moves on: its timing's easing, or, where that is linear,
   * its first keyframe's (an engine carries a CSS transition's curve on one
   * of the two).
   */
  easing: string;
  /** Where it stands whole: its delay plus every iteration, ms; Infinity for a loop. */
  end: number;
  /** Whether it played to its end once let go (its `finished`). */
  ended: boolean;
  /**
   * Where its clock stood as the read held it: 0 when no frame of it played
   * first. The page's held clock reads it; the DevTools clock pauses each
   * run as the protocol reports it starting, and gives none.
   */
  heldAt: number | null;
  /** Its last keyframe's values (a CSS animation's, a Web Animation's), where the page's held clock read it. */
  last?: Record<string, string>;
  /** A CSS animation's name, a CSS transition's property, a Web Animation's id (else its keyframes' properties). */
  name: string;
  /** Its start on the document's timeline, ms, once it played; null where none was given. */
  start: number | null;
  /**
   * Its element, as `tag[slot]`, else `tag[data-…]` with each of its data
   * attributes (a pseudo-element's run, its host's).
   */
  target: string;
  type: "CSSAnimation" | "CSSTransition" | "WebAnimation";
}

/** A motion an action started, read as the proof rule reads motion. */
export interface MotionRead<T> {
  /** `read` at each fraction asked, every run held there. */
  at: { fraction: number; value: T }[];
  /**
   * The clock it was read on: the DevTools Animation domain's (`clock`,
   * Chromium), or one the page holds itself (`held`, WebKit and Firefox,
   * which Playwright gives no Animation domain).
   */
  by: "clock" | "held";
  /** Every run of some length the action started inside `within`; none when it started none. */
  runs: MotionRun[];
}

export interface MotionOptions<T> {
  /** Fractions of the clock to seek and `read` at. */
  fractions?: number[];
  /** How long the action has to start its runs, and they to end once let go, ms. */
  ms?: number;
  /** The run whose length the fractions are of; the longest unset. */
  of?: string;
  /**
   * Only runs on an element `within` itself names, none on what lies
   * inside it: a read whose page runs on while held (a card's padding
   * held at 0 changed how SideSheet made its clip) holds no more than it
   * reads.
   */
  own?: boolean;
  /** What to read at each fraction. */
  read?: () => Promise<T>;
}

/** Each page's one clock (anim.ts), made at its first read. */
const clocks = new WeakMap<Page, Promise<import("./anim").Clock>>();

/** Whether a page is drawn by Chromium, the one engine with the Animation domain. */
const onChromium = (page: Page) =>
  page.context().browser()?.browserType().name() === "chromium";

/**
 * The enter or exit a page runs when `action` happens, inside what `within`
 * names (a selector), read the way the fleet's proof rule reads motion: on
 * a held clock, paused and sought, never by watching frames for it.
 * Headless WebKit drew no frame for 194ms after a sheet's release
 * (parked-start), longer than the whole exit, and a loaded machine took
 * 330-446ms a frame (artifact-resize-loop): a frame loop or a
 * `getAnimations()` poll finds nothing there.
 *
 * Each run the action starts inside `within` is held at its start, every
 * run is sought to each of `fractions` (of the run named `of`, else the
 * longest; each held at its own end once past it) with `read` taken there,
 * and then all are let go to play out, `ended` once each has finished.
 * On Chromium the clock is the DevTools Animation domain's (anim.ts
 * `Clock`). Elsewhere the page holds it (artifact-resize-loop's scrub,
 * 7fca29883): a CSS transition or animation is held from a
 * MutationObserver's callback (a microtask after the write that makes it,
 * before any frame: `getAnimations()` there makes the run and returns it),
 * a Web Animation as `Element.animate` returns it; a run already under way
 * as the read begins is none of its motion and is left alone. Held is a
 * playback rate
 * of 0: the run stays `running` and its start time resolves on the frame
 * that starts it, as the page's own runs' do (a page that reads one run to
 * start another, SideSheet's clip, reads it unchanged), its clock at 0
 * however long frames take. Once each has started and two frames pass with
 * no new run, all are paused there (`heldAt`) and sought.
 *
 * A run of no length is never held: Svelte opens every transition with one
 * and builds the real keyframes in its `onfinish` (anim.ts `hold`), so held,
 * the transition would never run.
 *
 *   const shut = await readMotion(page, () => close.click(), SHEET);
 *   kit.check("it runs its exit", shut.runs.some((run) => run.ended));
 */
export async function readMotion<T = undefined>(
  page: Page,
  action: () => Promise<unknown>,
  within: string,
  options: MotionOptions<T> = {}
): Promise<MotionRead<T>> {
  const ms = options.ms ?? 3000;
  return onChromium(page)
    ? await clockRead(page, action, within, ms, options)
    : await heldRead(page, action, within, ms, options);
}

/** Runs let go, played out: each one's own `finished`, given `ms`, not a frame watched for it. */
const playedOut = <T>(ms: number, finished: () => Promise<T>) =>
  readWithin(ms, finished);

/** The Chromium read: caught, sought, read, let go, played out. */
async function clockRead<T>(
  page: Page,
  action: () => Promise<unknown>,
  within: string,
  ms: number,
  options: MotionOptions<T>
): Promise<MotionRead<T>> {
  let made = clocks.get(page);
  if (!made) {
    made = import("./anim").then(({ Clock }) => Clock.on(page));
    clocks.set(page, made);
  }
  const clock = await made;
  let caught: import("./anim").Run[];
  try {
    caught = (
      await clock.catchRuns(action, within, ms, {
        loops: false,
        own: options.own,
      })
    ).filter((run) => !run.scroll);
  } catch (error) {
    if (String(error).includes("no animation started inside")) {
      return { by: "clock", runs: [], at: [] };
    }
    throw error;
  }
  // Each run's element, named while it is still caught.
  const targets = await Promise.all(caught.map((run) => clock.targetOf(run)));
  const at: MotionRead<T>["at"] = [];
  const { read } = options;
  try {
    if (read) {
      for (const fraction of options.fractions ?? []) {
        // biome-ignore lint/performance/noAwaitInLoops: one fraction of the clock at a time
        await clock.seek(fraction, options.of);
        at.push({ fraction, value: await read() });
      }
    }
    // The page's own Animation for each caught run, kept while it is still
    // held (a run that finishes leaves `getAnimations()`), so each one's own
    // `finished` says whether it played to its end, whatever another did.
    await page.evaluate(keepCaught, within);
  } finally {
    // A read that threw leaves no run held for the next read to find.
    await clock.release();
  }
  const letGo = await playedOut(ms, () =>
    page.evaluate(() => window.kitCaught?.finished() ?? [])
  );
  const ends = letGo.kind === "answered" ? [...letGo.value] : [];
  /** The first unclaimed page run on the same element by the same name. */
  const playedTo = (target: string, name: string) => {
    const found = ends.findIndex(
      (one) => one.target === target && one.name === name
    );
    return found < 0 ? false : (ends.splice(found, 1)[0]?.ended ?? false);
  };
  return {
    by: "clock",
    at,
    runs: caught.map((run, index) => ({
      type: run.type,
      name: run.name,
      target: targets[index] ?? "",
      start: run.start,
      delay: run.delay,
      end: run.loop ? Number.POSITIVE_INFINITY : run.end,
      easing: run.easing,
      heldAt: null,
      ended: playedTo(targets[index] ?? "", run.name),
    })),
  };
}

/** The read where Playwright gives no Animation domain: the page holds the clock. */
async function heldRead<T>(
  page: Page,
  action: () => Promise<unknown>,
  within: string,
  ms: number,
  options: MotionOptions<T>
): Promise<MotionRead<T>> {
  await page.evaluate(holdMotion, { within, own: options.own ?? false });
  const at: MotionRead<T>["at"] = [];
  let caught: Omit<MotionRun, "ended">[] = [];
  try {
    await action();
    caught = await page.evaluate(
      (wait) => window.kitHeld?.started(wait) ?? [],
      ms
    );
    const { read } = options;
    if (read && caught.length > 0) {
      for (const fraction of options.fractions ?? []) {
        // biome-ignore lint/performance/noAwaitInLoops: one fraction of the clock at a time
        await page.evaluate(
          ({ share, named }) => window.kitHeld?.seek(share, named),
          { share: fraction, named: options.of }
        );
        // Two frames, as the DevTools clock's seek waits (anim.ts `seek`):
        // what the page draws from its runs each frame (a ResizeObserver, a
        // frame callback) has drawn from them where they now stand.
        await frames(page);
        at.push({ fraction, value: await read() });
      }
    }
  } finally {
    // Every run let go to play on, the page's own hooks gone: a page that
    // navigated away has none to let go.
    await page.evaluate(() => window.kitHeld?.letGo()).catch(() => undefined);
  }
  const played = await playedOut(ms, () =>
    page.evaluate(() => window.kitHeld?.finished() ?? [])
  );
  const ends = played.kind === "answered" ? played.value : [];
  return {
    by: "held",
    at,
    runs: caught.map((run, index) => ({ ...run, ended: ends[index] ?? false })),
  };
}

declare global {
  interface Window {
    /** The clock read's caught runs as the page holds them (kit.ts `keepCaught`). */
    kitCaught?: {
      finished: () => Promise<
        { ended: boolean; name: string; target: string }[]
      >;
    };
    /** A motion read's clock, held by the page itself (kit.ts `readMotion`), while it reads. */
    kitHeld?: {
      letGo: () => void;
      seek: (fraction: number, of?: string) => void;
      started: (ms: number) => Promise<Omit<MotionRun, "ended">[]>;
      /** Whether each run `started` told played to its end, in its order. */
      finished: () => Promise<boolean[]>;
    };
  }
}

/**
 * Keeps, in the page, each run the DevTools clock holds paused inside
 * `within` (its Animation, its element and name as the read names them),
 * so once let go each one's own `finished` is read: a finished run leaves
 * `getAnimations()`. Run with `page.evaluate` before the clock lets go.
 */
function keepCaught(within: string): void {
  const describe = (el: Element | null | undefined) => {
    if (!el) {
      return "";
    }
    const slot = el.getAttribute("data-slot");
    const data = el
      .getAttributeNames()
      .filter((name) => name.startsWith("data-"))
      .map((name) => `[${name}]`)
      .join("");
    return `${el.localName}${slot ? `[${slot}]` : data}`;
  };
  const nameOf = (run: Animation) => {
    if (run instanceof CSSAnimation) {
      return run.animationName;
    }
    return run instanceof CSSTransition ? run.transitionProperty : run.id;
  };
  const kept = window
    .kitRuns()
    .filter(
      (run) =>
        run.playState === "paused" &&
        (run.timeline === null || run.timeline instanceof DocumentTimeline) &&
        Number.isFinite(run.effect?.getComputedTiming().endTime) &&
        window.kitInside((run.effect as KeyframeEffect | null)?.target, within)
    )
    .map((run) => ({
      run,
      name: nameOf(run),
      target: describe((run.effect as KeyframeEffect | null)?.target),
    }));
  window.kitCaught = {
    finished: () =>
      Promise.all(
        kept.map(({ run, name, target }) =>
          run.finished.then(
            () => ({ name, target, ended: true }),
            () => ({ name, target, ended: false })
          )
        )
      ),
  };
}

/**
 * Holds, in the page, every run of some length that starts inside
 * `within` from now on, at its start: run with `page.evaluate` before the
 * action (kit.ts `readMotion`).
 */
function holdMotion({ own, within }: { own: boolean; within: string }): void {
  window.kitHeld?.letGo();
  const held = new Set<Animation>();
  let caught: Animation[] = [];
  /** The caught runs once let go, whose own ends `finished` reads. */
  let letGone: Animation[] = [];
  /** A keyframe's own keys, which are no values it draws. */
  const unvalued = ["offset", "easing", "composite", "computedOffset"];
  /** Where a run stands whole: its delay, every iteration and its end delay. */
  const lengthOf = (run: Animation) =>
    Number(run.effect?.getComputedTiming().endTime ?? 0);
  const inside = (run: Animation) => {
    const target = (run.effect as KeyframeEffect | null)?.target;
    return own
      ? (target?.matches(within) ?? false)
      : window.kitInside(target, within);
  };
  // Where the document's clock stood as the read began: a run already
  // under way then (a band's arrival still easing in) is none of the
  // action's motion, and held, it would never end.
  const armedAt = Number(document.timeline.currentTime ?? 0);
  const fresh = (run: Animation) =>
    run.startTime === null || Number(run.startTime) >= armedAt;
  /** A run on time: one a scroller drives (`animation-timeline`) has no length in ms. */
  const timed = (run: Animation) =>
    run.timeline === null || run.timeline instanceof DocumentTimeline;
  const hold = (runs: Animation[]) => {
    for (const run of runs) {
      const length = lengthOf(run);
      // No length (Svelte's dummy) and no end (a loop) are no motion to hold.
      if (
        !held.has(run) &&
        run.playState === "running" &&
        fresh(run) &&
        timed(run) &&
        length > 0 &&
        Number.isFinite(length) &&
        inside(run)
      ) {
        run.playbackRate = 0;
        held.add(run);
      }
    }
  };
  // A microtask after each write to the page, before any frame: asked
  // there, `getAnimations()` makes the run the write starts and returns it.
  const watch = new MutationObserver(() => hold(window.kitRuns()));
  watch.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });
  const { animate } = Element.prototype;
  Element.prototype.animate = function (
    this: Element,
    ...args: Parameters<Element["animate"]>
  ) {
    const run = animate.apply(this, args);
    hold([run]);
    return run;
  };
  const nameOf = (run: Animation) => {
    if (run instanceof CSSAnimation) {
      return run.animationName;
    }
    if (run instanceof CSSTransition) {
      return run.transitionProperty;
    }
    const keyframes =
      run.effect instanceof KeyframeEffect ? run.effect.getKeyframes() : [];
    return (
      run.id ||
      [...new Set(keyframes.flatMap((frame) => Object.keys(frame)))]
        .filter((key) => !unvalued.includes(key))
        .join(",")
    );
  };
  const typeOf = (run: Animation): MotionRun["type"] => {
    if (run instanceof CSSAnimation) {
      return "CSSAnimation";
    }
    return run instanceof CSSTransition ? "CSSTransition" : "WebAnimation";
  };
  const describe = (el: Element | null | undefined) => {
    if (!el) {
      return "";
    }
    const slot = el.getAttribute("data-slot");
    const data = el
      .getAttributeNames()
      .filter((name) => name.startsWith("data-"))
      .map((name) => `[${name}]`)
      .join("");
    return `${el.localName}${slot ? `[${slot}]` : data}`;
  };
  /** A held run as the read gives it, its clock where it was held. */
  const told = (
    run: Animation,
    heldAt: number | null
  ): Omit<MotionRun, "ended"> => {
    const effect = run.effect as KeyframeEffect | null;
    const timing = effect?.getComputedTiming();
    const keyframes = effect?.getKeyframes() ?? [];
    const curve = String(effect?.getTiming().easing ?? "");
    const final = keyframes.at(-1);
    return {
      type: typeOf(run),
      name: nameOf(run),
      target: describe(effect?.target),
      start: run.startTime === null ? null : Number(run.startTime),
      delay: Number(timing?.delay ?? 0),
      end: lengthOf(run),
      easing:
        curve === "linear" ? String(keyframes[0]?.easing ?? curve) : curve,
      heldAt,
      ...(final
        ? {
            last: Object.fromEntries(
              Object.entries(final)
                .filter(([key]) => !unvalued.includes(key))
                .map(([key, value]) => [key, String(value)])
            ),
          }
        : {}),
    };
  };
  const stop = () => {
    watch.disconnect();
    Element.prototype.animate = animate;
  };
  window.kitHeld = {
    /**
     * Once every held run has started (its start time resolved) and two
     * frames have passed with no new run held, or at `ms`: each paused
     * where it was held, and told.
     */
    started: async (ms) => {
      const deadline = performance.now() + ms;
      let seen = -1;
      let quiet = 0;
      // Two frames with no new run: a page that starts one run from
      // another's start (SideSheet's clip from vaul's move) may do it in a
      // frame callback that runs after this one's.
      while (quiet < 2 && performance.now() <= deadline) {
        const going = [...held].filter((run) => run.playState === "running");
        const ready =
          going.length > 0 && going.every((run) => run.startTime !== null);
        quiet = ready && going.length === seen ? quiet + 1 : 0;
        seen = ready ? going.length : -1;
        // biome-ignore lint/performance/noAwaitInLoops: one frame at a time until every run has started, each held at 0 meanwhile
        await new Promise((done) => requestAnimationFrame(done));
      }
      caught = [...held].filter(
        (run) => run.playState === "running" && run.startTime !== null
      );
      return caught.map((run) => {
        const heldAt =
          run.currentTime === null ? null : Number(run.currentTime);
        run.pause();
        return told(run, heldAt);
      });
    },
    seek: (fraction, of) => {
      const named = of ? caught.find((run) => nameOf(run) === of) : undefined;
      const longest = named
        ? lengthOf(named)
        : Math.max(
            0,
            ...caught.map(lengthOf).filter((one) => Number.isFinite(one))
          );
      for (const run of caught) {
        run.currentTime = Math.min(lengthOf(run), longest * fraction);
      }
    },
    // Once: a later read lets this one go as it begins, and a run played
    // again from its end rewinds to its start (`play()`'s auto-rewind) and
    // runs its whole motion a second time.
    letGo: () => {
      stop();
      for (const run of held) {
        run.playbackRate = 1;
      }
      for (const run of caught) {
        // Sought to its end, it ends there, as the DevTools clock's run does.
        if (Number(run.currentTime ?? 0) >= lengthOf(run)) {
          run.finish();
        } else {
          run.play();
        }
      }
      held.clear();
      letGone = [...letGone, ...caught];
      caught = [];
    },
    finished: () =>
      Promise.all(
        letGone.map((run) =>
          run.finished.then(
            () => true,
            () => false
          )
        )
      ),
  };
}

/**
 * A finger on the page and a mouse cursor resting beside it, as the engine
 * lets a probe drive them (`handOn`).
 */
export interface Hand {
  /** How the finger's pointer capture is kept: the engine's own, or the hand's where the engine refuses a pointer it did not make. */
  capture: string;
  /** The resting cursor moved to a point; it stays there as the page moves under it. */
  cursor: (x: number, y: number) => Promise<void>;
  done: () => Promise<void>;
  /** The finger down on whatever stands at the point. */
  down: (x: number, y: number) => Promise<void>;
  /**
   * The finger leaves the element it pressed: its touch `pointerout`, as
   * iOS sends one mid-drag (huntabyte/vaul-svelte#123). Absent where the
   * engine's own touch is driven (Chromium sends a held finger none).
   */
  leave?: () => Promise<void>;
  move: (x: number, y: number) => Promise<void>;
  up: () => Promise<void>;
}

/** The synthesized finger's pointer id, as an engine numbers a touch. */
const FINGER = 21;

/**
 * The page's hand. On Chromium, raw touch through CDP
 * (`Input.dispatchTouchEvent`) and Playwright's own mouse as the cursor:
 * the engine's own input. Elsewhere, Playwright drives no touch drag
 * (WebKit's touchscreen only taps), so the finger is PointerEvents made in
 * the page: `pointerType: "touch"`, primary, one pointer id from down
 * through every move to up, each sent where the pointer's capture sends it.
 * That proves a page's logic in the engine, not the platform's touch input.
 *
 * An engine captures only a pointer it made (setPointerCapture on any other
 * id throws, its answer in `capture`), so this hand keeps the finger's
 * capture itself. The cursor is a mouse pointer (id 1) at a point: after
 * every move of the finger the point is hit-tested again, and when the
 * page has put another element under it the cursor says so as an engine
 * does (a `pointerout` from the element it left, a `pointerover` on the
 * new one); moved, it sends a `pointermove` there.
 *
 * Every boundary event the hand sends names another element as its related
 * target, never its own target: WebKit delivers a `pointerout` whose
 * related target is its target to no listener at all, not one on the
 * window (parked-start), so a hand that sent one would test nothing.
 */
export async function handOn(page: Page): Promise<Hand> {
  return onChromium(page) ? await touchHand(page) : await madeHand(page);
}

async function touchHand(page: Page): Promise<Hand> {
  const cdp = await page.context().newCDPSession(page);
  const touch = async (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: { x: number; y: number }[]
  ) => {
    await cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  };
  return {
    capture: "the engine's own",
    cursor: (x, y) => page.mouse.move(x, y),
    done: () => cdp.detach(),
    down: (x, y) => touch("touchStart", [{ x, y }]),
    move: (x, y) => touch("touchMove", [{ x, y }]),
    up: () => touch("touchEnd", []),
  };
}

declare global {
  interface Window {
    /** The synthesized hand's verbs (kit.ts `handOn`). */
    kitHand?: Record<
      "cursor" | "down" | "move",
      (x: number, y: number) => void
    > &
      Record<"leave" | "up", () => void>;
  }
}

async function madeHand(page: Page): Promise<Hand> {
  const capture = await page.evaluate(makeHand, FINGER);
  const drive = (verb: "cursor" | "down" | "move", x: number, y: number) =>
    page.evaluate(({ how, at, to }) => window.kitHand?.[how](at, to), {
      how: verb,
      at: x,
      to: y,
    });
  return {
    capture: `the hand's: the engine refused it (${capture})`,
    cursor: (x, y) => drive("cursor", x, y),
    done: async () => undefined,
    down: (x, y) => drive("down", x, y),
    leave: () => page.evaluate(() => window.kitHand?.leave()),
    move: (x, y) => drive("move", x, y),
    up: () => page.evaluate(() => window.kitHand?.up()),
  };
}

/** Builds the synthesized hand in the page; answers the engine's refusal of a capture. */
function makeHand(finger: number): string {
  const state = {
    captured: null as Element | null,
    pressed: null as Element | null,
    finger: { x: 0, y: 0 },
    cursor: null as { x: number; y: number } | null,
    under: null as Element | null,
  };
  let refused = "nothing: it took the capture";
  try {
    document.body.setPointerCapture(finger);
  } catch (error) {
    refused = error instanceof DOMException ? error.name : String(error);
  }
  const proto = Element.prototype;
  const { hasPointerCapture, releasePointerCapture, setPointerCapture } = proto;
  proto.setPointerCapture = function (this: Element, id: number) {
    if (id === finger) {
      state.captured = this;
      return;
    }
    setPointerCapture.call(this, id);
  };
  proto.hasPointerCapture = function (this: Element, id: number) {
    return id === finger
      ? state.captured === this
      : hasPointerCapture.call(this, id);
  };
  proto.releasePointerCapture = function (this: Element, id: number) {
    if (id === finger) {
      state.captured = null;
      return;
    }
    releasePointerCapture.call(this, id);
  };
  const send = (at: Element, type: string, init: PointerEventInit) =>
    at.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        ...init,
      })
    );
  /** A boundary event, its related target never its own target (else its parent). */
  const boundary = (
    type: "pointerout" | "pointerover",
    at: Element,
    other: Element | null,
    init: PointerEventInit
  ) =>
    send(at, type, {
      ...init,
      relatedTarget: other === at ? at.parentElement : other,
    });
  const touch = (extra: PointerEventInit = {}): PointerEventInit => ({
    pointerId: finger,
    pointerType: "touch",
    isPrimary: true,
    clientX: state.finger.x,
    clientY: state.finger.y,
    width: 20,
    height: 20,
    pressure: 0.5,
    button: 0,
    buttons: 1,
    ...extra,
  });
  const mouse = (): PointerEventInit => ({
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    clientX: state.cursor?.x ?? 0,
    clientY: state.cursor?.y ?? 0,
    button: -1,
    buttons: 0,
  });
  /** The cursor's point hit-tested again: a new element under it is said. */
  const recheck = () => {
    if (!state.cursor) {
      return;
    }
    const now = document.elementFromPoint(state.cursor.x, state.cursor.y);
    if (!now || now === state.under) {
      return;
    }
    if (state.under?.isConnected) {
      boundary("pointerout", state.under, now, mouse());
    }
    boundary("pointerover", now, state.under, mouse());
    state.under = now;
  };
  /** Where the finger's events go: its capture, else what it pressed. */
  const target = () => state.captured ?? state.pressed;
  window.kitHand = {
    cursor(x, y) {
      state.cursor = { x, y };
      recheck();
      if (state.under) {
        send(state.under, "pointermove", mouse());
      }
    },
    down(x, y) {
      const at = document.elementFromPoint(x, y);
      if (!at) {
        return;
      }
      state.finger = { x, y };
      state.pressed = at;
      send(at, "pointerdown", touch());
    },
    leave() {
      const at = target();
      if (!at) {
        return;
      }
      // Where a finger that slipped off its element stands: just past its
      // foot, not the point under the finger, which a page that follows the
      // finger (a dragged sheet) keeps on the element itself.
      const edge = at.getBoundingClientRect();
      boundary(
        "pointerout",
        at,
        document.elementFromPoint(state.finger.x, edge.bottom + 4),
        touch()
      );
    },
    move(x, y) {
      const at = target();
      if (!at) {
        return;
      }
      state.finger = { x, y };
      send(at, "pointermove", touch());
      recheck();
    },
    up() {
      const at = target();
      if (at) {
        send(at, "pointerup", touch({ pressure: 0, buttons: 0 }));
      }
      state.captured = null;
      state.pressed = null;
    },
  };
  return refused;
}
