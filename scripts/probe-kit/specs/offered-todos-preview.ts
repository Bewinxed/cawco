/**
 * The offered to-dos preview (design-previews/offered-todos/, built by its
 * app/build.ts): a state machine, one state at a time at its production
 * width beside its switcher, every state a link (`?__state=…`). Served as a
 * folder and read on Chromium and WebKit, the desk's task pane at 462 on a
 * desk (1440 × 900, a mouse) and the phone at 390 (390 × 844, a finger).
 * The spec walks every state the switcher offers, light and dark:
 *
 * 1. Every state renders tsk-16's own words: each to-do, undo line, hint
 *    and card title drawn is one tsk-16 has (app/tsk16.js, read from the
 *    hub), and the state draws what it names: its rows, its counts, its
 *    undo line, its pending Keep all, its refusal in the hub's words. The
 *    undo line is one line: the dropped words cut to it, Undo at its end
 *    with no fill or edge. An offer's hint stands as close under its words
 *    on the phone as on the desk.
 * 2. The offer's dashed square is no control: hidden from readers, out of
 *    the tab order, and it takes no focus.
 * 3. Keep and Drop are bare glyphs: no fill, no edge, no shadow, a glyph
 *    and no words. Under a finger each has a 44 × 44 touch area, the two
 *    apart.
 * 4. The count and the ring read agreed to-dos alone: the To-dos head and
 *    the card's ring count only what was kept, the offers are counted under
 *    Offered and on the card as "N offered".
 * 5. One coral at most in the component.
 * 6. The overflow sweep (journeys/scan.ts) totals zero over every state.
 * 7. No console or page error.
 * 8. The keep moment, held and sought (the DevTools Animation domain on
 *    Chromium, the page's held clock on WebKit): every run Keep starts
 *    shares one start, the rows' travel one duration and one curve
 *    (--dur-panel, --ease-in-out: the house reflow's), and the kept row
 *    ends at the foot of the agreed rows.
 * 9. Ink, at night: the dashed square reads 3:1 on its ground, and Drop's
 *    glyph as strongly as Keep's.
 *
 *   bun scripts/probe-kit/run.ts offered-todos-preview
 *   OFFERED_ENGINES=chromium bun scripts/probe-kit/run.ts offered-todos-preview
 *   OFFERED_CAPTURES=1 … also writes the decision page's captures
 *   OFFERED_CAPTURES=offered,dropped … only those views' captures
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import {
  contrast,
  dx,
  dy,
  capture as inkCapture,
  peakContrast,
  px,
} from "../ink";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec } from "../kit";
import { ROOT, readMotion } from "../kit";

const DIR = join(ROOT, "design-previews", "offered-todos");
const CAPTURES = join(DIR, "captures");
const WIDTH: Record<string, number> = { desk: 462, phone: 390 };
/** tsk-16's own words, as the hub holds them (app/tsk16.js). */
const TD1 = "Full web run on committed fix";
const TD2 =
  "finish_item with findings (first-press cold cost, compositing not bounded)";
const SESSION = "Fix webkit-caw probe on obelisk";
const TITLE = "Make the webkit-caw probe pass on obelisk";
const REAL = new Set([TD1, TD2, SESSION, TITLE]);
/** A state's misses that are about its counts. */
const COUNTS = /count|ring|offered/;
const REFUSAL = `Couldn't keep “${TD1}”: tsk-16 has no to-do td-1.`;

/** What a state must draw. */
interface Want {
  agreed?: number;
  card?: { ring: string | null; offered: string | null };
  count?: string | null;
  dropped?: number;
  offered?: number;
  offeredCount?: string | null;
  pendingAll?: boolean;
  problem?: string;
  /** Today's list: rows only, read by its own markup. */
  rows?: number;
}

