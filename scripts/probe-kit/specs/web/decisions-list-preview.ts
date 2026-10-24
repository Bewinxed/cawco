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
 * - the badge on the Decisions tab is the Needs you group's count, absent at 0;
 * - every state's switch shows it; Night turns the ground dark and draws
 *   every Caw as his night still;
 * - the owner's journeys (reviews of 5f6b517bd and report 068af135): every
 *   row opens its page whole, the ways forward from a closed page and a
 *   removed picture open, Make tasks is offered only on read or ended and
 *   has its outcome on row and page, Send stays the page's own and a press
 *   lands on it, a phone's long press holds Not now, a long wait greys its
 *   ring and still counts, each figure is its group's date in the house
 *   formatter and order, Closed names its closer, search finds every card
 *   line for any query, fact separators keep their room, and first use
 *   stands Caw on his block's axis;
 * - each motion, on a held clock sought to 0, ½ and 1, moves its value
 *   continuously (½ strictly between the ends) and lands where 1 stood;
 * - no console error and no page error.
 *
 *   bun scripts/probe-kit/run.ts web decisions-list-preview
 */
import { realpathSync } from "node:fs";
import { join, normalize } from "node:path";
import type { Page } from "playwright-core";
import { decisionsWords } from "../../../../packages/core/src/words/decisions";
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

/* ---------------------------------------------- the owner's journeys */

const D = '#stage [data-frame="desk"]';
const P = '#stage [data-frame="phone"]';

/** What the desk and phone panes show now: the open page, its cards, its head's figure. */
const opened = (page: Page) =>
  page.evaluate(() =>
    ["desk", "phone"].map((kind) => {
      const frame = document.querySelector(`#stage [data-frame="${kind}"]`);
      const dpage = frame?.querySelector<HTMLElement>("[data-dpage]");
      const meta = dpage?.querySelector("[data-meta]")?.textContent ?? "";
      // biome-ignore lint/performance/useTopLevelRegex: serialized into the page
      const of = /(\d+) of (\d+)/.exec(meta);
      return {
        name: dpage?.dataset.dpage ?? null,
        title: dpage?.querySelector("[data-dtitle]")?.textContent ?? "",
        cards: dpage?.querySelectorAll("[data-card]").length ?? 0,
        claimed: of ? Number(of[2]) : null,
        gone: dpage?.querySelectorAll("[data-gone]").length ?? 0,
        canvas:
          frame?.querySelector<HTMLElement>("[data-canvas]")?.dataset.canvas ??
          null,
      };
    })
  );

/** Clicks a desk row's title, first opening the fold it stands in. */
async function openRow(page: Page, name: string): Promise<string> {
  const row = page.locator(`${D} [data-row][data-page="${name}"]`);
  const folded = await row.evaluate((el) => Boolean(el.closest("[inert]")));
  if (folded) {
    const group = await row.evaluate(
      (el) => el.closest<HTMLElement>("[data-group]")?.dataset.group ?? ""
    );
    await page
      .locator(
        `${D} [data-group="${group}"] [data-more], ${D} [data-group="${group}"] [data-fold-toggle]`
      )
      .first()
      .click();
    await stillWithin(page, "body", { ms: 3000 });
  }
  const title = (await row.locator("[data-title]").getAttribute("title")) ?? "";
  await row.locator("[data-title]").click();
  await stillWithin(page, "body", { ms: 3000 });
  return title;
}

const back = async (page: Page) => {
  await page.locator(`${D} [data-back]`).click();
  await stillWithin(page, "body", { ms: 3000 });
};

/** Every row opens its page, whole: the head's figure counts the cards it draws. */
async function everyRowOpens(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "closed");
  const names = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(`${sel} [data-row]`)].map(
        (r) => r.dataset.page ?? ""
      ),
    D
  );
  const failed: string[] = [];
  for (const name of names) {
    // biome-ignore lint/performance/noAwaitInLoops: one row at a time, opened and read in turn
    const title = await openRow(page, name);
    const both = await opened(page);
    const right = both.every(
      (o) =>
        o.name === name &&
        o.title === title &&
        o.cards > 0 &&
        (o.claimed === null || o.claimed === o.cards)
    );
    if (!right) {
      failed.push(`${name}: ${JSON.stringify(both)}`);
    }
    await back(page);
  }
  kit.check(
    `${tag}: every one of the ${names.length} rows opens its page on both frames, its head's figure out of the cards it draws`,
    names.length === PAGES && failed.length === 0,
    failed.slice(0, 3).join(" | ")
  );
}

