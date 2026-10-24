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
 * - Beside the session on a phone in WebKit, 390×844 and 430×932, where the
 *   preview is the sheet over the composer ({@link runPhoneSheet}): open, its
 *   floor is the screen's foot and the composer is under it; the composer
 *   taking the focus sends it to its lower stop, on the composer; a keyboard
 *   resizing the web view never drops it.
 * - On a phone in WebKit and Chromium, a session with a plan whose ring
 *   stands in the tray row: shown while the reader writes, the sheet stands
 *   on the composer; the focus leaving, it climbs back over the composer
 *   and the ring, its top the open stop's ({@link runPhoneSheetLeaves}).
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
 *   bun scripts/probe-kit/run.ts artifact-resize-loop --phone-sheet 20
 */
import type { Page } from "playwright-core";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import {
  COMPOSER,
  type Kit,
  type KitFleet,
  kitsOwnMessage,
  open,
  pressAt,
  readMotion,
  type Spec,
  settle,
  type Theme,
} from "../kit";
import { pagePins } from "../pins";

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
  /** The host's foot less its clip: the sheet's floor, where it stands. */
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
      .closest('[data-slot="leaf"]')
      ?.querySelector<HTMLElement>(
        ':scope > [data-slot="dock"] [data-slot="lift"]'
      )?.parentElement;
    if (!composer) {
      return "none";
    }
    let top = Number.POSITIVE_INFINITY;
    for (const part of composer.querySelectorAll<HTMLElement>(
      // SideSheet's COMPOSER_PARTS, the parts the sheet measures.
      [
        ':scope > [data-slot="composer"]',
        '[data-slot="ask"]',
        '[data-slot="lift"] [data-tray-chip]',
        '[data-slot="suggest"]:has([data-slot="track"])',
        '[data-slot="progress-slot"] > *',
        '[data-slot="perch"]',
      ].join(", ")
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
    // What the host's clip takes off its foot (SideSheet: standing on the
    // composer): the third value of its `inset()`, or its only one, read by
    // its words (in the page, no module-level regex reaches it).
    const clip = host ? getComputedStyle(host).clipPath : "";
    const inset = clip.startsWith("inset(")
      ? clip
          .slice("inset(".length, clip.indexOf(")"))
          .split(" ")
          .filter(Boolean)
          .map(Number.parseFloat)
      : [];
    const clipped = (inset.length >= 3 ? inset[2] : inset[0]) ?? 0;
    return {
      splitOpen: split.hasAttribute("data-split-open"),
      sheetHost: hostBox ? hostBox.height : null,
      floor: hostBox ? hostBox.bottom - clipped : null,
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
        '[data-slot="side-card"] [data-slot="side-head"] [data-slot="more"]'
      )
  );

/**
 * The open pin's card: squeezed (PinCard `squeezed`, its room `data-whole`),
 * whether it scrolls, and the width its own scrollbar takes from what it
 * holds (its box less its client width and its two 1px edges).
 */
const cardState = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('[data-slot="pin-card"]');
    return {
      squeezed: !!card?.querySelector("[data-whole]"),
      scrolls: !!card && card.scrollHeight > card.clientHeight,
      scrollbar: card ? card.offsetWidth - card.clientWidth - 2 : null,
    };
  });

/**
 * Whether the engine draws its scrollbars beside what a box holds, taking
 * their width (a desk's Chromium, kit.ts `scrollbars`), or lays them over
 * it, taking none (WebKit, as a Mac's Safari does by default).
 */
const drawsScrollbars = (page: Page) =>
  page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText =
      "position:absolute;visibility:hidden;overflow:scroll;inline-size:100px;block-size:100px";
    document.body.append(box);
    const taken = box.offsetWidth - box.clientWidth;
    box.remove();
    return taken > 0;
  });

/** The pane's Comment control, in the head or in More. */
const COMMENT =
  ':is([data-slot="preview-pane"], [data-side-card="preview"]) button[aria-keyshortcuts=\'C\']';

