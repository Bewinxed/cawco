/**
 * The suggestions preview (design-previews/suggestions/, built by its
 * app/build.ts): a state machine, one state at a time at its production
 * width beside its switcher, every state a link (`?__state=…`). Served as a
 * folder and read on Chromium and WebKit at a desk (1440 × 900). The spec
 * walks every state the switcher offers, as its links name them: each
 * direction (Today, Unsent drafts, The ledger, The tray), each of its
 * Where entries, each of its Data entries, light and dark.
 *
 * 1. Every state renders the owner's own starters at its width: the stage
 *    names the state, the frame stands at the Where's width (380, 725 or
 *    390), the theme is the state's, the switcher's groups are links with
 *    one chosen each, the state draws as many of his suggestions as it
 *    should (none, one, three, four of seven with "3 more", seven), and
 *    every sentence and reason drawn is one the hub wrote for him
 *    (app/starters.tsv): nothing made up. A loading state draws its
 *    placeholders and no suggestion, and holds still until the switcher
 *    moves.
 * 2. The overflow sweep (journeys/scan.ts: nothing spills, no control
 *    covers text) totals zero over every state.
 * 3. No console or page error.
 * 4. The press moments, each held on the clock (the DevTools Animation
 *    domain on Chromium, the page's own held clock on WebKit) and sought
 *    through: the drafts' travel into the box, the ledger's pencil→check,
 *    the tray's carry into the field. Every run a press starts at one moment shares one
 *    start, one duration and one easing (one clock), on the house's
 *    tokens; and the press ends with his words in the box, the caret after
 *    them, and the live region saying "In the message box, ready to edit".
 *
 *   bun scripts/probe-kit/run.ts suggestions-preview
 *   SUGGESTIONS_ENGINES=chromium bun scripts/probe-kit/run.ts suggestions-preview
 */
import { readFileSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { capture, contrast, off, px, type Rgb } from "../ink";
import { scan } from "../journeys/scan";
import type { Engine, Kit, Spec } from "../kit";
import { ROOT, readMotion } from "../kit";

const DIR = join(ROOT, "design-previews", "suggestions");
const WIDTH: Record<string, number> = {
  thread: 380,
  board: 725,
  phone: 390,
  keyboard: 390,
};
/** His starters as the hub wrote them: every sentence and every reason. */
const HIS = (() => {
  const [, ...rows] = readFileSync(join(DIR, "app", "starters.tsv"), "utf8")
    .trim()
    .split("\n");
  const cells = rows.map((row) => row.split("\t"));
  return {
    texts: cells.map((c) => c[4] ?? ""),
    reasons: cells.map((c) => c[5] ?? ""),
  };
})();
/** The press each new direction makes, and the house duration its clock runs on. */
/**
 * The captures for a reviewer (into `kit.out`, Chromium alone): the states
 * the review's two findings changed. Every tray state's field moved to
 * Today's foot (finding 1), so the tray's at each where; the cut lists
 * now under the house edge fade (finding 2): Today's seven, the drafts' and
 * the ledger's seven expanded, the tray's seven expanded; and the looks
 * review's: the drafts' and the ledger's board on the composer's edges,
 * their placeholders, and Caw by night.
 */
const SHOTS: string[] = [
  ...["thread", "board", "phone", "keyboard"].flatMap((where) =>
    ["three", "seven-collapsed", "seven-expanded", "filled", "loading"].map(
      (data) => `direction:tray,where:${where},data:${data},theme:light`
    )
  ),
  "direction:tray,where:thread,data:seven-expanded,theme:dark",
  "direction:today,where:thread,data:seven,theme:light",
  "direction:today,where:phone,data:seven,theme:light",
  "direction:drafts,where:thread,data:seven-expanded,theme:light",
  "direction:ledger,where:thread,data:seven-expanded,theme:light",
  // The looks review: sets on the composer's edges, placeholders at their rows' size, Caw by night.
  "direction:drafts,where:board,data:three,theme:light",
  "direction:ledger,where:board,data:three,theme:light",
  ...["thread", "board", "phone"].flatMap((where) =>
    ["drafts", "ledger"].map(
      (direction) =>
        `direction:${direction},where:${where},data:loading,theme:light`
    )
  ),
  "direction:today,where:thread,data:three,theme:dark",
];
const PRESSES: [string, string, string][] = [
  ["drafts", "the drafts' travel into the box", "--dur-morph"],
  ["ledger", "the ledger's pencil→check", "--dur-control"],
  ["tray", "the tray's carry into the field", "--dur-exit"],
];

/** How many of his suggestions a state draws, and whether it draws placeholders. */
function expected(
  direction: string,
  where: string,
  data: string
): { items: number; placeholders: boolean } {
  const total =
    { one: 1, "seven-collapsed": 7, "seven-expanded": 7, seven: 7 }[data] ?? 3;
  const shown =
    { one: 1, "seven-collapsed": 4, "seven-expanded": 7, seven: 7 }[data] ?? 3;
  if (data === "loading") {
    // The drafts stand down while the keyboard is up, placeholders and all.
    return {
      items: 0,
      placeholders: !(direction === "drafts" && where === "keyboard"),
    };
  }
  if (data === "none") {
    return { items: 0, placeholders: false };
  }
  switch (direction) {
    case "drafts":
      return {
        items: where === "keyboard" || data === "typing" ? 0 : shown,
        placeholders: false,
      };
    case "ledger":
      return data === "refresh"
        ? { items: 0, placeholders: true }
        : { items: shown, placeholders: false };
    case "tray": {
      if (data === "sent") {
        return { items: 0, placeholders: false };
      }
      // Words in the box (or the keyboard up): the tray is its chip row, every one of his.
      const chips =
        where === "keyboard" || data === "filled" || data === "scrolled";
      return { items: chips ? total : shown, placeholders: false };
    }
    default:
      return { items: shown, placeholders: false };
  }
}

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
    await new Promise((done) => requestAnimationFrame(done));
  });
}