const WANT: Record<string, Want> = {
  live: { rows: 2, count: "0/2" },
  main: { rows: 2, count: null },
  "live-card": { card: { ring: "0/2", offered: null } },
  "main-card": { card: { ring: null, offered: null } },
  offered: { agreed: 0, offered: 2, count: null, offeredCount: "2" },
  "kept-one": { agreed: 1, offered: 1, count: "0/1", offeredCount: "1" },
  dropped: {
    agreed: 0,
    offered: 1,
    dropped: 1,
    count: null,
    offeredCount: "1",
  },
  "keeping-all": {
    agreed: 0,
    offered: 2,
    count: null,
    offeredCount: "2",
    pendingAll: true,
  },
  refused: {
    agreed: 0,
    offered: 2,
    count: null,
    offeredCount: "2",
    problem: REFUSAL,
  },
  "card-offered": { card: { ring: null, offered: "2 offered" } },
  "card-kept": { card: { ring: "0/1", offered: "1 offered" } },
};

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

/** Two frames past the last change, every finite run let go to its end. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
    for (const run of document.getAnimations()) {
      const end = run.effect?.getComputedTiming().endTime;
      if (typeof end === "number" && Number.isFinite(end)) {
        run.finish();
      }
    }
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done))
    );
  });
}

/** A state opened by its link, as a person opens one. */
async function go(page: Page, base: string, key: string): Promise<void> {
  await page.goto(new URL(`?__state=${key}`, base).href);
  await page.waitForSelector('[data-slot="stage"] [data-slot="region"]');
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

/** The switcher's links for one group, as the page draws them. */
async function links(page: Page, group: string): Promise<string[]> {
  return await page.evaluate(
    (g) =>
      [
        ...document.querySelectorAll<HTMLAnchorElement>(
          `[data-group="${g}"] a[data-entry]`
        ),
      ].map((a) => a.dataset.entry ?? ""),
    group
  );
}

interface StateRead {
  agreed: number;
  bareBad: string[];
  boxBad: string[];
  card: { ring: string | null; offered: string | null } | null;
  coarse: boolean;
  corals: string[];
  count: string | null;
  dark: boolean;
  dropped: number;
  groups: string[];
  /** Each offer's gap from its words' last line to its hint's line, px. */
  hintGaps: number[];
  hints: string[];
  hitBad: string[];
  key: string;
  offered: number;
  offeredCount: string | null;
  pendingAll: boolean;
  problem: string | null;
  rows: number;
  /** Each undo line that is not one line with Undo at its end, bare. */
  undoBad: string[];
  width: number;
  words: string[];
}

/** What the state draws, read in the page. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page
function readStage(): StateRead {
  const stage = document.querySelector<HTMLElement>('[data-slot="stage"]');
  const frame = stage?.querySelector<HTMLElement>(".frame");
  const region = stage?.querySelector<HTMLElement>('[data-slot="region"]');
  const all = (selector: string) => [
    ...(region?.querySelectorAll<HTMLElement>(selector) ?? []),
  ];
  const text = (el: Element | null | undefined) =>
    el?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  const words: string[] = [];
  for (const el of all('[data-slot="text"] > span:not([class])')) {
    words.push(text(el) ?? "");
  }
  for (const el of all('[data-slot="dropped"] p > span')) {
    // Dropped “…”.
    // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
    words.push((text(el) ?? "").replace(/^Dropped “(.*)”\.$/, "$1"));
  }
  const hints: string[] = [];
  for (const el of all('[data-slot="offered-by"] a')) {
    hints.push(text(el) ?? "");
    words.push(text(el.querySelector("span:not([class])")) ?? "");
  }
  for (const el of all('[data-slot="title"]')) {
    words.push(text(el) ?? "");
  }
  const coarse = matchMedia("(pointer: coarse)").matches;

  // The hint stands as close under the words on the phone as on the desk.
  const hintGaps: number[] = [];
  for (const row of all('li[data-slot="offered"]')) {
    const said = row.querySelector('[data-slot="text"] > span:not([class])');
    const hint = row.querySelector(
      '[data-slot="offered-by"] a span:not([class])'
    );
    if (said && hint) {
      hintGaps.push(
        Math.round(
          hint.getBoundingClientRect().top - said.getBoundingClientRect().bottom
        )
      );
    }
  }

  // The undo line: one line, its words cut to it, Undo at its end, bare.
  const undoBad: string[] = [];
  for (const line of all('li[data-slot="dropped"] p')) {
    const said = line.querySelector<HTMLElement>('[data-slot="dropped-words"]');
    const undo = line.querySelector<HTMLElement>('[data-slot="undo"]');
    if (!(said && undo)) {
      undoBad.push("no words or no Undo");
      continue;
    }
    const p = line.getBoundingClientRect();
    const w = said.getBoundingClientRect();
    const u = undo.getBoundingClientRect();
    const lines = Math.round(
      w.height / Number.parseFloat(getComputedStyle(said).lineHeight)
    );
    const s = getComputedStyle(undo);
    const centre = (r: DOMRect) => r.top + r.height / 2;
    if (
      lines !== 1 ||
      Math.abs(centre(w) - centre(u)) > 1 ||
      Math.abs(u.right - p.right) > 1 ||
      w.right > u.left ||
      s.borderTopColor !== "rgba(0, 0, 0, 0)" ||
      s.backgroundColor !== "rgba(0, 0, 0, 0)"
    ) {
      undoBad.push(
        `${lines} line(s), words ${Math.round(w.left)}–${Math.round(w.right)} at ${Math.round(centre(w))}, Undo ${Math.round(u.left)}–${Math.round(u.right)} at ${Math.round(centre(u))} (line ends ${Math.round(p.right)}), edge ${s.borderTopColor}, fill ${s.backgroundColor}`
      );
    }
  }

  // The dashed square: drawn, never a control.
  const boxBad: string[] = [];
  for (const box of all('[data-slot="offer-box"]')) {
    box.focus();
    if (
      box.getAttribute("aria-hidden") !== "true" ||
      box.tabIndex >= 0 ||
      box.hasAttribute("tabindex") ||
      box.hasAttribute("role") ||
      document.activeElement === box ||
      box.matches("a,button,input,select,textarea,[contenteditable]")
    ) {
      boxBad.push(box.outerHTML.slice(0, 80));
    }
  }

  // Keep and Drop: bare glyphs, and a finger's 44 apart.
  const bareBad: string[] = [];
  const hitBad: string[] = [];
  // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
  const CLEAR = /(rgba?\([^)]*,\s*0\)|\/\s*0\))$/;
  const transparent = (color: string) =>
    color === "transparent" || CLEAR.test(color);
  for (const pair of all('[data-slot="decide"]')) {
    const hits: { left: number; right: number; top: number; bottom: number }[] =
      [];
    for (const glyph of pair.querySelectorAll<HTMLElement>(
      '[data-slot="keep"], [data-slot="drop"]'
    )) {
      const s = getComputedStyle(glyph);
      const edges = ["Top", "Right", "Bottom", "Left"].map((side) =>
        s.getPropertyValue(`border-${side.toLowerCase()}-color`)
      );
      if (
        !(
          transparent(s.backgroundColor) &&
          (s.backgroundImage === "none" ||
            (s.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []).every(
              transparent
            )) &&
          edges.every(transparent)
        ) ||
        (s.boxShadow !== "none" && s.boxShadow !== "") ||
        !glyph.querySelector("svg") ||
        (glyph.textContent ?? "").trim() !== ""
      ) {
        bareBad.push(
          `${glyph.dataset.slot}: bg ${s.backgroundColor} ${s.backgroundImage} edge ${edges.join("/")} shadow ${s.boxShadow}`
        );
      }
      const r = glyph.getBoundingClientRect();
      const after = getComputedStyle(glyph, "::after");
      const hit =
        after.content === "none"
          ? { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
          : {
              left: r.left + Number.parseFloat(after.left),
              right: r.right - Number.parseFloat(after.right),
              top: r.top + Number.parseFloat(after.top),
              bottom: r.bottom - Number.parseFloat(after.bottom),
            };
      hits.push(hit);
      if (
        coarse &&
        (hit.right - hit.left < 43.5 || hit.bottom - hit.top < 43.5)
      ) {
        hitBad.push(
          `${glyph.dataset.slot}: ${Math.round(hit.right - hit.left)}×${Math.round(hit.bottom - hit.top)}`
        );
      }
    }
    if (coarse && hits.length === 2 && hits[0].right > hits[1].left + 0.5) {
      hitBad.push(
        `keep's area overlaps drop's by ${Math.round(hits[0].right - hits[1].left)}px`
      );
    }
  }

  // Coral: the house's action colour, wherever it is painted.
  const probe = document.createElement("span");
  probe.style.color = "var(--action-solid)";
  document.body.append(probe);
  const coral = getComputedStyle(probe).color;
  probe.remove();
  const corals: string[] = [];
  for (const el of [region, ...all("*")]) {
    if (!el || el.getClientRects().length === 0) {
      continue;
    }
    const s = getComputedStyle(el);
    if (
      [
        s.backgroundColor,
        s.color,
        s.borderTopColor,
        s.borderBottomColor,
        s.borderLeftColor,
        s.borderRightColor,
      ].includes(coral) &&
      !el.parentElement?.closest('[data-coral="counted"]')
    ) {
      el.dataset.coral = "counted";
      corals.push(
        el.tagName.toLowerCase() +
          (el.dataset.slot ? `[${el.dataset.slot}]` : "")
      );
    }
  }
  for (const el of all('[data-coral="counted"]')) {
    delete el.dataset.coral;
  }

  const card = region?.querySelector("[data-task-card]");
  const ringNum = card?.querySelector('[data-slot="foot"] svg')
    ? text(
        card.querySelector(
          '[data-slot="foot"] [title*="to-dos done"] [data-slot="num"]'
        )
      )
    : null;
  const keepAll = region?.querySelector<HTMLElement>('[data-slot="keep-all"]');
  return {
    key: stage?.dataset.state ?? "",
    width: Math.round(frame?.getBoundingClientRect().width ?? 0),
    dark: document.documentElement.classList.contains("dark"),
    groups: [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="switcher"] [data-group]'
      ),
    ].map(
      (group) =>
        `${group.dataset.group}:${group.querySelectorAll("a[href^='?__state=']").length}:${group.querySelectorAll("a[aria-current='page']").length}`
    ),
    words,
    hints,
    hintGaps,
    undoBad,
    rows: all("li[data-todo]").length,
    agreed: all('li[data-slot="todo"]').length,
    offered: all('li[data-slot="offered"]').length,
    dropped: all('li[data-slot="dropped"]').length,
    count: text(region?.querySelector('h3 [data-slot="count"]')),
    offeredCount: text(region?.querySelector('[data-slot="offered-count"]')),
    // Pending: busy, its label crossed to "Keeping…" (both words stand in
    // its cell, the one at rest faded out).
    pendingAll:
      keepAll?.getAttribute("aria-busy") === "true" &&
      (text(keepAll) ?? "").includes("Keeping…"),
    problem: text(region?.querySelector('[role="alert"]')),
    card: card
      ? {
          ring: ringNum,
          offered: text(card.querySelector('[data-slot="offered"]')),
        }
      : null,
    coarse,
    boxBad,
    bareBad,
    hitBad,
    corals,
  };
}

/** Whether a read state draws what its view wants; the misses, worded. */
function misses(view: string, read: StateRead): string[] {
  const want = WANT[view];
  const bad: string[] = [];
  const same = (name: string, got: unknown, wanted: unknown) => {
    if (wanted !== undefined && got !== wanted) {
      bad.push(
        `${name} ${JSON.stringify(got)} (want ${JSON.stringify(wanted)})`
      );
    }
  };
  if (want.card) {
    same("ring", read.card?.ring ?? null, want.card.ring);
    same("card offered", read.card?.offered ?? null, want.card.offered);
  } else {
    same("rows", read.rows, want.rows ?? read.rows);
    same("agreed", read.agreed, want.agreed);
    same("offered", read.offered, want.offered);
    same("dropped", read.dropped, want.dropped ?? 0);
    same("count", read.count, want.count);
    same("offered count", read.offeredCount, want.offeredCount);
    if (want.offeredCount) {
      same("Keep all pending", read.pendingAll, want.pendingAll ?? false);
    }
    same("problem", read.problem, want.problem ?? null);
    if (read.undoBad.length > 0) {
      bad.push(`undo line: ${read.undoBad.join("; ")}`);
    }
    if (want.offered !== undefined) {
      same("hints", read.hints.length, want.offered);
      for (const hint of read.hints) {
        same("hint", hint, `${SESSION} · 1w ago`);
      }
    }
  }
  return bad;
}

/** Leg 8: the keep moment held on the clock and sought through. */
async function keepLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: string,
  where: string
) {
  await go(page, base, `view:offered,where:${where},theme:light`);
  const row = '[data-slot="region"] li[data-todo="td-1"]';
  const held = await readMotion(
    page,
    () => page.locator(`${row} [data-slot="keep"]`).click(),
    '[data-slot="stage"]',
    {
      // Of the longest run: the rows' travel is its whole length on Chromium
      // and about half of it on WebKit, so a quarter is mid-travel on both.
      fractions: [0, 0.25, 1],
      read: () =>
        page.evaluate((r) => {
          const li = document.querySelector<HTMLElement>(r);
          return Math.round(li?.getBoundingClientRect().top ?? 0);
        }, row),
    }
  );
  const wants = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return {
      panel: css.getPropertyValue("--dur-panel").trim(),
      inOut: css.getPropertyValue("--ease-in-out").trim(),
    };
  });
  const panel = wants.panel.endsWith("ms")
    ? Number.parseFloat(wants.panel)
    : Number.parseFloat(wants.panel) * 1000;
  const runs = held.runs.filter((run) => run.type === "WebAnimation");
  const starts = new Set(
    runs.map((run) => (run.start === null ? "held" : Math.round(run.start)))
  );
  const travel = runs.filter(
    (run) => Math.round(run.end - run.delay) === Math.round(panel)
  );
  /** A curve by its numbers: `cubic-bezier(.77,0,.175,1)` is `cubic-bezier(0.77, 0, 0.175, 1)`. */
  const curveOf = (easing: string) =>
    (easing.match(/-?[\d.]+/g) ?? []).map(Number).join(",");
  const curves = new Set(travel.map((run) => curveOf(run.easing)));
  kit.check(
    `${engine} ${where}: Keep's runs start on one clock (${runs.length} runs, ${starts.size} start), the rows' travel ${travel.length} runs of ${panel}ms on the house in-out curve, every run ended, held and sought on the ${held.by === "clock" ? "DevTools Animation domain" : "page's held clock"}`,
    runs.length >= 2 &&
      starts.size === 1 &&
      travel.length >= 1 &&
      curves.size === 1 &&
      curves.has(curveOf(wants.inOut)) &&
      runs.every((run) => run.ended),
    `starts ${[...starts].join(",")} curves ${[...curves].join(" | ")} ${JSON.stringify(runs.map((r) => [r.target, r.name, r.start, r.end - r.delay, r.easing, r.ended]))}`
  );
  kit.note(
    `${engine} ${where} keep: ${JSON.stringify(held.runs.map((r) => [r.type, r.target, r.name, r.end - r.delay]))}`
  );
  const tops = held.at.map((at) => at.value);
  await settle(page);
  const after = await page.evaluate(readStage);
  kit.check(
    `${engine} ${where}: the kept row travels up as one object (top ${tops.join(" → ")}px) and lands an agreed to-do: To-dos ${after.count}, Offered ${after.offeredCount}`,
    tops.length === 3 &&
      tops[0] > tops[1] &&
      tops[1] > tops[2] &&
      after.count === "0/1" &&
      after.offeredCount === "1" &&
      after.agreed === 1,
    JSON.stringify(after)
  );
}