/**
 * A comment written on the page's heading in Comment mode and sent, then
 * its thread opened from its pill: its card stays open, with a head, a
 * thread and a foot.
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
  // The second theme's leg finds the first's comment on the page: its pill opens its thread.
  const written = await frame
    .locator('svg[data-cawco-pins] g[data-pin="1"]')
    .count();
  if (written === 0) {
    await pressAt(frame, {
      x: box.x + box.width * 0.3,
      y: box.y + box.height / 2,
    });
    // The press opens the comment's composer; Comment writes the pin, and its pill opens its thread.
    const composer = page.locator('[data-slot="pin-composer"]');
    await composer.waitFor({ timeout: 5000 });
    await composer
      .getByRole("combobox")
      .fill(
        "The chips wrap onto a second line too early: the third one drops while there is still room beside the second."
      );
    await composer
      .getByRole("button", { name: "Comment", exact: true })
      .click();
    await composer.waitFor({ state: "detached", timeout: 8000 });
    // It goes by itself: wait for the delivery to stamp it, so the legs
    // after this one see its pill as it stands once sent.
    await until(
      "the comment delivered by itself",
      async () =>
        Object.values(await pagePins(frame)).every((pin) => !!pin.sentAt),
      Boolean,
      20_000
    ).catch(() => false);
  }
  // Drawn, not only made: a pill attached but not yet drawn has no box, and
  // `boundingBox` answers null for it at once, whatever its timeout. Each
  // draw of the pins removes every pill and makes it again (pins.ts
  // `draw`), and the pin's state turning once it is sent draws them again: the
  // face the locator found can be gone by the time it is measured, and
  // WebKit's quads for a node no longer in the page are none (its rect 0×0,
  // no `<svg>` round it, the face drawn anew at 20×20 a moment later). The
  // box is read until it is read off a drawn pill.
  const face = frame.locator(
    'svg[data-cawco-pins] g[data-pin="1"] [data-face]'
  );
  await face.waitFor({ state: "visible", timeout: 5000 });
  const pill = await until(
    "the new pin's pill measured where it is drawn",
    () => face.boundingBox(),
    (measured) => measured !== null && measured.width > 0,
    5000
  ).catch(() => null);
  if (!pill) {
    throw new Error("the new pin's pill has no box to press");
  }
  await pressAt(frame, {
    x: pill.x + pill.width / 2,
    y: pill.y + pill.height / 2,
  });
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

/** A step's size, `1280×800`. */
const size = (step: Step) => `${step.width}×${step.height}`;

/**
 * The open pin's card over a sweep: squeezed at some sizes and let go, and
 * squeezed, it scrolls, its scrollbar taking width where the engine draws
 * one beside what a box holds.
 */
