/**
 * The surfaces walked: every surface the run names, at each pass (a width,
 * a theme, and once reduced motion), each state opened on a page of its own
 * context with its clock held at the tape's moment, and handed to `visit`
 * once it stands still.
 *
 * The dashboard is served against the hub tape (hub-tape.ts): the built one
 * (`vite build`, `vite preview`) for every route, the dev server for the
 * `/motion/` benches, both against the same player. `record` serves them
 * against a recorder in front of a scratch fleet's hub instead.
 */
import { join } from "node:path";
import type { BrowserContext, Page, Request } from "playwright-core";
import { heavySlot } from "../../lib/heavy-run";
import { until } from "../../scratch-fleet";
import type { Attach, Tape } from "../hub-tape";
import { type Kit, open, ROOT, type Theme, type View } from "../kit";
import type { State, Surface, Width } from "./catalogue";
import { holdStill, installReader, PROPS } from "./read";
import type { Scene } from "./scene";

/** The hub the surfaces read: a scratch fleet's, recorded (`style-snapshot --record`). */
export const TAPE = join(
  import.meta.dir,
  "..",
  "fixtures",
  "style-snapshot",
  "hub-tape.json.gz"
);

/** One pass: a width at a theme, reduced motion or not. */
export interface Pass {
  name: string;
  reduced: boolean;
  theme: Theme;
  width: Width;
}

/** The widths read: never 639–641 or 899–901, where the cutover's 1px media-query edges are on record per lane. */
const WIDTHS: Record<Width, { height: number; view: View; width: number }> = {
  desk: { view: "desk", width: 1440, height: 900 },
  tablet: { view: "tablet", width: 820, height: 1180 },
  phone: { view: "phone", width: 390, height: 844 },
};

export const PASSES: Pass[] = [
  ...(["desk", "tablet", "phone"] as const).flatMap((width) =>
    (["light", "dark"] as const).map((theme) => ({
      name: `${width} ${theme}`,
      width,
      theme,
      reduced: false,
    }))
  ),
  { name: "desk light reduced", width: "desk", theme: "light", reduced: true },
];

/** Where a page can reach this machine: a loopback origin. */
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * The dashboard's two servers against one hub (the tape's recorder or
 * player): the built one, and the dev server once a bench asks for it.
 * Every other loopback origin a page reaches is a preview's own, which the
 * hub's `attach` routes on each page's context.
 */
export class Servers {
  private dev: Promise<{ base: string; child: Bun.Subprocess }> | null = null;
  private built: Promise<string> | null = null;
  private readonly kit: Kit;
  private readonly own = new Set<string>();
  readonly hub: string;
  private readonly tape: { attach: Attach; base: string };
  constructor(kit: Kit, hub: { attach: Attach; base: string }) {
    this.kit = kit;
    this.hub = hub.base;
    this.tape = hub;
    this.own.add(new URL(hub.base).host);
  }

  base(serve: Surface["serve"]): Promise<string> {
    // By host and port: a socket's URL (`ws://`) is the same server as the page's (`http://`).
    const owned = (base: string) => {
      this.own.add(new URL(base).host);
      return base;
    };
    if (serve === "built") {
      this.built ??= this.kit.builtFor(this.hub).then(owned);
      return this.built;
    }
    this.dev ??= devServer(this.hub).then((d) => {
      owned(d.base);
      return d;
    });
    return this.dev.then((d) => d.base);
  }

  /** Routes a page's context: its previews' origins on the tape. */
  attach(context: BrowserContext): Promise<void> {
    return this.tape.attach(
      context,
      (url) => LOOPBACK.has(url.hostname) && !this.own.has(url.host)
    );
  }

  async close(): Promise<void> {
    (await this.dev)?.child.kill();
  }
}

/**
 * `vite dev` against `hub`: the `/motion/` benches' server (the kit's own
 * is against no hub). The run's heavy-run slot is held from here for the
 * process's life (heavy-run.ts: a run holds its slot its whole heavy life;
 * one process holds one, however many of its parts ask).
 */
async function devServer(hub: string) {
  await heavySlot();
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  const child = Bun.spawn(
    [
      "bunx",
      "vite",
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: join(ROOT, "apps", "dashboard"),
      env: { ...process.env, CAWCO_DEV_HUB_URL: hub, CAWCO_HUB_URL: hub },
      stdout: "ignore",
      stderr: "ignore",
    }
  );
  const base = `http://127.0.0.1:${port}`;
  await until(
    "the dev server answering",
    () =>
      fetch(base)
        .then((r) => r.ok)
        .catch(() => false),
    Boolean,
    120_000
  );
  return { base, child };
}

