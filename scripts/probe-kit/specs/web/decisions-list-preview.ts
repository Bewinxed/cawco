/**
 * The Decisions list preview (design-previews/decisions-list/), a static page
 * served as its folder, held to what the owner reads on it, on Chromium and
 * WebKit at the desk's 1440 and the phone's 390, and at 1110, the width of
 * the panel it is judged in:
 *
 * - every state draws: nothing spills and no control covers text
 *   (journeys/scan.ts), read down the whole page, which never scrolls
 *   sideways;
 * - each frame fits whole in the width it is given, and no ancestor clips it;
 * - one row per page: no page has two rows, and the groups count all 25;
 * - every row's title stands on one start edge;
 * - no glyph stands in a filled or bordered box of its own (a tile);
 * - the badge on the Decisions tab is the Open group's count, absent at 0;
 * - every switch shows its option (pressed, the thumb under it) and the
 *   stage draws that option; Night turns the page's ground dark;
 * - each motion, on a held clock sought to 0, ½ and 1, moves its value
 *   continuously (½ strictly between the ends) and lands where 1 stood;
 * - no console error and no page error.
 *
 *   bun scripts/probe-kit/run.ts web decisions-list-preview
 */
import { realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { scan } from "../../journeys/scan";
import type { Engine, Kit, Spec, View } from "../../kit";
import { kitsOwnMessage, ROOT, readMotion, stillWithin } from "../../kit";

const DIR = realpathSync(join(ROOT, "design-previews", "decisions-list"));
const PAGES = 25;
const PANEL = 1110;

const STATES = [
  "open2",
  "alldone",
  "many",
  "closed",
  "replaced",
  "removed",
  "search",
  "nomatch",
  "loading",
  "failure",
  "first",
] as const;
/** The states that draw the whole list, so every page is counted in its groups. */
const WHOLE = new Set(["open2", "alldone", "many", "closed"]);

/** Each switch, its options, and what the desk frame must draw for each. */
const PICKS: {
  group: string;
  key: string;
  state: string;
  values: { value: string; drawn: string }[];
}[] = [
  {
    group: "groups",
    key: "groups",
    state: "open2",
    values: [
      { value: "five", drawn: "heads:5" },
      { value: "two", drawn: "heads:2" },
    ],
  },
  {
    group: "heard",
    key: "heard",
    state: "open2",
    values: [
      { value: "facts", drawn: "facts" },
      { value: "pill", drawn: "pill" },
    ],
  },
  {
    group: "quiet",
    key: "quiet",
    state: "many",
    values: [
      { value: "on", drawn: "quiet" },
      { value: "off", drawn: "no-quiet" },
    ],
  },
  {
    group: "tasks",
    key: "tasks",
    state: "open2",
    values: [
      { value: "row", drawn: "acts" },
      { value: "page", drawn: "no-acts" },
    ],
  },
];

interface Motion {
  id: string;
  probe: string;
  prop: "opacity" | "height" | "top" | "left";
}

const DESK = '[data-frame="desk"]';
const MOTIONS: Motion[] = [
  {
    id: "send",
    probe: `${DESK} [data-row][data-page="owner-presence"]`,
    prop: "top",
  },
  { id: "fold", probe: `${DESK} [data-fold="closed"]`, prop: "height" },
  {
    id: "search",
    probe: `${DESK} [data-row][data-page="caw-pairing-picks"]`,
    prop: "top",
  },
  {
    id: "delight",
    probe: `${DESK} [data-page="commenting"] .swap-glyph`,
    prop: "opacity",
  },
  { id: "reveal", probe: `${DESK} [data-list]`, prop: "opacity" },
  { id: "open", probe: `${DESK} [data-dtitle]`, prop: "left" },
];

/** The folder, served as itself; nothing outside it. */
function serve(): { stop: () => void; url: string } {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const path = decodeURIComponent(new URL(request.url).pathname);
      const file = normalize(join(DIR, path === "/" ? "index.html" : path));
      if (!file.startsWith(`${DIR}/`)) {
        return new Response("not here", { status: 404 });
      }
      return new Response(Bun.file(file));
    },
  });
  return {
    stop: () => server.stop(true),
    url: `http://127.0.0.1:${server.port}/`,
  };
}