/** The replaced page's way forward, the successor chip on its row, and the removed picture's canvas chip. */
async function waysForward(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "replaced");
  await page.locator(`${D} [data-successor]`).click();
  await stillWithin(page, "body", { ms: 3000 });
  const viaButton = (await opened(page))[0].name;
  await press(page, "State", "closed");
  await page
    .locator(`${D} [data-row][data-page="address-setup"] [data-chip]`)
    .click();
  await stillWithin(page, "body", { ms: 3000 });
  const viaChip = (await opened(page))[0].name;
  kit.check(
    `${tag}: "Open the new page" and the Replaced-by chip both open the successor`,
    viaButton === "address-cawco" && viaChip === "address-cawco",
    JSON.stringify({ viaButton, viaChip })
  );
  await press(page, "State", "removed");
  const glyphs = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll<HTMLElement>(`${sel} [data-chip]`)].map(
        (c) => `${c.dataset.kind}:${c.querySelector("svg")?.dataset.glyph}`
      ),
    D
  );
  await page.locator(`${D} [data-chip][data-kind="canvas"]`).first().click();
  await stillWithin(page, "body", { ms: 3000 });
  const [{ canvas }] = await opened(page);
  kit.check(
    `${tag}: a removed picture's successor chip wears the canvas glyph and opens the canvas`,
    glyphs.length > 0 &&
      glyphs.every((g) => g === "canvas:canvas") &&
      canvas !== null,
    JSON.stringify({ glyphs, canvas })
  );
}

/** The removed-picture page: reached from its row, its group and ring kept, the news strong until opened. */
async function removedPictures(
  kit: Kit,
  page: Page,
  tag: string
): Promise<void> {
  await press(page, "State", "open2");
  const read = () =>
    page.evaluate((sel) => {
      const row = document.querySelector(
        `${sel} [data-row][data-page="caw-pairing-picks"]`
      );
      const fact = row?.querySelector<HTMLElement>("[data-gone-fact]");
      const strong = getComputedStyle(
        row?.querySelector(".fact .strong") ?? document.body
      ).color;
      const muted = getComputedStyle(
        row?.querySelector(".fact") ?? document.body
      ).color;
      return {
        group: row?.closest<HTMLElement>("[data-group]")?.dataset.group,
        ring: row?.querySelector(".ring")?.getAttribute("class"),
        leads: row?.querySelector(".fact .fp")?.contains(fact ?? null) ?? false,
        color: fact ? getComputedStyle(fact).color : "",
        strong,
        muted,
      };
    }, D);
  const before = await read();
  await openRow(page, "caw-pairing-picks");
  const [page1] = await opened(page);
  await back(page);
  const after = await read();
  kit.check(
    `${tag}: the page with removed pictures opens from its row, draws all its cards and both removed wells`,
    page1.name === "caw-pairing-picks" &&
      page1.cards === 6 &&
      page1.claimed === 6 &&
      page1.gone === 2,
    JSON.stringify(page1)
  );
  kit.check(
    `${tag}: its row keeps Sent and the sent ring, leads with the removal in ink-strong, ink-muted once opened`,
    before.group === "sent" &&
      (before.ring ?? "").includes("sent") &&
      before.leads &&
      before.color === before.strong &&
      after.color === after.muted &&
      after.color !== before.color,
    JSON.stringify({ before, after })
  );
}