/** Each page's requests not yet answered: what `quiet` waits on. */
const inFlight = new WeakMap<Page, Set<Request>>();
/** Each request `quiet` gave up waiting on, said once: a page that keeps one open is slow, never still. */
const gaveUp = new Set<string>();

/**
 * A page for `pass`: its width, theme and motion, the reader installed, and
 * its clock the walk's alone. Playwright's fake clock (`clock.install`)
 * stands paused at the tape's moment: Date, setTimeout, setInterval,
 * requestAnimationFrame and performance.now move only when `settle` runs
 * them on, a fixed stretch at a time, so a script's motion is where the
 * same stretch puts it on every run (the `/motion/` benches' loops).
 */
export async function passPage(
  kit: Kit,
  pass: Pass,
  at: number
): Promise<Page> {
  const w = WIDTHS[pass.width];
  const page = await kit.page(w.view, { theme: pass.theme, scale: 1 });
  await page.setViewportSize({ width: w.width, height: w.height });
  if (pass.reduced) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }
  await page.context().addInitScript(installReader, PROPS);
  // Every page focused, as a person's one window is: two passes side by side
  // share one browser, where only one page would hold its focus, and what
  // styles itself on focus (an editor's active line) read either way.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.clock.install({ time: at - CLOCK_LEAD_MS });
  await page.clock.pauseAt(at);
  // Date stands at the tape's moment whatever stretches the timers are run
  // on: what a read says of the time ("2m ago") is the same on every run.
  await page.clock.setFixedTime(at);
  clockOf.set(page, { at, now: at });
  const pending = new Set<Request>();
  inFlight.set(page, pending);
  page.on("request", (request) => pending.add(request));
  // Answered once its response is in: Playwright says no requestfinished
  // for some answered fetches (a preview's CORS ping), so that alone would
  // hold a request in flight for good.
  page.on("response", (response) => pending.delete(response.request()));
  page.on("requestfinished", (request) => pending.delete(request));
  page.on("requestfailed", (request) => pending.delete(request));
  // A new document: the last one's requests are nobody's to wait on.
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      pending.clear();
    }
  });
  // A state whose control is gone fails in seconds, not the default 30.
  page.setDefaultTimeout(10_000);
  return page;
}

/** How far before the tape's moment the clock is installed, so it can be paused at that moment. */
const CLOCK_LEAD_MS = 1000;
/** The page time an act is given: its clock stands this far past where the act began, whatever the act took. */
const ACT_MS = 60_000;

/**
 * Where each page's fake clock stands (`now`), the walk's own count: Date
 * is fixed at the tape's moment (`at`), so the page cannot say.
 */
const clockOf = new WeakMap<Page, { at: number; now: number }>();

/** The page's timers run on `ms`, its clock's count kept. */
async function runOn(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
  const clock = clockOf.get(page);
  if (clock) {
    clock.now += ms;
  }
}

/**
 * An act, with the page's time flowing as a person's clicks meet a page
 * whose motions play (a popover's control is clickable once its opening
 * has moved it into place); then the clock stands again at ACT_MS past
 * where the act began, the same mark on every run, Date at the tape's
 * moment still.
 */
async function acting(
  page: Page,
  act: (page: Page) => Promise<unknown>
): Promise<void> {
  const clock = clockOf.get(page);
  const began = performance.now();
  await page.clock.resume();
  await page.evaluate(() => window.__ssReader?.holding(true));
  try {
    await act(page);
  } finally {
    await page
      .evaluate(() => window.__ssReader?.holding(false))
      .catch(() => undefined);
    if (clock) {
      // The act ran in real time, its page time flowing with it: the mark
      // stands ACT_MS on, past any act under it. One that ran longer stands
      // past itself instead, and says so: that state is no longer still.
      const took = performance.now() - began;
      let mark = clock.now + ACT_MS;
      if (took >= ACT_MS - 1000) {
        mark = clock.now + took + ACT_MS;
        console.log(
          `  act: ran ${Math.round(took)} ms of real time, past its ${ACT_MS} ms of page time`
        );
      }
      await page.clock.pauseAt(mark);
      await page.clock.setFixedTime(clock.at);
      clock.now = mark;
    }
  }
}
/** Each stretch `settle` runs the clock on, and how many. */
const SETTLE_STEP_MS = 1000;
const SETTLE_STEPS = 3;
/** Real time a socket's answer is given to land after the last request is answered. */
const LAND_MS = 50;