const checkSqueezed = async (
  kit: Kit,
  page: Page,
  leg: Leg,
  cards: ({ step: Step } & Awaited<ReturnType<typeof cardState>>)[]
) => {
  const [first] = leg.steps;
  const last = leg.steps.at(-1) ?? first;
  const squeezedAt = cards.filter((card) => card.squeezed).map((c) => c.step);
  const scrollbarAt = cards
    .filter((card) => card.scrollbar)
    .map((card) => `${size(card.step)}:${card.scrollbar}px`);
  const scrolledAt = cards
    .filter((card) => card.squeezed && card.scrolls)
    .map((card) => size(card.step));
  const drawn = await drawsScrollbars(page);
  kit.check(
    `${leg.name}: the sweep squeezed the open pin's card and let it go (squeezed at some sizes, at neither end)`,
    squeezedAt.length > 0 &&
      !squeezedAt.includes(first) &&
      !squeezedAt.includes(last),
    JSON.stringify({ squeezedAt: squeezedAt.map(size) })
  );
  // Where the engine lays its scrollbars over what a box holds, none
  // takes width: the card scrolls with nothing narrowed.
  kit.check(
    drawn
      ? `${leg.name}: squeezed, the card scrolls and its scrollbar takes width from its head and foot (a desk's scrollbars drawn)`
      : `${leg.name}: squeezed, the card scrolls, its scrollbar laid over what it holds (this engine's scrollbars take no width)`,
    scrolledAt.length > 0 &&
      (drawn ? scrollbarAt.length > 0 : scrollbarAt.length === 0),
    JSON.stringify({ drawn, scrolledAt, scrollbarAt })
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
    await checkSqueezed(kit, page, leg, cards);
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

/** The phone preview sheet as drawn, read by {@link sheetReader}. */
interface SheetNow {
  /** The composer's drawn top, as SideSheet's `drawnTop` reads it; null with no part drawn. */
  composerTop: number | null;
  /** The composer's drawn parts each covered by the sheet at their middle (what `elementFromPoint` hits there is in the sheet). */
  covered: { chip: boolean; covered: boolean; part: string }[];
  /** The sheet's floor: the host's foot less what its clip takes off it. */
  floor: number;
  /** The composer's field holds the focus. */
  focused: boolean;
  /** A press at the pill's middle lands in the composer: it stands in view. */
  pillInView: boolean;
  /** The screen's foot less the home indicator's room (`--safe-bottom` on the composer's dock). */
  screenFloor: number;
  /** The stop SideSheet says it stands at (`data-active-snap`). */
  stop: string | null;
  /** The sheet's drawn top. */
  top: number | null;
}

declare global {
  interface Window {
    /** Each frame's floor and composer top while a keyboard rises. */
    __floors?: { floor: number; composerTop: number | null }[];
    /** The phone sheet as it stands now; null while it has no host. */
    __sheetNow?: () => SheetNow | null;
  }
}

/**
 * Reads the phone's preview sheet as the engine draws it: its floor (the
 * host's foot less its clip), the composer's drawn top, what a press on each
 * of the composer's drawn parts lands on. Runs in the page before its own
 * scripts.
 */
function sheetReader() {
  const PARTS = [
    ':scope > [data-slot="composer"]',
    '[data-slot="ask"]',
    '[data-slot="lift"] [data-tray-chip]',
    '[data-slot="suggest"]:has([data-slot="track"])',
    '[data-slot="progress-slot"] > *',
    '[data-slot="perch"]',
  ].join(", ");
  const drawn = (part: Element) =>
    part.getBoundingClientRect().height > 0 &&
    part.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const composerOf = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="leaf"] > [data-slot="dock"] [data-slot="lift"]'
      ),
    ]
      .map((lift) => lift.parentElement)
      .find((dock) => dock?.checkVisibility()) ?? null;
  /**
   * The bottom of an `inset()` clip: its third value, or its only one. In
   * the page, so no module-level regex reaches it: read by its words.
   */
  const clipBottom = (clip: string) => {
    if (!clip.startsWith("inset(")) {
      return 0;
    }
    const values = clip
      .slice("inset(".length, clip.indexOf(")"))
      .split(" ")
      .filter(Boolean)
      .map(Number.parseFloat);
    return (values.length >= 3 ? values[2] : values[0]) ?? 0;
  };
  const read = (): SheetNow | null => {
    const host = document.querySelector<HTMLElement>(
      '[data-slot="preview-sheet-host"]'
    );
    const content = document.querySelector("[data-preview-sheet]");
    if (!(host && content)) {
      return null;
    }
    const floor =
      host.getBoundingClientRect().bottom -
      clipBottom(getComputedStyle(host).clipPath);
    const composer = composerOf();
    const parts = composer
      ? [...composer.querySelectorAll<HTMLElement>(PARTS)].filter(drawn)
      : [];
    const tops = parts.map((part) => part.getBoundingClientRect().top);
    const hitIn = (box: DOMRect) =>
      document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2
      );
    const pill = composer?.querySelector('form[data-slot="cin"]');
    const pillHit = pill ? hitIn(pill.getBoundingClientRect()) : null;
    const safeBottom = composer
      ? Number.parseFloat(
          getComputedStyle(composer).getPropertyValue("--safe-bottom")
        ) || 0
      : 0;
    const sheet = content.querySelector('[data-slot="sheet"]');
    return {
      floor,
      composerTop: tops.length > 0 ? Math.min(...tops) : null,
      screenFloor: document.documentElement.clientHeight - safeBottom,
      stop: host.getAttribute("data-active-snap"),
      top: sheet ? sheet.getBoundingClientRect().top : null,
      covered: parts.map((part) => ({
        part: `${part.localName}[${part.dataset.slot ?? ""}]`,
        chip: part.hasAttribute("data-tray-chip"),
        covered: !!content.contains(hitIn(part.getBoundingClientRect())),
      })),
      pillInView: !!(pill && pillHit && pill.contains(pillHit)),
      focused: !!composer?.contains(document.activeElement),
    };
  };
  window.__sheetNow = read;
}

/** A software keyboard's height on a phone, as the web view resizes for it (Brave). */
const KEYBOARD = 336;

/** The fractions of the sheet's move it is seeked to. */
const SCRUB = [0, 0.5, 1];

/** One animation on the sheet's host (its clip) or on the sheet (vaul's move), as the engine runs it. */
interface Run {
  duration: number;
  /** The curve it moves on (kit.ts `MotionRun.easing`: a CSS transition carries it on its timing or its first keyframe). */
  easing: string;
  kind: string;
  on: "clip" | "sheet";
  /** Where its clock stood as it was held: 0, no frame of the move played. */
  playedFirst: number | null;
  start: number | null;
}