/** Make tasks: offered only on read or its session ended; on the row and at the page's foot, each with its outcome. */
async function makeTasks(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "open2");
  const offered = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} [data-act="make-tasks"]`)].map(
        (b) =>
          b
            .closest("[data-row]")
            ?.querySelector<HTMLElement>("[data-heard-fact]")?.dataset.heardFact
      ),
    D
  );
  kit.check(
    `${tag}: Make tasks stands only on rows read or whose session ended, never on working on it or not read yet`,
    offered.length > 0 && offered.every((h) => h === "read" || h === "ended"),
    JSON.stringify(offered)
  );
  const name = await page.evaluate(
    (sel) =>
      document
        .querySelector(`${sel} [data-row][data-hover] [data-act="make-tasks"]`)
        ?.closest<HTMLElement>("[data-row]")?.dataset.page ?? "",
    D
  );
  await page
    .locator(`${D} [data-row][data-hover] [data-act="make-tasks"]`)
    .click();
  await stillWithin(page, "body", { ms: 3000 });
  const row = await page.evaluate(
    ([sel, n]) => {
      const r = document.querySelector(`${sel} [data-row][data-page="${n}"]`);
      return {
        group: r?.closest<HTMLElement>("[data-group]")?.dataset.group,
        making: Boolean(r?.querySelector("[data-tasks] .live-dot")),
      };
    },
    [D, name] as const
  );
  kit.check(
    `${tag}: Make tasks on a row moves it to Decided, making tasks`,
    row.group === "decided" && row.making,
    JSON.stringify({ name, row })
  );
  await press(page, "State", "open2");
  await openRow(page, "devtools-speed");
  const foot = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} [data-foot] button`)].map(
        (b) => (b as HTMLElement).dataset.pageAct
      ),
    D
  );
  await page.locator(`${D} [data-foot] [data-page-act="make-tasks"]`).click();
  await stillWithin(page, "body", { ms: 3000 });
  const done = await page.evaluate(
    (sel) => ({
      standing: document.querySelector<HTMLElement>(`${sel} [data-dpage]`)
        ?.dataset.standing,
      pending:
        document
          .querySelector(`${sel} [data-foot] [data-page-act="making"]`)
          ?.getAttribute("aria-disabled") === "true",
    }),
    D
  );
  await openRowFromList(page, "product-md-refresh");
  const unreadFoot = await page.locator(`${D} [data-foot]`).count();
  kit.check(
    `${tag}: a sent and read page's foot holds Make tasks as its one act; pressed, the page is decided and making; an unread page's foot has none`,
    foot.length === 1 &&
      foot[0] === "make-tasks" &&
      done.standing === "decided" &&
      done.pending &&
      unreadFoot === 0,
    JSON.stringify({ foot, done, unreadFoot })
  );
}

async function openRowFromList(page: Page, name: string): Promise<void> {
  await back(page);
  await openRow(page, name);
}

/** Send stays the page's own: an Open row lands on its first pending stop. */
async function landsOnSend(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "open2");
  await openRow(page, "owner-presence");
  const full = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      act: el?.dataset.pageAct ?? null,
      inFoot: Boolean(el?.closest("[data-foot]")),
      desk: Boolean(el?.closest('[data-frame="desk"]')),
    };
  });
  await page.locator(`${D} [data-page-act="send"]`).click();
  await stillWithin(page, "body", { ms: 3000 });
  const sent = await page.evaluate(
    (sel) =>
      document
        .querySelector(`${sel} [data-row][data-page="owner-presence"]`)
        ?.closest<HTMLElement>("[data-group]")?.dataset.group,
    D
  );
  await press(page, "State", "many");
  await openRow(page, "github-connect");
  const partial = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return {
      card: el?.dataset.card ?? null,
      pending: el?.hasAttribute("data-pending") ?? false,
    };
  });
  const rows = await page.evaluate(
    (sel) =>
      document.querySelectorAll(`${sel} [data-row] [data-page-act="send"]`)
        .length,
    D
  );
  kit.check(
    `${tag}: a fully picked page opens with its foot's Send focused; Send moves the row to Sent; a partly picked page opens at its first card not picked; no row carries Send`,
    full.act === "send" &&
      full.inFoot &&
      full.desk &&
      sent === "sent" &&
      partial.card === "0" &&
      partial.pending &&
      rows === 0,
    JSON.stringify({ full, sent, partial, rows })
  );
}

/** Not now on a phone: the row's long-press menu holds it, and it moves the row. */
async function longPress(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "open2");
  await page.evaluate((sel) => {
    const row = document.querySelector(
      `${sel} [data-row][data-page="owner-presence"] [data-title]`
    );
    row?.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true })
    );
  }, P);
  const menu = await page.evaluate(
    (sel) =>
      [...document.querySelectorAll(`${sel} [data-rowmenu] [data-act]`)].map(
        (b) => (b as HTMLElement).dataset.act
      ),
    P
  );
  await page.locator(`${P} [data-rowmenu] [data-act="not-now"]`).click();
  await stillWithin(page, "body", { ms: 3000 });
  const group = await page.evaluate(
    (sel) =>
      document
        .querySelector(`${sel} [data-row][data-page="owner-presence"]`)
        ?.closest<HTMLElement>("[data-group]")?.dataset.group,
    P
  );
  kit.check(
    `${tag}: a phone row's long press holds Not now, and it moves the row to Not now`,
    menu.length === 1 && menu[0] === "not-now" && group === "later",
    JSON.stringify({ menu, group })
  );
}

