/**
 * Nothing that comes out of the composer moves the transcript (owner: "WHY
 * WOULD ANYTHING THAT COMES OUT OF THE COMPOSER EVEN MOVE THE TRANSCRIPT").
 * On the delegate tray's bench (the real SessionPane and the composer lent
 * to it), with four delegates (one failed) and with eleven (three failed):
 *
 *   bun scripts/probe-kit/run.ts web composer-layers
 *
 * Each surface the composer owns is opened and closed while its runs are
 * held and seeked through 0, ¼, ½, ¾ and 1 (kit.ts `readMotion`: Chromium's
 * DevTools Animation domain, the page's own held clock in WebKit), and read
 * again once it has settled. At every one of those, the
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
 *
 * The session's mode picker, on the same widths and engines (legs
 * `mode-picker-<engine>-<width>`), from the details card's chips over the
 * conversation (the bench's `?details`): its effort chip, then its mode chip
 * (the surface glides, its height tweened); Full Send asked, Cancel, asked
 * again, and its yes. At every point of each held clock, the transcript,
 * its first and last rows in view, the composer, the card, the chip and
 * every scroll on the page stand where they stood; the picker keeps the
 * width its rows set (±0.5px) inside the viewport; the question's height
 * is one run, the picker's edge moving with it (under its cap, its last row
 * as far from its edge as at rest; at its cap, it scrolls inside itself).
 */
