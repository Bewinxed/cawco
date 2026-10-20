/**
 * The artifact surface lays itself out in one pass per frame: opening an
 * artifact and resizing it posts nothing to `/api/dashboard-errors` and logs
 * no "ResizeObserver loop" error. No ResizeObserver callback on it changes
 * the size of what it observes inside the same frame's delivery (the head's
 * fit, SideSurface.svelte, once wrote the controls' standing from its
 * callback and resized the very boxes it watched).
 *
 * On a scratch fleet (real hub, agent and sessiond; Claude Code against the
 * mock model), a page artifact with an ask made by a session, in light and
 * in dark (a thread showing its Caw's, ThreadPane, is
 * artifact-resize-loop-thread, which runs on the host):
 *
 * - Opened on its own tab (`/artifact/<id>`) and beside its session
 *   (`/session/<id>`) at desk 1440, and on its own tab at phone 390. Each
 *   leg opens the page, then sweeps the viewport narrower and back in small
 *   steps, so the head moves controls into More and back out again (beside
 *   the session and on the phone, More is read standing at some widths and
 *   gone at both ends: the sweep crossed its threshold both ways; the own
 *   tab at desk has room for every control at every width).
 * - A pin's card open beside the session at desk 1440, with words in its
 *   thread, while the window's height sweeps down and back: the card is
 *   squeezed (its head and foot alone outgrow it, PinCard `squeezed`) at
 *   some heights and not at both ends.
 * - Beside the session in a fine pointer's desk window 860 wide, where the
 *   pane is under 900px and the preview is the sheet on the composer
 *   (layoutPolicy.sideDrawer), opened from its row in the navigation the
 *   bar's burger opens (the session runs in a project's checkout, and the
 *   navigation lists it under the project), so the session's pane mounts
 *   with its preview already open: every frame
 *   painted from the one the split first stands in is read (a task posted
 *   from each frame's callbacks runs once that frame is painted), and the
 *   first of them shows the sheet with its preview, and none shows the
 *   preview beside the conversation.
 *
 * On opening and over every sweep, the page sent the hub no error report
 * and logged no ResizeObserver loop. A desk page draws its scrollbars as a
 * desk's Chromium does (the kit's `scrollbars`): the card starting to scroll
 * takes their width from what it holds.
 *
 * A loop is named in the check that fails: the callbacks of its frame in
 * order (`loopFrames`: which observer, which boxes at which depth), and the
 * boxes delivered in the frame after it (`heldBack`), the notifications it
 * held back.
 *
 *   bun scripts/probe-kit/run.ts artifact-resize-loop
 */
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  type Kit,
  type KitFleet,
  open,
  type Spec,
  settle,
  type Theme,
} from "../kit";

const CREATE = "mcp__cawco__artifact_create";
const COMMAND = /PROBE-CALL:(\d+)/g;
/** The id in artifact_create's answer, as the tool result carries it. */
const ANSWERED_ID = /"id":"([0-9a-f-]{36})"/;
const LOOP = /ResizeObserver loop/;

const PAGE = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Chip wraps</title></head>
<body>
  <main>
    <h1>Lay out the chip wraps</h1>
    <p>Three chips that wrap onto a second line on a narrow pane.</p>
  </main>
