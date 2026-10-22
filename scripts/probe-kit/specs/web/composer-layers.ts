/**
 * Nothing that comes out of the composer moves the transcript (owner: "WHY
 * WOULD ANYTHING THAT COMES OUT OF THE COMPOSER EVEN MOVE THE TRANSCRIPT").
 * On the delegate tray's bench (the real SessionPane and the composer lent
 * to it), with four delegates (one failed) and with eleven (three failed):
 *
 *   bun scripts/probe-kit/run.ts web composer-layers
 *
 * Each surface the composer owns is opened and closed while its runs are
 * held and seeked through 0, ¼, ½, ¾ and 1 (Chromium: the DevTools
 * protocol's Animation domain, anim.ts; WebKit, which has none: each run
 * the page starts held through Web Animations and its `currentTime` set),
 * and read again once it has settled. At every one of those, the
 * transcript scroller's box, its `scrollTop` and the last message row in
 * its view are what they were before the open, to a hundredth of a pixel.
 * The surface's own runs share one start, one length and one easing.
 *
 * The surfaces: an ask parked on the conversation (the composer grows into
 * it), the "+N" list and the failures list (the tray's shelf), a delegate
 * chip's panel, the `/` menu, the `@` menu, an attachment's row, and the
 * plan its ring opens. One a leg cannot open (no "+N" where every chip
 * fits) is a NOTE.
 *
 * At 390, 680 and 1440, in Chromium and WebKit, scrolled to the end and
 * mid-history. `LAYERS_ONLY=<part>,…` runs only the legs whose key
 * (`chromium-390-11-end`, `webkit-1440-4-mid-history`) holds a part.
 */
import type { Page } from "playwright-core";
import { Clock } from "../../anim";
import {
  COMPOSER,
  type Engine,
  frames,
  type Kit,
  open,
  type Spec,
  settle,
  type View,
} from "../../kit";

const BENCH = "/motion/delegate-tray";
const LOG = '[data-slot="tr"][role="log"]';
const FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
/** What a reading may differ by and still be the same pixel: a float's noise. */
const SAME = 0.01;

interface Box {
  height: number;
  left: number;
  top: number;
  width: number;
}
interface Reading {
  box: Box;
  last: (Box & { id: string }) | null;
  scrollTop: number;
}

/** The transcript as it stands: its box, its scroll, the last message row in its view. */
function reading(log: string): Reading | null {
  const scroller = document.querySelector<HTMLElement>(log);
  if (!scroller) {
    return null;
  }
  const at = (r: DOMRect) => ({
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  });
  const view = scroller.getBoundingClientRect();
  let last: Reading["last"] = null;
  for (const row of scroller.querySelectorAll<HTMLElement>("[data-message]")) {
    const r = row.getBoundingClientRect();
    if (r.height > 0 && r.top < view.bottom && r.bottom > view.top) {
      last = { id: row.dataset.message ?? "", ...at(r) };
    }
  }
  return { box: at(view), scrollTop: scroller.scrollTop, last };
}