/**
 * Leg 9, ink: what drawing alone decides. At night the offer's dashed square
 * (the row's one mark of being offered) reads 3:1 on its ground (WCAG
 * 1.4.11, a graphical object), and Drop's glyph reads as strongly as Keep's.
 */
async function inkLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: string,
  where: string
) {
  await go(page, base, `view:offered,where:${where},theme:dark`);
  const boxes = await page.evaluate(() => {
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const region = document.querySelector('[data-slot="region"]');
    return {
      region: region ? rect(region) : null,
      squares: [
        ...document.querySelectorAll(
          '[data-slot="region"] [data-slot="offer-box"]'
        ),
      ].map(rect),
      keeps: [
        ...document.querySelectorAll('[data-slot="region"] [data-slot="keep"]'),
      ].map(rect),
      drops: [
        ...document.querySelectorAll('[data-slot="region"] [data-slot="drop"]'),
      ].map(rect),
    };
  });
  const r = await inkCapture(page);
  const peak = (box: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) =>
    // A pixel past the box on each side: the ground is in the read.
    peakContrast(r, {
      left: box.left - 1,
      right: box.right + 1,
      top: box.top - 1,
      bottom: box.bottom + 1,
    });
  /** A glyph's ink: its strongest pixel, and how many of its pixels read 3:1 on the ground. */
  const ink = (box: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) => {
    const ground = px(r, dx(r, box.left) + 1, dy(r, box.top) + 1);
    let strong = 0;
    for (
      let y = Math.floor(dy(r, box.top));
      y < Math.ceil(dy(r, box.bottom));
      y += 1
    ) {
      for (
        let x = Math.floor(dx(r, box.left));
        x < Math.ceil(dx(r, box.right));
        x += 1
      ) {
        if (contrast(px(r, x, y), ground) >= 3) {
          strong += 1;
        }
      }
    }
    return { peak: peak(box), strong };
  };
  const squares = boxes.squares.map(peak);
  const keeps = boxes.keeps.map(ink);
  const drops = boxes.drops.map(ink);
  const fixed = (n: number[]) => n.map((v) => v.toFixed(2)).join(", ");
  const said = (g: { peak: number; strong: number }[]) =>
    g
      .map((one) => `${one.peak.toFixed(2)}:1, ${one.strong}px at 3:1`)
      .join("; ");
  kit.check(
    `${engine} ${where} dark: the offer's dashed square reads 3:1 or more on its ground (${fixed(squares)}:1)`,
    squares.length === 2 && squares.every((c) => c >= 3)
  );
  kit.check(
    `${engine} ${where} dark: Drop's glyph reads as strongly as Keep's, as strong a pixel and as many at 3:1 (Drop ${said(drops)}; Keep ${said(keeps)})`,
    drops.length === 2 &&
      keeps.length === 2 &&
      drops.every(
        (d, i) =>
          d.peak >= 3 &&
          d.peak >= (keeps[i]?.peak ?? 0) - 0.25 &&
          d.strong >= (keeps[i]?.strong ?? 0)
      )
  );
}