</body>
</html>`;

const asks = new Map<string, { input: object; name: string }>();
/** Each request a session's turn sent the model, its whole text, in order. */
const requests: string[] = [];
/** The requests the model was sent so far ({@link requests}). */
export const modelRequests = (): readonly string[] => requests;
const issued = new Set<string>();
const answered = new Map<string, string>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });

/** Calls `name` with `input`, loading it through ToolSearch first when it is deferred. */
const callTool = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  if (!request.toolNames.includes("ToolSearch")) {
    return text(`${name} is not offered`);
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "ToolSearch",
      input: { query: `select:${name}`, max_results: 1 },
    },
  };
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  requests.push(request.all);
  const marker = [...request.all.matchAll(COMMAND)].at(-1)?.[1];
  const ask = marker ? asks.get(marker) : undefined;
  if (!(marker && ask)) {
    return text("ok");
  }
  if (issued.has(marker)) {
    if (!answered.has(marker)) {
      answered.set(marker, request.last);
    }
    return text("done");
  }
  const reply = callTool(request, ask.name, ask.input);
  if (reply.tool?.name === ask.name) {
    issued.add(marker);
  }
  return reply;
};

/** One frame as painted, from the one the split first stands in. */
interface Painted {
  /**
   * The preview's card stands in the split's side pane, at a width: mounted
   * beside the conversation (a second preview of its own), however wide the
   * pane stands.
   */
  beside: boolean;
  /**
   * The top of the composer standing over the conversation, as drawn (its
   * parts with a box that paint, as SideSheet's `drawnTop` reads them):
   * "none" while the conversation has no composer, "undrawn" while none of
   * its parts paints.
   */
  composerTop: number | "none" | "undrawn";
  /** The host's foot: the sheet's floor, where it stands. */
  floor: number | null;
  /** The preview's card in the sheet on the composer. */
  sheet: boolean;
  /** The sheet's host stands (SideSheet is mounted), and its height. */
  sheetHost: number | null;
  /** The split stands open: the conversation's pane chose the desk's layout (Split `open`). */
  splitOpen: boolean;
}

declare global {
  interface Window {
    /** Each box a ResizeObserver was handed in the delivery after a loop error: the notifications that loop held back. */
    __heldBack?: string[];
    /** Each loop's frame, its callbacks in the order they ran: the observer (by the first box it watched), and each box with its depth. */
    __loopFrames?: string[][];
    /** Every frame painted from the one the split first stands in. */
    __painted?: Painted[];
    /** The pane (`data-pane`, its tab's id) whose split the frames are read in; none, nothing is read. */
    __paintPane?: string;
    /** The frame as it stands now, read as each painted one is; none before the pane's split stands. */
    __readPaint?: () => Painted | null;
  }
}

/**
 * Reads each frame as it was painted: a message posted from the frame's
 * callbacks is a task, which runs once that frame's rendering (its
 * deliveries and what they changed included) is done. Once `__paintPane`
 * names a pane, from the first frame that pane's split stands in, up to 600
 * frames. Runs in the page before its own scripts.
 */
function paintedFrames() {
  const painted: Painted[] = [];
  window.__painted = painted;
  /** The drawn top of the composer over `split`'s conversation. */
  const drawnTop = (split: Element): Painted["composerTop"] => {
    const composer = split
      .closest(".leaf")
      ?.querySelector<HTMLElement>(":scope > .dock .lift")?.parentElement;
    if (!composer) {
      return "none";
    }
    let top = Number.POSITIVE_INFINITY;
    for (const part of composer.querySelectorAll<HTMLElement>(
      ":scope > .composer, .ask, .lift .kit-tray-chip, .suggest:has(.track), .progress-slot > *, .perch"
    )) {
      const box = part.getBoundingClientRect();
      if (
        box.height > 0 &&
        part.checkVisibility({
          opacityProperty: true,
          visibilityProperty: true,
        })
      ) {
        top = Math.min(top, box.top);
      }
    }
    return Number.isFinite(top) ? top : "undrawn";
  };
  const read = (): Painted | null => {
    const pane = window.__paintPane
      ? document.querySelector(
          `[data-slot="pane"][data-pane="${CSS.escape(window.__paintPane)}"]`
        )
      : null;
    const split = pane?.querySelector('[data-slot="side-split"]');
    if (!split) {
      return null;
    }
    const beside = split.querySelector(
      '[data-side-pane] [data-slot="side-card"]'
    );
    const host = document.querySelector<HTMLElement>(
      '[data-slot="preview-sheet-host"]'
    );
    const hostBox = host?.getBoundingClientRect();
    return {
      splitOpen: split.classList.contains("open"),
      sheetHost: hostBox ? hostBox.height : null,
      floor: hostBox ? hostBox.bottom : null,
      composerTop: drawnTop(split),
      beside: !!beside && beside.getBoundingClientRect().width > 0,
      sheet: !!document.querySelector(
        '[data-preview-sheet] [data-slot="side-card"]'
      ),
    };
  };
  window.__readPaint = read;
  const channel = new MessageChannel();
  channel.port1.onmessage = () => {
    const frame = read();
    if (frame) {
      painted.push(frame);
    }
  };
  const tick = () => {
    if (painted.length < 600) {
      channel.port2.postMessage(0);
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
}

/**
 * Names the observer that looped: every ResizeObserver's callback is heard.
 * Once the page raises "ResizeObserver loop", the callbacks of that frame are
 * kept in the order they ran (`__loopFrames`: which observer, which boxes at
 * which depth in the document), and the boxes delivered in the next frame
 * (`__heldBack`, the notifications the loop held back), each named by its
 * tag, classes and `data-slot`/`data-head-item`, so a red check says which
 * observer's write resized which box. Runs in the page before its own scripts.
 */
function heldBack() {
  const Platform = window.ResizeObserver;
  const held: string[] = [];
  const loops: string[][] = [];
  window.__heldBack = held;
  window.__loopFrames = loops;
  let after = false;
  const classes = (el: Element) =>
    [...el.classList]
      .filter((one) => !one.startsWith("svelte-"))
      .slice(0, 3)
      .join(".");
  const name = (el: Element) => {
    const slot =
      el.getAttribute("data-slot") ?? el.getAttribute("data-head-item");
    const cls = classes(el);
    const parent = el.parentElement;
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""}${slot ? `[${slot}]` : ""}${parent ? ` in ${parent.tagName.toLowerCase()}.${classes(parent)}` : ""}`;
  };
  const depth = (el: Element) => {
    let n = 0;
    for (let at: Element | null = el; at; at = at.parentElement) {
      n += 1;
    }
    return n;
  };
  /** This frame's callbacks so far, in order: cleared in each frame's callbacks, which run before its deliveries. */
  let frame: string[] = [];
  const tick = () => {
    frame = [];
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener(
    "error",
    (event) => {
      if (event.message.includes("ResizeObserver loop")) {
        loops.push(frame);
        after = true;
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            after = false;
          })
        );
      }
    },
    true
  );
  let made = 0;
  window.ResizeObserver = class extends Platform {
    #label = "";
    constructor(callback: ResizeObserverCallback) {
      made += 1;
      const id = made;
      super((entries, observer) => {
        frame.push(
          `#${id} (${this.#label}): ${entries.map((entry) => `d${depth(entry.target)} ${name(entry.target)}`).join(" | ")}`
        );
        if (after) {
          for (const entry of entries) {
            held.push(name(entry.target));
          }
        }
        callback(entries, observer);
      });
    }
    override observe(target: Element, options?: ResizeObserverOptions) {
      this.#label ||= name(target);
      super.observe(target, options);
    }
  };
}

