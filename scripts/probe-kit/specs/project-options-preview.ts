/**
 * The project page options preview (design-previews/project-options/),
 * served as a folder and read from the engine on Chromium and WebKit. Every
 * option of every pick (its views.ts) is drawn in its frame (frame.html) at
 * the widths its pick shows at, among Desk 1440 × 900, his window 1037 × 760
 * and Phone 390 × 844, and Today's live captures at each:
 *
 * 1. It renders: the frame says it is drawn, and the parts the option shows
 *    stand with a box (the bar, the board or list or pane, Caw's column, the
 *    band or the popover).
 * 2. Every switch state renders his real data: every task title,
 *    description, acceptance, to-do, headline and report shown equals the
 *    hub's record (data/tasks.json) word for word; the starters shown are
 *    the hub's (data/starters.json); the ask is the one recorded
 *    (data/ask.json); no «slot» or guillemet placeholder stands anywhere; a
 *    to-do box reads as its record (ticked only when done); every time is
 *    said in the reader's own zone (tsk-16's hand-in, 1792116375953, reads
 *    05:06 in Asia/Qatar); the retry ring's wait is the client's for its
 *    attempt (1000ms × 2^attempt, capped at 30000ms).
 * 3. One coral per view: exactly one visible, topmost element painted in the
 *    action or brand hue (`--action-solid`, `--brand-solid`), as a fill or
 *    as a drawn edge (a chosen chip's coral outline counts).
 * 3a. The starters' row (S2) is one line whose next chip peeks past its
 *    edge; Ask Caw in a docked bar, without its coral, is the glyph alone
 *    with no glass round it; Today at 1440 stands its rail in the crisp
 *    slice.
 * 4. No bar ground: every bar (the page's, a pane's, Caw's column's, the
 *    phone's top bar, H2′'s tab row) draws no fill, hairline or shadow at
 *    rest, and every top edge layer stands at opacity 0 while its scroller
 *    is at rest; 30px into each scroller that can scroll, its top edge is
 *    on: opacity 1, its backdrop blurred. The pane's strip edge comes on 30px
 *    past where its strip sticks.
 * 5. K1's layering: opened on the review, the jump strip is stuck right
 *    under the pane's bar and the Result head stands between it and the
 *    docked verdict.
 * 6. The bar fits: folded in its order (ruling 4), every page bar's leading
 *    and trailing groups stand clear of its centre group (frame.js,
 *    `fitBar`, writes `data-fits`).
 * 7. Caw stands on his composition's axis, within 1px, where he stands
 *    outside a row (the column's hero).
 * 8. The overflow sweep totals zero: journeys/scan.ts (nothing spills past
 *    the screen or its box, no control covers text), and no text clipped
 *    inside its box (an element holding words whose content is wider or
 *    taller than its box while it hides the rest, an ellipsis or a clamp).
 * 9. No console or page error, the switch page's included.
 *
 *   bun scripts/probe-kit/run.ts project-options-preview
 *   PROJECT_OPTIONS_ENGINES=chromium bun scripts/probe-kit/run.ts project-options-preview
 */
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import {
  OPTION_VIEWS,
  TODAY_WIDTHS,
} from "../../../design-previews/project-options/views";
import { HouseRules } from "../house-rules";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec, View } from "../kit";
import { ROOT } from "../kit";

const DIR = join(ROOT, "design-previews", "project-options");
const WIDTH_VIEW: Record<string, View> = {
  1440: "desk",
  1037: "window1037",
  390: "phone",
};

interface TaskRecord {
  acceptance: string;
  description: string;
  id: string;
  result: { headline: string | null; report?: string | null } | null;
  title: string;
  todos: { done: boolean; text: string }[];
}
const read = <T>(file: string): T =>
  JSON.parse(readFileSync(join(DIR, "data", file), "utf8")) as T;
const RECORDS = new Map<string, TaskRecord>(
  read<{ tasks: TaskRecord[] }>("tasks.json").tasks.map((task) => [
    task.id,
    task,
  ])
);
const STARTERS = read<{ starters: { text: string }[] }>(
  "starters.json"
).starters.map((one) => one.text);
const ASK = read<{ options: { label: string }[]; question: string }>(
  "ask.json"
);
/** tsk-16's hand-in, said in Asia/Qatar (+03:00), as his browser says it. */
const HANDED_IN = { at: "1792116375953", qatar: "05:06" };