const readValue = (page: Page, probe: string, prop: Motion["prop"]) =>
  page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel);
      if (!el) {
        return Number.NaN;
      }
      const box = el.getBoundingClientRect();
      if (p === "height") {
        return box.height;
      }
      if (p === "top") {
        return box.top + window.scrollY;
      }
      if (p === "left") {
        return box.left;
      }
      return Number.parseFloat(getComputedStyle(el).opacity);
    },
    [probe, prop] as const
  );

async function press(page: Page, group: string, value: string): Promise<void> {
  await page
    .locator(`[data-seg="${group}"] [data-value="${value}"]`)
    .first()
    .click();
  await stillWithin(page, "body", { ms: 3000 });
}

/** The switch's state, read off the engine: one pressed, and a segment's thumb under it. */
const switchState = (page: Page, group: string) =>
  page.evaluate((name) => {
    const set = document.querySelector(`[data-seg="${name}"]`);
    const pressed = [...(set?.querySelectorAll('[aria-pressed="true"]') ?? [])];
    const thumb = set?.querySelector(".seg-thumb")?.getBoundingClientRect();
    const on = pressed[0]?.getBoundingClientRect();
    let off = 0;
    if (thumb && on) {
      off = Math.max(
        Math.abs(thumb.left - on.left),
        Math.abs(thumb.width - on.width)
      );
    }
    return {
      count: pressed.length,
      value: (pressed[0] as HTMLElement | undefined)?.dataset.value ?? "",
      off,
    };
  }, group);

/** What one frame draws, read off the engine: the box rules every state is held to. */
const frameFacts = (page: Page, which: string) =>
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, so every rule it reads lives inside it
  page.evaluate((kind) => {
    const frame = document.querySelector<HTMLElement>(
      `#stage [data-frame="${kind}"]`
    );
    if (!frame) {
      return null;
    }
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.height > 0.5 && r.width > 0.5 && !el.closest("[inert]");
    };
    const rows = [...frame.querySelectorAll<HTMLElement>("[data-row]")].filter(
      (el) => !el.classList.contains("ghost-row")
    );
    const names = rows.map((el) => el.dataset.page ?? "");
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    const groups = [...frame.querySelectorAll<HTMLElement>("[data-group]")];
    const counted = groups.reduce(
      (sum, g) => sum + Number(g.dataset.count ?? 0),
      0
    );
    const lefts = rows
      .filter(shown)
      .map(
        (el) =>
          el.querySelector("[data-title] .t")?.getBoundingClientRect().left
      )
      .filter((x): x is number => x !== undefined);
    const edge = lefts.length ? Math.max(...lefts) - Math.min(...lefts) : 0;

    // A tile: a box that holds a glyph and no words, drawn with a fill, an edge or a shadow.
    const tiles: string[] = [];
    const isControl = (el: Element) =>
      el.matches("button, a, input, select, textarea, [role='button']");
    const painted = (el: Element) => {
      const s = getComputedStyle(el);
      const fill =
        s.backgroundImage !== "none" ||
        // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
        !/rgba\(0, 0, 0, 0\)|transparent/.test(s.backgroundColor);
      const drawnEdge = ["Top", "Right", "Bottom", "Left"].some(
        (side) =>
          Number.parseFloat(
            s.getPropertyValue(`border-${side.toLowerCase()}-width`)
          ) > 0 &&
          s.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none"
      );
      return fill || drawnEdge || s.boxShadow !== "none";
    };
    for (const glyph of frame.querySelectorAll("svg.ic, svg.ring")) {
      if (!shown(glyph)) {
        continue;
      }
      let el = glyph.parentElement;
      while (el && el !== frame) {
        if (isControl(el) || (el.textContent ?? "").trim() !== "") {
          break;
        }
        const r = el.getBoundingClientRect();
        if (r.width <= 48 && r.height <= 48 && painted(el)) {
          tiles.push(
            `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`
          );
          break;
        }
        el = el.parentElement;
      }
    }

    // The frame against every ancestor that clips, and against the window's width.
    const box = frame.getBoundingClientRect();
    const clipped: string[] = [];
    for (let el = frame.parentElement; el; el = el.parentElement) {
      const s = getComputedStyle(el);
      const clips =
        s.overflowX !== "visible" ||
        s.overflowY !== "visible" ||
        s.clipPath !== "none" ||
        // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
        /paint|strict|content/.test(s.contain);
      if (!clips || el === document.documentElement || el === document.body) {
        continue;
      }
      const r = el.getBoundingClientRect();
      if (
        box.left < r.left - 0.5 ||
        box.right > r.right + 0.5 ||
        box.top < r.top - 0.5 ||
        box.bottom > r.bottom + 0.5
      ) {
        clipped.push(`${el.tagName.toLowerCase()}#${el.id}.${el.className}`);
      }
    }
    const width = document.documentElement.clientWidth;
    const badge = frame.querySelector("[data-badge]")?.textContent ?? null;
    const root = frame.querySelector<HTMLElement>("[data-list-root]");
    const openGroup = frame.querySelector<HTMLElement>('[data-group="open"]');
    return {
      rows: rows.length,
      dupes,
      counted,
      groups: groups.length,
      edge,
      tiles,
      clipped,
      fits: box.left >= -0.5 && box.right <= width + 0.5,
      box: { left: box.left, right: box.right, width },
      badge,
      openCount: Number(root?.dataset.openCount ?? Number.NaN),
      openGroup: openGroup ? Number(openGroup.dataset.count) : null,
      heads: frame.querySelectorAll(".ghead").length,
      facts: frame.querySelectorAll("[data-heard-fact]").length,
      pills: frame.querySelectorAll(".state-pill").length,
      quiet: frame.querySelectorAll("[data-quiet] [data-quiet-fact]").length,
      acts: frame.querySelectorAll('[data-act="make-tasks"]').length,
    };
  }, which);