/** What the page said went wrong: its reports to the hub (hooks.client.ts `report`) and its console's errors. */
function heard(page: Page) {
  const posts: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/dashboard-errors")) {
      posts.push(request.postData() ?? "");
    }
  });
  page.on("console", (line) => {
    if (line.type() === "error") {
      errors.push(line.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return { posts, errors };
}

/** Two of the browser's frames: every observer a resize woke has been delivered. */
const frames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

/** Whether the artifact head's More stands. */
const moreStands = (page: Page) =>
  page.evaluate(
    () =>
      !!document.querySelector(
        '[data-slot="side-card"] .side-head [data-slot="more"]'
      )
  );

/** Whether the open pin's card is squeezed: its thread keeps its height and the card scrolls (PinCard `squeezed`). */
/**
 * The open pin's card: squeezed (PinCard `squeezed`, its room `data-whole`),
 * and the width its own scrollbar takes from what it holds (its box less its
 * client width and its two 1px edges).
 */
const cardState = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('[data-slot="pin-card"]');
    return {
      squeezed: !!card?.querySelector("[data-whole]"),
      scrollbar: card ? card.offsetWidth - card.clientWidth - 2 : null,
    };
  });

/** The pane's Comment control, in the head or in More. */
const COMMENT =
  ':is([data-slot="preview-pane"], [data-side-surface-class~="preview-pane"]) button[aria-keyshortcuts=\'C\']';

/**
 * A pin dropped on the page's heading in Comment mode, and words written in
 * its thread: its card stays open, with a head, a thread and a foot.
 */
const dropPin = async (page: Page): Promise<void> => {
  await page.locator(COMMENT).first().focus();
  await page.keyboard.press("c");
  const frame = await (
    await page.locator('iframe[title="Preview"]').elementHandle()
  )?.contentFrame();
  if (!frame) {
    throw new Error("no preview frame to pin on");
  }
  await until(
    "the page's Comment mode on",
    () =>
      frame.evaluate(
        () =>
          document
            .querySelector("cawco-overlay")
            ?.shadowRoot?.querySelector(".layer")
            ?.classList.contains("comment") ?? false
      ),
    Boolean,
    5000
  );
  await settle(page, 300);
  const box = await frame.locator("h1").boundingBox();
  if (!box) {
    throw new Error("the page's heading has no box to pin");
  }
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  const card = page.locator('[data-slot="pin-card"]').first();
  await card.waitFor({ timeout: 5000 });
  await card
    .getByRole("textbox")
    .fill(
      "The chips wrap onto a second line too early: the third one drops while there is still room beside the second."
    );
  await card.getByRole("button", { name: "Reply" }).click();
  await page
    .locator('[data-slot="pin-card"] [data-slot="entry"]')
    .first()
    .waitFor({ timeout: 5000 });
  await settle(page, 300);
};

interface Step {
  height: number;
  width: number;
}

interface Leg {
  /** The sweep takes the head's controls into More and back: the artifact's own tab at desk has room for all of them at every width. */
  crosses: boolean;
  name: string;
  /** What is opened before the sweep (a pin's card). */
  open?: (page: Page) => Promise<void>;
  path: string;
  ready: string;
  /** The sweep squeezes the open pin's card and lets it go. */
  squeezes?: boolean;
  steps: Step[];
  theme: Theme;
  view: "desk" | "phone";
}

/** Each number from `from` to `to` in `step`, both ends included. */
const sweep = (from: number, to: number, step: number): number[] => {
  const out: number[] = [];
  const by = from > to ? -step : step;
  for (let at = from; by < 0 ? at > to : at < to; at += by) {
    out.push(at);
  }
  out.push(to);
  return out;
};

/** Each box the loops held back, with how many times. */
const tally = (boxes: string[]) =>
  Object.fromEntries(
    [...new Set(boxes)].map((box) => [
      box,
      boxes.filter((one) => one === box).length,
    ])
  );

/** A post as the hub was sent it, its message alone. */
const message = (post: string) => {
  try {
    return (JSON.parse(post) as { message?: string }).message ?? post;
  } catch {
    return post;
  }
};

/** What the page has said so far, to be read again past it. */
const mark = async (page: Page, said: ReturnType<typeof heard>) => ({
  posts: said.posts.length,
  errors: said.errors.length,
  held: await page.evaluate(() => window.__heldBack?.length ?? 0),
  loopFrames: await page.evaluate(() => window.__loopFrames?.length ?? 0),
});

/** Checks that nothing between `from` and `to` (marks) was sent to the hub or logged as a loop, naming any loop. */
const checkQuiet = async (
  kit: Kit,
  page: Page,
  said: ReturnType<typeof heard>,
  what: string,
  from: Awaited<ReturnType<typeof mark>>,
  to: Awaited<ReturnType<typeof mark>>,
  extra: object = {}
) => {
  const posts = said.posts.slice(from.posts, to.posts);
  const loops = said.errors
    .slice(from.errors, to.errors)
    .filter((line) => LOOP.test(line));
  kit.check(
    `${what} posts nothing to /api/dashboard-errors and logs no ResizeObserver loop`,
    posts.length === 0 && loops.length === 0,
    JSON.stringify({
      posts: posts.map(message),
      loops,
      ...extra,
      heldBack: tally(
        (await page.evaluate(() => window.__heldBack ?? [])).slice(
          from.held,
          to.held
        )
      ),
      loopFrames: (await page.evaluate(() => window.__loopFrames ?? [])).slice(
        from.loopFrames,
        to.loopFrames
      ),
    })
  );
};

export const runLeg = async (kit: Kit, base: string, leg: Leg) => {
  // A desk draws its scrollbars and a phone overlays them: a box that starts
  // or stops scrolling at desk narrows or widens what it holds.
  const page = await kit.page(leg.view, {
    theme: leg.theme,
    init: [heldBack],
    scrollbars: leg.view === "desk",
  });
  const said = heard(page);
  const start = await mark(page, said);
  await open(page, `${base}${leg.path}`, leg.ready);
  await page
    .frameLocator('iframe[title="Preview"]')
    .locator("h1")
    .waitFor({ timeout: 60_000 });
  await settle(page);
  await frames(page);
  if (leg.open) {
    await leg.open(page);
    await frames(page);
  }
  const opened = await mark(page, said);
  const [first] = leg.steps;
  const last = leg.steps.at(-1) ?? first;
  const moreAtStart = await moreStands(page);
  /** The steps More stood at, and the open card was squeezed at, as the sweep went. */
  const moreAt: Step[] = [];
  /** The open card at each step: squeezed, and its own scrollbar's width. */
  const cards: ({ step: Step } & Awaited<ReturnType<typeof cardState>>)[] = [];
  /** The steps a step to which the page sent a report at. */
  const postedAt: Step[] = [];
  for (const step of leg.steps) {
    const before = said.posts.length;
    // biome-ignore lint/performance/noAwaitInLoops: one size, laid out and delivered, before the next
    await page.setViewportSize(step);
    await frames(page);
    if (await moreStands(page)) {
      moreAt.push(step);
    }
    if (leg.squeezes) {
      cards.push({ step, ...(await cardState(page)) });
    }
    if (said.posts.length > before) {
      postedAt.push(step);
    }
  }
  await settle(page);
  await frames(page);
  const swept = await mark(page, said);
  const size = (step: Step) => `${step.width}×${step.height}`;
  const squeezedAt = cards.filter((card) => card.squeezed).map((c) => c.step);
  const scrollbarAt = cards
    .filter((card) => card.scrollbar)
    .map((card) => `${size(card.step)}:${card.scrollbar}px`);
  const least = leg.steps.reduce((a, b) =>
    b.width * b.height < a.width * a.height ? b : a
  );
  await checkQuiet(
    kit,
    page,
    said,
    `${leg.name}: opening the artifact${leg.open ? " and a pin's card" : ""}`,
    start,
    opened
  );
  await checkQuiet(
    kit,
    page,
    said,
    `${leg.name}: a resize sweep ${size(first)}→${size(least)}→${size(last)}`,
    opened,
    swept,
    { postedAt: postedAt.map(size) }
  );
  if (leg.squeezes) {
    kit.check(
      `${leg.name}: the sweep squeezed the open pin's card and let it go (squeezed at some sizes, at neither end)`,
      squeezedAt.length > 0 &&
        !squeezedAt.includes(first) &&
        !squeezedAt.includes(last),
      JSON.stringify({ squeezedAt: squeezedAt.map(size) })
    );
    kit.check(
      `${leg.name}: squeezed, the card scrolls and its scrollbar takes width from its head and foot (a desk's scrollbars drawn)`,
      scrollbarAt.length > 0,
      JSON.stringify({ scrollbarAt })
    );
  }
  if (!leg.crosses) {
    if (!leg.squeezes) {
      kit.note(
        `${leg.name}: the head held every control at every size (More stood at ${moreAt.length} of them)`
      );
    }
    await page.context().close();
    return;
  }
  kit.check(
    `${leg.name}: the sweep crossed the head's More threshold, both ways (More stood at some sizes, at neither end)`,
    moreAt.length > 0 &&
      !moreAtStart &&
      !moreAt.includes(first) &&
      !moreAt.includes(last),
    JSON.stringify({
      moreAtStart,
      moreFrom: moreAt[0] ? size(moreAt[0]) : null,
      moreTo: moreAt.at(-1) ? size(moreAt.at(-1) as Step) : null,
    })
  );
  await page.context().close();
};

/** A fine pointer's desk window under the side sheet's 900px line. */
const NARROW_DESK = { width: 860, height: 900 };

/**
 * In a fine pointer's desk window 860 wide, where the preview is the sheet on
 * the composer: the conversation opened as a person there opens it. The
 * board (`/`), then the navigation the bar's burger opens under the rail's
 * 900px line (Shell), where each project lists its conversations, a thread
 * with its Caw or a session, running or at rest (Sidebar): its row (`path`'s
 * link) stands there once the fleet's frame that lists it has come, and that
 * frame carries every session's preview, so the dashboard holds its preview
 * open. The row pressed, SvelteKit routes it in the page and the sheet goes
 * as it does, so the conversation's pane (`pane`, its tab's id) mounts with
 * the preview already open. The first frame painted with that pane's split
 * standing already shows the sheet with its preview, none shows the preview
 * beside the conversation, and opening sent and logged no loop.
 *
 * The board's own lists are not where to find it: they draw one tab at a
 * time (Working, by default), and Recent folded, so a conversation at rest
 * has a row on the board only while it reads as working for a moment.
 */
export const runNarrow = async (
  kit: Kit,
  base: string,
  leg: { name: string; pane: string; path: string; theme: Theme }
) => {
  const page = await kit.page("desk", {
    theme: leg.theme,
    init: [heldBack, paintedFrames],
    scrollbars: true,
  });
  await page.setViewportSize(NARROW_DESK);
  const said = heard(page);
  const start = await mark(page, said);
  await open(page, `${base}/`, '[data-slot="burger"]');
  // A press before the page hydrates is held and replayed (app.html).
  await page.locator('[data-slot="burger"]').click();
  const row = page.locator(`[data-rail-sheet] a[href="${leg.path}"]`);
  await row.waitFor({ state: "visible", timeout: 60_000 });
  await settle(page);
  const before = await page.evaluate(() => window.__painted?.length ?? 0);
  await page.evaluate((pane) => {
    window.__paintPane = pane;
  }, leg.pane);
  await row.click();
  /** The preview's page drew in the sheet: its heading stands in the sheet's frame. */
  const sheetLoaded = await page
    .frameLocator("[data-preview-sheet] iframe[title='Preview']")
    .locator("h1")
    .waitFor({ timeout: 60_000 })
    .then(
      () => true,
      () => false
    );
  await settle(page);
  await frames(page);
  const opened = await mark(page, said);
  const routed = await page.evaluate(
    () => performance.getEntriesByType("navigation").length
  );
  const painted = await page.evaluate(() => window.__painted ?? []);
  const settled = painted.at(-1);
  const besideAt = painted.findIndex((frame) => frame.beside);
  const sheetAt = painted.findIndex((frame) => frame.sheet);
  /** What the sheet holds once the wait is over: its frames, and its card's words. */
  const sheetHolds = await page.evaluate(() => {
    const sheet = document.querySelector("[data-preview-sheet]");
    return sheet
      ? {
          frames: sheet.querySelectorAll("iframe").length,
          says: (sheet.textContent ?? "").trim().slice(0, 160),
        }
      : null;
  });
  kit.check(
    `${leg.name}: in a fine pointer's ${NARROW_DESK.width}px desk window, the first frame painted with the split standing shows the preview's sheet, the page draws in it, and no frame shows the preview beside the conversation`,
    before === 0 &&
      routed === 1 &&
      sheetLoaded &&
      painted.length > 0 &&
      painted[0].sheet &&
      besideAt === -1,
    JSON.stringify({
      sheetLoaded,
      sheetHolds,
      framesBeforeTheRow: before,
      documentsLoaded: routed,
      frames: painted.length,
      firstFrames: painted.slice(0, 7),
      sheetFirstAt: sheetAt,
      besideFirstAt: besideAt,
    })
  );
  kit.check(
    `${leg.name}: once open, the sheet stands on the composer (its floor is the composer's drawn top)`,
    !!settled &&
      settled.sheet &&
      typeof settled.composerTop === "number" &&
      settled.floor !== null &&
      Math.abs(settled.floor - settled.composerTop) <= 1,
    JSON.stringify({
      settled,
      firstWithComposer: painted.findIndex(
        (frame) => typeof frame.composerTop === "number"
      ),
    })
  );
  // A draft of four lines grows the pill: the composer's top rises, and the
  // sheet standing on it rises with it.
  await page.locator('[data-slot="composer-field"]').first().click();
  for (const line of ["The chips wrap", "at 320", "and the gap", "doubles."]) {
    // biome-ignore lint/performance/noAwaitInLoops: one line, then its break, in order
    await page.keyboard.type(line);
    await page.keyboard.press("Shift+Enter");
  }
  await settle(page);
  await frames(page);
  const written = await page.evaluate(() => window.__readPaint?.() ?? null);
  kit.check(
    `${leg.name}: a draft of four lines raises the composer, and the sheet stands on it still`,
    !!settled &&
      !!written &&
      typeof settled.composerTop === "number" &&
      typeof written.composerTop === "number" &&
      written.composerTop < settled.composerTop - 1 &&
      written.floor !== null &&
      Math.abs(written.floor - written.composerTop) <= 1,
    JSON.stringify({ before: settled, written })
  );
  await checkQuiet(
    kit,
    page,
    said,
    `${leg.name}: opening the board, then the conversation from the navigation, in a ${NARROW_DESK.width}px desk window`,
    start,
    opened
  );
  await page.context().close();
};

/** Asks the session `marker` is sent to, through the mock model, to make a page artifact; answers its id. */
export const made = async (
  kit: Kit,
  marker: string,
  name: string,
  send: () => Promise<unknown>
): Promise<string | null> => {
  asks.set(marker, {
    name: CREATE,
    input: {
      kind: "page",
      does: "judge",
      ask: "Judge the chip wraps: pin anything that reads wrong on a narrow pane",
      name,
      html: PAGE,
    },
  });
  await send();
  const created = (await until(
    `the artifact_create call (${marker})`,
    () => answered.get(marker),
    Boolean,
    180_000
  )) as string;
  const id = created.match(ANSWERED_ID)?.[1] ?? null;
  if (!id) {
    kit.check(`artifact ${name} is made`, false, created.slice(0, 400));
  }
  return id;
};

/** A scratch fleet whose sessions answer through {@link respond}: sessiond, hub and agent up, its account signed in. */
export const fleetUp = async (kit: Kit): Promise<KitFleet> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  return fleet;
};

