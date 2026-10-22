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
 * (`chromium-390-11-end`, `webkit-1440-4-mid-history`) holds a part, and
 * `LAYERS_SURFACES=<part>,…` only the surfaces whose name holds one.
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
  catchRuns: (
    action: () => Promise<unknown>,
    within: string
  ) => Promise<Held[]>;
  oneClock: () => string[];
  release: () => Promise<void>;
  seek: (fraction: number) => Promise<void>;
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
      await page.evaluate(
        ([sel, colour]) => {
          const seen = new Set(window.kitRuns());
          const clock: NonNullable<Window["__layersClock"]> = {
            done: false,
            held: [],
          };
          window.__layersClock = clock;
          const tint = new RegExp(colour);
          /** Its end, when it is the surface's own motion; null to let it go. */
          const endOf = (run: Animation): number | null => {
            const end = Number(run.effect?.getComputedTiming().endTime ?? 0);
            const target = (run.effect as KeyframeEffect | null)?.target;
            const property =
              run instanceof CSSTransition ? run.transitionProperty : "";
            // A control's own answer to being pressed (a button's scale on
            // `:active`), as its colour, is that control's, not the surface's.
            const pressed =
              run instanceof CSSTransition &&
              target instanceof Element &&
              target.closest("button, a, [role=button]") !== null;
            const own =
              Number.isFinite(end) &&
              end > 0 &&
              !tint.test(property) &&
              !pressed &&
              window.kitInside(target, sel);
            return own ? end : null;
          };
          let frame = 0;
          let after = 0;
          const hold = () => {
            for (const run of window
              .kitRuns()
              .filter((one) => !seen.has(one))) {
              seen.add(run);
              const end = endOf(run);
              if (end !== null) {
                run.pause();
                const easing = String(run.effect?.getTiming().easing ?? "");
                clock.held.push({ run, end, easing, frame });
              }
            }
          };
          const look = () => {
            frame += 1;
            hold();
            after += clock.held.length > 0 ? 1 : 0;
            if (after < 2 && frame <= 180) {
              requestAnimationFrame(look);
              return;
            }
            for (const one of clock.held) {
              one.run.currentTime = 0;
            }
            clock.done = true;
          };
          requestAnimationFrame(look);
        },
        [within, COLOUR.source] as const
      );
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
        // Whether the surface is there, and every run on it as it stands:
        // an entrance the engine never ran, or one the catch missed.
        const there = await page.evaluate((sel) => {
          const els = [...document.querySelectorAll(sel)];
          return els.map((el) => ({
            opacity: getComputedStyle(el).opacity,
            scale: getComputedStyle(el).scale,
            runs: el.getAnimations({ subtree: true }).map((run) => {
              const named = run as Animation & { transitionProperty?: string };
              return `${run.constructor.name} ${named.transitionProperty ?? ""} ${run.playState} ${Math.round(Number(run.currentTime ?? -1))}`;
            }),
          }));
        }, within);
        throw new Error(
          `no animation started inside ${within}: ${JSON.stringify(there)}`
        );
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
  /**
   * A motion staged on purpose, not one transition, and why: its runs are
   * read and named, and not held to one clock.
   */
  staged?: string;
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
    staged:
      "the ask's grown shape is drawn frame by frame on requestAnimationFrame (transcript/grown.ts morphTo), with the card coming up partway and the pill's parts stepping aside on their own fade (DESIGN.md, Composer, The grown shape)",
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
    // Its first open, as the person meets it: the tail drawn in it as it
    // comes in is part of that one motion (HoverPanel `entered`).
    present: async (page) =>
      (await visible(page, CHIP)) ? null : "no working chip in the row",
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
    staged:
      "the ask's grown shape is drawn frame by frame on requestAnimationFrame (transcript/grown.ts morphTo), with the card coming up partway and the pill's parts stepping aside on their own fade (DESIGN.md, Composer, The grown shape)",
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

/** The runs a clock held, in words: each kind, length and easing once. */
const runsOf = (list: Held[]): string =>
  [
    ...new Set(
      list.map((one) => `${one.name} ${Math.round(one.end)}ms ${one.easing}`)
    ),
  ].join(" + ");

/**
 * One surface on a leg's page: opened and closed on the held clock, the
 * transcript read at each fraction against how it stood before. `thrown`
 * is what the page threw or logged as an error meanwhile.
 */