/**
 * Until the tape has answered every request the page made: none in flight
 * on two reads in a row, a socket's answers given LAND_MS to land. A page
 * still asking after 15 s is read as it stands (its requests named).
 */
async function quiet(page: Page): Promise<void> {
  const pending = inFlight.get(page);
  let calm = 0;
  for (let i = 0; i < 300 && calm < 2; i += 1) {
    calm = pending && pending.size > 0 ? 0 : calm + 1;
    // biome-ignore lint/performance/noAwaitInLoops: polled until nothing is in flight
    await page.waitForTimeout(LAND_MS);
  }
  for (const request of calm < 2 ? (pending ?? []) : []) {
    const url = request.url().replace(ORIGIN_PORT, ":<port>");
    if (!gaveUp.has(url)) {
      gaveUp.add(url);
      console.log(`  quiet: gave up after 15 s on ${request.method()} ${url}`);
    }
  }
}

/** A loopback origin's port, the run's own, as a line names it. */
const ORIGIN_PORT = /:\d{4,5}(?=\/)/;

/**
 * The page's own time, run on: each stretch only once the tape has answered
 * what the last one asked, so an answer lands at the same point of the
 * page's time on every run, however busy the machine.
 */
async function settle(page: Page): Promise<void> {
  for (let step = 0; step < SETTLE_STEPS; step += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each stretch runs on what the last one left
    await quiet(page);
    await runOn(page, SETTLE_STEP_MS);
  }
  await quiet(page);
}

/** Every scroll offset on the page and the root's box: what a still page keeps between two reads. */
const scrollsAndBoxes = () => {
  let sum = 0;
  // Every inline style's text, hashed: a value a script writes moves the
  // hash, whatever its length.
  let styles = 7;
  let scrolls = `${scrollX},${scrollY}`;
  const all = document.getElementsByTagName("*");
  for (const el of all) {
    const r = el.getBoundingClientRect();
    sum += r.x * 3 + r.y * 7 + r.width * 11 + r.height * 13;
    const style = el.getAttribute("style") ?? "";
    for (let i = 0; i < style.length; i += 1) {
      styles = (styles * 31 + style.charCodeAt(i)) % 2_147_483_647;
    }
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      scrolls += `;${el.scrollTop},${el.scrollLeft}`;
    }
  }
  const loading = [...document.images].filter((img) => !img.complete);
  return `${all.length} ${sum.toFixed(3)} ${styles} ${loading.length} ${document.fonts.status} ${scrolls}`;
};