import type { Page } from "playwright-core";
import {
  COMPOSER,
  type Engine,
  frames,
  type Kit,
  type MotionRead,
  type MotionRun,
  open,
  readMotion,
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

/**
 * A control's colour easing to its state (a button's hover ink) is that
 * control's feedback, not the surface's motion: it never stands on the
 * surface's clock. Nor does the hover ghost showing under the pointer
 * (components/ui/highlight, `--hl-*`): the press that asked put the pointer
 * on a row.
 */
const COLOUR = /(^|-)color$|^fill$|^stroke$|^--hl-/;

/**
 * A control's own answer to being pressed (a button's scale on `:active`),
 * as its colour, is that control's, not the surface's: a transition on an
 * element the read names a button or a link (kit.ts `MotionRun.target`).
 */
const PRESSED = /^(button|a)(\[|$)/;

/** The surface's own runs of a read: none of a control's feedback (its colour, its press). */
const surfaceRuns = (runs: readonly MotionRun[]): MotionRun[] =>
  runs.filter(
    (one) =>
      !(
        one.type === "CSSTransition" &&
        (COLOUR.test(one.name) || PRESSED.test(one.target))
      )
  );

/** A run in words: its kind, name, element, start, length and curve. */
const said = (one: MotionRun): string =>
  `${one.type} ${one.name} on ${one.target} ${one.start ?? "no start"}+${Math.round(one.end)}ms ${one.easing}`;

/**
 * One clock: every run shares the first's start time, length and easing.
 * A fault per run off it, or with no start time to compare.
 */
function oneClock(runs: readonly MotionRun[]): string[] {
  const [first] = runs;
  if (!first) {
    return ["no caught run"];
  }
  return runs.flatMap((one) =>
    one.start === null ||
    first.start === null ||
    Math.abs(one.start - first.start) > 0.5 ||
    Math.abs(one.end - first.end) > 0.5 ||
    one.easing !== first.easing
      ? [`${said(one)} against ${said(first)}`]
      : []
  );
}

/**
 * Opens or closes a surface on the held clock (kit.ts `readMotion`), the
 * transcript read at every fraction; throws, saying how the surface stands
 * and every run on it, where the action started no run inside `within`.
 */
async function held(
  page: Page,
  action: () => Promise<unknown>,
  within: string
): Promise<MotionRead<Reading | null>> {
  const motion = await readMotion(page, action, within, {
    fractions: FRACTIONS,
    read: () => page.evaluate(reading, LOG),
  });
  if (motion.runs.length === 0) {
    // Whether the surface is there, and every run on it as it stands:
    // an entrance the engine never ran, or one the read missed.
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
      `no animation started inside ${within} (read by ${motion.by}): ${JSON.stringify(there)}`
    );
  }
  return motion;
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

/** The transcript at every fraction of the clock, and settled, against `before`; the faults, in words. */
async function through(
  page: Page,
  motion: MotionRead<Reading | null>,
  before: Reading
): Promise<string[]> {
  const faults: string[] = [];
  for (const { fraction, value } of motion.at) {
    const diff = differs(before, value);
    if (diff) {
      faults.push(`${fraction * 100}%: ${diff}`);
    }
  }
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

/** The runs a read held, in words: each kind, length and easing once. */
const runsOf = (list: readonly MotionRun[]): string =>
  [
    ...new Set(
      list.map(
        (one) =>
          `${one.type} ${one.name} ${Math.round(one.end)}ms ${one.easing}`
      )
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
  const opening = await held(page, () => surface.open(page), within);
  const openFaults = await through(page, opening, before);
  const closing = await held(page, () => surface.close(page), within);
  const closeFaults = await through(page, closing, before);
  const faults = [
    ...openFaults.map((one) => `open ${one}`),
    ...closeFaults.map((one) => `close ${one}`),
  ];
  kit.check(
    `${what}: the transcript's box, scrollTop and last row stand still through its open and its close (0, ¼, ½, ¾, 1, settled)`,
    faults.length === 0,
    faults.slice(0, 6).join("; ") || `last row ${before.last?.id ?? "none"}`
  );
  const opened = surfaceRuns(opening.runs);
  const closed = surfaceRuns(closing.runs);
  const runs = `open ${runsOf(opened)}; close ${runsOf(closed)} (read by ${opening.by})`;
  const clockFaults = [...oneClock(opened), ...oneClock(closed)];
  if (surface.staged) {
    kit.note(`${what}: staged, not one clock: ${surface.staged} (${runs})`);
  } else {
    kit.check(
      `${what}: its open and its close each run on one clock`,
      clockFaults.length === 0,
      clockFaults.slice(0, 4).join("; ") || runs
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
  const count = () => ({
    plan: document.querySelectorAll('section[data-slot="plan"]').length,
    shelf: document.querySelectorAll('section[data-slot="shelf"]').length,
  });
  // Once the one that gave way has played its exit and gone: what is
  // asserted is that it closes, never how fast an engine plays it.
  const standing = async (alone: "plan" | "shelf") => {
    await page
      .waitForFunction(
        (one) => {
          const plan = document.querySelectorAll(
            'section[data-slot="plan"]'
          ).length;
          const shelf = document.querySelectorAll(
            'section[data-slot="shelf"]'
          ).length;
          return one === "plan" ? shelf === 0 : plan === 0;
        },
        alone,
        { timeout: 3000 }
      )
      .catch(() => undefined);
    return page.evaluate(count);
  };
  await page.locator(RING).click();
  await settle(page, 500);
  await page.locator(opener).first().click();
  await settle(page, 500);
  const shelfOver = await standing("shelf");
  await page.locator(RING).click();
  await settle(page, 500);
  const planOver = await standing("plan");
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
      const absent = await surface.present(page);
      // What the spec's own setting up set off (its jump, a scroll into the
      // parked room: virtua's measure-and-mount, inokawa/virtua#470) is not
      // the surface's: counted from here.
      thrown.length = 0;
      if (absent) {
        kit.note(`${what}: not here (${absent})`);
      } else {
        await measure(kit, page, surface, what, thrown);
      }
    } catch (error) {
      kit.check(
        `${what}: runs`,
        false,
        [String(error).split("\n")[0], ...thrown.slice(0, 2)].join(" | ")
      );
      await page.keyboard.press("Escape").catch(() => undefined);
      await settle(page, 400).catch(() => undefined);
    }
  }
  await page.close();
}

/**
 * The session's mode picker (owner: "choosing this mode layout shifts the
 * whole screen and stretches the popover"): the details card's mode chip
 * (`?details`, the real SessionDetails on Bypass) opens the picker; Full
 * Send asks its question inside it.
 */
const PICKER_CHIP =
  '[data-slot="details-card"] button[aria-label^="Permission mode"]';
const PICKER = "#details-permission-popover";
const PICKER_ASK = `${PICKER} [data-ask="fullSend"]`;

/** Where everything outside the picker stands, and the picker's own box. */
interface Stage {
  /** Each box outside the popover, by name. */
  boxes: Record<string, Box | null>;
  /** The picker's height cap (its `max-height`), px: past it, it scrolls inside itself. */
  cap: number | null;
  picker: (Box & { right: number }) | null;
  /** Every element scrolled from its origin, and the window: what a scroll moved. */
  scrolled: Record<string, [number, number]>;
  /**
   * From the content's last row (the question, once asked) to the picker's
   * bottom edge: the same at every point of a motion when the edge and the
   * row it opens move on one clock.
   */
  tail: number | null;
  viewport: number;
}

function stage([log, picker]: readonly [string, string]): Stage {
  const at = (el: Element | null): Box | null => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  };
  const scroller = document.querySelector<HTMLElement>(log);
  const view = scroller?.getBoundingClientRect();
  const shown = [
    ...(scroller?.querySelectorAll<HTMLElement>("[data-message]") ?? []),
  ].filter((row) => {
    const r = row.getBoundingClientRect();
    return view && r.height > 0 && r.top < view.bottom && r.bottom > view.top;
  });
  const scrolled: Stage["scrolled"] = {
    window: [window.scrollX, window.scrollY],
  };
  let n = 0;
  for (const el of document.querySelectorAll<HTMLElement>("*")) {
    n += 1;
    if ((el.scrollTop !== 0 || el.scrollLeft !== 0) && !el.closest(picker)) {
      const name = `${el.tagName.toLowerCase()}${el.dataset.slot ? `[${el.dataset.slot}]` : ""}#${n}`;
      scrolled[name] = [el.scrollLeft, el.scrollTop];
    }
  }
  const surface = document.querySelector(picker);
  const box = at(surface);
  const last = surface?.firstElementChild?.lastElementChild;
  const tail =
    surface && last
      ? surface.getBoundingClientRect().bottom -
        last.getBoundingClientRect().bottom
      : null;
  return {
    tail,
    cap: surface
      ? Number.parseFloat(getComputedStyle(surface).maxHeight) || null
      : null,
    boxes: {
      transcript: at(scroller),
      "first visible message": at(shown[0] ?? null),
      "last visible message": at(shown.at(-1) ?? null),
      composer: at(document.querySelector('form[data-slot="cin"]')),
      "details card": at(document.querySelector('[data-slot="details-card"]')),
      "mode chip": at(
        document.querySelector(
          '[data-slot="details-card"] button[aria-label^="Permission mode"]'
        )
      ),
    },
    scrolled,
    picker: box ? { ...box, right: box.left + box.width } : null,
    viewport: document.documentElement.clientWidth,
  };
}

/** How each box outside the picker moved from `then` to `now`, in words. */
function boxesMoved(then: Stage, now: Stage): string[] {
  const out: string[] = [];
  for (const [name, was] of Object.entries(then.boxes)) {
    const is = now.boxes[name];
    if (!(was && is)) {
      if (was !== is) {
        out.push(`${name} ${was ? "gone" : "came"}`);
      }
      continue;
    }
    for (const key of ["top", "left", "width", "height"] as const) {
      if (Math.abs(was[key] - is[key]) > SAME) {
        out.push(`${name}.${key} ${was[key]}→${is[key]}`);
      }
    }
  }
  return out;
}

/** What scrolled outside the picker from `then` to `now`, in words. */
function scrollsMoved(then: Stage, now: Stage): string[] {
  const names = new Set([
    ...Object.keys(then.scrolled),
    ...Object.keys(now.scrolled),
  ]);
  return [...names].flatMap((name) => {
    const [x0, y0] = then.scrolled[name] ?? [0, 0];
    const [x1, y1] = now.scrolled[name] ?? [0, 0];
    return Math.abs(x0 - x1) > SAME || Math.abs(y0 - y1) > SAME
      ? [`${name} scrolled ${x0},${y0}→${x1},${y1}`]
      : [];
  });
}

/** How the page outside the picker moved from `then` to `now`, in words; empty when still. */
const moved = (then: Stage, now: Stage): string =>
  [...boxesMoved(then, now), ...scrollsMoved(then, now)].join(", ");

/** The picker's width against what it was, and its edges against the viewport, in words. */
function pickerHeld(then: Stage, now: Stage): string {
  if (!(then.picker && now.picker)) {
    return "the picker is gone";
  }
  const out: string[] = [];
  if (Math.abs(then.picker.width - now.picker.width) > 0.5) {
    out.push(`width ${then.picker.width}→${now.picker.width}`);
  }
  if (now.picker.left < -0.5 || now.picker.right > now.viewport + 0.5) {
    out.push(
      `edges ${now.picker.left}…${now.picker.right} outside 0…${now.viewport}`
    );
  }
  return out.join(", ");
}

const EFFORT_CHIP = '[data-slot="details-card"] button[aria-label^="Effort"]';

/**
 * The card's effort chip opened, then its mode chip: the one surface glides
 * to its sibling (NsPopoverGroup), its height tweened from the effort's to
 * the picker's (motion/morph), never a jump, and nothing outside it moves.
 * The surface closes again after.
 */
async function glide(kit: Kit, page: Page, name: string): Promise<void> {
  if (!(await visible(page, EFFORT_CHIP))) {
    kit.check(`${name} · glide: the card has its effort chip`, false, "none");
    return;
  }
  await page.locator(EFFORT_CHIP).click();
  await page.waitForSelector("#details-effort-popover");
  await settle(page, 600);
  const read = () => page.evaluate(stage, [LOG, "[data-ns-pop]"] as const);
  const before = await read();
  const motion = await readMotion(
    page,
    () => page.locator(PICKER_CHIP).click(),
    "[data-ns-pop]",
    { fractions: FRACTIONS, read }
  );
  await settle(page, 500);
  const after = await read();
  const heights = motion.at.map(
    ({ value }) => value.picker?.height ?? Number.NaN
  );
  const faults = motion.at.flatMap(({ fraction, value }) => {
    const shift = moved(before, value);
    return shift ? [`${fraction * 100}%: ${shift}`] : [];
  });
  const from = before.picker?.height ?? Number.NaN;
  const to = after.picker?.height ?? Number.NaN;
  const [h0, , h50, , h100] = heights;
  const tweened =
    Math.abs(h0 - from) <= 0.5 &&
    Math.abs(h100 - to) <= 0.5 &&
    Math.abs(to - from) > 1 &&
    Math.min(from, to) + 0.5 < h50 &&
    h50 < Math.max(from, to) - 0.5;
  kit.check(
    `${name} · glide from the effort chip to the mode chip: the surface's height tweens from the one to the other (between them at ½), never a jump`,
    tweened,
    `${from.toFixed(1)} → ${heights.map((one) => one.toFixed(1)).join(", ")} → ${to.toFixed(1)}; ${runsOf(surfaceRuns(motion.runs))} (read by ${motion.by})`
  );
  kit.check(
    `${name} · glide: nothing outside the surface moves (0, ¼, ½, ¾, 1)`,
    faults.length === 0,
    faults.slice(0, 3).join("; ") || "every box where it was"
  );
  await page.keyboard.press("Escape");
  await settle(page, 600);
}

/**
 * One leg of the mode picker: open it, then Full Send's question in it, its
 * Cancel, the question again and its yes. Each step on the held clock where
 * it moves (0, ¼, ½, ¾, 1, settled): nothing outside the picker moves, the
 * picker keeps its width inside the viewport, its height runs on one clock.
 */
async function modePicker(
  kit: Kit,
  base: string,
  engine: Engine,
  view: View,
  width: number
): Promise<void> {
  const name = `${engine} ${width} · mode picker`;
  const page = await kit.page(view, { engine });
  const thrown: string[] = [];
  page.on("pageerror", (error) => {
    thrown.push(`${error.name}: ${error.message}`.slice(0, 400));
  });
  await open(page, `${base}${BENCH}?case=4&details`, LOG, 120_000);
  await page.waitForSelector(`${LOG} [data-message]`, { timeout: 30_000 });
  const chip = await page
    .waitForSelector(PICKER_CHIP, { timeout: 30_000 })
    .catch(() => null);
  if (!chip) {
    const card = await page.evaluate(
      () =>
        document
          .querySelector('[data-slot="details-card"] [data-slot="settings"]')
          ?.outerHTML.slice(0, 600) ?? "no details card"
    );
    kit.check(`${name}: the details card's mode chip opens`, false, card);
    await page.close();
    return;
  }
  await place(page, "end");
  await glide(kit, page, name);
  await page.locator(PICKER_CHIP).click();
  await page.waitForSelector(`${PICKER} [data-perm="fullSend"]`);
  await settle(page, 600);
  const read = () => page.evaluate(stage, [LOG, PICKER] as const);
  const before = await read();
  kit.check(
    `${name}: the picker opens inside the viewport`,
    pickerHeld(before, before) === "",
    `${before.picker?.left}…${before.picker?.right} of ${before.viewport}, ${before.picker?.width}px wide`
  );

  /** One step on the held clock: its runs, what moved at each fraction and settled. */
  const step = async (what: string, action: () => Promise<unknown>) => {
    const motion = await readMotion(page, action, PICKER, {
      fractions: FRACTIONS,
      read,
    });
    const runs = surfaceRuns(motion.runs);
    const clockFaults =
      runs.length === 0 ? ["no run started in the picker"] : oneClock(runs);
    const faults: string[] = [];
    const heights: string[] = [];
    const edges: string[] = [];
    for (const { fraction: f, value: now } of motion.at) {
      heights.push(`${f * 100}% ${now.picker?.height.toFixed(1)}`);
      // At its cap it scrolls inside itself; under it, its edge stands
      // where it stood at rest from its last row.
      const capped =
        now.picker !== null &&
        now.cap !== null &&
        now.picker.height >= now.cap - 0.5;
      const kept =
        capped ||
        (now.tail !== null &&
          before.tail !== null &&
          Math.abs(now.tail - before.tail) <= 0.5);
      edges.push(
        `${f * 100}% ${capped ? "at its cap" : now.tail?.toFixed(2)}${kept ? "" : " ✗"}`
      );
      const fault = [moved(before, now), pickerHeld(before, now)]
        .filter(Boolean)
        .join(", ");
      if (fault) {
        faults.push(`${f * 100}%: ${fault}`);
      }
    }
    await settle(page, 500);
    const settled = await read();
    const fault = [moved(before, settled), pickerHeld(before, settled)]
      .filter(Boolean)
      .join(", ");
    if (fault) {
      faults.push(`settled: ${fault}`);
    }
    kit.check(
      `${name} · ${what}: nothing outside the picker moves (transcript, its first and last rows, composer, card, chip, every scroll) and the picker keeps its width (±0.5px) inside the viewport (0, ¼, ½, ¾, 1, settled)`,
      faults.length === 0,
      faults.slice(0, 4).join("; ") ||
        `width ${settled.picker?.width.toFixed(1)} at ${settled.picker?.left.toFixed(1)}…${settled.picker?.right.toFixed(1)} of ${settled.viewport}; height ${heights.join(", ")}`
    );
    kit.check(
      `${name} · ${what}: the picker's height runs on one clock`,
      clockFaults.length === 0,
      clockFaults.slice(0, 4).join("; ") ||
        `${runsOf(runs)} (read by ${motion.by})`
    );
    kit.check(
      `${name} · ${what}: the picker's edge moves with the row it opens or folds, never clipping it or leaving room under it (under its cap its last row stands from its edge as at rest, ±0.5px, at 0, ¼, ½, ¾, 1)`,
      !edges.some((one) => one.endsWith("✗")),
      `at rest ${before.tail?.toFixed(2)}; ${edges.join(", ")}`
    );
    return settled;
  };

  const asked = await step("Full Send asked", () =>
    page.locator(`${PICKER} [data-perm="fullSend"]`).click()
  );
  const ask = await page.evaluate(
    ([sel, surface]) => {
      const el = document.querySelector<HTMLElement>(sel);
      const box = document.querySelector<HTMLElement>(surface);
      return {
        ask: el?.getBoundingClientRect().height ?? 0,
        surface: box?.clientHeight ?? 0,
        scroll: box?.scrollHeight ?? 0,
        viewport: window.innerHeight,
      };
    },
    [PICKER_ASK, PICKER] as const
  );
  kit.note(
    `${name}: the question stands ${ask.ask.toFixed(1)}px tall in a picker ${asked.picker?.width.toFixed(1)}px wide; the picker shows ${ask.surface}px of its ${ask.scroll}px (viewport ${ask.viewport}px tall)${ask.scroll > ask.surface ? ": it scrolls inside itself" : ""}`
  );
  await step("Cancel", () =>
    page.locator(`${PICKER_ASK} [data-ask-cancel]`).click()
  );
  await step("Full Send asked again", () =>
    page.locator(`${PICKER} [data-perm="fullSend"]`).click()
  );
  // The yes closes the picker: what stands outside it is read settled.
  await page
    .locator(`${PICKER_ASK} button`, { hasText: "Switch to Full Send" })
    .click();
  await settle(page, 800);
  const after = await read();
  // The chip now names Full Send: its own width follows its label; where it
  // stands does not move.
  const chipBefore = before.boxes["mode chip"];
  const chipAfter = after.boxes["mode chip"];
  before.boxes["mode chip"] = chipBefore && { ...chipBefore, width: 0 };
  after.boxes["mode chip"] = chipAfter && { ...chipAfter, width: 0 };
  const shift = moved(before, after);
  kit.check(
    `${name} · Switch to Full Send: nothing outside the picker moves as it closes on the yes`,
    shift === "" && after.picker === null,
    shift || "the picker closed; every box where it was"
  );
  kit.check(
    `${name}: the page throws nothing through it`,
    thrown.length === 0,
    thrown.slice(0, 2).join(" | ")
  );
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
    for (const engine of ["chromium", "webkit"] as const) {
      for (const [view, width] of VIEW_AT) {
        const key = `mode-picker-${engine}-${width}`;
        if (only.length > 0 && !only.some((one) => key.includes(one))) {
          continue;
        }
        try {
          // biome-ignore lint/performance/noAwaitInLoops: one leg at a time
          await modePicker(kit, base, engine, view, width);
        } catch (error) {
          kit.check(
            `${key}: runs`,
            false,
            String(error).split("\n").slice(0, 3).join(" ")
          );
        }
      }
    }
  },
};
export default spec;