/**
 * A state opened by its link, as a person opens one: the page loaded at its
 * address. (Moving in place by the history API, as the switcher itself
 * does, WebKit refuses past a hundred moves in ten seconds.)
 */
async function go(page: Page, base: string, href: string): Promise<void> {
  await page.goto(new URL(href, base).href);
  await page.waitForSelector('[data-slot="stage"]');
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

/** The switcher's links for one group, as the page draws them. */
async function links(
  page: Page,
  group: string
): Promise<{ value: string; href: string }[]> {
  return await page.evaluate(
    (g) =>
      [
        ...document.querySelectorAll<HTMLAnchorElement>(
          `[data-group="${g}"] a[data-entry]`
        ),
      ].map((a) => ({
        value: a.dataset.entry ?? "",
        href: a.getAttribute("href") ?? "",
      })),
    group
  );
}

interface Box {
  b: number;
  l: number;
  r: number;
  t: number;
}

interface StateRead {
  /** The surroundings, each box relative to the frame: Caw, the heading, the composer's box. */
  around: {
    caw: Box | null;
    heading: Box | null;
    box: Box | null;
    /** The composer's field, where the person writes. */
    field: Box | null;
    words: string;
  };
  /** The set, or the tray's rows, run past their room. */
  clipped: boolean;
  dark: boolean;
  /** Every room that runs past itself wears the house edge fade (kit-edge-fade-block), its foot faded over the house 40px. */
  faded: boolean;
  /** The composer stands whole inside the frame. */
  footInside: boolean;
  groups: string[];
  /** The heading stands whole in its room, never pushed out by what grows under it. */
  headingShown: boolean;
  items: number;
  key: string;
  /** Small text (reasons, kicker, meta) under 4.5:1 on its ground. */
  low: string[];
  /** The lowest ratio read. */
  lowest: number;
  placeholders: number;
  strangers: string[];
  width: number;
}

/** What the state draws, read in the page. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its helpers inside it
function readStage(his: { texts: string[]; reasons: string[] }): StateRead {
  const stage = document.querySelector<HTMLElement>('[data-slot="stage"]');
  const frame = stage?.querySelector<HTMLElement>(".frame");
  const drawn = (el: Element) => el.getClientRects().length > 0;
  const items = [
    ...(stage?.querySelectorAll('[data-slot="suggestion"]') ?? []),
  ].filter(drawn);
  const strangers: string[] = [];
  for (const run of stage?.querySelectorAll('[data-slot="suggestion-text"]') ??
    []) {
    const text = run.textContent?.trim() ?? "";
    if (!his.texts.includes(text)) {
      strangers.push(text);
    }
  }
  for (const run of stage?.querySelectorAll(
    '[data-slot="suggestion-reason"]'
  ) ?? []) {
    const text = run.textContent?.trim() ?? "";
    if (!his.reasons.includes(text)) {
      strangers.push(text);
    }
  }
  const frameBox = frame?.getBoundingClientRect();
  const rel = (el: Element | null | undefined): Box | null => {
    if (!(el && frameBox)) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      l: Math.round(r.left - frameBox.left),
      t: Math.round(r.top - frameBox.top),
      r: Math.round(r.right - frameBox.left),
      b: Math.round(r.bottom - frameBox.top),
    };
  };
  const box = stage?.querySelector('[data-slot="foot"] [data-slot="composer"]');
  const boxRect = box?.getBoundingClientRect();
  const scroller = stage?.querySelector<HTMLElement>('[data-slot="scroll"]');
  // Every room that runs past itself: the set above the composer, and the
  // tray's own rows once they reach the heading's room.
  const cuts = [
    ...(stage?.querySelectorAll<HTMLElement>(
      '[data-slot="scroll"], [data-slot="tray-rows"]'
    ) ?? []),
  ].filter((el) => el.scrollHeight > el.clientHeight + 1);
  const clipped = cuts.length > 0;
  // Small text against its ground: the first opaque fill behind it.
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (color: string) => {
    if (!ctx) {
      return [0, 0, 0, 0];
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  };
  const lum = (color: string) => {
    const c = rgba(color)
      .slice(0, 3)
      .map((v) => {
        const x = v / 255;
        return x <= 0.040_45 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
    return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0);
  };
  const ground = (el: Element | null): string => {
    for (let up = el; up; up = up.parentElement) {
      const fill = getComputedStyle(up).backgroundColor;
      if ((rgba(fill)[3] ?? 0) > 250) {
        return fill;
      }
    }
    return getComputedStyle(document.documentElement).backgroundColor;
  };
  const low: string[] = [];
  let lowest = 99;
  for (const el of stage?.querySelectorAll<HTMLElement>(
    '[data-slot="suggestion-reason"], [data-slot="heading"], .kicker > span, .provenance, [data-slot="tray-count"] span, .head > span, .state-note'
  ) ?? []) {
    if (!drawn(el) || Number(getComputedStyle(el).opacity) < 1) {
      continue;
    }
    const a = lum(getComputedStyle(el).color);
    const b = lum(ground(el));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    lowest = Math.min(lowest, ratio);
    if (ratio < 4.5) {
      low.push(`"${el.textContent?.trim().slice(0, 24)}" ${ratio.toFixed(2)}`);
    }
  }
  return {
    around: {
      caw: rel(
        [...(stage?.querySelectorAll('[data-slot="hero"] img') ?? [])].find(
          drawn
        )
      ),
      heading: rel(stage?.querySelector('[data-slot="heading"]')),
      box: rel(box),
      field: rel(box?.querySelector('[data-slot="composer-field"]')),
      words:
        stage?.querySelector('[data-slot="heading"]')?.textContent?.trim() ??
        "",
    },
    clipped,
    faded:
      clipped &&
      cuts.every(
        (el) =>
          el.classList.contains("kit-edge-fade-block") &&
          getComputedStyle(el).getPropertyValue("--fade-len").trim() ===
            "40px" &&
          // The house fade's own scroll-driven length at the foot, as it stands.
          getComputedStyle(el).getPropertyValue("--fade-end").trim() === "40px"
      ),
    headingShown: (() => {
      const h = stage
        ?.querySelector('[data-slot="heading"]')
        ?.getBoundingClientRect();
      const room = scroller?.getBoundingClientRect();
      return Boolean(
        h &&
        room &&
        h.height > 0 &&
        h.top >= room.top - 1 &&
        h.bottom <= room.bottom + 1
      );
    })(),
    footInside: Boolean(
      boxRect &&
      frameBox &&
      boxRect.top >= frameBox.top - 1 &&
      boxRect.bottom <= frameBox.bottom + 1
    ),
    low,
    lowest,
    key: stage?.dataset.state ?? "",
    width: Math.round(frame?.getBoundingClientRect().width ?? 0),
    dark: document.documentElement.classList.contains("dark"),
    groups: [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="switcher"] [data-group]'
      ),
    ].map((group) => {
      const all = group.querySelectorAll("a[href^='?__state=']").length;
      const on = group.querySelectorAll("a[aria-current='page']").length;
      return `${group.dataset.group}:${all}:${on}`;
    }),
    items: items.length,
    placeholders: [
      ...(stage?.querySelectorAll('[data-slot="skeleton"]') ?? []),
    ].filter(drawn).length,
    strangers,
  };
}

/**
 * Ink across the cut: each room that runs past itself (the set's scroller,
 * the tray's rows) captured as drawn, and each band of device rows read for
 * its strongest contrast against that room's ground (its commonest colour).
 * Above the fade the cut rows' words stand at full ink; in the fade's last
 * 4px they are all but gone. Read in the pixels, since a mask is what
 * drawing alone decides. The weakest cut answers for the state.
 */
async function fadeInk(page: Page): Promise<{ foot: number; body: number }> {
  const rooms = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-slot="stage"] [data-slot="scroll"], [data-slot="stage"] [data-slot="tray-rows"]'
      ),
    ]
      .filter((el) => el.scrollHeight > el.clientHeight + 1)
      .map((el) => {
        // Whole pixels inside the room, and in from its sides past the
        // composer's rounded corners (the tray's rows meet its foot there),
        // so a frame edge beside the cut stays out of the read.
        const r = el.getBoundingClientRect();
        const corner = 16;
        const x = Math.ceil(r.left) + corner;
        const y = Math.ceil(r.top);
        return {
          x,
          y,
          width: Math.floor(r.right) - corner - x,
          height: Math.floor(r.bottom) - y,
        };
      })
  );
  const shots = await Promise.all(rooms.map((room) => capture(page, room)));
  let foot = 1;
  let body = 99;
  for (const shot of shots) {
    const counts = new Map<string, { rgb: Rgb; n: number }>();
    for (let y = 0; y < shot.height; y += 1) {
      for (let x = 0; x < shot.width; x += 1) {
        const rgb = px(shot, x, y);
        const one = counts.get(rgb.join(",")) ?? { rgb, n: 0 };
        one.n += 1;
        counts.set(rgb.join(","), one);
      }
    }
    const ground = [...counts.values()].reduce((p, q) =>
      q.n > p.n ? q : p
    ).rgb;
    const strongest = (fromEnd: number, toEnd: number) => {
      let most = 1;
      for (
        let y = Math.floor(shot.height - toEnd * shot.scale);
        y < shot.height - fromEnd * shot.scale;
        y += 1
      ) {
        for (let x = 0; x < shot.width; x += 1) {
          most = Math.max(most, contrast(px(shot, x, y), ground));
        }
      }
      return most;
    };
    foot = Math.max(foot, strongest(0, 4));
    body = Math.min(body, strongest(40, 80));
  }
  return { foot, body };
}

