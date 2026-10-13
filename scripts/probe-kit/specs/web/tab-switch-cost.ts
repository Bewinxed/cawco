/**
 * What a session switch costs the strip to draw (owner: "The tab slide on
 * safari web is choppy, the transcript is smooth but the tabs are
 * choppy"), on the folder bench (/motion/folder-proof, no hub): the real
 * PaneTabs, its second tab chosen, switching to its third and back.
 *
 * A switch comes two ways: a swipe (the bench's `ride`, the phone's pane
 * swipe's `travel` handed in a new object each frame, then `land`), and a
 * tap (a real click on the tab).
 *
 * Engine (Chromium): at 20, 40, 60 and 80% of each, every element of every
 * tab and its ::before/::after, read for the properties below; the ones
 * whose value moves between fractions are named (a note: what each frame
 * repaints).
 *
 * Pixels (Chromium): the strip at rest and at 25, 50 and 75% of a swipe and
 * of a tap, against the baselines `--approve` wrote from main's rendering,
 * 0 px allowed. Endless runs (a working glyph's pulse) are held at their
 * start for every capture. WebKit's strip at rest and at 25, 50 and 75% of
 * a swipe, against its own baselines, the same way.
 *
 * Cadence (WebKit, `PROBE_WEBKIT` naming its `pw_run.sh` where the build
 * this playwright-core wants is not installed): ten swipes on the phone,
 * ten taps on the phone and ten on the desk, every requestAnimationFrame
 * interval from the switch's start to 200ms past its end; p50, p95, max and
 * how many are over 20ms, and for each tap (an in-page `el.click()`, as the
 * owner's Safari reading makes it) its first intervals after the click, its
 * longest and its count over 20ms, written to `cadence.json` in the spec's
 * out folder (notes: supporting, never a pass).
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one page, one frame, one capture at a time, each with the machine to itself
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each switch is driven and read step by step, as a finger makes it
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import { diff } from "../../diff";
import { box } from "../../geom";
import {
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

const STRIP = '[data-strip="session"]';
const PROPS = [
  "clip-path",
  "mask-image",
  "filter",
  "box-shadow",
  "background-color",
  "background-image",
  "width",
  "height",
  "transform",
  "translate",
  "scale",
  "opacity",
];
const READ_AT = [0.2, 0.4, 0.6, 0.8];
const DIFF_AT = [0.25, 0.5, 0.75];
const RUNS = 10;
const SLOW_MS = 20;
/** The swipe's drag, its settle and the watch past its landing, ms. */
const DRAG = 250;
const SETTLE = 350;
const TAIL = 200;
/** How long a tap is watched: the switch (`--dur-settle`) and 200ms past it. */
const TAP_WATCH = 600;

interface Bench {
  __ft: {
    chosen: () => string;
    ids: string[];
    land: (id: string) => void;
    ride: (toward: string | null, fraction?: number) => void;
  };
}

const url = (base: string, theme: string) =>
  `${base}/motion/folder-proof?theme=${theme}&at=1`;

async function openBench(page: Page, base: string, theme: string) {
  await open(page, url(base, theme), `${STRIP} .tab`);
  await page.waitForFunction(() => "__ft" in window);
  await settle(page);
  return page.evaluate(() => (window as unknown as Bench).__ft.ids);
}

/** Every endless run held at its start, so a capture never catches a pulse mid-way. */
const holdLoops = (page: Page) =>
  page.evaluate(() => {
    for (const run of document.getAnimations()) {
      if (run.effect?.getTiming().iterations === Number.POSITIVE_INFINITY) {
        run.pause();
        run.currentTime = 0;
      }
    }
  });

/** Every tab element and pseudo-element in the strip: its read properties. */
const readStrip = (page: Page) =>
  page.evaluate(
    ({ root, props }) => {
      const out: Record<string, Record<string, string>> = {};
      for (const [ti, tab] of [
        ...document.querySelectorAll(`${root} .tab`),
      ].entries()) {
        for (const [ei, el] of [tab, ...tab.querySelectorAll("*")].entries()) {
          const cls =
            typeof el.className === "string"
              ? el.className
              : (el.getAttribute("class") ?? "");
          const name = `${el.tagName.toLowerCase()}${cls ? `.${cls.trim().split(" ")[0]}` : ""}`;
          for (const ps of [null, "::before", "::after"]) {
            const s = getComputedStyle(el, ps);
            if (ps && (s.content === "none" || s.content === "normal")) {
              continue;
            }
            out[`${ti}|${ei}|${name}${ps ?? ""}`] = Object.fromEntries(
              props.map((p) => [p, s.getPropertyValue(p)])
            );
          }
        }
      }
      return out;
    },
    { root: STRIP, props: PROPS }
  );

