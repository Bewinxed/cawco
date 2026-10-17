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
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  firefox,
  type Page,
  webkit,
} from "playwright-core";
import { readWithin } from "../../packages/core/src/bounded";
import { type HeavySlot, heavySlot } from "../lib/heavy-run";
import {
  type Fleet,
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
  /** The widest phone, a Pro Max's 430pt. */
  phoneWide: { width: 430, height: 932, touch: true },
  /** The simulators the iOS specs pair with: iPhone 16 Pro and iPad Pro 13-inch (M4), portrait. */
  iphone: { width: 402, height: 874, touch: true },
  /** An iPhone 15 Pro, portrait: the owner's phone. */
  iphone15Pro: { width: 393, height: 852, touch: true },
  ipad: { width: 1032, height: 1376, touch: true },
} as const;
export type View = keyof typeof VIEWS;

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

export interface PageOptions {
  /** WebKit for a spec that reads Safari's engine, Firefox for Gecko's; Chromium otherwise. */
  engine?: Engine;
  /** Scripts installed before the page's own, in order. */
  init?: (() => void)[];
  /** Device pixels per css px, when a spec reads another device (an iPhone's 3). */
  scale?: number;
  theme?: Theme;
  /**
   * The WebKit build a WebKit page runs on, by its Playwright revision,
   * where a spec reads a bug a phone's Safari still has and a newer build
   * has fixed (`PINNED_WEBKIT`). Unset, the build this playwright-core
   * expects, or the one `PROBE_WEBKIT` names.
   */
  webkit?: string;
}

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
  /** The spec's name: its file's, its baselines' folder. */
  name: string;
  run: (kit: Kit) => Promise<void>;
}

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
   * against its hub once asked. Both go when the spec ends.
   */
  fleet: (respond: (request: Seen) => Reply) => Promise<KitFleet>;
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