/** How long the scrub waits for the move's two runs to start, in wall-clock ms. */
const START_WITHIN_MS = 10_000;

/** The two elements the move runs on: the host (SideSheet's clip) and vaul's sheet in it. */
const MOVERS = '[data-slot="preview-sheet-host"], [data-preview-sheet]';

/**
 * Moves the sheet between its stops (`focus`: the composer's field takes
 * the focus; `grab`: a tap on the grabber), holds every animation the move
 * starts on the sheet and its host at its start, and seeks them together to
 * each fraction of their duration (SCRUB), reading the floor and the
 * sheet's top at each. Then it lets them run on to their end.
 *
 * Read as the kit reads motion (kit.ts `readMotion`): WebKit has no
 * DevTools Animation domain, so the page holds the clock itself, each run
 * at its start before a frame can play it (vaul's CSS transition from a
 * MutationObserver a microtask after its write, SideSheet's clip as
 * `animate()` returns it), at a playback rate of 0, so SideSheet reads the
 * move it clips to and sets the clip's start from it unchanged. Waiting
 * frames for the move to begin instead, a loaded machine (330-446ms a
 * frame, one busy loop per core) let the whole 500ms move finish before the
 * read, and it found nothing to scrub.
 */
const scrub = async (page: Page, act: "focus" | "grab") => {
  const moved = await readMotion(
    page,
    () =>
      page.evaluate(
        ({ does, field }) => {
          if (does === "focus") {
            document.querySelector<HTMLElement>(field)?.focus();
          } else {
            document.querySelector<HTMLElement>("[data-preview-grab]")?.click();
          }
        },
        { does: act, field: COMPOSER }
      ),
    MOVERS,
    {
      // Their own runs alone, as the scrub held them before the kit did:
      // held at 0, the card's padding inside the sheet changed how
      // SideSheet made its clip (two of them, the move read at its end).
      own: true,
      fractions: SCRUB,
      read: () =>
        page.evaluate(() => {
          const now = window.__sheetNow?.();
          return {
            floor: now?.floor ?? Number.NaN,
            top: now?.top ?? Number.NaN,
          };
        }),
      ms: START_WITHIN_MS,
    }
  );
  const on = (target: string): Run["on"] | null => {
    if (target === "div[preview-sheet-host]") {
      return "clip";
    }
    return target === "div[drawer-content]" ? "sheet" : null;
  };
  const runs: Run[] = moved.runs.flatMap((one) => {
    const where = on(one.target);
    return where
      ? [
          {
            on: where,
            kind: one.type,
            start: one.start,
            playedFirst: one.heldAt,
            duration: one.end - one.delay,
            easing: one.easing,
          },
        ]
      : [];
  });
  return {
    by: moved.by,
    runs,
    at: moved.at.map(({ fraction, value }) => ({ fraction, ...value })),
  };
};

/**
 * The scrub's verdict: the sheet's move and the clip run on one clock (the
 * same start, duration and easing, one each), held at its start before a
 * frame of it played, the floor and the sheet's top
 * at the stops' places at 0 and 1, and at 0.5 both the same share of their
 * way along.
 */
const oneClock = (
  scrubbed: Awaited<ReturnType<typeof scrub>>,
  from: { floor: number; top: number },
  to: { floor: number; top: number }
) => {
  const clip = scrubbed.runs.filter((each: Run) => each.on === "clip");
  const sheet = scrubbed.runs.filter((each: Run) => each.on === "sheet");
  const [a] = clip;
  const [b] = sheet;
  const clocked =
    clip.length === 1 &&
    sheet.length === 1 &&
    !!a &&
    !!b &&
    a.start !== null &&
    a.start === b.start &&
    a.duration === b.duration &&
    a.easing === b.easing &&
    a.playedFirst === 0 &&
    b.playedFirst === 0;
  const [start, middle, end] = scrubbed.at;
  const near = (x: number, y: number) => Math.abs(x - y) <= 1;
  const placed =
    !!start &&
    !!end &&
    near(start.floor, from.floor) &&
    near(start.top, from.top) &&
    near(end.floor, to.floor) &&
    near(end.top, to.top);
  const share = (at: number, a0: number, a1: number) => (at - a0) / (a1 - a0);
  const floorShare = middle ? share(middle.floor, from.floor, to.floor) : -1;
  const topShare = middle ? share(middle.top, from.top, to.top) : -1;
  const together =
    floorShare > 0 && floorShare < 1 && Math.abs(floorShare - topShare) < 0.03;
  return { ok: clocked && placed && together, floorShare, topShare };
};