function serve() {
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(
        join(DIR, path.endsWith("/") ? `${path}index.html` : path)
      );
      if (!file.startsWith(DIR)) {
        return new Response("no", { status: 403 });
      }
      const body = Bun.file(file);
      return (await body.exists())
        ? new Response(body)
        : new Response("not found", { status: 404 });
    },
  });
}

/** A Markdown source's words in order, its markup aside: what a reader reads of it. */
const WORDS = /[\p{L}\p{N}]+/gu;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
/** An ordered list's numbers are the list's own drawing, not words of the text. */
const NUMBERED = /^\s*\d+\.\s+/gm;
const words = (text: string): string =>
  (text.replace(LINK, "$1").replace(NUMBERED, "").match(WORDS) ?? []).join(" ");

/** What each record-bearing element should read, by its kind. */
function expected(
  task: TaskRecord,
  kind: string,
  index: number
): string | null {
  switch (kind) {
    case "title":
      return task.title;
    case "headline":
      return task.result?.headline ?? null;
    case "todo":
      return task.todos[index]?.text ?? null;
    case "description":
      return words(task.description);
    case "acceptance":
      return words(task.acceptance);
    case "report":
      return words(task.result?.report ?? "");
    default:
      return null;
  }
}

/** Words clipped inside their own box: wider or taller than it while it hides the rest. */
function clipped(): string[] {
  const found: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const own = [...el.childNodes].some(
      (node) =>
        node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()
    );
    const box = el.getBoundingClientRect();
    // Not read: what draws no box, and the visually hidden (a 1px box kept for a screen reader).
    if (!own || box.width <= 1 || box.height <= 1) {
      continue;
    }
    const style = getComputedStyle(el);
    const hidesX = ["hidden", "clip"].includes(style.overflowX);
    const hidesY = ["hidden", "clip"].includes(style.overflowY);
    const clamp =
      style.webkitLineClamp !== "none" && style.webkitLineClamp !== "";
    const ellipsis = style.textOverflow === "ellipsis";
    const wide = el.scrollWidth > el.clientWidth + 1;
    const tall = el.scrollHeight > el.clientHeight + 1;
    if ((hidesX || ellipsis) && wide) {
      found.push(
        `"${el.textContent?.trim().slice(0, 30)}" cut across (${el.scrollWidth} in ${el.clientWidth})`
      );
    } else if ((hidesY || clamp) && tall) {
      found.push(
        `"${el.textContent?.trim().slice(0, 30)}" cut below (${el.scrollHeight} in ${el.clientHeight})`
      );
    }
  }
  return found;
}

const twoFrames = () =>
  new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))
  );

async function draw(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => "ready" in document.documentElement.dataset);
  await page.evaluate(twoFrames);
}

