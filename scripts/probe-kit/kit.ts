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
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
  webkit,
} from "playwright-core";
import { heavySlot } from "../lib/heavy-run";
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
  phone: { width: 390, height: 844, touch: true },
} as const;
export type View = keyof typeof VIEWS;
export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
/** Device pixels per css px, everywhere. */
export const SCALE = 2;

export interface PageOptions {
  /** WebKit for a spec that reads Safari's engine; Chromium otherwise. */
  engine?: "chromium" | "webkit";
  /** Scripts installed before the page's own, in order. */
  init?: (() => void)[];
  /** Device pixels per css px, when a spec reads another device (an iPhone's 3). */
  scale?: number;
  theme?: Theme;
}

/** A spec: one surface, a short list of assertions on the kit's helpers. */
export interface Spec {
  /** The spec's name: its file's, its baselines' folder. */
  name: string;
  run: (kit: Kit) => Promise<void>;
}

export interface Kit {
  /** Whether `--approve` names this spec: its diffs write their baselines. */
  approve: boolean;
  /** The dev server against no hub: the `/motion/` benches, which need none. */
  bench: () => Promise<string>;
  /** The built dashboard against no hub (built once per run): a bench a runtime spec times. */
  built: () => Promise<string>;
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

/** The dashboard built once per run: `vite build`, as the probes' `vite preview` serves it. */
export async function build(): Promise<void> {
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
}

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

/** What one run holds across its specs: the browsers, the build and its servers. */
export class Run {
  failures = 0;
  notes = 0;
  private devServer: Served | null = null;
  private builtServer: Served | null = null;
  private built: Promise<void> | null = null;
  private readonly browsers = new Map<string, Promise<Browser>>();

  /** The dashboard built once per run, the first time a spec needs it. */
  build(): Promise<void> {
    this.built ??= (async () => {
      console.log("… building the dashboard");
      await build();
    })();
    return this.built;
  }

  browser(engine: "chromium" | "webkit"): Promise<Browser> {
    const known = this.browsers.get(engine);
    if (known) {
      return known;
    }
    const env =
      process.platform === "linux"
        ? { ...process.env, FONTCONFIG_FILE: FONTS_CONF }
        : process.env;
    // `PROBE_WEBKIT` names a WebKit build to run (its `pw_run.sh`) where the
    // one this playwright-core expects is not installed.
    const launched =
      engine === "webkit"
        ? webkit.launch({ env, executablePath: process.env.PROBE_WEBKIT })
        : chromium.launch({
            headless: true,
            args: ["--no-sandbox", "--disable-gpu"],
            env,
          });
    this.browsers.set(engine, launched);
    return launched;
  }

  bench(): Promise<string> {
    this.devServer ??= serve("dev", NO_HUB);
    return this.devServer.then((s) => s.base);
  }

  builtBench(): Promise<string> {
    this.builtServer ??= this.build().then(() => serve("preview", NO_HUB));
    return this.builtServer.then((s) => s.base);
  }

  /** Runs one spec with its own pages and fleets, closed after it however it ends. */
  async spec(spec: Spec, approve: boolean): Promise<void> {
    const contexts: BrowserContext[] = [];
    const ends: (() => Promise<void>)[] = [];
    const out = join(
      process.env.TMPDIR ?? join(ROOT, ".probe"),
      "probe-kit",
      spec.name
    );
    await mkdir(out, { recursive: true });
    const kit: Kit = {
      spec: spec.name,
      approve,
      out,
      check: (assertion, ok, detail) => {
        console.log(
          `${ok ? "PASS" : "FAIL"} ${spec.name}: ${assertion}${detail ? ` (${detail})` : ""}`
        );
        if (!ok) {
          this.failures += 1;
        }
        return ok;
      },
      note: (line) => {
        this.notes += 1;
        console.log(`NOTE ${spec.name}: ${line}`);
      },
      bench: () => this.bench(),
      built: () => this.builtBench(),
      fleet: async (respond) => {
        // A fleet spec is a heavy run, its build and fleet both: it holds one
        // of the machine's slots (heavy-run.ts) until the spec ends, after
        // its fleets have stopped (ends run last-added first).
        const slot = await heavySlot();
        ends.push(async () => slot.release());
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
            served ??= this.build().then(() => serve("preview", fleet.base));
            return served.then((s) => s.base);
          },
          devDashboard: () => {
            servedDev ??= serve("dev", fleet.base);
            return servedDev.then((s) => s.base);
          },
        });
      },
      page: async (view, options = {}) => {
        const v = VIEWS[view];
        const browser = await this.browser(options.engine ?? "chromium");
        const context = await browser.newContext({
          viewport: { width: v.width, height: v.height },
          deviceScaleFactor: options.scale ?? SCALE,
          hasTouch: v.touch,
          isMobile: v.touch,
          colorScheme: options.theme ?? "light",
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
  const stuck = await page.evaluate(() => {
    const running = window
      .kitRuns()
      .filter(
        (run) =>
          run.playState === "running" &&
          Number.isFinite(Number(run.effect?.getComputedTiming().endTime ?? 0))
      );
    return Promise.race([
      Promise.all(
        running.map((run) => run.finished.catch(() => undefined))
      ).then(() => [] as string[]),
      new Promise<string[]>((done) =>
        setTimeout(
          () =>
            done(
              running
                .filter((run) => run.playState === "running")
                .map((run) => {
                  const target = (run.effect as KeyframeEffect | null)?.target;
                  const what =
                    run instanceof CSSTransition
                      ? `transition ${run.transitionProperty}`
                      : `${run.constructor.name} ${run.id}`;
                  return `${what} on ${target?.tagName.toLowerCase()}.${String(target?.className).split(" ")[0]}`;
                })
            ),
          10_000
        )
      ),
    ]);
  });
  if (stuck.length > 0) {
    throw new Error(
      `animations never landed within 10s: ${stuck.slice(0, 6).join("; ")}`
    );
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