/** The decision page's captures: the component region alone, at DPR 1. */
async function capture(
  page: Page,
  base: string,
  key: string,
  file: string
): Promise<void> {
  await go(page, base, key);
  // A press the page made (Drop, Keep all) leaves the focus on what it put
  // there, drawn as a keyboard's ring: the picture is of the state at rest.
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur()
  );
  await page
    .locator('[data-slot="stage"] [data-slot="region"]')
    .screenshot({ path: join(CAPTURES, file), animations: "disabled" });
}

const spec: Spec = {
  name: "offered-todos-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine, place and state the switcher offers, each leg in turn
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (process.env.OFFERED_ENGINES ?? "chromium,webkit").split(
        ","
      ) as Engine[];
      /** Which views to capture: every one (`1`), or those named (`offered,dropped`). */
      const shoot = process.env.OFFERED_CAPTURES ?? "";
      for (const engine of engines) {
        /** Each place's gaps from an offer's words to its hint, light and dark. */
        const gaps: Partial<Record<string, number[]>> = {};
        for (const where of ["desk", "phone"]) {
          const errors: string[] = [];
          // biome-ignore lint/performance/noAwaitInLoops: one engine and place at a time
          const page = await kit.page(where === "desk" ? "desk" : "phone", {
            engine,
            scale: 1,
          });
          page.on("console", (message) => {
            if (message.type() === "error") {
              errors.push(message.text());
            }
          });
          page.on("pageerror", (error) => errors.push(String(error)));
          await go(page, base, `view:offered,where:${where},theme:light`);
          const views = [
            ...(await links(page, "today")),
            ...(await links(page, "design")),
          ];
          let states = 0;
          let spills = 0;
          const bad: string[] = [];
          const strangers = new Set<string>();
          const boxBad: string[] = [];
          const bareBad: string[] = [];
          const hitBad: string[] = [];
          const coralBad: string[] = [];
          let glyphs = 0;
          let coarse = false;
          for (const view of views) {
            for (const theme of ["light", "dark"]) {
              const key = `view:${view},where:${where},theme:${theme}`;
              // biome-ignore lint/performance/noAwaitInLoops: one state on the page at a time
              await go(page, base, key);
              const read = await page.evaluate(readStage);
              states += 1;
              ({ coarse } = read);
              const groupsOk =
                read.groups.length === 4 &&
                read.groups.filter((g) => g.endsWith(":1")).length === 3;
              const miss = misses(view, read);
              if (
                read.key !== key ||
                read.width !== WIDTH[where] ||
                read.dark !== (theme === "dark") ||
                !groupsOk ||
                read.words.length === 0 ||
                miss.length > 0
              ) {
                bad.push(
                  `${key}: width ${read.width}, dark ${read.dark}, groups ${read.groups.join(" ")}, words ${read.words.length}; ${miss.join("; ")}`
                );
              }
              for (const word of read.words) {
                if (!REAL.has(word)) {
                  strangers.add(word);
                }
              }
              if (view === "offered") {
                gaps[where] = [...(gaps[where] ?? []), ...read.hintGaps];
              }
              boxBad.push(...read.boxBad.map((b) => `${key}: ${b}`));
              bareBad.push(...read.bareBad.map((b) => `${key}: ${b}`));
              hitBad.push(...read.hitBad.map((b) => `${key}: ${b}`));
              glyphs += await page
                .locator(
                  '[data-slot="region"] [data-slot="keep"], [data-slot="region"] [data-slot="drop"]'
                )
                .count();
              if (read.corals.length > 1) {
                coralBad.push(`${key}: ${read.corals.join(", ")}`);
              }
              const findings = await page.evaluate(scan);
              spills += findings.length;
              if (findings.length > 0) {
                kit.note(
                  `${engine} ${key}: ${findings.slice(0, 3).join(" | ")}`
                );
              }
            }
          }
          kit.check(
            `${engine} ${where}: every state renders what it names at ${WIDTH[where]} (${states} states: ${views.join(", ")}; light and dark), each switcher group a set of links with one chosen`,
            bad.length === 0 && states === views.length * 2,
            bad.slice(0, 4).join(" | ")
          );
          kit.check(
            `${engine} ${where}: every to-do, undo line, hint and card title drawn is tsk-16's own (none made up)`,
            strangers.size === 0,
            [...strangers].slice(0, 4).join(" | ")
          );
          kit.check(
            `${engine} ${where}: the offer's dashed square is no control (hidden from readers, out of the tab order, takes no focus)`,
            boxBad.length === 0,
            boxBad.slice(0, 3).join(" | ")
          );
          kit.check(
            `${engine} ${where}: Keep and Drop are bare glyphs, no fill, edge or shadow (${glyphs} read)`,
            glyphs > 0 && bareBad.length === 0,
            bareBad.slice(0, 3).join(" | ")
          );
          if (where === "phone") {
            kit.check(
              `${engine} phone: under a finger (pointer: coarse ${coarse}) Keep and Drop each have a 44×44 touch area, the two apart`,
              coarse && hitBad.length === 0,
              hitBad.slice(0, 3).join(" | ")
            );
          }
          kit.check(
            `${engine} ${where}: the To-dos count and the card's ring read agreed to-dos alone; offers are counted under Offered and as "N offered"`,
            bad.filter((b) => COUNTS.test(b)).length === 0
          );
          kit.check(
            `${engine} ${where}: one coral at most in the component, every state`,
            coralBad.length === 0,
            coralBad.slice(0, 3).join(" | ")
          );
          kit.check(
            `${engine} ${where}: the overflow sweep over all ${states} states totals ${spills}`,
            spills === 0
          );
          kit.check(
            `${engine} ${where}: the undo line is one line, the dropped words cut to it, Undo at its end with no fill or edge`,
            bad.filter((b) => b.includes("undo line")).length === 0
          );
          await keepLeg(kit, page, base, engine, where);
          await inkLeg(kit, page, base, engine, where);
          kit.check(
            `${engine} ${where}: no console or page error`,
            errors.length === 0,
            errors.slice(0, 4).join(" | ")
          );
          if (shoot && engine === "chromium") {
            mkdirSync(CAPTURES, { recursive: true });
            for (const view of views.filter(
              (v) => shoot === "1" || shoot.split(",").includes(v)
            )) {
              for (const theme of ["light", "dark"]) {
                // biome-ignore lint/performance/noAwaitInLoops: one state on the page at a time
                await capture(
                  page,
                  base,
                  `view:${view},where:${where},theme:${theme}`,
                  `${where}-${view}-${theme}.png`
                );
              }
            }
          }
          await page.close();
        }
        const { desk = [], phone = [] } = gaps;
        kit.check(
          `${engine}: an offer's hint stands the same step under its words, one line of words or two, on the phone as on the desk, light and dark (desk ${desk.join(", ")}px; phone ${phone.join(", ")}px)`,
          desk.length === 4 &&
            phone.length === 4 &&
            [...desk, ...phone].every((g) => Math.abs(g - (desk[0] ?? 0)) <= 1)
        );
      }
      if (shoot) {
        await writeManifest();
      }
    } finally {
      server.stop(true);
    }
  },
};