interface FrameRead {
  ask: string[];
  axis: { holder: string; off: number }[];
  boxes: Record<string, boolean>;
  boxesTicked: { done: boolean; ticked: boolean }[];
  cawLine: boolean | null;
  coral: string[];
  docked: string[];
  fits: string[];
  ground: string[];
  guillemets: string[];
  layering: string[];
  records: { index: number; kind: string; of: string; text: string }[];
  restEdges: string[];
  ring: { attempt: number; wait: number }[];
  starters: string[];
  times: { at: string; fmt: string; text: string; zone: string }[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one read of every fact a frame is held to, serialized into the page
function readFrame(): FrameRead {
  const shows = (selector: string) => {
    const el = document.querySelector(selector);
    const r = el?.getBoundingClientRect();
    return Boolean(r && r.width > 0 && r.height > 0);
  };
  const boxes: Record<string, boolean> = {
    today: shows(".po-today"),
    head: shows(
      "[data-head], [data-phone-bar='top'], [data-phone-bar='narrow']"
    ),
    board: shows("[data-board], [data-list]"),
    pane: shows("[data-pane]"),
    caw: shows("[data-caw-column]"),
    band: shows("[data-band]"),
    popover: shows("[data-popover]"),
  };
  const counts = new Map<string, number>();
  const records = [...document.querySelectorAll<HTMLElement>("[data-record]")]
    .filter((el) => el.getClientRects().length > 0)
    .map((el) => {
      const kind = el.dataset.record ?? "";
      const of = el.dataset.of ?? "";
      const key = `${of}:${kind}`;
      const index = counts.get(key) ?? 0;
      counts.set(key, index + 1);
      return { kind, of, index, text: el.innerText };
    });
  const axis = [...document.querySelectorAll<HTMLElement>("[data-axis]")].map(
    (img) => {
      const holder = img.closest<HTMLElement>("[data-caw-column]");
      const a = img.getBoundingClientRect();
      const b = holder?.getBoundingClientRect();
      return {
        off: b ? Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) : 99,
        holder: holder?.dataset.cawColumn ?? "none",
      };
    }
  );
  // One coral: the visible, topmost boxes painted in the action or brand hue, a fill or a drawn edge.
  const hue = (token: string) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const { color } = getComputedStyle(probe);
    probe.remove();
    return color;
  };
  const corals = new Set([hue("--action-solid"), hue("--brand-solid")]);
  const coral: string[] = [];
  for (const el of document.querySelectorAll<HTMLElement>("body *")) {
    const style = getComputedStyle(el);
    const edged = ["top", "right", "bottom", "left"].some(
      (side) =>
        Number.parseFloat(style.getPropertyValue(`border-${side}-width`)) > 0 &&
        style.getPropertyValue(`border-${side}-style`) !== "none" &&
        corals.has(style.getPropertyValue(`border-${side}-color`))
    );
    if (!(corals.has(style.backgroundColor) || edged)) {
      continue;
    }
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || style.visibility === "hidden") {
      continue;
    }
    const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    if (top && (el === top || el.contains(top))) {
      coral.push(
        el.getAttribute("aria-label") ??
          el.textContent?.trim().slice(0, 20) ??
          el.tagName
      );
    }
  }
  // No bar ground: every bar's own fill, edge and shadow.
  const ground: string[] = [];
  for (const bar of document.querySelectorAll<HTMLElement>(
    "[data-bar], [data-tab-row]"
  )) {
    const style = getComputedStyle(bar);
    const fill =
      !style.backgroundColor.endsWith(", 0)") &&
      style.backgroundColor !== "transparent" &&
      style.backgroundColor !== "rgba(0, 0, 0, 0)";
    const edge = ["Top", "Right", "Bottom", "Left"].some(
      (side) =>
        Number.parseFloat(
          style.getPropertyValue(`border-${side.toLowerCase()}-width`)
        ) > 0
    );
    if (
      fill ||
      edge ||
      style.boxShadow !== "none" ||
      style.backgroundImage !== "none"
    ) {
      ground.push(
        `${bar.dataset.bar ?? bar.dataset.phoneBar ?? "tab row"}: ${style.backgroundColor} ${style.boxShadow}`
      );
    }
  }
  const restEdges: string[] = [];
  for (const edge of document.querySelectorAll<HTMLElement>(".po-edge-top")) {
    const scroller = edge.parentElement?.querySelector<HTMLElement>(
      ":scope > [data-edge-scroller]"
    );
    if (scroller && scroller.scrollTop === 0) {
      const opacity = Number(getComputedStyle(edge).opacity);
      if (opacity > 0.01) {
        restEdges.push(`${edge.dataset.edge} at ${opacity.toFixed(2)}`);
      }
    }
  }
  const guillemets = [...document.body.innerText.matchAll(/[«»]/g)].map(
    (m) => m[0]
  );
  const starters = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-starters] [data-slot='suggestion-text']"
    ),
  ].map((el) => el.innerText.trim());
  const ask = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-ask], [data-peers] button"
    ),
  ].map((el) => el.innerText.trim());
  const boxesTicked = [
    ...document.querySelectorAll<HTMLElement>("[data-todo-box]"),
  ].map((box) => {
    const tick = box.querySelector("svg");
    const style = tick ? getComputedStyle(tick) : null;
    const path = tick?.querySelector("path");
    const dash = path ? getComputedStyle(path).strokeDashoffset : "0";
    return {
      done: box.getAttribute("aria-checked") === "true",
      ticked: Boolean(
        style &&
        Number(style.opacity) > 0.01 &&
        style.visibility !== "hidden" &&
        Number.parseFloat(dash) < 1
      ),
    };
  });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const times = [
    ...document.querySelectorAll<HTMLElement>("time[data-at]"),
  ].map((time) => ({
    at: time.dataset.at ?? "",
    fmt: time.dataset.fmt ?? "",
    text: time.textContent ?? "",
    zone,
  }));
  const fits = [...document.querySelectorAll<HTMLElement>("[data-head]")]
    .filter((head) => head.dataset.fits !== "true")
    .map((head) => `${head.dataset.head} folded "${head.dataset.fold}"`);
  // Ask Caw in a docked bar without its coral is the glyph alone: no glass round it.
  const docked = [
    ...document.querySelectorAll<HTMLElement>(
      "[data-phone-bar='foot'] [data-ask-caw]:not([data-ask-caw='coral'])"
    ),
  ]
    .filter((el) => el.closest("[data-slot='tools']"))
    .map(
      (el) => `Ask Caw (${el.dataset.askCaw}) stands in a glass in the dock`
    );
  // The starters' row: one line, the next chip peeking past the row's edge.
  const row = document.querySelector<HTMLElement>("[data-row]");
  if (row && row.children.length > 1) {
    const r = row.getBoundingClientRect();
    const first = row.children[0]?.getBoundingClientRect();
    const next = row.children[1]?.getBoundingClientRect();
    if (!(
      first &&
      next &&
      first.right <= r.right &&
      next.left < r.right - 16 &&
      Math.abs(next.top - first.top) < 1
    )) {
      docked.push(
        `the starters' row: first chip ${Math.round(first?.left ?? 0)}–${Math.round(first?.right ?? 0)}, next at ${Math.round(next?.left ?? 0)}, row ${Math.round(r.left)}–${Math.round(r.right)}`
      );
    }
  }
  // Today at 1440 stands its rail in the crisp slice.
  const todayRail = document.querySelector<HTMLElement>("[data-today-rail]");
  if (
    document.querySelector(".po-today") &&
    innerWidth === 1440 &&
    Math.round(todayRail?.getBoundingClientRect().width ?? 0) !== 228
  ) {
    docked.push("Today at 1440 has no crisp rail over its own");
  }
  // Caw's line stands whole inside what his column's thread shows.
  const line = document.querySelector<HTMLElement>("[data-hero] p");
  const thread = line?.closest<HTMLElement>("[data-edge-scroller]");
  let cawLine: boolean | null = null;
  if (line && thread) {
    const a = line.getBoundingClientRect();
    const b = thread.getBoundingClientRect();
    cawLine = a.top >= b.top + 40 && a.bottom <= b.bottom + 1;
  }
  // K1-review: the strip stuck under the bar, the Result head under the strip, the docked verdict clear of both.
  const layering: string[] = [];
  const review = document.querySelector<HTMLElement>(
    '[data-pane][data-fork="review"]'
  );
  if (review) {
    const box = (selector: string) =>
      review.querySelector(selector)?.getBoundingClientRect();
    const bar = box("[data-pane-bar]");
    const strip = box("[data-jump]");
    const head = box("[data-result-head]");
    const dock = box("[data-dock]");
    if (bar && strip && head && dock) {
      if (Math.abs(strip.top - bar.bottom) > 1) {
        layering.push(
          `the strip stands ${Math.round(strip.top - bar.bottom)}px off the bar`
        );
      }
      if (head.top < strip.bottom || head.bottom > dock.top) {
        layering.push(
          `the Result head at ${Math.round(head.top)} is not between the strip (${Math.round(strip.bottom)}) and the dock (${Math.round(dock.top)})`
        );
      }
    } else {
      layering.push("a part of the pane is missing");
    }
  }
  const ring = [...document.querySelectorAll<HTMLElement>("[data-ring]")].map(
    (one) => ({
      attempt: Number(one.dataset.attempt),
      wait: Number(one.dataset.wait),
    })
  );
  return {
    boxes,
    records,
    axis,
    coral,
    docked,
    fits,
    layering,
    ground,
    restEdges,
    guillemets,
    starters,
    ask,
    boxesTicked,
    cawLine,
    times,
    ring,
  };
}