async function measure(
  kit: Kit,
  page: Page,
  clock: SurfaceClock,
  surface: Surface,
  what: string,
  thrown: string[]
): Promise<void> {
  const before = await page.evaluate(reading, LOG);
  if (!before) {
    kit.check(`${what}: the transcript is there`, false);
    return;
  }
  const within = await surface.within(page);
  const opened = await clock.catchRuns(() => surface.open(page), within);
  const openClock = clock.oneClock();
  const openFaults = await through(page, clock, before);
  const closed = await clock.catchRuns(() => surface.close(page), within);
  const closeClock = clock.oneClock();
  const closeFaults = await through(page, clock, before);
  const faults = [
    ...openFaults.map((one) => `open ${one}`),
    ...closeFaults.map((one) => `close ${one}`),
  ];
  kit.check(
    `${what}: the transcript's box, scrollTop and last row stand still through its open and its close (0, ¼, ½, ¾, 1, settled)`,
    faults.length === 0,
    faults.slice(0, 6).join("; ") || `last row ${before.last?.id ?? "none"}`
  );
  const said = `open ${runsOf(opened)}; close ${runsOf(closed)}`;
  const clockFaults = [...openClock, ...closeClock];
  if (surface.staged) {
    kit.note(`${what}: staged, not one clock: ${surface.staged} (${said})`);
  } else {
    kit.check(
      `${what}: its open and its close each run on one clock`,
      clockFaults.length === 0,
      clockFaults.slice(0, 4).join("; ") || said
    );
  }
  kit.check(
    `${what}: the page throws nothing through it`,
    thrown.length === 0,
    thrown.slice(0, 2).join(" | ")
  );
}

/** The surfaces this run reads: every one, or those `LAYERS_SURFACES` names. */
const surfacesRead = (): Surface[] => {
  const parts = process.env.LAYERS_SURFACES?.split(",") ?? [];
  return parts.length === 0
    ? SURFACES
    : SURFACES.filter((one) => parts.some((part) => one.name.includes(part)));
};

/**
 * With `LAYERS_TRACE_RO=1`: every ResizeObserver delivery, with the box it
 * reported and where its observer was made, and on a "ResizeObserver loop"
 * error the deliveries of the 50ms before it, logged as `RO-TRACE …`. What
 * names the observer that resized a box inside its own delivery.
 */
function traceObservers(): void {
  const Native = window.ResizeObserver;
  const log: { at: number; made: string; boxes: string[] }[] = [];
  const box = (el: Element) =>
    `${el.tagName.toLowerCase()}${el.getAttribute("data-slot") ? `[${el.getAttribute("data-slot")}]` : ""}.${String(el.getAttribute("class") ?? "").slice(0, 40)}`;
  window.ResizeObserver = class extends Native {
    constructor(callback: ResizeObserverCallback) {
      const made = (new Error("where this observer was made").stack ?? "")
        .split("\n")
        .slice(1, 4)
        .join(" < ");
      super((entries, observer) => {
        log.push({
          at: performance.now(),
          made,
          boxes: entries.map(
            (entry) =>
              `${box(entry.target)} ${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`
          ),
        });
        if (log.length > 300) {
          log.shift();
        }
        callback(entries, observer);
      });
    }
  };
  addEventListener("error", (event: ErrorEvent) => {
    if (String(event.message).includes("ResizeObserver loop")) {
      // What was left undelivered is delivered in the next frame: the
      // deliveries just after the error name it.
      const from = log.length;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          console.warn(
            `RO-TRACE after ${JSON.stringify(
              log
                .slice(from, from + 10)
                .map((one) => ({ ...one, boxes: one.boxes.slice(0, 6) }))
            )}`
          );
        })
      );
    }
  });
}

/**
 * The shelf and the plan rise from the same row to the same place: they
 * stand one at a time (composer-layer). The plan opened, then the shelf:
 * the shelf alone; then the plan again: the plan alone.
 */
async function oneAtATime(kit: Kit, page: Page, name: string): Promise<void> {
  const opener = (await visible(page, MORE)) ? MORE : FAILED;
  if (!((await visible(page, RING)) && (await visible(page, opener)))) {
    kit.note(
      `${name} · one layer at a time: not here (no plan ring or no shelf chip)`
    );
    return;
  }
  const standing = () =>
    page.evaluate(() => ({
      plan: document.querySelectorAll('section[data-slot="plan"]').length,
      shelf: document.querySelectorAll('section[data-slot="shelf"]').length,
    }));
  await page.locator(RING).click();
  await settle(page, 500);
  await page.locator(opener).first().click();
  await settle(page, 500);
  const shelfOver = await standing();
  await page.locator(RING).click();
  await settle(page, 500);
  const planOver = await standing();
  await page.locator(RING).click();
  await settle(page, 500);
  kit.check(
    `${name} · one layer at a time: the shelf opened over the plan shuts it, and the plan opened over the shelf shuts that`,
    shelfOver.plan === 0 &&
      shelfOver.shelf === 1 &&
      planOver.plan === 1 &&
      planOver.shelf === 0,
    JSON.stringify({ shelfOver, planOver })
  );
}