/**
 * The looks review's findings (cockpit-483f82d8): every direction's
 * suggestions stand on the composer's own edges, and every placeholder
 * stands at the size of the row it holds the place of, and the whole set of
 * placeholders at the size and shape of the set it stands for (the drafts'
 * reason lines and provenance footer, the tray's chip row with the keyboard
 * up). Read at three and at loading, light, at each where.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one leg serialized per state, its readings inside it
async function looksLeg(kit: Kit, page: Page, base: string, engine: string) {
  const edgeBad: string[] = [];
  const edgeSaid: string[] = [];
  const boneBad: string[] = [];
  const setBad: string[] = [];
  const setSaid: string[] = [];
  let bones = 0;
  /** The set a direction's placeholders stand in for, whole. */
  const SET: Record<string, string> = {
    drafts: '[data-slot="stage"] .stack',
    ledger: '[data-slot="stage"] [aria-labelledby="ledger-kicker"]',
    tray: '[data-slot="stage"] .tray',
  };
  for (const direction of ["today", "drafts", "ledger", "tray"]) {
    const wheres = ["thread", "board", "phone"];
    if (direction === "drafts" || direction === "tray") {
      wheres.push("keyboard");
    }
    for (const where of wheres) {
      // biome-ignore lint/performance/noAwaitInLoops: one state on the page at a time
      await go(
        page,
        base,
        `?__state=direction:${direction},where:${where},data:three,theme:light`
      );
      const real = await page.evaluate(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one function serialized into the page, its readings inside it
        ([d, setAt]) => {
          const stage = document.querySelector('[data-slot="stage"]');
          const box = stage
            ?.querySelector('[data-slot="foot"] [data-slot="composer"]')
            ?.getBoundingClientRect();
          const units = [
            ...(stage?.querySelectorAll<HTMLElement>(
              '[data-slot="suggestion"]'
            ) ?? []),
          ].map((el) => el.getBoundingClientRect());
          // The real row as it stands for a one-line suggestion (and a
          // one-line reason where the reason shows): a copy of the first,
          // its words cut to one, measured and taken out again.
          const first = stage?.querySelector<HTMLElement>(
            '[data-slot="suggestion"]'
          );
          const unit =
            d === "drafts"
              ? first?.closest(".item")
              : (first?.closest("li") ?? first);
          let oneLine = 0;
          if (unit?.parentElement) {
            const copy = unit.cloneNode(true) as HTMLElement;
            for (const words of copy.querySelectorAll(
              '[data-slot="suggestion-text"], [data-slot="suggestion-reason"]'
            )) {
              words.textContent = "Word";
            }
            unit.parentElement.append(copy);
            oneLine = copy.getBoundingClientRect().height;
            copy.remove();
          }
          // The whole set with every suggestion and reason cut to one line,
          // in place (the next state is a fresh page).
          for (const words of stage?.querySelectorAll(
            '[data-slot="suggestion-text"], [data-slot="suggestion-reason"]'
          ) ?? []) {
            words.textContent = "Word";
          }
          const whole = setAt ? document.querySelector(setAt) : null;
          return {
            setH: whole ? whole.getBoundingClientRect().height : -1,
            box: box ? { l: box.left, r: box.right } : null,
            start: Math.min(...units.map((u) => u.left)),
            end: Math.max(...units.map((u) => u.right)),
            oneLine,
          };
        },
        [direction, SET[direction] ?? ""] as const
      );
      // Every set ends on the composer's inline end; a full-width set (all
      // but the drafts' right-aligned stack) starts on its start too. The
      // tray's rows stand inside the composer's 1px edge.
      const inset = direction === "tray" ? 1 : 0;
      const near = (a: number, b: number) => Math.abs(a - b) <= inset + 0.5;
      const ok =
        real.box !== null &&
        near(real.end, real.box.r - 0) &&
        (direction === "drafts" || near(real.start, real.box.l));
      // With the keyboard up the drafts stand down and the tray's chip row
      // scrolls past the composer by design: no edges to read there.
      const said = `${direction}@${where} ${Math.round(real.start)}–${Math.round(real.end)}/${Math.round(real.box?.l ?? 0)}–${Math.round(real.box?.r ?? 0)}`;
      if (where !== "keyboard") {
        edgeSaid.push(said);
      }
      if (!ok && where !== "keyboard") {
        edgeBad.push(said);
      }
      if (direction === "today") {
        continue;
      }
      await go(
        page,
        base,
        `?__state=direction:${direction},where:${where},data:loading,theme:light`
      );
      const loadingSet = await page.evaluate((setAt) => {
        const whole = setAt ? document.querySelector(setAt) : null;
        return whole ? whole.getBoundingClientRect().height : -1;
      }, SET[direction] ?? "");
      setSaid.push(
        `${direction}@${where} ${loadingSet.toFixed(1)}/${real.setH.toFixed(1)}`
      );
      if (Math.abs(loadingSet - real.setH) > 0.5) {
        setBad.push(setSaid.at(-1) ?? "");
      }
      const held = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-slot="stage"] .placeholder, [data-slot="stage"] li.bones, [data-slot="stage"] .chip-bones'
          ),
        ].map((el) => {
          const r = el.getBoundingClientRect();
          const room = el.parentElement?.getBoundingClientRect();
          const inside = [
            ...el.querySelectorAll('[data-slot="skeleton"], .loops'),
          ]
            // A bar its row hides (the tray's reason bar at a desk) is not drawn.
            .filter((bar) => bar.getClientRects().length > 0)
            .map((bar) => bar.getBoundingClientRect())
            .every(
              (bar) =>
                bar.width > 0 &&
                bar.height > 0 &&
                bar.left >= r.left - 0.5 &&
                bar.right <= r.right + 0.5 &&
                bar.top >= r.top - 0.5 &&
                bar.bottom <= r.bottom + 0.5
            );
          return {
            h: r.height,
            // A chip row scrolls sideways by design: its chips run past it.
            fits:
              inside &&
              (el.classList.contains("chip-bones") ||
                Boolean(room && r.right <= room.right + 0.5)),
          };
        })
      );
      for (const one of held) {
        bones += 1;
        if (Math.abs(one.h - real.oneLine) > 0.5 || !one.fits) {
          boneBad.push(
            `${direction}@${where}: placeholder ${one.h.toFixed(1)}px against the one-line row's ${real.oneLine.toFixed(1)}px${one.fits ? "" : ", a bar empty or outside its row"}`
          );
        }
      }
    }
  }
  kit.check(
    `${engine}: every direction's suggestions stand on the composer's own edges at each where, start and end (the drafts' stack, right-aligned, on its end): ${edgeSaid.join("; ")}`,
    edgeBad.length === 0,
    edgeBad.join(" | ")
  );
  kit.check(
    `${engine}: every placeholder stands at the size of the row it holds the place of, a one-line suggestion (its reason line where the reason shows), every bar drawn inside it (${bones} placeholders)`,
    boneBad.length === 0 && bones > 0,
    [...new Set(boneBad)].slice(0, 6).join(" | ")
  );
  kit.check(
    `${engine}: every set of placeholders stands at the height of the set it stands for, its rows cut to one line (the drafts' reason lines and footer, the tray's chip row with the keyboard up), loading/loaded px: ${setSaid.join("; ")}`,
    setBad.length === 0 && setSaid.length > 0,
    setBad.join(" | ")
  );
}

