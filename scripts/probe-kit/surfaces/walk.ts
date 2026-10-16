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
import type { Page } from "playwright-core";
import { heavySlot } from "../../lib/heavy-run";
import { until } from "../../scratch-fleet";
import type { Tape } from "../hub-tape";
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

/** The dashboard's two servers against one hub: the built one, and the dev server once a bench asks for it. */
export class Servers {
  private dev: Promise<{ base: string; child: Bun.Subprocess }> | null = null;
  private built: Promise<string> | null = null;
  private readonly kit: Kit;
  readonly hub: string;
  constructor(kit: Kit, hub: string) {
    this.kit = kit;
    this.hub = hub;
  }

  base(serve: Surface["serve"]): Promise<string> {
    if (serve === "built") {
      this.built ??= this.kit.builtFor(this.hub);
      return this.built;
    }
    this.dev ??= devServer(this.hub);
    return this.dev.then((d) => d.base);
  }

  async close(): Promise<void> {
    (await this.dev)?.child.kill();
  }
}

/** `vite dev` against `hub`: the `/motion/` benches' server (the kit's own is against no hub). */
async function devServer(hub: string) {
  const slot = await heavySlot();
  try {
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
  } finally {
    slot.release();
  }
}

/** A page for `pass`: its width, theme and motion, the reader installed, its clock held at `at`. */
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
  await page.clock.setFixedTime(at);
  // A state whose control is gone fails in seconds, not the default 30.
  page.setDefaultTimeout(10_000);
  return page;
}

/**
 * Waits until the page stops changing: fonts and images in, every animation
 * held, and its elements, their boxes and their inline styles the same on
 * four reads in a row 60ms apart.
 */
export async function stand(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  let last = "";
  let still = 0;
  for (let i = 0; i < 80 && still < 4; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polled until the page holds still
    await holdStill(page);
    const now = await page.evaluate(() => {
      let sum = 0;
      let styles = 0;
      const all = document.getElementsByTagName("*");
      for (const el of all) {
        const r = el.getBoundingClientRect();
        sum += r.x * 3 + r.y * 7 + r.width * 11 + r.height * 13;
        styles += (el.getAttribute("style") ?? "").length;
      }
      const loading = [...document.images].filter((img) => !img.complete);
      return `${all.length} ${sum.toFixed(2)} ${styles} ${loading.length} ${document.fonts.status}`;
    });
    still = now === last ? still + 1 : 0;
    last = now;
    await page.waitForTimeout(60);
  }
  await holdStill(page);
}

/**
 * A route as it opens, standing still, then measured once more at rest: a
 * size a script measured while the page was still moving (the composer's
 * ask room, Composer.svelte `askRoom`, taken as the ask grows) is measured
 * again on `resize`, which the page is sent once it stands.
 */
async function arrive(page: Page): Promise<void> {
  await stand(page);
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
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
  for (const surface of surfaces) {
    const started = performance.now();
    // biome-ignore lint/performance/noAwaitInLoops: one surface at a time
    const base = await servers.base(surface.serve);
    // A surface's passes side by side, each on its own page and context.
    await pool(passes, PARALLEL, async (pass) => {
      const states = surface.states.filter(
        (s) => !s.widths || s.widths.includes(pass.width)
      );
      if (states.length === 0) {
        return;
      }
      const page = await passPage(kit, pass, tape.at);
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
              await state.act(page);
              await stand(page);
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