/** The window and every scroll container at the top and start: the one offset each is read at. */
const toTheStart = () => {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  for (const el of document.getElementsByTagName("*")) {
    if (el.scrollTop !== 0 || el.scrollLeft !== 0) {
      el.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }
};

/**
 * Waits until the page stops changing: fonts and images in, the tape done
 * answering, the page's time run on its fixed stretches (`settle`), still in
 * its own time, then every scroll container at its start (what the page
 * scrolled itself is done by then) and still again: every animation held,
 * and its elements, their boxes, their inline styles and every scroll offset
 * the same over three stretches in a row.
 */
export async function stand(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
  await stillInPageTime(page);
  await page.evaluate(toTheStart);
  await stillInPageTime(page);
  await holdStill(page);
}

/**
 * Still in the page's own time: a paused clock holds a spring mid-way and
 * looks still, so each read follows a stretch of it. A motion a resize or a
 * scroll restarted (its observer's callback lands in real time, among the
 * stretches) runs on until it rests; a loop that never rests stops at the
 * cap, the same stretch of time on every run.
 */
async function stillInPageTime(page: Page): Promise<void> {
  let last = "";
  let still = 0;
  for (let i = 0; i < STILL_STRETCHES && still < 3; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polled until the page holds still
    await quiet(page);
    await runOn(page, STILL_STEP_MS);
    await holdStill(page);
    const now = await page.evaluate(scrollsAndBoxes);
    still = now === last ? still + 1 : 0;
    last = now;
  }
}

/** Each stretch of page time the stillness reads follow, and at most how many. */
const STILL_STEP_MS = 250;
const STILL_STRETCHES = 60;

/**
 * A route as it opens, standing still, then measured once more at rest: a
 * size a script measured while the page was still moving (the composer's
 * ask room, Composer.svelte `askRoom`, taken as the ask grows) is measured
 * again on `resize`, which the page is sent once it stands.
 */
async function arrive(page: Page): Promise<void> {
  await stand(page);
  // A real resize, one pixel and back: a ResizeObserver hears it (a
  // highlight's rows measured mid-slide, highlight.svelte.ts's `sizes`),
  // where a dispatched `resize` event reaches only window listeners.
  const size = page.viewportSize();
  if (size) {
    await page.setViewportSize({ width: size.width + 1, height: size.height });
    await quiet(page);
    await runOn(page, SETTLE_STEP_MS);
    await page.setViewportSize(size);
  }
  await stand(page);
}

export interface Visit {
  page: Page;
  pass: Pass;
  state: State;
  surface: Surface;
}

/**
 * Walks `surfaces` at `passes`, handing each state to `visit` once it
 * stands still. A state that cannot open (its control gone) is reported to
 * `failed` and the walk goes on. Returns each surface's seconds.
 */
export async function walk(
  kit: Kit,
  servers: Servers,
  tape: Pick<Tape, "at" | "scene">,
  surfaces: Surface[],
  passes: Pass[],
  visit: (v: Visit) => Promise<void>,
  failed: (what: string, why: string) => void
): Promise<Map<string, number>> {
  const seconds = new Map<string, number>();
  const scene = tape.scene as Scene;
  // A tape recorded without the delegate (`--record --without-delegate`)
  // holds nothing for a state that stands on it; a state only a product
  // change could still is no reading. Each is said once, then left out.
  const hostOnly = (state: State) => state.hostOnly === true && !scene.split;
  const unstill = (surface: Surface, state: State) =>
    UNSTILL[`${surface.name}/${state.name}`];
  const absent = (surface: Surface, state: State) =>
    hostOnly(state) || unstill(surface, state) !== undefined;
  for (const surface of surfaces) {
    for (const state of surface.states) {
      if (hostOnly(state)) {
        kit.note(`${surface.name}/${state.name}: host only, not in this tape`);
      }
      const why = unstill(surface, state);
      if (why) {
        kit.note(`${surface.name}/${state.name}: left out, not still: ${why}`);
      }
    }
  }
  for (const surface of surfaces) {
    const started = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: one surface at a time
    const base = await servers.base(surface.serve);
    // A surface's passes side by side, each on its own page and context.
    await pool(passes, PARALLEL, async (pass) => {
      const states = surface.states.filter(
        (s) =>
          !(absent(surface, s) || (s.widths && !s.widths.includes(pass.width)))
      );
      if (states.length === 0) {
        return;
      }
      const page = await passPage(kit, pass, tape.at);
      await servers.attach(page.context());
      try {
        for (const state of states) {
          const what = `${surface.name}/${state.name} · ${pass.name}`;
          try {
            const route = (state.route ?? surface.route)(scene);
            // biome-ignore lint/performance/noAwaitInLoops: one state at a time on the pass's page
            await open(
              page,
              `${base}${route}`,
              () => document.readyState !== "loading",
              60_000
            );
            await arrive(page);
            if (state.act) {
              await acting(page, state.act);
              // The pointer off the page, so nothing reads hovered because a
              // click left it there; then measured again at rest, as on
              // arrival: what the act's motion moved while it measured.
              await page.mouse.move(-1, -1);
              await arrive(page);
            }
            await visit({ page, pass, state, surface });
          } catch (error) {
            failed(what, String(error).split("\n")[0] ?? "");
          }
        }
      } finally {
        await page
          .context()
          .close()
          .catch(() => undefined);
      }
    });
    seconds.set(surface.name, (performance.now() - started) / 1000);
  }
  return seconds;
}

/**
 * States only a product change could make read the same on every run,
 * each with its race, left out of every walk with a NOTE (the brief: never
 * change the dashboard to still a capture).
 */
const UNSTILL: Record<string, string> = Object.fromEntries(
  ["editor", "program", "launch"].map((state) => [
    `workflows/${state}`,
    "the program's CodeView decides its active line once, at mount, by whether it is editable then (CodeView.svelte:177-179; the `editing` reconfigure at 204-211 never adds or drops it), and the workflow that makes it editable and CodeMirror's chunk land in either order",
  ])
);

/** Passes walked at once: `PROBE_PARALLEL`, or 4. Each holds still on its own page, so how many run never moves a reading. */
const PARALLEL = Number(process.env.PROBE_PARALLEL) || 4;

/** Runs `work` on every item, at most `limit` at a time. */
async function pool<T>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const lanes = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next] as T;
        next += 1;
        // biome-ignore lint/performance/noAwaitInLoops: each lane takes the next item when its last is done
        await work(item);
      }
    }
  );
  await Promise.all(lanes);
}