/**
 * Caw at night (cockpit-57cd5e7c: "Caw almost disappears at night"): his
 * hero still read in the pixels. His drawing is found by drawing him over a
 * ground he can't match (the pixels that stay the same over both grounds
 * are his own, opaque); then, on the real ground, the share of his outline
 * whose strongest ink within 2px (his edge or the rim drawn round it)
 * stands at 3:1 or more against it, the floor for a graphic a person must
 * make out. Read by night with his night
 * still (on the paper rim), and with his day still on the same night
 * ground, as he stood before it: the night still must hold his edge clear
 * over most of it and far past the day still's there.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one pixel read, its mask, ground and outline inside it
async function cawEdge(
  page: Page,
  src: string | null
): Promise<{ share: number; edge: number }> {
  const clip = await page.evaluate((swap) => {
    const img = [
      ...document.querySelectorAll<HTMLImageElement>(
        '[data-slot="stage"] [data-slot="hero"] img'
      ),
    ].find((el) => el.getClientRects().length > 0);
    if (img && swap) {
      img.dataset.was = img.getAttribute("src") ?? "";
      img.src = swap;
    }
    const r = img?.getBoundingClientRect();
    return r
      ? {
          x: Math.round(r.left),
          y: Math.round(r.top),
          width: Math.round(r.width),
          height: Math.round(r.height),
        }
      : null;
  }, src);
  if (!clip) {
    return { share: 0, edge: 0 };
  }
  await page.evaluate(async () => {
    await Promise.all(
      [
        ...document.querySelectorAll<HTMLImageElement>(
          '[data-slot="stage"] [data-slot="hero"] img'
        ),
      ].map((img) => img.decode().catch(() => undefined))
    );
  });
  const paint = (fill: string) =>
    page.evaluate((f) => {
      for (const el of document.querySelectorAll<HTMLElement>(
        '[data-slot="stage"] [data-slot="hero"] img'
      )) {
        el.style.background = f;
      }
    }, fill);
  const shot = await capture(page, clip);
  await paint("rgb(0, 255, 0)");
  const over = await capture(page, clip);
  await paint("");
  await page.evaluate(() => {
    for (const img of document.querySelectorAll<HTMLImageElement>(
      '[data-slot="stage"] [data-slot="hero"] img[data-was]'
    )) {
      img.src = img.dataset.was ?? "";
      delete img.dataset.was;
    }
  });
  const w = shot.width;
  const h = shot.height;
  const him = new Uint8Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      him[y * w + x] = off(px(over, x, y), px(shot, x, y)) <= 12 ? 1 : 0;
    }
  }
  const counts = new Map<string, { rgb: Rgb; n: number }>();
  for (let i = 0; i < w * h; i += 1) {
    if (him[i]) {
      continue;
    }
    const rgb = px(shot, i % w, Math.floor(i / w));
    const one = counts.get(rgb.join(",")) ?? { rgb, n: 0 };
    one.n += 1;
    counts.set(rgb.join(","), one);
  }
  const ground = [...counts.values()].reduce((p, q) => (q.n > p.n ? q : p)).rgb;
  // Each point of his outline (a drawn pixel beside one that isn't) is
  // clear where the strongest ink within 2px of it, his edge or the rim
  // drawn round it, stands at 3:1 against the ground.
  const ring = Math.round(2 * shot.scale);
  const outline = (x: number, y: number) =>
    him[y * w + x] === 1 &&
    [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].some(([ox = 0, oy = 0]) => {
      const nx = x + ox;
      const ny = y + oy;
      return nx < 0 || ny < 0 || nx >= w || ny >= h || !him[ny * w + nx];
    });
  const strongest = (x: number, y: number) => {
    let most = 1;
    for (let oy = -ring; oy <= ring; oy += 1) {
      for (let ox = -ring; ox <= ring; ox += 1) {
        most = Math.max(most, contrast(px(shot, x + ox, y + oy), ground));
      }
    }
    return most;
  };
  let edge = 0;
  let clear = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (outline(x, y)) {
        edge += 1;
        clear += strongest(x, y) >= 3 ? 1 : 0;
      }
    }
  }
  return { share: edge > 0 ? clear / edge : 0, edge };
}

async function cawLeg(kit: Kit, page: Page, base: string, engine: string) {
  const at = (theme: string) =>
    go(
      page,
      base,
      `?__state=direction:today,where:thread,data:three,theme:${theme}`
    );
  await at("light");
  const day = await cawEdge(page, null);
  await at("dark");
  const night = await cawEdge(page, null);
  const before = await cawEdge(page, "caw/caw-ready-day.png");
  const pc = (n: number) => `${(n * 100).toFixed(0)}%`;
  kit.check(
    `${engine}: Caw stands clear of the night's ground: ${pc(night.share)} of his edge at 3:1 or more by night (his day still on that ground, as before the rim: ${pc(before.share)}; by day: ${pc(day.share)})`,
    night.edge > 0 && night.share >= 0.75 && night.share >= before.share + 0.25
  );
}

/** Leg 4: a press's runs held on the clock and sought through: one clock per moment, his words in the box after it. */
async function pressLeg(
  kit: Kit,
  page: Page,
  base: string,
  engine: string,
  [direction, name, token]: [string, string, string]
) {
  await go(
    page,
    base,
    `?__state=direction:${direction},where:thread,data:three,theme:light`
  );
  const item = page
    .locator('[data-slot="stage"] button[data-slot="suggestion"]')
    .first();
  const words = (
    (await item.locator('[data-slot="suggestion-text"]').textContent()) ?? ""
  ).trim();
  const held = await readMotion(
    page,
    () => item.click(),
    '[data-slot="stage"]',
    {
      fractions: [0, 0.5, 1],
    }
  );
  const wants = await page.evaluate(
    (t) => ({
      duration: getComputedStyle(document.documentElement)
        .getPropertyValue(t)
        .trim(),
      easing: getComputedStyle(document.documentElement)
        .getPropertyValue("--ease-out")
        .trim(),
    }),
    token
  );
  const ms = wants.duration.endsWith("ms")
    ? Number.parseFloat(wants.duration)
    : Number.parseFloat(wants.duration) * 1000;
  // The press's own runs (its Web Animations), in the moments they start together.
  const runs = held.runs.filter((run) => run.type === "WebAnimation");
  const moments = new Map<string, typeof runs>();
  for (const run of runs) {
    const at = run.start === null ? "held" : String(Math.round(run.start));
    moments.set(at, [...(moments.get(at) ?? []), run]);
  }
  const bad: string[] = [];
  for (const [at, group] of moments) {
    const lengths = new Set(
      group.map((run) => Math.round(run.end - run.delay))
    );
    const curves = new Set(group.map((run) => run.easing.replaceAll(" ", "")));
    if (
      group.length < 2 ||
      lengths.size !== 1 ||
      curves.size !== 1 ||
      !lengths.has(Math.round(ms)) ||
      !group.every((run) => run.ended)
    ) {
      bad.push(
        `at ${at}: ${group.length} runs, ${[...lengths].join("/")}ms, ${[...curves].join(" | ")}, ended ${group.map((run) => run.ended).join(",")}`
      );
    }
  }
  kit.check(
    `${engine} ${direction}: ${name} runs on one clock, ${moments.size} moment(s), ${runs.length} runs, each ${ms}ms on the house ease-out (${token}), held and sought on the ${held.by === "clock" ? "DevTools Animation domain" : "page's held clock"}`,
    runs.length >= 2 && bad.length === 0,
    `${bad.join(" | ")} ${JSON.stringify(runs.map((r) => [r.target, r.start, r.end, r.easing]))} want ${wants.easing}`
  );
  await settle(page);
  const after = await page.evaluate(() => {
    const field = document.querySelector<HTMLTextAreaElement>(
      '[data-slot="stage"] [data-slot="composer-field"]'
    );
    return {
      value: field?.value ?? "",
      caret: field ? field.selectionStart === field.value.length : false,
      said:
        document
          .querySelector('[data-slot="stage"] [aria-live="polite"]')
          ?.textContent?.trim() ?? "",
    };
  });
  kit.check(
    `${engine} ${direction}: after the press his words are in the box, the caret after them, and the live region says "${after.said}"`,
    after.value === words &&
      after.caret &&
      after.said === "In the message box, ready to edit",
    JSON.stringify(after)
  );
}