const steps = (widths: number[], height: number): Step[] =>
  widths.map((width) => ({ width, height }));
/**
 * At desk the head holds every control down to past the phone's line: the
 * sweep goes under it to take controls into More, and back.
 */
export const DESK_SWEEP = steps(
  [...sweep(1440, 400, 20), ...sweep(420, 1440, 20)],
  900
);
const PHONE_SWEEP = steps([...sweep(390, 320, 5), ...sweep(325, 390, 5)], 844);
/** The pin's card at the desk's width, the window's height taken down and back. */
const TALL_SWEEP = [...sweep(900, 240, 20), ...sweep(260, 900, 20)].map(
  (height) => ({ width: 1440, height })
);

const run = async (kit: Kit) => {
  const fleet = await fleetUp(kit);
  // The session runs in a project's checkout, so the navigation lists it
  // under that project ({@link runNarrow}); no Caw is asked to set it up.
  await fleet.api("/api/projects", {
    name: "Chip wraps",
    machineId: MACHINE,
    cwd: fleet.repo,
    caw: false,
  });
  const session = await fleet.spawn("claude", "Chip wraps", fleet.repo);
  const id = await made(kit, "1", "chip-wraps", () =>
    fleet.send(session, "PROBE-CALL:1")
  );
  if (!id) {
    return;
  }
  const base = await fleet.dashboard();
  for (const theme of ["light", "dark"] as const) {
    const legs: Leg[] = [
      {
        name: `desk ${theme}, its own tab`,
        view: "desk",
        theme,
        path: `/artifact/${id}`,
        ready: '[data-slot="side-card"]',
        steps: DESK_SWEEP,
        crosses: false,
      },
      {
        name: `desk ${theme}, beside its session`,
        view: "desk",
        theme,
        path: `/session/${session}`,
        ready: "[data-artifact-trigger]",
        steps: DESK_SWEEP,
        crosses: true,
      },
      {
        name: `desk ${theme}, a pin's card open beside its session`,
        view: "desk",
        theme,
        path: `/session/${session}`,
        ready: "[data-artifact-trigger]",
        open: dropPin,
        steps: TALL_SWEEP,
        crosses: false,
        squeezes: true,
      },
      {
        name: `phone ${theme}, its own tab`,
        view: "phone",
        theme,
        path: `/artifact/${id}`,
        ready: '[data-slot="side-card"]',
        steps: PHONE_SWEEP,
        crosses: true,
      },
    ];
    for (const leg of legs) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
      await runLeg(kit, base, leg);
    }
    await runNarrow(kit, base, {
      name: `narrow desk ${theme}, beside its session`,
      pane: session,
      path: `/session/${session}`,
      theme,
    });
  }
};

const spec: Spec = { name: "artifact-resize-loop", run };
export default spec;