/** The dashboard built: `vite build`, as the probes' `vite preview` serves it. */
const viteBuild = async (): Promise<void> => {
  const child = Bun.spawn(["bunx", "vite", "build"], {
    cwd: DASHBOARD,
    // This process's own, git's repository variables gone (scratch-fleet.ts
    // `GIT_REPOSITORY_ENV`): the build reads `git rev-parse` for its version.
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
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
 * The dashboard served against `hub`: the dev server (`vite dev`, where the
 * `/motion/` benches live: a built dashboard 404s them), or the built one
 * (`vite preview`, what the runtime specs time: a dev build's own checks
 * would be in every long task). Its address and process.
 */
async function serve(
  how: "dev" | "preview",
  hub: string,
  env: Record<string, string> = {}
) {
  const port = await freePort();
  const child = Bun.spawn(
    [
      "bunx",
      "vite",
      how,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: DASHBOARD,
      env: {
        ...process.env,
        ...env,
        CAWCO_DEV_HUB_URL: hub,
        CAWCO_HUB_URL: hub,
      },
      stdout: "ignore",
      stderr: "ignore",
    }
  );
  const base = `http://127.0.0.1:${port}`;
  await until(
    "the built dashboard answering",
    () => fetch(base).then((r) => r.ok),
    Boolean,
    60_000
  );
  return { base, child };
}

type Served = Promise<{ base: string; child: Bun.Subprocess }>;
/** No hub answers here: the benches feed the client's own state. */
const NO_HUB = "http://127.0.0.1:9";

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
  /** Every capture this run that differs from its baseline, in run order. */
  readonly changed: Changed[] = [];
  private devServer: Served | null = null;
  private builtServer: Served | null = null;
  private built: Promise<void> | null = null;
  private readonly browsers = new Map<string, Promise<Browser>>();
  private slot: Promise<HeavySlot> | null = null;

  /** The run's heavy-run slot, taken the first time it starts anything heavy. */
  heavy(): Promise<HeavySlot> {
    this.slot ??= heavySlot();
    return this.slot;
  }

  /** The dashboard built once per run, the first time a spec needs it. */
  build(): Promise<void> {
    this.built ??= (async () => {
      await this.heavy();
      console.log("… building the dashboard");
      await viteBuild();
    })();
    return this.built;
  }

  /** The dashboard served (`serve`), under the run's slot. */
  private async startServer(
    how: "dev" | "preview",
    hub: string
  ): Promise<{ base: string; child: Bun.Subprocess }> {
    await this.heavy();
    return serve(how, hub);
  }

  browser(engine: Engine, revision?: string): Promise<Browser> {
    const key = revision ? `${engine}-${revision}` : engine;
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
          args: ["--no-sandbox", "--disable-gpu"],
          env,
        }),
    } satisfies Record<Engine, () => Promise<Browser>>;
    const launched = this.heavy().then(() => launch[engine]());
    this.browsers.set(key, launched);
    return launched;
  }

  bench(): Promise<string> {
    this.devServer ??= this.startServer("dev", NO_HUB);
    return this.devServer.then((s) => s.base);
  }

  builtBench(): Promise<string> {
    this.builtServer ??= this.build().then(() =>
      this.startServer("preview", NO_HUB)
    );
    return this.builtServer.then((s) => s.base);
  }

  /** Runs one spec with its own pages and fleets, closed after it however it ends. */
  async spec(spec: Spec, approval: Approval | null): Promise<void> {
    const named = approval === null || approval === "all" ? [] : approval;
    const asked = named.map(entrySlug);
    /** Every entry the spec asked `approves` of: what it could write. */
    const offered = new Set<string>();
    const contexts: BrowserContext[] = [];
    const ends: (() => Promise<void>)[] = [];
    const out = join(
      process.env.TMPDIR ?? join(ROOT, ".probe"),
      "probe-kit",
      spec.name
    );
    // Its folder holds this run's files alone: one an earlier run left there
    // would read as this run's evidence.
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
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
      built: () => this.builtBench(),
      builtFor: async (hub) => {
        const served = this.build().then(() =>
          this.startServer("preview", hub)
        );
        ends.push(async () => {
          (await served).child.kill();
        });
        return (await served).base;
      },
      fleet: async (respond) => {
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
        });
        let served: Promise<{ base: string; child: Bun.Subprocess }> | null =
          null;
        let servedDev: Promise<{
          base: string;
          child: Bun.Subprocess;
        }> | null = null;
        ends.push(async () => {
          (await served)?.child.kill();
          (await servedDev)?.child.kill();
          await fleet.close();
          await fleet.clean(false);
        });
        return Object.assign(fleet, {
          dashboard: () => {
            served ??= this.build().then(() =>
              this.startServer("preview", fleet.base)
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
        const browser = await this.browser(
          options.engine ?? "chromium",
          options.engine === "webkit" ? options.webkit : undefined
        );
        const phoneAgent = PHONE_AGENT[options.engine ?? "chromium"];
        const context = await browser.newContext({
          viewport: { width: v.width, height: v.height },
          deviceScaleFactor: options.scale ?? SCALE,
          hasTouch: v.touch,
          // Gecko has no mobile viewport mode in Playwright ("isMobile is
          // not supported in Firefox"): a touch screen at the size alone.
          isMobile: v.touch && options.engine !== "firefox",
          colorScheme: options.theme ?? "light",
          ...(v.touch && v.width < PHONE_MAX_WIDTH && phoneAgent
            ? { userAgent: phoneAgent }
            : {}),
        });
        contexts.push(context);
        await context.addInitScript((t) => {
          localStorage.setItem("cawco-theme", t);
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
    (await this.devServer)?.child.kill();
    (await this.builtServer)?.child.kill();
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

/** Opens `url` and waits for `ready` in the page, fonts loaded. */
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
}

/** Waits until every finite animation on the page has landed. */
export async function settle(page: Page, ms = 150): Promise<void> {
  // A finite run still going after 10s will not land (a timeline held
  // still): named, as a failure, never waited on for ever.
  const landed = await readWithin(10_000, () =>
    page.evaluate(async () => {
      await Promise.all(
        window
          .kitRuns()
          .filter(
            (run) =>
              run.playState === "running" &&
              Number.isFinite(
                Number(run.effect?.getComputedTiming().endTime ?? 0)
              )
          )
          .map((run) => run.finished.catch(() => undefined))
      );
    })
  );
  switch (landed.kind) {
    case "answered":
      break;
    case "unanswered": {
      const stuck = await page.evaluate(() =>
        window
          .kitRuns()
          .filter(
            (run) =>
              run.playState === "running" &&
              Number.isFinite(
                Number(run.effect?.getComputedTiming().endTime ?? 0)
              )
          )
          .map((run) => {
            const target = (run.effect as KeyframeEffect | null)?.target;
            const what =
              run instanceof CSSTransition
                ? `transition ${run.transitionProperty}`
                : `${run.constructor.name} ${run.id}`;
            // The element by its hook, when it has one; its first class otherwise.
            const slot = target?.getAttribute("data-slot");
            const name = slot
              ? `[data-slot="${slot}"]`
              : `.${String(target?.className).split(" ")[0]}`;
            return `${what} on ${target?.tagName.toLowerCase()}${name}`;
          })
      );
      throw new Error(
        `animations never landed within ${landed.after} ms: ${stuck.slice(0, 6).join("; ")}`
      );
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