const spec: Spec = {
  name: "suggestions-preview",
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every engine and every state the switcher offers, each leg in turn
  async run(kit: Kit) {
    const server = serve();
    const base = `http://127.0.0.1:${server.port}/`;
    try {
      const engines = (
        process.env.SUGGESTIONS_ENGINES ?? "chromium,webkit"
      ).split(",") as Engine[];
      for (const engine of engines) {
        const errors: string[] = [];
        // biome-ignore lint/performance/noAwaitInLoops: one engine at a time
        const page = await kit.page("desk", { engine, scale: 1 });
        page.on("console", (message) => {
          if (message.type() === "error") {
            errors.push(message.text());
          }
        });
        page.on("pageerror", (error) => errors.push(String(error)));
        await page.goto(base);
        await page.waitForSelector('[data-slot="stage"]');
        await page.evaluate(() => document.fonts.ready);
        let states = 0;
        let spills = 0;
        const bad: string[] = [];
        const strangers = new Set<string>();
        const stillBad: string[] = [];
        /** The surroundings each direction draws at three, by where. */
        const around = new Map<string, Map<string, StateRead["around"]>>();
        const clipBad: string[] = [];
        const inkBad: string[] = [];
        const headingBad: string[] = [];
        let inkRead = 0;
        let footMost = 1;
        let clippedStates = 0;
        const lowText: string[] = [];
        let lowest = 99;
        /** Every tray state's composer field, by where: Today's field it must match. */
        const trayFields: { key: string; where: string; field: Box | null }[] =
          [];
        /** The tray's box with seven collapsed and expanded, by where. */
        const trayBox = new Map<string, Record<string, Box | null>>();
        for (const direction of await links(page, "direction")) {
          // biome-ignore lint/performance/noAwaitInLoops: one direction's states at a time, as the switcher offers them
          await go(page, base, direction.href);
          for (const where of await links(page, "where")) {
            // biome-ignore lint/performance/noAwaitInLoops: one place at a time
            await go(page, base, where.href);
            for (const data of await links(page, "data")) {
              for (const theme of ["light", "dark"]) {
                const key = `direction:${direction.value},where:${where.value},data:${data.value},theme:${theme}`;
                // biome-ignore lint/performance/noAwaitInLoops: one state on the page at a time
                await go(page, base, `?__state=${key}`);
                const read = await page.evaluate(readStage, HIS);
                states += 1;
                const want = expected(direction.value, where.value, data.value);
                const groupsOk =
                  read.groups.length === 4 &&
                  read.groups.every(
                    (g) => g.endsWith(":1") && !g.includes(":0:")
                  );
                if (
                  read.key !== key ||
                  read.width !== WIDTH[where.value] ||
                  read.dark !== (theme === "dark") ||
                  !groupsOk ||
                  read.items !== want.items ||
                  read.placeholders > 0 !== want.placeholders
                ) {
                  bad.push(
                    `${key}: drew ${read.items} (want ${want.items}), placeholders ${read.placeholders} (want ${want.placeholders}), width ${read.width}, dark ${read.dark}, key ${read.key}, groups ${read.groups.join(" ")}`
                  );
                }
                for (const one of read.strangers) {
                  strangers.add(one);
                }
                if (data.value === "three" && theme === "light") {
                  const at = around.get(where.value) ?? new Map();
                  at.set(direction.value, read.around);
                  around.set(where.value, at);
                }
                if (read.clipped) {
                  clippedStates += 1;
                }
                if (!read.headingShown) {
                  headingBad.push(key);
                }
                if (read.clipped && read.faded && theme === "light") {
                  const ink = await fadeInk(page);
                  inkRead += 1;
                  footMost = Math.max(footMost, ink.foot);
                  if (ink.foot > 1.3 || ink.body < 3) {
                    inkBad.push(
                      `${key}: ${ink.foot.toFixed(2)}:1 in the last 4px, ${ink.body.toFixed(2)}:1 above the fade`
                    );
                  }
                }
                if ((read.clipped && !read.faded) || !read.footInside) {
                  clipBad.push(
                    `${key}: clipped ${read.clipped}, faded ${read.faded}, composer inside ${read.footInside}`
                  );
                }
                lowest = Math.min(lowest, read.lowest);
                lowText.push(...read.low.map((one) => `${key} ${one}`));
                if (direction.value === "tray") {
                  trayFields.push({
                    key,
                    where: where.value,
                    field: read.around.field,
                  });
                }
                // With the keyboard up the tray is its chip row: no rows grow there.
                if (
                  direction.value === "tray" &&
                  theme === "light" &&
                  where.value !== "keyboard" &&
                  data.value.startsWith("seven-")
                ) {
                  trayBox.set(where.value, {
                    ...trayBox.get(where.value),
                    [data.value]: read.around.box,
                  });
                }
                const findings = await page.evaluate(scan);
                spills += findings.length;
                if (findings.length > 0) {
                  kit.note(
                    `${engine} ${key}: ${findings.slice(0, 3).join(" | ")}`
                  );
                }
                // A loading state holds still until the switcher moves.
                if (
                  data.value === "loading" &&
                  where.value === "thread" &&
                  theme === "light"
                ) {
                  await page.waitForTimeout(1500);
                  const later = await page.evaluate(readStage, HIS);
                  if (
                    later.items !== 0 ||
                    later.placeholders !== read.placeholders
                  ) {
                    stillBad.push(
                      `${key}: ${later.items} items, ${later.placeholders} placeholders after 1.5s`
                    );
                  }
                }
              }
            }
          }
        }
        kit.check(
          `${engine}: every direction × where × data × theme renders the owner's starters at its width, each switcher group a set of links with one chosen (${states} states)`,
          bad.length === 0 && states > 0,
          bad.slice(0, 4).join(" | ")
        );
        // The surroundings, alike in every direction at each where: Caw, the
        // heading and the composer's box. The tray's box holds its tray (the
        // report's own change) over its field: its foot and sides are the
        // others' at every where, the board included.
        const aroundBad: string[] = [];
        const same = (a: Box | null, b: Box | null) =>
          Boolean(
            a && b && a.l === b.l && a.t === b.t && a.r === b.r && a.b === b.b
          );
        for (const [where, by] of around) {
          const entries = [...by.entries()];
          const [firstName, first] = entries[0] ?? [];
          for (const [name, one] of entries) {
            if (!(
              same(one.caw, first?.caw ?? null) &&
              same(one.heading, first?.heading ?? null) &&
              one.words === first?.words
            )) {
              aroundBad.push(
                `${where} ${name}: Caw or heading differs from ${firstName}`
              );
            }
          }
          const boxes = entries.filter(([name]) => name !== "tray");
          for (const [name, one] of boxes) {
            if (!same(one.box, boxes[0]?.[1].box ?? null)) {
              aroundBad.push(
                `${where} ${name}: composer box ${JSON.stringify(one.box)} against ${JSON.stringify(boxes[0]?.[1].box)}`
              );
            }
          }
          const tray = by.get("tray")?.box;
          const other = boxes[0]?.[1].box;
          if (
            tray &&
            other &&
            (tray.b !== other.b || tray.l !== other.l || tray.r !== other.r)
          ) {
            aroundBad.push(
              `${where} tray: box ${JSON.stringify(tray)} against ${JSON.stringify(other)}`
            );
          }
        }
        kit.check(
          `${engine}: the surroundings (Caw, the heading, the composer's box) are alike across the directions at each where (${[...around.entries()].map(([w, by]) => `${w}: ${[...by.keys()].join(", ")}`).join("; ")})`,
          aroundBad.length === 0 && around.size === 4,
          aroundBad.slice(0, 4).join(" | ")
        );
        // Finding 1: the tray in Today's surroundings. Its field, where the
        // person writes, stands where Today's stands at every where and in
        // every tray state, its foot and sides fixed whatever the tray holds
        // (the keyboard, which Today hasn't, against the drafts').
        const fieldBad: string[] = [];
        for (const one of trayFields) {
          const ref = (
            around.get(one.where)?.get("today") ??
            around.get(one.where)?.get("drafts")
          )?.field;
          if (!(
            one.field &&
            ref &&
            one.field.b === ref.b &&
            one.field.l === ref.l &&
            one.field.r === ref.r
          )) {
            fieldBad.push(
              `${one.key}: field ${JSON.stringify(one.field)} against ${JSON.stringify(ref)}`
            );
          }
        }
        kit.check(
          `${engine}: the tray stands in Today's surroundings: in all ${trayFields.length} tray states its composer field keeps Today's foot and sides at each where (${[...around.entries()].map(([w, by]) => `${w} ${JSON.stringify((by.get("today") ?? by.get("drafts"))?.field)}`).join("; ")})`,
          fieldBad.length === 0 && trayFields.length > 0,
          fieldBad.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: wherever a set (or the tray's rows) runs past its room it scrolls under the house 40px edge fade (kit-edge-fade-block, its foot's --fade-end at 40px as it stands, so more below shows before any scroll), and the composer stands whole in every state (${clippedStates} states scroll)`,
          clipBad.length === 0,
          clipBad.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: the heading stands whole in every state, never pushed out by a growing set or tray`,
          headingBad.length === 0,
          headingBad.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: the fade draws across every cut, read in the pixels: words at full ink above it, at most ${footMost.toFixed(2)}:1 against the ground in its last 4px (${inkRead} states)`,
          inkBad.length === 0 && inkRead > 0,
          inkBad.slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: every reason, heading and meta line holds 4.5:1 on its ground, light and dark (lowest ${lowest.toFixed(2)}:1)`,
          lowText.length === 0,
          lowText.slice(0, 4).join(" | ")
        );
        const growth = [...trayBox.entries()].map(([where, two]) => {
          const shut = two["seven-collapsed"];
          const open = two["seven-expanded"];
          return {
            where,
            ok: Boolean(
              shut && open && Math.abs(shut.b - open.b) <= 1 && open.t < shut.t
            ),
            said: `${where} ${shut?.t}→${open?.t} top, ${shut?.b}→${open?.b} foot`,
          };
        });
        kit.check(
          `${engine}: the tray's seven grow upward from the composer, its foot staying (${growth.map((g) => g.said).join("; ")})`,
          growth.length > 0 && growth.every((g) => g.ok),
          growth
            .filter((g) => !g.ok)
            .map((g) => g.said)
            .join(" | ")
        );
        kit.check(
          `${engine}: every sentence and reason drawn is one the hub wrote for him (none made up)`,
          strangers.size === 0,
          [...strangers].slice(0, 4).join(" | ")
        );
        kit.check(
          `${engine}: a loading state holds still until the switcher moves`,
          stillBad.length === 0,
          stillBad.join(" | ")
        );
        kit.check(
          `${engine}: the overflow sweep over all ${states} states totals ${spills}`,
          spills === 0
        );
        if (engine === "chromium") {
          for (const key of SHOTS) {
            // biome-ignore lint/performance/noAwaitInLoops: one state on the page at a time
            await go(page, base, `?__state=${key}`);
            const name = key.replaceAll(/[a-z]+:/g, "").replaceAll(",", "-");
            await page.locator('[data-slot="stage"] .frame').screenshot({
              path: join(kit.out, `${name}.png`),
              animations: "allow",
              caret: "hide",
            });
          }
          kit.note(`captures: ${SHOTS.length} PNGs in ${kit.out}`);
        }
        await looksLeg(kit, page, base, engine);
        await cawLeg(kit, page, base, engine);
        for (const press of PRESSES) {
          // biome-ignore lint/performance/noAwaitInLoops: one press at a time under one mouse
          await pressLeg(kit, page, base, engine, press);
        }
        kit.check(
          `${engine}: no console or page error`,
          errors.length === 0,
          errors.slice(0, 4).join(" | ")
        );
        await page.close();
      }
    } finally {
      server.stop(true);
    }
  },
};

export default spec;