/** The properties that moved between readings, each with the elements it moved on. */
function moved(reads: Record<string, Record<string, string>>[]) {
  const by = new Map<string, Set<string>>();
  const [first] = reads;
  for (const key of Object.keys(first ?? {})) {
    for (const prop of PROPS) {
      const seen = new Set(reads.map((r) => r[key]?.[prop]));
      if (seen.size > 1) {
        const [tab, , name] = key.split("|");
        const at = by.get(prop) ?? new Set<string>();
        at.add(`${name}#${tab}`);
        by.set(prop, at);
      }
    }
  }
  return [...by].map(([prop, els]) => `${prop}: ${[...els].join(" ")}`);
}

/** The strip's region for a capture, 12px of room round it. */
async function stripClip(page: Page) {
  const b = await box(page, `${STRIP} .session-tabs`);
  if (!b) {
    throw new Error("no session strip drawn");
  }
  return {
    x: Math.max(0, b.left - 12),
    y: Math.max(0, b.top - 12),
    width: b.width + 24,
    height: b.height + 24,
  };
}

/**
 * Safari's engine draws the strip too: WebKit's strip at rest and at 25, 50
 * and 75% of a swipe, against its own baselines, 0 px allowed. Its tap
 * cannot be held part-way (the clock is seeked through Chromium's protocol),
 * so only the swipe's fractions are read.
 */
async function webkitPixels(kit: Kit, base: string) {
  for (const view of ["desk", "phone"] as View[]) {
    for (const theme of ["light", "dark"]) {
      const tag = `webkit-${view}-${theme}`;
      const page = await kit.page(view, {
        engine: "webkit",
        theme: theme as "light" | "dark",
      });
      const ids = await openBench(page, base, theme);
      const to = ids[2] as string;
      const clip = await stripClip(page);
      await holdLoops(page);
      await diff(kit, page, `${tag}-rest`, { clip });
      for (const f of DIFF_AT) {
        await page.evaluate(
          ([t, fr]) => (window as unknown as Bench).__ft.ride(t, fr),
          [to, f] as const
        );
        await frames(page);
        await holdLoops(page);
        await diff(kit, page, `${tag}-swipe-${f * 100}`, { clip });
      }
      await page.close();
    }
  }
}

async function engineAndPixels(kit: Kit, base: string) {
  for (const view of ["desk", "phone"] as View[]) {
    for (const theme of ["light", "dark"]) {
      const tag = `${view}-${theme}`;
      const page = await kit.page(view, { theme: theme as "light" | "dark" });
      const ids = await openBench(page, base, theme);
      const [, from, to] = ids as [string, string, string];
      const clip = await stripClip(page);
      await holdLoops(page);
      await diff(kit, page, `${tag}-rest`, { clip });

      // A swipe, held at each fraction.
      const ride = (f: number | null) =>
        page.evaluate(
          ([t, fr]) =>
            (window as unknown as Bench).__ft.ride(
              fr === null ? null : t,
              fr ?? 0
            ),
          [to, f] as const
        );
      const swipeReads: Record<string, Record<string, string>>[] = [];
      for (const f of READ_AT) {
        await ride(f);
        await frames(page);
        swipeReads.push(await readStrip(page));
      }
      for (const f of DIFF_AT) {
        await ride(f);
        await frames(page);
        await holdLoops(page);
        await diff(kit, page, `${tag}-swipe-${f * 100}`, { clip });
      }
      await ride(null);
      await settle(page);
      kit.note(
        `${tag} swipe: what moves between 20/40/60/80% — ${moved(swipeReads).join("; ") || "nothing"}`
      );

      // A tap, caught on the clock and seeked.
      const clock = await Clock.on(page);
      await clock.catchRuns(
        () => page.click(`${STRIP} [data-session-tab="${to}"]`),
        STRIP
      );
      const tapReads: Record<string, Record<string, string>>[] = [];
      for (const f of READ_AT) {
        await clock.seek(f, "opacity");
        tapReads.push(await readStrip(page));
      }
      for (const f of DIFF_AT) {
        await clock.seek(f, "opacity");
        await holdLoops(page);
        await diff(kit, page, `${tag}-tap-${f * 100}`, { clip });
      }
      await clock.release();
      await settle(page);
      kit.note(
        `${tag} tap: what moves between 20/40/60/80% — ${moved(tapReads).join("; ") || "nothing"}`
      );
      kit.check(
        `${tag}: the tap lands on its tab`,
        (await page.evaluate(() =>
          (window as unknown as Bench).__ft.chosen()
        )) === to,
        `from ${from}`
      );
      await page.close();
    }
  }
}

/** The in-page frame recorder: every requestAnimationFrame stamp while on. */
function recorder() {
  const w = window as unknown as {
    __rec: {
      on: boolean;
      start: () => void;
      stop: () => number[];
      ts: number[];
    };
  };
  w.__rec = {
    on: false,
    ts: [],
    start() {
      this.ts = [];
      this.on = true;
      const step = (t: number) => {
        if (this.on) {
          this.ts.push(t);
          requestAnimationFrame(step);
        }
      };
      requestAnimationFrame(step);
    },
    stop() {
      this.on = false;
      return this.ts;
    },
  };
}

const deltas = (ts: number[]) => ts.slice(1).map((t, i) => t - (ts[i] ?? t));