/** The whole page scanned screen by screen, and its width. */
async function sweep(page: Page): Promise<string[]> {
  const found: string[] = [];
  const { height, total, sideways } = await page.evaluate(() => ({
    height: window.innerHeight,
    total: document.documentElement.scrollHeight,
    sideways:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  if (sideways > 1) {
    found.push(`the page scrolls sideways by ${sideways}px`);
  }
  for (let y = 0; y < total; y += height - 60) {
    // biome-ignore lint/performance/noAwaitInLoops: one screen at a time, each scrolled to and read in turn
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await stillWithin(page, "body", { ms: 3000 });
    for (const line of await page.evaluate(scan)) {
      found.push(`at ${y}px: ${line}`);
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  return [...new Set(found)];
}

/** The box rules for one state, on both frames. */
async function boxes(kit: Kit, page: Page, tag: string, state: string) {
  for (const kind of ["desk", "phone"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one frame at a time
    const f = await frameFacts(page, kind);
    if (!f) {
      kit.check(
        `${tag} ${state} ${kind}: the frame is drawn`,
        false,
        "no frame"
      );
      continue;
    }
    kit.check(
      `${tag} ${state} ${kind}: fits whole in the window's width, and no ancestor clips it`,
      f.fits && f.clipped.length === 0,
      JSON.stringify({ box: f.box, clipped: f.clipped })
    );
    kit.check(
      `${tag} ${state} ${kind}: one row per page${WHOLE.has(state) ? `, the groups counting all ${PAGES}` : ""}`,
      f.dupes.length === 0 &&
        (!WHOLE.has(state) || (f.counted === PAGES && f.rows === PAGES)),
      JSON.stringify({ rows: f.rows, counted: f.counted, dupes: f.dupes })
    );
    kit.check(
      `${tag} ${state} ${kind}: every row's title on one start edge`,
      f.edge < 0.5,
      `${f.edge.toFixed(2)}px apart`
    );
    kit.check(
      `${tag} ${state} ${kind}: no glyph in a filled or bordered box of its own`,
      f.tiles.length === 0,
      f.tiles.slice(0, 4).join(", ")
    );
    if (kind === "desk") {
      const badge = f.badge === null ? 0 : Number(f.badge);
      kit.check(
        `${tag} ${state}: the tab's badge is the Open group's count (absent at 0)`,
        badge === (Number.isNaN(f.openCount) ? 0 : f.openCount) &&
          (f.openGroup === null || f.openGroup === badge) &&
          (badge > 0 || f.badge === null),
        JSON.stringify({
          badge: f.badge,
          open: f.openCount,
          group: f.openGroup,
        })
      );
    }
  }
}

function drawnRight(
  f: NonNullable<Awaited<ReturnType<typeof frameFacts>>>,
  drawn: string
): boolean {
  switch (drawn) {
    case "heads:5":
      return f.heads === 5;
    case "heads:2":
      return f.heads === 2;
    case "facts":
      return f.facts > 0 && f.pills === 0;
    case "pill":
      return f.pills > 0 && f.facts === 0;
    case "quiet":
      return f.quiet > 0;
    case "no-quiet":
      return f.quiet === 0;
    case "acts":
      return f.acts > 0;
    default:
      return f.acts === 0;
  }
}

async function everyState(kit: Kit, page: Page, tag: string): Promise<void> {
  for (const state of STATES) {
    // biome-ignore lint/performance/noAwaitInLoops: one state at a time, each drawn and read in turn
    await press(page, "State", state);
    const sw = await switchState(page, "State");
    const stamped = await page.evaluate(
      () => document.querySelector<HTMLElement>("#stage")?.dataset.state
    );
    kit.check(
      `${tag} ${state}: its switch shows it and the stage draws it`,
      sw.count === 1 && sw.value === state && stamped === state,
      JSON.stringify({ sw, stamped })
    );
    await boxes(kit, page, tag, state);
    const found = process.env.DL_QUICK ? [] : await sweep(page);
    kit.check(
      `${tag} ${state}: nothing spills, nothing covers text`,
      found.length === 0,
      found.slice(0, 6).join(" | ")
    );
  }
}

async function everyPick(kit: Kit, page: Page, tag: string): Promise<void> {
  for (const pick of PICKS) {
    // biome-ignore lint/performance/noAwaitInLoops: one switch at a time
    await press(page, "State", pick.state);
    for (const { value, drawn } of pick.values) {
      // biome-ignore lint/performance/noAwaitInLoops: one option at a time
      await press(page, pick.group, value);
      const sw = await switchState(page, pick.group);
      const stamped = await page.evaluate(
        (key) => document.querySelector<HTMLElement>("#stage")?.dataset[key],
        pick.key
      );
      const f = await frameFacts(page, "desk");
      kit.check(
        `${tag} ${pick.group} ${value}: the switch shows it (pressed, thumb under it) and the list draws it`,
        sw.count === 1 &&
          sw.value === value &&
          sw.off < 1 &&
          stamped === value &&
          f !== null &&
          drawnRight(f, drawn),
        JSON.stringify({
          sw,
          stamped,
          drawn,
          f: f && {
            heads: f.heads,
            facts: f.facts,
            pills: f.pills,
            quiet: f.quiet,
            acts: f.acts,
          },
        })
      );
      if (pick.values[0].value !== value) {
        await boxes(kit, page, tag, `${pick.group}=${value}`);
        const found = process.env.DL_QUICK ? [] : await sweep(page);
        kit.check(
          `${tag} ${pick.group} ${value}: nothing spills, nothing covers text`,
          found.length === 0,
          found.slice(0, 6).join(" | ")
        );
      }
    }
    await press(page, pick.group, pick.values[0].value);
  }
}

async function night(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "open2");
  await press(page, "Theme", "dark");
  const ground = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  kit.check(
    `${tag} Night: the page turns dark`,
    ground.dark && ground.scheme === "dark",
    JSON.stringify(ground)
  );
  const found = process.env.DL_QUICK ? [] : await sweep(page);
  kit.check(
    `${tag} Night open2: nothing spills, nothing covers text`,
    found.length === 0,
    found.slice(0, 6).join(" | ")
  );
  await press(page, "Theme", "light");
}

/** The panel the owner judges it in. */
async function inThePanel(kit: Kit, page: Page, tag: string): Promise<void> {
  // The panel the owner judges it in.
  await page.setViewportSize({ width: PANEL, height: 900 });
  for (const state of ["open2", "many", "search", "first"]) {
    // biome-ignore lint/performance/noAwaitInLoops: one state at a time
    await press(page, "State", state);
    await boxes(kit, page, `${tag}@${PANEL}`, state);
    const found = process.env.DL_QUICK ? [] : await sweep(page);
    kit.check(
      `${tag}@${PANEL} ${state}: nothing spills, nothing covers text`,
      found.length === 0,
      found.slice(0, 6).join(" | ")
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function everyMotion(kit: Kit, page: Page, tag: string): Promise<void> {
  for (const m of MOTIONS) {
    // biome-ignore lint/performance/noAwaitInLoops: one motion at a time on one page
    await press(page, "State", "open2");
    await page.locator(`[data-play="${m.id}"]`).scrollIntoViewIfNeeded();
    const read = await readMotion(
      page,
      () => page.locator(`[data-play="${m.id}"]`).click(),
      "#stage",
      {
        fractions: [0, 0.5, 1],
        read: () => readValue(page, m.probe, m.prop),
      }
    );
    await motionCheck(kit, page, `${tag} ${m.id}`, read, () =>
      readValue(page, m.probe, m.prop)
    );
  }
}

async function onePage(
  kit: Kit,
  url: string,
  engine: Engine,
  view: View
): Promise<void> {
  const tag = `${engine} ${view}`;
  const page = await kit.page(view, { engine, theme: "light" });
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !kitsOwnMessage(message.text())) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#stage [data-frame]");
  await page.evaluate(() => document.fonts.ready);

  await everyState(kit, page, tag);
  await everyPick(kit, page, tag);
  await night(kit, page, tag);
  if (view === "desk") {
    await inThePanel(kit, page, tag);
  }
  await everyMotion(kit, page, tag);

  kit.check(
    `${tag}: no console error, no page error`,
    errors.length === 0,
    errors.slice(0, 4).join(" | ")
  );
  await page.close();
}

/**
 * A motion read on the held clock: its value at 0, ½ and 1 moves (½ strictly
 * between the ends), and once let go it lands where 1 stood.
 */
async function motionCheck(
  kit: Kit,
  page: Page,
  name: string,
  read: { at: { fraction: number; value: unknown }[]; runs: unknown[] },
  landed: () => Promise<number>
): Promise<void> {
  const [start, mid, end] = read.at.map((each) => Number(each.value));
  await stillWithin(page, "body", { ms: 3000 });
  const rest = await landed();
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  kit.check(
    `${name}: moves continuously at 0, ½, 1 and lands at 1`,
    read.runs.length > 0 &&
      Number.isFinite(mid) &&
      hi - lo > 0.01 &&
      mid > lo &&
      mid < hi &&
      Math.abs(rest - end) < 0.5,
    `values ${[start, mid, end, rest].map((v) => Math.round(v * 1000) / 1000).join(" → ")} (the last at rest); ${read.runs.length} run(s)`
  );
}

const run = async (kit: Kit): Promise<void> => {
  const server = serve();
  try {
    const quick = Boolean(process.env.DL_QUICK);
    for (const engine of quick
      ? (["chromium"] as const)
      : (["chromium", "webkit"] as const)) {
      for (const view of ["desk", "phone"] as const) {
        // biome-ignore lint/performance/noAwaitInLoops: one page at a time
        await onePage(kit, server.url, engine, view);
      }
    }
  } finally {
    server.stop();
  }
};

const spec: Spec = { name: "decisions-list-preview", run };
export default spec;