/** How `now` differs from `then`, in words; empty when it is the same to the pixel. */
function differs(then: Reading, now: Reading | null): string {
  if (!now) {
    return "the transcript is gone";
  }
  const out: string[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= SAME;
  for (const key of ["top", "left", "width", "height"] as const) {
    if (!near(then.box[key], now.box[key])) {
      out.push(`box.${key} ${then.box[key]}→${now.box[key]}`);
    }
  }
  if (!near(then.scrollTop, now.scrollTop)) {
    out.push(`scrollTop ${then.scrollTop}→${now.scrollTop}`);
  }
  if ((then.last?.id ?? "") !== (now.last?.id ?? "")) {
    out.push(`last row ${then.last?.id}→${now.last?.id}`);
  } else if (then.last && now.last) {
    for (const key of ["top", "left", "width", "height"] as const) {
      if (!near(then.last[key], now.last[key])) {
        out.push(`last.${key} ${then.last[key]}→${now.last[key]}`);
      }
    }
  }
  return out.join(", ");
}

/** One held run, engine-neutral. */
interface Held {
  easing: string;
  end: number;
  name: string;
  /** Its start: the protocol's start time (Chromium), the frame it was caught on (WebKit). */
  start: number | null;
}

/** A clock over the surface's own runs: Chromium's Animation domain, or WebKit's Web Animations. */
interface SurfaceClock {
  catchRuns(action: () => Promise<unknown>, within: string): Promise<Held[]>;
  oneClock(): string[];
  release(): Promise<void>;
  seek(fraction: number): Promise<void>;
}

/**
 * A control's colour easing to its state (a button's hover ink) is that
 * control's feedback, not the surface's motion: it never stands on the
 * surface's clock.
 */
const COLOUR = /(^|-)color$|^fill$|^stroke$/;

async function protocolClock(page: Page): Promise<SurfaceClock> {
  const clock = await Clock.on(page);
  return {
    async catchRuns(action, within) {
      const runs = await clock.catchRuns(action, within);
      // Its loops (a running dot's beat, a spinner) have no end to share.
      clock.runs = runs.filter(
        (one) =>
          !(
            one.loop ||
            one.scroll ||
            (one.type === "CSSTransition" && COLOUR.test(one.name))
          )
      );
      return clock.runs.map((one) => ({
        name: `${one.type} ${one.name}`,
        end: one.end,
        easing: one.easing,
        start: one.start,
      }));
    },
    oneClock: () => clock.oneClock().faults,
    release: () => clock.release(),
    seek: (fraction) => clock.seek(fraction),
  };
}

declare global {
  interface Window {
    __layersClock?: {
      done: boolean;
      held: { run: Animation; end: number; easing: string; frame: number }[];
    };
  }
}

/**
 * WebKit's clock: a frame loop started before the action holds every run
 * that starts inside `within` as it is first listed, then puts each at its
 * first frame. A run of no length (Svelte's dummy before its keyframes) and
 * a loop are let go.
 */
function waapiClock(page: Page): SurfaceClock {
  let held: Held[] = [];
  return {
    async catchRuns(action, within) {
      await page.evaluate((sel) => {
        const seen = new Set(window.kitRuns());
        const clock = {
          done: false,
          held: [] as {
            run: Animation;
            end: number;
            easing: string;
            frame: number;
          }[],
        };
        window.__layersClock = clock;
        let frame = 0;
        let after = 0;
        const look = () => {
          frame += 1;
          for (const run of window.kitRuns()) {
            if (seen.has(run)) {
              continue;
            }
            seen.add(run);
            const end = Number(run.effect?.getComputedTiming().endTime ?? 0);
            const target = (run.effect as KeyframeEffect | null)?.target;
            const property =
              run instanceof CSSTransition ? run.transitionProperty : "";
            if (
              !Number.isFinite(end) ||
              end <= 0 ||
              /(^|-)color$|^fill$|^stroke$/.test(property) ||
              !window.kitInside(target, sel)
            ) {
              continue;
            }
            run.pause();
            clock.held.push({
              run,
              end,
              easing: String(run.effect?.getTiming().easing ?? ""),
              frame,
            });
          }
          after += clock.held.length > 0 ? 1 : 0;
          if (after >= 2 || frame > 180) {
            for (const one of clock.held) {
              one.run.currentTime = 0;
            }
            clock.done = true;
            return;
          }
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }, within);
      await action();
      await page.waitForFunction(() => window.__layersClock?.done === true, {
        timeout: 10_000,
      });
      held = await page.evaluate(() =>
        (window.__layersClock?.held ?? []).map((one) => {
          const named = one.run as Animation & {
            transitionProperty?: string;
            animationName?: string;
          };
          return {
            name: `${one.run.constructor.name} ${named.transitionProperty ?? named.animationName ?? one.run.id}`,
            end: one.end,
            easing: one.easing,
            start: one.frame,
          };
        })
      );
      if (held.length === 0) {
        throw new Error(`no animation started inside ${within}`);
      }
      return held;
    },
    oneClock() {
      const [first] = held;
      if (!first) {
        return ["no caught run"];
      }
      return held.flatMap((one) =>
        one.start !== first.start ||
        Math.abs(one.end - first.end) > 0.5 ||
        one.easing !== first.easing
          ? [
              `${one.name} frame ${one.start} ${one.end}ms ${one.easing} against ${first.name} frame ${first.start} ${first.end}ms ${first.easing}`,
            ]
          : []
      );
    },
    async release() {
      await page.evaluate(() => {
        for (const one of window.__layersClock?.held ?? []) {
          one.run.play();
        }
        window.__layersClock = undefined;
      });
      held = [];
    },
    async seek(fraction) {
      await page.evaluate((f) => {
        const all = window.__layersClock?.held ?? [];
        const length = Math.max(0, ...all.map((one) => one.end));
        for (const one of all) {
          one.run.currentTime = Math.min(one.end, length * f);
        }
      }, fraction);
      await frames(page);
    },
  };
}

/** One surface the composer owns: how it is found, opened and closed. */
interface Surface {
  close: (page: Page) => Promise<void>;
  name: string;
  open: (page: Page) => Promise<void>;
  /** Whether this leg has it to open; a reason when it does not. */
  present: (page: Page) => Promise<string | null>;
  /** What its own runs run on. */
  within: (page: Page) => Promise<string>;
}

const visible = async (page: Page, selector: string): Promise<boolean> =>
  (await page.locator(selector).count()) > 0 &&
  (await page.locator(selector).first().isVisible());

const SHELF = '[data-slot="shelf-slot"], section[data-slot="shelf"]';
const SHELF_CLOSE = 'section[data-slot="shelf"] [data-slot="shead"] button';
const MORE = 'button[data-slot="more"]';
const FAILED = 'button[data-key="failed"], button[data-tray-chip][data-end]';
const CHIP =
  'button[data-tray-chip][data-key^="wi-"]:not([data-end]):not([data-slot])';
const FILE = 'input[data-slot="hidden-file"]';
const RING = 'button[data-slot="plan-ring"]';

/** The field, focused and empty. */
async function field(page: Page): Promise<void> {
  await page.locator(COMPOSER).focus();
}

/**
 * A menu the field's sigil opens, above the pill: the composer's own `/`
 * menu, or MentionField's `@` menu, portaled into the pill.
 */
function sigilMenu(sigil: "/" | "@"): Surface {
  const menu =
    sigil === "/"
      ? "#composer-menu"
      : 'form[data-slot="cin"] [data-slot="menu"]:not(#composer-menu)';
  return {
    name: `${sigil} menu`,
    async present(page) {
      await field(page);
      await page.keyboard.type(sigil);
      await settle(page, 300);
      const shown = await visible(page, menu);
      await page.keyboard.press("Backspace");
      await settle(page, 400);
      return shown ? null : `typing ${sigil} opens no menu on this bench`;
    },
    within: async () => menu,
    async open(page) {
      await field(page);
      await page.keyboard.type(sigil);
    },
    async close(page) {
      await page.keyboard.press("Backspace");
    },
  };
}

/** The bench's session, as the delegate-tray bench seeds it. */
const BENCH_SESSION = "delegate-tray-bench";

/** Parks an ask on the bench's session, or takes it back: the hub's park and its answer. */
const parkAsk = (page: Page, parked: boolean) =>
  page.evaluate(
    ([id, on]) => {
      const debug = (
        globalThis as unknown as {
          __cawcoDebug: {
            state: { sessions: Record<string, { pending: unknown[] }> };
          };
        }
      ).__cawcoDebug;
      const session = debug.state.sessions[id as string];
      if (!session) {
        throw new Error(`no session ${id}`);
      }
      if (!on) {
        session.pending = [];
        return;
      }
      session.pending = [
        {
          heard: 0,
          input: { command: "bun run lint:changed" },
          instanceId: id,
          presentation: {
            asker: "",
            changes: [],
            command: "bun run lint:changed",
            fields: [],
            project: "cockpit",
            summary: "Lint the files this change touched",
          },
          requestId: "composer-layers-ask",
          toolName: "Bash",
        },
      ];
    },
    [BENCH_SESSION, parked] as const
  );

const SURFACES: Surface[] = [
  {
    // The composer grows into an ask parked on its conversation, and folds
    // back as it is answered: the room past the transcript's end grows for
    // it, and the view and its rows stay where they are.
    name: "parked ask",
    present: async () => null,
    within: async () => '[data-slot="shell"]',
    open: (page) => parkAsk(page, true),
    close: (page) => parkAsk(page, false),
  },
  {
    name: '"+N" list',
    present: async (page) =>
      (await visible(page, MORE)) ? null : 'every chip fits: no "+N"',
    within: async () => SHELF,
    open: (page) => page.locator(MORE).click(),
    close: (page) => page.locator(SHELF_CLOSE).click(),
  },
  {
    name: "failures list",
    present: async (page) =>
      (await visible(page, FAILED)) ? null : "no failure chip",
    within: async () => SHELF,
    open: (page) => page.locator(FAILED).first().click(),
    close: (page) => page.locator(SHELF_CLOSE).click(),
  },
  {
    name: "delegate panel",
    // Opened and shut once first: the delegate's tail is read on its first
    // open and lands in the panel as it does (a size tween, HoverPanel's
    // morph), which is that content arriving, not the panel's own open.
    async present(page) {
      if (!(await visible(page, CHIP))) {
        return "no working chip in the row";
      }
      await page.locator(CHIP).first().click();
      await settle(page, 600);
      await page.locator(CHIP).first().click();
      await settle(page, 600);
      return null;
    },
    within: async (page) =>
      `[id="${await page.locator(CHIP).first().getAttribute("aria-controls")}"]`,
    open: (page) => page.locator(CHIP).first().click(),
    close: (page) => page.locator(CHIP).first().click(),
  },
  sigilMenu("/"),
  sigilMenu("@"),
  {
    name: "attachment row",
    present: async (page) =>
      (await page.locator(FILE).count()) > 0 ? null : "no attach control",
    within: async () => "[data-atts]",
    open: (page) =>
      page.locator(FILE).setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("composer-layers\n"),
      }),
    close: (page) =>
      page.locator("[data-atts] button[aria-label^='Remove']").first().click(),
  },
  {
    name: "plan",
    present: async (page) =>
      (await visible(page, RING)) ? null : "no plan ring",
    within: async () => 'section[data-slot="plan"]',
    open: (page) => page.locator(RING).click(),
    close: (page) => page.locator(RING).click(),
  },
  {
    // A reader who scrolled into the parked room to read the last row over
    // the card: the card leaving (opened here) takes no room from under
    // them, and one parking again (closed here) moves nothing either.
    name: "ask leaving under a reader in its room",
    async present(page) {
      const atEnd = await page.evaluate((log) => {
        const s = document.querySelector<HTMLElement>(log);
        return !!s && s.scrollHeight - s.clientHeight - s.scrollTop <= 1;
      }, LOG);
      if (!atEnd) {
        return "read at the end only";
      }
      await parkAsk(page, true);
      await settle(page, 800);
      await page.evaluate((log) => {
        const s = document.querySelector<HTMLElement>(log);
        if (s) {
          s.scrollTop = s.scrollHeight;
        }
      }, LOG);
      await settle(page, 800);
      return null;
    },
    within: async () => '[data-slot="shell"]',
    open: (page) => parkAsk(page, false),
    close: (page) => parkAsk(page, true),
  },
];