function stats(all: number[]) {
  const sorted = [...all].sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    frames: sorted.length,
    p50: r(q(0.5)),
    p95: r(q(0.95)),
    max: r(sorted.at(-1) ?? 0),
    over20: sorted.filter((d) => d > SLOW_MS).length,
  };
}

async function cadence(kit: Kit, base: string) {
  const results: Record<string, ReturnType<typeof stats>> = {};
  const perTap: {
    first: number[];
    max: number;
    maxAt: number;
    over20: number;
    view: View;
  }[] = [];
  for (const view of ["phone", "desk"] as View[]) {
    const page = await kit.page(view, { engine: "webkit", init: [recorder] });
    const ids = await openBench(page, base, "light");
    const pair = [ids[1], ids[2]] as [string, string];

    if (view === "phone") {
      const swipes: number[] = [];
      for (let n = 0; n < RUNS; n += 1) {
        const toward = pair[(n + 1) % 2] as string;
        const ts = await page.evaluate(
          ({ t, drag, set, tail }) =>
            new Promise<number[]>((done) => {
              const ft = (window as unknown as Bench).__ft;
              const stamps: number[] = [];
              let t0 = -1;
              let landed = false;
              const step = (now: number) => {
                if (t0 < 0) {
                  t0 = now;
                }
                stamps.push(now);
                const at = now - t0;
                if (at < drag) {
                  ft.ride(t, (0.55 * at) / drag);
                } else if (at < drag + set) {
                  const u = (at - drag) / set;
                  ft.ride(t, 0.55 + 0.45 * (1 - (1 - u) ** 3));
                } else if (!landed) {
                  landed = true;
                  ft.land(t);
                }
                if (at < drag + set + tail) {
                  requestAnimationFrame(step);
                } else {
                  done(stamps);
                }
              };
              requestAnimationFrame(step);
            }),
          { t: toward, drag: DRAG, set: SETTLE, tail: TAIL }
        );
        swipes.push(...deltas(ts));
        await settle(page, 300);
      }
      results["phone swipe"] = stats(swipes);
    }

    // A tap as the owner's Safari reading makes it: `el.click()` on the tab
    // in the page, every frame stamped from a few before it to TAP_WATCH
    // past it. Each tap's own reading: its first intervals after the
    // click (the click's task and the frames that start the switch), its
    // longest, and how many are over SLOW_MS.
    const taps: number[] = [];
    for (let n = 0; n < RUNS; n += 1) {
      const toward = pair[(n + 1) % 2] as string;
      const { ts, at } = await page.evaluate(
        ({ sel, watch }) =>
          new Promise<{ at: number; ts: number[] }>((done) => {
            const rec = (
              window as unknown as {
                __rec: { start: () => void; stop: () => number[] };
              }
            ).__rec;
            rec.start();
            // Three frames of lead, then the click in a task of its own.
            let lead = 0;
            const wait = () => {
              lead += 1;
              if (lead < 3) {
                requestAnimationFrame(wait);
                return;
              }
              setTimeout(() => {
                const clicked = performance.now();
                document.querySelector<HTMLElement>(sel)?.click();
                setTimeout(() => done({ at: clicked, ts: rec.stop() }), watch);
              });
            };
            requestAnimationFrame(wait);
          }),
        {
          sel: `${STRIP} [data-session-tab="${toward}"]`,
          watch: TAP_WATCH,
        }
      );
      // The intervals that end after the click: the first spans the click.
      const after = deltas(ts).filter((_, i) => (ts[i + 1] ?? 0) > at);
      taps.push(...after);
      const r = (x: number) => Math.round(x * 10) / 10;
      perTap.push({
        view,
        first: after.slice(0, 3).map(r),
        max: r(Math.max(...after)),
        maxAt: after.indexOf(Math.max(...after)),
        over20: after.filter((d) => d > SLOW_MS).length,
      });
      await settle(page, 300);
    }
    results[`${view} tap`] = stats(taps);
    await page.close();
  }
  await writeFile(
    join(kit.out, "cadence.json"),
    `${JSON.stringify({ results, perTap }, null, 2)}\n`
  );
  for (const [what, s] of Object.entries(results)) {
    kit.note(
      `WebKit ${what}: ${s.frames} intervals, p50 ${s.p50}ms, p95 ${s.p95}ms, max ${s.max}ms, ${s.over20} over ${SLOW_MS}ms`
    );
  }
  for (const t of perTap) {
    kit.note(
      `WebKit ${t.view} tap: first intervals ${t.first.join(" / ")}ms, max ${t.max}ms (interval ${t.maxAt}), ${t.over20} over ${SLOW_MS}ms`
    );
  }
}

const spec: Spec = {
  name: "tab-switch-cost",
  async run(kit) {
    const base = await kit.bench();
    if (process.env.PROBE_ONLY !== "cadence") {
      await engineAndPixels(kit, base);
      await webkitPixels(kit, base);
    }
    if (process.env.PROBE_ONLY !== "pixels") {
      await cadence(kit, base);
    }
  },
};
export default spec;