/** From 7 days the wait greys its ring, takes no word, says its wait in the tooltip, and still counts. */
async function longWait(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "open2");
  const r = await page.evaluate((sel) => {
    const row = document.querySelector<HTMLElement>(
      `${sel} [data-row][data-page="three-designs"]`
    );
    const ring = row?.querySelector(".ring");
    const fact = row?.querySelector(".fact");
    const age = row?.querySelector<HTMLElement>("[data-age]");
    return {
      waited: row?.hasAttribute("data-waited") ?? false,
      ring: ring ? getComputedStyle(ring).color : "",
      muted: fact ? getComputedStyle(fact).color : "",
      pieces: row?.querySelectorAll(".fact .fp").length ?? 0,
      tip: age?.title ?? "",
      spoken: age?.querySelector(".sr-only")?.textContent ?? "",
      badge: document.querySelector(`${sel} [data-badge]`)?.textContent ?? "",
      open: document.querySelector<HTMLElement>(`${sel} [data-group="open"]`)
        ?.dataset.count,
    };
  }, D);
  kit.check(
    `${tag}: a page waiting 9 days greys its ring to ink-muted, says only what is true, tells its wait on the figure, and the badge counts it`,
    r.waited &&
      r.ring === r.muted &&
      r.pieces === 2 &&
      r.tip.startsWith("Waiting since") &&
      r.spoken === r.tip &&
      r.badge === "2" &&
      r.open === "2",
    JSON.stringify(r)
  );
}

/** Each row's figure is the house formatter of the date that put it in its group, in the group's order. */
async function groupDates(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "closed");
  const r = await page.evaluate((sel) => {
    const now = new Date(2026, 9, 24, 21, 30).getTime();
    const house = (at: number) => {
      const s = Math.max(0, (now - at) / 1000);
      if (s < 60) {
        return "now";
      }
      if (s < 3600) {
        return `${Math.floor(s / 60)}m`;
      }
      if (s < 86_400) {
        return `${Math.floor(s / 3600)}h`;
      }
      if (s < 7 * 86_400) {
        return `${Math.floor(s / 86_400)}d`;
      }
      return new Date(at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });
    };
    const wrong: string[] = [];
    for (const g of document.querySelectorAll<HTMLElement>(
      `${sel} [data-group]`
    )) {
      const ats = [...g.querySelectorAll<HTMLElement>("[data-row]")].map(
        (row) => {
          const at = Number(row.dataset.at);
          const shown = row.querySelector(
            "[data-age] [aria-hidden]"
          )?.textContent;
          if (shown !== house(at)) {
            wrong.push(`${row.dataset.page}: ${shown} ≠ ${house(at)}`);
          }
          return at;
        }
      );
      const oldestFirst = g.dataset.group === "open";
      for (let i = 1; i < ats.length; i += 1) {
        if (oldestFirst ? ats[i] < ats[i - 1] : ats[i] > ats[i - 1]) {
          wrong.push(`${g.dataset.group} out of order at ${i}`);
        }
      }
    }
    return wrong;
  }, D);
  kit.check(
    `${tag}: every figure is the house formatter of its group's date, Needs you longest wait first and every other group newest first`,
    r.length === 0,
    r.slice(0, 4).join(" | ")
  );
}

/** Closed names who closed each page. */
async function closers(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "closed");
  const r = await page.evaluate(
    (sel) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          `${sel} [data-group="closed"] [data-row]`
        ),
      ].map((row) => {
        const actor = row.querySelector<HTMLElement>("[data-actor]");
        return `${actor?.dataset.actor}:${actor?.querySelector("svg")?.dataset.glyph ?? "-"}`;
      }),
    D
  );
  const kinds = new Set(r.map((x) => x.split(":")[0]));
  kit.check(
    `${tag}: every Closed row names who closed it: its successor, Caw, its session's chip, or you`,
    r.length === 5 &&
      ["successor", "caw", "session", "you"].every((k) => kinds.has(k)) &&
      r.includes("session:session") &&
      r.includes("successor:decisions"),
    JSON.stringify(r)
  );
}