/** In the page: one scroller scrolled to `scroll`, its edge (`kind`: top or strip) read, the scroll put back. */
async function edgeAt({
  index,
  kind,
  scroll,
}: {
  index: number;
  kind: string;
  scroll: number;
}): Promise<string> {
  const el = document.querySelector<HTMLElement>(
    `[data-edge-index="${index}"]`
  );
  if (!el) {
    return "gone";
  }
  const was = el.scrollTop;
  el.scrollTop = Math.min(scroll, el.scrollHeight - el.clientHeight);
  await new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done))
  );
  const selector =
    kind === "strip" ? '[data-edge="strip"]' : ":scope > .po-edge-top";
  const edge = el.parentElement?.querySelector<HTMLElement>(selector);
  const style = edge ? getComputedStyle(edge) : null;
  el.scrollTop = was;
  if (!style) {
    return `no ${kind} edge`;
  }
  const blur =
    style.backdropFilter || style.getPropertyValue("-webkit-backdrop-filter");
  return Number(style.opacity) > 0.99 && blur.includes("blur")
    ? ""
    : `${kind} edge at ${Number(style.opacity).toFixed(2)} ${blur}`;
}

/** 30px into each scroller that can scroll, its top edge (and the pane's strip edge past its stick) is on. */
async function edgesOn(page: Page): Promise<string[]> {
  const scrollers = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-edge-scroller]")]
      .map((el, index) => {
        el.dataset.edgeIndex = String(index);
        const strip = el.parentElement?.querySelector<HTMLElement>(
          '[data-edge="strip"]'
        );
        return {
          index,
          room: el.scrollHeight - el.clientHeight,
          strip: strip
            ? Number.parseFloat(strip.style.getPropertyValue("--po-edge-from"))
            : null,
        };
      })
      .filter((one) => one.room > 60)
  );
  const off: string[] = [];
  for (const one of scrollers) {
    const tries: { kind: string; scroll: number }[] = [
      { kind: "top", scroll: 30 },
    ];
    if (one.strip !== null) {
      tries.push({ kind: "strip", scroll: one.strip + 30 });
    }
    for (const at of tries) {
      // biome-ignore lint/performance/noAwaitInLoops: each scroller scrolled and read in turn
      const reads = await page.evaluate(edgeAt, { index: one.index, ...at });
      if (reads) {
        off.push(reads);
      }
    }
  }
  return off;
}