/**
 * The preview sheet on a phone, in Playwright's WebKit at `view`, beside
 * its session (`/session/<id>`), whose preview is open:
 *
 * - Open, the sheet's floor is the screen's foot less the home indicator's
 *   room, and every part of the composer that paints (the pill, the tray's
 *   chips, the suggestions, the plan's ring) is under the sheet.
 * - The composer's field taking the focus sends the sheet to its lower
 *   stop: its floor the composer's drawn top, and the pill in view.
 * - Over a keyboard that resizes the web view (823d7d363), no frame drops
 *   the sheet below where it stood, and it ends standing on the composer.
 * - Both moves (the focus down, a tap on the grabber back up) run the
 *   host's clip on vaul's own clock, seeked to 0, 0.5 and 1 ({@link scrub}).
 * - None of it posts an error to the hub or logs a ResizeObserver loop.
 *
 * No element pick on the web writes into the composer (comments.ts 6:
 * selection.md is gone), so the pick's step down is not a leg.
 */
export const runPhoneSheet = async (
  kit: Kit,
  base: string,
  leg: { session: string; view: "phone" | "phoneWide" }
) => {
  const page = await kit.page(leg.view, {
    engine: "webkit",
    init: [heldBack, sheetReader],
  });
  const { width, height } = page.viewportSize() ?? { width: 0, height: 0 };
  const name = `phone ${width}×${height} WebKit, beside its session`;
  const said = heard(page);
  const start = await mark(page, said);
  await open(page, `${base}/session/${leg.session}`, "[data-preview-sheet]");
  await page
    .frameLocator("[data-preview-sheet] iframe[title='Preview']")
    .locator("h1")
    .waitFor({ timeout: 60_000 });
  await settle(page, 400);
  await frames(page);
  const now = () => page.evaluate(() => window.__sheetNow?.() ?? null);
  const opened = await now();
  kit.check(
    `${name}: open, the sheet's floor is the screen's foot less the safe area, over the composer and its chips`,
    !!opened &&
      Math.abs(opened.floor - opened.screenFloor) <= 1 &&
      opened.covered.length > 0 &&
      opened.covered.every((part) => part.covered) &&
      !opened.pillInView,
    JSON.stringify(opened)
  );
  const down = await scrub(page, "focus");
  await settle(page, 700);
  await frames(page);
  const focused = await now();
  const downClock =
    opened && focused
      ? oneClock(
          down,
          { floor: opened.floor, top: opened.top ?? Number.NaN },
          { floor: focused.floor, top: focused.top ?? Number.NaN }
        )
      : null;
  kit.check(
    `${name}: stepping down onto the composer, the clip rises with the sheet on vaul's clock (one start, duration and easing; seeked to 0, 0.5 and 1, the floor and the top the same share along)`,
    !!downClock?.ok,
    JSON.stringify({ ...down, ...downClock })
  );
  kit.check(
    `${name}: the composer taking the focus sends the sheet to its lower stop, its floor the composer's drawn top, the pill in view`,
    !!focused &&
      focused.focused &&
      focused.stop === "lower" &&
      focused.composerTop !== null &&
      Math.abs(focused.floor - focused.composerTop) <= 1 &&
      focused.pillInView &&
      !!opened?.top &&
      !!focused.top &&
      focused.top > opened.top,
    JSON.stringify({ opened, focused })
  );
  // A keyboard that resizes the web view: every frame's floor read while
  // the page lays itself out in the smaller viewport.
  await page.evaluate(() => {
    const floors: NonNullable<Window["__floors"]> = [];
    window.__floors = floors;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      const sheet = window.__sheetNow?.();
      if (sheet) {
        floors.push({ floor: sheet.floor, composerTop: sheet.composerTop });
      }
    };
    const tick = () => {
      if (floors.length < 120) {
        channel.port2.postMessage(0);
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
  await page.setViewportSize({ width, height: height - KEYBOARD });
  await settle(page, 700);
  await frames(page);
  const typed = await now();
  const floors = await page.evaluate(() => window.__floors ?? []);
  const before = focused?.floor ?? 0;
  const dropped = floors.filter((frame) => frame.floor > before + 1);
  kit.check(
    `${name}: over a keyboard that resizes the web view, no frame drops the sheet below where it stood, and it ends on the composer`,
    !!typed &&
      floors.length > 0 &&
      dropped.length === 0 &&
      typed.stop === "lower" &&
      typed.composerTop !== null &&
      Math.abs(typed.floor - typed.composerTop) <= 1 &&
      typed.floor < before - KEYBOARD / 2,
    JSON.stringify({ before, dropped: dropped.slice(0, 5), typed })
  );
  await page.setViewportSize({ width, height });
  await settle(page, 400);
  await frames(page);
  // The grabber tapped on the composer: the sheet climbs back over it, the
  // clip falling with it.
  const lowered = await now();
  const up = await scrub(page, "grab");
  await settle(page, 700);
  await frames(page);
  const raised = await now();
  const upClock =
    lowered && raised
      ? oneClock(
          up,
          { floor: lowered.floor, top: lowered.top ?? Number.NaN },
          { floor: raised.floor, top: raised.top ?? Number.NaN }
        )
      : null;
  kit.check(
    `${name}: the grabber tapped, the sheet climbs back to its open stop over the composer, the clip falling with it on vaul's clock`,
    !!raised &&
      raised.stop === "open" &&
      Math.abs(raised.floor - raised.screenFloor) <= 1 &&
      !!upClock?.ok,
    JSON.stringify({ lowered, raised, ...up, ...upClock })
  );
  await checkQuiet(
    kit,
    page,
    said,
    `${name}: opening the sheet, focusing the composer, a keyboard up and down, the grabber tapped`,
    start,
    await mark(page, said)
  );
  await page.context().close();
};

/** The steps a session's plan holds: its ring stands in the tray row, a chip on the composer. */
const PLAN_STEPS = [
  { id: "read", content: "Read the chip wraps", status: "completed" },
  { id: "lay", content: "Lay them out", status: "in_progress" },
];
const TODO_WRITE = "mcp__cawco__todo_write";
const PLAN_RING = '[data-slot="lift"] [data-tray-chip]';

/**
 * The owner, on his iPhone: "the preview sheet should cover the composer
 * and the chip row, lost space". A session with a plan, its ring a chip in
 * the composer's tray row, at 390×844 in `engine` (WebKit with an iPhone's
 * agent, and Chromium): the reader writes in the composer (its field holds
 * the focus) as the agent shows a page, so the sheet stands on the
 * composer, the pill and the ring in view. The focus leaves (the keyboard
 * put away): the sheet climbs back to its open stop, its floor the screen's
 * foot, and a press at the middle of the pill and of the ring lands in the
 * sheet: no composer or chip shows inside or below it. Its top is where
 * the open stop stands on a fresh load (the top as it is on main). No
 * console error, no post to the hub, no ResizeObserver loop.
 */
export const runPhoneSheetLeaves = async (
  kit: Kit,
  base: string,
  fleet: KitFleet,
  engine: "webkit" | "chromium"
) => {
  // Each engine's session its own markers: an answered marker is answered for good.
  const [planned, shown] = engine === "webkit" ? ["21", "22"] : ["23", "24"];
  const session = await fleet.spawn("claude", "Plan chips", fleet.repo);
  asks.set(planned, {
    name: TODO_WRITE,
    input: { steps: PLAN_STEPS },
  });
  await fleet.send(session, `PROBE-CALL:${planned}`);
  await until(
    `the todo_write call (${planned})`,
    () => answered.get(planned),
    Boolean,
    180_000
  );
  const page = await kit.page("phone", {
    engine,
    init: [heldBack, sheetReader],
  });
  const name = `phone 390×844 ${engine === "webkit" ? "WebKit, an iPhone's agent" : "Chromium"}, a plan's ring on the composer`;
  const said = heard(page);
  const start = await mark(page, said);
  await open(page, `${base}/session/${session}`, PLAN_RING);
  await page.locator(COMPOSER).focus();
  const id = await made(kit, shown, `plan-chips-${engine}`, () =>
    fleet.send(session, `PROBE-CALL:${shown}`)
  );
  await page
    .frameLocator("[data-preview-sheet] iframe[title='Preview']")
    .locator("h1")
    .waitFor({ timeout: 60_000 });
  await settle(page, 700);
  await frames(page);
  const now = () => page.evaluate(() => window.__sheetNow?.() ?? null);
  const writing = await now();
  kit.check(
    `${name}: shown while the reader writes, the sheet stands on the composer, the pill and the ring in view`,
    !!id &&
      !!writing &&
      writing.focused &&
      writing.stop === "lower" &&
      writing.pillInView &&
      writing.covered.some((part) => part.chip && !part.covered),
    JSON.stringify(writing)
  );
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur()
  );
  await settle(page, 900);
  await frames(page);
  const left = await now();
  const chips = left?.covered.filter((part) => part.chip) ?? [];
  kit.check(
    `${name}: the focus gone, the sheet climbs back over the composer: its floor the screen's foot, the pill and every chip under it (a press at each one's middle lands in the sheet)`,
    !!left &&
      !left.focused &&
      left.stop === "open" &&
      Math.abs(left.floor - left.screenFloor) <= 1 &&
      chips.length > 0 &&
      left.covered.every((part) => part.covered) &&
      !left.pillInView,
    JSON.stringify(left)
  );
  const end = await mark(page, said);
  const errors = said.errors
    .slice(start.errors, end.errors)
    .filter((line) => !kitsOwnMessage(line));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page
    .frameLocator("[data-preview-sheet] iframe[title='Preview']")
    .locator("h1")
    .waitFor({ timeout: 60_000 });
  await settle(page, 700);
  await frames(page);
  const fresh = await now();
  kit.check(
    `${name}: its top is the open stop's on a fresh load, and the page logged no console error`,
    !!fresh &&
      !!left &&
      fresh.stop === "open" &&
      fresh.top !== null &&
      left.top !== null &&
      Math.abs(fresh.top - left.top) <= 1 &&
      errors.length === 0,
    JSON.stringify({ climbed: left?.top, fresh: fresh?.top, errors })
  );
  await checkQuiet(
    kit,
    page,
    said,
    `${name}: shown while writing, the focus leaving`,
    start,
    end
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

/**
 * The artifact chosen in Files, at a desk: the session open at `width`, its
 * panel open (`panel: "open"`: in the split, or the sheet on the composer
 * in a pane under 900px) or shut first (`"shut"`), the top bar's Files item
 * pressed and the artifact's card in it chosen: the pick opens in the
 * session's own panel and Files goes (FilesFace `pick`). Opening Files,
 * choosing it, and the page settling after send the hub nothing and log no
 * loop.
 */
export const runFiles = async (
  kit: Kit,
  base: string,
  leg: {
    artifact: string;
    name: string;
    panel: "open" | "shut";
    session: string;
    theme: Theme;
    width: number;
  }
) => {
  const page = await kit.page("desk", {
    theme: leg.theme,
    init: [heldBack],
    scrollbars: true,
  });
  await page.setViewportSize({ width: leg.width, height: 900 });
  const said = heard(page);
  await open(page, `${base}/session/${leg.session}`, "[data-files-control]");
  if (leg.panel === "shut") {
    await page.evaluate(
      (id) =>
        fetch(`/api/instances/${encodeURIComponent(id)}/preview`, {
          method: "DELETE",
        }),
      leg.session
    );
    await page
      .locator('[data-slot="side-card"]')
      .waitFor({ state: "detached", timeout: 30_000 });
  } else {
    // Opened beside the session as its agent opens it: a leg before may
    // have shut it, and the hub keeps it shut.
    await page.evaluate(
      ({ id, artifact }) =>
        fetch(
          `/api/instances/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(artifact)}/show`,
          { method: "POST" }
        ),
      { id: leg.session, artifact: leg.artifact }
    );
    await page
      .locator(PANEL_FRAME)
      .first()
      .contentFrame()
      .locator("h1")
      .waitFor({ timeout: 60_000 });
  }
  await settle(page);
  await frames(page);
  const start = await mark(page, said);
  await page.locator("[data-files-control]").click();
  const card = page.locator(
    `[data-files-card][data-artifact="${leg.artifact}"]`
  );
  await card.waitFor({ state: "visible", timeout: 30_000 });
  await settle(page);
  await card.click();
  // The pick in the session's own panel (the split, or the sheet in a pane
  // under 900px), Files gone, its page drawn there.
  await page
    .locator('[data-glass-card][data-glass-card-frame="files-pop"]')
    .waitFor({ state: "detached", timeout: 30_000 });
  await page
    .locator(PANEL_FRAME)
    .first()
    .contentFrame()
    .locator("h1")
    .waitFor({ timeout: 60_000 });
  await settle(page);
  await frames(page);
  const opened = await mark(page, said);
  await checkQuiet(
    kit,
    page,
    said,
    `${leg.name}: choosing the artifact in Files (it opened in the session's panel)`,
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
      // The hub's record of the answer, which this spec reads (mcp-tool.ts).
      response_format: "detailed",
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

/**
 * `--phone-sheet <n>`: the phone sheet at 390×844 alone, n times on one
 * fleet ({@link runPhoneSheet}), and nothing else: how often a leg of it
 * fails, counted.
 */
const phoneSheetRuns = (): number => {
  const at = process.argv.indexOf("--phone-sheet");
  const runs = at === -1 ? 0 : Number(process.argv[at + 1]);
  return Number.isInteger(runs) && runs > 0 ? runs : 0;
};

const run = async (kit: Kit) => {
  const fleet = await fleetUp(kit);
  // The session runs in a project's checkout, so the navigation lists it
  // under that project ({@link runNarrow}); no Caw is asked to set it up.
  const project = await fleet.api<{ id: string }>("/api/projects", {
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
  const repeat = phoneSheetRuns();
  if (repeat > 0) {
    for (let at = 0; at < repeat; at += 1) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
      await runPhoneSheet(kit, base, { session, view: "phone" });
    }
    for (const engine of ["webkit", "chromium"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one session and page at a time
      await runPhoneSheetLeaves(kit, base, fleet, engine);
    }
    return;
  }
  for (const view of ["phone", "phoneWide"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
    await runPhoneSheet(kit, base, { session, view });
  }
  for (const engine of ["webkit", "chromium"] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one session and page at a time
    await runPhoneSheetLeaves(kit, base, fleet, engine);
  }
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
  for (const width of FILES_WIDTHS) {
    for (const panel of ["open", "shut"] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
      await runFiles(kit, base, {
        artifact: id,
        name: `Files at desk ${width}, the session's panel ${panel}`,
        panel,
        session,
        theme: "light",
        width,
      });
    }
  }
  const pages = [
    {
      name: "the project's page",
      path: `/project/${project.id}`,
      ready: '[data-slot="caw-seat"]',
    },
    { name: "the board", path: "/", ready: "main" },
    { name: "Configure", path: "/config", ready: "main" },
    {
      name: "a session",
      path: `/session/${session}`,
      ready: '[data-slot="pane"]',
    },
  ];
  for (const one of pages) {
    // biome-ignore lint/performance/noAwaitInLoops: one page at a time, each its own report
    await runPageSweep(kit, base, one);
  }
};

/** A desk window from 1440 wide to 900 and back, in 20px steps. */
const PAGE_SWEEP = steps(
  [...sweep(1440, 900, 20), ...sweep(920, 1440, 20)],
  900
);

/**
 * A page of the dashboard at desk 1440, its window taken down to 900 wide
 * and back in small steps (the rail's line, Files' and the split's bands
 * crossed both ways): opening it and the sweep send the hub nothing and log
 * no ResizeObserver loop, and a loop names the observers of its frame.
 */
export const runPageSweep = async (
  kit: Kit,
  base: string,
  leg: { name: string; path: string; ready: string }
) => {
  const page = await kit.page("desk", {
    theme: "light",
    init: [heldBack],
    scrollbars: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const said = heard(page);
  const start = await mark(page, said);
  await open(page, `${base}${leg.path}`, leg.ready);
  await settle(page);
  await frames(page);
  const opened = await mark(page, said);
  const postedAt: string[] = [];
  for (const step of PAGE_SWEEP) {
    const before = said.posts.length;
    // biome-ignore lint/performance/noAwaitInLoops: one size, laid out and delivered, before the next
    await page.setViewportSize(step);
    await frames(page);
    if (said.posts.length > before) {
      postedAt.push(`${step.width}×${step.height}`);
    }
  }
  await settle(page);
  await frames(page);
  const swept = await mark(page, said);
  await checkQuiet(
    kit,
    page,
    said,
    `${leg.name}: opening it at desk 1440`,
    start,
    opened
  );
  await checkQuiet(
    kit,
    page,
    said,
    `${leg.name}: a resize sweep 1440×900→900×900→1440×900`,
    opened,
    swept,
    { postedAt }
  );
  await page.context().close();
};

/** The session's own panel's page: in the split, or the sheet on the composer in a pane under 900px. */
const PANEL_FRAME =
  '[data-side-pane] iframe[title="Preview"], [data-preview-sheet] iframe[title="Preview"]';

/** The desk's widths Files is picked from, down to the split's edge. */
const FILES_WIDTHS = [1440, 1100, 1000, 920];

const spec: Spec = { name: "artifact-resize-loop", run };
export default spec;