async function leg(kit: Kit, base: string, at: Leg): Promise<void> {
  const name = `${at.engine} ${at.width} · ${at.count} delegates · ${at.place}`;
  const page = await kit.page(at.view, { engine: at.engine });
  if (process.env.LAYERS_TRACE_RO === "1") {
    await page.addInitScript(traceObservers);
    page.on("console", (line) => {
      if (line.text().startsWith("RO-TRACE")) {
        kit.note(`${name}: ${line.text().slice(0, 3000)}`);
      }
    });
  }
  await open(page, `${base}${BENCH}?case=${at.count}`, LOG, 120_000);
  await page.waitForSelector(`${LOG} [data-message]`, { timeout: 30_000 });
  await settle(page, 800);
  const clock =
    at.engine === "chromium" ? await protocolClock(page) : waapiClock(page);
  // What the page threw while a surface opened and closed: that surface's
  // failure, quoted, never a transcript that silently went. Uncaught
  // exceptions only: the bench has no hub, and the client's own reads of it
  // (work items, delegate events) log their 503s whatever is open.
  const thrown: string[] = [];
  page.on("pageerror", (error) => {
    // WebKit hands some errors over with an empty stack: the name and
    // message always go first.
    thrown.push(
      `${error.name}: ${error.message} ${error.stack ?? ""}`.slice(0, 600)
    );
  });
  if (process.env.LAYERS_SURFACES === undefined) {
    try {
      await place(page, at.place);
      await oneAtATime(kit, page, name);
    } catch (error) {
      kit.check(
        `${name} · one layer at a time: runs`,
        false,
        String(error).split("\n")[0]
      );
    }
  }
  for (const surface of surfacesRead()) {
    const what = `${name} · ${surface.name}`;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one surface at a time, on one page
      await place(page, at.place);
      // What the spec's own jump set off is not the surface's: counted from here.
      thrown.length = 0;
      const absent = await surface.present(page);
      if (absent) {
        kit.note(`${what}: not here (${absent})`);
      } else {
        await measure(kit, page, clock, surface, what, thrown);
      }
    } catch (error) {
      kit.check(
        `${what}: runs`,
        false,
        [String(error).split("\n")[0], ...thrown.slice(0, 2)].join(" | ")
      );
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
  // The jump brings rows virtua has only estimated into its range: it
  // measures them, the range grows, more mount (inokawa/virtua#470), and the
  // view settles over several frames. "Before" is read once it reads the
  // same twice running, never mid-settle.
  let was = "";
  for (let tries = 0; tries < 50; tries += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one reading per frame pair, until two agree
    const now = JSON.stringify(await page.evaluate(reading, LOG));
    if (now === was) {
      return;
    }
    was = now;
    await frames(page);
    await page.waitForTimeout(100);
  }
}

const VIEW_AT: [View, number][] = [
  ["phone", 390],
  ["narrowDesk", 680],
  ["desk", 1440],
];

/** Every leg: engine × width × delegates × where the transcript stands. */
const LEGS: (Leg & { key: string })[] = (["chromium", "webkit"] as const)
  .flatMap((engine) =>
    VIEW_AT.map(([view, width]) => ({ engine, view, width }))
  )
  .flatMap((at) => (["4", "11"] as const).map((count) => ({ ...at, count })))
  .flatMap((at) =>
    (["end", "mid-history"] as const).map((where) => ({
      ...at,
      place: where,
      key: `${at.engine}-${at.width}-${at.count}-${where}`,
    }))
  );

const spec: Spec = {
  name: "composer-layers",
  async run(kit) {
    const base = await kit.bench();
    const only = process.env.LAYERS_ONLY?.split(",") ?? [];
    const legs = LEGS.filter(
      (at) => only.length === 0 || only.some((one) => at.key.includes(one))
    );
    for (const at of legs) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one leg at a time
        await leg(kit, base, at);
      } catch (error) {
        kit.check(`${at.key}: runs`, false, String(error).split("\n")[0]);
      }
    }
  },
};
export default spec;