/** Search over every question, option, pick and note, for any query. */
async function searchAnything(
  kit: Kit,
  page: Page,
  tag: string
): Promise<void> {
  const field = page.locator(`${D} [data-search] input`);
  for (const [q, must] of [
    ["pair", "pairing-behaviour"],
    ["Looks right", "pairing-behaviour"],
    ["swallow", "pairing-behaviour"],
    [decisionsWords.makeTasks, "commenting"],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one query at a time
    await press(page, "State", "open2");
    await field.fill(q);
    await stillWithin(page, "body", { ms: 3000 });
    const r = await page.evaluate(
      ([sel, query, want]) => {
        const lower = query.toLowerCase();
        const rows = [
          ...document.querySelectorAll<HTMLElement>(`${sel} [data-row]`),
        ];
        const bad = rows.filter((row) => {
          const title = (
            row.querySelector("[data-title]") as HTMLElement
          ).title.toLowerCase();
          const lines = [...row.querySelectorAll("[data-hit]")];
          const linesHold = lines.every((l) =>
            (l.textContent ?? "").toLowerCase().includes(lower)
          );
          return !((title.includes(lower) || lines.length > 0) && linesHold);
        });
        const wanted = rows.find((row) => row.dataset.page === want);
        return {
          rows: rows.length,
          bad: bad.map((b) => b.dataset.page),
          lines: wanted?.querySelectorAll("[data-hit]").length ?? 0,
        };
      },
      [D, q, must] as const
    );
    kit.check(
      `${tag}: search “${q}” finds rows by their cards, each with its matched card lines`,
      r.rows > 0 && r.bad.length === 0 && r.lines > 0,
      JSON.stringify(r)
    );
  }
}

/** Every fact separator keeps its room on both sides. */
async function separators(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "open2");
  const tight = await page.evaluate(() => {
    const out: string[] = [];
    for (const sep of document.querySelectorAll(
      "#stage [data-row] .fact > .sep"
    )) {
      const s = sep.getBoundingClientRect();
      const before = sep.previousElementSibling?.getBoundingClientRect();
      const after = sep.nextElementSibling?.getBoundingClientRect();
      const frame = sep.closest(".frame") as HTMLElement;
      const scale = frame.getBoundingClientRect().width / frame.offsetWidth;
      const left = before ? (s.left - before.right) / scale : 9;
      const right = after ? (after.left - s.right) / scale : 9;
      if (after && after.top > s.bottom) {
        continue;
      }
      if (left < 2 || right < 2) {
        out.push(
          `${sep.closest<HTMLElement>("[data-row]")?.dataset.page}: ${left.toFixed(1)} / ${right.toFixed(1)}`
        );
      }
    }
    return out;
  });
  kit.check(
    `${tag}: every fact separator keeps at least 2px of room on each side`,
    tight.length === 0,
    tight.slice(0, 4).join(" | ")
  );
}

/** First use: Caw on the axis of the block he heads. */
async function firstUseAxis(kit: Kit, page: Page, tag: string): Promise<void> {
  await press(page, "State", "first");
  const r = await page.evaluate(() =>
    ["desk", "phone"].map((kind) => {
      const block = document.querySelector(
        `#stage [data-frame="${kind}"] [data-empty="first"]`
      );
      const caw = [
        ...(block?.querySelectorAll<HTMLElement>("[data-caw] img") ?? []),
      ].find((img) => img.getBoundingClientRect().width > 0);
      const parts = [
        ...(block?.querySelectorAll(".etitle, .eline, .starters") ?? []),
      ].map((el) => el.getBoundingClientRect());
      const left = Math.min(...parts.map((p) => p.left));
      const right = Math.max(...parts.map((p) => p.right));
      const c = caw?.getBoundingClientRect();
      return c ? Math.abs(c.left + c.width / 2 - (left + right) / 2) : 99;
    })
  );
  const title = await page
    .locator(`${D} [data-empty="first"] .etitle`)
    .textContent();
  kit.check(
    `${tag}: first use stands Caw on the axis of the block he heads (desk and phone), and its title is no bare "nothing yet"`,
    r.every((d) => d < 1) && title !== decisionsWords.empty,
    JSON.stringify({ off: r, title })
  );
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
  const stills = async () => {
    await press(page, "State", "first");
    const shown = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>("#stage img.caw-still")]
        .filter((img) => img.getBoundingClientRect().width > 0)
        .map((img) => img.getAttribute("src") ?? "")
    );
    await press(page, "State", "open2");
    return shown;
  };
  const nightStills = await stills();
  await press(page, "Theme", "light");
  const dayStills = await stills();
  await press(page, "Theme", "dark");
  kit.check(
    `${tag} Night: every Caw drawn is his night still on the paper rim, and by day his day still`,
    nightStills.length >= 3 &&
      nightStills.every((src) => src.endsWith("-night.png")) &&
      dayStills.length === nightStills.length &&
      dayStills.every((src) => src.endsWith("-day.png")),
    JSON.stringify({ nightStills, dayStills })
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
  await everyRowOpens(kit, page, tag);
  await waysForward(kit, page, tag);
  await removedPictures(kit, page, tag);
  await makeTasks(kit, page, tag);
  await landsOnSend(kit, page, tag);
  if (view === "phone") {
    await longPress(kit, page, tag);
  }
  await longWait(kit, page, tag);
  await groupDates(kit, page, tag);
  await closers(kit, page, tag);
  await searchAnything(kit, page, tag);
  await separators(kit, page, tag);
  await firstUseAxis(kit, page, tag);
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