/** The parts a frame must show for its option. */
function wanted(choice: Record<string, string>, width: string): string[] {
  if (choice.today === "1") {
    return ["today"];
  }
  if (choice.open === "pane") {
    if (width === "390") {
      return ["pane"];
    }
    // At his window under B, pick (ii): the pane takes the board's place.
    return width === "1037" && choice.narrow === "page" && choice.place !== "A"
      ? ["head", "pane"]
      : ["head", "board", "pane"];
  }
  const parts = ["head", "board"];
  if (choice.open === "caw") {
    parts.push("caw");
  }
  if (choice.state === "stale") {
    parts.push(choice.F === "F2" ? "popover" : "band");
  }
  return parts;
}

/** What the frame's real-data reads say against the records, as findings. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one comparison per kind of record a frame shows
function realData(
  at: string,
  choice: Record<string, string>,
  frame: FrameRead
): string[] {
  const wrong: string[] = [];
  for (const record of frame.records) {
    const task = RECORDS.get(record.of);
    const should = task ? expected(task, record.kind, record.index) : null;
    const markdown = ["description", "acceptance", "report"].includes(
      record.kind
    );
    const reads = markdown ? words(record.text) : record.text.trim();
    if (should === null || reads !== should) {
      wrong.push(
        `${at}: ${record.of} ${record.kind} reads "${reads.slice(0, 40)}"`
      );
    }
  }
  if (frame.guillemets.length > 0) {
    wrong.push(`${at}: ${frame.guillemets.length} guillemet placeholder marks`);
  }
  if (
    frame.starters.length > 0 &&
    frame.starters.join("|") !== STARTERS.join("|")
  ) {
    wrong.push(
      `${at}: starters read "${frame.starters.join(" | ").slice(0, 80)}"`
    );
  }
  if (choice.open === "caw" && frame.starters.length === 0) {
    wrong.push(`${at}: Caw's column shows no starters`);
  }
  if (choice.open === "caw" && frame.cawLine !== true) {
    wrong.push(`${at}: Caw's line is not in view in his column`);
  }
  for (const text of frame.ask) {
    if (
      text !== ASK.question &&
      !ASK.options.some((one) => one.label === text)
    ) {
      wrong.push(`${at}: the ask reads "${text.slice(0, 40)}"`);
    }
  }
  if (
    choice.state === "waits" &&
    choice.open !== "pane" &&
    frame.ask.length === 0 &&
    choice.view !== "Table"
  ) {
    // The waiting card's ask stands on the board, the phone's included (it opens on Working).
    wrong.push(`${at}: no ask on the waiting card`);
  }
  for (const box of frame.boxesTicked) {
    if (box.done !== box.ticked) {
      wrong.push(
        `${at}: a to-do box reads ${box.ticked ? "ticked" : "unticked"} for a record ${box.done ? "done" : "not done"}`
      );
    }
  }
  for (const time of frame.times) {
    if (!time.text) {
      wrong.push(`${at}: a time stands unsaid`);
    }
    if (
      time.at === HANDED_IN.at &&
      time.fmt === "dayClock" &&
      time.zone === "Asia/Qatar" &&
      !time.text.endsWith(HANDED_IN.qatar)
    ) {
      wrong.push(`${at}: tsk-16's hand-in reads ${time.text} in Asia/Qatar`);
    }
  }
  for (const ring of frame.ring) {
    const client = Math.min(1000 * 2 ** Math.min(ring.attempt, 10), 30_000);
    if (ring.wait !== client) {
      wrong.push(
        `${at}: the retry ring waits ${ring.wait} ms on attempt ${ring.attempt}, the client ${client}`
      );
    }
  }
  if (choice.state === "stale" && frame.ring.length === 0) {
    wrong.push(`${at}: no retry ring`);
  }
  return wrong;
}

const spec: Spec = {
  name: "project-options-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine, view and width, each leg in turn
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (
        process.env.PROJECT_OPTIONS_ENGINES ?? "chromium,webkit"
      ).split(",") as Engine[];
      const frames: {
        at: string;
        choice: Record<string, string>;
        width: string;
      }[] = [];
      for (const view of OPTION_VIEWS) {
        for (const width of view.widths) {
          frames.push({
            at: `${view.part} ${view.option} ${width}`,
            choice: { ...view.choice, w: width },
            width,
          });
        }
      }
      for (const width of TODAY_WIDTHS) {
        frames.push({
          at: `Today ${width}`,
          choice: { w: width, today: "1" },
          width,
        });
      }
      for (const engine of engines) {
        const errors: string[] = [];
        const watch = (page: Page) => {
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(String(error)));
        };
        const totals: Record<string, number> = { 1440: 0, 1037: 0, 390: 0 };
        const house = new HouseRules(kit, engine, {
          except: [
            {
              rule: "made-up",
              text: "probe-kit",
              reason:
                "his own tasks' area, as the hub's records name it (the records every row is held to above)",
            },
            {
              rule: "overflow",
              text: "(div.absolute.inset-s-0.top-full",
              reason:
                "the frame draws a popover open over the tabs it hangs from: covering them is what it is",
            },
          ],
        });
        const missing: string[] = [];
        const wrong: string[] = [];
        const offAxis: string[] = [];
        const corals: string[] = [];
        const crowded: string[] = [];
        const layered: string[] = [];
        const placed: string[] = [];
        const grounds: string[] = [];
        const edges: string[] = [];
        let records = 0;
        let drawn = 0;
        let scrolled = 0;
        let zone = "";
        for (const width of ["1440", "1037", "390"]) {
          // biome-ignore lint/performance/noAwaitInLoops: one width's page at a time
          const page = await kit.page(WIDTH_VIEW[width] as View, {
            engine,
            scale: 1,
          });
          watch(page);
          for (const frame of frames.filter((one) => one.width === width)) {
            const hash = new URLSearchParams(frame.choice).toString();
            // biome-ignore lint/performance/noAwaitInLoops: one frame drawn and read at a time
            await draw(page, `${base}frame.html?n=${drawn}#${hash}`);
            const reading = await page.evaluate(readFrame);
            drawn += 1;
            for (const want of wanted(frame.choice, width)) {
              if (!reading.boxes[want]) {
                missing.push(`${frame.at}: no ${want}`);
              }
            }
            records += reading.records.length;
            zone = reading.times[0]?.zone ?? zone;
            wrong.push(...realData(frame.at, frame.choice, reading));
            for (const caw of reading.axis) {
              if (caw.off > 1) {
                offAxis.push(
                  `${frame.at}: ${caw.holder} ${caw.off.toFixed(2)}px`
                );
              }
            }
            if (frame.choice.today !== "1") {
              if (reading.coral.length !== 1) {
                corals.push(
                  `${frame.at}: ${reading.coral.length} (${reading.coral.join(", ")})`
                );
              }
              placed.push(
                ...reading.docked.map((one) => `${frame.at}: ${one}`)
              );
              layered.push(
                ...reading.layering.map((one) => `${frame.at}: ${one}`)
              );
              crowded.push(...reading.fits.map((one) => `${frame.at}: ${one}`));
              grounds.push(
                ...reading.ground.map((one) => `${frame.at}: ${one}`)
              );
              edges.push(
                ...reading.restEdges.map((one) => `${frame.at}: at rest ${one}`)
              );
              const off = await edgesOn(page);
              scrolled += 1;
              edges.push(
                ...off.map((one) => `${frame.at}: scrolled 30px ${one}`)
              );
            }
            await house.at(page, frame.at);
            const spills = await page.evaluate(scan);
            const cut = await page.evaluate(clipped);
            totals[width] = (totals[width] ?? 0) + spills.length + cut.length;
            if (spills.length + cut.length > 0) {
              kit.note(
                `${engine} ${frame.at}: ${[...spills, ...cut].slice(0, 4).join(" | ")}`
              );
            }
          }
          await page.close();
        }
        house.report();
        const index = await kit.page("desk", { engine, scale: 1 });
        watch(index);
        await index.goto(base);
        await index.waitForSelector("[data-switches] button");
        await index.close();

        kit.check(
          `${engine}: every option renders at every width it shows at (${drawn} frames, ${frames.length} views)`,
          missing.length === 0 && drawn === frames.length,
          missing.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: every switch state renders his real data: records word for word (${records} read), the hub's starters and ask, Caw's line in view, no guillemets, to-do boxes as recorded, times in the reader's zone (${zone}), the client's retry schedule`,
          wrong.length === 0 && records > 0,
          wrong.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: one coral per view (${drawn - TODAY_WIDTHS.length} views)`,
          corals.length === 0,
          corals.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: no bar draws a fill, hairline or shadow at rest, and the edge effect is absent at rest and on 30px into every scroller (${scrolled} frames scrolled)`,
          grounds.length === 0 && edges.length === 0,
          [...grounds, ...edges].slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: the starters' row peeks its next chip, a docked Ask Caw is its glyph alone, Today's 1440 rail is the crisp one`,
          placed.length === 0,
          placed.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: K1-review opens with its jump strip stuck under the bar and the Result head between the strip and the docked verdict`,
          layered.length === 0,
          layered.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: every page bar fits once folded in its order, its side groups clear of its centre`,
          crowded.length === 0,
          crowded.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: Caw's hero stands on his column's axis within 1px`,
          offAxis.length === 0,
          offAxis.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: the overflow sweep, spills and words clipped in their box, totals ${totals[1440]} at 1440, ${totals[1037]} at 1037, ${totals[390]} at 390`,
          totals[1440] === 0 && totals[1037] === 0 && totals[390] === 0
        );
        kit.check(
          `${engine}: no console or page error`,
          errors.length === 0,
          errors.slice(0, 4).join(" | ")
        );
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