/** Reads the transcript at every fraction of the clock, and settled; the faults, in words. */
async function through(
  page: Page,
  clock: SurfaceClock,
  before: Reading
): Promise<string[]> {
  const faults: string[] = [];
  for (const f of FRACTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one point of the clock at a time
    await clock.seek(f);
    const diff = differs(before, await page.evaluate(reading, LOG));
    if (diff) {
      faults.push(`${f * 100}%: ${diff}`);
    }
  }
  await clock.release();
  await settle(page, 400);
  const diff = differs(before, await page.evaluate(reading, LOG));
  if (diff) {
    faults.push(`settled: ${diff}`);
  }
  return faults;
}

interface Leg {
  count: "4" | "11";
  engine: Engine;
  place: "end" | "mid-history";
  view: View;
  width: number;
}

async function leg(kit: Kit, base: string, at: Leg): Promise<void> {
  const name = `${at.engine} ${at.width} · ${at.count} delegates · ${at.place}`;
  const page = await kit.page(at.view, { engine: at.engine });
  await open(page, `${base}${BENCH}?case=${at.count}`, LOG, 120_000);
  await page.waitForSelector(`${LOG} [data-message]`, { timeout: 30_000 });
  await settle(page, 800);
  const clock =
    at.engine === "chromium" ? await protocolClock(page) : waapiClock(page);
  for (const surface of SURFACES) {
    const what = `${name} · ${surface.name}`;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one surface at a time, on one page
      await place(page, at.place);
      const absent = await surface.present(page);
      if (absent) {
        kit.note(`${what}: not here (${absent})`);
        continue;
      }
      const before = await page.evaluate(reading, LOG);
      if (!before) {
        kit.check(`${what}: the transcript is there`, false);
        continue;
      }
      const within = await surface.within(page);
      const opened = await clock.catchRuns(() => surface.open(page), within);
      const openClock = clock.oneClock();
      const openFaults = await through(page, clock, before);
      const closed = await clock.catchRuns(() => surface.close(page), within);
      const closeClock = clock.oneClock();
      const closeFaults = await through(page, clock, before);
      kit.check(
        `${what}: the transcript's box, scrollTop and last row stand still through its open and its close (0, ¼, ½, ¾, 1, settled)`,
        openFaults.length === 0 && closeFaults.length === 0,
        [
          ...openFaults.map((one) => `open ${one}`),
          ...closeFaults.map((one) => `close ${one}`),
        ]
          .slice(0, 6)
          .join("; ") || `last row ${before.last?.id ?? "none"}`
      );
      const runs = (list: Held[]) =>
        [
          ...new Set(
            list.map(
              (one) => `${one.name} ${Math.round(one.end)}ms ${one.easing}`
            )
          ),
        ].join(" + ");
      kit.check(
        `${what}: its open and its close each run on one clock`,
        openClock.length === 0 && closeClock.length === 0,
        openClock.length || closeClock.length
          ? [...openClock, ...closeClock].slice(0, 4).join("; ")
          : `open ${runs(opened)}; close ${runs(closed)}`
      );
    } catch (error) {
      kit.check(`${what}: runs`, false, String(error).split("\n")[0]);
      await clock.release().catch(() => undefined);
      await page.keyboard.press("Escape").catch(() => undefined);
      await settle(page, 400).catch(() => undefined);
    }
  }
  await page.close();
}