/** The captures' manifest: each design state beside Today, said plainly. */
async function writeManifest(): Promise<void> {
  // Each view's caption, as the switcher shows it.
  const { VIEWS } = (await import(join(DIR, "app", "states.js"))) as {
    VIEWS: { value: string; caption: string }[];
  };
  const captions = Object.fromEntries(
    VIEWS.map((view) => [view.value, view.caption])
  );
  const today: Record<string, string[]> = {
    offered: ["live", "main"],
    "kept-one": ["live", "main"],
    dropped: ["live", "main"],
    "keeping-all": ["live", "main"],
    refused: ["live", "main"],
    "card-offered": ["live-card", "main-card"],
    "card-kept": ["live-card", "main-card"],
  };
  const entries: object[] = [];
  for (const where of ["desk", "phone"]) {
    const place = where === "desk" ? "Desk" : "Phone";
    for (const [view, besides] of Object.entries(today)) {
      for (const theme of ["light", "dark"]) {
        entries.push({
          where: place,
          theme,
          state: view,
          design: `${where}-${view}-${theme}.png`,
          today: besides.map((b) => `${where}-${b}-${theme}.png`),
          caption: `${place}, ${theme}. ${captions[view]} Beside it, Today: ${besides.map((b) => captions[b]).join(" / ")}`,
        });
      }
    }
  }
  writeFileSync(
    join(CAPTURES, "manifest.json"),
    `${JSON.stringify(
      {
        made: "2026-10-25, the page's clock at 2026-10-25 12:00 +0300 (app/tsk16.js NOW)",
        scale: 1,
        region:
          'the component alone ([data-slot="region"]): the to-do list, or the board card',
        widths: {
          Desk: "the desk's task pane, 462px",
          Phone: "the phone, 390px",
        },
        captures: entries,
      },
      null,
      2
    )}\n`
  );
}

export default spec;