/** Puts the transcript at its end, or halfway through what it holds. */
async function place(page: Page, where: Leg["place"]): Promise<void> {
  await page.evaluate(
    ([log, at]) => {
      const scroller = document.querySelector<HTMLElement>(log);
      if (!scroller) {
        return;
      }
      const end = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = at === "end" ? end : Math.round(end / 2);
    },
    [LOG, where] as const
  );
  await settle(page, 600);
}

const VIEW_AT: [View, number][] = [
  ["phone", 390],
  ["narrowDesk", 680],
  ["desk", 1440],
];

const spec: Spec = {
  name: "composer-layers",
  async run(kit) {
    const base = await kit.bench();
    const only = process.env.LAYERS_ONLY?.split(",") ?? [];
    for (const engine of ["chromium", "webkit"] as const) {
      for (const [view, width] of VIEW_AT) {
        for (const count of ["4", "11"] as const) {
          for (const where of ["end", "mid-history"] as const) {
            const at = { engine, view, width, count, place: where };
            const key = `${engine}-${width}-${count}-${where}`;
            if (only.length > 0 && !only.some((one) => key.includes(one))) {
              continue;
            }
            try {
              // biome-ignore lint/performance/noAwaitInLoops: one leg at a time
              await leg(kit, base, at);
            } catch (error) {
              kit.check(`${key}: runs`, false, String(error).split("\n")[0]);
            }
          }
        }
      }
    }
  },
};
export default spec;
